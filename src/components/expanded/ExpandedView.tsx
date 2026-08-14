/**
 * 展开视图 - 线性链路编辑
 *
 * 功能：
 * 1. 从根节点到当前叶子节点的单链路显示
 * 2. 支持编辑节点内容
 * 3. 复用主画布的输入框
 */

import { useMemo, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Minimize2, Loader2, Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { PrunusNode, AIChatNode } from '../../types';
import { isAIChatNode } from '../../types';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore } from '../../store/uiStore';
import { useGenerationStore } from '../../store/generationStore';
import { cn } from '../../utils/cn';
import FormatToolbar, { FormatSubMenu } from '../chat/FormatToolbar';
import { isBold, isItalic, isUnderline, isStrikethrough, hasBackgroundColor, hasTextColor } from '../../utils/richtext';

const preprocessMarkdown = (text: string): string => {
  return text
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'");
};

export default function ExpandedView() {
  const expandedNodeId = useUIStore(state => state.expandedNodeId);
  const exitExpandedView = useUIStore(state => state.exitExpandedView);
  const activeSessionId = useSessionStore(state => state.activeSessionId);
  const sessions = useSessionStore(state => state.sessions);
  const editingNodeId = useUIStore(state => state.editingNodeId);
  const streamingNodeId = useGenerationStore(state => state.generatingNodeId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const session = activeSessionId ? sessions[activeSessionId] : null;

  // 编辑模式状态
  const [activeSubMenu, setActiveSubMenu] = useState<'text' | 'color' | 'highlight' | null>(null);
  const [autoOpenMenu, setAutoOpenMenu] = useState<'text' | 'color' | 'highlight' | null>(null);

  // 收集单链路节点（从根到当前叶子节点）
  const chainNodes = useMemo(() => {
    if (!session || !expandedNodeId) return [];

    const chain: PrunusNode[] = [];
    let current: PrunusNode | undefined = session.nodes[expandedNodeId];

    // 从叶子节点向上遍历到根节点
    while (current) {
      chain.unshift(current);
      current = current.parentId ? session.nodes[current.parentId] : undefined;
    }

    return chain;
  }, [session, expandedNodeId]);

  // ESC 键退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 如果在编辑模式，先退出编辑
        if (editingNodeId) {
          useUIStore.getState().setEditingNode(null);
        } else {
          exitExpandedView();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitExpandedView, editingNodeId]);

  // 编辑模式下，自动检测选区格式
  useEffect(() => {
    if (!editingNodeId) {
      setAutoOpenMenu(null);
      return;
    }

    const checkSelectionFormat = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setAutoOpenMenu(null);
        return;
      }

      const hasBoldFormat = isBold();
      const hasItalicFormat = isItalic();
      const hasUnderlineFormat = isUnderline();
      const hasStrikethroughFormat = isStrikethrough();
      const hasBgColor = hasBackgroundColor();
      const hasFgColor = hasTextColor();

      if (hasBoldFormat || hasItalicFormat || hasUnderlineFormat || hasStrikethroughFormat) {
        setAutoOpenMenu('text');
      } else if (hasBgColor) {
        setAutoOpenMenu('highlight');
      } else if (hasFgColor) {
        setAutoOpenMenu('color');
      } else {
        setAutoOpenMenu(null);
      }
    };

    document.addEventListener('selectionchange', checkSelectionFormat);
    return () => document.removeEventListener('selectionchange', checkSelectionFormat);
  }, [editingNodeId]);

  // 自动滚动到底部（当开始生成新内容时）
  useEffect(() => {
    if (streamingNodeId && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [streamingNodeId]);

  // 如果没有展开的节点，不渲染
  if (!expandedNodeId || !session) return null;

  const isEditing = !!editingNodeId;

  return (
    <div className="h-full w-full bg-[#fafafa] canvas-texture flex flex-col" data-tour="expanded-view">
      {/* 顶部工具栏 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white border-b border-gray-200 shadow-sm"
      >
        {/* 主工具栏 */}
        <div className="h-12 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-gray-800">链路编辑</span>
            <span className="text-sm text-gray-500">
              {chainNodes.length} 个节点
            </span>
          </div>
          <button
            onClick={exitExpandedView}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
            title="返回画布 (ESC)"
            data-tour="exit-expanded-btn"
          >
            <Minimize2 size={16} />
            <span className="text-xs">返回画布</span>
          </button>
        </div>

        {/* 编辑模式下的格式工具栏 */}
        {isEditing && activeSubMenu && (
          <FormatSubMenu menuType={activeSubMenu} onClose={() => setActiveSubMenu(null)} />
        )}
      </motion.div>

      {/* 时间线内容区域 - 底部留出输入框空间 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 pb-32" ref={scrollRef}>
        <div className="max-w-5xl mx-auto space-y-4">
          {chainNodes.map((node, index) => (
            <TimelineNode
              key={node.id}
              node={node}
              isLast={index === chainNodes.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 时间线节点组件
 */
interface TimelineNodeProps {
  node: PrunusNode;
  isLast: boolean;
}

function TimelineNode({ node, isLast }: TimelineNodeProps) {
  const editRef = useRef<HTMLDivElement>(null);
  const updateNodeContent = useSessionStore(state => state.updateNodeContent);
  const editingNodeId = useUIStore(state => state.editingNodeId);
  const setEditingNode = useUIStore(state => state.setEditingNode);

  // 流式内容相关
  const streamingContent = useGenerationStore(state => state.streamingContent);
  const streamingReasoning = useGenerationStore(state => state.streamingReasoning);
  const streamingNodeId = useGenerationStore(state => state.generatingNodeId);
  const isReasoning = useGenerationStore(state => state.isReasoning);

  const isAIChat = isAIChatNode(node);
  const role = isAIChat ? node.role : null;
  const isUser = role === 'user';

  // 是否处于编辑模式
  const isEditing = editingNodeId === node.id;

  // 判断当前节点是否正在流式生成
  const isStreaming = isAIChat && role === 'assistant' && streamingNodeId === node.id;

  // Reasoning 相关
  const [reasoningExpanded, setReasoningExpanded] = useState(true);
  const nodeReasoning = isAIChat ? (node as AIChatNode).reasoning : undefined;
  const displayReasoning = isStreaming ? streamingReasoning : nodeReasoning;

  // 显示内容：优先流式内容，再节点内容
  const displayContent = (isStreaming && streamingContent.length > 0) ? streamingContent : node.content;

  // 双击进入编辑模式
  const handleDoubleClick = () => {
    if (!isStreaming) {
      setEditingNode(node.id);
    }
  };

  // 失焦保存
  const handleBlur = () => {
    if (editRef.current) {
      const newContent = editRef.current.innerHTML;
      if (newContent !== node.content) {
        updateNodeContent(node.id, newContent);
      }
    }
    setEditingNode(null);
  };

  return (
    <div className="space-y-2">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: isLast ? 0 : 0.1 }}
        className={cn(
          "flex",
          isUser ? "justify-end" : "justify-start"
        )}
      >
        {/* 消息卡片 */}
        <div
          onDoubleClick={handleDoubleClick}
          className={cn(
            "rounded-2xl p-4 shadow-sm transition-all max-w-[95%]",
            isUser
              ? "bg-leaf-50 text-gray-900"
              : "bg-white border border-gray-200 text-gray-900",
            isLast && !isUser && "border-leaf-400 ring-2 ring-leaf-100",
            isLast && isUser && "ring-2 ring-green-300",
            isEditing && "ring-2 ring-blue-300"
          )}
        >
          {/* 流式生成状态提示 */}
          {isStreaming && (
            <div className="flex items-center gap-2 mb-2">
              {isReasoning ? (
                <>
                  <Loader2 size={12} className="animate-spin text-amber-600" />
                  <span className="text-[10px] font-medium text-amber-600">思考中...</span>
                </>
              ) : (
                <>
                  <Loader2 size={12} className="animate-spin text-leaf-600" />
                  <span className="text-[10px] font-medium text-leaf-600">生成中...</span>
                </>
              )}
            </div>
          )}

          {/* Reasoning 内容 - 思考过程 */}
          {displayReasoning && displayReasoning.length > 0 && !isEditing && (
            <div className="mb-3 border-l-2 border-amber-300 bg-amber-50/50 rounded-r-lg overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-amber-100/50 transition-colors"
                onClick={() => setReasoningExpanded(!reasoningExpanded)}
              >
                {isStreaming && isReasoning ? (
                  <Loader2 size={12} className="animate-spin text-amber-600" />
                ) : (
                  <Lightbulb size={12} className="text-amber-600" />
                )}
                <span className="text-xs font-medium text-amber-700">
                  {isStreaming ? '思考中...' : '思考过程'}
                </span>
                <span className="ml-auto">
                  {reasoningExpanded ? (
                    <ChevronDown size={14} className="text-amber-500" />
                  ) : (
                    <ChevronRight size={14} className="text-amber-500" />
                  )}
                </span>
              </div>
              {reasoningExpanded && (
                <div className="px-3 py-2 text-xs text-gray-600 leading-relaxed border-t border-amber-200/50">
                  <div className="prose prose-xs max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                    >
                      {preprocessMarkdown(displayReasoning || '')}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 主内容区域 */}
          <div
            ref={editRef}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.currentTarget.blur();
              }
              if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.stopPropagation();
              }
            }}
            className={cn(
              "prose prose-sm max-w-none leading-relaxed",
              isEditing ? "cursor-text outline-none ring-2 ring-blue-400 rounded-lg p-2 -m-2" : "cursor-default"
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
            >
              {preprocessMarkdown(displayContent)}
            </ReactMarkdown>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

