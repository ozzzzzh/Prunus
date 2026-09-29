/**
 * UI 状态管理
 *
 * 负责 UI 相关的状态，如侧边栏、设置面板、主题等
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TourState, TourStats } from '../types/tour';
import { TOUR_STEPS } from '../types/tour';
import type { MicroAppId } from '../types/microApp';

// 页面类型
export type PageType = 'canvas' | 'fileManager';

// ===== 微应用面板宽度 =====

/** 默认宽度：够读一页论文，又不至于把画布挤没 */
export const DEFAULT_MICRO_APP_WIDTH = 560;

/** 画布至少要留这么宽，否则面板不能继续变宽 */
const MIN_CANVAS_WIDTH = 420;
/** 面板本身的最小宽度 */
const MIN_MICRO_APP_WIDTH = 320;

export function clampMicroAppWidth(px: number): number {
  const maxByViewport = window.innerWidth - MIN_CANVAS_WIDTH;
  // 上限同时受窗口宽度约束：窗口小的时候不该让面板吃掉整屏画布
  const max = Math.max(MIN_MICRO_APP_WIDTH, Math.min(1000, maxByViewport));
  return Math.round(Math.min(Math.max(px, MIN_MICRO_APP_WIDTH), max));
}

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

  // ===== 微应用面板 =====

  /**
   * 当前打开的微应用（null = 没开）。
   *
   * 刻意与「哪个会话在读哪份文档」分开：这里只管**面板开着没有**（瞬态、不持久化），
   * 具体读的是哪份 PDF、读到第几页，记在 `session.microApps` 上（跟对话走）。
   */
  activeMicroApp: MicroAppId | null;
  setActiveMicroApp: (app: MicroAppId | null) => void;

  /**
   * 微应用面板宽度（px）。可拖动分隔条调整，作为偏好持久化。
   *
   * 拖动过程中**不写这里**：那样每帧都会引起 App 重渲染。拖动时直接改 CSS 变量，
   * 松手才落一次（见 MicroAppHost 的分隔条）。
   */
  microAppWidth: number;
  setMicroAppWidth: (px: number) => void;

  /**
   * 是否正在拖动分隔条。
   *
   * 需要放进 store 而不是留在宿主组件的局部 state：画布的 `<main>` 带 300ms
   * 过渡（侧边栏动画要用），拖动时若不关掉它，画布边缘会**慢半拍地**跟随面板边缘，
   * 看起来像脱开了一样。只有 App 知道该怎么关，所以这个标志得让它看得到。
   */
  isResizingMicroApp: boolean;
  setResizingMicroApp: (resizing: boolean) => void;
  /**
   * 打开微应用前的侧边栏状态，用于关闭时还原。
   *
   * 面板要占左侧那条，所以打开时必须把侧边栏收进去 —— 否则侧边栏会浮在面板上面
   * （它是 z-30，刻意高于面板，好让用户随时展开切会话），一打开就看到侧边栏压着论文。
   */
  sidebarBeforeMicroApp: boolean;

  // ===== 画布节点检索 =====

  /** 检索面板是否打开 */
  isSearchOpen: boolean;
  /**
   * 当前**正在预览**的那一个检索结果（不是全部命中）。
   *
   * 刻意与「当前焦点节点」（session.currentNodeId）分开存：
   * 焦点表示"我在看哪个"，这里表示"检索结果翻到第几个"，是两件事。
   * 只存一个 id 而不是一组：高亮整组会让用户分不清此刻预览的是哪一个。
   */
  searchActiveNodeId: string | null;
  setSearchOpen: (open: boolean) => void;
  setSearchActiveNode: (nodeId: string | null) => void;

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

      // ===== 微应用面板 =====

      activeMicroApp: null,
      microAppWidth: DEFAULT_MICRO_APP_WIDTH,
      isResizingMicroApp: false,
      setResizingMicroApp: (resizing) => set({ isResizingMicroApp: resizing }),
      setMicroAppWidth: (px) => set({ microAppWidth: clampMicroAppWidth(px) }),
      sidebarBeforeMicroApp: false,
      setActiveMicroApp: (app) =>
        set((state) => {
          if (app === state.activeMicroApp) return state;

          // 打开：收起侧边栏，并记住原状态；关闭：还原。
          // 放在这里而不是各个入口，是因为入口有好几个（右上按钮、节点角标、
          // 窄屏自动关闭），逐个记得处理侧边栏迟早会漏
          if (app) {
            return {
              activeMicroApp: app,
              sidebarBeforeMicroApp: state.sidebarCollapsed,
              sidebarCollapsed: true,
            };
          }
          return {
            activeMicroApp: null,
            sidebarCollapsed: state.sidebarBeforeMicroApp,
          };
        }),

      // ===== 画布节点检索 =====

      isSearchOpen: false,
      searchActiveNodeId: null,
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      setSearchActiveNode: (nodeId) => set({ searchActiveNodeId: nodeId }),

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
        // 面板宽度是用户偏好，留着；"面板开着没有"不持久化（每次启动都是关的）
        microAppWidth: state.microAppWidth,
      }),
    }
  )
);