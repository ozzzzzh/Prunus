/**
 * PDF 选区 → 画布节点的转换
 *
 * 纯函数，便于单独验证：真正麻烦的是"取到的字到底是不是好的"以及"多长算太长"。
 */

import { PDF_QUOTE_KEY, PDF_REF_KEY } from '../types/microApp';

/**
 * 单次摘录的字符上限。
 *
 * 为什么必须限制：节点正文会随祖先链**在之后每一轮对话里重复发给模型**
 * （见 ChatInput 的 runSubmit），一次误选整页就变成每轮都要付的固定成本。
 */
export const PDF_QUOTE_MAX_CHARS = 4000;

/**
 * 判断选中的文字是不是坏的（PDF 缺字符映射时的典型症状）。
 *
 * 这类 PDF 的画面是正常的，只有取出来的文字是乱的 —— 典型样子是
 * `(cid:123)` 这样的占位串，或大量替换符/私用区字符。
 * 检测出来要**明确提示**，但不能阻止用户建节点：他可能就是想连图带文一起引用。
 */
export function looksGarbled(text: string): boolean {
  const sample = text.slice(0, 500);
  if (!sample) return false;

  if (/\(cid:\d+\)/.test(sample)) return true;

  const chars = [...sample];
  let bad = 0;

  for (const ch of chars) {
    const code = ch.codePointAt(0) ?? 0;
    const isReplacement = code === 0xfffd;
    const isPrivateUse = (code >= 0xe000 && code <= 0xf8ff) || (code >= 0xf0000 && code <= 0x10fffd);
    // 控制字符（保留换行/制表/回车，它们在正常文本里是合法的）
    const isControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;

    if (isReplacement || isPrivateUse || isControl) bad++;
  }

  return bad / chars.length > 0.2;
}

export interface PdfQuoteInput {
  /** 选区原文 */
  text: string;
  /** 1-based 页码 */
  page: number;
  docId: string;
  docName?: string;
}

export interface PdfQuote {
  content: string;
  metadata: Record<string, unknown>;
  /** 是否因过长被截断（调用方要告知用户） */
  truncated: boolean;
  /** 选区文字是否可能无法正确提取 */
  garbled: boolean;
}

/**
 * 把选区转成节点正文 + 来源元数据。
 *
 * 正文**原样保留**（只规范换行、去掉首尾空白），不做 markdown 转义 ——
 * 摘录节点的渲染本来就不走 markdown（见 types/microApp.ts 的 PDF_QUOTE_KEY 说明），
 * 转义反而会让节点里显示一堆反斜杠，且与用户选中的原文不一致。
 */
export function buildPdfQuote(input: PdfQuoteInput): PdfQuote {
  const raw = input.text.replace(/\r\n?/g, '\n').trim();
  const truncated = raw.length > PDF_QUOTE_MAX_CHARS;

  return {
    content: truncated ? raw.slice(0, PDF_QUOTE_MAX_CHARS) : raw,
    metadata: {
      [PDF_REF_KEY]: { docId: input.docId, page: input.page, name: input.docName },
      [PDF_QUOTE_KEY]: true,
    },
    truncated,
    garbled: looksGarbled(raw),
  };
}
