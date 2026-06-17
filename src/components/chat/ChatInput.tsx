import { useState, useRef, useEffect } from 'react';
import { Send, CornerDownLeft, Loader2, MessageSquare } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useGenerationStore } from '../../store/generationStore';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore } from '../../store/uiStore';
import type { AIRole } from '../../types';
import { isAIChatNode } from '../../types';
import { generateAIResponse } from '../../utils/llmApi';
import FormatToolbar, { FormatSubMenu } from './FormatToolbar';
import { isBold, isItalic, isUnderline, isStrikethrough, hasBackgroundColor, hasTextColor } from '../../utils/richtext';

export default function ChatInput() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<'text' | 'color' | 'highlight' | null>(null);
  const isComposing = useRef(false);
  const addMessage = useChatStore(state => state.addMessage);
  const setGeneratingNodeId = useChatStore(state => state.setGeneratingNodeId);
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const sessions = useChatStore(state => state.sessions);
  const editingNodeId = useUIStore(state => state.editingNodeId);

  const session = activeSessionId ? sessions[activeSessionId] : null;
  const activeNode = session && session.currentNodeId ? session.nodes[session.currentNodeId] : null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeSessionId || isLoading) return;

    const messageContent = input.trim();
    setInput('');

    const userNodeId = addMessage('user', messageContent);
    setIsLoading(true);
    setGeneratingNodeId(userNodeId);

    try {
      const latestState = useChatStore.getState();
      const currentSession = latestState.sessions[activeSessionId];

      const history: { role: AIRole, content: string }[] = [];
      let currId: string | null = userNodeId || currentSession.currentNodeId;

      while (currId && currentSession.nodes[currId]) {
        const node = currentSession.nodes[currId];
        if (node.content && isAIChatNode(node) && node.role !== 'system') {
          history.unshift({ role: node.role, content: node.content });
        }
        currId = node.parentId;
      }

      history.unshift({
        role: 'system',
        content: 'You are a helpful AI assistant. Provide structured, clear, and concise answers.'
      });

      // 先创建空的 assistant 节点
      const aiNodeId = useSessionStore.getState().addMessage('assistant', '', userNodeId);

      // 用 generationStore 暂存流式内容
      const genStore = useGenerationStore.getState();
      genStore.setGeneratingNodeId(aiNodeId);

      await generateAIResponse(history, (chunk) => {
        // 检测是否在 reasoning（有 reasoning_content 但 content 为空）
        const isReasoning = chunk.reasoning && chunk.reasoning.length > 0 && !chunk.content;
        genStore.setIsReasoning(isReasoning);
        genStore.appendStreamingContent(chunk.content);
      });

      // 流结束后一次性写入 sessionStore
      // 注意：要用 getState() 获取最新状态，不能用之前的快照
      const finalContent = useGenerationStore.getState().streamingContent;
      useSessionStore.getState().updateNodeContent(aiNodeId, finalContent);

      // 延迟 reset，确保 React 渲染完成后再清空
      setTimeout(() => {
        useGenerationStore.getState().reset();
      }, 100);

    } catch (error: unknown) {
      const err = error as Error;
      useChatStore.getState().addMessage('system', `Error: ${err.message || 'Failed to connect to AI API'}`, userNodeId);
    } finally {
      setIsLoading(false);
      setGeneratingNodeId(null);
    }
  };

  // 编辑模式下，自动检测选区格式
  const [autoOpenMenu, setAutoOpenMenu] = useState<'text' | 'color' | 'highlight' | null>(null);

  useEffect(() => {
    if (!editingNodeId) {
      setAutoOpenMenu(null);
      return;
    }

    const checkSelectionFormat = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        // 选区为空，关闭菜单
        setAutoOpenMenu(null);
        return;
      }

      // 检测选区是否有格式
      const hasBold = isBold();
      const hasItalic = isItalic();
      const hasUnderline = isUnderline();
      const hasStrikethrough = isStrikethrough();
      const hasBgColor = hasBackgroundColor();
      const hasFgColor = hasTextColor();

      // 如果有格式，自动弹出对应菜单
      if (hasBold || hasItalic || hasUnderline || hasStrikethrough) {
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

  if (!session) return null;

  const isEditing = !!editingNodeId;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10">
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] border border-gray-200 overflow-hidden flex flex-col">
        {/* 顶部区域：二级菜单或 Replying to */}
        {isEditing && activeSubMenu ? (
          <FormatSubMenu menuType={activeSubMenu} onClose={() => setActiveSubMenu(null)} />
        ) : !isEditing && activeNode ? (
          <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-b border-gray-100 flex items-center gap-2">
            <CornerDownLeft size={12} />
            <span>Replying to: </span>
            <span className="text-gray-600 truncate max-w-[300px]">
              {activeNode.content
                .replace(/<[^>]*>/g, '') // 剥离 HTML 标签
                .replace(/[#*`_\[\]]/g, '')
                .replace(/\n+/g, ' ')
                .trim()
                .substring(0, 50)}
              {activeNode.content.length > 50 ? '...' : ''}
            </span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="p-2 flex items-end gap-2">
          {/* 工具栏主按钮 - 在对话框左边 */}
          <FormatToolbar
            isExpanded={isEditing}
            onMenuToggle={(menuType) => setActiveSubMenu(menuType)}
            autoOpenMenu={autoOpenMenu}
          />

          {/* 分隔线 - 编辑模式下显示 */}
          {isEditing && (
            <div className="w-px h-10 bg-gray-200 flex-shrink-0" />
          )}

          {/* 编辑模式：禁用的图标 */}
          {isEditing && (
            <button
              type="button"
              disabled
              className="p-3 bg-gray-100 text-gray-300 rounded-xl cursor-not-allowed flex-shrink-0"
              title="Send (disabled during editing)"
            >
              <MessageSquare size={18} />
            </button>
          )}

          {/* 正常模式：输入框和发送按钮 */}
          {!isEditing && (
            <>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => {
                  isComposing.current = true;
                }}
                onCompositionEnd={() => {
                  isComposing.current = false;
                }}
                onKeyDown={(e) => {
                  if (isComposing.current) return;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    setTimeout(() => handleSubmit(), 0);
                  }
                }}
                placeholder="Type your message here... (Shift+Enter for new line)"
                className="flex-1 max-h-40 min-h-[44px] bg-transparent resize-none outline-none py-3 px-3 text-sm text-gray-900 placeholder:text-gray-400 custom-scrollbar"
                rows={1}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-3 bg-leaf-600 hover:bg-leaf-700 disabled:bg-leaf-100 disabled:text-leaf-300 text-white rounded-xl transition-colors mb-1"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}