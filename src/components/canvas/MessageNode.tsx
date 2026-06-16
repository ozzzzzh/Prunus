import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { Bot, User, Cpu, SplitSquareHorizontal, Loader2, Tag, X, Brain, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PrunusNode, NodeMarker } from '../../types';
import { isAIChatNode } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { useGenerationStore } from '../../store/generationStore';
import { cn } from '../../utils/cn';
import { smartParseBranchesFromContent } from '../../utils/aiParser';
import { useState, useRef, useEffect } from 'react';

const preprocessMarkdown = (text: string): string => {
  return text
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'");
};

const MARKER_OPTIONS = [
  { emoji: '🍃', label: 'Leaf' },
  { emoji: '🍑', label: 'Peach' },
  { emoji: '🪵', label: 'Trunk' },
  { emoji: '🌱', label: 'Seed' },
];

interface MessageNodeProps {
  data: {
    node: PrunusNode;
    isActive: boolean;
  };
}

export default function MessageNode({ data }: MessageNodeProps) {
  const { node, isActive } = data;
  const focusNode = useChatStore((state) => state.focusNode);
  const splitNodeIntoBranches = useChatStore((state) => state.splitNodeIntoBranches);
  const setNodeMarker = useChatStore((state) => state.setNodeMarker);
  const toggleNodeCollapse = useChatStore((state) => state.toggleNodeCollapse);
  const deleteNode = useSessionStore((state) => state.deleteNode);
  const [isSplitting, setIsSplitting] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const prevCollapsedRef = useRef(node.collapsed);

  // 从展开变成收缩时，自动显示 tooltip
  useEffect(() => {
    if (!prevCollapsedRef.current && node.collapsed && node.marker) {
      setShowTooltip(true);
    }
    prevCollapsedRef.current = node.collapsed;
  }, [node.collapsed, node.marker]);

  // 流式内容
  const streamingContent = useGenerationStore((state) => state.streamingContent);
  const streamingNodeId = useGenerationStore((state) => state.generatingNodeId);
  const isReasoning = useGenerationStore((state) => state.isReasoning);

  useEffect(() => {
    if (node.collapsed) return;
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const handleWheelCapture = (e: WheelEvent) => {
      const target = contentEl;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const hasScrollbar = scrollHeight > clientHeight;

      if (hasScrollbar) {
        const atTop = scrollTop === 0;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
        const scrollingUp = e.deltaY < 0;
        const scrollingDown = e.deltaY > 0;

        if (!((scrollingUp && atTop) || (scrollingDown && atBottom))) {
          e.stopPropagation();
        }
      }
    };

    contentEl.addEventListener('wheel', handleWheelCapture, { capture: true });
    return () => contentEl.removeEventListener('wheel', handleWheelCapture, { capture: true });
  }, [node.collapsed]);

  const isAIChat = isAIChatNode(node);
  const role = isAIChat ? node.role : null;
  const isUser = role === 'user';
  const isSystem = role === 'system';

  const isClickable = !isActive && !isUser;
  const canSplit = isAIChat && role === 'assistant' && node.childrenIds.length === 0 && !isSplitting;

  // 判断当前节点是否正在流式生成
  const isStreaming = isAIChat && role === 'assistant' && streamingNodeId === node.id;

  // 获取显示内容：如果正在流式且内容不为空，用流式内容；否则用节点内容
  const displayContent = (isStreaming && streamingContent.length > 0) ? streamingContent : node.content;

  // 获取缩略信息
  const getSummary = () => {
    const text = node.content.replace(/[#*`_\[\]]/g, '').trim();
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  };

  const handleSplit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSplitting(true);
    try {
      const { outline, branches } = await smartParseBranchesFromContent(node.content);
      if (branches.length > 0) {
        splitNodeIntoBranches(node.id, outline, branches);
      } else {
        alert("The AI couldn't find a clear way to split this message into multiple distinct branches.");
      }
    } catch (error) {
      console.error("Failed to split:", error);
      alert("Failed to split the message. Please check your API connection.");
    } finally {
      setIsSplitting(false);
    }
  };

  const handleMarkerSelect = (emoji: NodeMarker | undefined) => {
    setNodeMarker(node.id, emoji);
    setShowToolbar(false);
  };

  const handleCollapseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeCollapse(node.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleDelete = () => {
    // 不能删除根节点
    if (node.parentId) {
      deleteNode(node.id);
    }
    setShowContextMenu(false);
  };

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClick = () => setShowContextMenu(false);
    if (showContextMenu) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [showContextMenu]);

  // 收缩状态：用 NodeToolbar 显示 tooltip，避免被连接线遮挡
  if (node.collapsed && node.marker) {
    return (
      <>
        <div
          className="w-[480px] h-[56px] flex items-center justify-center"
          onContextMenu={handleContextMenu}
        >
          <div
            onClick={handleCollapseClick}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className={cn(
              "w-14 h-14 rounded-full bg-white shadow-lg border-2 flex items-center justify-center cursor-pointer transition-transform duration-200",
              isActive
                ? "scale-110 border-leaf-400 shadow-xl"
                : "border-gray-200 hover:scale-110 hover:border-leaf-300"
            )}
            title="Click to expand"
          >
            <span className="text-2xl">{node.marker}</span>
          </div>

          <Handle type="target" position={Position.Top} className="!top-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
          <Handle type="source" position={Position.Bottom} className="!bottom-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
        </div>

        {/* 使用 NodeToolbar 渲染 tooltip，在最顶层显示 */}
        <NodeToolbar
          isVisible={showTooltip}
          position={Position.Bottom}
          offset={8}
          className="!bg-gray-900 text-white text-xs rounded-lg px-4 py-2.5 shadow-lg w-64"
        >
          <div className="font-medium mb-1">{node.marker} {role}</div>
          <div className="text-gray-300 text-[11px] leading-relaxed">{getSummary()}</div>
        </NodeToolbar>

        {/* 右键菜单 */}
        {showContextMenu && node.parentId && (
          <div
            className="fixed z-[1000] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div
        onClick={() => {
          if (isClickable) {
            focusNode(node.id);
          }
        }}
        onContextMenu={handleContextMenu}
        className={cn(
          "w-[480px] rounded-2xl border p-4 transition-all duration-300 relative origin-top",
          isActive
            ? "border-leaf-400 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] z-20"
            : "border-gray-200 bg-white/80 opacity-60 shadow-sm z-0",
          isClickable && "hover:opacity-100 cursor-pointer hover:border-leaf-300 hover:bg-white hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] hover:z-10"
        )}
      >
        {node.marker && (
          <div
            onClick={handleCollapseClick}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-lg z-10 cursor-pointer hover:scale-110 hover:shadow-lg transition-transform duration-200"
            title="Click to collapse"
          >
            {node.marker}
          </div>
        )}

        <Handle type="target" position={Position.Top} className="!top-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />

        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 pointer-events-none">
            <div className={cn(
              "p-1.5 rounded-lg flex items-center justify-center",
              isUser ? "bg-leaf-100 text-leaf-700" : isSystem ? "bg-gray-100 text-gray-600" : "bg-blossom-light text-leaf-700"
            )}>
              {isUser ? <User size={14} /> : isSystem ? <Cpu size={14} /> : <Bot size={14} />}
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {role}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 正在思考图标 */}
            {isStreaming && isReasoning && (
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md" title="Model is thinking...">
                <Brain size={12} className="animate-pulse" />
                <span className="text-[10px] font-medium">Thinking...</span>
              </div>
            )}

            {/* 正在生成内容 */}
            {isStreaming && !isReasoning && (
              <div className="flex items-center gap-1 text-leaf-600 bg-leaf-50 px-2 py-0.5 rounded-md">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[10px] font-medium">Streaming...</span>
              </div>
            )}

            {isSplitting && (
              <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[10px] font-medium">Splitting...</span>
              </div>
            )}

            {canSplit && isActive && !isSplitting && (
              <button
                onClick={handleSplit}
                title="Split into multiple branches"
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
              >
                <SplitSquareHorizontal size={14} />
                <span className="text-[10px] font-medium">Branch Out</span>
              </button>
            )}

            {isActive && !isUser && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowToolbar(!showToolbar);
                }}
                title="Add marker"
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  showToolbar ? "bg-leaf-100 text-leaf-600" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                )}
              >
                <Tag size={14} />
              </button>
            )}

            {isActive && (
              <span className="text-[10px] font-medium text-leaf-600 bg-leaf-50 px-2 py-0.5 rounded-full pointer-events-none">
                Active
              </span>
            )}
          </div>
        </div>

        {/* 主内容 */}
        <div
          ref={contentRef}
          className="text-sm text-gray-900 leading-relaxed max-h-[300px] overflow-y-auto pr-1 custom-scrollbar"
        >
          <div className="prose prose-sm w-full max-w-none break-words pointer-events-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {preprocessMarkdown(displayContent)}
            </ReactMarkdown>
          </div>
        </div>

        <Handle type="source" position={Position.Bottom} className="!bottom-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
      </div>

      <NodeToolbar
        isVisible={showToolbar}
        position={Position.Top}
        offset={8}
        className="bg-white rounded-xl shadow-lg border border-gray-200 p-2 flex gap-1"
      >
        {MARKER_OPTIONS.map((option) => (
          <button
            key={option.emoji}
            onClick={() => handleMarkerSelect(option.emoji as NodeMarker)}
            title={option.label}
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-colors",
              node.marker === option.emoji
                ? "bg-leaf-100 ring-2 ring-leaf-400"
                : "hover:bg-gray-100"
            )}
          >
            {option.emoji}
          </button>
        ))}
        {node.marker && (
          <button
            onClick={() => handleMarkerSelect(undefined)}
            title="Remove marker"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </NodeToolbar>

      {/* 右键菜单 */}
      {showContextMenu && node.parentId && (
        <div
          className="fixed z-[1000] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </>
  );
}
