import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const expandedWidth = 480;
const expandedHeight = 350; // 展开节点的估算高度
const collapsedWidth = 56;
const collapsedHeight = 56;

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // 找出有兄弟节点的节点（同一父节点有多个子节点）
  const siblingGroups: Record<string, string[]> = {}; // parentId -> childrenIds

  edges.forEach(edge => {
    if (!siblingGroups[edge.source]) {
      siblingGroups[edge.source] = [];
    }
    siblingGroups[edge.source].push(edge.target);
  });

  // 只统计有多于1个子节点的父节点对应的兄弟组
  const siblingCount = Object.values(siblingGroups)
    .filter(children => children.length > 1)
    .reduce((sum, children) => sum + children.length, 0);

  // 统计这些兄弟节点中有多少是收缩的
  let collapsedSiblings = 0;
  Object.values(siblingGroups)
    .filter(children => children.length > 1)
    .forEach(children => {
      children.forEach(childId => {
        const node = nodes.find(n => n.id === childId);
        const nodeData = node?.data as { node?: { collapsed?: boolean } };
        if (nodeData?.node?.collapsed) {
          collapsedSiblings++;
        }
      });
    });

  const hasSiblings = siblingCount > 0;
  const siblingCollapseRatio = hasSiblings ? collapsedSiblings / siblingCount : 0;

  // 动态 nodesep 计算：
  // 目标：全展开中心间距 680px, 全收缩中心间距 280px
  // 全展开: nodesep = 680 - 480 = 200px
  // 全收缩: nodesep = 280 - 56 = 224px
  // 根据 siblingCollapseRatio 在两者之间插值
  const expandedNodesep = 200;
  const collapsedNodesep = 224;
  const nodesep = expandedNodesep + (collapsedNodesep - expandedNodesep) * siblingCollapseRatio;

  // 上下间距
  const totalCollapsedCount = nodes.filter(node => {
    const nodeData = node.data as { node?: { collapsed?: boolean } };
    return nodeData?.node?.collapsed === true;
  }).length;
  const ranksep = totalCollapsedCount / Math.max(nodes.length, 1) > 0.5 ? 70 : 150;

  dagreGraph.setGraph({ rankdir: direction, nodesep, ranksep });

  // 根据收缩状态分配不同宽度和高度
  nodes.forEach((node) => {
    const nodeData = node.data as { node?: { collapsed?: boolean } };
    const isCollapsed = nodeData?.node?.collapsed === true;
    const width = isCollapsed ? collapsedWidth : expandedWidth;
    const height = isCollapsed ? collapsedHeight : expandedHeight;
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    // 使用收缩宽度计算左边缘位置，确保展开时节点向右扩展
    // 左边缘位置 = dagre中心点 - 收缩宽度/2
    const leftEdgeX = nodeWithPosition.x - collapsedWidth / 2;

    // Y 坐标始终使用 collapsedHeight 计算，确保展开时节点顶部位置不变（向下展开）
    return {
      ...node,
      position: {
        x: leftEdgeX,
        y: nodeWithPosition.y - collapsedHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};