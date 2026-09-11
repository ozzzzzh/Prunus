import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  HORIZONTAL_GAP,
  VERTICAL_GAP,
  resolveNodeSize,
  type NodeSize,
  type SizableNode,
} from './nodeSize';
import { countRender } from './devCounters';

/**
 * 树状布局：横向交给 dagre，纵向用「分层带」模型自己算。
 *
 * 数学模型（r 为层号，depth(root)=0）：
 *   H_r = max{ h_i : i ∈ 第 r 层 }              每层最高节点决定该层带高
 *   Y_0 = 0
 *   Y_r = Y_{r-1} + H_{r-1} + VERTICAL_GAP      逐层累加
 *   y_i = Y_r                                   顶部对齐：同层节点顶边在同一条水平线
 *
 * 由此得到两条恒成立的性质：
 *   1) 相邻两层之间的竖直间隙恒为 VERTICAL_GAP，且**数学上不可能纵向重叠**
 *      （第 r 层带底 = Y_r + H_r，第 r+1 层带顶 = Y_r + H_r + VERTICAL_GAP）；
 *   2) 同一层的所有节点顶边对齐。
 *
 * 纵向规则对叶子节点与非叶子节点完全一致（都只看每层的 max h）；
 * 叶子与非叶子的差别只在横向——非叶子必须带动整棵子树，这一步交给 dagre。
 */
export const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction = 'TB',
  measuredSizes: Record<string, NodeSize> = {},
) => {
  countRender('layout'); // 临时诊断：拖动期间该值应当不增长

  const sizeById = new Map<string, NodeSize>();
  const dataById = new Map<string, SizableNode>();

  nodes.forEach((node) => {
    const data = (node.data as { node?: SizableNode } | undefined)?.node;
    // 高度是内容自适应的，优先用 DOM 实测值；宽度始终取声明值
    const size = resolveNodeSize(data, measuredSizes[node.id]);
    sizeById.set(node.id, size);
    if (data) dataById.set(node.id, data);
  });

  // 计算每层深度：BFS。必须在 try 外，它不依赖 dagre。
  const depth = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach((node) => {
    const data = dataById.get(node.id);
    // 无父节点（或父节点不在本次布局内）者视为根
    if (!data?.parentId || !dataById.has(data.parentId)) {
      depth.set(node.id, 0);
      queue.push(node.id);
    }
  });
  // 兜底：若一个根都找不到（存在环等退化数据），全部当作第 0 层，避免节点无坐标
  if (queue.length === 0) {
    nodes.forEach((node) => {
      depth.set(node.id, 0);
      queue.push(node.id);
    });
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    const children = dataById.get(id)?.childrenIds ?? [];
    for (const childId of children) {
      if (!dataById.has(childId) || depth.has(childId)) continue;
      depth.set(childId, d + 1);
      queue.push(childId);
    }
  }

  // 每层带高 → 每层带顶
  let maxDepth = 0;
  depth.forEach((d) => {
    if (d > maxDepth) maxDepth = d;
  });
  const bandHeight = new Array<number>(maxDepth + 1).fill(0);
  depth.forEach((d, id) => {
    const h = sizeById.get(id)?.height ?? 0;
    if (h > bandHeight[d]) bandHeight[d] = h;
  });
  const rankTop: number[] = new Array(maxDepth + 1).fill(0);
  for (let r = 1; r <= maxDepth; r++) {
    rankTop[r] = rankTop[r - 1] + bandHeight[r - 1] + VERTICAL_GAP;
  }

  // 横向交给 dagre（它负责兄弟分隔与子树碰撞消解）。纵向结果丢弃。
  const xById = new Map<string, number>();
  try {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: direction, nodesep: HORIZONTAL_GAP, ranksep: VERTICAL_GAP });

    nodes.forEach((node) => {
      const size = sizeById.get(node.id)!;
      dagreGraph.setNode(node.id, { width: size.width, height: size.height });
    });
    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
      const laid = dagreGraph.node(node.id);
      if (laid) xById.set(node.id, laid.x);
    });
  } catch (error) {
    // dagre 抛异常绝不能让整个画布崩掉（没有 error boundary，会白屏）
    console.error('[layout] dagre 横向布局失败，回退到网格排列', error);
  }

  const layoutedNodes = nodes.map((node, index) => {
    const size = sizeById.get(node.id)!;
    let x = xById.get(node.id);
    let y = rankTop[depth.get(node.id) ?? 0] ?? 0;

    // 任何缺失或非有限值都退回确定性网格，绝不让 NaN 流进 React Flow
    // （React Flow 收到 NaN 会不渲染该节点，且其连接线一并消失）
    if (!Number.isFinite(x)) {
      const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
      x = (index % columns) * (DEFAULT_WIDTH + HORIZONTAL_GAP);
      y = Math.floor(index / columns) * (DEFAULT_HEIGHT + VERTICAL_GAP);
    }

    return {
      ...node,
      position: {
        x: (x as number) - size.width / 2,
        y,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};
