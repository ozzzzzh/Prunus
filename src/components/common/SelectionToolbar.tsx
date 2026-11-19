/**
 * 选中文字后浮出的工具栏
 *
 * 目的：用户选完字，鼠标就在原地，不该被迫移到屏幕底部的输入框才能加粗。
 * 选中一段文字 → **松开鼠标之后**，选区正上方浮出常用格式动作
 * （+ 画布节点上的摘取动作）。
 *
 * 时机是刻意的：不要在拖选过程中出现。selectionchange 在拖选时每个字符都会触发，
 * 若在那里定位，工具条会从按下鼠标起一路跟着光标飞，挡视线也干扰判断。
 * 现在由 pointerdown（收起）/ pointerup、keyup（定稿后出现）决定生命周期，
 * selectionchange 只负责"选区塌陷或跑到编辑器外时收起"。详见下方 effect。
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
  /** 与 anchor 同步的镜像：滚动/缩放回调里据此判断"现在到底显不显示" */
  const anchorRef = useRef<{ x: number; top: number; bottom: number } | null>(null);

  const hide = useCallback(() => {
    anchorRef.current = null;
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

  /**
   * 计算选区该停在哪，不满足条件返回 null。
   *
   * 刻意做成**纯计算**：什么时候显示由事件决定（见下方 effect），
   * 因为 selectionchange 在拖选过程中会连续触发 —— 在那里更新位置，
   * 工具条就会跟着鼠标一路飞，这正是要修掉的体验问题。
   */
  const computeAnchor = useCallback(() => {
    const editor = editorRef.current;
    const sel = window.getSelection();

    if (!editor || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

    const range = sel.getRangeAt(0);
    // 只关心本编辑器里的选区（PDF 文本层、别的节点都会发 selectionchange）
    if (!editor.contains(range.commonAncestorContainer)) return null;

    // 焦点已经离开编辑器（点了别处）就收起。
    // 工具条自己的按钮会 preventDefault，所以点它们不会走到这里。
    const active = document.activeElement;
    if (active !== editor && !editor.contains(active)) return null;

    // 多行选区用**第一行**的矩形当锚点：用整体 bounding rect 会让工具条飘到两行中间
    const rects = range.getClientRects();
    const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;

    return { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom };
  }, [editorRef]);

  /** 选区已经定下来：显示（条件不满足则收起） */
  const show = useCallback(() => {
    const next = computeAnchor();
    if (!next) {
      hide();
      return;
    }
    anchorRef.current = next;
    setAnchor(next);
    refreshFormats();
  }, [computeAnchor, hide, refreshFormats]);

  /** 只在工具条已经显示时跟随滚动/缩放；不因为滚动把它从无到有弹出来 */
  const reposition = useCallback(() => {
    if (!anchorRef.current) return;
    show();
  }, [show]);

  useEffect(() => {
    /**
     * 选区变化只做"收起"判断，**绝不在拖选过程中更新位置**。
     *
     * 旧实现把定位放在这里，于是拖选时每个字符都会重算一次，工具条从按下鼠标
     * 那一刻就出现并一路跟着光标跑，挡视线也干扰判断。现在：
     *   - pointerdown：开始新选区，先收起
     *   - pointerup / keyup：选区定稿，这时才出现
     *   - selectionchange：只在选区塌陷/跑到编辑器外时收起
     */
    const onSelectionChange = () => {
      const editor = editorRef.current;
      const sel = window.getSelection();

      if (!editor || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
        hide();
        return;
      }

      const range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) {
        hide();
        return;
      }

      const active = document.activeElement;
      if (active !== editor && !editor.contains(active)) {
        hide();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      // 工具条自己（含二级色板）的按下不算"开始新选区"，否则按钮会在 click 前被卸掉
      if (barRef.current?.contains(e.target as Node)) return;
      hide();
    };

    const onPointerUp = () => show();
    const onKeyUp = () => show();
    // 双击选词时浏览器可能在 pointerup 之后才最终定下选区，补一帧再算一次
    const onDoubleClick = () => {
      window.setTimeout(show, 0);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    // 必须冒泡阶段：工具条按钮的 onMouseDown preventDefault 之后事件仍会到这里，
    // 靠上面的 contains 判断把它们排除
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('resize', reposition);
    // capture：编辑器内部滚动时也要重算位置
    document.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  }, [editorRef, hide, show, reposition]);

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
