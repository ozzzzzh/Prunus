/**
 * 临时诊断计数器 —— 仅用于性能排查，排查结束后本文件连同调用点一并删除。
 *
 * 用法：在浏览器 Console 里
 *   __renderCounts = {}        // 清零
 *   ... 拖动 3 秒 ...
 *   __renderCounts             // 读取
 *
 * MessageNode 的值 = 期间节点组件重渲染的总次数（300 个节点 × 帧数 是灾难性数字，
 * 几十到几百次是正常）。layout 的值 = dagre 布局执行的次数（拖动期间应当为 0）。
 */
export function countRender(name: string): void {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __renderCounts?: Record<string, number> };
  if (!w.__renderCounts) w.__renderCounts = {};
  w.__renderCounts[name] = (w.__renderCounts[name] ?? 0) + 1;
}
