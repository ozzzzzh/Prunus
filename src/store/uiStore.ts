/**
 * UI 状态管理
 *
 * 负责 UI 相关的状态，如侧边栏、设置面板、主题等
 */

import { create } from 'zustand';

interface UIState {
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
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: (collapsed) => set({ sidebarCollapsed: collapsed }),

  isSettingsOpen: false,
  toggleSettings: (isOpen) => set({ isSettingsOpen: isOpen }),

  theme: 'light',
  setTheme: (theme) => set({ theme }),

  canvasZoom: 1.0,
  setCanvasZoom: (zoom) => set({ canvasZoom: zoom }),
}));