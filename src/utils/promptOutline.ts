/**
 * Prompt 决策树 → 左侧的实时清单
 *
 * 纯函数：不调模型、不做异步。每次勾选/编辑/删除后面板直接重算，零延迟。
 *
 * 两条与旧版不同的规则：
 * 1. **只看 included**（是否纳入成稿），不再看 `selected`（旧字段在读取层做了回退）；
 * 2. **父节点未纳入不连坐子孙**。用户可能只勾了一个子项，它仍然要出现在清单里，
 *    只是前面带上父级的路径作为上下文。
 *
 * 节点内容可能是编辑过的 HTML，展示与统计前一律走 htmlToPlainText。
 */

import type { PrunusNode } from '../types';
import { getPromptNodeMeta, type PromptNodeKind } from '../types/microApp';
import { htmlToPlainText } from './richtext';

export interface OutlineItem {
  /** 单行展示用（多行草稿压成一行） */
  label: string;
  /** 原始摊平文本，成稿时使用 */
  content: string;
  kind: PromptNodeKind;
  children: OutlineItem[];
  /** 父节点本身没有纳入，这一项只是因为它被纳入才带上的上下文 */
  contextOnly?: boolean;
}

export interface PromptOutline {
  /** 议题（根节点正文） */
  title: string;
  /** 用户提供的事实 */
  facts: OutlineItem[];
  /** 已纳入的决策 / 候选稿 / 笔记（按树层级） */
  decisions: OutlineItem[];
  /** 已纳入的解释（追问产生的知识笔记） */
  notes: OutlineItem[];
  /** 已纳入、但还没有具体下文的决策 */
  open: string[];
  includedCount: number;
  excludedCount: number;
  /** 勾选指纹：用于判断成稿是否过期 */
  fingerprint: string;
}

const EMPTY: PromptOutline = {
  title: '',
  facts: [],
  decisions: [],
  notes: [],
  open: [],
  includedCount: 0,
  excludedCount: 0,
  fingerprint: '',
};

/** 单行化：多行内容在清单里压成一行，避免破坏嵌套列表 */
function toLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 轻量哈希：只要"内容变了指纹就变"，不需要抗碰撞 */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function buildPromptOutline(
  nodes: Record<string, PrunusNode>,
  rootNodeId: string | null
): PromptOutline {
  if (!rootNodeId || !nodes[rootNodeId]) return EMPTY;

  const root = nodes[rootNodeId];
  const facts: OutlineItem[] = [];
  const decisions: OutlineItem[] = [];
  const notes: OutlineItem[] = [];
  const open: string[] = [];
  let includedCount = 0;
  let excludedCount = 0;
  const includedParts: string[] = [];

  const walk = (parentId: string): OutlineItem[] => {
    const parent = nodes[parentId];
    if (!parent) return [];

    const items: OutlineItem[] = [];

    for (const childId of parent.childrenIds) {
      const child = nodes[childId];
      if (!child) continue;

      const meta = getPromptNodeMeta(child);
      if (!meta) continue;

      const content = htmlToPlainText(child.content).trim();
      const label = toLabel(content) || '（未命名）';
      const kind = meta.kind ?? 'decision';

      if (kind === 'explain') {
        if (meta.included) {
          includedCount += 1;
          includedParts.push(`${child.id}:${hash(content)}`);
          notes.push({ label, content, kind, children: [] });
        } else {
          excludedCount += 1;
        }
        // 追问链继续往下收
        notes.push(...walk(childId));
        continue;
      }

      if (kind === 'fact') {
        if (meta.included) {
          includedCount += 1;
          includedParts.push(`${child.id}:${hash(content)}`);
          facts.push({ label, content, kind, children: [] });
        } else {
          excludedCount += 1;
        }
        continue;
      }

      if (meta.included) {
        includedCount += 1;
        includedParts.push(`${child.id}:${hash(content)}`);
        const children = walk(childId);
        if (children.length === 0 && kind === 'decision') open.push(label);
        items.push({ label, content, kind, children });
      } else {
        excludedCount += 1;
        // 父节点没勾，但子孙勾了：把子孙带上父级路径放进同一层，避免出现"空壳父节点"
        const children = walk(childId);
        for (const childItem of children) {
          items.push({
            ...childItem,
            label: `${label} › ${childItem.label}`,
            contextOnly: true,
          });
        }
      }
    }

    return items;
  };

  decisions.push(...walk(root.id));

  return {
    // 标题不做「未命名」兜底：面板靠它判断"用户还没输入议题"
    title: htmlToPlainText(root.content).trim(),
    facts,
    decisions,
    notes,
    open,
    includedCount,
    excludedCount,
    fingerprint: hash(includedParts.join('|')),
  };
}

/** 渲染成面板里的实时清单 */
export function outlineToMarkdown(outline: PromptOutline): string {
  const lines: string[] = [];

  lines.push(`# ${outline.title || '未命名议题'}`);

  if (outline.facts.length > 0) {
    lines.push('');
    lines.push('## 事实（你给的）');
    lines.push('');
    for (const item of outline.facts) lines.push(`- ${item.label}`);
  }

  lines.push('');
  lines.push('## 已纳入');

  if (outline.decisions.length === 0) {
    lines.push('');
    lines.push('_还没有纳入任何内容。在右侧画布上勾选要进入成稿的节点。_');
  } else {
    const render = (items: OutlineItem[], depth: number) => {
      for (const item of items) {
        lines.push(`${'  '.repeat(depth)}- ${item.label}`);
        render(item.children, depth + 1);
      }
    };
    lines.push('');
    render(outline.decisions, 0);
  }

  if (outline.notes.length > 0) {
    lines.push('');
    lines.push('## 知识笔记（已纳入）');
    lines.push('');
    for (const item of outline.notes) lines.push(`- ${item.label}`);
  }

  if (outline.open.length > 0) {
    lines.push('');
    lines.push('## 待具体化');
    lines.push('');
    for (const label of outline.open) lines.push(`- ${label}`);
  }

  return lines.join('\n');
}
