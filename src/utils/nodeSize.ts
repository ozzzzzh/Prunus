/**
 * 节点尺寸的统一真源
 *
 * 宽度始终显式（默认 480 或用户手动缩放值）；高度默认为「内容自适应」，
 * 由卡片按内容自然撑开，通过 ResizeObserver 实测后喂给布局。
 *
 * 布局用的高度必须与渲染出的高度一致，否则同层节点会重叠，
 * 因此 resolveNodeSize 的优先级顺序是关键：
 *   收缩态 > 用户手动高度 > DOM 实测高度 > 默认兜底
 */

/** 收缩态节点（带标记）的圆标尺寸 */
export const COLLAPSED_SIZE = 56;

/** 默认卡片宽度 */
export const DEFAULT_WIDTH = 480;

/** 实测到位前的兜底高度 */
export const DEFAULT_HEIGHT = 240;

/**
 * 流式生成期间卡片的固定高度。
 *
 * 内容在增长时若卡片跟着变高，会让 ResizeObserver 连续上报、布局反复重算。
 * 因此生成期间锁一个固定高度（内容在卡片内部滚动），结束后再回到内容自适应、
 * 实测一次真实高度。这样既不抖动，也不会因高度失真而重叠。
 */
export const STREAMING_CARD_HEIGHT = 320;

/** 手动缩放的边界 */
export const MIN_WIDTH = 280;
export const MAX_WIDTH = 900;
export const MIN_HEIGHT = 140;
export const MAX_HEIGHT = 1200;

/** dagre 间距：ranksep（上下）/ nodesep（左右） */
export const VERTICAL_GAP = 56;
export const HORIZONTAL_GAP = 64;

export interface NodeSize {
  width: number;
  height: number;
}

/** 布局需要的最小节点信息（尺寸 + 树结构） */
export interface SizableNode {
  collapsed?: boolean;
  marker?: string;
  width?: number;
  height?: number;
  parentId?: string | null;
  childrenIds?: string[];
}

/**
 * 解析节点的布局尺寸。
 *
 * collapsed 必须与 marker 同时判断，才与 MessageNode 的渲染条件
 * (`node.collapsed && node.marker`) 一致；否则「标记被移除但 collapsed 仍为 true」
 * 的旧数据会渲染成卡片、却被布局按 56 计算。
 */
export function resolveNodeSize(node: SizableNode | undefined, measured?: NodeSize): NodeSize {
  if (!node) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  if (node.collapsed && node.marker) return { width: COLLAPSED_SIZE, height: COLLAPSED_SIZE };
  return {
    width: node.width ?? DEFAULT_WIDTH,
    height: node.height ?? measured?.height ?? DEFAULT_HEIGHT,
  };
}

/** 把尺寸夹到允许范围内，并取整 */
export const clampSize = (size: NodeSize): NodeSize => ({
  width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, size.width))),
  height: Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, size.height))),
});
