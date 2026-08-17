/**
 * API 配置状态管理
 *
 * BYOK 优先：用户可自填 Base URL + API Key + 模型（本地持久化）。
 * 留空时回退到服务器 .env.local 的代理配置（共享 Key）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LLMProtocol = 'openai' | 'anthropic';

export interface APIConfig {
  model: string;
  enableThinking: boolean;  // 深度思考开关
  baseUrl: string;  // BYOK：LLM Base URL（留空走服务器代理）
  apiKey: string;   // BYOK：LLM API Key（留空走服务器代理）
  protocol: LLMProtocol;  // 协议类型（OpenAI /chat/completions 或 Anthropic /v1/messages）
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
  baseUrl: '',
  apiKey: '',
  protocol: 'openai',
};

export const useAPIConfigStore = create<APIConfigState>()(
  persist(
    (set) => ({
      config: {
        model: DEFAULT_MODEL,
        enableThinking: DEFAULT_ENABLE_THINKING,
        baseUrl: '',
        apiKey: '',
        protocol: 'openai',
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