/**
 * API 配置状态管理
 *
 * 负责 LLM API 的配置管理
 */

import { create } from 'zustand';

export interface APIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface APIConfigState {
  config: APIConfig;

  // 操作
  updateConfig: (config: Partial<APIConfig>) => void;
  resetConfig: () => void;

  // 验证
  isConfigured: () => boolean;
}

const DEFAULT_CONFIG: APIConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
};

export const useAPIConfigStore = create<APIConfigState>((set, get) => ({
  config: {
    apiKey: 'sk-sp-q42V1XVXEx6Ytf8y8yE0DAC5AnydYaNhBP0qIK8lrliEVg5b',
    baseUrl: 'https://api.lkeap.cloud.tencent.com/coding/v3',
    model: 'glm-5',
  },

  updateConfig: (newConfig) => {
    set((state) => ({
      config: { ...state.config, ...newConfig },
    }));
  },

  resetConfig: () => {
    set({ config: DEFAULT_CONFIG });
  },

  isConfigured: () => {
    const { config } = get();
    return !!config.apiKey && !!config.baseUrl && !!config.model;
  },
}));