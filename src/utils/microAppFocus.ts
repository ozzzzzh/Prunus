/**
 * 键盘作用域判定：现在该不该把快捷键让给微应用面板
 *
 * 为什么需要它（这是个会静默删数据的问题）：
 * ChatCanvas 的全局 keydown 只守卫 INPUT / TEXTAREA / contenteditable。
 * PDF 文本层是**普通 div**，在面板里拖选文字不会让任何元素获得焦点
 * （`document.activeElement` 仍然是 body），于是所有守卫全部通过 ——
 * 用户选完一段原文随手按 Delete，删掉的是**画布上当前的节点**。
 *
 * 所以两个判据都要，缺一不可：
 *   1. 焦点在面板内（点过面板后由 tabIndex=-1 + focus() 建立）
 *   2. 当前选区落在面板内（拖选文字的场景，焦点判据那时并不成立）
 */

import { MICRO_APP_PANEL_ATTR } from '../types/microApp';

const PANEL_SELECTOR = `[${MICRO_APP_PANEL_ATTR}]`;

function closestPanel(node: Node | null): Element | null {
  if (!node) return null;
  const el = node instanceof Element ? node : node.parentElement;
  return el?.closest(PANEL_SELECTOR) ?? null;
}

/** 焦点或当前选区是否在微应用面板内 */
export function isMicroAppInteracting(): boolean {
  if (closestPanel(document.activeElement)) return true;

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
    return Boolean(closestPanel(selection.anchorNode));
  }

  return false;
}
