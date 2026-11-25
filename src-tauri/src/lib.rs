//! Prunus 桌面端（Tauri 2）入口。
//!
//! 前端是纯 SPA，业务逻辑一律在 `src/` 里 —— 这一侧刻意只做一件事：
//! **把跨域 HTTP 从 WebView 移到 Rust**。
//!
//! 为什么必须这样：应用要直连用户自己填的大模型服务（BYOK）。WebView 的页面
//! origin 是 `http://tauri.localhost`（Windows）/ `tauri://localhost`（macOS），
//! 绝大多数 provider 的 CORS 白名单只认 https 源，浏览器 fetch 会在预检阶段被拒；
//! 而且 `tauri://` 这种非 http 协议的 origin 有些服务端连预检都解析不了。
//! 由 Rust 发请求没有同源策略，问题从根上消失。
//!
//! 权限收得很紧：只开 http 插件的 fetch 允许列表（见 capabilities/default.json），
//! 文件读写、shell、进程管理一个都没开 —— 这个应用确实不需要。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 前端 `src/utils/desktop.ts` 的动态 import 落到这个插件上。
        // 少了它，桌面端所有 LLM 请求都会退化成浏览器 fetch 并撞 CORS。
        .plugin(tauri_plugin_http::init())
        .setup(|_app| {
            // 后续如果要接单实例锁（plugin-single-instance）、
            // 或者给 WebView2 指定独立的数据目录，都放在这里。
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Prunus 启动失败：WebView 或资源初始化出错");
}
