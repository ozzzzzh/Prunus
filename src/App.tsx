import { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  ChevronRight,
  Home,
  PanelLeft,
} from 'lucide-react';
import ChatCanvas from './components/canvas/ChatCanvas';
import ChatInput from './components/chat/ChatInput';
import SettingsModal from './components/layout/SettingsModal';
import DialogHost from './components/layout/DialogHost';
import FileManagerPage from './components/pages/FileManagerPage';
import Sidebar from './components/layout/Sidebar';
import LLMSetupScreen from './components/setup/LLMSetupScreen';
import { HelpPanel, InteractiveTour } from './components/onboarding';
import ExpandedView from './components/expanded/ExpandedView';
import { useSessionStore } from './store/sessionStore';
import { useFolderStore } from './store/folderStore';
import { useUIStore } from './store/uiStore';
import { useAPIConfigStore } from './store/apiConfigStore';
import { initPersistence, enableAutoSave } from './services/persistenceService';
import { requestFreeToken, communityV1Url, hasCommunityBackend } from './utils/cdkService';
import { cn } from './utils/cn';
import logo from './assets/PrunusLogoHighQuality.jpg';

function App() {
  const sessions = useSessionStore(state => state.sessions);
  const activeSessionId = useSessionStore(state => state.activeSessionId);
  const currentPage = useUIStore(state => state.currentPage);
  const setCurrentPage = useUIStore(state => state.setCurrentPage);
  const sidebarCollapsed = useUIStore(state => state.sidebarCollapsed);
  const toggleSidebar = useUIStore(state => state.toggleSidebar);
  const expandedNodeId = useUIStore(state => state.expandedNodeId);

  const folderItems = useFolderStore(state => state.items);
  const mode = useAPIConfigStore(state => state.config.mode);
  const model = useAPIConfigStore(state => state.config.model);
  const configureCdk = useAPIConfigStore(state => state.configureCdk);

  // 初始化状态
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * 免费额度的领取状态，只在「未配置」时才需要走：
   *   checking → 正在向后端领取
   *   done     → 已有可用配置（含原本就配置过的用户）
   *   failed   → 领不到（后端没开 / 额度已用完 / 请求出错），显示配置页
   *
   * 初值直接判定：persist 中间件对 localStorage 是同步 rehydrate 的，首帧拿到的 mode
   * 就是真实值，不会先闪一下「检查中」。没有社区后端时无从领取，也按完成处理。
   */
  const [trial, setTrial] = useState<{ status: 'checking' | 'done' | 'failed'; notice?: string }>(
    () => (mode === 'unconfigured' && hasCommunityBackend() ? { status: 'checking' } : { status: 'done' })
  );

  // Initialize persistence
  // 如果 IndexedDB 为空，会自动加载 example.json 数据
  useEffect(() => {
    initPersistence().then(() => {
      enableAutoSave();
      setIsInitialized(true);
    });
  }, []);

  /**
   * 未配置时自动领取免费额度，让新用户不必先填 Key 就能上手。
   *
   * 设计要点：
   * - 拿到后直接走 `configureCdk`：免费 token 与兑换来的 token 在数据上一样，
   *   请求链路、额度扣减、402 判定全都复用，此处不需要任何新分支。
   * - `remaining <= 0` 时**不配置**，直接显示配置页，避免「先配置、再让第一次
   *   请求 402 弹回来」白跑一轮。
   * - 没有社区后端（纯开源自托管）时不去请求，保持原来的 BYOK 闸门行为。
   */
  useEffect(() => {
    if (mode !== 'unconfigured') return;
    // 没有社区后端就没有免费额度可领，保持原来的 BYOK 闸门行为。
    // 这里刻意不 setState：该条件在渲染时用 hasCommunityBackend() 判定即可，
    // 而在 effect 里同步 setState 会触发 react-hooks/set-state-in-effect。
    if (!hasCommunityBackend()) return;

    let cancelled = false;

    requestFreeToken()
      .then((res) => {
        if (cancelled) return;
        if (res.remaining > 0) {
          configureCdk({ token: res.token, baseUrl: communityV1Url(), model });
          setTrial({ status: 'done' });
        } else {
          // 后端把同一个 token 还了回来，说明这个身份已经用完了免费额度
          setTrial({ status: 'failed', notice: '免费额度已用完，配置自己的 Key 或兑换兑换码后即可继续使用。' });
        }
      })
      .catch(() => {
        // 后端不可用不该把用户挡在门外之外再报一个看不懂的错，
        // 直接回落到配置页，让他可以走 BYOK。
        if (!cancelled) setTrial({ status: 'failed' });
      });

    return () => {
      cancelled = true;
    };
  }, [mode, model, configureCdk]);

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
  const handleBreadcrumbClick = (_folderId: string | null) => {
    setCurrentPage('fileManager');
  };

  // 等待初始化完成
  if (!isInitialized) {
    return (
      <div className="h-screen w-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  // LLM 配置闸门。
  // 与旧版的区别：未配置时先试着领免费额度，只有领不到才弹配置页。
  // 注意 trial.status === 'done' 时 mode 已被 configureCdk 改成 'cdk'，
  // 下一次渲染就不会进这个分支了，所以这里只需处理「检查中」和「领不到」两种。
  if (mode === 'unconfigured') {
    if (hasCommunityBackend() && trial.status === 'checking') {
      return (
        <div className="h-screen w-screen bg-[#fafafa] flex items-center justify-center">
          <div className="text-gray-500 text-sm">正在准备免费额度…</div>
        </div>
      );
    }
    return <LLMSetupScreen notice={trial.notice} />;
  }

  // 如果在文件管理页面，直接返回文件管理页面组件
  if (currentPage === 'fileManager') {
    return (
      <>
        <FileManagerPage />
        <DialogHost />
      </>
    );
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
                src={logo}
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
            {expandedNodeId ? <ExpandedView /> : <ChatCanvas />}
          </ReactFlowProvider>
        </div>
        <ChatInput />
      </main>

      <SettingsModal />

      {/* 帮助面板 */}
      <HelpPanel />

      {/* 交互式引导 */}
      <InteractiveTour />

      {/* 全局对话框（确认/输入弹窗 + Toast） */}
      <DialogHost />
    </div>
  );
}

export default App;