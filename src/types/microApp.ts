/**
 * 微应用（micro-app）类型定义
 *
 * 微应用是挂在**会话**上的垂直小工具（首个是 PDF 阅读器）：打开后占据画布左侧、
 * 与右侧主画布并排，把原文摘录成画布节点，让"分叉"在具体场景里自然发生。
 *
 * 两条边界，改之前先读：
 * 1. 状态属于**会话**而不是应用 —— 切换会话切换的就是这里读到的文档。
 * 2. 微应用不"操作主应用"，它只产出一段摘录（原文 + 出处）；
 *    把摘录变成什么样的节点，由主应用决定（见 sessionStore.addQuotedNode）。
 */

import type { PrunusNode } from './node';

/**
 * 已实现的微应用。
 *
 * - `pdf`：Paper 阅读器（原文选区 → 画布节点）
 * - `prompt`：Prompt 工作台（LLM 发散 + 用户勾选，把模糊议题收敛成一棵决策树）
 */
export type MicroAppId = 'pdf' | 'prompt';

/**
 * 微应用面板根节点的标记属性。
 *
 * 放在 types 而不是组件里：宿主组件要写它，`utils/microAppFocus` 要读它，
 * 而工具层不该反向依赖组件层。
 *
 * 用途：画布的全局快捷键靠它判断"现在该不该让路"——PDF 文本层是普通 div，
 * 选中文字不会让任何元素获得焦点，只看 activeElement 判断不出来。
 */
export const MICRO_APP_PANEL_ATTR = 'data-micro-app-panel';

/** PDF 微应用在某个会话上的状态 */
export interface PdfMicroAppState {
  /** 文档内容哈希，全局唯一标识一份 PDF（见 utils/docHash.ts） */
  docId: string;
  /** 上次读到第几页（1-based） */
  page: number;
  /**
   * 文件名与页数。
   *
   * 冗余存一份是有意的：换设备后本机没有这份文件，这时还得能告诉用户
   * "缺的是哪一份、共多少页"，否则只能干说一句"缺少文件"。
   */
  name?: string;
  pageCount?: number;
  /** 已经摘录到画布里的区域（在 PDF 上画一层记号笔） */
  highlights?: PdfHighlight[];
  /** 已经翻译并覆盖在原文上的区域 */
  translations?: PdfTranslation[];
}

/**
 * 一处"已摘录"标记。
 *
 * 位置存**归一化矩形**（相对页面宽高的 0–1 比例）而不是像素：这样缩放、
 * 换设备、换面板宽度都不用重算，也随会话一起持久化。
 *
 * 带 docId 是因为换过文件时旧标记不该画到新文件上（会话只记一份"当前文档"）。
 */
export interface PdfHighlight {
  /**
   * 由这次摘录生成的画布节点 id，点标记可以跳回去。
   *
   * **可缺省**：用户只画记号、不建节点时没有对应节点。
   * 这类标记点不出任何东西，只作为阅读标注保留。
   */
  nodeId?: string;
  docId: string;
  /** 1-based */
  page: number;
  /** [x, y, w, h]，均为页面宽高的比例 */
  rects: Array<[number, number, number, number]>;
  /**
   * 记号笔颜色（**不透明** CSS 颜色）。
   *
   * 透明度由渲染层统一控制（见 PdfPageView）：逐块半透明会在行与行的重叠处
   * 叠加两次，出现深浅不一的横条纹。缺省 = 历史数据的默认黄色。
   */
  color?: string;
}

/**
 * 一处"已翻译"的区域：像涂改液一样盖住原文，在上面显示译文。
 *
 * 与 PdfHighlight 共用同一套几何约定（归一化矩形、按 docId 归属、按 page 分组），
 * 所以缩放、换面板宽度、换设备都不用重算。
 *
 * 与摘录的区别：它是**阅读层**的东西，不建节点、不写节点 metadata，
 * 只随会话持久化（纯文本，可以随导出走）。
 */
export interface PdfTranslation {
  /** 删除、去重时用来定位；不是内容哈希 —— 同一段可以有意翻两遍 */
  id: string;
  docId: string;
  /** 1-based */
  page: number;
  /** 被替换掉的原文所占的矩形（归一化），渲染时据此精确铺白 */
  rects: Array<[number, number, number, number]>;
  /** 送进模型的原文（已做过断行/连字符归一化） */
  sourceText: string;
  /** 模型返回的译文（已清洗） */
  translatedText: string;
  /**
   * 目标语言。
   *
   * 目前只有 `zh`（UI 也只有中文一个选项），保留字段是为了以后加语言时
   * 不用改数据结构、不用迁移已有数据。
   */
  targetLang: string;
  /**
   * 原文的字号 ÷ 页面高度。
   *
   * 存比例而不是像素：缩放后要按新的页面高度还原成同样的字号。
   * 缺省时渲染层退回按行高估算（兼容加这个字段之前写入的数据）。
   */
  fontRatio?: number;
  createdAt: number;
}

// ===== Prunus Prompt（提示词工作台）=====

/**
 * Prompt 微应用在某个会话上的状态。
 *
 * 树本身**不在这里** —— 它就是会话里的节点，靠节点 metadata 上的
 * `promptNode` 标记识别。这里只放"整棵树共用"的少量设置，
 * 这样勾选、细分、删除全部走 sessionStore，撤销与持久化都是现成的。
 */
export interface PromptMicroAppState {
  /** 每次发散提供几个选项（2–6，默认 3）。删除后可按这个数补齐 */
  optionCount: number;
  /** 最近一次「生成成稿」的结果（Markdown） */
  artifact?: string;
  artifactAt?: number;
  /** 生成时的勾选指纹：与当前指纹不一致 = 清单变了，建议重新生成 */
  artifactFingerprint?: string;
}

/** Prompt 节点的语义类型 */
export type PromptNodeKind = 'decision' | 'draft' | 'fact' | 'explain' | 'note';
/** 节点是谁写的 */
export type PromptNodeOrigin = 'ai' | 'user';

const PROMPT_KINDS: PromptNodeKind[] = ['decision', 'draft', 'fact', 'explain', 'note'];

/**
 * 一个 Prompt 节点上的标记。
 *
 * 节点类型仍是 `ai-chat`：这样删除、撤销、导出、布局全都不用改，
 * 只靠 metadata 决定画布上用哪个渲染器（见 registry 的 loadNodeTypes）。
 *
 * 两个状态必须分开：
 * - `expanded`：这一支往下展开过（LLM 细分 / 追问 / 手动加子节点）
 * - `included`：这一条要进入最终成稿
 * 展开不要求先勾选，勾选也不要求先展开。
 */
export interface PromptNodeMeta {
  /** 是否纳入最终成稿。默认 false（AI 提议不替用户做决定） */
  included?: boolean;
  /** @deprecated 旧字段；读取时回退为 included，新写入不再使用 */
  selected?: boolean;
  /** 节点类型：决策 / 候选稿 / 事实 / 解释 / 笔记 */
  kind?: PromptNodeKind;
  /** 来源：AI 提议还是用户手写 */
  origin?: PromptNodeOrigin;
  /** LLM 给出的一句话理由：定这一项会影响什么 */
  why?: string;
  /** 同一批发散的批次 id，用于补齐时去重与识别 */
  batchId?: string;
  /** 已经发散过（避免重复请求） */
  expanded?: boolean;
  /** LLM 判断这一项已经足够具体，继续拆分没有价值 */
  done?: boolean;
}

export const PROMPT_NODE_KEY = 'promptNode';
/** 会话根节点上的标记：这个节点是 Prompt 里的"议题" */
export const PROMPT_ROOT_KEY = 'promptRoot';

/**
 * 安全取出 Prompt 节点标记。
 *
 * 与 getNodeAttachment 同一套守卫理由：metadata 的内容可能来自导入的 JSON，
 * 脏数据只该让这个节点少一个样式，不该让整个画布渲染崩掉。
 */
export function getPromptNodeMeta(node: PrunusNode): PromptNodeMeta | null {
  const raw = node.metadata?.[PROMPT_NODE_KEY];
  if (!raw || typeof raw !== 'object') return null;

  const meta = raw as Record<string, unknown>;
  const kind = meta.kind as PromptNodeKind | undefined;
  const origin = meta.origin as PromptNodeOrigin | undefined;

  return {
    // 旧数据只有 selected：读的时候当成 included，老 Prompt 会话不用迁移
    included: meta.included === true || meta.selected === true,
    kind: kind && PROMPT_KINDS.includes(kind) ? kind : 'decision',
    origin: origin === 'user' ? 'user' : 'ai',
    why: typeof meta.why === 'string' ? meta.why : undefined,
    batchId: typeof meta.batchId === 'string' ? meta.batchId : undefined,
    expanded: meta.expanded === true,
    done: meta.done === true,
  };
}

/** 这一项是不是"LLM 提议的决策/候选稿"（补齐计数只看这一类） */
export function isPromptProposal(meta: PromptNodeMeta | null): boolean {
  return meta !== null && (meta.kind === 'decision' || meta.kind === 'draft');
}

/** 这个节点是不是 Prompt 的议题根 */
export function isPromptRoot(node: PrunusNode): boolean {
  return node.metadata?.[PROMPT_ROOT_KEY] === true;
}

/** 这个会话是不是 Prompt 会话（微应用状态存在即算） */
export function isPromptSession(microApps: SessionMicroApps | undefined): boolean {
  return Boolean(microApps?.prompt);
}

export interface SessionMicroApps {
  pdf?: PdfMicroAppState;
  prompt?: PromptMicroAppState;
}

/**
 * 文档记录：存在 IndexedDB 的全局文档库。
 *
 * 刻意**不随会话导出**（导出的 JSON 只带 docId 引用）：一份论文几 MB，
 * 塞进针对分享设计的 JSON 文件里既笨重又没道理；换设备后按 hash 重新关联即可。
 */
export interface PdfDocumentRecord {
  docId: string;
  name: string;
  size: number;
  pageCount: number;
  addedAt: number;
  /** 原文件本身，结构化克隆进 IndexedDB，不占 JS 堆 */
  blob: Blob;
}

// ===== 节点上的来源标记 =====

/** 摘录自哪份文档的第几页 */
export interface NodePdfRef {
  docId: string;
  page: number;
  name?: string;
}

export const PDF_REF_KEY = 'pdfRef';

/**
 * 标记"这个节点的正文是 PDF 原文摘录"。
 *
 * 有这个标记的节点正文**不走 markdown 渲染**（见 MessageNode）。原因有两个：
 * - 摘录必须与原文逐字一致：走 markdown，选区里的 `$ * _ # |` 会被解释成
 *   公式/强调/列表/表格，用户看到的就不是他选的那段字了
 * - 文档文字是**不可信输入**。渲染管线带 rehypeRaw，会把正文当 HTML 解析；
 *   摘录是应用里第一处"第三方文档文字变成节点正文"的地方，不该给它这条路
 *
 * 用户手动编辑该节点后会清掉此标记，节点回到普通的 markdown/HTML 路径。
 */
export const PDF_QUOTE_KEY = 'pdfQuote';

/**
 * 从 metadata 安全取出 PDF 来源标记。
 *
 * 与 getNodeAttachment 同一套写法、同一套理由：metadata 是 Record<string, unknown>，
 * 内容还可能来自**导入的 JSON**，一份脏数据只该让这个节点少显示一个角标，
 * 不该让整棵节点树渲染崩掉。
 */
export function getNodePdfRef(node: PrunusNode): NodePdfRef | null {
  const raw = node.metadata?.[PDF_REF_KEY];
  if (!raw || typeof raw !== 'object') return null;

  const ref = raw as Record<string, unknown>;
  if (typeof ref.docId !== 'string' || !ref.docId) return null;
  if (typeof ref.page !== 'number' || !Number.isFinite(ref.page)) return null;

  return {
    docId: ref.docId,
    page: ref.page,
    // name 只影响角标文案，缺失就不显示，不必因此丢掉整个来源
    name: typeof ref.name === 'string' ? ref.name : undefined,
  };
}

/** 是否为 PDF 原文摘录（决定渲染路径，见 PDF_QUOTE_KEY 的说明） */
export function isPdfQuote(node: PrunusNode): boolean {
  return node.metadata?.[PDF_QUOTE_KEY] === true;
}
