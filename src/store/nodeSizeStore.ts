/**
 * 节点实测尺寸（内存态，不持久化）
 *
 * 高度是「内容自适应」的，布局无法预先知道，只能由 MessageNode 用
 * ResizeObserver 把卡片的真实高度上报到这里，ChatCanvas 再喂给布局。
 *
 * 关键约束：上报必须**移出 ResizeObserver 回调**。
 * 在 RO 回调里同步改 store 会在同一个通知投递周期内触发
 * 「测量 → 重排 → 再测量」，浏览器会抛
 * `ResizeObserver loop completed with undelivered notifications`，
 * 并中止该轮投递 —— 连带 React Flow 自身的节点测量一起失效，
 * 表现为节点与连接线大面积消失。
 *
 * 因此所有上报都走 reportNodeSize()：先记入待办，用 rAF 合并成**每帧一次**
 * 的批量提交。这同时把「N 个节点各触发一次重排」压成「每帧最多一次」。
 */

import { create } from 'zustand';
import type { NodeSize } from '../utils/nodeSize';

/** 小于该像素差视为无变化，吸收亚像素与 DPR 噪声 */
const EPSILON = 1;

/** 丢弃非法读数：元素脱离文档时 RO 会上报 0，而 0 不是 nullish，
 *  会一路穿过 `?? measured.height` 把节点在布局里压成 0 高。 */
function sanitize(size: NodeSize): { width: number; height: number } | null {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    return null;
  }
  return { width: Math.round(size.width), height: Math.round(size.height) };
}

interface NodeSizeState {
  sizes: Record<string, NodeSize>;
  /** 批量提交一帧内收集到的所有尺寸（内部使用，请走 reportNodeSize） */
  commitBatch: (batch: Map<string, NodeSize>) => void;
}

export const useNodeSizeStore = create<NodeSizeState>((set) => ({
  sizes: {},

  commitBatch: (batch) =>
    set((state) => {
      let next: Record<string, NodeSize> | null = null;

      batch.forEach((size, nodeId) => {
        const clean = sanitize(size);
        if (!clean) return;

        const prev = (next ?? state.sizes)[nodeId];
        // 无实质变化则不写：返回原 state 引用时 Zustand 不会通知订阅者，
        // 这是切断「实测 → 重排 → 尺寸变化 → 实测」环的最后一道闸。
        if (
          prev &&
          Math.abs(prev.width - clean.width) < EPSILON &&
          Math.abs(prev.height - clean.height) < EPSILON
        ) {
          return;
        }

        if (!next) next = { ...state.sizes };
        next[nodeId] = clean;
      });

      return next ? { sizes: next } : state;
    }),
}));

// ===== rAF 合并的上报入口 =====

const pending = new Map<string, NodeSize>();
let rafId: number | null = null;

/**
 * 上报一个节点的实测尺寸。
 * 同一帧内的多次调用会被合并为一次 store 提交（进而一次布局重算）。
 */
export function reportNodeSize(nodeId: string, size: NodeSize): void {
  pending.set(nodeId, size);
  if (rafId !== null) return;

  rafId = requestAnimationFrame(() => {
    rafId = null;
    const batch = new Map(pending);
    pending.clear();
    useNodeSizeStore.getState().commitBatch(batch);
  });
}
