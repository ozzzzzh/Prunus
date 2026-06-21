import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',  // 允许外网访问
    port: 5173,
    proxy: {
      // 腾讯云 API 代理
      '/api/tencent': {
        target: 'https://api.lkeap.cloud.tencent.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tencent/, ''),
      },
    },
  },
})
