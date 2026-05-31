import OpenAI from 'openai';
import { useAPIConfigStore } from '../store';

export async function generateAIResponse(
  messages: { role: 'user' | 'assistant' | 'system', content: string }[],
  onChunk?: (text: string) => void
): Promise<string> {
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
    // 如果是自定义中转 API，有些不支持 default headers，可以尽量简化
    defaultHeaders: {
      "Content-Type": "application/json",
    }
  });

  try {
    const stream = await client.chat.completions.create({
      model: apiConfig.model.trim() || 'gpt-3.5-turbo',
      messages: messages,
      stream: true,
      // 降低温度，让分点更明确
      temperature: 0.7,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      fullResponse += text;
      if (onChunk) {
        onChunk(text);
      }
    }

    return fullResponse;
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
    
    if (err.status === 404) {
      throw new Error(`Model Error: The model '${apiConfig.model}' might not exist on this endpoint.`);
    }

    throw new Error((typeof err.message === 'string' ? err.message : '') || 'Unknown API Error occurred');
  }
}
