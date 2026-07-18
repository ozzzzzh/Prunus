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

  console.log('[Vite Config] LLM Proxy Target:', llmBaseUrl);
  console.log('[Vite Config] LLM Model:', llmModel);

  return {
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
      },
    },
    define: {
      'import.meta.env.VITE_LLM_MODEL': JSON.stringify(llmModel),
    },
  };
});
