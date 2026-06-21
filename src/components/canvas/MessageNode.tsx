import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { Bot, User, Cpu, SplitSquareHorizontal, Loader2, Tag, X, Brain, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { PrunusNode, NodeMarker } from '../../types';
import { isAIChatNode } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import { smartParseBranchesFromContent } from '../../utils/aiParser';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { handlePasteAsPlainText, markdownToHtml } from '../../utils/richtext';

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
  const updateNodeContent = useSessionStore((state) => state.updateNodeContent);
  const editingNodeId = useUIStore((state) => state.editingNodeId);
  const setEditingNode = useUIStore((state) => state.setEditingNode);
  const [isSplitting, setIsSplitting] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  // 临时存储编辑后的内容，用于退出编辑模式时避免闪烁
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const prevCollapsedRef = useRef(node.collapsed);

  // 是否处于编辑模式
  const isEditing = editingNodeId === node.id;

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

  // 获取显示内容：优先使用临时内容（避免退出编辑模式时闪烁），然后是流式内容，最后是节点内容
  const displayContent = pendingContent || ((isStreaming && streamingContent.length > 0) ? streamingContent : node.content);

  // 当节点内容更新后，清除临时内容
  useEffect(() => {
    if (pendingContent && node.content === pendingContent) {
      setPendingContent(null);
    }
  }, [node.content, pendingContent]);

  // 获取缩略信息（剥离 HTML 标签和 markdown 符号）
  const getSummary = () => {
    // 先剥离 HTML 标签
    const textWithoutHtml = node.content.replace(/<[^>]*>/g, '');
    // 再移除 markdown 符号
    const text = textWithoutHtml.replace(/[#*`_\[\]]/g, '').trim();
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

  // 防止重复保存的标记
  const isSavingRef = useRef(false);
  // 记录编辑前的内容
  const originalContentRef = useRef<string>('');
  // 编辑器内容状态（用于 React 控制渲染）
  const [editorContent, setEditorContent] = useState<string>('');
  // 标记编辑器是否已完成初始化
  const isInitializedRef = useRef(false);

  // 进入编辑模式
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isStreaming) {
      // 重置所有标记
      isSavingRef.current = false;
      // 记录编辑前的内容
      originalContentRef.current = node.content;
      // 重置初始化标记
      isInitializedRef.current = false;
      // 直接设置编辑器内容（同步，不依赖 useEffect）
      const isHtml = node.content.includes('<') && node.content.includes('>');
      if (isHtml) {
        setEditorContent(node.content);
        isInitializedRef.current = true;
      } else {
        // 如果不是 HTML，异步转换
        markdownToHtml(node.content).then((html) => {
          // 只有当仍然处于编辑模式时才设置内容
          if (useUIStore.getState().editingNodeId === node.id) {
            setEditorContent(html);
            isInitializedRef.current = true;
          }
        });
      }
      setEditingNode(node.id);
    }
  };

  // 当退出编辑模式时，清空编辑器内容状态
  useEffect(() => {
    if (!isEditing) {
      setEditorContent('');
      isInitializedRef.current = false;
    }
  }, [isEditing]);

  // 当编辑器内容设置完成后，聚焦并将光标移动到末尾
  useEffect(() => {
    if (isEditing && editorContent && editRef.current) {
      // 使用 setTimeout 确保 DOM 更新完成
      setTimeout(() => {
        if (editRef.current && isEditing) {
          editRef.current.focus();
          // 将光标移动到末尾
          const range = document.createRange();
          const selection = window.getSelection();
          if (selection && editRef.current.childNodes.length > 0) {
            range.selectNodeContents(editRef.current);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }, 0);
    }
  }, [isEditing, editorContent]);

  // 退出编辑模式并保存内容
  const handleEditBlur = (e: React.FocusEvent) => {
    // 防止事件冒泡
    e.stopPropagation();
    e.preventDefault();

    // 如果编辑器还没初始化完成，直接退出
    if (!isInitializedRef.current) {
      setEditingNode(null);
      return;
    }

    // 防止重复保存
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    if (editRef.current) {
      const newContent = editRef.current.innerHTML;
      // 先设置临时内容，避免退出编辑模式时闪烁
      setPendingContent(newContent);
      // 只有内容真正改变时才更新
      if (newContent !== originalContentRef.current) {
        updateNodeContent(node.id, newContent);
      }
    }
    setEditingNode(null);
  };

  // 处理编辑器粘贴事件 - 使用浏览器默认行为，只确保粘贴纯文本
  const handleEditPaste = (e: React.ClipboardEvent) => {
    // 不阻止默认行为，让浏览器处理粘贴
    // 但如果需要纯文本粘贴，可以取消下面代码的注释
    /*
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text && editRef.current) {
      // 使用 execCommand 作为备选方案
      document.execCommand('insertText', false, text);
    }
    */
  };

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

        {/* 右键菜单 - 使用 Portal 渲染到 body */}
        {showContextMenu && node.parentId && createPortal(
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
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <>
      <div
        onClick={(e) => {
          if (isEditing) {
            e.stopPropagation();
            return;
          }
          if (isClickable) {
            focusNode(node.id);
          }
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          "w-[480px] rounded-2xl border p-4 transition-all duration-300 relative origin-top",
          isEditing && "editing-mode",
          isEditing
            ? "border-leaf-500 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)] z-30 ring-2 ring-leaf-200"
            : isActive
              ? "border-leaf-400 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] z-20"
              : "border-gray-200 bg-white/80 opacity-60 shadow-sm z-0",
          !isEditing && isClickable && "hover:opacity-100 cursor-pointer hover:border-leaf-300 hover:bg-white hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] hover:z-10"
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

            {isEditing && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full pointer-events-none">
                Editing
              </span>
            )}

            {!isEditing && isActive && (
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
          onDoubleClick={handleDoubleClick}
        >
          {isEditing ? (
            <div
              ref={editRef}
              contentEditable
              onBlur={handleEditBlur}
              onPaste={handleEditPaste}
              onKeyDown={(e) => {
                // 阻止方向键冒泡（避免触发节点导航）
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                  e.stopPropagation();
                }
                // 对于 Ctrl/Cmd 组合键（如 Ctrl+V），确保不冒泡
                if (e.ctrlKey || e.metaKey) {
                  e.stopPropagation();
                }
              }}
              className="outline-none min-h-[60px] w-full max-w-none break-words prose prose-sm"
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: editorContent }}
            />
          ) : (
            <div className="prose prose-sm w-full max-w-none break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {preprocessMarkdown(displayContent)}
              </ReactMarkdown>
            </div>
          )}
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

      {/* 右键菜单 - 使用 Portal 渲染到 body */}
      {showContextMenu && node.parentId && createPortal(
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
        </div>,
        document.body
      )}
    </>
  );
}
