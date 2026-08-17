import { useState } from 'react';
import { X, BookOpen, Eraser } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';

interface GlobalPromptModalProps {
  sessionId: string;
  onClose: () => void;
}

export default function GlobalPromptModal({ sessionId, onClose }: GlobalPromptModalProps) {
  const initialPrompt = useSessionStore((state) => state.sessions[sessionId]?.globalPrompt ?? '');
  const setGlobalPrompt = useSessionStore((state) => state.setGlobalPrompt);
  const [draft, setDraft] = useState(initialPrompt);

  const handleSave = () => {
    setGlobalPrompt(sessionId, draft.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-[2px]">
      <div className="bg-white rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)] w-full max-w-lg flex flex-col border border-gray-200 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-leaf-100 text-leaf-700 flex items-center justify-center">
              <BookOpen size={16} />
            </div>
            <h2 className="text-lg font-bold text-gray-800">会话背景</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">
          <p className="text-sm text-gray-500 mb-3 leading-relaxed">
            此处填写的背景知识会作为约束追加到每次 AI 回复的提示词中，仅影响之后新生成的内容，不会回写已生成的节点。
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如：种一颗山桃树，回答需结合具体地区气候，语言使用中文..."
            className="w-full min-h-[160px] text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200 resize-y"
          />
          <div className="text-right text-xs text-gray-400 mt-1">{draft.length} 字</div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => setDraft('')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Eraser size={14} />
            清空
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-leaf-600 hover:bg-leaf-700 rounded-lg transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
