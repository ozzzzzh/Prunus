# HANDOFF — Prunus 交接文档

> 面向**跨设备 / 跨 Agent** 的接续开发。先读本文建立全局认知，再按需展开 `docs/` 下的专项文档。
>
> 本文只写「接续开发必须知道、但从代码里读不出来或极易读漏」的东西 —— 尤其是那些
> **看起来能改、改了会静默出错**的地方。代码是最终真相，本文的职责是让你知道**该去看哪段代码、以及为什么它是那样写的**。

当前版本标识：UI 左下角显示 **Prunus Core v0.1.21**（`components/layout/Sidebar.tsx`）。

---

## 0. 先确认仓库状态

**不要假设你在 main 上、也不要假设改动已经提交。** 交接时的实际状态：

| 项 | 值 |
|---|---|
| 当前分支 | `features/pdfReader`（**不是 main**） |
| 领先 main | 1 个提交 `7ffda7b 1.Add function for adding pdf file` —— 整个 PDF 微应用，34 文件 +2802 行，**未推送** |
| 未提交改动 | 见 `git status`（附件上限改造 + PDF 气泡改造 + canvas 注释） |
| 远端 | `https://github.com/ozzzzzh/Prunus.git` |
| Node 要求 | `^20.19.0` 或 `>=22.12.0`（Vite 8 的约束） |
| 测试基础设施 | **完全没有** —— 无测试脚本、无测试运行器依赖。验证一律在真实应用里做，见 §5 |
| lint 基线 | `npm run lint` **退出码 1**，共 **27 errors + 2 warnings / 17 文件**，见 §7 |

接手第一步：

```bash
git status && git log --oneline -5 && git branch --show-current
```

---

## 1. 这是什么

Prunus 是一个**树状对话管理器**：与线性聊天不同，可以从任意一条回复发散出多个分支平行推进，
每条分支各自携带自己的上下文。它同时是一个**微应用宿主** —— 第一个微应用是 PDF 阅读器，
让你在原文里选中一段就长出画布节点。

技术栈：React 19 + TypeScript 5.9 + Vite 8 + Zustand 5 + React Flow（`@xyflow/react` 12）
+ dagre（自动布局）+ Tailwind 4。数据全部在浏览器本地（IndexedDB），
只有主动发送的消息会经过用户自己配置的大模型服务。

---

## 2. 系统架构

### 2.1 分层

```
components/          视图层（画布、输入框、微应用、引导）
store/               Zustand 状态（9 个，见 2.2）
services/            状态 ↔ 存储的自动同步
repository/          仓储层（IndexedDB 实现）
utils/               纯逻辑（布局、Markdown、富文本、LLM 调用、PDF 解析…）
types/               数据模型
```

### 2.2 状态层 —— `src/store/` 共 9 个

**关键：持久化分两套系统，别搞混。**

- **zustand `persist` → localStorage**：只放**偏好**（uiStore、apiConfigStore）
- **IndexedDB（经 `persistenceService` 订阅）**：放**真正的数据**（sessionStore、folderStore、apiConfig）

| Store | 文件 | 管什么 | 自己持久化? | 键 |
|---|---|---|---|---|
| `useSessionStore` | `sessionStore.ts`（911 行） | 全部会话与节点 | ❌ 靠 persistenceService | — |
| `useUIStore` | `uiStore.ts` | UI / 引导 / 微应用面板状态 | ✅ | `prunus-ui-storage` |
| `useAPIConfigStore` | `apiConfigStore.ts` | LLM 凭据与配置 | ✅ | `prunus-api-config` |
| `useGenerationStore` | `generationStore.ts` | 流式内容暂存（避免逐 chunk 触发重排） | ❌ | — |
| `useFolderStore` | `folderStore.ts` | 文件管理器的文件夹树 | ❌ | — |
| `useDialogStore` | `dialogStore.ts` | confirm / prompt / toast | ❌ | — |
| `usePdfViewerStore` | `pdfViewerStore.ts` | 跨组件的"跳到某页"信号 | ❌ | — |
| `useNodeSizeStore` | `nodeSizeStore.ts` | 节点实测尺寸（内存） | ❌ | — |
| `useChatStore` | `chatStore.ts` | **已废弃**的兼容外壳 | ❌ | — |

`uiStore` 的 `partialize` 只保留 6 个键：`onboardingCompleted`、`dismissedHints`、`tourState`、
`tourStats`、`userHasInteracted`、`microAppWidth` —— 注意**"微应用面板开着没有"刻意不持久化**
（每次启动都是关的）。

**`chatStore.ts` 是废弃的 façade**：它的 state 是一堆转发到拆分后 store 的 getter，actions 也是转发，
文件头标着 `@deprecated`。**新代码不要再用它** —— 它的 `updateNodeContent(nodeId, content)`
签名已经落后（丢掉了 `metadataPatch` 参数）。但它仍被 `MessageNode.tsx` 与 `ChatInput.tsx` 引用，
清理时要一并迁移。

**`apiConfig` 同时存在于两处**（localStorage `prunus-api-config` + IndexedDB `settings` store）。

**`ChatSession` 定义在 store 文件里**（`sessionStore.ts:21-38`），不在 `types/` —— 找类型时别只翻 types 目录。

### 2.3 数据模型 —— `src/types/`

- **`PrunusNode`** 是 9 种节点的联合类型，靠 `type` 判别。**目前运行时只会产生 `ai-chat` 一种**
  （`note`/`todo`/`question`/… 全是预留，没有 UI 能创建）。
- **`BaseNode.metadata: Record<string, unknown>`** 是扩展槽 —— 附件、PDF 出处标记都塞在这里，
  **不给节点加新字段**。
- **`NodeMarker`**（🌱/🪵/🍃/🍑）语义见 `types/tour.ts:96`：
  - 🌱 种子 = 对话起点（根节点）
  - 🪵 树干 = 有多个分支方向的**分叉点**
  - 🍃 叶子 = 分支末端
  - 🍑 桃子 = **用户手动标记**的重要节点
  - `updateNodeMarkers()` 自动维护前三种：**🍑 被豁免**（永不被覆盖），根节点强制 🌱，
    非根按 `childrenIds.length` 在 🍃↔🪵 之间切换。插入节点时也即时改（父节点 🍃→🪵）。
- **附件** `NodeAttachment = { name, kind, size, text }`，存在 `metadata.attachment`。
  读取一律走 `getNodeAttachment()` 的**逐字段守卫**，不用 `as` 断言 —— metadata 可能来自
  **导入的 JSON**，脏数据只该让这个节点少显示一个角标，不该让整棵节点树渲染崩掉。
- **微应用类型** `types/microApp.ts`：两条边界写在文件头 —— ① 状态属于**会话**不属于应用；
  ② 微应用**不操作主应用**，只产出"摘录（原文 + 出处）"，由主应用决定节点长什么样。

### 2.4 持久化 —— 最需要小心的部分

**IndexedDB**：库名 `prunus-db`，版本 3。Object store：`sessions` / `nodes` / `settings` / `folders` / `pdfDocs`
（`nodes` 建了但**没被仓储层使用**）。版本升级时每个 store 都有 `contains` 守卫，老用户升级不丢数据。
`onblocked` 有显式处理 —— 否则 open 请求"永远不 settle"，应用卡在 Loading。

**⚠️ 保存粒度是「整表重写」。** `repository.session.saveAll()` 是**先清空整个 store 再批量写入**，
folders 同理。而 `enableAutoSave()` 订阅 sessionStore / apiConfigStore / folderStore 的引用变化，
经 **500ms 防抖**后触发 `saveAll()` —— 也就是说：

> **画布上任何一次节点改动，都会导致全部会话被整体重写一遍。**

这条约束解释了很多看起来奇怪的设计，改代码前务必理解：

- 多个 action 在"无实质变化"时**返回原 state 引用**，利用 Zustand 的引用比较跳过通知
  （`setSessionMicroApp`、`setNodesCollapsed`、`nodeSizeStore.commitBatch` 都有）
- `setSessionMicroApp` **刻意不更新 `updatedAt`** —— "读了几页不算会话有改动"
- PDF 面板的页码回写延迟 1500ms（`PAGE_FLUSH_MS`），因为"写会话会连带触发画布重排 + 整库防抖保存"

**PDF 二进制单独处理**：`pdfDocs` store 刻意排除在 `saveAll`/`exportAll`/`importAll` 之外 ——
几 MB 的二进制不该被防抖保存反复整表重写。会话只记 `docId`（内容哈希），
换设备后重新上传同一份文件即可按 hash 重新关联。

**`nodeSizeStore` 有一条隐蔽的硬约束**：尺寸上报**必须移出 ResizeObserver 回调**，
否则触发 `ResizeObserver loop completed with undelivered notifications`，中断投递轮回，
连带 React Flow 自己的测量一起失效 —— 表现是**节点和连线整片消失**。所以它用 rAF 缓冲批量提交。

### 2.5 微应用系统 —— `src/components/microapps/`

**这不是插件系统**，是一张长度为 1 的静态表（`registry.tsx`）。刻意不做沙箱、第三方加载、
权限模型、版本协商 —— "只用一个例子设计出来的扩展接口，几乎一定是错的"。

- `MicroAppHost.tsx` **常驻挂载**（App 无条件渲染它，它自己返回 `null`）。原因写在注释里：
  让它在 JSX 里保持位置是为了 `<main>` 的子元素下标稳定，否则 React 会重挂载
  `ReactFlowProvider`/`ChatCanvas`，**视口和选区都会丢**。
- 面板宽度拖动时**不逐帧写 store**，而是直接改 CSS 变量 `--micro-app-w`，松手才提交一次。
- 面板在视口 < 1024px（`MIN_VIEWPORT_PX`）时自动关闭。
- **`utils/microAppFocus.ts` 是防数据丢失的关键**：PDF 文本层是普通 `<div>`，选中文字后
  `document.activeElement` 仍是 `body`，所有 INPUT/TEXTAREA/contenteditable 守卫都会放行 ——
  于是"用户选完一段原文随手按 Delete，删掉的是画布上当前的节点"。
  `isMicroAppInteracting()` 同时检查**焦点**和**非折叠选区**，画布快捷键据此让路。

**加第二个微应用时**：在 `registry.tsx` 加一行；面板只能拿到 `sessionId`，拿不到 store。

### 2.6 LLM 调用链

**`llmApi.generateAIResponse(messages, onChunk?, options?)` 是彻底无状态的** ——
没有 `conversation_id`、没有 `store`、没有 `cache_control`。**每次都要把完整 messages 传进去。**

> 这一点曾在本项目内被误解为"服务端有记忆所以不用重发"，实际不存在。
> DeepSeek 的「上下文硬盘缓存」只是**前缀 KV 缓存**：省服务端的 prefill 计算和计费
> （命中约 1/10 价），**字节仍然每次重传，且不扩大上下文窗口**。
> 真正"只传一次"的形态是 Gemini 的显式 `CachedContent` 句柄那类 API，本项目没用。

两条协议：

- `openai` → 用 `openai` SDK。若 `baseUrl && apiKey` 都有则**直连用户自己的 provider**（BYOK）；
  否则 baseURL 变成 `${origin}/api/llm`，**真实 Key 由 Vite 代理在服务端注入**，前端只有占位符。
- `anthropic` → **原生 fetch + 手写 SSE 解析**，刻意不引 `@anthropic-ai/sdk`，以兼容
  GLM/Kimi/Qwen 等 Anthropic 协议端点。要求必须 BYOK（服务器代理只支持 OpenAI 协议）。

**请求组装在 `ChatInput.tsx` 的 `runSubmit`**，顺序很重要：

1. 建 user 节点；附件写进**该节点的 metadata**（不塞进 `content`，卡片才显示得干净）
2. **沿祖先链向上回溯**：只取 `role !== 'system'` 的 ai-chat 节点
   - 正文先经 `htmlToPlainText()` 摊平（画布上编辑过的节点存的是 HTML）
   - **附件沿整条祖先链注入**，不是只注入带附件的那一个节点 —— 因为调用无状态，
     只注入当前节点的话用户追问时模型就"忘了"文档。**代价是后续每条消息都重发整篇文档、重复计费**
     （这正是 `handleSubmit` 要做额度确认的原因）
   - **`history.unshift`** 所以最早的在最前
3. **`history` 没有任何长度/token 截断** —— 祖先链多长就发多长。
   上游靠"文档超限直接拒绝"而不是截断来兜底（见 §4.2）
4. 最后 unshift 一条 system（基础提示词 + 会话 `globalPrompt`）

**根节点是 `role: 'system'`，所以它不在 history 里。**

---

## 3. 功能清单

| 模块 | 能力 | 入口 |
|---|---|---|
| **画布** | 节点导航、镜头智能跟随与一键聚焦、节点收起/展开、一键收缩其余节点、新增子节点 | `ChatCanvas.tsx` |
| | 滚轮/双击缩放**刻意禁用**，画布只做平移（避免与文本选择、卡片内滚动冲突）；`nodesDraggable`/`nodesConnectable`/`elementsSelectable` 全为 false | `ChatCanvas.tsx` |
| **节点卡片** | 双击编辑、富文本（粗/斜/下划线/删除线/6 字色/5 高亮色）、标记、长按 0.3s 角标缩放、右键菜单（摘取-复制/移动）、Branch Out、思考过程折叠、PDF 出处角标、附件角标 | `MessageNode.tsx` |
| **输入框** | 发送（Enter）/ 换行（Shift+Enter）、附件上传与解析、大附件额度确认、"Replying to" 头、编辑态 | `ChatInput.tsx` |
| **节点总结** | 多选节点 → LLM 凝练成结构化总结（可加重自定义要求、可重生成、一键复制） | 画布右上「节点总结」→ `SummaryModal` |
| **会话背景** | 为单个会话设全局约束，附加到每条 system prompt 后（只影响之后的回复） | 画布右上「会话背景」→ `GlobalPromptModal` |
| **链路编辑** | 从根到当前叶子的单链路时间线视图，顺序阅读与连续编辑 | 叶子节点上的展开按钮 → `ExpandedView` |
| **文件管理** | 文件夹树、会话增删改、置顶、网格/列表、按日期/名称排序、导入会话 JSON | `FileManagerPage` |
| **节点搜索** | `Ctrl/Cmd+F` 或右上「搜索」；本地关键词搜（正文 > 标题 > 附件名），命中节点打**琥珀色**环；**零结果且存在社区后端时**才提供语义搜索（`jevClient`，逐节点请求、并发 8、取前 5） | `NodeSearchBar` + `utils/nodeSearch.ts` |
| **会话导入导出** | 单会话导出/导入 JSON（**不含凭据**、**不含 PDF 二进制**、只带 docId 引用；导入是**追加合并**，冲突重命名为「（导入）」副本，绝不覆盖本地） | `utils/sessionTransfer.ts` |
| **引导** | **15 步**动作校验式交互式引导（靠订阅 store 检测真实操作来推进）、欢迎页、情境提示、帮助面板 | `components/onboarding/` |
| **PDF 微应用** | 打开 PDF、选原文建节点（可挂到当前节点或根节点）、黄色记号笔、按住 Ctrl 点击记号跳回节点、缩放（Ctrl/Cmd+滚轮）、页码记忆、跨页跳转、扫描件提示 | `components/microapps/pdf/` |
| **设置** | 深度思考开关；CDK 模式显示剩余额度，BYOK 模式编辑协议/模型/Base URL/Key | `SettingsModal` |

**交互式引导的 15 步**（`types/tour.ts`）：`welcome-filemanager` → `open-session` → `welcome-canvas` →
`canvas-pan` → `observe-nodes` → `input-and-send` → `wait-response` → `click-node` → `keyboard-nav` →
`expand-node` → `expanded-view-input` → `expanded-view-intro` → `branch-out` → `edit-node` → `extract-content`

---

## 4. 硬约束与坑（改代码前必读）

### 4.1 React StrictMode 会吃掉"挂载前设置的状态"

`main.tsx` 包了 `<StrictMode>`。**任何"卸载时清理自己拥有的全局状态"的 cleanup，
都会在挂载后立刻被模拟卸载触发一次。**

真实案例：`MessageNode` 的卸载清理是 `if (ui.editingNodeId === node.id) ui.setEditingNode(null)`。
而"新增子节点"按钮是在节点**挂载之前**就设好 `editingNodeId` 的 ——
于是模拟卸载误判成"正在编辑的节点没了"，把刚设好的编辑态清掉。表现是**点了按钮、
节点建出来了，但编辑器不打开**。双击入口不会踩到，因为它是挂载**之后**才设的。

**规则**：cleanup 里清全局状态时，别只凭"所有权"判断，要凭"资源是否真的没了"。

### 4.2 文档超限是「拒绝」不是「截断」—— 这是故意的

历史上 `MAX_DOC_CHARS = 20000` 是**静默截断**，界面上只挂一个「已截断」徽标。那是个**正确性陷阱**：
真实样本 `1706.03762v7.pdf` 解析出 38,795 字符，被砍到 20,000，而 `slice(0, N)` 砍掉的是**尾部** ——
对论文来说正好是**结果、实验、结论**。用户拿到一个"看起来很完整、但完全不知道实验结果"的总结。

现在改为按 **token** 计量（不再用字符：同样 20,000 字符中文是 20,000 tokens、英文只有 5,000，
差 4 倍），超限**直接拒绝**并给出可操作提示。

**附带的一条 UI 教训**：那个标签曾经把「截断**前**的字数」和「截断**后**的 token 数」并排显示，
读起来就像"38,795 字 ≈ 5,000 tokens"（实际差 4 倍）—— 这正是"只支持 5000 tokens"这个误解的来源。
**同一个标签里的数字必须描述同一段文本。**

### 4.3 黄色高亮的 `pointer-events: none` 不能动

`PdfPageView` 里 PDF 记号笔固定 `pointerEvents: 'none'`（默认态），**只在按住 Ctrl/Cmd 时才变 `auto`**。
原因：可点击意味着它会拦下落在范围内的鼠标事件，那样**已标记区域里就选不了字**了 ——
而"选原文"是这个面板最常用的动作。

**推论**：任何"悬停高亮出提示"之类的需求，都不能靠给高亮加 `:hover` 实现，得用**几何命中检测**
（在页面层监听 mousemove，用归一化坐标比对）。

### 4.4 节点必须有显式尺寸，否则连线会整片消失

`ChatCanvas` 每次布局变化都用 `setNodes` 整体替换节点数组，新对象里没有 React Flow 自己的
`measured` 字段，而 DOM 尺寸没变、它的 ResizeObserver 不会再次触发 ——
于是节点永远学不回尺寸，**连接线算不出端点而整条消失**。
所以必须从 `resolveNodeSize(node, measuredSizes[id])` 显式提供 `width`/`height`。

**相关**：`onlyRenderVisibleElements`（视口剔除）是**刻意关掉**的 ——
节点高度内容自适应，未挂载的节点测不到高度，布局会算错并跳动。
"未挂载就不渲染"与"按真实内容高度布局"二者只能取其一。

### 4.5 画布组件是 `memo` + 自定义比较，加字段要同步

`MessageNode` 用 `memo(fn, arePropsEqual)`，而 `arePropsEqual` 是**字段白名单**比较
（React Flow 每次布局都重建 node 对象，`data` 引用必然变化，浅比较失效）。
**漏掉哪个字段，那个字段更新时节点就不刷新。**
相关的：`addQuotedNode` 之所以是独立 action，就是为了让正文与出处 metadata **在同一次 `set` 里写入** ——
分两次写的话第二次会被判成"没变化"，角标永远刷不出来。

### 4.6 编辑**不**按角色限制（一个已经误导过人的点）

任何**非流式**节点双击都能进编辑态 —— `handleDoubleClick` 只检查多选模式和流式状态。
`types/node.ts` 里的 `isNodeEditable` 是**死代码，全项目没有调用点**。
不要拿它当守卫，也不要以为 AI 卡片不能编辑。

### 4.7 Vite 代理的顺序不能调

`vite.config.ts` 里 `/api/llm`、`/api/tencent` 必须排在 `/api/` **之前** ——
Vite 按对象键的**插入顺序**匹配，`/api/` 在前会吞掉另外两个。（源码里有显式警告注释。）

### 4.8 不可变引用是承重结构

项目大量依赖"引用变没变"来决定是否重渲染 / 是否持久化。
**读-改-写必须在一次 `set` 里完成**；"返回原 state 引用"是被当作显式跳过信号在用的。

---

## 5. 如何验证（真实应用，不只有 typecheck）

**仓库没有任何测试基础设施**，所以验证一律要把应用跑起来。

```bash
npm install
npm run dev      # predev 会先跑 scripts/copy-pdfjs-assets.mjs 把 pdfjs 资源复制到 public/pdfjs/
```

⚠️ **`public/pdfjs` 被 gitignore**，由 `predev`/`prebuild` 从 `node_modules` 复制（带 `.version` 标记，
版本没变就不重复复制）。**若 `node_modules/pdfjs-dist` 不存在，脚本只打印警告并以 0 退出** ——
新克隆的仓库如果没先 `npm install` 就 `npm run dev`，PDF 侧载资源会静默缺失，
表现为**中文出方块字、标准字体文字丢失、wasm 降级**（不报错，只是画得不对）。
直接跑 `vite`（绕过 predev）同理。

```bash
npm run build    # tsc -b && vite build —— 类型检查是硬闸门
npm run preview  # 预览构建产物
```

用 Playwright 驱动时（`channel: 'msedge'` 即可，本机 Edge 预装、无需下载浏览器），
**有三道闸门必须先过**，否则会卡在配置页或被引导蒙层挡住：

1. **配置闸门**：应用会渲染 `LLMSetupScreen` 并阻断一切，直到
   `apiConfigStore.config.mode !== 'unconfigured'`。在 `addInitScript` 里播种 localStorage 键
   `prunus-api-config`（zustand persist 格式 `{state:{config:{…,mode:'byok'}},version:0}`）。
2. **引导闸门**：`InteractiveTour` 会在 ~1s 后自动启动，其蒙层会拦截指针事件，导致中途点击/双击失效。
   只有 `tourState.completedAt` 为真时才短路 —— 播种 localStorage 键 `prunus-ui-storage`。
3. **进画布**：`currentPage` 默认是 `fileManager`，要点 `[data-tour="example-file"]`（"或者查看示例文件 →"）
   才会调用 `loadExampleData()` 并切页。

**微应用（PDF）额外注意**：

- 打开入口是 `button[title="打开微应用"]`，然后按**菜单项文案**（`Prunus Paper`，即 `registry.tsx` 里的 `title`）点列表项 ——
  不是 `label`（`PDF`），那个只用在按钮上，列表里从不出现
- 用 `setInputFiles` 载入 `input[type="file"][accept*="pdf"]`
- IndexedDB 的 `sessions` store 里**不止一个会话**（启动时会另建一个空默认会话），
  `getAll()[0]` 的顺序没有意义 —— 取"节点最多的那个"，否则会对着空会话断言并产生幻觉式失败
- `DOMRect` **无法穿过 `page.evaluate`**（属性在原型上），必须先 `.toJSON()`
- 若要断言选区/命中几何，注意文本层 span 是按文本项切分的，**不是逐字**

---

## 6. 工程约定

**注释风格是这个项目最显著的特征**：注释量极大，且几乎全部在写**「为什么」**而不是「是什么」——
为什么这里要禁用一个特性、为什么这个值是这个数、踩过什么坑，经常**带实测数字**
（例如"16k 字符回复累计 45s 主线程时间，分段后 0.6s"）。改动时**请延续这个习惯**：
留下"为什么不那样做"比留下"这里做了什么"重要得多。多数非显然的取舍都有注释，
**动手前先读该文件头部和该函数上方**。

- **文案与注释一律中文**，代码标识符英文。
- **`cn()`**（`utils/cn.ts` = `twMerge(clsx(...))`）是拼接 class 的唯一方式。
- **用户反馈走 `useDialogStore`**：`showToast(message, {type})` / `showConfirm` / `showPrompt`。
  **原生 `alert/confirm/prompt` 是被禁的**（与设计系统割裂）。统一由 `DialogHost` 渲染，
  modal `z-[150]` / toast `z-[160]`（引导蒙层是 z-102/110，所以弹窗必须更高），toast 3s 自动消失。
- **错误处理**：解析类失败要抛**可读的中文错误**（调用方直接 toast），不要抛底层异常 ——
  用户看不懂 "Setting up fake worker failed"。
- **动态 import 是刻意为之**：mammoth（~300KB）、pdfjs（~2MB）都不进首屏包，
  代价是首次使用有加载延迟，**调用方必须准备 loading 态**。
- **可访问性**：图标按钮要有 `aria-label`；纯装饰元素 `aria-hidden`。
- **顺序敏感的调用**要写清楚，例如 `saveLocalPdf` 必须在 `getDocument` **之前**调用
  （pdf.js 会把 ArrayBuffer **转移**给 worker，之后不可再用）。

---

## 7. 已知问题与技术债

### 7.1 `docs/` 被 gitignore —— 跨设备最大的坑

`.gitignore` 有一行 `docs`，**本文档、`DECISIONS.md`、`ARCHITECTURE_0.21.0.md`、
`UI_UX_DESIGN_GUIDE.md` 全都没进版本控制**（`git ls-files docs` 为空）。
而 `DECISIONS.md` 开头明写"供跨机器 / 跨会话接续开发"。

**新克隆的仓库看不到这些文档**，接手 Agent 会连架构说明都没有。
修法（三选一）：

```gitignore
# A（推荐）—— 整个 docs/ 纳入版本控制，和它被写出来的目的相符
（删掉 `docs` 这一行）

# B —— 只放行交接文档，其余继续忽略
docs/*
!docs/HANDOFF.md
```

> ⚠️ B 必须写成 `docs/*` 而**不能**写成 `docs` + `!docs/HANDOFF.md`：
> git 的规则是**父目录被排除时无法再单独放行里面的文件**。

### 7.2 lint 现状（27 errors / 2 warnings / 17 文件）

`npm run lint` **退出码 1**。按规则分：

| 数量 | 规则 | 说明 |
|---|---|---|
| 10 | `@typescript-eslint/no-explicit-any` | — |
| **8** | `react-hooks/set-state-in-effect` | `FormatToolbar:25`、`ExpandedView:79`、`SettingsModal:24`、`ContextualHint:36`、`TourOverlay:42`、`InteractiveTour/index:33,65`、`useTourStepValidator:49` |
| 3 | `react-hooks/purity` | `TourCompletion` 里渲染期调 `Math.random()` |
| 2 | `no-useless-escape` | `MessageNode` 与 `ChatInput` 里同一个"剥 Markdown 记号"的字符类，其中 `\[` 是多余转义 |
| 2 | `exhaustive-deps`（警告） | `ChatCanvas`、`Sidebar` |
| 2 | `no-unused-vars` | `App.tsx`、`sessionStore.ts` |
| 1 + 1 | `no-case-declarations` / `prefer-const` | — |

**改代码时只比增量**，不要顺手全清。注意 `MessageNode` 里有**可复制的先例**：
它用"渲染期调整 state"绕开了 `set-state-in-effect`，注释还引了 React 官方文档
（`useState#storing-information-from-previous-renders`）—— 修那 8 条时可以照抄这个模式。

### 7.3 其他

| 问题 | 说明 |
|---|---|
| **流式卡顿（未修）** | 每来一个 chunk 都让节点重渲染并重新解析全部累积 Markdown（O(n²)）。`MarkdownText` 已实现**分块渲染**（`utils/markdownSegments.ts`）部分缓解，但 `DECISIONS.md` 记的修复方案（流式期间渲染纯文本 `<pre>`）未落地。两处说法需要对齐 |
| **双 lockfile** | `yarn.lock` 与 `package-lock.json` **都被 track**。实测 `npm install` 会顺手重写 `yarn.lock`，制造大量无意义 diff。建议删掉 `yarn.lock` 统一到 npm（部署配置用的是 npm） |
| **祖先链无截断** | §2.6 第 3 点。链一长 input token 线性增长，目前无任何上限 |
| **死代码/未用** | `isNodeEditable`（§4.6）；`@dnd-kit` 三件套依赖；`utils/devCounters.ts`（自述"临时诊断，排查完应连同调用点一并删除"）；`App.css`；`richtext.sanitizeHTML` / `handlePasteAsPlainText`；IndexedDB 的 `nodes` store |
| **`clearAllData()` 没接 UI** | 函数存在（会连 PDF 库一起清），但没有任何界面入口 |
| **节点 `title` 字段是死的** | 类型和搜索都读它，但**没有任何 UI 会写它** |
| **文件管理器没有搜索** | 画布有节点搜索，文件管理器没有 |
| **`QUICKSTART.md` 路径过时** | 它让人在仓库根跑 `./start.sh`，但脚本在 `scripts/` 下（正确写法见 README） |

---

## 8. 文档索引

| 文件 | 覆盖什么 | 会随 clone 一起走吗 |
|---|---|---|
| **本文** | 全局认知、硬约束、验证方法、仓库状态 | ⚠️ 取决于 §7.1 是否修 |
| `DECISIONS.md` | **决策理由**与已知问题。8 条决策 + 已知问题。"本文是'为什么'，架构文档是'是什么'，代码是'最终真相'" | ⚠️ 同上 |
| `ARCHITECTURE_0.21.0.md` | 架构全貌（40KB）。**§16 技术债**、**§17 v0.21.0 之后的增量变更** 尤其有价值 | ⚠️ 同上 |
| `UI_UX_DESIGN_GUIDE.md` | 设计系统：`leaf` 色板与 hex、状态→class 映射、圆角/阴影/间距规范、组件规格、图标选择、**反模式**。做新 UI 前必读 | ⚠️ 同上 |
| `QUICKSTART.md` | PM2 后台运行速查（注意 §7.3 的路径问题） | ⚠️ 同上 |
| `logoDesign.md` | 标志设计说明与 4 个方案提示词 | ⚠️ 同上 |
| `../README.md` | 对外介绍、快速开始、技术栈 | ✅ 会 |

**`DECISIONS.md` 里那 8 条决策**（若该文档丢失，这里留个索引）：
① Branch Out 本地优先 + LLM 兜底 ② 拆分结果原子创建（避免逐条触发 dagre 重排）
③ 跳过 `response_format: json_object`（provider 兼容性风险）④ 流式反馈降级为进度徽标
⑤ 对话框用全局 store + 单一挂载点 ⑥ 弹窗/Toast 的 z-index 分层（要盖过引导蒙层）
⑦ 会话背景是**追加**而非替换默认 system prompt ⑧ 多选用显式"选择模式"（左键已绑定 focusNode）

---

## 9. 构建与部署

**npm scripts**：`dev` / `build`（`tsc -b && vite build`，**类型错误会中止构建**）/ `lint` / `preview`
（`predev`、`prebuild` 自动跑 `scripts/copy-pdfjs-assets.mjs`）。**没有 `test`。**

**关键环境变量**（`.env.example`；真实值在 gitignore 的 `.env.local`）：

| 变量 | 作用 |
|---|---|
| `BASE_URL` | 部署子路径，默认 `/app/`。**构建期**值，开发环境强制 `/`，**在 dev 的 `.env.local` 里设它没用** |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 服务端代理模式的凭据（Key 不下发到浏览器） |
| `COMMUNITY_API` | 社区版后端地址。**留空即纯开源自托管**（不显示兑换码入口）。写成 `/` 时在**运行时**解析主机，同一份构建产物既能跑 IP 也能跑域名，且不触发 CORS |
| `ENABLE_THINKING` | 是否默认开启思考 |

`vite.config.ts` 用 `loadEnv(mode, cwd, '')`（**空前缀 = 加载全部环境变量**），
并把 `LLM_MODEL`/`ENABLE_THINKING`/`COMMUNITY_API` 经 `define` 编译进
`import.meta.env.VITE_*`。

**PM2 后台运行**：`scripts/start.sh` / `stop.sh` / `restart.sh` / `logs.sh`，
进程配置 `deploy/ecosystem.config.cjs`，日志写 `./logs/`。
⚠️ 配置里 `watch: false` —— **改代码不会热重载，必须 `./scripts/restart.sh`**。

**用户侧三种 LLM 接入**：① 服务端代理 + `.env.local`（自托管推荐，Key 不出服务端）
② BYOK（应用内填自己的 Key，支持 OpenAI 与 Anthropic 协议）
③ 社区版兑换码（需 `COMMUNITY_API`）。未配置时 App 会尝试匿名领取一次免费额度
（后端靠 Cookie 保持身份，重复请求返回同一个 token，所以刷新不会重置额度）。

---

## 10. 给接手 Agent 的建议顺序

1. 跑 §0 的命令，确认分支与工作区状态
2. **先解决 §7.1**（`docs/` 没进版本控制）—— 否则你在另一台设备上会连本文都看不到
3. 读本文 §4（硬约束），再看你要改的那个文件的**头部注释**
4. 改完按 §5 在真实应用里验证 —— **只过 typecheck 不算验证**
5. 提交前 `git diff --stat` 确认没有意外的 lockfile / 构建产物
6. 若发现本文与代码不一致：**以代码为准，并顺手修正本文**
