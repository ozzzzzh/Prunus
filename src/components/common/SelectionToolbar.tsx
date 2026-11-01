/**
 * 选中文字后浮出的工具栏
 *
 * 目的：用户选完字，鼠标就在原地，不该被迫移到屏幕底部的输入框才能加粗。
 * 选中一段文字 → 选区正上方浮出常用格式动作（+ 画布节点上的摘取动作）。
 *
 * 三条与外部环境有关的约束（改之前先读）：
 * 1. **必须 portal 到 body**：画布节点处在 React Flow 的 transform 容器里，
 *    带 transform 的祖先会成为 `position: fixed` 的包含块 —— 不 portal 就会整体偏移。
 * 2. **所有按钮的 onMouseDown 都要 preventDefault**：否则点击时编辑器失焦、选区塌陷，
 *    格式会应用到空选区上。
 * 3. **只认 editorRef 里的选区**：`selectionchange` 是全局事件，PDF 文本层里选字也会触发。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  Highlighter,
  Copy,
  Scissors,
} from 'lucide-react';
import {
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  isBold,
  isItalic,
  isUnderline,
  isStrikethrough,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrikethrough,
  toggleHighlight,
  toggleTextColor,
} from '../../utils/richtext';
import { cn } from '../../utils/cn';

/** 工具条与选区之间的间距 */
const GAP = 8;
/** 工具条与视口边缘的最小留白 */
const PAD = 8;

interface SelectionToolbarProps {
  /** 选区所在的编辑器：用它过滤 selectionchange，并判断焦点是否还在编辑器里 */
  editorRef: RefObject<HTMLElement | null>;
  /** 画布节点专用：复制摘取 */
  onExtractCopy?: () => void;
  /** 画布节点专用：移动摘取 */
  onExtractCut?: () => void;
  /** 根节点不能摘取（没有父节点，建不了兄弟节点） */
  canExtract?: boolean;
}

export default function SelectionToolbar({
  editorRef,
  onExtractCopy,
  onExtractCut,
  canExtract = true,
}: SelectionToolbarProps) {
  const [anchor, setAnchor] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** 二级颜色面板 */
  const [menu, setMenu] = useState<'color' | 'highlight' | null>(null);
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  });
  const barRef = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    setAnchor(null);
    setMenu(null);
  }, []);

  const refreshFormats = useCallback(() => {
    setFormats({
      bold: isBold(),
      italic: isItalic(),
      underline: isUnderline(),
      strikethrough: isStrikethrough(),
    });
  }, []);

  const update = useCallback(() => {
    const editor = editorRef.current;
    const sel = window.getSelection();

    if (!editor || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
      hide();
      return;
    }

    const range = sel.getRangeAt(0);
    // 只关心本编辑器里的选区（PDF 文本层、别的节点都会发 selectionchange）
    if (!editor.contains(range.commonAncestorContainer)) {
      hide();
      return;
    }

    // 焦点已经离开编辑器（点了别处）就收起。
    // 工具条自己的按钮会 preventDefault，所以点它们不会走到这里。
    const active = document.activeElement;
    if (active !== editor && !editor.contains(active)) {
      hide();
      return;
    }

    // 多行选区用**第一行**的矩形当锚点：用整体 bounding rect 会让工具条飘到两行中间
    const rects = range.getClientRects();
    const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hide();
      return;
    }

    setAnchor({ x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
    refreshFormats();
  }, [editorRef, hide, refreshFormats]);

  useEffect(() => {
    // 挂载时不主动算一次：工具条是在"进入编辑态"之后才挂载的，此时还没有选区；
    // 真正的选区变化都会触发 selectionchange。顺带避开 set-state-in-effect。
    document.addEventListener('selectionchange', update);
    window.addEventListener('resize', update);
    // capture：编辑器内部滚动时也要重算位置
    document.addEventListener('scroll', update, true);
    return () => {
      document.removeEventListener('selectionchange', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [update]);

  // 实测尺寸，用于夹取到视口内并决定放上方还是下方（与 PDF 选区气泡同一套做法）
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, [anchor, menu, formats]);

  if (!anchor) return null;

  const half = size.w / 2;
  const left = Math.min(
    Math.max(anchor.x, half + PAD),
    Math.max(window.innerWidth - half - PAD, half + PAD)
  );
  // 上方放不下就翻到下方
  const placeAbove = anchor.top - size.h - GAP >= PAD;
  const style = placeAbove
    ? { left, top: anchor.top - size.h - GAP }
    : { left, top: anchor.bottom + GAP };

  const preventBlur = (e: React.MouseEvent) => e.preventDefault();
  /** 应用动作后刷新按钮的激活态：execCommand 不一定会触发 selectionchange */
  const run = (fn: () => void) => {
    fn();
    refreshFormats();
  };

  return createPortal(
    <div
      ref={barRef}
      style={style}
      className="fixed z-[1000] -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-white border border-gray-200 shadow-lg"
      onMouseDown={preventBlur}
    >
      {/* 颜色二级面板：开在工具条的「外侧」，避免盖住选区 */}
      {menu && (
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-gray-200 shadow-lg',
            placeAbove ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          {(menu === 'color' ? TEXT_COLORS : HIGHLIGHT_COLORS).map((color) => (
            <button
              key={color.value}
              onMouseDown={preventBlur}
              onClick={() =>
                run(() =>
                  menu === 'color' ? toggleTextColor(color.value) : toggleHighlight(color.value)
                )
              }
              className="w-5 h-5 rounded border-2 border-gray-200 hover:scale-110 transition-transform"
              style={{ backgroundColor: color.value }}
              title={color.label}
            />
          ))}
        </div>
      )}

      <ToolButton title="加粗" active={formats.bold} onClick={() => run(toggleBold)}>
        <Bold size={15} />
      </ToolButton>
      <ToolButton title="斜体" active={formats.italic} onClick={() => run(toggleItalic)}>
        <Italic size={15} />
      </ToolButton>
      <ToolButton title="下划线" active={formats.underline} onClick={() => run(toggleUnderline)}>
        <Underline size={15} />
      </ToolButton>
      <ToolButton title="删除线" active={formats.strikethrough} onClick={() => run(toggleStrikethrough)}>
        <Strikethrough size={15} />
      </ToolButton>

      <span className="w-px h-4 bg-gray-200 mx-0.5" />

      <ToolButton
        title="文字颜色"
        active={menu === 'color'}
        onClick={() => setMenu((m) => (m === 'color' ? null : 'color'))}
      >
        <Palette size={15} />
      </ToolButton>
      <ToolButton
        title="高亮背景"
        active={menu === 'highlight'}
        onClick={() => setMenu((m) => (m === 'highlight' ? null : 'highlight'))}
      >
        <Highlighter size={15} />
      </ToolButton>

      {/* 画布节点才有摘取动作；链路编辑里没有"接到哪个节点"的概念，不显示 */}
      {(onExtractCopy || onExtractCut) && canExtract && (
        <>
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          {onExtractCopy && (
            <ToolButton title="复制摘取" onClick={onExtractCopy}>
              <Copy size={15} />
            </ToolButton>
          )}
          {onExtractCut && (
            <ToolButton title="移动摘取" onClick={onExtractCut}>
              <Scissors size={15} />
            </ToolButton>
          )}
        </>
      )}
    </div>,
    document.body
  );
}

function ToolButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        active ? 'bg-leaf-100 text-leaf-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      )}
    >
      {children}
    </button>
  );
}
