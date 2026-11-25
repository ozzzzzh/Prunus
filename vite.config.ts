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

  /**
   * 桌面（Tauri）构建：`--mode desktop`，或由 Tauri CLI 调起（它会设 TAURI_ENV_*）。
   *
   * 与 Web 构建的三处差别，全都不能靠 .env 解决（下面逐条说明）：
   *
   * 1. **base 必须是 `/`**。Web 产物默认 `/app/`（部署在子路径下），而 Tauri 把
   *    frontendDist 目录挂在根上，`/app/assets/...` 会全部 404 —— 白屏一片。
   *    原实现读的是 `process.env.BASE_URL`（真实进程环境变量），
   *    写在 .env 里其实是无效的，所以这里改成读 loadEnv 的结果，并且桌面端强制 `/`。
   * 2. **产物必须分开**。`dist/` 是线上部署产物（clone 下来就有），构建桌面版顺手覆盖掉它，
   *    会让 `dist/` 里躺着 base=/ 的资源，再拿去部署就是白屏。桌面版单独写 `dist-desktop/`。
   * 3. **dev server 端口不能漂移**。Tauri 的 devUrl 写死 5173，Vite 默认会在端口被占时
   *    静默换一个（严格说它只是提示），于是 Tauri 打开一个空窗口。
   *    `strictPort: true` 让它在端口被占时直接报错，比空窗口好排查得多。
   */
  const isDesktopBuild = mode === 'desktop' || Boolean(process.env.TAURI_ENV_PLATFORM);

  const base = isDesktopBuild
    ? '/'
    : env.BASE_URL || process.env.BASE_URL || (mode === 'production' ? '/app/' : '/');

  const outDir = isDesktopBuild ? 'dist-desktop' : 'dist';

  console.log('[Vite Config] Desktop build:', isDesktopBuild);
  console.log('[Vite Config] base:', base, '→ outDir:', outDir);
  console.log('[Vite Config] LLM Proxy Target:', llmBaseUrl);
  console.log('[Vite Config] LLM Model:', llmModel);

  return {
    base, 
    plugins: [
      react(),
      tailwindcss(),
    ],
    // Tauri CLI 的输出要和 Vite 的日志挤在一起看，别让 Vite 清屏把 Rust 的报错冲掉
    clearScreen: false,
    server: {
      host: '0.0.0.0',  // 允许外网访问
      port: 5173,
      strictPort: true,
      watch: {
        // src-tauri 里是 Rust 的增量编译产物（debug/ 有几百 MB），
        // Vite 盯它会疯狂触发全量热更，而且和 Rust 的跨盘编译一起把 CPU 打满
        ignored: ['**/src-tauri/**'],
      },
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
    build: {
      // 桌面产物独立目录（见上方 isDesktopBuild 的第 2 条理由）。
      // tauri.conf.json 的 frontendDist 指向 ../dist-desktop，两边必须一致。
      outDir,
      emptyOutDir: true,
      // Tauri 的 WebView 版本是明确的（Windows 走 WebView2、macOS 走 WKWebView），
      // 不需要迁就旧浏览器；target 取决于平台：Windows 是 x86_64-pc-windows-msvc，
      // macOS 是 aarch64/x86_64-apple-darwin。取 chrome105/safari13 是 Tauri 官方推荐下限。
      target: isDesktopBuild ? (process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13') : undefined,
      // 桌面版排查白屏时可临时 `--mode desktop --sourcemap`，默认不开
      sourcemap: false,
      // 主 bundle 约 1.4MB（React + React Flow + Markdown + KaTeX 样式都在这里）。
      // Web 部署时这是带宽问题，桌面端是本地读盘 —— 阈值放到 2000 只为不刷警告，
      // 不为掩盖问题：真正的拆分点（pdfjs / mammoth / 面板）本来就已经动态 import。
      chunkSizeWarningLimit: 2000,
    },
    // Tauri 会注入 TAURI_ENV_* 变量；不把 TAURI_ 加进前缀的话，
    // 前端代码里 import.meta.env.TAURI_ENV_PLATFORM 会是 undefined
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    define: {
      'import.meta.env.VITE_LLM_MODEL': JSON.stringify(llmModel),
      'import.meta.env.VITE_ENABLE_THINKING': JSON.stringify(env.ENABLE_THINKING === 'true'),
      'import.meta.env.VITE_COMMUNITY_API': JSON.stringify(env.COMMUNITY_API || ''),
    },
  };
});
