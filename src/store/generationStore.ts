/**
 * 生成状态管理
 *
 * 负责 AI 生成过程中的状态管理
 */

import { create } from 'zustand';

interface GenerationState {
  // 当前正在生成回复的用户节点 ID
  generatingNodeId: string | null;

  // 生成进度（0-100）
  progress: number;

  // 错误信息
  error: string | null;

  // 操作
  setGeneratingNodeId: (nodeId: string | null) => void;
  setProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // 状态查询
  isGenerating: () => boolean;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  generatingNodeId: null,
  progress: 0,
  error: null,

  setGeneratingNodeId: (nodeId) => set({ generatingNodeId: nodeId, error: null }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error }),
  reset: () => set({ generatingNodeId: null, progress: 0, error: null }),

  isGenerating: () => get().generatingNodeId !== null,
}));