import { useState, useRef, useEffect } from 'react';
import { Plus, MessageSquare, Settings, ChevronLeft, ChevronRight, Pencil, Trash2, Pin } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';

export default function Sidebar() {
  // 直接订阅 sessionStore，避免 chatStore getter 的问题
  const sessions = useSessionStore(state => state.sessions);
  const activeSessionId = useSessionStore(state => state.activeSessionId);
  const createSession = useSessionStore(state => state.createSession);
  const switchSession = useSessionStore(state => state.switchSession);
  const deleteSession = useSessionStore(state => state.deleteSession);
  const renameSession = useSessionStore(state => state.renameSession);
  const togglePinSession = useSessionStore(state => state.togglePinSession);

  // UI 状态从 uiStore 订阅
  const toggleSettings = useUIStore(state => state.toggleSettings);
  const sidebarCollapsed = useUIStore(state => state.sidebarCollapsed);
  const toggleSidebar = useUIStore(state => state.toggleSidebar);

  const [contextMenu, setContextMenu] = useState<{
    sessionId: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 分离置顶和非置顶的 session
  const sessionList = Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt);
  const pinnedSessions = sessionList.filter(s => s.pinned);
  const unpinnedSessions = sessionList.filter(s => !s.pinned);

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // 编辑时自动聚焦
  useEffect(() => {
    if (editingSessionId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingSessionId]);

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  };

  const handleRename = () => {
    if (contextMenu) {
      setEditingSessionId(contextMenu.sessionId);
      setEditingTitle(sessions[contextMenu.sessionId]?.title || '');
      setContextMenu(null);
    }
  };

  const handleDelete = () => {
    if (contextMenu) {
      deleteSession(contextMenu.sessionId);
      setContextMenu(null);
    }
  };

  const handlePin = () => {
    if (contextMenu) {
      togglePinSession(contextMenu.sessionId);
      setContextMenu(null);
    }
  };

  const handleSaveRename = () => {
    if (editingSessionId && editingTitle.trim()) {
      renameSession(editingSessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  return (
    <>
      {/* 收缩状态下的展开按钮 */}
      {sidebarCollapsed && (
        <button
          onClick={() => toggleSidebar(false)}
          className="absolute left-4 top-4 z-20 p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ChevronRight size={18} />
        </button>
      )}

      {/* 侧边栏主体 */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out z-10",
          sidebarCollapsed ? "-translate-x-full" : "translate-x-0"
        )}
      >
        {/* Logo 区域 */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span className="text-2xl">🍑</span>
              <span>Prunus</span>
            </h1>
            <button
              onClick={() => toggleSidebar(true)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        </div>

        {/* 新增 Branch 区域 */}
        <div className="p-3 border-b border-gray-100">
          <button
            onClick={createSession}
            className="w-full flex items-center justify-center gap-2 bg-leaf-600 hover:bg-leaf-700 text-white py-2.5 px-4 rounded-xl font-medium transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span>New Branch</span>
          </button>
        </div>

        {/* Branch Session 列表区域 */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {/* 置顶区域 */}
          {pinnedSessions.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2 flex items-center gap-1">
                <Pin size={10} />
                Pinned
              </div>
              <div className="space-y-0.5">
                {pinnedSessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    onContextMenu={(e) => handleContextMenu(e, session.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm group",
                      activeSessionId === session.id
                        ? "bg-leaf-50 text-gray-800 font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <MessageSquare size={16} className={activeSessionId === session.id ? "text-leaf-600" : "text-gray-300"} />
                    {editingSessionId === session.id ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={handleSaveRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename();
                          if (e.key === 'Escape') {
                            setEditingSessionId(null);
                            setEditingTitle('');
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-white border border-leaf-300 rounded px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-leaf-400"
                      />
                    ) : (
                      <span className="flex-1 truncate">{session.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 普通区域 */}
          <div>
            <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">
              Branches
            </div>
            <div className="space-y-0.5">
              {unpinnedSessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => switchSession(session.id)}
                  onContextMenu={(e) => handleContextMenu(e, session.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm group",
                    activeSessionId === session.id
                      ? "bg-leaf-50 text-gray-800 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <MessageSquare size={16} className={activeSessionId === session.id ? "text-leaf-600" : "text-gray-300"} />
                  {editingSessionId === session.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename();
                        if (e.key === 'Escape') {
                          setEditingSessionId(null);
                          setEditingTitle('');
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-white border border-leaf-300 rounded px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-leaf-400"
                    />
                  ) : (
                    <span className="flex-1 truncate">{session.title}</span>
                  )}
                </div>
              ))}
              {unpinnedSessions.length === 0 && pinnedSessions.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-6 px-4 py-4">
                  No branches yet.<br />Plant a new seed to start.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部区域 */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => toggleSettings(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
          <div className="text-[11px] text-gray-400 text-center mt-2">
            Prunus Core v0.1
          </div>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handlePin}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Pin size={14} />
            {sessions[contextMenu.sessionId]?.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            onClick={handleRename}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Pencil size={14} />
            Rename
          </button>
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
