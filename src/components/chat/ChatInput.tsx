import { useState, useRef } from 'react';
import { Send, CornerDownLeft, Loader2 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useGenerationStore } from '../../store/generationStore';
import { useSessionStore } from '../../store/sessionStore';
import type { AIRole } from '../../types';
import { isAIChatNode } from '../../types';
import { generateAIResponse } from '../../utils/llmApi';

export default function ChatInput() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isComposing = useRef(false);
  const addMessage = useChatStore(state => state.addMessage);
  const setGeneratingNodeId = useChatStore(state => state.setGeneratingNodeId);
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const sessions = useChatStore(state => state.sessions);

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

  if (!session) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10">
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] border border-gray-200 overflow-hidden flex flex-col">
        {activeNode && (
          <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-b border-gray-100 flex items-center gap-2">
            <CornerDownLeft size={12} />
            <span>Replying to: </span>
            <span className="text-gray-600 truncate max-w-[300px]">
              {activeNode.content.replace(/[#*`_\[\]]/g, '').replace(/\n+/g, ' ').trim().substring(0, 50)}
              {activeNode.content.length > 50 ? '...' : ''}
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="p-2 flex items-end gap-2">
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
              // 如果正在使用中文输入法选词，则不触发提交
              if (isComposing.current) return;
              
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // 使用 setTimeout 确保 react 状态更新的微小延迟不影响提交逻辑
                setTimeout(() => {
                  handleSubmit();
                }, 0);
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
        </form>
      </div>
    </div>
  );
}