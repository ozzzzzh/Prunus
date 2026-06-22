/**
 * 富文本编辑工具函数
 *
 * 用于处理 contentEditable 编辑器中的格式化操作
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';

/**
 * 颜色配置
 */
export const HIGHLIGHT_COLORS = [
  { value: '#fef08a', label: 'Yellow' },
  { value: '#bbf7d0', label: 'Green' },
  { value: '#bfdbfe', label: 'Blue' },
  { value: '#fbcfe8', label: 'Pink' },
  { value: '#fed7aa', label: 'Orange' },
];

export const TEXT_COLORS = [
  { value: '#1a1a1a', label: 'Black' },
  { value: '#ef4444', label: 'Red' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#22c55e', label: 'Green' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#f97316', label: 'Orange' },
];

/**
 * 保存当前选区
 */
export function saveSelection(): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  return selection.getRangeAt(0).cloneRange();
}

/**
 * 恢复选区
 */
export function restoreSelection(range: Range | null): void {
  if (!range) return;
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * 应用格式化到选中文字 - 使用 execCommand 更可靠
 */
export function applyFormat(tag: string, style?: { property: string; value: string }): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return;

  const selectedText = range.toString();
  if (!selectedText) return;

  // 对于基本格式，使用 execCommand（自动处理切换）
  if (tag === 'b' || tag === 'strong') {
    document.execCommand('bold', false);
    return;
  }
  if (tag === 'i' || tag === 'em') {
    document.execCommand('italic', false);
    return;
  }
  if (tag === 'u') {
    document.execCommand('underline', false);
    return;
  }
  if (tag === 's' || tag === 'del') {
    document.execCommand('strikeThrough', false);
    return;
  }

  // 对于带样式的 span，手动处理
  const wrapper = document.createElement(tag);
  if (style) {
    wrapper.style.setProperty(style.property, style.value);
  }

  const fragment = range.extractContents();
  wrapper.appendChild(fragment);
  range.insertNode(wrapper);

  // 重新选中
  selection.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(wrapper);
  selection.addRange(newRange);
}

/**
 * 切换加粗 - 使用 execCommand
 */
export function toggleBold(): void {
  document.execCommand('bold', false);
}

/**
 * 切换斜体 - 使用 execCommand
 */
export function toggleItalic(): void {
  document.execCommand('italic', false);
}

/**
 * 切换下划线 - 使用 execCommand
 */
export function toggleUnderline(): void {
  document.execCommand('underline', false);
}

/**
 * 切换删除线 - 使用 execCommand
 */
export function toggleStrikethrough(): void {
  document.execCommand('strikeThrough', false);
}

/**
 * 检测是否有背景色
 */
export function hasBackgroundColor(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  let node: Node | null = range.startContainer;

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const style = element.getAttribute('style') || '';
      if (style.includes('background-color')) {
        return true;
      }
    }
    node = node.parentNode;
    if (node && (node as Element).classList?.contains('editing-mode')) break;
  }
  return false;
}

/**
 * 检测是否有特定的背景色
 */
export function hasSpecificBackgroundColor(color: string): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  let node: Node | null = range.startContainer;

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const style = element.getAttribute('style') || '';
      if (style.includes('background-color:') && style.includes(color)) {
        return true;
      }
    }
    node = node.parentNode;
    if (node && (node as Element).classList?.contains('editing-mode')) break;
  }
  return false;
}

/**
 * 切换背景色 - 改进版本，支持按颜色切换
 */
export function toggleHighlight(color: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  // 检测当前选区是否已有该特定背景色
  if (hasSpecificBackgroundColor(color)) {
    // 有该特定背景色，移除它（设为透明）
    document.execCommand('hiliteColor', false, 'transparent');
  } else {
    // 没有该特定背景色，添加背景色
    document.execCommand('hiliteColor', false, color);
  }
}

/**
 * 检测是否有文字颜色（用于自动弹出菜单）
 */
export function hasTextColor(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  let node: Node | null = range.startContainer;

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const style = element.getAttribute('style') || '';
      // 检测是否有颜色样式（排除 inherit 和默认黑色）
      if (style.includes('color:')) {
        // 获取实际颜色值
        const colorMatch = style.match(/color:\s*([^;]+)/);
        if (colorMatch && colorMatch[1]) {
          const colorValue = colorMatch[1].trim();
          // 排除默认黑色和 inherit
          if (colorValue !== 'inherit' && colorValue !== 'rgb(0, 0, 0)' && colorValue !== '#000' && colorValue !== '#000000') {
            return true;
          }
        }
      }
    }
    node = node.parentNode;
    if (node && (node as Element).classList?.contains('editing-mode')) break;
  }
  return false;
}

/**
 * 检测是否有特定的文字颜色
 */
export function hasSpecificTextColor(color: string): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  let node: Node | null = range.startContainer;

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const style = element.getAttribute('style') || '';
      if (style.includes('color:') && style.includes(color)) {
        return true;
      }
    }
    node = node.parentNode;
    if (node && (node as Element).classList?.contains('editing-mode')) break;
  }
  return false;
}

/**
 * 切换文字颜色 - 类似记号笔的逻辑
 */
export function toggleTextColor(color: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  // 检测是否有该特定颜色
  if (hasSpecificTextColor(color)) {
    // 有该颜色，移除颜色（设为默认黑色）
    document.execCommand('foreColor', false, '#000000');
  } else {
    // 没有该颜色，添加颜色
    document.execCommand('foreColor', false, color);
  }
}

/**
 * 加粗
 */
export function formatBold(): void {
  applyFormat('b');
}

/**
 * 斜体
 */
export function formatItalic(): void {
  applyFormat('i');
}

/**
 * 下划线
 */
export function formatUnderline(): void {
  applyFormat('u');
}

/**
 * 删除线
 */
export function formatStrikethrough(): void {
  applyFormat('s');
}

/**
 * 记号笔（背景色）
 */
export function formatHighlight(color: string): void {
  applyFormat('span', { property: 'background-color', value: color });
}

/**
 * 字体颜色
 */
export function formatTextColor(color: string): void {
  applyFormat('span', { property: 'color', value: color });
}

/**
 * 移除格式 - 改进版本，处理嵌套格式
 */
export function removeFormat(tag: string, style?: { property: string; value?: string }): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  // 如果选区折叠，尝试扩展到整个格式化元素
  if (range.collapsed) {
    let node: Node | null = range.startContainer;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        if (tagName === tag) {
          range.selectNodeContents(element);
          break;
        }
      }
      node = node.parentNode;
      if (node && (node as Element).classList?.contains('editing-mode')) break;
    }
  }

  const fragment = range.extractContents();

  // 递归移除匹配的格式标签
  const cleanNode = (node: Node): Node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      // 检查是否需要移除此元素
      let shouldRemove = false;
      if (tagName === tag) {
        if (style) {
          const styleValue = element.getAttribute('style') || '';
          // 对于颜色格式，只要属性匹配就移除（不要求值精确匹配）
          if (styleValue.includes(style.property)) {
            // 如果指定了值，要求值匹配；否则只要属性匹配
            if (!style.value || styleValue.includes(style.value)) {
              shouldRemove = true;
            }
          }
        } else {
          shouldRemove = true;
        }
      }

      if (shouldRemove) {
        // 移除此格式，保留子节点
        const newFragment = document.createDocumentFragment();
        element.childNodes.forEach(child => {
          newFragment.appendChild(cleanNode(child));
        });
        return newFragment;
      }

      // 保留此元素，递归处理子节点
      const newElement = element.cloneNode(false) as Element;
      element.childNodes.forEach(child => {
        newElement.appendChild(cleanNode(child));
      });
      return newElement;
    }
    return node;
  };

  const cleanedFragment = document.createDocumentFragment();
  fragment.childNodes.forEach(child => {
    const cleaned = cleanNode(child);
    if (cleaned instanceof DocumentFragment) {
      cleaned.childNodes.forEach(grandChild => {
        cleanedFragment.appendChild(grandChild);
      });
    } else {
      cleanedFragment.appendChild(cleaned);
    }
  });

  range.insertNode(cleanedFragment);

  // 重新选中处理后的内容
  const newRange = document.createRange();
  newRange.selectNodeContents(range.commonAncestorContainer);
  selection.removeAllRanges();
  selection.addRange(newRange);
}

/**
 * 清除格式
 */
export function clearFormat(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const fragment = range.extractContents();

  // 递归清除所有格式标签
  const cleanNode = (node: Node): Node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      // 只保留文本内容
      const textContent = element.textContent || '';
      return document.createTextNode(textContent);
    }
    return node;
  };

  const cleanedFragment = document.createDocumentFragment();
  fragment.childNodes.forEach(child => {
    cleanedFragment.appendChild(cleanNode(child));
  });

  range.insertNode(cleanedFragment);
}

/**
 * 处理粘贴事件，只保留纯文本
 */
export function handlePasteAsPlainText(e: ClipboardEvent): void {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') || '';
  document.execCommand('insertText', false, text);
}

/**
 * 将 HTML 内容转换为可存储的字符串
 */
export function sanitizeHTML(html: string): string {
  // 允许的标签白名单
  const allowedTags = ['b', 'i', 'u', 's', 'strong', 'em', 'del', 'mark', 'span'];

  // 创建临时元素解析 HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // 遍历所有元素，移除不允许的标签
  const cleanElement = (element: Element): void => {
    const children = Array.from(element.children);
    children.forEach(child => {
      const tagName = child.tagName.toLowerCase();
      if (!allowedTags.includes(tagName)) {
        // 替换为纯文本
        const text = child.textContent || '';
        const textNode = document.createTextNode(text);
        child.parentNode?.replaceChild(textNode, child);
      } else {
        // 清理不允许的属性（只保留 style）
        const attributes = Array.from(child.attributes);
        attributes.forEach(attr => {
          if (attr.name !== 'style') {
            child.removeAttribute(attr.name);
          }
        });
        // 递归清理子元素
        cleanElement(child);
      }
    });
  };

  cleanElement(temp);
  return temp.innerHTML;
}

/**
 * 将 Markdown 转换为 HTML
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

/**
 * 检测当前选中文本是否包含指定格式
 */
export function hasFormat(tag: string, style?: { property: string; value?: string }): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  let node: Node | null = range.startContainer;

  // 向上查找父节点
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      if (tagName === tag) {
        if (style) {
          const styleValue = element.getAttribute('style') || '';
          if (styleValue.includes(style.property)) {
            if (!style.value) return true;
            if (styleValue.includes(style.value)) return true;
          }
        } else {
          return true;
        }
      }
    }
    node = node.parentNode;

    // 遇到编辑器容器则停止
    if (node && (node as Element).classList?.contains('editing-mode')) break;
  }

  return false;
}

/**
 * 检测是否加粗
 */
export function isBold(): boolean {
  return hasFormat('b') || hasFormat('strong');
}

/**
 * 检测是否斜体
 */
export function isItalic(): boolean {
  return hasFormat('i') || hasFormat('em');
}

/**
 * 检测是否下划线
 */
export function isUnderline(): boolean {
  return hasFormat('u');
}

/**
 * 检测是否删除线
 */
export function isStrikethrough(): boolean {
  return hasFormat('s') || hasFormat('del');
}

/**
 * 检测是否有指定背景色
 */
export function hasHighlight(color?: string): boolean {
  return hasFormat('span', { property: 'background-color', value: color });
}

/**
 * ===== 摘取功能相关工具函数 =====
 */

/**
 * 检测是否有选中的文字（用于摘取功能）
 */
export function hasSelection(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  return !range.collapsed && range.toString().trim().length > 0;
}

/**
 * 获取选中的 HTML 内容
 * 返回选区的 HTML 字符串，用于创建新节点
 */
export function getSelectedHTML(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return '';

  const range = selection.getRangeAt(0);
  if (range.collapsed) return '';

  // 克隆选区内容
  const fragment = range.cloneContents();

  // 将 fragment 转换为 HTML 字符串
  const div = document.createElement('div');
  div.appendChild(fragment);

  return div.innerHTML;
}

/**
 * 保存选区的 Range 对象（用于移动摘取）
 * 返回 Range 的序列化信息，可以用于恢复
 * @param editorElement 编辑器根元素（可选，如果不提供则自动查找）
 */
export function saveSelectionRange(editorElement?: HTMLElement): {
  startContainerPath: number[];
  startOffset: number;
  endContainerPath: number[];
  endOffset: number;
} | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;

  // 获取从编辑器根元素到选区节点的路径
  const getPath = (node: Node, root: HTMLElement): number[] => {
    const path: number[] = [];
    let current = node;

    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) break;

      // 找到当前节点在父节点中的索引
      const index = Array.from(parent.childNodes).indexOf(current as ChildNode);
      path.unshift(index);
      current = parent;
    }

    return path;
  };

  // 如果提供了编辑器元素，直接使用
  let editorRoot = editorElement;

  // 如果没有提供，尝试从 DOM 结构查找
  if (!editorRoot) {
    editorRoot = range.commonAncestorContainer.parentElement?.closest('.editing-mode') as HTMLElement;
  }

  if (!editorRoot) return null;

  return {
    startContainerPath: getPath(range.startContainer, editorRoot),
    startOffset: range.startOffset,
    endContainerPath: getPath(range.endContainer, editorRoot),
    endOffset: range.endOffset,
  };
}

/**
 * 恢复选区的 Range 对象（用于移动摘取）
 * @param savedRange 保存的 Range 信息
 * @param editorElement 编辑器根元素
 */
export function restoreSelectionRange(
  savedRange: {
    startContainerPath: number[];
    startOffset: number;
    endContainerPath: number[];
    endOffset: number;
  },
  editorElement: HTMLElement
): boolean {
  const getNodeByPath = (path: number[], root: HTMLElement): Node | null => {
    let current: Node = root;

    for (const index of path) {
      if (!current.childNodes || index >= current.childNodes.length) {
        return null;
      }
      current = current.childNodes[index];
    }

    return current;
  };

  try {
    const startContainer = getNodeByPath(savedRange.startContainerPath, editorElement);
    const endContainer = getNodeByPath(savedRange.endContainerPath, editorElement);

    if (!startContainer || !endContainer) {
      console.warn('restoreSelectionRange: Could not find container nodes');
      return false;
    }

    const range = document.createRange();

    // 安全地设置起始位置
    const maxStartOffset = startContainer.nodeType === Node.TEXT_NODE
      ? startContainer.textContent?.length || 0
      : startContainer.childNodes.length;
    const safeStartOffset = Math.min(savedRange.startOffset, maxStartOffset);
    range.setStart(startContainer, safeStartOffset);

    // 安全地设置结束位置
    const maxEndOffset = endContainer.nodeType === Node.TEXT_NODE
      ? endContainer.textContent?.length || 0
      : endContainer.childNodes.length;
    const safeEndOffset = Math.min(savedRange.endOffset, maxEndOffset);
    range.setEnd(endContainer, safeEndOffset);

    const selection = window.getSelection();
    if (!selection) return false;

    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  } catch (error) {
    console.error('Failed to restore selection:', error);
    return false;
  }
}

/**
 * 删除当前选区内容（用于移动摘取）
 * 直接使用 Range API 删除，不依赖 execCommand
 */
export function deleteSelection(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return false;

  try {
    // 直接使用 Range API 删除内容
    range.deleteContents();
    // 清空选区
    selection.removeAllRanges();
    return true;
  } catch (error) {
    console.error('Failed to delete selection:', error);
    return false;
  }
}

/**
 * 直接从编辑器中删除指定范围的 HTML 内容
 * 通过查找包含该内容的边界来删除
 * @param htmlContent 要删除的 HTML 内容
 * @param editorElement 编辑器元素
 * @returns 删除后的 HTML 内容，如果删除失败返回 null
 */
export function deleteHTMLContent(
  htmlContent: string,
  editorElement: HTMLElement
): string | null {
  // 创建一个临时元素来解析 HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  // 在编辑器中查找并删除匹配的内容
  // 策略：遍历编辑器的所有文本节点，找到包含目标内容的节点
  const walker = document.createTreeWalker(
    editorElement,
    NodeFilter.SHOW_TEXT,
    null
  );

  // 获取要删除的纯文本内容
  const textToDelete = tempDiv.textContent || '';
  if (!textToDelete) return null;

  let found = false;
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent?.includes(textToDelete)) {
      // 找到包含目标文本的节点
      const nodeText = node.textContent;
      const index = nodeText.indexOf(textToDelete);

      if (index !== -1) {
        // 分割文本节点并删除目标部分
        const before = nodeText.substring(0, index);
        const after = nodeText.substring(index + textToDelete.length);

        const parent = node.parentNode;
        if (parent) {
          // 替换为新的文本节点
          const newText = document.createTextNode(before + after);
          parent.replaceChild(newText, node);
          found = true;
          break;
        }
      }
    }
  }

  if (found) {
    return editorElement.innerHTML;
  }

  return null;
}

/**
 * 清空选区
 */
export function clearSelection(): void {
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
  }
}