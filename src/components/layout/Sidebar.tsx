import { Plus, MessageSquare, Settings } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { cn } from '../../utils/cn';

export default function Sidebar() {
  const sessions = useChatStore(state => state.sessions);
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const createSession = useChatStore(state => state.createSession);
  const switchSession = useChatStore(state => state.switchSession);
  const toggleSettings = useChatStore(state => state.toggleSettings);

  const sessionList = Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="w-64 h-full bg-slate-900 text-slate-300 flex flex-col">
      <div className="p-4">
        <h1 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="text-2xl">🍑</span> Prunus
        </h1>
        <button
          onClick={createSession}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-xl font-medium transition-colors"
        >
          <Plus size={18} />
          New Branch
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
        {sessionList.map(session => (
          <div
            key={session.id}
            onClick={() => switchSession(session.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-colors text-sm",
              activeSessionId === session.id 
                ? "bg-slate-800 text-white font-medium" 
                : "hover:bg-slate-800/50 hover:text-slate-200"
            )}
          >
            <MessageSquare size={16} className={activeSessionId === session.id ? "text-blue-400" : "text-slate-500"} />
            <span className="flex-1 truncate">{session.title}</span>
          </div>
        ))}
        {sessionList.length === 0 && (
          <div className="text-center text-slate-500 text-sm mt-10 px-4">
            No branches yet. Plant a new seed to start.
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex items-center justify-between">
        <span>Prunus Core v0.1</span>
        <button 
          onClick={() => toggleSettings(true)}
          className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-slate-200"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}