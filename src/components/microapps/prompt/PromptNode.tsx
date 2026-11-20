/**
 * Prompt 决策树里的节点
 *
 * 这是 Prompt 微应用"穿的衣服"：主应用的 MessageNode 完全不知道它的存在。
 * 只在 `registry.loadNodeTypes` 被打开时才加载并注册到画布上。
 *
 * 四种形态：
 * - 议题根：显示目标，没有勾选框；
 * - 未纳入：虚线、空勾选框，内容照常可读、可展开；
 * - 已纳入：实心勾选、绿色描边；
 * - 解释：追问产生的问答，浅色「笔记」样式，默认不纳入。
 *
 * 核心约定：**勾选 = 纳入成稿，展开不要求先勾选**。
 * 所有状态都在节点 metadata 里（见 types/microApp.ts 的 PromptNodeMeta），
 * 所以勾选、编辑、细分、删除天然是可撤销的。
 */

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Check,
  Loader2,
  Lock,
  MessageCircle,
  Pencil,
  Plus,
  Sparkles,
  StickyNote,
  Wand2,
  X,
} from 'lucide-react';
import type { PrunusNode } from '../../../types';
import {
  getPromptNodeMeta,
  isPromptRoot,
  type PromptNodeKind,
} from '../../../types/microApp';
import { useSessionStore } from '../../../store/sessionStore';
import { useGenerationStore } from '../../../store/generationStore';
import { useDialogStore } from '../../../store/dialogStore';
import { useUIStore } from '../../../store/uiStore';
import { reportNodeSize } from '../../../store/nodeSizeStore';
import { expandPromptNode } from '../../../utils/promptExpand';
import { cn } from '../../../utils/cn';
import SelectionToolbar from '../../common/SelectionToolbar';
import MarkdownText from '../../markdown/MarkdownText';

interface PromptNodeProps {
  data: {
    node: PrunusNode;
    isActive?: boolean;
    /** 由画布映射时写入：这个节点是 Prompt 的议题根 */
    promptRoot?: boolean;
  };
}

const KIND_BADGE: Record<PromptNodeKind, { label: string; className: string; icon: ReactNode }> = {
  decision: { label: 'AI 建议', className: 'text-gray-400', icon: null },
  draft: { label: '候选稿', className: 'text-leaf-600 bg-leaf-50', icon: <Sparkles size={9} /> },
  fact: { label: '事实', className: 'text-sky-600 bg-sky-50', icon: <Lock size={9} /> },
  explain: { label: '解释', className: 'text-slate-500 bg-slate-100', icon: <MessageCircle size={9} /> },
  note: { label: '我的补充', className: 'text-amber-600 bg-amber-50', icon: <StickyNote size={9} /> },
};

function PromptNode({ data }: PromptNodeProps) {
  const { node, promptRoot } = data;
  const cardRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const editInitializedRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const sessionId = useSessionStore((state) => state.activeSessionId);
  const nodes = useSessionStore((state) =>
    state.activeSessionId ? state.sessions[state.activeSessionId]?.nodes : undefined
  );
  const optionCount = useSessionStore((state) =>
    state.activeSessionId
      ? state.sessions[state.activeSessionId]?.microApps?.prompt?.optionCount ?? 3
      : 3
  );
  const setPromptNodeMeta = useSessionStore((state) => state.setPromptNodeMeta);
  const addPromptChild = useSessionStore((state) => state.addPromptChild);
  const updateNodeContent = useSessionStore((state) => state.updateNodeContent);
  const deleteNode = useSessionStore((state) => state.deleteNode);

  const editingNodeId = useUIStore((state) => state.editingNodeId);
  const setEditingNode = useUIStore((state) => state.setEditingNode);
  const isEditing = editingNodeId === node.id;

  const streamingContent = useGenerationStore((state) =>
    state.generatingNodeId === node.id ? state.streamingContent : ''
  );

  const meta = getPromptNodeMeta(node) ?? {};
  const included = meta.included === true;
  const kind: PromptNodeKind = meta.kind ?? 'decision';
  const origin = meta.origin ?? 'ai';
  const isRoot = promptRoot || isPromptRoot(node);
  const isExplain = kind === 'explain';
  const isFact = kind === 'fact';

  // 尺寸上报：布局靠它拿到真实高度。rAF 合并发生在 reportNodeSize 内部。
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      reportNodeSize(node.id, { width: el.offsetWidth, height: el.offsetHeight });
    });
    observer.observe(el, { box: 'border-box' });
    return () => observer.disconnect();
  }, [node.id]);

  /**
   * 进入编辑态时把内容灌进 contentEditable 并把光标放到末尾。
   *
   * 只初始化一次（editInitializedRef）：node.content 在编辑过程中可能因为
   * 其他 store 更新而变化，反复写 innerHTML 会打断输入。
   */
  useEffect(() => {
    if (!isEditing) {
      editInitializedRef.current = false;
      return;
    }
    const el = editRef.current;
    if (!el || editInitializedRef.current) return;

    el.innerHTML = node.content;
    editInitializedRef.current = true;
    el.focus();

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditing, node.id, node.content]);

  const finishEditing = () => {
    const el = editRef.current;
    if (el) updateNodeContent(node.id, el.innerHTML);
    setEditingNode(null);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!sessionId) return;
    setPromptNodeMeta(sessionId, node.id, { included: !included });
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingNode(node.id);
  };

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!sessionId) return;
    const id = addPromptChild(sessionId, node.id, 'note');
    if (id) setEditingNode(id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (node.childrenIds.length > 0) {
      useDialogStore.getState().showConfirm({
        title: '删除这一支？',
        message: `「${node.content.trim() || '未命名'}」下面还有 ${node.childrenIds.length} 个子项，会一起删除。可以用 Ctrl+Z 撤销。`,
        confirmText: '删除',
        danger: true,
        onConfirm: () => deleteNode(node.id),
      });
      return;
    }

    deleteNode(node.id);
  };

  const handleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy || !sessionId) return;

    setBusy(true);
    const result = await expandPromptNode(sessionId, node.id);
    setBusy(false);

    if (result === 'done') {
      useDialogStore.getState().showToast('这一项已经足够具体了', { type: 'info' });
    } else if (result === 'error') {
      useDialogStore.getState().showToast('发散失败，请稍后重试', { type: 'error' });
    }
  };

  /** 只数 AI 提议的决策/候选稿：手动笔记与追问解释不占发散名额 */
  const proposalChildCount = node.childrenIds.reduce((count, childId) => {
    const child = nodes?.[childId];
    const childMeta = child ? getPromptNodeMeta(child) : null;
    return childMeta && (childMeta.kind === 'decision' || childMeta.kind === 'draft')
      ? count + 1
      : count;
  }, 0);

  const canExpand = !isExplain && !isFact && !meta.expanded && !meta.done;
  const canReplenish =
    !isExplain &&
    !isFact &&
    meta.expanded === true &&
    !meta.done &&
    proposalChildCount < optionCount;

  const badge = isRoot
    ? null
    : kind === 'decision'
      ? origin === 'user'
        ? { label: '我的补充', className: 'text-amber-600 bg-amber-50', icon: <StickyNote size={9} /> }
        : KIND_BADGE.decision
      : KIND_BADGE[kind];

  const shownContent = streamingContent || node.content;

  return (
    <div
      ref={cardRef}
      data-prompt-node={isRoot ? 'root' : included ? 'included' : 'unincluded'}
      data-prompt-kind={isRoot ? 'root' : kind}
      className={cn(
        'group/node relative w-full rounded-xl border px-3 py-2.5 transition-colors duration-150',
        isEditing && 'ring-2 ring-leaf-200',
        isRoot
          ? 'bg-white border-leaf-200 shadow-sm'
          : isExplain
            ? cn('border-slate-200', included ? 'bg-slate-50 border-leaf-300' : 'bg-slate-50/70')
            : included
              ? 'bg-white border-leaf-300 shadow-sm'
              : 'bg-white border-dashed border-gray-300'
      )}
    >
      <Handle type="target" position={Position.Top} className="!top-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />

      <div className="flex items-start gap-2">
        {!isRoot && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleToggle}
            title={included ? '取消纳入成稿' : '纳入成稿'}
            className={cn(
              'mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors',
              included
                ? 'bg-leaf-600 border-leaf-600 text-white'
                : 'bg-white border-gray-300 text-transparent hover:border-leaf-400'
            )}
          >
            <Check size={11} strokeWidth={3} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isRoot ? (
              <span className="text-[10px] font-medium tracking-wide text-leaf-600">PROMPT 议题</span>
            ) : (
              badge && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium',
                    badge.className
                  )}
                >
                  {badge.icon}
                  {badge.label}
                </span>
              )
            )}
          </div>

          {isEditing ? (
            <div
              /*
               * 必须和下面的展示态用不同的 key：两者都是 <div>，React 会复用同一个
               * DOM 节点。而编辑器里的文字是浏览器直接改的、React 并不知道 ——
               * 退出编辑时它只会追加自己的子节点，不会清掉手写进去的文本，
               * 于是卡片上出现一份原文 + 一份 Markdown 渲染，看起来像重复了。
               */
              key="prompt-editor"
              ref={editRef}
              contentEditable
              data-editor-dirty="false"
              onInput={(e) => e.currentTarget.setAttribute('data-editor-dirty', 'true')}
              onBlur={finishEditing}
              onKeyDown={(e) => {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                  e.stopPropagation();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  editRef.current?.blur();
                }
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              className="mt-0.5 outline-none min-h-[40px] text-sm leading-snug text-gray-800 prose prose-sm max-w-none"
              suppressContentEditableWarning
            />
          ) : (
            <div
              key="prompt-view"
              className={cn(
                'mt-0.5 text-sm leading-snug break-words',
                isRoot ? 'font-semibold text-gray-800' : 'text-gray-800'
              )}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingNode(node.id);
              }}
              title="双击编辑"
            >
              {shownContent.trim() ? (
                <div className="prose prose-sm max-w-none break-words">
                  <MarkdownText>{shownContent}</MarkdownText>
                </div>
              ) : (
                <span className="text-gray-300">（未命名，双击编辑）</span>
              )}
            </div>
          )}

          {!isRoot && meta.why && <p className="mt-1 text-[11px] leading-snug text-gray-400 break-words">{meta.why}</p>}
        </div>

        {!isRoot && !isFact && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/node:opacity-100">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleEdit}
              title="编辑"
              className="p-0.5 rounded text-gray-300 hover:text-leaf-600 hover:bg-gray-100"
            >
              <Pencil size={11} />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleDelete}
              title="删除这一项"
              className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-gray-100"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {!isFact && (
        <div className="mt-2 flex items-center gap-1.5">
          {busy ? (
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              <Loader2 size={12} className="animate-spin" /> 发散中…
            </span>
          ) : canExpand ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleExpand}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-leaf-50 text-leaf-700 hover:bg-leaf-100 transition-colors"
            >
              <Sparkles size={11} /> 细分
            </button>
          ) : canReplenish ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleExpand}
              title="再想几个"
              className="p-1 rounded-md text-leaf-600 hover:bg-leaf-50 transition-colors"
            >
              <Wand2 size={13} />
            </button>
          ) : isExplain ? (
            <span className="text-[11px] text-slate-400">解释默认不进入成稿</span>
          ) : meta.done ? (
            <span className="text-[11px] text-gray-300">已足够具体</span>
          ) : meta.expanded ? (
            <span className="text-[11px] text-gray-300">已细分 {proposalChildCount} 项</span>
          ) : null}

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleAddChild}
            title="手动添加一个子节点"
            className="p-1 rounded-md text-gray-400 hover:text-leaf-600 hover:bg-gray-100 transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
      )}

      {isEditing && <SelectionToolbar editorRef={editRef} />}

      <Handle type="source" position={Position.Bottom} className="!bottom-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
    </div>
  );
}

export default memo(PromptNode);
