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

/** 已实现的微应用。加第二个时这里加一项，下面的联合类型会自动跟上 */
export type MicroAppId = 'pdf';

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
  /** 由这次摘录生成的画布节点 id，点标记可以跳回去 */
  nodeId: string;
  docId: string;
  /** 1-based */
  page: number;
  /** [x, y, w, h]，均为页面宽高的比例 */
  rects: Array<[number, number, number, number]>;
}

export interface SessionMicroApps {
  pdf?: PdfMicroAppState;
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
