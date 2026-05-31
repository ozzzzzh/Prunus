import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { Bot, User, Cpu, SplitSquareHorizontal, Loader2, Tag, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PrunusNode, AIChatNode } from '../../types';
import { isAIChatNode } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { cn } from '../../utils/cn';
import { smartParseBranchesFromContent } from '../../utils/aiParser';
import { useState, useRef, useEffect } from 'react';

// 预处理 markdown 文本，修复中文引号与加粗/斜体语法混用的问题
const preprocessMarkdown = (text: string): string => {
  // 将中文引号转换为英文引号，让 markdown 解析器正确处理加粗/斜体
  return text
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'");
};

// 可用的标记选项
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
  const generatingNodeId = useChatStore((state) => state.generatingNodeId);
  const [isSplitting, setIsSplitting] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 使用原生事件在捕获阶段处理滚轮事件
  useEffect(() => {
    // 只有展开状态才需要处理滚轮
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

  // 使用类型守卫判断节点类型
  const isAIChat = isAIChatNode(node);
  const role = isAIChat ? node.role : null;
  const isUser = role === 'user';
  const isSystem = role === 'system';

  // 只有 AI 或 System 节点，且不是当前高亮节点时，才允许被点击聚焦
  const isClickable = !isActive && !isUser;

  // 检查是否可以手动裂变：必须是 AI 回复，且当前节点还没有被拆分过
  const canSplit = isAIChat && role === 'assistant' && node.childrenIds.length === 0 && !isSplitting;

  // 判断当前节点是否正在等待 AI 回复
  const isWaitingForAI = isUser && generatingNodeId === node.id;

  // 获取缩略信息（前50个字符）
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

  const handleMarkerSelect = (emoji: string | undefined) => {
    setNodeMarker(node.id, emoji);
    setShowToolbar(false);
  };

  const handleCollapseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeCollapse(node.id);
  };

  // 收缩状态：显示一个 emoji 圆形，带悬浮提示
  if (node.collapsed && node.marker) {
    return (
      <div className="w-[480px] h-[56px] flex items-center justify-center">
        <div className="relative">
          <div
            onClick={handleCollapseClick}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="w-14 h-14 rounded-full bg-white shadow-lg border-2 border-gray-200 flex items-center justify-center cursor-pointer hover:scale-110 hover:border-leaf-300 transition-transform duration-200"
            title="Click to expand"
          >
            <span className="text-2xl">{node.marker}</span>
          </div>

          {/* 悬浮提示 */}
          {showTooltip && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-gray-900 text-white text-xs rounded-lg px-4 py-2.5 shadow-lg w-64">
              <div className="font-medium mb-1">{node.marker} {node.role}</div>
              <div className="text-gray-300 text-[11px] leading-relaxed">{getSummary()}</div>
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
            </div>
          )}
        </div>

        {/* Handle 定位在容器顶部和底部中心 */}
        <Handle type="target" position={Position.Top} className="!top-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!bottom-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
      </div>
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
        className={cn(
          "w-[480px] rounded-2xl border p-4 transition-all duration-300 relative origin-top",
          isActive
            ? "border-leaf-400 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] z-20"
            : "border-gray-200 bg-white/80 opacity-60 shadow-sm z-0",
          isClickable && "hover:opacity-100 cursor-pointer hover:border-leaf-300 hover:bg-white hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] hover:z-10"
        )}
      >
        {/* 标记气泡 - 点击可收缩 */}
        {node.marker && (
          <div
            onClick={handleCollapseClick}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-lg z-10 cursor-pointer hover:scale-110 hover:shadow-lg transition-transform duration-200"
            title="Click to collapse"
          >
            {node.marker}
          </div>
        )}

        <Handle type="target" position={Position.Top} className="w-2 h-2 opacity-0" />

        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 pointer-events-none">
            <div className={cn(
              "p-1.5 rounded-lg flex items-center justify-center",
              isUser ? "bg-leaf-100 text-leaf-700" : isSystem ? "bg-gray-100 text-gray-600" : "bg-blossom-light text-leaf-700"
            )}>
              {isUser ? <User size={14} /> : isSystem ? <Cpu size={14} /> : <Bot size={14} />}
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {node.role}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isWaitingForAI && (
              <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md" title="AI is thinking...">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[10px] font-medium">Generating...</span>
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

            {/* 标记按钮 */}
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

        <div
          ref={contentRef}
          className="text-sm text-gray-900 leading-relaxed max-h-[300px] overflow-y-auto pr-1 custom-scrollbar"
        >
          <div className="prose prose-sm w-full max-w-none break-words pointer-events-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {preprocessMarkdown(node.content)}
            </ReactMarkdown>
          </div>
        </div>

        <Handle type="source" position={Position.Bottom} className="w-2 h-2 opacity-0" />
      </div>

      {/* NodeToolbar 标记选择 */}
      <NodeToolbar
        isVisible={showToolbar}
        position={Position.Top}
        offset={8}
        className="bg-white rounded-xl shadow-lg border border-gray-200 p-2 flex gap-1"
      >
        {MARKER_OPTIONS.map((option) => (
          <button
            key={option.emoji}
            onClick={() => handleMarkerSelect(option.emoji)}
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
        {/* 清除标记 */}
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
    </>
  );
}
