/**
 * Prompt 决策树里的节点
 *
 * 这是 Prompt 微应用"穿的衣服"：主应用的 MessageNode 完全不知道它的存在。
 * 只在 `registry.loadNodeTypes` 被打开时才加载并注册到画布上。
 *
 * 三种形态：
 * - 议题根：显示用户输入的目标，没有勾选框；
 * - 未选：虚线、低权重、窄卡，点勾选框才进入主路径；
 * - 已选：正常卡片，出现「细分」或「再想几个」。
 *
 * 所有状态都在节点 metadata 里（见 types/microApp.ts 的 PromptNodeMeta），
 * 所以勾选、细分、删除天然是可撤销的。
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Check, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import type { PrunusNode } from '../../../types';
import { getPromptNodeMeta, isPromptRoot } from '../../../types/microApp';
import { useSessionStore } from '../../../store/sessionStore';
import { useDialogStore } from '../../../store/dialogStore';
import { reportNodeSize } from '../../../store/nodeSizeStore';
import { expandPromptNode } from '../../../utils/promptExpand';
import { cn } from '../../../utils/cn';

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
  const deleteNode = useSessionStore((state) => state.deleteNode);

  const meta = getPromptNodeMeta(node) ?? {};
  const selected = meta.selected === true;
  const isRoot = promptRoot || isPromptRoot(node);

  /** 祖先链上有没有被取消勾选的节点 —— 有的话整支都失效，视觉上跟着变淡 */
  const branchActive = useMemo(() => {
    if (!nodes) return true;
    let cursor = node.parentId;
    while (cursor) {
      const ancestor = nodes[cursor];
      if (!ancestor) break;
      if (isPromptRoot(ancestor)) return true;
      const ancestorMeta = getPromptNodeMeta(ancestor);
      if (ancestorMeta && !ancestorMeta.selected) return false;
      cursor = ancestor.parentId;
    }
    return true;
  }, [nodes, node.parentId]);

  const dimmed = !isRoot && (!selected || !branchActive);

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

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!sessionId) return;
    setPromptNodeMeta(sessionId, node.id, { selected: !selected });
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

  /**
   * 议题根也可能需要补齐：它同样是"一批选项的父节点"。
   * 用户删掉顶层方向后，缺口应该补在根上，而不是无路可走。
   */
  const actionable = isRoot || selected;
  const canExpand = actionable && !meta.expanded && !meta.done;
  const canReplenish =
    actionable && meta.expanded === true && !meta.done && node.childrenIds.length < optionCount;

  return (
    <div
      ref={cardRef}
      data-prompt-node={isRoot ? 'root' : selected ? 'selected' : 'unselected'}
      className={cn(
        'group/node relative w-full rounded-xl border px-3 py-2.5 transition-colors duration-150',
        isRoot
          ? 'bg-white border-leaf-200 shadow-sm'
          : selected
            ? 'bg-white border-leaf-300 shadow-sm'
            : 'bg-white border-dashed border-gray-300',
        // 低权重不等于看不清：虚线 + 浅字已经足够表达"未选"，
        // 再叠一层强透明度会让整棵树在缩小时变成一片灰雾
        dimmed && 'opacity-75'
      )}
    >
      <Handle type="target" position={Position.Top} className="!top-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />

      <div className="flex items-start gap-2">
        {!isRoot && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleToggle}
            title={selected ? '取消勾选' : '勾选这一项'}
            className={cn(
              'mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors',
              selected
                ? 'bg-leaf-600 border-leaf-600 text-white'
                : 'bg-white border-gray-300 text-transparent hover:border-leaf-400'
            )}
          >
            <Check size={11} strokeWidth={3} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          {isRoot && (
            <span className="inline-block mb-1 text-[10px] font-medium tracking-wide text-leaf-600">
              PROMPT 议题
            </span>
          )}
          <div
            className={cn(
              'text-sm leading-snug break-words',
              isRoot ? 'font-semibold text-gray-800' : dimmed ? 'text-gray-500' : 'font-medium text-gray-800'
            )}
          >
            {node.content.trim() || '（未命名）'}
          </div>
          {!isRoot && meta.why && (
            <p className="mt-1 text-[11px] leading-snug text-gray-400 break-words">{meta.why}</p>
          )}
        </div>

        {/* 删除：低权重节点也要留出口；悬停才出现，避免满屏叉号 */}
        {!isRoot && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
            title="删除这一项"
            className="shrink-0 p-0.5 rounded text-gray-300 opacity-0 group-hover/node:opacity-100 hover:text-red-500 hover:bg-gray-100 transition-opacity"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {actionable && (
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
          ) : meta.done ? (
            <span className="text-[11px] text-gray-300">已足够具体</span>
          ) : (
            <span className="text-[11px] text-gray-300">已细分 {node.childrenIds.length} 项</span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bottom-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
    </div>
  );
}

export default memo(PromptNode);
