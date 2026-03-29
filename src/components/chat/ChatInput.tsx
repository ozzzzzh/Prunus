import { useState, useRef } from 'react';
import { Send, CornerDownLeft, Loader2 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import type { Role } from '../../store/chatStore';
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
    // 立即清空输入框
    setInput('');
    
    // 发送用户消息并获取生成的节点ID
    const userNodeId = addMessage('user', messageContent);
    setIsLoading(true);
    setGeneratingNodeId(userNodeId);

    try {
      // 收集当前分支的历史上下文（修复遗忘现象）
      // 注意：使用最新的 store 状态，并从刚生成的用户节点开始追溯
      const latestState = useChatStore.getState();
      const currentSession = latestState.sessions[activeSessionId];
      
      const history: { role: Role, content: string }[] = [];
      let currId: string | null = userNodeId || currentSession.currentNodeId;

      // 沿着 parentId 一直往上追溯到根节点，收集这条分支上所有的对话
      while (currId && currentSession.nodes[currId]) {
        const node = currentSession.nodes[currId];
        // 过滤掉系统内部生成的空提示节点（如果有）
        if (node.content && node.role !== 'system') {
          history.unshift({ role: node.role, content: node.content });
        }
        currId = node.parentId;
      }

      // 如果有系统提示，强制加在最前面
      history.unshift({ 
        role: 'system', 
        content: 'You are a helpful AI assistant. Provide structured, clear, and concise answers.' 
      });

      // 请求 LLM API，带上完整的历史链条
      const aiResponse = await generateAIResponse(history);

      // 直接将 AI 回复作为一个完整的节点添加，不再自动裂变
      // 这里的 addMessage 现在显式传入 userNodeId 作为 parentId，
      // 修复了在等待过程中点选其他卡片导致回答挂载错乱的 bug。
      useChatStore.getState().addMessage('assistant', aiResponse, userNodeId);

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
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
        {activeNode && (
          <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500 border-b border-slate-100 flex items-center gap-2">
            <CornerDownLeft size={12} />
            <span>Replying to: </span>
            <span className="font-medium text-slate-700 truncate max-w-[300px]">
              {activeNode.content.substring(0, 40)}{activeNode.content.length > 40 ? '...' : ''}
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
            className="flex-1 max-h-40 min-h-[44px] bg-transparent resize-none outline-none py-3 px-3 text-sm text-slate-800 placeholder:text-slate-400 custom-scrollbar"
            rows={1}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl transition-colors mb-1"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}