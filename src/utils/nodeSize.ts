/**
 * 节点尺寸的统一真源
 *
 * 关键不变量：**声明尺寸 == 渲染尺寸**。
 * 卡片始终用显式的 width/height 渲染（未缩放用默认值，缩放后用持久化的值），
 * 因此布局算出来的尺寸与屏幕上实际占用的尺寸永远一致，不依赖任何 DOM 测量。
 * 这条不变量是「同层永不重叠」和「无二次落位」的根本保证。
 */

/** 收缩态节点（带标记）的圆标尺寸 */
export const COLLAPSED_SIZE = 56;

/** 默认卡片宽度 */
export const DEFAULT_WIDTH = 480;

/** 未手动缩放节点的固定高度（内容超出时在卡片内部滚动） */
export const DEFAULT_HEIGHT = 360;

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
 * 优先级：收缩态 > 持久化的手动尺寸 > 默认值
 *
 * collapsed 必须与 marker 同时判断，才与 MessageNode 的渲染条件
 * (`node.collapsed && node.marker`) 一致；否则「标记被移除但 collapsed 仍为 true」
 * 的旧数据会渲染成卡片、却被布局按 56 计算。
 */
export function resolveNodeSize(node: SizableNode | undefined): NodeSize {
  if (!node) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  if (node.collapsed && node.marker) return { width: COLLAPSED_SIZE, height: COLLAPSED_SIZE };
  return {
    width: node.width ?? DEFAULT_WIDTH,
    height: node.height ?? DEFAULT_HEIGHT,
  };
}

/** 把尺寸夹到允许范围内，并取整 */
export const clampSize = (size: NodeSize): NodeSize => ({
  width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, size.width))),
  height: Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, size.height))),
});
