import { useEffect, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  ChevronRight,
  Home,
  PanelLeft,
} from 'lucide-react';
import ChatCanvas from './components/canvas/ChatCanvas';
import ChatInput from './components/chat/ChatInput';
import SettingsModal from './components/layout/SettingsModal';
import FileManagerPage from './components/pages/FileManagerPage';
import Sidebar from './components/layout/Sidebar';
import { useSessionStore } from './store/sessionStore';
import { useFolderStore } from './store/folderStore';
import { useUIStore } from './store/uiStore';
import { initPersistence, enableAutoSave } from './services/persistenceService';
import { cn } from './utils/cn';

function App() {
  const sessions = useSessionStore(state => state.sessions);
  const activeSessionId = useSessionStore(state => state.activeSessionId);
  const createSession = useSessionStore(state => state.createSession);
  const currentPage = useUIStore(state => state.currentPage);
  const setCurrentPage = useUIStore(state => state.setCurrentPage);
  const sidebarCollapsed = useUIStore(state => state.sidebarCollapsed);
  const toggleSidebar = useUIStore(state => state.toggleSidebar);

  const folderItems = useFolderStore(state => state.items);

  // Initialize persistence and create default session if needed
  useEffect(() => {
    initPersistence().then(() => {
      enableAutoSave();
      if (Object.keys(useSessionStore.getState().sessions).length === 0) {
        createSession();
      }
    });
  }, [createSession]);

  // 获取当前会话所在的文件夹路径（面包屑）
  const breadcrumbs = useMemo(() => {
    if (!activeSessionId) return [{ id: null, name: '根目录' }];

    const sessionItem = Object.values(folderItems).find(
      item => item.type === 'session' && item.sessionId === activeSessionId
    );

    if (!sessionItem) return [{ id: null, name: '根目录' }];

    const tempPath: { id: string; name: string }[] = [];
    let currentId: string | null = sessionItem.parentId;

    while (currentId) {
      const item = folderItems[currentId];
      if (item) {
        tempPath.unshift({ id: currentId, name: item.name });
        currentId = item.parentId;
      } else {
        break;
      }
    }

    const path: { id: string | null; name: string }[] = [
      { id: null, name: '根目录' },
      ...tempPath,
    ];

    return path;
  }, [activeSessionId, folderItems]);

  // 获取当前会话标题
  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const sessionTitle = activeSession?.title || '未命名会话';

  // 点击面包屑导航到文件夹
  const handleBreadcrumbClick = (folderId: string | null) => {
    setCurrentPage('fileManager');
  };

  // 如果在文件管理页面，直接返回文件管理页面组件
  if (currentPage === 'fileManager') {
    return <FileManagerPage />;
  }

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#fafafa] text-gray-900">
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区域 */}
      <main
        className={cn(
          'absolute top-0 right-0 bottom-0 flex flex-col h-full overflow-hidden transition-all duration-300',
          sidebarCollapsed ? 'left-0' : 'left-64'
        )}
      >
        {/* 顶部导航栏 - Canvas视图专用，高度h-12与Sidebar对齐 */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4">
          {/* 左侧：展开按钮（收缩时显示） */}
          {sidebarCollapsed && (
            <>
              <img
                src="/src/assets/PrunusLogoHighQuality.jpg"
                alt="Prunus Logo"
                className="w-6 h-6 rounded-full object-cover mr-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setCurrentPage('fileManager')}
                title="打开文件管理"
              />
              <button
                onClick={() => toggleSidebar(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors mr-2"
                title="展开侧边栏"
              >
                <PanelLeft size={18} />
              </button>
            </>
          )}

          {/* 面包屑导航 */}
          <div className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id ?? 'root'} className="flex items-center">
                {index > 0 && <ChevronRight size={14} className="text-gray-400 mx-1" />}
                <button
                  onClick={() => handleBreadcrumbClick(crumb.id)}
                  className={cn(
                    'px-2 py-1 rounded transition-colors',
                    'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {index === 0 ? <Home size={14} /> : crumb.name}
                </button>
              </div>
            ))}
            {/* 当前会话 */}
            <ChevronRight size={14} className="text-gray-400 mx-1" />
            <span className="px-2 py-1 text-leaf-700 font-medium bg-leaf-50 rounded">
              {sessionTitle}
            </span>
          </div>
        </div>

        {/* Canvas 和输入区域 */}
        <div className="flex-1 overflow-hidden">
          <ReactFlowProvider>
            <ChatCanvas />
          </ReactFlowProvider>
        </div>
        <ChatInput />
      </main>

      <SettingsModal />
    </div>
  );
}

export default App;