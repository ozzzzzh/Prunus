# Prunus 项目架构文档

## 0. 文档说明

- **用途**：记录项目当前状态，作为后续开发、维护、以及 AI 辅助理解代码的参考。
- **阅读优先级**：以自然语言（AI/LLM）解析为主，人工阅读为辅。因此本文采用结构化、确定性、少修辞的表述；所有文件路径为实际路径，所有职责描述基于源码而非推测。
- **生成日期**：2026-08-14
- **代码版本基准**：git 分支 `userGuidance`，最近提交 `1121129`（Update Interactive tour experience / Update node rendering to avoid 全局渲染导致的卡死）。

---

## 1. 项目概述

Prunus 是一个**树状/网状对话管理应用**。核心概念是：一次与 AI 的对话不再是一条线性消息流，而是一棵由节点（Node）和父子关系（Edge）构成的对话树。用户可以从任意节点发散出多个平行分支，系统按"当前节点到根节点"的路径构建上下文并请求大模型。

核心能力：

1. **树状对话流**：每个会话（Session）包含一棵节点树。节点可展开/收缩，可切换焦点。
2. **智能分支拆分（Branch Out）**：对 assistant 节点内容调用大模型做结构化解析，拆分为一个大纲节点和若干子节点。
3. **上下文链构建**：请求大模型时，沿当前节点向上追溯到根节点，收集路径上的对话内容作为上下文。
4. **流式响应**：SSE 流式生成，流式内容暂存于独立 store，结束后一次性写入会话 store。
5. **深度思考（Reasoning）**：支持 GLM-5 等模型的思考过程流式展示与折叠。
6. **文件管理**：文件夹树组织会话，支持置顶、重命名、移动、删除、网格/列表视图。
7. **节点编辑与富文本**：双击节点进入 contentEditable 编辑，支持加粗/斜体/下划线/删除线/文字颜色/背景高亮，以及"摘取"（复制/移动选中内容为兄弟节点）。
8. **本地持久化**：IndexedDB 存储会话、文件夹、设置；支持导出/导入 JSON。
9. **新用户引导**：多阶段交互式引导（InteractiveTour）+ 帮助面板 + 快捷键。

---

## 2. 技术栈（以 package.json 为准）

| 类别 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | ^19.2.4 |
| 语言 | TypeScript | ~5.9.3 |
| 构建工具 | Vite | ^8.0.1 |
| 状态管理 | Zustand | ^5.0.12 |
| 画布/图 | @xyflow/react（React Flow） | ^12.10.2 |
| 图自动布局 | dagre | ^0.8.5 |
| LLM 客户端 | openai（OpenAI SDK） | ^6.33.0 |
| Markdown 渲染 | react-markdown + remark-gfm + rehype-raw | ^10.1.0 |
| Markdown→HTML 管道 | unified + remark-parse/remark-rehype/rehype-* | ^11.0.5 |
| 动画 | framer-motion | ^12.42.2 |
| 图标 | lucide-react | ^1.7.0 |
| 样式 | Tailwind CSS + tailwind-merge + clsx + tailwindcss-animate | ^4.2.2 |
| 进程管理（部署） | PM2 | — |

注意：`README.md` 中标注为 "React 18" 和 "Yarn"，但实际 `package.json` 使用 React 19，且同时存在 `package-lock.json` 与 `yarn.lock`。文档以 `package.json` 为准确来源。

---

## 3. 系统架构总览

项目采用**前端单体应用**架构，无独立后端。LLM 请求通过 Vite 开发服务器代理转发，以隐藏 API Key。数据全部本地化存储。

### 3.1 分层结构

```
┌─────────────────────────────────────────────────────────┐
│  组件层 (src/components/)                                 │
│  App.tsx 组织布局；各页面/面板/节点组件读写 store          │
├─────────────────────────────────────────────────────────┤
│  状态管理层 (src/store/)                                  │
│  Zustand store：session / folder / ui / generation /     │
│  apiConfig；chatStore 为向后兼容门面                       │
├─────────────────────────────────────────────────────────┤
│  服务层 (src/services/)                                   │
│  persistenceService：store ↔ IndexedDB 自动同步、迁移、    │
│  导入导出                                                 │
├─────────────────────────────────────────────────────────┤
│  数据访问层 (src/repository/)                             │
│  IndexedDB 的抽象接口与实现                               │
├─────────────────────────────────────────────────────────┤
│  工具层 (src/utils/)                                      │
│  LLM 调用、结构化解析、自动布局、迁移、富文本、cn、IndexedDB│
├─────────────────────────────────────────────────────────┤
│  类型层 (src/types/)                                      │
│  领域模型（节点/会话/文件夹/引导步骤）与类型守卫             │
└─────────────────────────────────────────────────────────┘
```

### 3.2 数据流（关键路径）

**消息发送 → 流式响应 → 持久化**

```
ChatInput.handleSubmit
  → sessionStore.addMessage('user', ...)          // 创建用户节点
  → 构建上下文链（当前节点向上到根，排除 system）
  → sessionStore.addMessage('assistant', '', ...) // 创建空 assistant 节点
  → generationStore.setGeneratingNodeId(aiNodeId) // 进入生成态
  → llmApi.generateAIResponse(..., onChunk)       // 流式请求
      → onChunk: generationStore.appendStreamingContent/Reasoning
  → 流结束：sessionStore.updateNodeContent(aiNodeId, streamingContent, reasoning)
  → sessionStore.focusNode(aiNodeId)
  → generationStore.reset()（延迟 100ms）
  → persistenceService.enableAutoSave 的订阅触发 debouncedSave → saveAll → IndexedDB
```

**持久化初始化**

```
App.tsx useEffect → initPersistence()
  → repository.init()（打开 IndexedDB）
  → 加载 sessions / folders 到对应 store
  → enableAutoSave()（订阅三个 store 变化）
```

---

## 4. 目录结构

```
Prunus/
├── index.html                     # HTML 入口
├── package.json                   # 依赖与脚本
├── vite.config.ts                 # Vite 配置 + LLM 代理
├── tsconfig*.json                 # TypeScript 配置
├── eslint.config.js               # ESLint 配置
├── ecosystem.config.cjs           # PM2 配置
├── start.sh / stop.sh / restart.sh / logs.sh  # PM2 管理脚本
├── .env.example / .env.local      # LLM 配置（.env.local 不入库）
├── README.md / QUICKSTART.md      # 说明文档
├── public/                        # 静态资源（favicon、icons）
└── src/
    ├── main.tsx                   # React 挂载入口
    ├── App.tsx                    # 应用根组件/布局
    ├── App.css / index.css        # 样式
    ├── example.json               # 示例数据（旧格式）
    ├── types/                     # 领域类型
    ├── store/                     # Zustand 状态
    ├── repository/                # 数据访问抽象
    ├── services/                  # 持久化服务
    ├── utils/                     # 工具函数
    ├── hooks/                     # 自定义 Hook
    └── components/
        ├── canvas/                # 画布与节点
        ├── chat/                  # 输入框与富文本工具栏
        ├── expanded/              # 链路编辑视图
        ├── layout/                # 侧边栏与设置弹窗
        ├── pages/                 # 文件管理页面
        └── onboarding/            # 引导相关组件
```

---

## 5. 入口层

### index.html
单页应用挂载点。定义 `<div id="root">`，引入 `/src/main.tsx`。favicon 指向 `/src/assets/PrunusLogoHighQuality.jpg`。页面标题 "Prunus"。

### src/main.tsx
React 入口。使用 `createRoot` 在 StrictMode 下渲染 `<App />`，引入全局样式 `index.css`。

### src/App.tsx
应用根组件，职责：

1. **持久化初始化**：`useEffect` 中调用 `initPersistence()`，完成后调用 `enableAutoSave()` 并置 `isInitialized`。
2. **页面路由（状态机）**：依据 `uiStore.currentPage` 在 `fileManager`（文件管理页）与 `canvas`（画布）之间切换。二者不是 URL 路由，而是 store 状态驱动的条件渲染。
3. **画布视图布局**：
   - `Sidebar`（可折叠）
   - 顶部导航栏（面包屑 + 会话标题）
   - `ReactFlowProvider` 包裹 `ExpandedView`（展开模式）或 `ChatCanvas`（画布模式）
   - `ChatInput`
4. **全局浮层**：`SettingsModal`、`HelpPanel`、`InteractiveTour`。
5. **面包屑计算**：根据 `activeSessionId` 在 `folderStore.items` 中向上追溯父文件夹路径。

关键状态依赖：`useSessionStore`、`useFolderStore`、`useUIStore`。

---

## 6. 类型层（src/types/）

### types/node.ts
定义节点领域模型，是全项目最核心的类型文件。

- `NodeType`：九种节点类型的联合类型（`note`/`todo`/`question`/`idea`/`reference`/`image`/`code`/`link`/`ai-chat`）。设计上预留了笔记类扩展，但当前实际运行时只使用 `ai-chat`。
- `AIRole`：`'user' | 'assistant' | 'system'`。`Role` 为向后兼容别名（标注 `@deprecated`）。
- `BaseNode`：所有节点的公共字段（`id`、`parentId`、`childrenIds`、`type`、`title?`、`content`、`metadata`、`createdAt`、`updatedAt`、`collapsed?`、`marker?`）。
- `NodeMarker`：`'🌱' | '🪵' | '🍃' | '🍑'`，节点语义标记。
- `AIChatNode`：AI 对话节点，额外含 `role`、`reasoning?`、`reasoningCollapsed?`。
- 其余节点类型（Note/Todo/Question/Idea/Reference/Image/Code/Link）为扩展定义。
- `PrunusNode`：所有节点类型的联合类型。
- **类型守卫**：`isAIChatNode`、`isNoteNode` 等九个函数。
- `isNodeEditable(node)`：assistant 角色不可直接编辑，其余可编辑。
- `getNodeIcon(node)`：返回节点显示图标（emoji）。

### types/session.ts
- `Session`：一个会话，即一棵节点树。含 `id`、`title`、`nodes`（`Record<string, PrunusNode>` 扁平存储）、`rootNodeId`、`currentNodeId`（当前焦点节点）、时间戳、`pinned?`、`archived?`、`tags?`、`metadata?`。
- `SessionSummary`：侧边栏列表用的摘要。
- `toSessionSummary(session)`：从完整会话生成摘要。

### types/folder.ts
文件系统的文件夹/会话项模型。

- `FolderItem`：扁平存储项，`type: 'folder' | 'session'`，`parentId`（null 表示根目录），`sessionId?`（仅 session 项）。
- `TreeNode`：运行时构建的树节点。
- `buildTree(items)`：扁平结构 → 树结构，并按"置顶优先 > 文件夹优先 > order 倒序"排序。
- `getDescendantIds(items, folderId)`：BFS 获取所有后代 ID（用于级联删除）。
- `isDescendant(items, sourceId, targetId)`：判断 target 是否为 source 后代（防循环移动）。
- `getChildren(items, parentId)`：获取直接子项。

### types/tour.ts
交互式引导的模型与配置。

- `TourPhase`：`0|1|2|3|4|5` 六阶段。
- `TourStep`：单个引导步骤（`target` 为 CSS 选择器，`placement`、`spotlight`、`requireConfirm`、`allowSkip`、`exampleInput` 等）。
- `TourState` / `TourStats`：引导运行状态与统计。
- `TOUR_STEPS`：14 个引导步骤的静态配置，分布在 5 个阶段（Phase 0 文件管理、Phase 1 画布、Phase 2 发消息、Phase 3 节点导航、Phase 4 高级功能）。
- `getStepsByPhase` / `getTotalSteps`：辅助函数。

### types/index.ts
类型统一出口，re-export `node`、`session`、`folder`（不含 `tour`，`tour` 由各文件直接导入）。

---

## 7. 状态管理层（src/store/）

状态由多个独立 Zustand store 管理。这是后期重构的产物：早期只有一个 `chatStore`，现已拆分为职责单一的多个 store。

### store/sessionStore.ts
**会话与节点的核心 store**（未持久化到 localStorage，由 persistenceService 同步到 IndexedDB）。

- 状态：`sessions: Record<string, ChatSession>`、`activeSessionId`。
- `ChatSession` 接口在此文件内定义（与 `types/session.ts` 的 `Session` 类似但独立）。
- 会话操作：`createSession`、`switchSession`、`deleteSession`、`renameSession`、`togglePinSession`。
- 节点操作：
  - `addMessage(role, content, parentId?)`：在指定父节点（默认当前节点）下创建节点，更新父节点 `childrenIds` 与标记（`🍃→🪵`），设置 `currentNodeId`。
  - `addBranchedMessages(role, contents[], parentId?)`：批量创建兄弟节点。
  - `updateNodeContent(nodeId, content, reasoning?)`：更新内容与思考过程。
  - `toggleNodeReasoningCollapse(nodeId)`：折叠/展开思考过程。
  - `deleteNode(nodeId)`：递归删除节点及其子树，更新父节点 childrenIds 与 currentNodeId。
  - `splitNodeIntoBranches(nodeId, outline, branches[])`：将节点拆分为大纲 + 多个子节点。
  - `focusNode(nodeId)`：切换当前焦点节点。
  - `setNodeMarker(nodeId, marker)`：设置节点标记。
  - `toggleNodeCollapse(nodeId)`：切换节点收缩。
  - `updateNodeMarkers(sessionId)`：批量重算节点标记（根→🌱，有子且为叶→🪵，无子且为干→🍃，🍑 不受影响）。
- 批量操作：`importSessions`、`exportSessions`、`loadExampleData`（从 `example.json` 迁移并载入）。

节点 ID 生成：`generateId()` 使用 `Math.random().toString(36).substring(2,9)`。

初始状态：创建一个空的默认会话（根节点为 system 角色），不自动加载示例数据。

### store/folderStore.ts
文件夹树 CRUD（未持久化到 localStorage，由 persistenceService 同步）。

- 状态：`items: Record<string, FolderItem>`。
- 文件夹操作：`createFolder`、`renameFolder`、`renameItem`、`deleteFolder`（级联）、`moveItem`（带循环检测）、`createSessionItem`、`deleteSessionItem`。
- UI 操作：`toggleCollapse`、`togglePin`、`expandAll`、`collapseAll`、`reorderItems`。
- 批量：`importItems`、`exportItems`、`loadExampleFolderItem`。
- 辅助：`getTree`（调 `buildTree`）、`getItem`。

### store/uiStore.ts
**UI 状态 store**，使用 `persist` 中间件持久化到 localStorage（key `prunus-ui-storage`）。

- 页面状态：`currentPage`（`'canvas' | 'fileManager'`）、`setCurrentPage`。
- 布局状态：`sidebarCollapsed`、`isSettingsOpen`、`theme`（预留）、`canvasZoom`（预留）、`editingNodeId`。
- 引导状态：`onboardingCompleted`、`showHelpPanel`、`dismissedHints`。
- 展开模式：`expandedNodeId`、`setExpandedNode`、`exitExpandedView`。
- 交互式引导：`tourState`、`startTour`/`advanceTourStep`/`skipTourStep`/`skipTour`/`completeTour`/`resetTour`、`tourStats`、`incrementTourStat`。
- 用户行为追踪：`userHasInteracted`（6 个布尔标记）、`recordUserInteraction`。
- `partialize` 仅持久化：`onboardingCompleted`、`dismissedHints`、`tourState`、`tourStats`、`userHasInteracted`。

### store/generationStore.ts
**流式生成状态 store**（不持久化）。

设计目的：流式内容暂存于此，避免每个 chunk 都触发 sessionStore 更新导致画布布局重算。

- 状态：`generatingNodeId`、`streamingContent`、`streamingReasoning`、`isReasoning`、`error`。
- 操作：`setGeneratingNodeId`、`appendStreamingContent`、`appendStreamingReasoning`、`setIsReasoning`、`setError`、`reset`、`isGenerating`。

### store/apiConfigStore.ts
**API 配置 store**，使用 `persist` 持久化（key `prunus-api-config`）。

- `APIConfig`：`model`、`enableThinking`。
- 默认值从 `import.meta.env.VITE_LLM_MODEL` 和 `VITE_ENABLE_THINKING`（由 vite.config.ts 注入）读取。
- 注意：API Key 与 Base URL 不在该 store 中，改由 `.env.local` + Vite 代理管理。

### store/chatStore.ts
**向后兼容门面 store**（标注 `@deprecated`）。

- 早期统一 store，现通过 getter 与 action 委托到上述拆分 store。
- 保留旧 API（`addMessage`、`splitNodeIntoBranches`、`focusNode` 等）供旧代码调用。
- 实际仍有部分组件（`MessageNode`、`ChatInput`）通过它调用 `focusNode`/`splitNodeIntoBranches`/`addMessage` 等。

### store/index.ts
store 统一出口，re-export 各 store。

---

## 8. 持久化层

### repository/interface.ts
数据访问抽象接口（为切换数据源预留）：

- `ISessionRepository`：session 的 getById/getAll/save/delete/saveAll/clear。
- `ISettingsRepository`：API 配置与通用键值读写。
- `IFolderRepository`：folder 项 CRUD 与按 parentId 查询。
- `IPersistenceRepository`：组合上述三者 + init + exportAll/importAll。

### repository/indexedDBRepository.ts
上述接口的 IndexedDB 实现，含四个类：

- `IndexedDBSessionRepository`
- `IndexedDBSettingsRepository`（内部以 `apiConfig` 为 key 存配置）
- `IndexedDBFolderRepository`
- `IndexedDBRepository`（组合类，构造函数装配三者）

### repository/index.ts
导出接口与实现，并创建单例 `repository = new IndexedDBRepository()`。

### services/persistenceService.ts
**Store ↔ IndexedDB 同步的核心服务**。

- `initPersistence()`：打开 DB，加载 sessions 到 sessionStore、folders 到 folderStore（均在有数据时）。
- `enableAutoSave()`：订阅 sessionStore / apiConfigStore / folderStore 变化，变化时触发 `debouncedSave`。
- `debouncedSave()`：500ms 防抖后调用 `saveAll`。
- `saveAll()`：将三个 store 的当前状态全量写入 IndexedDB（先 clear 再 saveAll，避免残留）。
- `disableAutoSave()`：关闭自动保存。
- `exportToJSON()`：导出 `{version, exportedAt, sessions, apiConfig, folderItems}`。
- `importFromJSON(json)`：解析并导入，随后重新 `initPersistence`。
- `clearAllData()`：清空 DB 与 store。
- **迁移逻辑**：`needsMigration()`（folder 表空但有 session 时）、`migrateSessionsToFolderItems()`（把旧 session 转成 FolderItem）、`cleanDuplicateFolderItems()`（同一 sessionId 去重）。迁移标记常量 `MIGRATION_KEY` 已定义但当前未写入使用。

### services/index.ts
持久化服务的统一出口。

### utils/indexedDB.ts
IndexedDB 底层封装。

- 数据库 `prunus-db`，版本 2。
- Store 表：`sessions`（keyPath `id`，索引 createdAt/updatedAt）、`nodes`（keyPath `id`，索引 sessionId/createdAt）、`settings`（keyPath `key`）、`folders`（keyPath `id`，索引 parentId/createdAt）。
- 单例连接 `getDB()`。
- 通用操作：`transaction`、`saveData`、`getData`、`getAllData`、`deleteData`、`clearStore`、`saveBatch`、`queryByIndex`。
- 注：`nodes` 表已创建但当前业务未使用（节点内嵌在 session 中）。

---

## 9. 工具层（src/utils/）

### utils/llmApi.ts
LLM 调用核心。

- `generateAIResponse(messages, onChunk?, options?)`：使用 OpenAI SDK，`baseURL` 指向本地代理 `${origin}/api/llm`，`apiKey` 为占位符（真实 key 由 Vite 代理注入）。
- 流式：`stream: true`，遍历 `chunk.choices[0].delta` 提取 `content` 与 `reasoning_content`，逐 chunk 回调。
- `options.enableThinking` 映射为 GLM-5 的 `thinking: { type: 'enabled' | 'disabled' }` 请求参数。
- Safari 兼容：UA 检测并附加 Accept 头。
- 错误映射：连接错误、401、403（Safari 专项提示）、404（模型不存在）等转为友好错误信息。

### utils/aiParser.ts
`smartParseBranchesFromContent(content)`：调用大模型对长文本做结构化拆分。Prompt 要求返回 `{outline, branches[]}` JSON。正则提取 JSON 对象，解析失败则回退为 `{outline: content, branches: []}`。

### utils/layout.ts
`getLayoutedElements(nodes, edges, direction)`：使用 dagre 做树状自动布局。

- 动态 `nodesep`：根据兄弟节点收缩比例在 200px（全展开）与 224px（全收缩）之间插值。
- 动态 `ranksep`：收缩节点占比 > 50% 时 70px，否则 150px。
- 展开节点宽 480/高 350，收缩节点 56×56。
- 位置计算：左边缘 = dagre 中心 − 收缩宽度/2，Y = dagre 中心 − 收缩高度/2（保证展开时向右、向下扩展，顶部位置稳定）。

### utils/migration.ts
旧数据 → 新数据迁移。

- `LegacyNode` / `LegacySession`：旧格式（节点有 `role`/`timestamp`，无 `type` 字段）。
- `migrateNode(legacyNode)`：旧节点 → `AIChatNode`（补 `type: 'ai-chat'`、`metadata: {}`、时间戳映射）。
- `migrateSession` / `migrateData`：会话级/全局迁移。
- `detectVersion(data)`：版本探测。
- `createAIChatNode(params)` / `createRootNode(id)`：创建新节点/根节点的工厂函数（根节点为 system 角色，标记 🌱）。

### utils/richtext.ts
富文本编辑工具集（基于 `document.execCommand` 与 Selection/Range API）。

- 颜色常量：`HIGHLIGHT_COLORS`、`TEXT_COLORS`。
- 选区管理：`saveSelection`/`restoreSelection`/`saveSelectionRange`/`restoreSelectionRange`/`clearSelection`。
- 格式化：`applyFormat`、`toggleBold/Italic/Underline/Strikethrough`、`toggleHighlight`、`toggleTextColor`、`formatHighlight`、`formatTextColor`、`removeFormat`、`clearFormat`。
- 检测：`hasFormat`、`isBold`、`isItalic`、`hasBackgroundColor`、`hasTextColor` 等。
- 摘取功能：`hasSelection`、`getSelectedHTML`、`deleteSelection`、`deleteHTMLContent`。
- Markdown→HTML：`markdownToHtml`（unified 管道）。
- 其他：`handlePasteAsPlainText`、`sanitizeHTML`（注：这两个函数当前未被任何文件引用）。

### utils/cn.ts
`cn(...inputs)`：`clsx` + `tailwind-merge` 合并类名。

---

## 10. 组件层（src/components/）

### components/canvas/ChatCanvas.tsx
画布组件，基于 React Flow。

- 订阅 sessionStore，将 `session.nodes` 映射为 React Flow `nodes`（type `message`）与 `edges`。
- 计算激活路径（当前节点向上到根），用于边的高亮（`isPath`）与节点高亮（`isCurrentFocus`）。
- 使用 `getLayoutedElements` 做 dagre 布局。
- 自动聚焦：当前节点变化时 `setCenter` 平滑移动到该节点。
- 键盘导航（方向键切换节点、C 收缩/展开、Delete 删除）——绑定在 `window.keydown`。
- 画布交互配置：禁止节点拖拽/连线/框选，滚轮平移，中/右键拖拽。
- "聚焦"按钮：定位到正在生成节点或当前节点。

### components/canvas/MessageNode.tsx
**节点渲染组件**（项目最大的组件，约 837 行），承载单个节点的显示与交互。

- 三种渲染态：
  1. **收缩态**（`collapsed` 且有 marker）：渲染为 56×56 圆形标记按钮 + NodeToolbar tooltip。
  2. **普通态**：卡片式渲染（宽 480px），含角色图标、marker、推理内容、主内容。
  3. **编辑态**：contentEditable 编辑。
- 主内容用 `ReactMarkdown`（remark-gfm + rehype-raw）渲染，`preprocessMarkdown` 规范化引号。
- Reasoning 展示：可折叠的"思考过程"区块，流式时显示 streamingReasoning。
- 流式订阅优化：仅当前 streaming 节点订阅真实流式内容，其余返回空值避免重渲染。
- 交互：
  - 点击（非激活）→ focusNode。
  - 双击 → 进入编辑（Markdown 转 HTML 后载入 contentEditable）。
  - 失焦 → 保存内容到 sessionStore。
  - 标记按钮（Tag）→ 弹出 NodeToolbar 选择 🌱/🍃/🪵/🍑 或移除。
  - 收缩按钮 → toggleNodeCollapse。
  - Branch Out 按钮（仅 assistant 叶子节点、激活态）→ `smartParseBranchesFromContent` + `splitNodeIntoBranches`。
  - 展开按钮（仅叶子节点、激活态）→ `setExpandedNode` 进入链路编辑。
  - 右键菜单（Portal 到 body）：删除节点；编辑态下支持"复制摘取"/"移动摘取"（创建兄弟节点）。
- 内容滚动：内容区有内部滚动条，捕获 wheel 事件避免冒泡到画布平移。

### components/chat/ChatInput.tsx
输入框与消息发送逻辑（核心交互）。

- 发送流程见 §3.2。关键点：
  - `addMessage('user', ...)` 创建用户节点。
  - 沿 `userNodeId` 向上到根构建 `history`（排除 system 节点），头部插入 system 提示。
  - 先创建空 assistant 节点，再流式填充。
  - 流式 chunk 写入 generationStore，结束后一次性 `updateNodeContent`。
  - 错误时创建 system 节点记录错误信息。
- 输入法组合（composition）处理，避免中文输入时误触发 Enter 发送。
- 顶部区域显示 "Replying to" 当前节点摘要；编辑模式下显示格式二级菜单。
- 编辑模式下自动检测选区格式（selectionchange 事件）以弹出对应格式菜单。

### components/chat/FormatToolbar.tsx
富文本格式工具栏。

- `FormatToolbar`：三个主按钮（文本格式 Type、文字颜色 Palette、背景高亮 PenTool），`isExpanded` 控制展开动画。
- `FormatSubMenu`：对应三个二级菜单，含加粗/斜体/下划线/删除线按钮，以及颜色/高亮色块。通过 `execCommand` 与选区保存/恢复实现格式化。

### components/expanded/ExpandedView.tsx
**链路（展开）编辑视图**。

- 进入条件：`uiStore.expandedNodeId` 非空（由画布叶子节点的"展开"按钮触发）。
- 从展开节点向上到根构建 `chainNodes` 单链路，以时间线卡片形式竖向展示。
- 顶部工具栏（返回按钮，ESC 退出）、编辑模式下的格式工具栏。
- `TimelineNode` 子组件：单个节点的时间线卡片，支持双击编辑、流式内容展示、推理展示。用户消息右对齐，AI 消息左对齐。

### components/layout/Sidebar.tsx
左侧文件夹树侧边栏。

- 使用 `folderStore.getTree()` 获取树，分区显示置顶项与普通项。
- 节点渲染（递归 `renderNodes`）：文件夹（可折叠箭头、图标）、会话（MessageSquare 图标）、置顶标记（Pin）。
- 右键菜单（`ContextMenu` 组件）：新建子文件夹、新建对话文件、置顶、移动、重命名、删除。
- 移动对话框（`MoveDialog`）：选择目标文件夹（排除自身及其后代）。
- 底部：Help & Shortcuts、Settings 按钮、版本号 "Prunus Core v0.1.21"。

### components/layout/SettingsModal.tsx
设置弹窗。

- 深度思考开关（toggle，写入 `apiConfigStore.enableThinking`）。
- 数据导出（将 `sessions` 导出为 JSON 文件下载）。
- 注意：导出仅含 sessions，不含 folderItems / apiConfig（与 persistenceService.exportToJSON 不同）。

### components/pages/FileManagerPage.tsx
全屏文件管理页面。

- 视图模式：网格 / 列表切换。
- 排序：按时间 / 按名称。
- 面包屑导航（文件夹层级）。
- 新建文件夹 / 新建对话文件。
- 右键菜单：新建、置顶、重命名、删除。
- 空状态引导 + "查看示例文件"（调 `loadExampleData` + `loadExampleFolderItem`）。

### components/onboarding/（引导相关）

#### onboarding/index.ts
桶导出：ContextualHint、HelpPanel、WelcomeGuide、InteractiveTour。

#### onboarding/InteractiveTour/index.tsx
交互式引导协调器。

- 依据 `uiStore.tourState` 判断是否启动引导（首次访问延迟 1s 自动启动；中断后可续）。
- 通过 `createPortal` 渲染 `TourOverlay`（引导中）或 `TourCompletion`（刚完成 5s 内）。
- `currentStep` 由 `tourState.completedSteps.length` 索引 `TOUR_STEPS` 得出。

#### onboarding/InteractiveTour/TourOverlay.tsx
引导遮罩层与卡片。

- 定位目标元素（`step.target` 选择器），可选聚光灯（spotlight）效果（四块半透明遮罩 + 高亮框）。
- 步骤验证：订阅 sessionStore / uiStore 变化，针对不同 step.id 判断用户是否完成操作（发消息、点击节点、分支拆分、编辑、退出展开、键盘导航等）。
- 自动推进（无 `requireConfirm` 且验证通过时 500ms 后 advance）；`requireConfirm` 步骤需用户点"下一步"。
- 卡片定位（基于目标 rect 与 placement），示例输入复制按钮，进度条。

#### onboarding/InteractiveTour/TourCompletion.tsx
引导完成弹窗，展示统计（消息/分支/导航/编辑）与彩带动画，支持重新开始引导。

#### onboarding/HelpPanel.tsx
右侧滑出帮助面板：核心功能、快捷键列表、操作提示。

#### onboarding/WelcomeGuide.tsx
首次访问的模态引导（分步介绍核心概念）。
**注**：该组件已实现并导出，但当前未被 `App.tsx` 挂载，属于未使用组件。

#### onboarding/ContextualHint.tsx
轻量情境提示气泡组件（包裹目标元素，显示提示，可关闭并记录）。
**注**：当前未被任何组件引用，属于未使用组件。

---

## 11. Hooks

### hooks/useTourStepValidator.ts
- `useTourStepValidator(stepId)`：根据 store 状态验证引导步骤是否完成（switch-case 处理多种 stepId）。
- `useInitTourValidationState()`：记录初始状态。
**注**：该文件中的两个 Hook 均未被任何组件导入。引导验证逻辑实际由 `TourOverlay.tsx` 内部通过 store 订阅独立实现，此文件为重复/遗留代码。

---

## 12. 样式层

### src/index.css
- 引入 Tailwind CSS v4。
- 自定义主题色（`@theme`）：`leaf`（暖调绿）、`cream`、`olive`、`blossom`（桃粉）色板。
- 基础样式：html/body/#root 高度 100%、背景 #fafafa、字体栈。
- `.canvas-texture`：噪点纹理（SVG feTurbulence）。
- `.custom-scrollbar`：自定义滚动条样式。
- `.prose`：Markdown 渲染样式（段落、代码、代码块、列表）。
- contentEditable 光标与选区样式、`.editing-mode` 文本可选样式。

### src/App.css
遗留的 Vite 模板样式（`.counter`、`.hero`、`#center` 等）。
**注**：该文件未被 `main.tsx` 或任何组件导入，属于未使用文件。

---

## 13. 核心数据模型总结

- **Session**（`ChatSession`）：一个对话文件，即一棵节点树。节点以 `Record<nodeId, PrunusNode>` 扁平存储，通过 `parentId`/`childrenIds` 表达树关系；`currentNodeId` 表示当前焦点。
- **PrunusNode**：节点联合类型，当前实际仅使用 `AIChatNode`（`role: user/assistant/system`）。
- **FolderItem**：文件系统项（文件夹或会话），扁平存储 + `parentId` 表达层级。
- **节点标记（NodeMarker）语义**：`🌱` 种子（根/起点）、`🪵` 树干（有多个子节点的分叉点）、`🍃` 叶子（末端，可继续生长）、`🍑` 桃子（手动标记的重要节点）。

---

## 14. 关键业务流程

### 14.1 消息发送与流式响应
见 §3.2。核心设计：**流式内容先入 generationStore（高频、低开销），结束后一次性写入 sessionStore（触发画布重布局）**，避免每个 chunk 都触发全树 dagre 布局。

### 14.2 上下文链构建（Context Awareness）
`ChatInput.handleSubmit` 中，从用户新节点向上遍历 `parentId` 直到根，收集路径上所有非 system 节点内容，`unshift` 成 `history`，再在头部插入 system 提示。这样每个分支的上下文是"当前分支到根"的精确链路，不污染其他分支。

### 14.3 智能分支拆分（Branch Out）
`MessageNode.handleSplit` → `smartParseBranchesFromContent(node.content)`（大模型返回 `{outline, branches}`）→ `splitNodeIntoBranches(nodeId, outline, branches)`（当前节点内容替换为 outline，标记 🪵，创建若干 🍃 子节点）。

### 14.4 自动布局
`ChatCanvas` 依赖 `collapsedStates`（所有带标记节点的收缩状态拼接串）作为 `useMemo` 依赖，收缩状态变化时重新 dagre 布局。`layout.ts` 根据收缩比例动态调整节点间距。

### 14.5 持久化
Store 变化 → `enableAutoSave` 的订阅 → `debouncedSave`（500ms）→ `saveAll`（全量写 IndexedDB）。启动时 `initPersistence` 从 IndexedDB 加载。另有旧数据 → FolderItem 的迁移逻辑。

### 14.6 数据迁移
旧格式节点（`role`/`timestamp`，无 `type`）→ `migrateNode` 转换为 `AIChatNode`。`example.json` 即为旧格式，通过 `loadExampleData` 迁移载入。

### 14.7 新用户引导
`InteractiveTour` 首访自动启动 → `TourOverlay` 逐步骤验证用户操作 → 完成弹窗。引导状态持久化在 `uiStore`（localStorage）。

---

## 15. 配置与部署

### vite.config.ts
- 插件：`@vitejs/plugin-react`、`@tailwindcss/vite`。
- dev server：`host: '0.0.0.0'`，端口 5173。
- 代理：
  - `/api/llm` → `LLM_BASE_URL`（环境变量），`proxyReq` 注入 `Authorization: Bearer <LLM_API_KEY>`，隐藏 API Key。
  - `/api/tencent` → 腾讯云 API（保留）。
- `define`：注入 `VITE_LLM_MODEL`、`VITE_ENABLE_THINKING` 编译时常量。

### .env.example / .env.local
- `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`。
- `.env.local` 不入库（gitignore `*.local`），保护 API Key。

### ecosystem.config.cjs + shell 脚本
- PM2 管理 `prunus-dev` 进程（`npm run dev`），自动重启、日志文件（`logs/pm2-out.log`、`logs/pm2-error.log`）。
- `start.sh`/`stop.sh`/`restart.sh`/`logs.sh` 为 PM2 操作封装。

### 脚本（package.json scripts）
- `dev`：vite
- `build`：`tsc -b && vite build`
- `lint`：eslint .
- `preview`：vite preview

---

## 16. 技术债与观察（基于源码检查）

以下为代码审查中发现的、与项目状态相关的事实，供后续处理参考：

1. **流式渲染性能**：`MessageNode.tsx` 在流式生成期间仍使用 `ReactMarkdown` 渲染 `displayContent`（含累积的 streamingContent）。每个 chunk 触发 Zustand `set()` → 节点重渲染 → 对全部累积 markdown 重新解析，内容越大越慢。历史上曾计划改为流式期间用纯文本 `<pre>` 渲染、结束后切回 ReactMarkdown，但当前代码未体现该修复（详见 §16 上下文，属于待验证/待处理项）。
2. **未使用依赖**：`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities` 在 `package.json` 中声明，但源码无任何引用。
3. **未使用组件/代码**：
   - `components/onboarding/WelcomeGuide.tsx`（已实现未挂载）。
   - `components/onboarding/ContextualHint.tsx`（已实现未引用）。
   - `hooks/useTourStepValidator.ts`（两个 Hook 均未引用，功能与 TourOverlay 重复）。
   - `utils/richtext.ts` 中的 `handlePasteAsPlainText`、`sanitizeHTML`（未引用）。
   - `src/App.css`（Vite 模板遗留，未导入）。
4. **重复状态门面**：`store/chatStore.ts` 为向后兼容门面，部分新组件仍在使用它（如 `MessageNode`、`ChatInput`），新旧 store 并存。
5. **两套导出逻辑**：`SettingsModal` 直接导出 `{sessions}`；`persistenceService.exportToJSON` 导出 `{version, sessions, apiConfig, folderItems}`。二者不一致。
6. **文档与实现不一致**：`README.md` 写 "React 18"、包管理器 "Yarn"，实际为 React 19，且 `package-lock.json` 与 `yarn.lock` 并存。
7. **迁移标记未使用**：`persistenceService.ts` 中 `MIGRATION_KEY` 常量已定义但未写入 localStorage，迁移是否重复执行缺少持久化开关。
8. **IndexedDB `nodes` 表**：已建表但当前未使用（节点内嵌在 session 中），`utils/indexedDB.ts` 的 `queryByIndex` 仅在 folder 按 parentId 查询时使用。
9. **类型系统预留**：`types/node.ts` 定义了九种节点类型，但运行时仅使用 `ai-chat`，其余为未来扩展预留。
