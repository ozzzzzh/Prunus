import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown, Loader2, Sparkles, Square } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore } from '../../store/uiStore';
import type { PrunusNode } from '../../types';
import { searchNodes, type SearchField } from '../../utils/nodeSearch';
import { searchWithJev, isJevAvailable, type JevHit } from '../../utils/jevClient';
import { htmlToPlainText } from '../../utils/richtext';

interface NodeSearchBarProps {
  onClose: () => void;
  /** 点击结果时让画布居中到该节点（需要 React Flow 的 setCenter，所以由父组件提供） */
  onLocate: (nodeId: string) => void;
}

/** 统一的展示形状，本地命中与 Jev 命中共用 */
interface SearchResult {
  nodeId: string;
  snippet?: string;
  matchStart?: number;
  field?: SearchField;
  probability?: number;
}

interface JevState {
  done: number;
  total: number;
  failed: number;
}

const FIELD_LABEL: Record<SearchField, string> = {
  content: '',
  title: '标题',
  attachment: '附件名',
};

export default function NodeSearchBar({ onClose, onLocate }: NodeSearchBarProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const setSearchActiveNode = useUIStore((s) => s.setSearchActiveNode);

  const nodes: Record<string, PrunusNode> = useMemo(() => {
    const session = activeSessionId ? sessions[activeSessionId] : null;
    return session?.nodes ?? {};
  }, [activeSessionId, sessions]);

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'local' | 'jev'>('local');
  const [jevResults, setJevResults] = useState<SearchResult[]>([]);
  const [jevState, setJevState] = useState<JevState | null>(null);
  const [jevError, setJevError] = useState('');
  const [current, setCurrent] = useState(0);

  // 在途请求的控制句柄。runId 用于丢弃过期回调 —— 渐进式刷新下，
  // 上一轮的进度回调可能在用户已经改了检索词之后才到达。
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const cancelJev = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current++; // 让所有在途回调失效
  }, []);

  // 卸载时取消在途请求（纯清理，不改 state，符合 lint 规则）
  useEffect(() => () => abortRef.current?.abort(), []);

  const localResults: SearchResult[] = useMemo(
    () => searchNodes(nodes, query).map((h) => ({
      nodeId: h.nodeId,
      snippet: h.snippet,
      matchStart: h.matchStart,
      field: h.field,
    })),
    [nodes, query]
  );

  const results = mode === 'jev' ? jevResults : localResults;
  const isSearching = jevState !== null;

  /**
   * 标记"当前正在预览的那一个"节点。
   *
   * 刻意在事件处理器里写、而不是用 effect 监听 results ——
   * 效果一样，但不会触发 react-hooks/set-state-in-effect，行为也更好推理。
   */
  const applyActive = (nodeId: string | null) => {
    setSearchActiveNode(nodeId);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    // 检索词一变，上一轮语义检索就作废了
    cancelJev();
    setMode('local');
    setJevState(null);
    setJevError('');
    setJevResults([]);
    setCurrent(0);
    // 只标记第一个（也就是此刻预览的那个），不是标记全部命中 ——
    // 整组都亮会让用户分不清现在看的是哪一个
    applyActive(searchNodes(nodes, value)[0]?.nodeId ?? null);
  };

  const handleRunJev = async () => {
    if (!query.trim() || isSearching) return;

    cancelJev();
    const runId = ++runIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setMode('jev');
    setJevError('');
    setJevResults([]);
    setJevState({ done: 0, total: 0, failed: 0 });

    try {
      const hits: JevHit[] = await searchWithJev(query, Object.values(nodes), {
        signal: controller.signal,
        onProgress: ({ done, total, failed, top }) => {
          // 过期回调直接丢弃，否则会用旧一轮的结果覆盖新结果
          if (runId !== runIdRef.current) return;
          setJevState({ done, total, failed });
          setJevResults(top.map((h) => ({ nodeId: h.nodeId, probability: h.probability })));
          // 渐进式刷新期间保持预览第 1 个（列表随时在变，跟着跳会很乱）
          setCurrent(0);
          applyActive(top[0]?.nodeId ?? null);
        },
      });

      if (runId !== runIdRef.current) return;
      setJevResults(hits.map((h) => ({ nodeId: h.nodeId, probability: h.probability })));
      setCurrent(0);
      applyActive(hits[0]?.nodeId ?? null);
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setJevError((err as Error).message || '语义检索失败');
      setJevResults([]);
      applyActive(null);
    } finally {
      if (runId === runIdRef.current) setJevState(null);
    }
  };

  const handleStopJev = () => {
    cancelJev();
    setJevState(null);
  };

  const handleClose = () => {
    cancelJev();
    applyActive(null);
    onClose();
  };

  const handleSelect = (index: number) => {
    const target = results[index];
    if (!target) return;
    setCurrent(index);
    // 只让这一个亮起来，别的命中不高亮 —— 否则在大视图下分不清在看哪个
    applyActive(target.nodeId);
    onLocate(target.nodeId);
  };

  const step = (delta: number) => {
    if (results.length === 0) return;
    // 循环切换，到末尾回到开头
    const next = (current + delta + results.length) % results.length;
    handleSelect(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  };

  const active = results[current];
  const activeNode = active ? nodes[active.nodeId] : undefined;

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-xl px-4"
      data-tour="node-search"
    >
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.15)] border border-gray-200 overflow-hidden">
        {/* 输入行 */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索节点内容…"
            className="flex-1 bg-transparent outline-none py-1.5 text-sm text-gray-900 placeholder:text-gray-400"
          />

          {results.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs text-gray-500 tabular-nums">
                第 {current + 1} / {results.length} 个
              </span>
              <button
                onClick={() => step(-1)}
                title="上一个（Shift+Enter）"
                className="p-1 text-gray-400 hover:text-leaf-600 hover:bg-leaf-50 rounded transition-colors"
              >
                <ChevronUp size={15} />
              </button>
              <button
                onClick={() => step(1)}
                title="下一个（Enter）"
                className="p-1 text-gray-400 hover:text-leaf-600 hover:bg-leaf-50 rounded transition-colors"
              >
                <ChevronDown size={15} />
              </button>
            </div>
          )}

          <button
            onClick={handleClose}
            title="关闭（Esc）"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* 结果 / 进度 / 空状态 */}
        {isSearching ? (
          <div className="px-3 py-3 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Loader2 size={13} className="animate-spin text-leaf-600 flex-shrink-0" />
              <span>语义检索中…</span>
              {jevState && jevState.total > 0 && (
                <span className="tabular-nums">
                  已检索 {jevState.done} / {jevState.total}
                </span>
              )}
              <button
                onClick={handleStopJev}
                className="ml-auto flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
              >
                <Square size={10} />
                停下
              </button>
            </div>
            {jevState && jevState.failed > 0 && (
              <div className="mt-1.5 text-[11px] text-amber-700">
                {jevState.failed} 个节点未检索成功
              </div>
            )}
          </div>
        ) : active ? (
          <div className="border-t border-gray-100 px-3 py-2.5">
            {active.field && active.field !== 'content' && (
              <span className="inline-block mb-1 text-[10px] text-leaf-700 bg-leaf-50 px-1.5 py-0.5 rounded">
                命中在{FIELD_LABEL[active.field]}
              </span>
            )}
            {typeof active.probability === 'number' && (
              <span className="inline-block mb-1 text-[10px] text-leaf-700 bg-leaf-50 px-1.5 py-0.5 rounded">
                相关度 {(active.probability * 100).toFixed(1)}%
              </span>
            )}

            {active.snippet ? (
              <Snippet
                snippet={active.snippet}
                matchStart={active.matchStart ?? 0}
                queryLength={query.trim().length}
              />
            ) : (
              <div className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                {activeNode ? summarize(activeNode) : '（节点已不存在）'}
              </div>
            )}

            <div className="mt-1.5 text-[10px] text-gray-400 truncate">
              {activeNode ? summarize(activeNode) : '（节点已不存在）'}
            </div>
          </div>
        ) : query.trim() ? (
          <div className="border-t border-gray-100 px-3 py-3">
            {jevError ? (
              <div className="text-xs text-red-600">{jevError}</div>
            ) : (
              <>
                <div className="text-xs text-gray-600 mb-2.5">
                  没有找到包含「{query.trim()}」的节点。
                </div>
                {/* 语义检索只在本地零命中时出现，且必须由用户主动点击才触发 ——
                    这个入口视觉上更突出，引导用户去用 */}
                {isJevAvailable() ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClose}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => void handleRunJev()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-leaf-600 hover:bg-leaf-700 rounded-lg transition-colors"
                    >
                      <Sparkles size={12} />
                      用语义检索再找一次
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400">
                    语义检索需要配置社区后端，当前不可用。
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 命中片段：把命中词标出来 */
function Snippet({
  snippet,
  matchStart,
  queryLength,
}: {
  snippet: string;
  matchStart: number;
  queryLength: number;
}) {
  const end = matchStart + queryLength;
  return (
    <div className="text-xs text-gray-700 leading-relaxed break-words">
      {snippet.slice(0, matchStart)}
      <mark className="bg-amber-200 text-gray-900 rounded px-0.5">
        {snippet.slice(matchStart, end)}
      </mark>
      {snippet.slice(end)}
    </div>
  );
}

/** 节点摘要：剥掉 HTML 与 markdown 符号，截到一行 */
function summarize(node: PrunusNode): string {
  return htmlToPlainText(node.content)
    .replace(/[#*`_>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
