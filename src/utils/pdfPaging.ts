/**
 * PDF 连续滚动分页的纯计算
 *
 * 为什么不用 IntersectionObserver：我们同时需要三个量 —— 挂载哪几页、当前在第几页、
 * 跳到某页时的滚动位置。用累计高度算一次就都出来了，而 IO 还要额外维护观察目标、
 * 并且在"高度是估算值、随后会被实测修正"的情况下不稳定。
 * 页数上限几百，每帧 O(n) 的整数加法可以忽略。
 */

/** 页与页之间的视觉间距（px）。高度数组里不含间隙，间隙在算偏移时统一加 */
export const PAGE_GAP = 12;

/** 顶部留白：第一页上方的间距 + 内边距 */
export const PAGE_TOP_PADDING = 16;

/** 预挂载范围：视口上下各多留这么多像素的页，滚动时不会出现空白 */
export const PAGE_LOOKAHEAD = 1400;

/** offsets[i] = 第 i 页顶端在滚动内容中的 y 坐标；长度与 heights 相同 */
export function buildOffsets(heights: number[]): number[] {
  const offsets: number[] = new Array(heights.length);
  let y = PAGE_TOP_PADDING;

  for (let i = 0; i < heights.length; i++) {
    offsets[i] = y;
    y += heights[i] + PAGE_GAP;
  }

  return offsets;
}

/** 滚动内容总高度（含底部间隙，避免最后一页贴边时没有余量） */
export function totalHeight(heights: number[]): number {
  let sum = PAGE_TOP_PADDING;
  for (const h of heights) sum += h + PAGE_GAP;
  return sum;
}

/**
 * 需要挂载的页区间 [start, end]（闭区间，可能为空 → start > end）。
 *
 * 返回空区间只发生在没有任何页的时候。
 */
export function visibleRange(
  offsets: number[],
  heights: number[],
  scrollTop: number,
  viewportHeight: number
): [number, number] {
  if (heights.length === 0) return [1, 0];

  const top = scrollTop - PAGE_LOOKAHEAD;
  const bottom = scrollTop + viewportHeight + PAGE_LOOKAHEAD;

  let start = 0;
  while (start < heights.length && offsets[start] + heights[start] < top) start++;

  let end = start;
  while (end < heights.length && offsets[end] < bottom) end++;

  return [start, Math.min(end, heights.length - 1)];
}

/**
 * 当前页（0-based）：占据视口顶部（含一点点偏移）的那一页。
 *
 * 用"顶端越过判断线"的最后一页，而不是"和判断线相交的页"——
 * 后者在两页之间滚动时会左右横跳。
 */
export function pageAtOffset(offsets: number[], scrollTop: number, viewportHeight: number): number {
  if (offsets.length === 0) return 0;

  // 判断线取视口高度的 1/3：让"读到哪"更接近人的感觉，而不是刚好压线就翻页
  const line = scrollTop + viewportHeight / 3;

  let page = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] <= line) page = i;
    else break;
  }
  return page;
}
