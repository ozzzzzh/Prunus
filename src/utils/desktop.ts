/**
 * 桌面端（Tauri）适配层
 *
 * 为什么需要这一层：浏览器版有三条「靠同源活着」的路径，装进 WebView 里全都会断，
 * 而且断法各不相同，不提前处理的话用户看到的是三种互不相干的怪现象：
 *
 *   1. 未填 Key 时请求 `${window.location.origin}/api/llm`
 *      —— 那是 Vite 开发代理（见 vite.config.ts），桌面端没有 dev server，
 *      请求落到 `tauri.localhost` 上，404 / 连接失败，报错文案还指向 .env.local（用户看不懂）。
 *   2. `COMMUNITY_API=/`（同源写法）时，origin 变成 `tauri.localhost`，
 *      社区后端不在这儿 —— 兑换码、免费额度、语义检索全部静默失效。
 *   3. 直连 provider（BYOK）时，WebView 的页面 origin 是
 *      Windows 的 `http://tauri.localhost`、macOS/Linux 的 `tauri://localhost`。
 *      很多 provider 的 CORS 白名单只放行 https 源，预检（OPTIONS）被拒 ——
 *      表现是「请求发不出去」而不是 401，最容易被误判成 Key 填错。
 *
 * 处理原则：
 *   - 跨域请求一律交给 Rust 侧（tauri-plugin-http）发出，浏览器不参与，因此没有 CORS；
 *   - 同源代理 / 同源社区后端在桌面端判为「不可用」，把用户交还给配置闸门（BYOK），
 *     而不是让他在一个永远失败的路径上排查。
 *
 * 注意：本文件是**运行时**判定，不是构建期。同一份构建产物在浏览器里打开时，
 * 行为与改造前完全一致（全部走原生 fetch）。
 */

/**
 * 是否运行在 Tauri 容器里。
 *
 * Tauri 2 注入 `window.__TAURI_INTERNALS__`（`withGlobalTauri: false` 时也有，
 * 它服务于 IPC 本身）。`__TAURI__` 只在开了全局对象时存在，两个都认更稳。
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return '__TAURI_INTERNALS__' in w || '__TAURI__' in w;
}

/** 桌面端是否有「本地 LLM 代理」可用 —— 没有，代理是 Vite dev server 的东西 */
export function hasLocalLlmProxy(): boolean {
  return !isDesktop();
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let desktopFetch: FetchLike | null = null;
let desktopFetchLoading: Promise<FetchLike> | null = null;

/**
 * 取 Rust 侧的 fetch。
 *
 * 之所以动态 import：`@tauri-apps/plugin-http` 在浏览器里被静态引进来也只是死代码，
 * 但会让 Web 构建多带一份 IPC 胶水；动态 import 让它在 Web 侧根本不进包。
 * 加载失败时退回原生 fetch（宁可 CORS 失败，也不要整条链路抛「模块缺失」）。
 */
function loadDesktopFetch(): Promise<FetchLike> {
  if (!desktopFetchLoading) {
    desktopFetchLoading = (async () => {
      const mod = await import('@tauri-apps/plugin-http');
      desktopFetch = mod.fetch as unknown as FetchLike;
      return desktopFetch;
    })().catch(() => {
      // 拿不到就清缓存，别把一次失败钉死成永久失败
      desktopFetchLoading = null;
      return globalThis.fetch.bind(globalThis) as FetchLike;
    });
  }
  return desktopFetchLoading;
}

/**
 * 统一的 HTTP 入口：桌面端走 Rust，Web 端走原生 fetch。
 *
 * 供三处使用：LLM 对话、社区后端（CDK / 额度 / 语义检索）。
 * 签名与 `fetch` 对齐，因此可以直接作为 OpenAI SDK 的 `fetch` 选项传入。
 *
 * ⚠ 与浏览器 fetch 的两处差异（都是 plugin-http 的固有限制，使用时要知道）：
 *   - 不带 Cookie（没有浏览器 cookie jar）。社区后端的「免费额度靠 Cookie 认身份」
 *     因此在桌面端不成立 —— 桌面端只用 BYOK 和 CDK 兑换码。
 *   - 响应头做了规整（同名头会被合并），多值头（如 set-cookie）不要指望能拿到全部。
 */
export async function appFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (!isDesktop()) return globalThis.fetch(input, init);
  const f = desktopFetch ?? (await loadDesktopFetch());
  return f(input, init);
}

/** 给 OpenAI SDK 用的 fetch：SDK 不接受 this 绑定，必须是无副作用的裸函数 */
export const openAICompatibleFetch: FetchLike = (input, init) => appFetch(input, init);
