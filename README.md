# Prunus

**像树一样思考。**

Prunus 是一个树状对话管理器。与线性聊天不同，你可以从任意一条回复发散出多个分支，平行推进不同方向；每条分支各自携带自己的上下文，追问不会串味，对话越滚越长也不会失焦。

会话数据保存在浏览器本地（IndexedDB），不会上传。只有你主动发送的消息会经过你自己配置的大模型服务。

<!-- TODO: 在这里挂上演示地址 -->
**在线体验**：

[Prunus Landing Page](http://124.221.46.61/)

[Prunus](http://124.221.46.61/)

<img width="2552" height="1354" alt="screenshot-canvas" src="https://github.com/user-attachments/assets/d78198b0-1904-478d-905a-8a4c7a50ff07" />


---

## 核心特性

- ### 分支与上下文隔离

从任意节点发散出多个分支，平行探索不同方向。每次请求只携带**当前节点向上回溯到根的那一条祖先链**，不包含任何兄弟分支——这是它与线性聊天最本质的差别，也是多分支下上下文不混乱的原因。

- ### 创建分支

有两种方式，按需要选：

**手动摘取**

双击节点进入编辑，选中一段内容，右键选择「复制摘取」或「移动摘取」。选中的内容会脱离出来，成为一个与当前节点平级的**兄弟节点**（角色一并继承）。复制摘取保留原文，移动摘取会把这段内容从原节点里删掉。

拆哪一段、拆到哪一层，完全由你决定。适合只想把其中一小部分单独展开的情况。根节点没有父节点，无法摘取。

**一键 Branch Out**

AI 卡片上的按钮，把整条回复拆成一个大纲节点加若干子节点，省去逐段摘取的步骤。

它靠识别标题和编号列表来切分，因此只对排版规整的回复有效；识别不出来时会回退到一次 LLM 调用。排版合适时很省事，不合适时不如手动摘取可控。

<img width="2552" height="1354" alt="branchOut" src="https://github.com/user-attachments/assets/f3ebec9a-0d21-4caf-98ab-1c7da6ba98cb" />

- ### 画布与聚焦

节点由 dagre 自动布局，连接线标示当前激活链路。一键聚焦可随时定位到正在生成的节点或当前激活节点，画布再大也不会迷路，可以对节点进行编辑。

<img width="2554" height="1358" alt="image" src="https://github.com/user-attachments/assets/a20ab8e4-463e-4dda-8e20-419a1a1dbf19" />

- ### 节点总结

多选若干节点，交由 LLM 凝练成一份结构化总结，适合在一轮发散之后回收结论。

<img width="2552" height="1354" alt="Summary" src="https://github.com/user-attachments/assets/62938ab4-b5a3-4eab-a2cd-e4eaca1ff80e" />


- ### 会话背景

为单个会话设定一段全局约束（角色、风格、前提），它会附加在每次请求的 system prompt 后面。

<img width="2552" height="1354" alt="image" src="https://github.com/user-attachments/assets/95061c7f-a4da-44ce-b1f3-379c16a0430d" />


- ### 链路编辑

从根到当前叶子节点的单链路视图，适合顺序阅读和连续编辑一整条思路。
<img width="2552" height="1354" alt="Linear" src="https://github.com/user-attachments/assets/d8e36601-568c-49ef-b35b-ddbaacaaf824" />

---

## 技术栈

| 层面 | 选型 |
| --- | --- |
| 框架 | React 19 + TypeScript 5.9 |
| 构建 | Vite 8 |
| 状态管理 | Zustand 5 |
| 画布 / 节点图 | React Flow（`@xyflow/react` 12）+ dagre（自动布局） |
| 样式 | Tailwind CSS 4 |
| 图标 | lucide-react |
| Markdown | react-markdown + remark-gfm + remark-math + rehype-katex（支持公式） |
| LLM 调用 | OpenAI SDK（OpenAI 协议）/ 原生 fetch（Anthropic 协议） |
| 存储 | IndexedDB |

---

## 快速开始

### 环境要求

- Node.js `^20.19.0` 或 `>=22.12.0`（Vite 8 的要求）

### 安装与运行

```bash
npm install
npm run dev
```

打开终端提示的地址即可。首次进入会先要求配置大模型（见下一节）。

### 配置大模型

Prunus 支持三种接入方式，互相独立，按你的场景选一种：

**1. 服务器代理 + `.env.local`（自托管推荐）**

API Key 只存在于服务端，不会下发到浏览器。复制 `.env.example` 为 `.env.local` 后填写：

```bash
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-your-api-key-here
LLM_MODEL=gpt-3.5-turbo
```

Vite 开发服务器会把 `/api/llm` 代理到该地址，并在转发时注入 `Authorization` 头。

**2. BYOK（使用者在应用内填自己的 Key）**

应用内的配置界面支持 `OpenAI` 与 `Anthropic` 两种协议，需要填写 Base URL、API Key 和模型名。Key 保存在浏览器 localStorage 中，请求直连你填的服务商。


### 构建与部署

```bash
npm run build      # 产物在 dist/
npm run preview    # 本地预览构建产物
```

**部署到子路径**时需在 `.env` 中设置 `BASE_URL`：

```bash
BASE_URL=/app/     # 部署到 https://example.com/app/
```

开发环境会自动使用 `/`，无需设置。

**后台常驻运行**（PM2）：

```bash
./scripts/start.sh     # 启动
./scripts/stop.sh      # 停止
./scripts/restart.sh   # 重启
./scripts/logs.sh      # 查看日志（--history 看历史）
```

进程配置见 `deploy/ecosystem.config.cjs`，日志写入 `./logs/`。

---

## 键盘快捷键

焦点不在输入框内、且未按下 Ctrl / Cmd 时生效。

| 按键 | 行为 |
| --- | --- |
| `↑` | 跳到父节点 |
| `↓` | 跳到第一个子节点 |
| `←` / `→` | 跳到上一个 / 下一个兄弟节点 |
| `C` | 收起 / 展开当前节点 |
| `Delete` | 删除当前节点及其所有子节点（根节点不可删） |
| `Esc` | 退出编辑 / 退出多选 |

---

## 数据与隐私

- **会话、节点、文件夹**存放在浏览器 IndexedDB（库名 `prunus-db`），500ms 防抖自动保存，不会上传到任何服务器。
- **API 配置**（含 API Key）存放在 localStorage。
- **对外发送的内容**：仅你发送的消息，以及当前激活节点回溯到根的那条祖先链。服务端代理模式下 Key 由服务端注入，不下发到浏览器。


---

## 项目结构

```
src/
├── components/
│   ├── canvas/       画布与节点卡片（ChatCanvas / MessageNode）
│   ├── chat/         底部输入框与富文本工具栏
│   ├── expanded/     链路编辑视图
│   ├── layout/       侧边栏、设置、弹窗宿主
│   ├── onboarding/   首次引导与帮助
│   ├── pages/        文件管理页
│   ├── setup/        大模型配置闸门
│   └── summary/      节点总结弹窗
├── store/            Zustand 状态（session / ui / generation / apiConfig / folder）
├── repository/       数据仓储层（IndexedDB）
├── services/         状态与存储的自动同步
├── utils/            布局、Markdown、富文本、LLM 调用、迁移
└── types/            节点与会话类型定义
```

---

## 为什么叫 Prunus

Prunus是我的第一个开源项目，她翻译自"山桃树",至于这棵"山桃树"是我的曾祖母种的，她在菜地的一角无心栽下的种子不知怎地就慢慢发芽了。这棵树到砍掉那天也没有长的特别大，结的果也小小的酸酸的。关于她的记忆已所剩寥寥，只依稀记得儿时在菜地里帮忙干活的时候，微风吹过这棵山桃树再吹到了我的脸上，思想清明。

---

## 许可

[Apache License 2.0](LICENSE.md)
