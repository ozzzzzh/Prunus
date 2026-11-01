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

/**
 * 视觉模型配置（Paper 截图问答）
 *
 * 与聊天模型分开配是刻意的：聊天用一个模型、看图往往要用另一个（且不一定同一家）。
 * 换聊天模型时不该连带丢掉看图能力，反过来也一样。
 *
 * 三项都留空时**回退到上面的聊天配置** —— 这样"聊天模型本身就能看图"的用户不用重复填。
 */
export interface VisionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol: LLMProtocol;
}

export interface APIConfig {
  model: string;
  enableThinking: boolean;  // 深度思考开关
  baseUrl: string;  // LLM Base URL（byok 为 provider；cdk 为社区后端 /v1）
  apiKey: string;   // LLM API Key（byok 为用户 key；cdk 为分发 token）
  protocol: LLMProtocol;  // 协议类型
  mode: LLMMode;
  vision: VisionConfig;
}

interface APIConfigState {
  config: APIConfig;

  updateConfig: (config: Partial<APIConfig>) => void;
  updateVisionConfig: (config: Partial<VisionConfig>) => void;
  resetConfig: () => void;
  configureByok: (opts: { baseUrl: string; apiKey: string; model: string; protocol: LLMProtocol }) => void;
  configureCdk: (opts: { token: string; baseUrl: string; model: string }) => void;
}

const EMPTY_VISION: VisionConfig = {
  baseUrl: '',
  apiKey: '',
  model: '',
  protocol: 'openai',
};

const DEFAULT_MODEL = (import.meta as any).env?.VITE_LLM_MODEL || 'gpt-3.5-turbo';
const DEFAULT_ENABLE_THINKING = (import.meta as any).env?.VITE_ENABLE_THINKING === 'true';

const DEFAULT_CONFIG: APIConfig = {
  model: DEFAULT_MODEL,
  enableThinking: DEFAULT_ENABLE_THINKING,
  baseUrl: '',
  apiKey: '',
  protocol: 'openai',
  mode: 'unconfigured',
  vision: { ...EMPTY_VISION },
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

      updateVisionConfig: (patch) => {
        set((state) => ({
          config: {
            ...state.config,
            vision: { ...EMPTY_VISION, ...state.config.vision, ...patch },
          },
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
        // 迁移：vision 是后加的字段，旧数据里没有 —— 补一个空的，
        // 否则设置界面会读到 undefined（persist 是浅合并，嵌套对象不会自动补默认值）
        if (state?.config && !state.config.vision) {
          state.config.vision = { ...EMPTY_VISION };
        }
      },
    }
  )
);

/** 一次请求该用哪套连接 */
export interface LLMConnection {
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol: LLMProtocol;
  /** 是否用了独立的视觉配置（用于给出更准确的报错） */
  usingVisionConfig: boolean;
}

/**
 * 解析出一次**视觉请求**该用的连接。
 *
 * 视觉配置没填全（或压根没配）时回退到聊天配置 —— 聊天模型本身支持看图的话，
 * 用户不必把同样的三项再填一遍。
 */
export function resolveVisionConnection(config: APIConfig): LLMConnection {
  const vision = config.vision;
  const hasVision = Boolean(vision?.baseUrl?.trim() && vision?.model?.trim());

  if (hasVision) {
    return {
      baseUrl: vision.baseUrl.trim(),
      // Key 留空时借用聊天 Key：视觉端点与聊天端点是同一家时省一次填写
      apiKey: (vision.apiKey ?? '').trim() || config.apiKey.trim(),
      model: vision.model.trim(),
      protocol: vision.protocol ?? 'openai',
      usingVisionConfig: true,
    };
  }

  return {
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    protocol: config.protocol,
    usingVisionConfig: false,
  };
}
