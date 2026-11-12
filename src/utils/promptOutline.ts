/**
 * Prompt 决策树 → 层级型提示词
 *
 * 左侧面板要"每增加一次决策就更新一次"，所以这里必须是**纯函数**：
 * 不调模型、不做异步，输入节点表，输出一段 Markdown。每次勾选/删除后
 * 面板直接重算即可，零延迟、零成本。
 *
 * 规则很短：
 * - 只有**祖先链上全部被勾选**的节点才算数（取消父节点 = 整支失效）；
 * - 已勾选的节点按层级展开；
 * - 已勾选但没有子节点的，单列成"还可以继续细分"，提醒用户哪里还能往下想；
 * - 没勾选的同层项单列成"已排除"，保留"考虑过但没采用"的记录。
 */

import type { PrunusNode } from '../types';
import { getPromptNodeMeta } from '../types/microApp';

export interface OutlineItem {
  title: string;
  children: OutlineItem[];
}

export interface PromptOutline {
  /** 议题（根节点正文） */
  title: string;
  /** 已确定的决策，按树的层级嵌套 */
  decisions: OutlineItem[];
  /** 已勾选但还没有下文的项 */
  open: string[];
  /** 考虑过但没有勾选的项（只收有效父节点下的直接子项） */
  excluded: string[];
  /** 已有效勾选的节点数（用于面板页脚） */
  selectedCount: number;
  /**
   * 已选节点的 id 序列。
   *
   * 预留给"AI 润色结果是否过期"这类判断；当前的层级型实时提示词用不到，
   * 但把它做成纯函数返回能让后续扩展不必再改签名。
   */
  fingerprint: string;
}

const EMPTY: PromptOutline = {
  title: '',
  decisions: [],
  open: [],
  excluded: [],
  selectedCount: 0,
  fingerprint: '',
};

export function buildPromptOutline(
  nodes: Record<string, PrunusNode>,
  rootNodeId: string | null
): PromptOutline {
  if (!rootNodeId || !nodes[rootNodeId]) return EMPTY;

  const root = nodes[rootNodeId];
  const decisions: OutlineItem[] = [];
  const open: string[] = [];
  const excluded: string[] = [];
  const selectedIds: string[] = [];

  const labelOf = (node: PrunusNode) => node.content.trim() || '（未命名）';

  /**
   * 只沿着"已勾选"的节点往下走 —— 一旦某层没勾，整条支都不算数，
   * 这也是"取消父节点会让整支失效"的实现方式。
   */
  const walk = (parentId: string): OutlineItem[] => {
    const parent = nodes[parentId];
    if (!parent) return [];

    const items: OutlineItem[] = [];

    for (const childId of parent.childrenIds) {
      const child = nodes[childId];
      if (!child) continue;

      const meta = getPromptNodeMeta(child);
      if (!meta) continue;

      if (!meta.selected) {
        // 考虑过但没有勾选：保留下来，让用户看得见"当时排除了什么"
        excluded.push(labelOf(child));
        continue;
      }

      selectedIds.push(child.id);
      const children = walk(childId);
      if (children.length === 0) open.push(labelOf(child));

      items.push({ title: labelOf(child), children });
    }

    return items;
  };

  decisions.push(...walk(root.id));

  return {
    // 标题**不做**「未命名」兜底：面板靠它判断"用户还没输入议题"，
    // 兜底成非空字符串会让输入框永远不出现
    title: root.content.trim(),
    decisions,
    open,
    excluded,
    selectedCount: selectedIds.length,
    fingerprint: selectedIds.join('>'),
  };
}

/** 渲染成面板里显示的层级型提示词 */
export function outlineToMarkdown(outline: PromptOutline): string {
  const lines: string[] = [];

  lines.push(`# ${outline.title || '未命名议题'}`);
  lines.push('');
  lines.push('## 已确定的决策');

  if (outline.decisions.length === 0) {
    lines.push('');
    lines.push('_还没有勾选任何方向。在右侧画布上勾选你认为需要确定的分支。_');
  } else {
    const render = (items: OutlineItem[], depth: number) => {
      for (const item of items) {
        lines.push(`${'  '.repeat(depth)}- ${item.title}`);
        render(item.children, depth + 1);
      }
    };
    lines.push('');
    render(outline.decisions, 0);
  }

  if (outline.open.length > 0) {
    lines.push('');
    lines.push('## 还可以继续细分');
    lines.push('');
    for (const title of outline.open) lines.push(`- ${title}`);
  }

  if (outline.excluded.length > 0) {
    lines.push('');
    lines.push('## 已排除');
    lines.push('');
    for (const title of outline.excluded) lines.push(`- ${title}`);
  }

  return lines.join('\n');
}
