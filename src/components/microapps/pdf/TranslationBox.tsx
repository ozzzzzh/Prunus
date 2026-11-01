/**
 * 译文白块（涂改液）
 *
 * 盖住原文选中的那几行，在上面显示译文。位置用归一化矩形，所以缩放、
 * 换面板宽度都不用重算；字号存的是**比例**（原文号 ÷ 页面高），缩放后照样对得上。
 *
 * 四件事按顺序决定观感，改之前先读：
 * 1. 白底是分两层画的（见 PdfPageView 里的精确矩形 + 这里文字自带的白底）。
 *    只铺一块 bbox 会连带盖掉最后一行没被选中的尾巴，只给文字上底色又会在
 *    行距的缝隙里漏出原文。
 * 2. 字号取自**原文的真实字号**（不是行高估算），再乘一个中日文的视觉修正系数 ——
 *    汉字吃满字身框，同样 pt 的英文看起来小一圈，不修正就会显得"字突然变大"。
 * 3. 放不下时只缩字号，绝不为了塞下译文而把白块撑大 ——
 *    撑大就会盖住用户没选的字，而且盖多少不可预测。缩到下限还放不下就裁切 + 「展开」。
 * 4. 鼠标事件的命中范围只到**文字本身**：白块其余部分让开，
 *    这样底下的原文仍然可以起选（想重选一段再翻时不会被白块挡住）。
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, X } from 'lucide-react';
import { cn } from '../../../utils/cn';

export type TranslationRects = Array<[number, number, number, number]>;

/** 正在请求中的译文。只在组件里流转，**不落库**（否则撤销会撤出一个空壳） */
export interface PendingTranslation {
  id: string;
  docId: string;
  /** 1-based */
  page: number;
  rects: TranslationRects;
  /** 原文序号 ÷ 页面高度，见 PdfTranslation.fontRatio */
  fontRatio?: number;
  /** 流式返回的累积文本，未清洗 */
  text: string;
}

interface TranslationBoxProps {
  rects: TranslationRects;
  text: string;
  /** 还在生成：不做字号拟合，只把已到达的字先显示出来 */
  pending?: boolean;
  /** 原文的字号 ÷ 页面高度（缺省时按行高估算） */
  fontRatio?: number;
  /** 页面当前的像素高度 */
  pageHeight: number;
  /** 按住「看原文」期间为 true：连白底一起让开，露出原始版面 */
  peeking: boolean;
  onPeekChange: (peeking: boolean) => void;
  onDelete?: () => void;
}

/**
 * 中日文的视觉修正。
 *
 * 汉字吃满字身框（≈0.86em），而英文正文的视觉高度主要由大写字母（≈0.72em）
 * 和小写 x-height（≈0.52em）决定 —— 同样 pt 排出来，汉字的墨迹明显更重。
 * 压到 0.8 之后，汉字的实高才和原文的大写字母接近，"翻译过来"不会像换了字号。
 */
const CJK_FONT_RATIO = 0.8;

/** 拿不到真实字号时的退路：行高 × 这个系数 ≈ 原来的字号 */
const FALLBACK_FONT_RATIO = 0.75;

/**
 * 字号下限相对基准的比例。
 *
 * 压得太狠（0.55）会得到 5px 的"蚂蚁字"—— 既看不清，也让人以为没翻全。
 * 宁可少显示几行、留出渐隐和「展开」，也不要一个读不了的完整版。
 */
const MIN_FONT_RATIO = 0.7;

/**
 * 译文的字体。
 *
 * 把中文 UI 字体放在前面而不是交给 Tailwind 的默认栈：默认栈先命中 Segoe UI，
 * 拉丁字母走一个字体、汉字再回退到另一个，同一行里两种字形气质不统一，
 * 看起来就是"贴上去的"。统一用一个中西文都覆盖的字体更整。
 */
const TRANSLATION_FONT =
  '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", system-ui, sans-serif';

/** 把 **加粗** 渲染成 <strong>；其余保持纯文本，不解析任何 HTML */
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} style={{ fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export default function TranslationBox({
  rects,
  text,
  pending = false,
  fontRatio,
  pageHeight,
  peeking,
  onPeekChange,
  onDelete,
}: TranslationBoxProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  /** 选区矩形的外接框：白块的位置和尺寸都按它算 */
  const bbox = useMemo(() => {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const [x, y, w, h] of rects) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    return { x: minX, y: minY, w: Math.max(maxX - minX, 0.01), h: Math.max(maxY - minY, 0.01) };
  }, [rects]);

  const { baseFont, minFont, lineHeight } = useMemo(() => {
    const lineH = rects.reduce((max, rect) => Math.max(max, rect[3]), 0) * pageHeight;
    // 优先用捕获时量到的原文真实字号；老数据没有这个字段时退回行高估算
    const sourceFont = fontRatio && fontRatio > 0 ? fontRatio * pageHeight : lineH * FALLBACK_FONT_RATIO;
    const base = Math.max(6, sourceFont * CJK_FONT_RATIO);
    // 行距跟原文的行盒走：译文与原文的节奏一致，才不会"挤成一坨"
    const lineHeightFactor = Math.min(1.6, Math.max(1.2, lineH / base));
    return {
      baseFont: base,
      minFont: Math.max(5, base * MIN_FONT_RATIO),
      lineHeight: lineHeightFactor,
    };
  }, [rects, pageHeight, fontRatio]);

  /**
   * 字号自适配。
   *
   * 二分而不是一次性估算：译文里可能夹着公式和英文单词，宽度差异很大，
   * 按字数估行数经常差一整行。容器高度固定、文字层 `overflow: hidden`，
   * 所以 `scrollHeight > clientHeight` 就是"放不下"的准确信号。
   *
   * 直接写 DOM 样式而不是 setState：这是纯粹的测量过程，中间那几次字号
   * 不需要进 React 状态，否则每翻一次页都会多出好几轮渲染。
   */
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;

    if (pending || expanded) {
      el.style.fontSize = `${baseFont}px`;
      return;
    }

    let lo = minFont;
    let hi = baseFont;
    for (let i = 0; i < 6; i += 1) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      if (el.scrollHeight <= el.clientHeight + 1) lo = mid;
      else hi = mid;
    }
    el.style.fontSize = `${lo}px`;

    const over = el.scrollHeight > el.clientHeight + 1;
    setOverflowing((prev) => (prev === over ? prev : over));
    // peeking 必须在依赖里：偷看时文字节点是**卸载**的，松手后重新挂载的是一个
    // 全新的 div，字号没有随便回流进 DOM —— 不重跑就会退回继承来的默认字号（显得变大）
  }, [text, pending, expanded, baseFont, minFont, peeking]);

  /**
   * 「按住查看原文」需要知道什么时候松手。
   *
   * 白块在偷看状态下让开了鼠标事件，按钮自己收不到 pointerup，只能挂在 window 上。
   */
  useEffect(() => {
    if (!peeking) return;
    const stop = () => onPeekChange(false);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [peeking, onPeekChange]);

  if (rects.length === 0) return null;

  const shown = text || (pending ? '翻译中…' : '');
  const controlsVisible = hovered || peeking;

  return (
    <div
      className="absolute"
      data-translation-box={pending ? 'pending' : 'done'}
      data-translation-state={peeking ? 'peeking' : expanded ? 'expanded' : 'idle'}
      style={{
        left: `${bbox.x * 100}%`,
        top: `${bbox.y * 100}%`,
        width: `${bbox.w * 100}%`,
        // 展开时按内容长高；收起时严格等于原文选区的高度
        ...(expanded ? { minHeight: `${bbox.h * 100}%` } : { height: `${bbox.h * 100}%` }),
        // 命中范围交给文字本身（见文件头第 4 条）
        pointerEvents: 'none',
      }}
    >
      {!peeking && (
        <div
          ref={textRef}
          className={cn('absolute inset-x-0 top-0', expanded ? 'overflow-visible' : 'overflow-hidden')}
          style={{ height: expanded ? 'auto' : '100%', pointerEvents: 'none' }}
        >
          <span
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            style={{
              backgroundColor: '#ffffff',
              // 折行时每一行片段各自带底色；没有它，行距缝隙里会漏出原文
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
              // 0.18em ≈ 半份行距，把相邻两行的白底连起来
              padding: '0.18em 2px',
              color: pending ? '#9ca3af' : '#1f2937',
              fontFamily: TRANSLATION_FONT,
              fontWeight: 400,
              letterSpacing: '0.01em',
              lineHeight,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              // 译文要能被拖选复制；白块其余部分不吃鼠标事件
              pointerEvents: 'auto',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              cursor: 'text',
            }}
          >
            {renderInline(shown)}
          </span>
        </div>
      )}

      {/* 收起且放不下时，底部压一道渐隐，明确告诉用户"下面还有" */}
      {overflowing && !expanded && !peeking && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent" />
      )}

      {/* 悬停工具条。偷看时保持可见（不然松手前没有东西可点），其余时候淡出 */}
      {!pending && (
        <div
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          className={cn(
            'absolute right-0 top-0 flex items-center gap-0.5 px-1 py-0.5 rounded-md',
            'bg-white/95 border border-gray-200 shadow-sm transition-opacity',
            controlsVisible ? 'opacity-100' : 'opacity-0'
          )}
          style={{ pointerEvents: controlsVisible ? 'auto' : 'none' }}
        >
          <button
            type="button"
            // 按住看原文：松手就回到译文，不产生"原文/译文"这个持久状态
            onPointerDown={(e) => {
              e.preventDefault();
              onPeekChange(true);
            }}
            title="按住查看原文"
            className="p-0.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <Eye size={12} />
          </button>

          {overflowing && (
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? '收起译文' : '展开完整译文'}
              className="p-0.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onDelete}
            title="删除译文"
            className="p-0.5 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
