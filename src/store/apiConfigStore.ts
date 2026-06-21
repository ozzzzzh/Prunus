/**
 * API 配置状态管理
 *
 * 注意：API Key 和 Base URL 现在通过 .env.local 文件配置
 * 此 store 仅保留模型选择等前端可配置项
 */

import { create } from 'zustand';

export interface APIConfig {
  model: string;
}

interface APIConfigState {
  config: APIConfig;

  // 操作
  updateConfig: (config: Partial<APIConfig>) => void;
  resetConfig: () => void;
}

// 从环境变量获取默认模型
const DEFAULT_MODEL = (import.meta as any).env?.VITE_LLM_MODEL || 'gpt-3.5-turbo';

const DEFAULT_CONFIG: APIConfig = {
  model: DEFAULT_MODEL,
};

export const useAPIConfigStore = create<APIConfigState>((set) => ({
  config: {
    model: DEFAULT_MODEL,
  },

  updateConfig: (newConfig) => {
    set((state) => ({
      config: { ...state.config, ...newConfig },
    }));
  },

  resetConfig: () => {
    set({ config: DEFAULT_CONFIG });
  },
}));