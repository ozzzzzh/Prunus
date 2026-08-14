/**
 * 交互式引导类型定义
 */

export type TourPhase = 0 | 1 | 2 | 3 | 4 | 5;

export type TourStepPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TourStep {
  id: string;
  phase: TourPhase;
  target: string;           // CSS选择器或 data-tour 属性值
  title: string;
  description: string;
  placement: TourStepPlacement;
  spotlight?: boolean;       // 是否高亮目标元素
  allowSkip?: boolean;       // 是否允许跳过
  waitTime?: number;         // 观察类步骤的等待时间（毫秒）
  exampleInput?: string;     // 示例输入提示
  requireConfirm?: boolean;  // 是否需要用户点击"下一步"确认
}

export interface TourState {
  isActive: boolean;
  currentPhase: TourPhase;
  currentStepIndex: number;  // 当前阶段内的步骤索引
  completedSteps: string[];
  skippedSteps: string[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface TourStats {
  messagesCreated: number;
  branchesCreated: number;
  nodesNavigated: number;
  editsMade: number;
}

/**
 * 引导步骤配置（13步）
 *
 * 流程说明：
 * - Phase 0: 认识文件管理（在 FileManager 页面）
 * - Phase 1: 认识画布（在 Canvas 页面）
 * - Phase 2: 发送第一条消息
 * - Phase 3: 节点导航
 * - Phase 4: 高级功能（展开编辑等）
 */
export const TOUR_STEPS: TourStep[] = [
  // ========== Phase 0: 认识文件管理 ==========
  {
    id: 'welcome-filemanager',
    phase: 0,
    target: '[data-tour="filemanager"]',
    title: '欢迎使用 Prunus！',
    description: 'Prunus 是一个树状对话管理器，用"树"的方式来组织你和 AI 的对话。你可以在这里创建文件夹和对话文件，就像整理电脑里的文档一样。',
    placement: 'bottom',
    requireConfirm: true,
  },
  {
    id: 'open-session',
    phase: 0,
    target: '[data-tour="create-session-btn"]',
    title: '创建或打开一个对话文件',
    description: '点击这里新建一个对话文件，或者点击已有的文件来继续之前的对话。每个文件就是一棵独立的对话树。',
    placement: 'right',
    spotlight: true,
    requireConfirm: true,
  },

  // ========== Phase 1: 认识画布 ==========
  {
    id: 'welcome-canvas',
    phase: 1,
    target: '[data-tour="canvas"]',
    title: '这是你的对话画布',
    description: '画布上的每个方框是一个"节点"，代表一次对话。连线表示对话的分支关系，像一棵树向上生长。',
    placement: 'top',
    requireConfirm: true,
  },
  {
    id: 'canvas-pan',
    phase: 1,
    target: '[data-tour="canvas"]',
    title: '画布操作',
    description: '鼠标中键拖拽或鼠标滚轮可以平移画布，查看不同区域的节点。节点位置由画布自动布局，无需手动拖拽。',
    placement: 'top',
    requireConfirm: true,
  },
  {
    id: 'observe-nodes',
    phase: 1,
    target: '[data-tour="root-node"]',
    title: '认识节点标记',
    description: '对话树的节点有四种标记：\n🌱 种子 — 对话的起点\n🪵 树干 — 有多个分支方向的分叉点\n🍃 叶子 — 分支的末端，可以继续生长\n🍑 桃子 — 你手动标记的重要节点\n\n点击任意节点可以切换到该对话分支，绿色高亮的是当前激活的分支。',
    placement: 'right',
    spotlight: true,
    requireConfirm: true,
  },

  // ========== Phase 2: 发送第一条消息 ==========
  {
    id: 'input-and-send',
    phase: 2,
    target: '[data-tour="chat-input"]',
    title: '发送你的第一条消息',
    description: '在输入框中输入问题，然后按 Enter 或点击发送按钮。试试看：',
    placement: 'top',
    spotlight: true,
    exampleInput: '山桃树适合什么土壤？',
  },
  {
    id: 'wait-response',
    phase: 2,
    target: '[data-tour="current-node"]',
    title: 'AI 回复已完成',
    description: 'AI 已经生成了回复。你可以查看内容，继续对话，或者探索其他功能。',
    placement: 'left',
    requireConfirm: true,
  },

  // ========== Phase 3: 节点导航 ==========
  {
    id: 'click-node',
    phase: 3,
    target: '[data-tour="canvas"]',
    title: '切换对话分支',
    description: '点击任意灰色节点可以切换到该对话分支。试试点击其他节点！',
    placement: 'top',
  },
  {
    id: 'keyboard-nav',
    phase: 3,
    target: '[data-tour="canvas"]',
    title: '键盘导航',
    description: '使用方向键在节点间移动：↑ 父节点 ↓ 子节点 ← → 兄弟节点。按 C 键可以展开/收缩节点。',
    placement: 'top',
    requireConfirm: true,
  },

  // ========== Phase 4: 高级功能 ==========
  {
    id: 'expand-node',
    phase: 4,
    target: '[data-tour="expand-btn"]',
    title: '展开链路编辑',
    description: '点击叶子节点上的展开按钮，进入链路编辑模式。展开后点击"下一步"继续。',
    placement: 'bottom',
    spotlight: true,
    requireConfirm: true,
    allowSkip: true,
  },
  {
    id: 'expanded-view-input',
    phase: 4,
    target: '[data-tour="chat-input"]',
    title: '在展开模式中对话',
    description: '在展开模式下，你可以沿着当前分支继续对话。试试发送一条消息，完成后系统会自动识别。',
    placement: 'top',
    spotlight: true,
    exampleInput: '还有其他注意事项吗？',
    allowSkip: true,
  },
  {
    id: 'expanded-view-intro',
    phase: 4,
    target: '[data-tour="exit-expanded-btn"]',
    title: '返回画布',
    description: '点击返回按钮或按 ESC 退出展开模式，返回画布查看完整的对话树。',
    placement: 'left',
    spotlight: true,
    allowSkip: true,
  },
  {
    id: 'branch-out',
    phase: 4,
    target: '[data-tour="branch-out-btn"]',
    title: '智能分支拆分',
    description: '当 AI 回复包含多个要点时，点击 "Branch Out" 可以自动拆分为多个子节点，让思路更清晰。',
    placement: 'bottom',
    spotlight: true,
    allowSkip: true,
  },
  {
    id: 'edit-node',
    phase: 4,
    target: '[data-tour="current-node"]',
    title: '编辑节点内容',
    description: '双击任意节点可以编辑内容。编辑完成后点击节点外区域退出编辑模式。',
    placement: 'left',
    spotlight: true,
    allowSkip: true,
  },
  {
    id: 'extract-content',
    phase: 4,
    target: '[data-tour="canvas"]',
    title: '内容摘取',
    description: '编辑模式下，选中文字右键可以"摘取"创建新的兄弟节点。这让你可以重新组织对话内容。',
    placement: 'top',
    allowSkip: true,
    requireConfirm: true,
  },
];

/**
 * 获取指定阶段的步骤
 */
export function getStepsByPhase(phase: TourPhase): TourStep[] {
  return TOUR_STEPS.filter(step => step.phase === phase);
}

/**
 * 获取步骤总数
 */
export function getTotalSteps(): number {
  return TOUR_STEPS.length;
}
