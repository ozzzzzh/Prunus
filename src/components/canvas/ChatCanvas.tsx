import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import {
  ReactFlow,
  // 刻意不使用点阵背景（xyflow 的 <Background> 或自研版本）。
  // 实测结论：背景的代价主要是**绘制**而非重渲染 —— 每帧改变 <pattern> 的 x/y
  // 会让整个视口大小的 <rect fill="url(#pattern)"> 重新光栅化，这个代价与是否走
  // React 无关（自研的命令式版本同样慢）。去掉背景后拖动体感明显变好。
  // 若要恢复，需接受这个每帧光栅化成本。
  // Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Focus, Sparkles, X, BookOpen } from 'lucide-react';

import { useSessionStore } from '../../store/sessionStore';
import { useGenerationStore } from '../../store/generationStore';
import { useNodeSizeStore } from '../../store/nodeSizeStore';
import { useUIStore } from '../../store/uiStore';
import { isAIChatNode } from '../../types';
import type { SummaryNodeInput } from '../../utils/summarize';
import { cn } from '../../utils/cn';
import { resolveNodeSize } from '../../utils/nodeSize';
import MessageNode from './MessageNode';
import SummaryModal from '../summary/SummaryModal';
import GlobalPromptModal from '../layout/GlobalPromptModal';
import { getLayoutedElements } from '../../utils/layout';

/** 节点中心离视口边缘多近时认为「快看不见了」，触发智能跟随 */
const FOLLOW_MARGIN = 80;

/** 点右下角「聚焦」按钮时放大到的倍数 */
const FOCUS_ZOOM = 1.2;

/**
 * 聚焦/跟随时把节点上移的距离（流坐标）。
 *
 * `ChatInput` 是 `absolute bottom-6` 浮在画布之上的（见 ChatInput.tsx），
 * 所以画布区中心并不是「视线安全区」的中心 —— 不做偏移的话，
 * 被聚焦的节点下半部分会被输入框盖住。
 */
const FOCUS_OFFSET_Y = 60;

const nodeTypes = {
  message: MessageNode,
};

export default function ChatCanvas() {
  // 直接订阅 sessionStore，避免 chatStore getter 的问题
  const activeSessionId = useSessionStore(state => state.activeSessionId);
  const sessions = useSessionStore(state => state.sessions);
  const focusNode = useSessionStore(state => state.focusNode);
  const toggleNodeCollapse = useSessionStore(state => state.toggleNodeCollapse);
  const deleteNode = useSessionStore(state => state.deleteNode);

  const isSelectingMode = useUIStore(state => state.isSelectingMode);
  const selectedNodeIds = useUIStore(state => state.selectedNodeIds);
  const enterSelectingMode = useUIStore(state => state.enterSelectingMode);
  const exitSelectingMode = useUIStore(state => state.exitSelectingMode);

  const session = activeSessionId ? sessions[activeSessionId] : null;

  const [summaryNodes, setSummaryNodes] = useState<SummaryNodeInput[] | null>(null);
  const [showGlobalPrompt, setShowGlobalPrompt] = useState(false);
  const hasGlobalPrompt = Boolean(session?.globalPrompt?.trim());

  // React Flow instance for programmatic view control
  const { setCenter, getZoom, getViewport } = useReactFlow();
  // 画布容器尺寸（为 0 表示 React Flow 还没测量完，此时居中会算错，必须等）
  const paneWidth = useStore(state => state.width);
  const paneHeight = useStore(state => state.height);
  const prevCurrentNodeId = useRef<string | null>(null);

  // 影响布局的全部输入：收缩状态 + 持久化的手动尺寸。
  // 注意高度还有第三个来源——DOM 实测（下方 measuredSizes），它是独立依赖。
  const sizeStates = useMemo(() => {
    if (!session) return '';
    return Object.values(session.nodes)
      .map(n => `${n.id}:${n.collapsed ? 1 : 0}:${n.width ?? ''}x${n.height ?? ''}`)
      .join('|');
  }, [session]);

  // 节点实测尺寸（MessageNode 通过 ResizeObserver 上报）。
  // store 内已做「无实质变化返回原引用」的守卫，因此可直接作为 memo 依赖。
  const measuredSizes = useNodeSizeStore(state => state.sizes);

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

      // 必须给 React Flow 提供显式尺寸。
      // 原因：每次布局变化都会用 setNodes 整体替换节点数组，新对象里没有 React Flow
      // 自己的 measured 字段；而 DOM 尺寸并没变，它的 ResizeObserver 不会再次触发，
      // 于是它永远学不回尺寸 —— 结果大量节点「尺寸未知」，连接线算不出端点而整条消失。
      // 尺寸来源与布局完全一致（measuredSizes 就是卡片的实测高度），不存在双真源。
      const { width, height } = resolveNodeSize(node, measuredSizes[node.id]);

      nodes.push({
        id: node.id,
        type: 'message',
        position: { x: 0, y: 0 }, // 由 getLayoutedElements 计算
        width,
        height,
        data: { node, isActive: isCurrentFocus },
      });

      node.childrenIds.forEach(childId => {
        const isEdgeActive = isPath && activePath.has(childId);
        edges.push({
          id: `${node.id}-${childId}`,
          source: node.id,
          target: childId,
          animated: isEdgeActive,
          zIndex: 5,
          style: {
            stroke: isEdgeActive ? '#6a9e62' : '#8b7355',
            strokeWidth: isEdgeActive ? 2 : 1.5,
            transition: 'all 0.3s ease',
          },
          type: 'smoothstep',
        });
      });
    });

    return getLayoutedElements(nodes, edges, 'TB', measuredSizes);
  }, [session, sizeStates, measuredSizes]);

  // Using controlled state for React Flow to allow interactions if needed
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update flow when store changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  /**
   * 视口智能跟随。
   *
   * 两种情况需要动镜头：
   *   1) 焦点切换（currentNodeId 变化）→ 一定居中到新焦点；
   *   2) 布局变化把当前节点挤出了视野 → 拉回来。
   * 其余情况（节点已在视野内）完全不动，避免镜头乱跑。
   *
   * 关键：等 paneWidth/paneHeight 就绪后再算，否则容器尺寸为 0 会把节点算到角落；
   * 尺寸用「声明值」（resolveNodeSize），与布局用的是同一套数字，故居中恒准确。
   */
  useEffect(() => {
    if (!session || !session.currentNodeId) return;
    // React Flow 还没测量完容器，先不动作；尺寸就绪后本 effect 会重跑
    if (paneWidth <= 0 || paneHeight <= 0) return;

    const currentNodeId = session.currentNodeId;
    const currentNode = initialNodes.find(n => n.id === currentNodeId);
    if (!currentNode) return;

    const { width, height } = resolveNodeSize(session.nodes[currentNodeId], measuredSizes[currentNodeId]);
    // position 是左上角坐标，换算成中心点
    const centerX = currentNode.position.x + width / 2;
    const centerY = currentNode.position.y + height / 2;

    const focusChanged = prevCurrentNodeId.current !== currentNodeId;
    prevCurrentNodeId.current = currentNodeId;

    if (!focusChanged) {
      // 视口可见的流坐标范围
      const viewport = getViewport();
      const left = -viewport.x / viewport.zoom;
      const top = -viewport.y / viewport.zoom;
      const right = left + paneWidth / viewport.zoom;
      const bottom = top + paneHeight / viewport.zoom;
      const inView =
        centerX > left + FOLLOW_MARGIN &&
        centerX < right - FOLLOW_MARGIN &&
        centerY > top + FOLLOW_MARGIN &&
        centerY < bottom - FOLLOW_MARGIN;
      if (inView) return;
    }

    // 上移一点，避开浮在底部的 ChatInput（原因见 FOCUS_OFFSET_Y）
    setCenter(centerX, centerY + FOCUS_OFFSET_Y, { zoom: getZoom() || 1, duration: 400 });
  }, [
    session, initialNodes, measuredSizes, paneWidth, paneHeight,
    setCenter, getZoom, getViewport,
  ]);

  const handleFocusLatestNode = () => {
    if (!session) return;

    // 优先聚焦正在生成的节点，如果没有则聚焦当前点选（激活）的节点
    const targetNodeId = useGenerationStore.getState().generatingNodeId || session.currentNodeId;

    if (!targetNodeId) return;

    const targetNode = nodes.find(n => n.id === targetNodeId);
    if (targetNode) {
      const { width: nodeWidth, height: nodeHeight } = resolveNodeSize(
        session.nodes[targetNodeId],
        measuredSizes[targetNodeId]
      );
      const centerX = targetNode.position.x + nodeWidth / 2;
      const centerY = targetNode.position.y + nodeHeight / 2;
      // 放大到 FOCUS_ZOOM，并上移一点避开浮在底部的 ChatInput
      setCenter(centerX, centerY + FOCUS_OFFSET_Y, { zoom: FOCUS_ZOOM, duration: 400 });
    }
  };

  const handleGenerateSummary = () => {
    if (!session || selectedNodeIds.length === 0) return;

    const nodesToSummarize: SummaryNodeInput[] = [];
    for (const id of selectedNodeIds) {
      const node = session.nodes[id];
      if (!node) continue;
      nodesToSummarize.push({
        role: isAIChatNode(node) ? node.role : 'assistant',
        content: node.content,
      });
    }

    setSummaryNodes(nodesToSummarize);
    exitSelectingMode();
  };

  // 键盘导航
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 如果用户正在输入，不触发导航
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return;
    }

    // 如果处于编辑模式（contenteditable），不触发快捷键
    if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
      return;
    }

    // 如果按下了 Ctrl 或 Cmd 键，不触发单键快捷键（避免与复制等操作冲突）
    if (e.ctrlKey || e.metaKey) {
      return;
    }

    // 选择模式下仅响应 ESC 退出
    if (isSelectingMode) {
      if (e.key === 'Escape') {
        exitSelectingMode();
      }
      return;
    }

    if (!session || !session.currentNodeId) return;

    const currentNode = session.nodes[session.currentNodeId];
    if (!currentNode) return;

    let targetNodeId: string | null = null;

    switch (e.key) {
      case 'ArrowUp':
        // 跳到父节点
        e.preventDefault();
        targetNodeId = currentNode.parentId;
        break;

      case 'ArrowDown':
        // 跳到第一个子节点
        e.preventDefault();
        if (currentNode.childrenIds.length > 0) {
          targetNodeId = currentNode.childrenIds[0];
        }
        break;

      case 'ArrowLeft':
        // 跳到上一个兄弟节点
        e.preventDefault();
        if (currentNode.parentId) {
          const parentNode = session.nodes[currentNode.parentId];
          if (parentNode && parentNode.childrenIds.length > 1) {
            const currentIndex = parentNode.childrenIds.indexOf(session.currentNodeId!);
            if (currentIndex > 0) {
              targetNodeId = parentNode.childrenIds[currentIndex - 1];
            }
          }
        }
        break;

      case 'ArrowRight':
        // 跳到下一个兄弟节点
        e.preventDefault();
        if (currentNode.parentId) {
          const parentNode = session.nodes[currentNode.parentId];
          if (parentNode && parentNode.childrenIds.length > 1) {
            const currentIndex = parentNode.childrenIds.indexOf(session.currentNodeId!);
            if (currentIndex < parentNode.childrenIds.length - 1) {
              targetNodeId = parentNode.childrenIds[currentIndex + 1];
            }
          }
        }
        break;

      case 'c':
      case 'C':
        // 切换当前节点的展开/收缩状态
        e.preventDefault();
        if (currentNode.marker) {
          toggleNodeCollapse(session.currentNodeId);
        }
        break;

      case 'Delete':
        // 删除当前节点（及其子节点）
        e.preventDefault();
        // 不能删除根节点
        if (currentNode.parentId) {
          deleteNode(session.currentNodeId);
        }
        break;
    }

    if (targetNodeId && session.nodes[targetNodeId]) {
      focusNode(targetNodeId);
    }
  }, [session, focusNode, toggleNodeCollapse, deleteNode, isSelectingMode, exitSelectingMode]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-[#fafafa] canvas-texture">
        <div className="max-w-md text-center px-6">
          {/* 图标 */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-leaf-50 flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-leaf-400">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>

          {/* 标题 */}
          <h3 className="text-xl font-semibold text-gray-800 mb-2">
            选择或创建一个对话文件
          </h3>

          {/* 描述 */}
          <p className="text-gray-500 mb-6 leading-relaxed">
            从侧边栏选择已有对话文件，或前往文件管理页面创建新的对话树。
          </p>

          {/* 操作提示 */}
          <div className="flex flex-col items-center gap-2 text-sm text-gray-400">
            <span className="flex items-center gap-2">
              <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">侧边栏</span>
              <span>选择对话文件开始</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">点击 Logo</span>
              <span>进入文件管理</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full relative bg-[#fafafa] overflow-hidden canvas-texture" data-tour="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          if (isSelectingMode) return;
          // 只允许点击非高亮的 AI/System 节点
          const nodeData = node.data as { isActive?: boolean; node?: { role?: string } };
          if (nodeData && !nodeData.isActive && nodeData.node?.role !== 'user') {
            focusNode(node.id);
          }
        }}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={false} // 禁止节点拖拽，因为位置由自动布局决定
        nodesConnectable={false} // 禁止手动连线
        elementsSelectable={false} // 禁止点击选中节点，避免干扰文本选择
        // 注意：这里刻意不开 onlyRenderVisibleElements（视口剔除）。
        // 节点高度是内容自适应的，未挂载的节点测不到高度，布局会算错并出现跳动。
        // 「未挂载就不渲染」与「按真实内容高度布局」二者只能取其一。
        panOnScroll={true} // 允许使用鼠标滚轮平移画布
        panOnDrag={[1, 2]} // 只允许中键(1)和右键(2)拖动画布，左键用于文本选择
        selectionOnDrag={false} // 禁用框选
        zoomOnScroll={false} // 禁用滚轮缩放
        zoomOnDoubleClick={false} // 禁用双击缩放
        fitView
        minZoom={0.1}
        // 必须高于 FOCUS_ZOOM，否则聚焦按钮的放大倍数会被这里钳制
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        {/* 点阵背景已移除，原因见上方 import 处的注释 */}
        <Controls className="bg-white shadow-md border-gray-200 rounded-lg overflow-hidden" showInteractive={false} />
      </ReactFlow>
      
      <button
        onClick={handleFocusLatestNode}
        title="Focus on active node"
        className="absolute bottom-32 right-8 p-3 bg-white text-gray-500 hover:text-leaf-600 hover:bg-gray-50 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.1)] border border-gray-200 rounded-full transition-all hover:scale-105 z-10 flex items-center justify-center"
      >
        <Focus size={20} />
      </button>

      {/* 节点总结入口 */}
      {isSelectingMode ? (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-leaf-50 border border-leaf-100 text-sm text-leaf-700 shadow-sm pointer-events-none">
            <span>点击节点多选</span>
            <span className="text-leaf-300">|</span>
            <span>已选 {selectedNodeIds.length} 个</span>
            <span className="text-leaf-300">|</span>
            <span>ESC 退出</span>
          </div>
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              onClick={exitSelectingMode}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 bg-white rounded-full border border-gray-200 shadow-sm transition-colors"
            >
              <X size={14} />
              取消
            </button>
            <button
              onClick={handleGenerateSummary}
              disabled={selectedNodeIds.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-full shadow-sm transition-colors bg-leaf-600 hover:bg-leaf-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <Sparkles size={14} />
              生成总结{selectedNodeIds.length > 0 ? ` (${selectedNodeIds.length})` : ''}
            </button>
          </div>
        </>
      ) : (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button
            onClick={() => setShowGlobalPrompt(true)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm rounded-full border shadow-sm transition-colors',
              hasGlobalPrompt
                ? 'bg-leaf-50 text-leaf-700 border-leaf-200'
                : 'bg-white text-gray-600 border-gray-200 hover:text-leaf-600 hover:bg-leaf-50'
            )}
            title="编辑会话背景约束"
          >
            <BookOpen size={14} />
            会话背景
            {hasGlobalPrompt && <span className="w-1.5 h-1.5 rounded-full bg-leaf-500" />}
          </button>
          <button
            onClick={enterSelectingMode}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:text-leaf-600 bg-white hover:bg-leaf-50 rounded-full border border-gray-200 shadow-sm transition-colors"
            title="选择多个节点进行知识总结"
          >
            <Sparkles size={14} />
            节点总结
          </button>
        </div>
      )}

      {summaryNodes && (
        <SummaryModal
          nodes={summaryNodes}
          onClose={() => setSummaryNodes(null)}
        />
      )}

      {showGlobalPrompt && (
        <GlobalPromptModal
          sessionId={session.id}
          onClose={() => setShowGlobalPrompt(false)}
        />
      )}
    </div>
  );
}