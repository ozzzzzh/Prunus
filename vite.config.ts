import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量（空字符串前缀表示加载所有环境变量）
  const env = loadEnv(mode, process.cwd(), '');

  // 从环境变量获取 LLM API 配置，提供默认值
  const llmBaseUrl = env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const llmApiKey = env.LLM_API_KEY || '';
  const llmModel = env.LLM_MODEL || 'gpt-3.5-turbo';
  const base = process.env.BASE_URL || (mode === 'production' ? '/app/' : '/');

  console.log('[Vite Config] LLM Proxy Target:', llmBaseUrl);
  console.log('[Vite Config] LLM Model:', llmModel);

  return {
    base, 
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      host: '0.0.0.0',  // 允许外网访问
      port: 5173,
      proxy: {
        // 腾讯云 API 代理（保持原有配置）
        '/api/tencent': {
          target: 'https://api.lkeap.cloud.tencent.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tencent/, ''),
        },
        // LLM API 代理 - 隐藏 API Key
        '/api/llm': {
          target: llmBaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/llm/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (llmApiKey) {
                proxyReq.setHeader('Authorization', `Bearer ${llmApiKey}`);
              }
            });
            proxy.on('error', (err) => {
              console.error('[Proxy Error]', err);
            });
          },
        },
        // 社区后端代理
        // ⚠ 必须写在 '/api/tencent' 和 '/api/llm' 之后。
        //   Vite 按对象键的书写顺序匹配前缀，'/api/' 会把上面两个更具体的
        //   前缀一起吃掉，导致腾讯云 / LLM 代理失效。
        // 配合 .env.local 的 COMMUNITY_API=/ ：前端请求
        // http://localhost:5173/api/redeem，由这里转发到本机后端，
        // 同源、不需要 CORS。
        // 目标端口与后端 .env 的 PORT 保持一致。
        '/api/': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        // OpenAI 兼容代理（流式对话）
        '/v1/': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    define: {
      'import.meta.env.VITE_LLM_MODEL': JSON.stringify(llmModel),
      'import.meta.env.VITE_ENABLE_THINKING': JSON.stringify(env.ENABLE_THINKING === 'true'),
      'import.meta.env.VITE_COMMUNITY_API': JSON.stringify(env.COMMUNITY_API || ''),
    },
  };
});
