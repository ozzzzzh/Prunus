/**
 * API 配置状态管理
 *
 * 三种模式：
 * - unconfigured：未配置，需先走 BYOK 或 CDK 配置闸门
 * - byok：使用用户自己的 Key 直连大模型
 * - cdk：兑换社区版兑换码，使用分发下来的 token
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LLMProtocol = 'openai' | 'anthropic';
export type LLMMode = 'unconfigured' | 'byok' | 'cdk';

export interface APIConfig {
  model: string;
  enableThinking: boolean;  // 深度思考开关
  baseUrl: string;  // LLM Base URL（byok 为 provider；cdk 为社区后端 /v1）
  apiKey: string;   // LLM API Key（byok 为用户 key；cdk 为分发 token）
  protocol: LLMProtocol;  // 协议类型
  mode: LLMMode;
}

interface APIConfigState {
  config: APIConfig;

  updateConfig: (config: Partial<APIConfig>) => void;
  resetConfig: () => void;
  configureByok: (opts: { baseUrl: string; apiKey: string; model: string; protocol: LLMProtocol }) => void;
  configureCdk: (opts: { token: string; baseUrl: string; model: string }) => void;
}

const DEFAULT_MODEL = (import.meta as any).env?.VITE_LLM_MODEL || 'gpt-3.5-turbo';
const DEFAULT_ENABLE_THINKING = (import.meta as any).env?.VITE_ENABLE_THINKING === 'true';

const DEFAULT_CONFIG: APIConfig = {
  model: DEFAULT_MODEL,
  enableThinking: DEFAULT_ENABLE_THINKING,
  baseUrl: '',
  apiKey: '',
  protocol: 'openai',
  mode: 'unconfigured',
};

export const useAPIConfigStore = create<APIConfigState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_CONFIG },

      updateConfig: (newConfig) => {
        set((state) => ({
          config: { ...state.config, ...newConfig },
        }));
      },

      resetConfig: () => {
        set({ config: { ...DEFAULT_CONFIG } });
      },

      configureByok: ({ baseUrl, apiKey, model, protocol }) => {
        set((state) => ({
          config: { ...state.config, baseUrl, apiKey, model, protocol, mode: 'byok' },
        }));
      },

      configureCdk: ({ token, baseUrl, model }) => {
        set((state) => ({
          config: { ...state.config, apiKey: token, baseUrl, model, protocol: 'openai', mode: 'cdk' },
        }));
      },
    }),
    {
      name: 'prunus-api-config',
      onRehydrateStorage: () => (state) => {
        // 迁移：旧数据有 baseUrl+apiKey 但无 mode，视为 byok
        if (state?.config && state.config.mode === 'unconfigured' && state.config.baseUrl && state.config.apiKey) {
          state.config.mode = 'byok';
        }
      },
    }
  )
);
