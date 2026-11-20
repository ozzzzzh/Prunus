/**
 * Prunus Prompt 左侧面板
 *
 * 两个视图，同一份数据：
 * - **清单**（实时）：只展示"已纳入成稿"的内容，按事实 / 已纳入 / 知识笔记 /
 *   待具体化分组；每勾选、编辑、删除一次就重算，纯本地、零延迟。
 * - **成稿**：点「生成成稿」后，由 LLM 按 PRD 的章节纪律把清单组织成一份
 *   结构化 Prompt；清单变化后标记为"已过期"。
 *
 * 成稿不只属于代码：网页、图片、视频都共用同一套槽位，由 LLM 决定详略。
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useSessionStore } from '../../../store/sessionStore';
import { useDialogStore } from '../../../store/dialogStore';
import { PROMPT_NODE_KEY, PROMPT_ROOT_KEY } from '../../../types/microApp';
import { buildPromptOutline, outlineToMarkdown } from '../../../utils/promptOutline';
import { expandPromptNode } from '../../../utils/promptExpand';
import { synthesizePrompt } from '../../../utils/promptSynthesis';
import { createPromptSession } from '../../../utils/promptSession';
import { cn } from '../../../utils/cn';
import MarkdownText from '../../markdown/MarkdownText';
import type { MicroAppPanelProps } from '../registry';

type PanelView = 'list' | 'artifact';

export default function PromptPanel({ sessionId }: MicroAppPanelProps) {
  const session = useSessionStore((state) => state.sessions[sessionId]);
  const nodes = session?.nodes;
  const rootNodeId = session?.rootNodeId ?? null;
  const promptState = session?.microApps?.prompt;

  const updateNodeContent = useSessionStore((state) => state.updateNodeContent);
  const renameSession = useSessionStore((state) => state.renameSession);
  const setSessionMicroApp = useSessionStore((state) => state.setSessionMicroApp);

  const [draft, setDraft] = useState('');
  const [starting, setStarting] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<PanelView>('list');

  const outline = useMemo(
    () => buildPromptOutline(nodes ?? {}, rootNodeId),
    [nodes, rootNodeId]
  );
  const markdown = useMemo(() => outlineToMarkdown(outline), [outline]);
  const started = outline.title.trim().length > 0;

  const artifact = promptState?.artifact ?? '';
  const stale = Boolean(artifact) && promptState?.artifactFingerprint !== outline.fingerprint;
  const showArtifact = view === 'artifact' && Boolean(artifact);

  const handleStart = async () => {
    const goal = draft.trim();
    if (!goal || !rootNodeId || starting) return;

    setStarting(true);
    setDraft('');

    // 根节点就是议题。顺带把它标成 Prompt 根，画布才知道该用哪套节点外观。
    updateNodeContent(rootNodeId, goal, undefined, {
      [PROMPT_ROOT_KEY]: true,
      [PROMPT_NODE_KEY]: { expanded: false },
    });
    renameSession(sessionId, goal.slice(0, 24));

    const result = await expandPromptNode(sessionId, rootNodeId);
    setStarting(false);

    if (result === 'error') {
      useDialogStore.getState().showToast('发散失败，请检查模型配置后重试', { type: 'error' });
    } else if (result === 'done') {
      useDialogStore.getState().showToast('这个议题已经足够具体了，可以直接生成成稿', {
        type: 'info',
      });
    }
  };

  const handleSynthesize = async () => {
    if (synthesizing || !promptState) return;
    if (outline.includedCount === 0) {
      useDialogStore.getState().showToast('先勾选至少一项，再生成成稿', { type: 'info' });
      return;
    }

    setSynthesizing(true);
    try {
      const result = await synthesizePrompt(sessionId);
      if (!result) {
        useDialogStore.getState().showToast('成稿为空，请检查模型配置后重试', { type: 'error' });
        return;
      }

      setSessionMicroApp(sessionId, 'prompt', {
        ...promptState,
        artifact: result,
        artifactAt: Date.now(),
        artifactFingerprint: outline.fingerprint,
      });
      setView('artifact');
      setCopied(false);
    } catch (error) {
      console.error('[PromptPanel] 成稿失败:', error);
      useDialogStore.getState().showToast('生成成稿失败，请稍后重试', { type: 'error' });
    } finally {
      setSynthesizing(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      useDialogStore.getState().showToast('复制失败，请手动选中文本复制', { type: 'error' });
    }
  };

  const setOptionCount = (value: number) => {
    if (!promptState) return;
    setSessionMicroApp(sessionId, 'prompt', { ...promptState, optionCount: value });
  };

  // 不是 Prompt 会话（例如用户从"微应用"入口在聊天会话里打开了它）
  if (!promptState) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader title="Prunus Prompt" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="w-11 h-11 rounded-full bg-leaf-50 flex items-center justify-center">
            <Sparkles size={20} className="text-leaf-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">这个会话不是 Prompt 会话</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Prompt 工作台会把根节点当作议题，并用一棵树来组织发散结果。
              新建一个专用会话，聊天记录就不会和你的思考混在一起。
            </p>
          </div>
          <button
            onClick={() => createPromptSession(null)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-leaf-600 hover:bg-leaf-700 rounded-lg transition-colors"
          >
            <Sparkles size={14} /> 新建 Prompt 会话
          </button>
        </div>
      </div>
    );
  }

  // 还没输入议题
  if (!started) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader title="Prunus Prompt" />
        <div className="flex-1 overflow-auto px-4 py-5">
          <label className="text-sm font-medium text-gray-700">你想做什么？</label>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            先用一句话描述目标。接下来会给你一组方向，勾选要进入成稿的内容，
            再逐层细分、编辑或追问 —— 不需要一次想清楚全部。
          </p>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleStart();
              }
            }}
            rows={4}
            autoFocus
            placeholder="例如：我想做一个营销网页，用来推广我的产品"
            className="mt-3 w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200"
          />

          <button
            onClick={() => void handleStart()}
            disabled={!draft.trim() || starting}
            className={cn(
              'mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
              draft.trim() && !starting
                ? 'text-white bg-leaf-600 hover:bg-leaf-700'
                : 'text-gray-400 bg-gray-100 cursor-not-allowed'
            )}
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {starting ? '正在想方向…' : '开始发散'}
          </button>

          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            开始之后，画布上会出现若干未纳入的提议。它们都能继续细分、编辑、追问；
            勾选只决定"进不进成稿"。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title="Prunus Prompt"
        right={
          <label className="flex items-center gap-1 text-[11px] text-gray-500">
            每次
            <select
              value={promptState.optionCount}
              onChange={(e) => setOptionCount(Number(e.target.value))}
              className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px] text-gray-700 outline-none focus:border-leaf-400"
              title="每次发散提供几个方向"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            项
          </label>
        }
      />

      {showArtifact ? (
        <>
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-100">
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-leaf-600"
            >
              <ArrowLeft size={12} /> 返回清单
            </button>
            <button
              onClick={() => void handleSynthesize()}
              disabled={synthesizing}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-leaf-600 disabled:opacity-50"
              title="用当前清单重新生成"
            >
              {synthesizing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              重新生成
            </button>
          </div>

          {stale && (
            <div className="shrink-0 mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-700">
              清单已更新，当前成稿是旧的。点「重新生成」同步。
            </div>
          )}

          <div className="flex-1 overflow-auto px-4 py-4">
            <div className="prose prose-sm max-w-none text-[12.5px] leading-6 text-gray-700">
              <MarkdownText>{artifact}</MarkdownText>
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-100 px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">
              {promptState.artifactAt
                ? new Date(promptState.artifactAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </span>
            <button
              onClick={() => void handleCopy(artifact)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors',
                copied
                  ? 'text-leaf-700 bg-leaf-50'
                  : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
              )}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? '已复制' : '复制成稿'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-auto px-4 py-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-[12.5px] leading-6 text-gray-700">
              {markdown}
            </pre>
          </div>

          <div className="shrink-0 border-t border-gray-100 px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">{outline.includedCount} 项已纳入</span>
            <div className="flex items-center gap-1.5">
              {artifact && (
                <button
                  onClick={() => setView('artifact')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
                >
                  <Eye size={13} /> 查看成稿
                </button>
              )}
              <button
                onClick={() => void handleSynthesize()}
                disabled={synthesizing || outline.includedCount === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  synthesizing || outline.includedCount === 0
                    ? 'text-gray-300 bg-gray-100 cursor-not-allowed'
                    : 'text-white bg-leaf-600 hover:bg-leaf-700'
                )}
              >
                {synthesizing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {synthesizing ? '正在成稿…' : '生成成稿'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PanelHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-1.5">
        <Sparkles size={14} className="text-leaf-600" />
        <span className="text-sm font-medium text-gray-700">{title}</span>
      </div>
      {right}
    </div>
  );
}
