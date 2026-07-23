/**
 * API 配置状态管理
 *
 * 注意：API Key 和 Base URL 现在通过 .env.local 文件配置
 * 此 store 仅保留模型选择等前端可配置项
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface APIConfig {
  model: string;
  enableThinking: boolean;  // 深度思考开关
}

interface APIConfigState {
  config: APIConfig;

  // 操作
  updateConfig: (config: Partial<APIConfig>) => void;
  resetConfig: () => void;
}

// 从环境变量获取默认模型
const DEFAULT_MODEL = (import.meta as any).env?.VITE_LLM_MODEL || 'gpt-3.5-turbo';

// 从环境变量获取默认 thinking 开关
const DEFAULT_ENABLE_THINKING = (import.meta as any).env?.VITE_ENABLE_THINKING === 'true';

const DEFAULT_CONFIG: APIConfig = {
  model: DEFAULT_MODEL,
  enableThinking: DEFAULT_ENABLE_THINKING,
};

export const useAPIConfigStore = create<APIConfigState>()(
  persist(
    (set) => ({
      config: {
        model: DEFAULT_MODEL,
        enableThinking: DEFAULT_ENABLE_THINKING,
      },

      updateConfig: (newConfig) => {
        set((state) => ({
          config: { ...state.config, ...newConfig },
        }));
      },

      resetConfig: () => {
        set({ config: DEFAULT_CONFIG });
      },
    }),
    {
      name: 'prunus-api-config',
    }
  )
);