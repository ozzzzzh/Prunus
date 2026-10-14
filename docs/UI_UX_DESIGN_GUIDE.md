# Prunus UI/UX 设计规范

> 本文记录项目现有设计系统与近期功能（节点总结、会话背景）沉淀下来的 UI/UX 决策，作为后续前端开发的一致性与审美基准。
> 适用对象：前端工程师、UI/UX 工程师。新增 UI 时优先复用本文定义的组件与色彩，避免产生割裂感。

---

## 1. 设计原则

1. **一致性优先**：新功能一律复用既有色彩、圆角、阴影、组件骨架，不引入平行风格。
2. **渐进式披露**：次要操作收纳为浮层/弹窗；入口按钮在激活态于原位置变换（如"节点总结"→"生成总结(N)"），不跳转、不弹新页。
3. **状态可见**：按钮/节点在"已设置 / 已选中 / 激活 / 禁用"等状态有明确视觉差异。
4. **低割裂感**：所有新增 UI 沿用 `leaf` 主色、`rounded-2xl` 卡片、`backdrop-blur` 遮罩这一套既有视觉语言。

---

## 2. 色彩系统

色彩唯一来源：`src/index.css` 的 Tailwind v4 `@theme`（自定义色板）＋ Tailwind 默认 `gray` 色板。

### 2.1 主色：leaf（暖调绿）

主题来源：呼应"树 / Prunus"品牌意象，低饱和、偏暖，避免纯正绿的刺眼感。

| Token | 十六进制 | 用途 |
|-------|---------|------|
| `leaf-50` | `#f7faf6` | 主色最浅背景（选中态卡片底、提示条底） |
| `leaf-100` | `#eef4ec` | 图标容器背景、次级高亮底 |
| `leaf-200` | `#d5e5d1` | 选中态边框、编辑 ring、按钮激活描边 |
| `leaf-300` | `#b3cfac` | ring 高亮、分隔点缀 |
| `leaf-400` | `#8fb787` | 激活节点描边、focus 边框 |
| `leaf-500` | `#6a9e62` | 强调描边、状态点、`animate-pulse` 高亮 |
| `leaf-600` | `#4a7c44` | **主操作色**（primary 按钮、选中勾选徽标） |
| `leaf-700` | `#3d6538` | primary hover、主色正文 |
| `leaf-800/900` | `#345232 / #2a4229` | 深色文字/强调（较少用） |

### 2.2 中性色：gray（Tailwind 默认）

| Token | 用途 |
|-------|------|
| `gray-50` | 次级按钮 hover 底、输入区背景、表头底 |
| `gray-100` | 分隔线（`border-gray-100`）、ghost hover 底 |
| `gray-200` | 边框（卡片/输入框/按钮）、禁用按钮底 |
| `gray-400` | 弱化文字（说明、占位、图标） |
| `gray-500` | 次级正文 |
| `gray-600` | 正文默认色 |
| `gray-700` | 强调正文 |
| `gray-800` | 标题 |
| `gray-900` | 遮罩底（配合透明度） |

### 2.3 语义色

| 语义 | Token | 用途 |
|------|-------|------|
| 危险/删除 | `text-red-600` / `hover:bg-red-50` | 删除节点、清空（hover）、错误提示 |
| 思考/推理 | `amber-50 / amber-600` | 深度思考区块、"Thinking..." 状态 |
| 用户消息 | `green-300`（ring） | 展开视图中用户消息高亮环 |
| 桃粉点缀 | `blossom` / `blossom-light` | 品牌点缀，少量使用 |

### 2.4 状态色映射（统一约定）

| 状态 | 组合 |
|------|------|
| 默认 | `bg-white text-gray-600 border-gray-200` |
| 悬停 | `hover:text-leaf-600 hover:bg-leaf-50`（或 `hover:border-leaf-300`） |
| 激活/已设置/已选中 | `bg-leaf-50 text-leaf-700 border-leaf-200`（＋状态点或 ring） |
| 主操作 | `bg-leaf-600 hover:bg-leaf-700 text-white` |
| 禁用 | `bg-gray-200 text-gray-400 cursor-not-allowed` |

---

## 3. 圆角、阴影、间距

### 3.1 圆角（radius）

| 规格 | 用途 |
|------|------|
| `rounded-full` | pill 按钮、圆形标记/状态点、聚焦按钮 |
| `rounded-2xl` | 卡片、弹窗、输入框容器 |
| `rounded-lg` | 按钮（方形）、输入框、图标容器、右键菜单 |
| `rounded-md` | 小型工具按钮 |

### 3.2 阴影（shadow）

| 值 | 用途 |
|----|------|
| `shadow-sm` | 画布浮动按钮、状态卡片 |
| `shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)]` | **弹窗卡片**（标准） |
| `shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)]` | 底部输入框 |
| `shadow-[0_2px_12px_-2px_rgba(0,0,0,0.1)]` | 聚焦定位按钮 |

### 3.3 间距

| 规格 | 用途 |
|------|------|
| `px-4 py-2` | pill 按钮内边距 |
| `px-6 py-4` | 弹窗 header/footer |
| `px-3 py-2` | 文本输入框 |
| `gap-2` | 按钮组 / 弹窗 footer 按钮间距 |

---

## 4. 组件规范

### 4.1 画布浮动操作按钮（Canvas Floating Pill）

位置：画布右上角 `absolute top-4 right-4 z-10`，多按钮时用 `flex items-center gap-2` 成组。

结构（以"会话背景"为例）：
```tsx
<button className={cn(
  'flex items-center gap-1.5 px-4 py-2 text-sm rounded-full border shadow-sm transition-colors',
  active ? 'bg-leaf-50 text-leaf-700 border-leaf-200'   // 已设置态
         : 'bg-white text-gray-600 border-gray-200 hover:text-leaf-600 hover:bg-leaf-50'
)}>
  <BookOpen size={14} />
  会话背景
  {active && <span className="w-1.5 h-1.5 rounded-full bg-leaf-500" />}  {/* 状态点 */}
</button>
```

约定：
- 图标 + 文字，图标 `size={14}`，文字 `text-sm`。
- 有"已设置/激活"概念时，非空态用 leaf 浅色底 + 实心状态点 `bg-leaf-500`。
- 多个画布级入口（会话背景、节点总结）在同一 `flex gap-2` 组内，不散落。

### 4.2 模式切换工具栏（Selection Toolbar）

选择模式下替换入口区，含：顶部居中提示条 + 右上角"取消 / 主操作(N)"。

- 提示条：`absolute top-4 left-1/2 -translate-x-1/2 bg-leaf-50 border-leaf-100 text-leaf-700`，`pointer-events-none`（不挡节点点击）。
- 取消：ghost pill（`bg-white text-gray-600`）。
- 主操作：primary pill，带选中计数 `生成总结(N)`；`N=0` 时 `disabled`。

### 4.3 弹窗（Modal）

统一骨架（`SettingsModal` / `SummaryModal` / `GlobalPromptModal`）：

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-[2px]">
  <div className="bg-white rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)]
              w-full max-w-lg flex flex-col border border-gray-200 overflow-hidden">
    {/* header */}
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-leaf-100 text-leaf-700 flex items-center justify-center">
          <Icon size={16} />
        </div>
        <h2 className="text-lg font-bold text-gray-800">标题</h2>
      </div>
      <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full">
        <X size={20} />
      </button>
    </div>
    {/* body（可滚动） */}
    <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">...</div>
    {/* footer */}
    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">...</div>
  </div>
</div>
```

约定：
- 图标容器：`w-8 h-8 rounded-lg bg-leaf-100 text-leaf-700`，图标 `size={16}`。
- 标题 `text-lg font-bold text-gray-800`。
- 说明文字 `text-sm text-gray-500 leading-relaxed`。
- footer 左放弱操作（清空），右放 `取消 + 保存`（保存为 primary）。

### 4.4 按钮层级

| 层级 | 类 |
|------|-----|
| Primary | `bg-leaf-600 hover:bg-leaf-700 text-white font-medium rounded-lg px-4 py-2` |
| Secondary / Ghost | `text-gray-600 hover:bg-gray-100 rounded-lg px-4 py-2 text-sm` |
| 危险 | `text-red-600 hover:bg-red-50`（或 `hover:text-red-600`） |
| 禁用 | `disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed` |

### 4.5 文本输入（textarea）

```tsx
className="w-full min-h-[160px] text-sm border border-gray-200 rounded-lg px-3 py-2
           outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200 resize-y"
```
约定：focus 用 `focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200`。

### 4.6 节点选中态（MessageNode）

| 状态 | 组合 |
|------|------|
| 选中卡片 | `border-leaf-500 ring-2 ring-leaf-300 bg-white opacity-100` |
| 选中勾选徽标 | `-top-3 -left-3 w-8 h-8 rounded-full bg-leaf-600 text-white`（内放 `<Check size={16}/>`） |
| 收缩圆选中 | `border-leaf-500 ring-4 ring-leaf-200 scale-110` |
| 不可选（根节点） | `opacity-40` |

---

## 5. 图标选型（lucide-react）

图标统一来自 `lucide-react`，`size` 约定：工具按钮 `14`、弹窗标题容器 `16`、关闭 `20`。

| 图标 | 语义 |
|------|------|
| `Sparkles` | AI 生成 / 总结类入口 |
| `BookOpen` | 背景 / 上下文 / 知识 |
| `X` | 关闭 / 取消 |
| `Check` | 已选中 / 已复制 / 完成 |
| `Copy` | 复制 |
| `RefreshCw` | 重新生成 / 重试 |
| `Loader2` | 加载中（配合 `animate-spin`） |
| `Eraser` | 清空文本 |
| `Focus` | 聚焦定位 |
| `Maximize2` | 展开链路编辑 |
| `Tag` | 节点标记 |
| `SplitSquareHorizontal` | 分支拆分 |
| `Trash2` | 删除 |

---

## 6. 交互模式

### 6.1 选择模式（多选）
- 入口按钮点击进入选择模式，按钮原位变为"取消 + 生成总结(N)"。
- 点击节点切换选中（非根节点），双击/右键/方向键在选择模式下被屏蔽。
- `ESC` 退出选择模式。
- 选中计数实时显示在按钮上。

### 6.2 弹窗草稿
- 打开时读取当前值作为草稿，编辑不即时生效。
- `保存` 写入并关闭；`取消`/`X` 放弃；`清空` 仅清空草稿。

### 6.3 复制反馈
- 复制成功后按钮变为 `bg-leaf-100 text-leaf-700` + `Check` 图标 + "已复制"，约 2000ms 后复原。
- 剪贴板失败时降级到 `document.execCommand('copy')`。

### 6.4 加载态
- 统一 `Loader2 animate-spin` + 说明文字（如"正在总结 N 个节点..."），居中。

---

## 7. 复用清单（新增功能时优先复用）

| 要新增 | 复用/参考 |
|--------|-----------|
| 画布右上角新入口 | `ChatCanvas.tsx` 的按钮组 + §4.1 |
| 弹窗 | §4.3 骨架，参考 `GlobalPromptModal.tsx` / `SummaryModal.tsx` |
| 主按钮 | §4.4 Primary |
| 会话级文本配置 | `globalPrompt` 字段 + `setGlobalPrompt` + `GlobalPromptModal` |
| 多选/模式切换 | `uiStore` 的 `isSelectingMode` + `selectedNodeIds` + §6.1 |
| 复制 | `SummaryModal.tsx` 的 `handleCopy` |
| 状态点指示 | §4.1 的 `w-1.5 h-1.5 rounded-full bg-leaf-500` |

---

## 8. 反模式（避免）

- 引入非 leaf 的平行主色（如纯蓝、纯紫作为主操作色）。
- 使用非 `rounded-2xl` 的弹窗卡片、非 `backdrop-blur` 的遮罩。
- 在画布右上角堆叠多个独立 `absolute` 按钮而不成组。
- 弹窗内使用与 §4.4 不一致的按钮层级。
- 忽略 disabled / hover / loading 状态。
