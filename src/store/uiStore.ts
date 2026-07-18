/**
 * UI 状态管理
 *
 * 负责 UI 相关的状态，如侧边栏、设置面板、主题等
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 页面类型
export type PageType = 'canvas' | 'fileManager';

interface UIState {
  // 当前页面
  currentPage: PageType;
  setCurrentPage: (page: PageType) => void;

  // 侧边栏
  sidebarCollapsed: boolean;
  toggleSidebar: (collapsed: boolean) => void;

  // 设置面板
  isSettingsOpen: boolean;
  toggleSettings: (isOpen: boolean) => void;

  // 主题（预留）
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // 缩放级别（预留）
  canvasZoom: number;
  setCanvasZoom: (zoom: number) => void;

  // 节点编辑模式
  editingNodeId: string | null;
  setEditingNode: (nodeId: string | null) => void;

  // ===== 新用户引导相关 =====

  // 引导完成状态
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;

  // 帮助面板
  showHelpPanel: boolean;
  toggleHelp: (show: boolean) => void;

  // 情境提示（记录用户已关闭的提示）
  dismissedHints: Record<string, boolean>;
  dismissHint: (hintId: string) => void;
  hasDismissedHint: (hintId: string) => boolean;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      currentPage: 'fileManager', // 默认进入文件管理页面
      setCurrentPage: (page) => set({ currentPage: page }),

      sidebarCollapsed: false,
      toggleSidebar: (collapsed) => set({ sidebarCollapsed: collapsed }),

      isSettingsOpen: false,
      toggleSettings: (isOpen) => set({ isSettingsOpen: isOpen }),

      theme: 'light',
      setTheme: (theme) => set({ theme }),

      canvasZoom: 1.0,
      setCanvasZoom: (zoom) => set({ canvasZoom: zoom }),

      editingNodeId: null,
      setEditingNode: (nodeId) => set({ editingNodeId: nodeId }),

      // ===== 新用户引导相关 =====

      onboardingCompleted: false,
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),

      showHelpPanel: false,
      toggleHelp: (show) => set({ showHelpPanel: show }),

      dismissedHints: {},
      dismissHint: (hintId) => set((state) => ({
        dismissedHints: { ...state.dismissedHints, [hintId]: true }
      })),
      hasDismissedHint: (hintId) => get().dismissedHints[hintId] === true,
    }),
    {
      name: 'prunus-ui-storage',
      partialize: (state) => ({
        onboardingCompleted: state.onboardingCompleted,
        dismissedHints: state.dismissedHints,
      }),
    }
  )
);