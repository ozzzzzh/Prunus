/**
 * Prunus Prompt 左侧面板
 *
 * 它是"树的投影"：右侧画布上每勾选/取消/删除一次，这里就重算一次层级型提示词。
 * 纯本地渲染，不调模型 —— 所以是真正实时的，也不会因为网络慢而跳动。
 *
 * 面板只做三件事：
 * 1. 第一次进来时收集议题，并触发第一次发散；
 * 2. 实时展示"当前树 → 层级提示词"；
 * 3. 提供复制与发散数量配置。
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { useSessionStore } from '../../../store/sessionStore';
import { useDialogStore } from '../../../store/dialogStore';
import { PROMPT_NODE_KEY, PROMPT_ROOT_KEY } from '../../../types/microApp';
import { buildPromptOutline, outlineToMarkdown } from '../../../utils/promptOutline';
import { expandPromptNode } from '../../../utils/promptExpand';
import { createPromptSession } from '../../../utils/promptSession';
import { cn } from '../../../utils/cn';
import type { MicroAppPanelProps } from '../registry';

/** 议题卡比发散节点宽一些，但比普通聊天卡片窄，避免一层就撑满画布 */
const ROOT_WIDTH = 360;

export default function PromptPanel({ sessionId }: MicroAppPanelProps) {
  const session = useSessionStore((state) => state.sessions[sessionId]);
  const nodes = session?.nodes;
  const rootNodeId = session?.rootNodeId ?? null;
  const promptState = session?.microApps?.prompt;

  const updateNodeContent = useSessionStore((state) => state.updateNodeContent);
  const setNodeSize = useSessionStore((state) => state.setNodeSize);
  const renameSession = useSessionStore((state) => state.renameSession);
  const setSessionMicroApp = useSessionStore((state) => state.setSessionMicroApp);

  const [draft, setDraft] = useState('');
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const outline = useMemo(
    () => buildPromptOutline(nodes ?? {}, rootNodeId),
    [nodes, rootNodeId]
  );
  const markdown = useMemo(() => outlineToMarkdown(outline), [outline]);
  const started = outline.title.trim().length > 0;

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
    setNodeSize(rootNodeId, { width: ROOT_WIDTH });
    renameSession(sessionId, goal.slice(0, 24));

    const result = await expandPromptNode(sessionId, rootNodeId);
    setStarting(false);

    if (result === 'error') {
      useDialogStore.getState().showToast('发散失败，请检查模型配置后重试', { type: 'error' });
    } else if (result === 'done') {
      useDialogStore.getState().showToast('这个议题已经足够具体了，可以直接使用左侧提示词', {
        type: 'info',
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
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
            className="px-4 py-2 text-sm font-medium text-white bg-leaf-600 hover:bg-leaf-700 rounded-lg transition-colors"
          >
            新建 Prompt 会话
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
            先用一句话描述目标。接下来会给你一组方向，你只勾选需要的那些，
            再逐层细分 —— 不需要一次想清楚全部。
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
            开始之后，右侧画布会出现若干"未勾选"的方向。勾选你想要的，它们才会继续往下长。
          </p>
        </div>
      </div>
    );
  }

  // 已经有树：实时层级提示词
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

      <div className="flex-1 overflow-auto px-4 py-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-[12.5px] leading-6 text-gray-700">
          {markdown}
        </pre>
      </div>

      <div className="shrink-0 border-t border-gray-100 px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">
          {outline.selectedCount} 个决定
          {outline.excluded.length > 0 ? ` · ${outline.excluded.length} 个已排除` : ''}
        </span>
        <button
          onClick={() => void handleCopy()}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors',
            copied
              ? 'text-leaf-700 bg-leaf-50'
              : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
          )}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? '已复制' : '复制提示词'}
        </button>
      </div>
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
