# Prunus 🍑

Prunus（李属/桃树）是一个创新的 AI 对话产品。其命名灵感来源于创作者儿时曾祖母（太太）栽种的桃树，蕴含深厚的情感记忆。同时，“树”的意象完美契合了产品“树状/网状对话流”的核心功能与网状思维的哲学理念，将硬核的技术愿景与个人的温情记忆深度链接。

## ✨ 核心特性 (Core Features)

- **树状对话流 (Tree-based Conversation)**
  打破传统线性聊天的限制。你可以从任何一个回复中发散出多个不同的对话分支，平行探索不同的想法和话题。

- **智能裂变 (Smart Branch-Out)**
  AI 回复默认以完整单节点展示。当点击 AI 卡片上的 "Branch Out" 按钮时，系统会向 LLM 发送专门的结构化解析 Prompt，将当前卡片内容智能解析并转化为一个**大纲节点 (Outline)**，同时将其具体步骤或观点拆分为多个并排的**子节点 (Branches)**。这使得后续的独立分支追问更加清晰、聚焦。

- **精准上下文记忆 (Context Awareness)**
  系统在向大模型请求时，会自动沿着当前激活节点的父节点一直追溯到根节点，收集一条精准的、无污染的对话上下文链条。彻底解决多分支对话时的上下文遗忘和混乱问题。

- **动态画布与一键聚焦 (Interactive Canvas & Auto-Focus)**
  通过一键聚焦功能，无论画布多么庞大，都能随时定位到正在生成 AI 回复的节点或当前高亮的激活节点，配合平滑的缩放和自动布局，提供极佳的阅读和交互体验。

## 🛠 技术栈 (Tech Stack)

- **前端框架**: React 18 + TypeScript + Vite
- **状态管理**: Zustand
- **画布与节点图**: React Flow + Dagre (用于树状结构的自动布局)
- **样式与 UI**: Tailwind CSS + Lucide React
- **Markdown 渲染**: React Markdown + Remark GFM
- **包管理器**: Yarn

## 🚀 快速开始 (Getting Started)

1. **安装依赖** (推荐使用 yarn):
   ```bash
   yarn install
   ```

2. **启动本地开发服务器**:
   ```bash
   yarn dev
   ```

3. **开始使用**:
   打开浏览器访问本地端口，在右下角的设置 (Settings) 面板中填入你的 API Key 和 Base URL，即可开始栽种你的第一棵对话树！

---

*“让思维如枝桠般自然伸展，让对话结出丰硕的果实。”*
