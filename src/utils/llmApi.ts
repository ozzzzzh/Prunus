import OpenAI from 'openai';
import { useAPIConfigStore } from '../store';

// 检测是否是 Safari 浏览器
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export async function generateAIResponse(
  messages: { role: 'user' | 'assistant' | 'system', content: string }[],
  onChunk?: (data: { content: string; reasoning?: string }) => void
): Promise<{ content: string; reasoning: string }> {
  const { config: apiConfig } = useAPIConfigStore.getState();

  if (!apiConfig.apiKey) {
    throw new Error('API Key is not configured. Please check settings.');
  }

  // 确保 baseUrl 格式正确（很多国内厂商要求必须有 /v1 或者不能有尾部斜杠）
  let baseURL = apiConfig.baseUrl.trim();
  if (baseURL.endsWith('/')) {
    baseURL = baseURL.slice(0, -1);
  }

  // 针对腾讯云 API 的特殊跨域处理
  // 如果用户填写的 baseUrl 是腾讯云的地址，我们在前端将其替换为本地的代理路径
  // 注意：OpenAI SDK 要求 baseURL 必须是绝对路径，所以代理路径也要带上当前域名
  if (baseURL.includes('api.lkeap.cloud.tencent.com')) {
    const currentHost = window.location.origin;
    baseURL = baseURL.replace('https://api.lkeap.cloud.tencent.com', `${currentHost}/api/tencent`);
  }

  const client = new OpenAI({
    apiKey: apiConfig.apiKey,
    baseURL: baseURL,
    dangerouslyAllowBrowser: true,
    // 增加超时设置，防止请求一直挂起
    timeout: 30000,
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
      model: apiConfig.model.trim() || 'gpt-3.5-turbo',
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
      throw new Error(`Connection Error: Please check if your Base URL (${baseURL}) is accessible and supports CORS. If you are using a local API, ensure it's running.`);
    }

    if (err.status === 401) {
      throw new Error('Authentication Error: Your API Key is invalid or expired.');
    }

    if (err.status === 403) {
      // Safari 特定的 403 错误提示
      if (isSafari) {
        throw new Error('Safari Browser Error: Safari has strict cross-origin restrictions. Please try:\n1. Disable "Prevent cross-site tracking" in Safari Settings > Privacy\n2. Or use Chrome/Firefox browser instead');
      }
      throw new Error('Access Forbidden (403): Your request was blocked by the API server. Please check your API key permissions or try using a different browser.');
    }

    if (err.status === 404) {
      throw new Error(`Model Error: The model '${apiConfig.model}' might not exist on this endpoint.`);
    }

    throw new Error((typeof err.message === 'string' ? err.message : '') || 'Unknown API Error occurred');
  }
}
