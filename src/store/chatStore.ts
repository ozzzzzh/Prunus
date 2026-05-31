/**
 * Prunus 统一状态管理入口（向后兼容）
 *
 * @deprecated 推荐使用拆分后的独立 Store：
 * - useSessionStore - 会话和节点管理
 * - useUIStore - UI 状态
 * - useAPIConfigStore - API 配置
 * - useGenerationStore - 生成状态
 *
 * 此文件保持向后兼容，内部组合使用拆分后的 Store
 */

import { create } from 'zustand';
import type { PrunusNode, NodeMarker, Role } from '../types';
import { useSessionStore, type ChatSession } from './sessionStore';
import { useUIStore } from './uiStore';
import { useAPIConfigStore, type APIConfig } from './apiConfigStore';
import { useGenerationStore } from './generationStore';

// ===== 向后兼容类型导出 =====

export type { Role, NodeMarker, APIConfig };
export type { PrunusNode, ChatSession };

// ===== 向后兼容类型定义 =====

interface ChatState {
  // 从 SessionStore 委托
  sessions: Record<string, ChatSession>;
  activeSessionId: string | null;
  generatingNodeId: string | null;

  // 从 APIConfigStore 委托
  apiConfig: APIConfig;

  // 从 UIStore 委托
  isSettingsOpen: boolean;
  sidebarCollapsed: boolean;

  // Actions - 会话管理
  createSession: () => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newTitle: string) => void;
  togglePinSession: (sessionId: string) => void;

  // Actions - 节点管理
  addMessage: (role: Role, content: string, parentId?: string) => string;
  addBranchedMessages: (role: Role, contents: string[], parentId?: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  deleteNode: (nodeId: string) => void;
  splitNodeIntoBranches: (nodeId: string, newOutlineContent: string, branchesContent: string[]) => void;

  // Actions - 节点焦点与标记
  focusNode: (nodeId: string) => void;
  setNodeMarker: (nodeId: string, marker: NodeMarker | undefined) => void;
  toggleNodeCollapse: (nodeId: string) => void;
  updateNodeMarkers: (sessionId: string) => void;

  // Actions - API 配置
  updateApiConfig: (config: Partial<APIConfig>) => void;

  // Actions - UI 状态
  toggleSettings: (isOpen: boolean) => void;
  toggleSidebar: (collapsed: boolean) => void;

  // Actions - 生成状态
  setGeneratingNodeId: (nodeId: string | null) => void;
}

/**
 * 向后兼容的统一 Store
 *
 * 内部组合使用拆分后的 Store，保持 API 兼容
 */
export const useChatStore = create<ChatState>(() => ({
  // ===== 状态委托 =====
  // 注意：这些是初始值，实际使用时应该从各 Store 读取

  get sessions() {
    return useSessionStore.getState().sessions;
  },

  get activeSessionId() {
    return useSessionStore.getState().activeSessionId;
  },

  get generatingNodeId() {
    return useGenerationStore.getState().generatingNodeId;
  },

  get apiConfig() {
    return useAPIConfigStore.getState().config;
  },

  get isSettingsOpen() {
    return useUIStore.getState().isSettingsOpen;
  },

  get sidebarCollapsed() {
    return useUIStore.getState().sidebarCollapsed;
  },

  // ===== Actions =====

  createSession: () => useSessionStore.getState().createSession(),
  switchSession: (sessionId) => useSessionStore.getState().switchSession(sessionId),
  deleteSession: (sessionId) => useSessionStore.getState().deleteSession(sessionId),
  renameSession: (sessionId, newTitle) => useSessionStore.getState().renameSession(sessionId, newTitle),
  togglePinSession: (sessionId) => useSessionStore.getState().togglePinSession(sessionId),

  addMessage: (role, content, parentId) => useSessionStore.getState().addMessage(role, content, parentId),
  addBranchedMessages: (role, contents, parentId) => useSessionStore.getState().addBranchedMessages(role, contents, parentId),
  updateNodeContent: (nodeId, content) => useSessionStore.getState().updateNodeContent(nodeId, content),
  deleteNode: (nodeId) => useSessionStore.getState().deleteNode(nodeId),
  splitNodeIntoBranches: (nodeId, outline, branches) => useSessionStore.getState().splitNodeIntoBranches(nodeId, outline, branches),

  focusNode: (nodeId) => useSessionStore.getState().focusNode(nodeId),
  setNodeMarker: (nodeId, marker) => useSessionStore.getState().setNodeMarker(nodeId, marker),
  toggleNodeCollapse: (nodeId) => useSessionStore.getState().toggleNodeCollapse(nodeId),
  updateNodeMarkers: (sessionId) => useSessionStore.getState().updateNodeMarkers(sessionId),

  updateApiConfig: (config) => useAPIConfigStore.getState().updateConfig(config),

  toggleSettings: (isOpen) => useUIStore.getState().toggleSettings(isOpen),
  toggleSidebar: (collapsed) => useUIStore.getState().toggleSidebar(collapsed),

  setGeneratingNodeId: (nodeId) => useGenerationStore.getState().setGeneratingNodeId(nodeId),
}));
