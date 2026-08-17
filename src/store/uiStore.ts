/**
 * UI 状态管理
 *
 * 负责 UI 相关的状态，如侧边栏、设置面板、主题等
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TourState, TourStats } from '../types/tour';
import { TOUR_STEPS } from '../types/tour';

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

  // ===== 展开模式 =====

  // 展开的节点ID（仅叶子节点可展开）
  expandedNodeId: string | null;
  setExpandedNode: (nodeId: string | null) => void;
  exitExpandedView: () => void;

  // ===== 节点多选总结 =====

  // 是否处于节点选择模式
  isSelectingMode: boolean;

  // 已选中的节点 ID（按点击顺序）
  selectedNodeIds: string[];

  enterSelectingMode: () => void;
  exitSelectingMode: () => void;
  toggleNodeSelection: (nodeId: string) => void;

  // ===== 交互式引导 =====

  // 引导状态
  tourState: TourState;
  startTour: () => void;
  advanceTourStep: () => void;
  skipTourStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  resetTour: () => void;

  // 引导统计
  tourStats: TourStats;
  incrementTourStat: (stat: keyof TourStats) => void;

  // 用户行为追踪（用于智能提示）
  userHasInteracted: {
    hasCreatedSession: boolean;
    hasSentMessage: boolean;
    hasUsedBranchOut: boolean;
    hasEditedNode: boolean;
    hasUsedKeyboardNav: boolean;
    hasExtractedContent: boolean;
  };
  recordUserInteraction: (action: keyof UIState['userHasInteracted']) => void;
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

      // ===== 展开模式 =====

      expandedNodeId: null,
      setExpandedNode: (nodeId) => set({ expandedNodeId: nodeId }),
      exitExpandedView: () => set({ expandedNodeId: null }),

      // ===== 节点多选总结 =====

      isSelectingMode: false,
      selectedNodeIds: [],

      enterSelectingMode: () => set({ isSelectingMode: true, selectedNodeIds: [] }),
      exitSelectingMode: () => set({ isSelectingMode: false, selectedNodeIds: [] }),
      toggleNodeSelection: (nodeId) => set((state) => {
        const exists = state.selectedNodeIds.includes(nodeId);
        return {
          selectedNodeIds: exists
            ? state.selectedNodeIds.filter((id) => id !== nodeId)
            : [...state.selectedNodeIds, nodeId],
        };
      }),

      // ===== 交互式引导 =====

      tourState: {
        isActive: false,
        currentPhase: 0,
        currentStepIndex: 0,
        completedSteps: [],
        skippedSteps: [],
        startedAt: null,
        completedAt: null,
      },

      startTour: () => set((state) => ({
        tourState: {
          ...state.tourState,
          isActive: true,
          currentPhase: 0,
          currentStepIndex: 0,
          startedAt: new Date().toISOString(),
        }
      })),

      advanceTourStep: () => set((state) => {
        const { tourState } = state;
        const currentStep = tourState.completedSteps.length;
        const totalSteps = TOUR_STEPS.length;

        if (currentStep >= totalSteps - 1) {
          // 完成引导
          return {
            tourState: {
              ...tourState,
              isActive: false,
              completedAt: new Date().toISOString(),
              completedSteps: [...tourState.completedSteps, `step-${currentStep}`],
            }
          };
        }

        // 进入下一步，使用 TOUR_STEPS 中定义的实际 phase
        const nextStep = TOUR_STEPS[currentStep + 1];
        const newPhase = nextStep?.phase ?? tourState.currentPhase;
        return {
          tourState: {
            ...tourState,
            currentPhase: newPhase,
            currentStepIndex: tourState.currentStepIndex + 1,
            completedSteps: [...tourState.completedSteps, `step-${currentStep}`],
          }
        };
      }),

      skipTourStep: () => set((state) => {
        const { tourState } = state;
        const currentStep = tourState.completedSteps.length + tourState.skippedSteps.length;

        return {
          tourState: {
            ...tourState,
            skippedSteps: [...tourState.skippedSteps, `step-${currentStep}`],
          }
        };
      }),

      skipTour: () => set((state) => ({
        tourState: {
          ...state.tourState,
          isActive: false,
          completedAt: new Date().toISOString(),
        }
      })),

      completeTour: () => set((state) => ({
        tourState: {
          ...state.tourState,
          isActive: false,
          completedAt: new Date().toISOString(),
        }
      })),

      resetTour: () => set({
        tourState: {
          isActive: false,
          currentPhase: 0,
          currentStepIndex: 0,
          completedSteps: [],
          skippedSteps: [],
          startedAt: null,
          completedAt: null,
        },
        tourStats: {
          messagesCreated: 0,
          branchesCreated: 0,
          nodesNavigated: 0,
          editsMade: 0,
        },
      }),

      tourStats: {
        messagesCreated: 0,
        branchesCreated: 0,
        nodesNavigated: 0,
        editsMade: 0,
      },

      incrementTourStat: (stat) => set((state) => ({
        tourStats: {
          ...state.tourStats,
          [stat]: state.tourStats[stat] + 1,
        }
      })),

      userHasInteracted: {
        hasCreatedSession: false,
        hasSentMessage: false,
        hasUsedBranchOut: false,
        hasEditedNode: false,
        hasUsedKeyboardNav: false,
        hasExtractedContent: false,
      },

      recordUserInteraction: (action) => set((state) => ({
        userHasInteracted: {
          ...state.userHasInteracted,
          [action]: true,
        }
      })),
    }),
    {
      name: 'prunus-ui-storage',
      partialize: (state) => ({
        onboardingCompleted: state.onboardingCompleted,
        dismissedHints: state.dismissedHints,
        tourState: state.tourState,
        tourStats: state.tourStats,
        userHasInteracted: state.userHasInteracted,
      }),
    }
  )
);