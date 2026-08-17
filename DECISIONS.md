# 决策记录与已知问题 (DECISIONS.md)

> 目的：记录**无法从代码推导出的"决策理由"**与**已知问题**，供跨机器 / 跨会话接续开发。
> 与 `ARCHITECTURE_0.21.0.md`（架构，含 §17 增量变更）和 `UI_UX_DESIGN_GUIDE.md`（设计规范）互补。
> 本文是"为什么"，架构文档是"是什么"，代码是"最终真相"。

---

## 一、决策记录

### 1. Branch Out 采用「本地结构化拆分优先 + LLM 兜底」
- **Why**：拆分慢的根因是 LLM 输出 token ≈ 输入长度（Prompt 要求"保留原文措辞"迫使模型重抄全文）。而带标题/编号列表的结构化回复可在本地 O(n) 切分，毫秒级完成。
- **How**：`MessageNode.handleSplit` 先 `splitContentLocally`，命中即用；未命中回退 `smartParseBranchesFromContent`（`temperature: 0` + `enableThinking: false`）。

### 2. 拆分结果原子创建节点
- **Why**：增量建节点会导致"每多一个分支就触发一次 dagre 重布局"→ 画布卡顿（呼应"流式卡顿"教训）。
- **How**：`splitNodeIntoBranches` 一次性写入所有子节点，不做逐条追加。

### 3. 跳过 `response_format: json_object`
- **Why**：有 provider 兼容性风险（不支持则整次调用失败，且被 `aiParser` 的 try/catch 静默吞掉，用户只看到"拆分失败"）；现有正则 `/\{[\s\S]*\}/` 已能稳健提取 JSON（含 markdown 围栏场景）。
- **How**：仅用 `temperature: 0` + `enableThinking: false`，靠正则提取 JSON。

### 4. 流式反馈降级为进度状态
- **Why**：解析结果是 JSON，只能在收尾时 parse，无法"流式出分支"；增量建节点又违反决策 2。
- **How**：拆分期间仅显示"分析中…"徽标。本地拆分是同步的，徽标实际只在 LLM 兜底时出现。

### 5. 对话框采用「全局 store + 单一挂载点」
- **Why**：浏览器原生 `alert/confirm/prompt` 与设计系统割裂；5 个调用点各自管理状态会重复且风格易漂移。
- **How**：`store/dialogStore.ts`（Zustand）+ `components/layout/DialogHost.tsx`（App 的 fileManager 与 canvas 两个分支均挂载）。

### 6. 对话框/Toast 的 z-index 分层
- **Why**：交互引导层（TourOverlay z-102 / TourCompletion z-110）很高，"跳过引导"确认弹窗必须盖过它。
- **How**：模态 `z-[150]`、Toast `z-[160]`。

### 7. 会话背景（全局提示词）追加而非替换默认 system prompt
- **Why**：保留"helpful assistant"基础设定，全局背景作为约束追加；完全替换会让用户失去基础能力，且需自行写全角色设定。
- **How**：`ChatInput` 构建 `基础提示词 + "\n\n" + globalPrompt`，`globalPrompt` 为空时退回默认。

### 8. 节点多选采用显式「选择模式」而非左键多选/框选
- **Why**：左键点击已绑定 `focusNode`（分支切换导航），多选与导航语义冲突；框选是"空间语义"，与树的"父子血缘语义"不匹配（空间相邻 ≠ 语义相关）。
- **How**：右上角按钮进入选择模式，点击切换选中，ESC 退出，根节点不可选。

---

## 二、已知问题

### 1. 流式响应卡顿（未修复）
- **现象**：LLM streaming 期间前端 UI 明显卡顿，生成完成后恢复。
- **根因**：`MessageNode.tsx` 流式期间用 `ReactMarkdown` 渲染累积的 `displayContent`，每个 chunk 触发 Zustand `set()` → 节点重渲染 → 对全部累积 markdown 重新解析。
- **计划修复（未落地）**：流式期间用 `<pre>` 纯文本渲染，结束后切回 `ReactMarkdown`。

### 2. 遗留技术债（见 ARCHITECTURE §16，部分已修复）
- 未使用组件：`WelcomeGuide` / `ContextualHint` / `useTourStepValidator` / `App.css`。
- 未使用依赖：`@dnd-kit` 三件套。
- `chatStore` 兼容门面仍被部分组件（`MessageNode`/`ChatInput`）使用，新旧 store 并存。
- `SettingsModal`（导出 `{sessions}`）与 `persistenceService.exportToJSON`（导出完整结构）两套导出逻辑不一致。

---

## 三、环境配置（当前实际运行）

- 模型：`deepseek-v4-flash`
- Base URL：`https://api.deepseek.com`
- `ENABLE_THINKING=false`
- 配置在 `.env.local`（gitignored，含 API Key）；`.env.example` 为模板。
- 开发启动：PM2 `npm run dev`（`ecosystem.config.cjs`，`watch: false`，改代码后需 `./restart.sh` 或手动重启）。
- 构建：`npm run build`（`tsc -b && vite build`）。
