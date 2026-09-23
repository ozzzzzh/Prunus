/**
 * 画布节点的本地关键字检索
 *
 * 纯函数、不依赖 DOM 与 store，便于单独验证。
 * 这是检索的**第一段**：即时、零成本、每次输入都跑。Jev 语义检索只在它零命中时
 * 由用户主动触发（见 utils/jevClient.ts）。
 */

import type { PrunusNode } from '../types';
import { getNodeAttachment } from '../types';
import { htmlToPlainText } from './richtext';

/** 命中发生在哪个字段，用于在结果里告诉用户"命中在附件名/标题里" */
export type SearchField = 'content' | 'title' | 'attachment';

export interface SearchHit {
  nodeId: string;
  field: SearchField;
  /** 命中词前后各约 30 字的上下文（首尾截断处带省略号） */
  snippet: string;
  /** 命中词在 snippet 中的起始下标，供界面高亮 */
  matchStart: number;
}

/** 片段里命中词前后各保留多少字 */
const SNIPPET_PAD = 30;

/** 截出一段上下文，并算出命中词在片段里的位置 */
function makeSnippet(
  text: string,
  index: number,
  queryLength: number
): { snippet: string; matchStart: number } {
  const start = Math.max(0, index - SNIPPET_PAD);
  const end = Math.min(text.length, index + queryLength + SNIPPET_PAD);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return {
    snippet: prefix + text.slice(start, end) + suffix,
    // 加了前缀省略号，命中位置要相应右移
    matchStart: prefix.length + (index - start),
  };
}

/**
 * 在整棵节点树里做关键字检索。
 *
 * 检索范围：节点正文（**先剥 HTML**）+ 标题 + 附件文件名。
 * - 正文必须过 `htmlToPlainText`：双击编辑过的节点存的是 HTML，直接搜会命中
 *   `div` / `strong` 这类标签名，用户搜 "div" 会得到一堆莫名其妙的"命中"
 * - 附件正文**刻意不参与**（产品决策，见计划文档）
 *
 * 一个节点即使多处命中**也只返回一条**，按 `正文 > 标题 > 附件名` 取优先级最高的那次，
 * 否则同一个节点会在结果列表里重复出现，翻页体验很差。
 */
export function searchNodes(nodes: Record<string, PrunusNode>, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];

  for (const node of Object.values(nodes)) {
    const candidates: { field: SearchField; text: string }[] = [
      { field: 'content', text: htmlToPlainText(node.content) },
      { field: 'title', text: node.title ?? '' },
      { field: 'attachment', text: getNodeAttachment(node)?.name ?? '' },
    ];

    for (const { field, text } of candidates) {
      if (!text) continue;
      const index = text.toLowerCase().indexOf(q);
      if (index === -1) continue;

      const { snippet, matchStart } = makeSnippet(text, index, q.length);
      hits.push({ nodeId: node.id, field, snippet, matchStart });
      break; // 命中即止 —— 保证一个节点只出一条
    }
  }

  // 按创建时间排序，保证同样的树每次给出同样的顺序（翻页时才不会跳来跳去）
  return hits.sort((a, b) => (nodes[a.nodeId]?.createdAt ?? 0) - (nodes[b.nodeId]?.createdAt ?? 0));
}
