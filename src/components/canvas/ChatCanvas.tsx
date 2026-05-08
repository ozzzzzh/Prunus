import { useMemo, useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, type Node, type Edge, useNodesState, useEdgesState, ConnectionMode, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Focus } from 'lucide-react';

import { useChatStore } from '../../store/chatStore';
import MessageNode from './MessageNode';
import { getLayoutedElements } from '../../utils/layout';

const nodeTypes = {
  message: MessageNode,
};

export default function ChatCanvas() {
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const sessions = useChatStore(state => state.sessions);
  
  const session = activeSessionId ? sessions[activeSessionId] : null;

  // React Flow instance for programmatic view control
  const { setCenter } = useReactFlow();
  const prevCurrentNodeId = useRef<string | null>(null);

  // 直接收集所有节点的收缩状态作为依赖
  const collapsedStates = useMemo(() => {
    if (!session) return '';
    return Object.values(session.nodes)
      .filter(n => n.marker)
      .map(n => `${n.id}:${n.collapsed ? 1 : 0}`)
      .join('|');
  }, [session]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!session) return { nodes: [], edges: [] };

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Calculate the active path (from currentNode up to root)
    const activePath = new Set<string>();
    let curr: string | null = session.currentNodeId;
    while (curr) {
      activePath.add(curr);
      curr = session.nodes[curr]?.parentId || null;
    }

    Object.values(session.nodes).forEach(node => {
      // 只有真正的当前焦点节点才是 isActive (用于卡片高亮)
      const isCurrentFocus = node.id === session.currentNodeId;
      // 路径上的节点我们叫做 isPath (用于连线高亮)
      const isPath = activePath.has(node.id);

      nodes.push({
        id: node.id,
        type: 'message',
        position: { x: 0, y: 0 }, // Handled by dagre
        data: { node, isActive: isCurrentFocus },
      });

      node.childrenIds.forEach(childId => {
        const isEdgeActive = isPath && activePath.has(childId);
        edges.push({
          id: `${node.id}-${childId}`,
          source: node.id,
          target: childId,
          animated: isEdgeActive,
          zIndex: 5, // 让连线在非活跃节点之上
          style: {
            stroke: isEdgeActive ? '#6a9e62' : '#8b7355',
            strokeWidth: isEdgeActive ? 2 : 1.5,
            transition: 'all 0.3s ease',
          },
          type: 'smoothstep',
        });
      });
    });

    return getLayoutedElements(nodes, edges);
  }, [session, collapsedStates]);

  // Using controlled state for React Flow to allow interactions if needed
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update flow when store changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);

    // Auto focus to current node if it changed
    if (session && session.currentNodeId !== prevCurrentNodeId.current) {
      prevCurrentNodeId.current = session.currentNodeId;
      
      // 找到当前节点
      const currentNodeId = session.currentNodeId;
      // 注意：由于 dagre 布局可能改变了引用，我们需要从最新的 nodes 状态里找
      const currentNode = currentNodeId ? initialNodes.find(n => n.id === currentNodeId) : null;

      if (currentNode) {
        setTimeout(() => {
          // 节点 position 是左上角坐标，需要计算中心点
          // 节点宽度 480px，高度动态（约 200-400px），取平均值
          const nodeWidth = 480;
          const nodeHeight = 300; // 估算高度（header + content）

          // 中心点坐标
          const centerX = currentNode.position.x + nodeWidth / 2;
          const centerY = currentNode.position.y + nodeHeight / 2;

          // 输入框在底部，约 100px 高度，需要向上偏移视口中心
          const viewportOffset = 60; // 将视口中心向上偏移，让节点显示在屏幕中上部

          setCenter(centerX, centerY + viewportOffset, { zoom: 1.0, duration: 500 });
        }, 50);
      }
    }
  }, [initialNodes, initialEdges, session, setCenter, setNodes, setEdges]);

  const handleFocusLatestNode = () => {
    if (!session) return;
    
    // 优先聚焦正在生成的节点，如果没有则聚焦当前点选（激活）的节点
    const targetNodeId = useChatStore.getState().generatingNodeId || session.currentNodeId;
    
    if (!targetNodeId) return;

    const targetNode = nodes.find(n => n.id === targetNodeId);
    if (targetNode) {
      const nodeWidth = 480;
      const nodeHeight = 300;
      const centerX = targetNode.position.x + nodeWidth / 2;
      const centerY = targetNode.position.y + nodeHeight / 2;
      setCenter(centerX, centerY + 60, { zoom: 1.0, duration: 500 });
    }
  };

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-full bg-[#fafafa]">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <p className="text-lg font-medium text-gray-500">Create or select a branch to start</p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full relative bg-[#fafafa] overflow-hidden canvas-texture">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          // React Flow 提供的原生节点点击事件
          const focusNode = useChatStore.getState().focusNode;
          // 只允许点击非高亮的 AI/System 节点
          const nodeData = node.data as { isActive?: boolean; node?: { role?: string } };
          if (nodeData && !nodeData.isActive && nodeData.node?.role !== 'user') {
            focusNode(node.id);
          }
        }}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={false} // 禁止节点拖拽，因为我们是用 dagre 自动布局的
        nodesConnectable={false} // 禁止手动连线
        elementsSelectable={true} // 允许节点被选中/点击
        panOnScroll={true} // 允许使用鼠标滚轮平移画布，而不是缩放
        selectionOnDrag={false} // 禁用框选
        zoomOnScroll={false} // 禁用滚轮缩放，保持更好的阅读体验（可以通过双指缩放或按住ctrl缩放）
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d1d5db" gap={48} size={3} />
        <Controls className="bg-white shadow-md border-gray-200 rounded-lg overflow-hidden" showInteractive={false} />
      </ReactFlow>
      
      <button
        onClick={handleFocusLatestNode}
        title="Focus on active node"
        className="absolute bottom-32 right-8 p-3 bg-white text-gray-500 hover:text-leaf-600 hover:bg-gray-50 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.1)] border border-gray-200 rounded-full transition-all hover:scale-105 z-10 flex items-center justify-center"
      >
        <Focus size={20} />
      </button>
    </div>
  );
}