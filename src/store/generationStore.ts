/**
 * 生成状态管理
 *
 * 负责 AI 生成过程中的状态管理
 * 流式内容暂存于此，避免频繁触发 sessionStore 导致布局重算
 */

import { create } from 'zustand';

interface GenerationState {
  // 当前正在生成回复的节点 ID（assistant 节点）
  generatingNodeId: string | null;

  // 流式内容暂存（不触发 sessionStore 更新）
  streamingContent: string;

  // 流式思考内容暂存
  streamingReasoning: string;

  // 是否正在 reasoning（模型思考过程）
  isReasoning: boolean;

  // 错误信息
  error: string | null;

  // 操作
  setGeneratingNodeId: (nodeId: string | null) => void;
  appendStreamingContent: (content: string) => void;
  appendStreamingReasoning: (reasoning: string) => void;
  setIsReasoning: (isReasoning: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // 状态查询
  isGenerating: () => boolean;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  generatingNodeId: null,
  streamingContent: '',
  streamingReasoning: '',
  isReasoning: false,
  error: null,

  setGeneratingNodeId: (nodeId) => set({
    generatingNodeId: nodeId,
    streamingContent: '',
    streamingReasoning: '',
    isReasoning: false,
    error: null
  }),
  appendStreamingContent: (content) => set((state) => ({
    streamingContent: state.streamingContent + content,
  })),
  appendStreamingReasoning: (reasoning) => set((state) => ({
    streamingReasoning: state.streamingReasoning + reasoning,
  })),
  setIsReasoning: (isReasoning) => set({ isReasoning }),
  setError: (error) => set({ error }),
  reset: () => set({
    generatingNodeId: null,
    streamingContent: '',
    streamingReasoning: '',
    isReasoning: false,
    error: null
  }),

  isGenerating: () => get().generatingNodeId !== null,
}));