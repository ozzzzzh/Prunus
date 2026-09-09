import OpenAI from 'openai';
import { useAPIConfigStore } from '../store/apiConfigStore';

// 检测是否是 Safari 浏览器
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// 从环境变量获取默认模型（通过 Vite define 暴露）
const DEFAULT_MODEL = (import.meta as any).env?.VITE_LLM_MODEL || 'gpt-3.5-turbo';

// Anthropic 协议版本
const ANTHROPIC_VERSION = '2023-06-01';

type LLMMessage = { role: 'user' | 'assistant' | 'system'; content: string };

type GenerateOptions = {
  enableThinking?: boolean;  // 是否开启深度思考
  temperature?: number;      // 采样温度
};

/** 额度耗尽错误（CDK 模式，后端返回 402） */
export class QuotaExceededError extends Error {
  constructor() {
    super('额度已用完，请兑换新的兑换码或切换自己的 Key');
    this.name = 'QuotaExceededError';
  }
}

export async function generateAIResponse(
  messages: LLMMessage[],
  onChunk?: (data: { content: string; reasoning?: string }) => void,
  options?: GenerateOptions
): Promise<{ content: string; reasoning: string }> {
  // BYOK 优先：用户填了 baseUrl + apiKey 则直连其 provider；
  // 否则走本地代理 /api/llm，API Key 由代理从环境变量（.env.local）注入。
  const config = useAPIConfigStore.getState().config;
  const byokBaseUrl = config.baseUrl?.trim() ?? '';
  const byokApiKey = config.apiKey?.trim() ?? '';
  const hasBYOK = Boolean(byokBaseUrl && byokApiKey);
  const model = config.model?.trim() || DEFAULT_MODEL;

  // Anthropic 协议：原生 fetch 走 /v1/messages（需 BYOK，服务器代理仅支持 OpenAI 协议）
  if (config.protocol === 'anthropic') {
    if (!hasBYOK) {
      throw new Error('Anthropic 协议需要填写 Base URL 和 API Key（服务器默认配置仅支持 OpenAI 协议）。');
    }
    return generateAnthropicResponse(messages, onChunk, options, {
      baseUrl: byokBaseUrl,
      apiKey: byokApiKey,
      model,
    });
  }

  // OpenAI 协议：使用 OpenAI SDK
  const baseURL = hasBYOK ? byokBaseUrl : `${window.location.origin}/api/llm`;

  // BYOK 模式使用用户自己的 Key；代理模式下用占位符，实际 Key 由代理注入。
  const client = new OpenAI({
    apiKey: hasBYOK ? byokApiKey : 'proxy-placeholder',
    baseURL: baseURL,
    dangerouslyAllowBrowser: true,
    // 增加超时设置，防止请求一直挂起
    timeout: 60000,
    // Safari 兼容性：添加额外的请求头
    defaultHeaders: {
      "Content-Type": "application/json",
      // Safari 可能需要这些头部来绕过某些安全检查
      ...(isSafari ? {
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      } : {}),
    }
  });

  try {
    // 构建请求参数
    const requestParams: Record<string, unknown> = {
      model: model.trim() || DEFAULT_MODEL,
      messages: messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
    };

    // GLM-5 thinking 控制（智谱格式）
    // 使用联合类型避免拼写错误
    type ThinkingType = 'enabled' | 'disabled';

    if (options?.enableThinking !== undefined) {
      const thinkingType: ThinkingType = options.enableThinking ? 'enabled' : 'disabled';
      requestParams.thinking = { type: thinkingType };
    }
    // 如果不传 options.enableThinking，使用模型默认（GLM-5 默认开启）

    const stream = await client.chat.completions.create(requestParams as any) as unknown as AsyncIterable<any>;

    let fullContent = '';
    let fullReasoning = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      const reasoning = chunk.choices[0]?.delta?.reasoning_content || '';
      fullContent += content;
      fullReasoning += reasoning;
      if (onChunk) {
        onChunk({ content, reasoning });
      }
    }

    return { content: fullContent, reasoning: fullReasoning };
  } catch (error: unknown) {
    console.error('LLM API Error:', error);

    // 提取更友好的错误信息
    const err = error as Record<string, unknown>;
    if (err.name === 'APIConnectionError' || (typeof err.message === 'string' && err.message.includes('fetch'))) {
      throw new Error(`Connection Error: Please check if the LLM API proxy is working and your .env.local is configured correctly.`);
    }

    if (err.status === 401) {
      throw new Error('API Key 无效，请检查你的 API Key 配置');
    }

    if (err.status === 402) {
      throw new QuotaExceededError();
    }

    if (err.status === 403) {
      // Safari 特定的 403 错误提示
      if (isSafari) {
        throw new Error('Safari Browser Error: Safari has strict cross-origin restrictions. Please try:\n1. Disable "Prevent cross-site tracking" in Safari Settings > Privacy\n2. Or use Chrome/Firefox browser instead');
      }
      throw new Error('Access Forbidden (403): Your request was blocked by the API server. Please check your API key permissions or try using a different browser.');
    }

    if (err.status === 404) {
      throw new Error(`Model Error: The model '${model}' might not exist on this endpoint. Check LLM_MODEL in .env.local.`);
    }

    throw new Error((typeof err.message === 'string' ? err.message : '') || 'Unknown API Error occurred');
  }
}

/**
 * Anthropic 协议（POST /v1/messages）调用，使用原生 fetch + SSE 流式解析。
 * 不引入 @anthropic-ai/sdk，以兼容各类 Anthropic 协议端点（GLM/Kimi/Qwen 等）。
 */
async function generateAnthropicResponse(
  messages: LLMMessage[],
  onChunk: ((data: { content: string; reasoning?: string }) => void) | undefined,
  options: GenerateOptions | undefined,
  config: { baseUrl: string; apiKey: string; model: string }
): Promise<{ content: string; reasoning: string }> {
  // 消息转换：OpenAI 的 system role → Anthropic 顶层 system 字段
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const body: Record<string, unknown> = {
    model: config.model,
    messages: anthropicMessages,
    max_tokens: 8192,
    stream: true,
    temperature: options?.temperature ?? 0.7,
  };
  if (system) body.system = system;
  // thinking：Anthropic 协议下仅显式开启才发送（保守处理，避免部分端点不支持）
  if (options?.enableThinking) {
    body.thinking = { type: 'enabled', budget_tokens: 4096 };
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/v1/messages`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error('Connection Error: 请求超时，请检查 Base URL 或网络连接。');
    }
    throw new Error('Connection Error: 无法连接到大模型服务，请检查 Base URL 是否正确（可能不支持浏览器跨域）。');
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let errMsg = `Anthropic API error (${response.status})`;
    try {
      const errText = await response.text();
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errMsg;
    } catch {
      // 忽略非 JSON 错误体
    }
    throw new Error(errMsg);
  }

  if (!response.body) {
    throw new Error('Anthropic API error: 空响应。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const delta = parseAnthropicEvent(rawEvent);
      if (!delta) continue;
      if (delta.type === 'text') {
        content += delta.value;
        onChunk?.({ content: delta.value, reasoning: '' });
      } else if (delta.type === 'thinking') {
        reasoning += delta.value;
        onChunk?.({ content: '', reasoning: delta.value });
      }
    }
  }

  return { content, reasoning };
}

/**
 * 解析单个 Anthropic SSE 事件，返回文本/思考增量。
 */
function parseAnthropicEvent(rawEvent: string): { type: 'text' | 'thinking'; value: string } | null {
  for (const line of rawEvent.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const json = line.slice(5).trim();
    if (!json) continue;

    let data: any;
    try {
      data = JSON.parse(json);
    } catch {
      continue; // 忽略非 JSON 行
    }

    if (data?.type === 'content_block_delta' && data.delta) {
      if (data.delta.type === 'text_delta' && typeof data.delta.text === 'string') {
        return { type: 'text', value: data.delta.text };
      }
      if (data.delta.type === 'thinking_delta' && typeof data.delta.thinking === 'string') {
        return { type: 'thinking', value: data.delta.thinking };
      }
    }
  }
  return null;
}
