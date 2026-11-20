/**
 * Prompt 决策树里的节点
 *
 * 这是 Prompt 微应用"穿的衣服"：主应用的 MessageNode 完全不知道它的存在。
 * 只在 `registry.loadNodeTypes` 被打开时才加载并注册到画布上。
 *
 * **UI 基调（改这个文件前先读 ARCHITECTURE §1.4）**：
 * - 节点只承载内容与勾选，不放类型/来源/状态的小标签或小字；
 * - 次要信息（why）默认不占版面，hover 时以浮层出现，有边框和背景作边界，
 *   并且**不能改变节点尺寸**（否则布局会随 hover 抖动）；
 * - 所有操作集中在 hover 工具栏里（细分 / 分叉 / 编辑 / 删除），
 *   不在卡片下方另外加按钮。
 *
 * 核心约定：**勾选 = 纳入成稿，展开不要求先勾选**。
 * 所有状态都在节点 metadata 里（见 types/microApp.ts 的 PromptNodeMeta），
 * 所以勾选、编辑、细分、删除天然是可撤销的。
 */

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Check,
  GitBranch,
  Loader2,
  Pencil,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { PrunusNode } from '../../../types';
import { getPromptNodeMeta, isPromptRoot, type PromptNodeKind } from '../../../types/microApp';
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

      {/*
        悬停工具栏：所有操作集中在这里，卡片正文保持干净。
        浮在卡片上沿之外，不占正文版面。
      */}
      <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-sm group-hover/node:flex">
        {busy ? (
          <span className="p-1 text-gray-400">
            <Loader2 size={13} className="animate-spin" />
          </span>
        ) : canExpand ? (
          <ToolbarButton title="细分" onClick={handleExpand}>
            <Sparkles size={13} />
          </ToolbarButton>
        ) : canReplenish ? (
          <ToolbarButton title="再想几个" onClick={handleExpand}>
            <Wand2 size={13} />
          </ToolbarButton>
        ) : null}

        {!isFact && (
          <ToolbarButton title="分叉" onClick={handleAddChild}>
            <GitBranch size={13} />
          </ToolbarButton>
        )}
        {!isFact && !isEditing && (
          <ToolbarButton title="编辑" onClick={handleEdit}>
            <Pencil size={12} />
          </ToolbarButton>
        )}
        {!isRoot && (
          <ToolbarButton title="删除" onClick={handleDelete} danger>
            <X size={13} />
          </ToolbarButton>
        )}
      </div>

      {/*
        why 是次要信息：默认不出现，hover 时浮在卡片下方。
        用绝对定位而不是插进正文，避免 hover 改变节点高度导致整棵树重排。
      */}
      {!isRoot && meta.why && (
        <div className="pointer-events-none absolute left-0 right-0 top-full z-10 mt-1.5 hidden rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] leading-snug text-gray-500 shadow-sm group-hover/node:block">
          {meta.why}
        </div>
      )}

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
              className="min-h-[40px] outline-none text-sm leading-snug text-gray-800 prose prose-sm max-w-none"
              suppressContentEditableWarning
            />
          ) : (
            <div
              key="prompt-view"
              className={cn(
                'text-sm leading-snug break-words',
                isRoot ? 'font-semibold text-gray-800' : 'text-gray-800'
              )}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingNode(node.id);
              }}
            >
              {shownContent.trim() ? (
                <div className="prose prose-sm max-w-none break-words">
                  <MarkdownText>{shownContent}</MarkdownText>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {isEditing && <SelectionToolbar editorRef={editRef} />}

      <Handle type="source" position={Position.Bottom} className="!bottom-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  danger = false,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={title}
      className={cn(
        'p-1 rounded-md transition-colors',
        danger
          ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          : 'text-gray-500 hover:text-leaf-700 hover:bg-leaf-50'
      )}
    >
      {children}
    </button>
  );
}

export default memo(PromptNode);
