/*
 * @Author: 钟焓(Egan H. Zhong)
 * @Date: 2026-08-14 11:54:30
 * @LastEditors: 钟焓(Egan H. Zhong)
 * @LastEditTime: 2026-09-08 10:26:01
 * @FilePath: \Prunus\src\utils\contentSplit.ts
 * @Description: 
 */
/**
 * 本地内容结构化拆分
 *
 * 优先在本地按 Markdown 结构（标题/编号列表）拆分 AI 回复，
 * 命中时毫秒级完成，无需调用 LLM。无法识别结构时返回 null（交给 LLM 兜底）。
 */

export interface LocalSplitResult {
  outline: string;
  branches: string[];
}

const HEADING_REGEX = /^\s{0,3}#\s+/;
const NUMBERED_LIST_REGEX = /^\s{0,3}(?:\d{1,3}[.、．)](?!\d)|[一二三四五六七八九十]+[、.])\s*/;

function isFenceLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

function buildSplit(lines: string[], indices: number[]): LocalSplitResult | null {
  if (indices.length < 2) return null;

  const outline = lines.slice(0, indices[0]).join('\n').trim();
  const branches: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : lines.length;
    const branch = lines.slice(start, end).join('\n').trim();
    if (branch) branches.push(branch);
  }

  if (branches.length < 2) return null;

  return {
    outline: outline || `（拆分为 ${branches.length} 个分支）`,
    branches,
  };
}

function splitByHeadings(lines: string[]): LocalSplitResult | null {
  const indices: number[] = [];
  let inFence = false;

  lines.forEach((line, i) => {
    if (isFenceLine(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && HEADING_REGEX.test(line)) {
      indices.push(i);
    }
  });

  return buildSplit(lines, indices);
}

function splitByNumberedList(lines: string[]): LocalSplitResult | null {
  const indices: number[] = [];
  let inFence = false;

  lines.forEach((line, i) => {
    if (isFenceLine(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && NUMBERED_LIST_REGEX.test(line)) {
      indices.push(i);
    }
  });

  return buildSplit(lines, indices);
}

export function splitContentLocally(content: string): LocalSplitResult | null {
  if (!content || !content.trim()) return null;

  const lines = content.split('\n');

  return splitByHeadings(lines) ?? splitByNumberedList(lines);
}
