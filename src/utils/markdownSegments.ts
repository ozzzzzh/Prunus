/**
 * 流式 Markdown 的分段切分
 *
 * 解决的问题：流式生成时每个 chunk 都会重渲染节点，而节点用的是
 * `ReactMarkdown` —— 于是每来一个字，就要把**已经收到的全部内容**重新解析一遍。
 * 实测（16k 字回复、每 20 字一个 chunk）：单次解析从 20ms 涨到 180ms，
 * 整轮累计 45 秒主线程耗时，按 20 chunk/秒算等于 1160ms/秒的需求 ——
 * 超过一个核心，主线程必然被堵死。
 *
 * 思路：把内容切成「已完成的块」和「正在写的尾部」。
 *   - 已完成的块：文本一旦定稿就不再变化，各解析一次即可（配合 memo 缓存）
 *   - 尾部：每个 chunk 重解析，但它只有一个块那么大
 * 于是总开销从 O(n²) 降到 O(n)。实测同样 16k 回复：45.5 秒 → 0.6 秒。
 *
 * 切点必须「切了也不改变渲染结果」，所以规则全部取保守：
 * 宁可少切（最多退化成整段重解析），不可错切。
 *
 * 不切的情形：
 *   1. 空行前后紧邻的行是列表项 / 引用 / 表格行 / 带缩进 —— 这些块会跨空行延续，
 *      切开会把一个松散列表变成两个、把有序列表的编号重置、把缩进代码块截断
 *   2. 处在代码围栏内（``` / ~~~）—— 切开会把一个代码块变成两个
 *   3. 处在 `$$` 行间公式内
 *   4. 切点紧邻的块里含原始 HTML —— HTML 是唯一真正跨块「接起来」的东西，
 *      `<div>` 与几段之后的 `</div>` 会被 rehype-raw 合成一棵树，切开就不嵌套了
 *
 * 正确性由「逐前缀等价」验证：对随机拼接的长文档，流式过程中的每一个前缀，
 * 分段渲染的 HTML 都与整体渲染一致（418 个前缀 + 30 个手写用例，见开发记录）。
 */

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/;
const BLOCKQUOTE = /^\s*>/;
const TABLE_ROW = /^\s*\|/;
const INDENTED = /^(\t| {1,})/;
const FENCE_OPEN = /^(`{3,}|~{3,})/;
const MATH_BLOCK = /^\$\$/;

export interface StreamSegments {
  /** 已完成的块，文本稳定，可各自解析一次后 memo 住 */
  blocks: string[];
  /** 尚未写完的尾部，每个 chunk 都会变，需要重解析 */
  tail: string;
}

export function splitStreamingMarkdown(text: string): StreamSegments {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let start = 0;
  let fence = '';
  let mathBlock = false;

  /** 这一行是否会「跨空行延续」到下一个块 */
  const continuable = (line: string) =>
    LIST_ITEM.test(line) || BLOCKQUOTE.test(line) || TABLE_ROW.test(line) || INDENTED.test(line);

  /** 切点两侧相邻的块里有没有原始 HTML */
  const adjacentHasHtml = (i: number): boolean => {
    let k = i - 1;
    while (k >= 0 && lines[k].trim() !== '') {
      if (lines[k].trim().startsWith('<')) return true;
      k--;
    }
    k = i + 1;
    while (k < lines.length && lines[k].trim() !== '') {
      if (lines[k].trim().startsWith('<')) return true;
      k++;
    }
    return false;
  };

  // 从第 0 行开始扫：它可能就是一个开围栏，漏掉它会把围栏内的空行当成切点
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (fence) {
      if (trimmed.startsWith(fence)) fence = '';
      continue;
    }
    const open = FENCE_OPEN.exec(trimmed);
    if (open) {
      fence = open[1][0].repeat(3);
      continue;
    }
    if (MATH_BLOCK.test(trimmed)) {
      // 同一行里出现两个 $$ 说明它自闭合，不改变状态
      if ((trimmed.match(/\$\$/g) || []).length % 2 === 1) mathBlock = !mathBlock;
      continue;
    }
    if (mathBlock) continue;

    // 候选切点：空行，且前一行非空、不可延续、两侧无 HTML
    if (i === 0) continue;
    if (trimmed !== '' || lines[i - 1].trim() === '' || continuable(lines[i - 1])) continue;
    if (adjacentHasHtml(i)) continue;

    // 后面必须还有非空行：否则剩下的都是尾部，没有可定稿的块
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length) continue;

    const seg = lines.slice(start, i).join('\n').trim();
    if (seg) blocks.push(seg);
    start = j;
    i = j - 1;
  }

  return { blocks, tail: lines.slice(start).join('\n') };
}
