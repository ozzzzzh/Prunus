import OpenAI from 'openai';

// 检测是否是 Safari 浏览器
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// 从环境变量获取默认模型（通过 Vite define 暴露）
const DEFAULT_MODEL = (import.meta as any).env?.VITE_LLM_MODEL || 'gpt-3.5-turbo';

export async function generateAIResponse(
  messages: { role: 'user' | 'assistant' | 'system', content: string }[],
  onChunk?: (data: { content: string; reasoning?: string }) => void
): Promise<{ content: string; reasoning: string }> {
  // 使用本地代理路径，API Key 由代理从环境变量添加
  // 需要构造完整 URL（OpenAI SDK 要求完整 URL）
  const baseURL = `${window.location.origin}/api/llm`;
  const model = DEFAULT_MODEL;

  // 创建 OpenAI 客户端，使用代理路径
  // 注意：不需要传递真实 apiKey，因为代理会自动添加 Authorization header
  const client = new OpenAI({
    apiKey: 'proxy-placeholder',  // 占位符，实际的 Key 由代理添加
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
    const stream = await client.chat.completions.create({
      model: model.trim() || DEFAULT_MODEL,
      messages: messages,
      stream: true,
      temperature: 0.7,
    });

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
      throw new Error('Authentication Error: Please check your LLM_API_KEY in .env.local file.');
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
