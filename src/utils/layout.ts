import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const nodeWidth = 480;
// dagre 需要知道每个节点的宽高才能正确计算间距
// 我们在 UI 里通过 max-h-[300px] 限制了卡片最高 300px，加上 header/padding 大概是 360px 左右
const nodeMaxHeight = 360; 

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // ranksep = 垂直间距 (上下节点之间的连线长度)
  // nodesep = 水平间距 (左右并排节点之间的距离)
  dagreGraph.setGraph({ rankdir: direction, nodesep: 40, ranksep: 120 });

  nodes.forEach((node) => {
    // 强制 dagre 把所有节点当成最大高度来排版，这样即使内容很长也不会和下面的节点重叠
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeMaxHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeMaxHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};
