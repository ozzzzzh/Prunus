# 桌面安装包（Tauri 2）构建指南

> 面向：把一个**纯前端 Vite SPA** 装成 Windows `.exe` / macOS `.dmg`。
> 本文只写「装成桌面应用」特有的东西；应用本身的架构见 `ARCHITECTURE.md`。
> 基准：Tauri 2.12 / @tauri-apps/cli 2.12 / tauri-plugin-http 2.9，2026-11。

---

## 0. 一句话结论

`src-tauri/` 已经就位，配置也写完了。你只需要补**工具链**（Rust + MSVC），然后：

```bash
npm install
npm run desktop:dev      # 开发，热更
npm run desktop:build    # 出安装包
```

---

## 1. 为什么不是「加个 tauri init 就完了」

这个项目有五条前提在 WebView 里不成立。配置层面的处理都在 `vite.config.ts`、
`tauri.conf.json`、`capabilities/default.json` 里；代码层面的在 `src/utils/desktop.ts`
以及三处调用点。逐条对照：

| # | Web 版的前提 | 装进 WebView 后的事实 | 处理 |
|---|---|---|---|
| 1 | 产物 base 是 `/app/`（部署在子路径） | Tauri 把 `frontendDist` 挂在**根**上，`/app/assets/...` 全部 404 → 白屏 | `--mode desktop` 强制 `base: '/'` |
| 2 | 未填 Key 时请求 `/api/llm`（Vite 开发代理注入 Key） | 没有 dev server，请求落到 `tauri.localhost` → 连接失败 | 桌面端**禁用**代理分支，直接要求 BYOK |
| 3 | 直连 provider 靠浏览器 fetch | 页面 origin 是 `http://tauri.localhost` / `tauri://localhost`，不在 provider 的 CORS 白名单里，预检就被拒 | 请求交给 Rust（`tauri-plugin-http`）发出，无同源策略 |
| 4 | `COMMUNITY_API=/`（同源后端） | `tauri.localhost` 后面没有后端 → 兑换码/免费额度/语义检索静默失效 | 桌面端把 `/` 判为不可用，退回纯 BYOK；`env.desktop` 里干脆留空 |
| 5 | 数据在浏览器 IndexedDB / localStorage | 位置变成 WebView 的数据目录，由 `identifier` 决定 | 保留 `identifier` 不变，并在下图说明数据在哪 |

第 3 条是最容易误判的：CORS 失败在前端看起来是「请求发不出去」，用户会以为是 Key 填错。

---

## 2. 一次性前置（只做一次）

### Windows

需要 **MSVC 生成工具 + Windows SDK + Rust**。WebView2 不用管 —— Windows 10/11 自带，
本机已装 158.0.4370.33。

```powershell
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override `
  "--quiet --wait --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621"
```

- 两条命令装完**重开一个终端**（PATH 是新的）。系统级安装，会弹 UAC。
- ⚠ **VS Code 的集成终端不算「新终端」**：它继承 VS Code 主进程的环境，而主进程如果是
  rustup 装之前起的，每个新标签都还是旧 PATH。要么重启 VS Code，要么用下面的兜底（已经做了）。
- 装完自查：`rustc -V`（要求 **≥ 1.90**，这是 tauri-plugin-http 2.9 的硬性下限）、
  `npx tauri info` 里 Environment 段应该全绿。
- 只装 Build Tools 不装完整 VS 就够；`--add` 的那两个组件是 MSVC 链接器和 SDK，缺一不可。

### macOS

```bash
xcode-select --install        # Command Line Tools
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

macOS 上没法交叉出 dmg —— `.dmg` 必须在 macOS 机器上打。Windows 机器只能出 Windows 包。

---

## 3. 配置清单（已写好，逐项说明）

### `src-tauri/tauri.conf.json`

| 字段 | 值 | 为什么 |
|---|---|---|
| `productName` | `Prunus` | 决定安装后开始菜单/应用名 |
| `version` | `0.1.21` | 与侧边栏显示的 `Prunus Core v0.1.21` 对齐；**升级版本只改这里和 package.json** |
| `identifier` | `com.prunus.desktop` | **决定 WebView 数据目录**。改它 = 用户所有会话/Key 丢失，上线后不要动 |
| `build.devUrl` | `http://localhost:5173` | 与 `vite.config.ts` 的 `port + strictPort` 配套 |
| `build.beforeBuildCommand` | `npm run build:desktop` | 构建前先跑 `copy-pdfjs-assets` + `tsc -b` + `vite build --mode desktop` |
| `build.frontendDist` | `../dist-desktop` | 与 Web 的 `dist/` 分开，两边 base 不同，混用必白屏 |
| `app.windows[0].dragDropEnabled` | `false` | 关掉 Tauri 的原生拖放拦截，否则 HTML5 拖拽事件收不到 |
| `app.security.csp` | `null` | 默认不开 CSP（见 §7「可选加固」） |
| `bundle.targets` | `all` | 按平台出原生包：Windows → NSIS + MSI；macOS → dmg + app |
| `bundle.windows.nsis.installMode` | `currentUser` | 装到 `%LOCALAPPDATA%`，不弹 UAC。要装到 Program Files 就改 `perMachine` |
| `bundle.windows.webviewInstallMode` | `downloadBootstrapper` + `silent` | 缺 WebView2 的机器上静默补装；内网无外网时换成 `offlineInstaller` |
| `bundle.macOS.minimumSystemVersion` | `10.15` | WKWebView 的下限，够用 |

### `src-tauri/capabilities/default.json`

只放行 `core:default` + `http:default`，并且 HTTP 的允许列表是 `https://*` / `http://*`
（因为 BYOK 的 Base URL 是用户自己填的，事先不知道域名）。**没有**开文件系统、shell、
进程管理 —— 这个应用确实不需要。要收窄就改成白名单域名，例如只放
`{ "url": "https://api.deepseek.com" }`。

### `src-tauri/Cargo.toml`

`tauri-plugin-http = "2.9"` 与 npm 的 `@tauri-apps/plugin-http ~2.9.0` **必须同代**。
这两个包靠 IPC 约定传响应体，错配的典型症状是「状态码和响应头到了，body 永远读不出来」——
流式对话直接卡死，而且不报错。

### 新增/改动的脚本

| 命令 | 做什么 |
|---|---|
| `npm run desktop:dev` | `tauri dev`：先起 Vite（5173），再编译 Rust 并打开窗口 |
| `npm run desktop:build` | `tauri build`：出安装包 |
| `npm run desktop:build:nsis` | 只出 NSIS（跳过 MSI，省掉 WiX 下载） |
| `npm run desktop:build:mac` | 通用二进制 + dmg（**只能在 macOS 上跑**） |
| `npm run desktop:icons` | 从 `src-tauri/app-icon.png` 重新生成整套图标 |
| `npm run build:desktop` | 只出前端产物到 `dist-desktop/`（调试打包问题用） |

`desktop:*` 这几个都经过 `scripts/desktop-run.mjs`：它在 spawn `tauri` 之前检查
`%USERPROFILE%\.cargo\bin` 是否在 PATH 里，不在就临时前置（只影响本进程树，不改系统设置）。
这不是洁癖 —— 见 §8 第 2 条，这个坑的表现是「明明装了 Rust，却报 program not found」。

图标源图由 `python scripts/make-app-icon.py` 从 `src/assets/PrunusLogoHighQuality.jpg`
生成（居中裁方 + 1024×1024）。换 logo 时重跑这两条命令。

---

## 4. Windows 构建

```powershell
cd D:\Bussiness\Project\Prunus\Prunus
npm install
npm run desktop:build
```

首次构建会下载并编译约 400 个 crate，**10–25 分钟**（之后增量 1–3 分钟）。
产物：

```
src-tauri/target/release/prunus.exe                                        ← 免安装可执行
src-tauri/target/release/bundle/nsis/Prunus_0.1.21_x64-setup.exe           ← 双击安装（推荐分发）
src-tauri/target/release/bundle/msi/Prunus_0.1.21_x64_zh-CN.msi            ← MSI（企业部署）
```

安装到 `%LOCALAPPDATA%\Prunus`，无需管理员。

**只想要 NSIS**（WiX 要从 GitHub 下载，国内经常卡）：

```powershell
npm run desktop:build:nsis
```

---

## 5. macOS 构建

在 macOS 上，同一份代码：

```bash
npm install
npm run desktop:build:mac      # universal-apple-darwin + dmg,app
```

产物：

```
src-tauri/target/universal-apple-darwin/release/bundle/dmg/Prunus_0.1.21_universal.dmg
src-tauri/target/universal-apple-darwin/release/bundle/macos/Prunus.app
```

- **通用二进制**（Intel + Apple Silicon）用 `--target universal-apple-darwin`；
  只给自己机器用时去掉它，构建快一倍。
- **未签名**的包在别人机器上会被 Gatekeeper 拦（"已损坏，无法打开"）。自用两步：
  ```bash
  xattr -cr /Applications/Prunus.app
  codesign --force --deep --sign - /Applications/Prunus.app
  ```
- **正式分发**需要 Apple Developer ID（$99/年）：`codesign` 用 Developer ID Application
  证书 + `xcrun notarytool submit` 公证 + `xcrun stapler staple`。Tauri 支持通过环境变量
  自动完成：`APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_SIGNING_IDENTITY` /
  `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`，配上后直接 `tauri build` 即可。

---

## 6. 数据放在哪（升级/卸载前必看）

| 平台 | 位置 | 内容 |
|---|---|---|
| Windows | `%LOCALAPPDATA%\com.prunus.desktop\EBWebView\` | IndexedDB（`prunus-db`：会话/文件夹/PDF/截图）+ localStorage（API 配置、引导状态） |
| macOS | `~/Library/WebKit/` 与 `~/Library/Application Support/` 下的 `com.prunus.desktop` | 同上 |

推论：

- **覆盖安装升级不会丢数据**（路径只跟 `identifier` 有关）。
- **改 `identifier` 等于清库**。
- 卸载器默认不动这个目录（`currentUser` 模式），重装还能接上；确实要清干净就手动删。
- **PDF 与截图在 IndexedDB 里**，几百 MB 不稀奇；WebView2 默认配额足够，但别指望能
  导出一份"可迁移的库"—— 目前 `exportToJSON` 只导出结构化数据，不含二进制（这是刻意的，
  见 `ARCHITECTURE.md` §11.1）。

---

## 7. 构建后验证清单（照做，别只看构建成功）

1. 首次启动应停在 **BYOK 配置页**（`COMMUNITY_API` 为空 → 不显示兑换码入口）。
2. 填 `https://api.deepseek.com` + Key + `deepseek-v4-flash` → 发一条消息，**文字要流式出现**。
   流式失败 = plugin-http 版本错配或 body 读不出来（§3）。
3. 把协议切到 **Anthropic** 再发一条 —— 这条走原生 fetch + SSE 解析，与 OpenAI SDK 是两条路。
4. 打开一份**中文 PDF**：文字层不能是方块（验证 `pdfjs/cmaps` 被正确复制进 `dist-desktop`）。
5. 截图问答（带图请求）：验证多模态内容块在 Rust 侧序列化正常。
6. 关掉应用再打开：会话、文件夹、API 配置都在。
7. 侧边栏导出会话 JSON（`a.download` + blob）：WebView2 会弹系统保存对话框。如果没反应，
   见 §8 第 4 条。
8. 复制类操作（`navigator.clipboard.writeText`，出现在总结弹窗/提示词面板/引导里）：
   Windows 上是安全上下文，正常；macOS 上若被拒，见 §8 第 5 条。

### 可选加固：CSP

现在 `csp: null`（Tauri 默认，等于不设）。这个应用会渲染 LLM 返回的 Markdown 并且开了
`rehype-raw`，所以值得收一次。把 `app.security.csp` 换成：

```json
"csp": "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' ipc: http://ipc.localhost https: http:"
```

逐项理由：`'unsafe-inline'` 是 Tailwind/React Flow 的内联样式；`'wasm-unsafe-eval'` 是
pdf.js 的 WASM 解码（JBIG2/JPEG2000）；`worker-src blob:` 是 pdf.js worker；
`connect-src` 里同时留 `https:` 和 `http:` 是因为 Base URL 由用户填（本地 Ollama 是 http）。
**改完必须重跑 §7 的 1–5 条**，CSP 出问题的表现是「功能静默失效」，控制台才有报错。

---

## 8. 已知坑

1. **白屏 + 控制台一堆 404 `/app/assets/...`**
   用了 Web 的 `dist/` 或者忘了 `--mode desktop`。桌面构建必须走 `npm run build:desktop`。
2. **`failed to run 'cargo metadata' ... program not found`（明明装了 Rust）**
   终端的环境是旧的：rustup 把 `%USERPROFILE%\.cargo\bin` 写进用户 PATH，但**已经启动的进程
   不会重读环境变量**。VS Code 集成终端尤其容易中招（主进程先起，新标签继承它那份旧环境）。
   `desktop:*` 脚本已内置兜底；要手动修就在当前窗口执行：
   ```powershell
   $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
   cargo -V    # 应输出 cargo 1.x
   ```
3. **`tauri dev` 打开空窗口**
   Vite 端口被占（比如 PM2 里那个 `prunus-dev` 还在跑）。`strictPort: true` 会让 Vite 直接
   报错而不是悄悄换端口 —— 先 `./scripts/stop.sh` 或改 `devUrl`。
4. **`npm run desktop:build` 卡在下载 WiX / NSIS**
   用 `desktop:build:nsis` 跳过 MSI；NSIS 走的是 GitHub Release，必要时挂代理或手动把
   `%LOCALAPPDATA%\tauri\NSIS` 放好。
5. **导出 JSON 没反应**
   WebView2 默认会弹系统下载框；某些精简版 WebView2 运行时把下载禁了。兜底方案：换成
   `@tauri-apps/plugin-dialog` 的 `save()` + `@tauri-apps/plugin-fs` 写文件，
   在 `Sidebar.handleExport` 里按 `isDesktop()` 分支。
6. **macOS 上复制按钮无效**
   `tauri://localhost` 是否被 WKWebView 视为安全上下文不确定。若实测失败，装
   `@tauri-apps/plugin-clipboard-manager`，在 `openAICompatibleFetch` 同层的适配文件里
   按 `isDesktop()` 切换实现。
7. **Streaming 卡住、只有第一段回复**
   一定是 `tauri-plugin-http`（Rust）与 `@tauri-apps/plugin-http`（JS）小版本不一致。
   两边都锁在 2.9，只在**同时**升级。
8. **Windows SmartScreen 报警**
   未签名必然如此。正式分发需要代码签名证书（EV 证书可免 SmartScreen 警告），
   配置 `bundle.windows.certificateThumbprint` 或 `signCommand`。
9. **`yarn.lock` 与 `package-lock.json` 同时在库**
   老问题（见 `HANDOFF.md` §7.3）。`npm install` 会顺手改写 `yarn.lock`，制造上千行无意义 diff。
   桌面构建一律用 npm。

---

## 9. 之后要动的地方

- 加版本：改 `package.json` 与 `src-tauri/tauri.conf.json` 的 `version`，两处必须一致。
- 自动更新：`bundle.createUpdaterArtifacts: true` + `@tauri-apps/plugin-updater` + 一个签名密钥
  （`tauri signer generate`），再配 `plugins.updater.endpoints`。
- 体积：主 bundle 1.4MB、pdfjs 侧载资源 3.3MB、KaTeX 字体若干 —— 桌面包本身是本地读盘，
  不值得为此做代码拆分对抗。
