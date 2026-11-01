/**
 * PDF 阅读器（第一个微应用）
 *
 * 形态：占据画布左侧，与右侧主画布并排；在原文里选中一段，就能在画布上长出节点。
 *
 * 三条与主应用的边界（改之前先读）：
 * 1. PDF 是**被看和被选**的对象，不做全文解析、不进模型上下文（那是附件上传那条路径）
 * 2. 打开的是哪份文件、读到第几页，记在**会话**上（session.microApps.pdf），
 *    所以切换会话就是切换这里读的文档
 * 3. 面板不直接改画布，只把"选区 + 出处"交给 sessionStore.addQuotedNode，
 *    由主应用决定节点长什么样
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  FileText,
  Highlighter,
  Languages,
  Loader2,
  Minus,
  Plus,
  Sprout,
  Upload,
  X,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useSessionStore } from '../../../store/sessionStore';
import { useUIStore } from '../../../store/uiStore';
import { usePdfViewerStore } from '../../../store/pdfViewerStore';
import { useImageDraftStore } from '../../../store/imageDraftStore';
import { useDialogStore } from '../../../store/dialogStore';
import { getPdfjs, getPdfDocumentParams } from '../../../utils/pdfjs';
import {
  acquirePdfDocument,
  primePdfDocumentCache,
  releasePdfDocument,
} from '../../../utils/pdfDocumentCache';
import { hasLocalPdf, saveLocalPdf } from '../../../utils/pdfDocumentStore';
import { hashFileBytes } from '../../../utils/docHash';
import { cn } from '../../../utils/cn';
import { saveImage } from '../../../utils/imageStore';
import {
  PAGE_GAP,
  PAGE_TOP_PADDING,
  buildOffsets,
  pageAtOffset,
  visibleRange,
} from '../../../utils/pdfPaging';
import { buildPdfQuote, PDF_QUOTE_MAX_CHARS, looksGarbled } from '../../../utils/pdfSelection';
import {
  translateToChinese,
  PDF_TRANSLATE_MAX_CHARS,
  isUnreadableTranslation,
} from '../../../utils/translate';
import type { PdfHighlight, PdfTranslation } from '../../../types/microApp';
import type { ReactNode } from 'react';
import PdfPageView from './PdfPageView';
import type { PendingTranslation, TranslationRects } from './TranslationBox';

interface PdfPanelProps {
  sessionId: string;
}

/**
 * 滚动/翻页后回写页码前的静默期。
 *
 * 写会话会连带触发画布重排（布局 memo 依赖 session）与整库防抖保存，
 * 所以不能跟着滚动每帧写。离开面板时会立刻补落一次，不会丢。
 */
const PAGE_FLUSH_MS = 1500;

/** 页面两侧留白 */
const SIDE_PADDING = 16;

/**
 * 面板宽度变化后，等这么久才重算缩放。
 *
 * 拖动分隔条时容器宽度每帧都在变，而重算缩放 = 所有可视页重新光栅化 + 重建文本层。
 * 等它安静下来再算一次，拖动期间就只是纯粹的布局变化（不触发任何渲染工作）。
 */
const WIDTH_SETTLE_MS = 180;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.25;

/**
 * 记号笔颜色。
 *
 * 存**不透明**颜色：透明度由 PdfPageView 在整层统一控制，
 * 逐块半透明会在行盒重叠处叠成横条（与选中高亮是同一个坑）。
 */
const MARK_COLORS = [
  { value: '#ffd60a', label: 'Yellow' },
  { value: '#4ade80', label: 'Green' },
  { value: '#60a5fa', label: 'Blue' },
  { value: '#f472b6', label: 'Pink' },
  { value: '#fb923c', label: 'Orange' },
];

/** 稳定的空数组：直接写 `[]` 会让 memo 的页面每次渲染都判定 props 变了 */
const EMPTY_HIGHLIGHTS: PdfHighlight[] = [];
const EMPTY_TRANSLATIONS: PdfTranslation[] = [];
const EMPTY_PENDING: PendingTranslation[] = [];

/** 气泡与选区之间的间距 */
const BUBBLE_GAP = 10;
/** 气泡与面板边缘的最小留白 */
const BUBBLE_PAD = 8;

interface SelectionBubble {
  text: string;
  /** 1-based */
  page: number;
  /**
   * 以下均为相对气泡包含块（面板 body，见下面 setBubble 处的说明）的像素值。
   *
   * 这里只记**几何**、不记最终位置：气泡摆哪取决于它自己的高度（上方放不下要翻到下方），
   * 而高度要等它渲染出来才知道，所以位置留到渲染时算（见 bubblePos）。
   */
  centerX: number;
  selTop: number;
  selBottom: number;
  hostW: number;
  hostH: number;
  garbled: boolean;
}

export default function PdfPanel({ sessionId }: PdfPanelProps) {
  const pdfState = useSessionStore((s) => s.sessions[sessionId]?.microApps?.pdf);
  const sessionNodes = useSessionStore((s) => s.sessions[sessionId]?.nodes);
  // 气泡上两个按钮各自的目标节点。订阅而不是 getState()：hover 提示要如实说明
  // "现在会挂到哪个节点上"，取值期间用户切了节点，提示就得跟着变。
  const currentNodeId = useSessionStore((s) => s.sessions[sessionId]?.currentNodeId ?? null);
  const rootNodeId = useSessionStore((s) => s.sessions[sessionId]?.rootNodeId ?? null);
  const setSessionMicroApp = useSessionStore((s) => s.setSessionMicroApp);
  const addQuotedNode = useSessionStore((s) => s.addQuotedNode);
  const setActiveMicroApp = useUIStore((s) => s.setActiveMicroApp);
  const pendingJump = usePdfViewerStore((s) => s.pendingJump);
  const consumeJump = usePdfViewerStore((s) => s.consumeJump);

  const docId = pdfState?.docId ?? null;

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [missingFile, setMissingFile] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * 用于计算缩放的容器宽度 —— 是**停稳后**的宽度，不是实时的。
   *
   * 拖动分隔条时容器宽度每帧都在变，而宽度一变，所有可视页就要重新光栅化
   * （每页几十毫秒）并重建文本层。逐帧做必然掉帧，所以这里等宽度安静下来
   * 再采用：拖动期间画面保持原尺寸（居中显示，不跟随变宽），松手后重排一次。
   */
  const [settledWidth, setSettledWidth] = useState(0);
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  /** 实测高度，按 scale 归档：缩放一变旧测量值就作废 */
  const [measured, setMeasured] = useState<{ scale: number; heights: Map<number, number> }>({
    scale: 0,
    heights: new Map(),
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [range, setRange] = useState<[number, number]>([0, -1]);

  // ===== 截图（拖框选区）=====
  const [capturing, setCapturing] = useState(false);
  /**
   * 拖拽中的矩形用 ref + 直接改样式，而不是每 move 一次 setState。
   *
   * 面板渲染一次要遍历全部页（`Array.from({length: pageCount})`），
   * 大文档上逐帧 setState 会明显掉帧 —— 与分隔条拖动同一套处理。
   */
  const captureDragRef = useRef<{ clientX0: number; clientY0: number; clientX1: number; clientY1: number } | null>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const setDraft = useImageDraftStore((s) => s.setDraft);
  const [bubble, setBubble] = useState<SelectionBubble | null>(null);
  /** 记号笔颜色面板（二级弹出） */
  const [markMenu, setMarkMenu] = useState(false);
  /**
   * 正在请求中的译文。
   *
   * **刻意不写进会话**：翻译是异步的，写进 store 就意味着撤销会撤出一个
   * 还没拿到结果的空壳。成功之后才作为一条 PdfTranslation 落库，
   * 于是"一次翻译 = 一步撤销"。
   */
  const [pendingTranslations, setPendingTranslations] = useState<Record<string, PendingTranslation>>({});
  /**
   * 气泡实测尺寸。
   *
   * 必须实测、不能写死常量：按钮文案一改宽度就变，用估的夹取量会让气泡从面板边缘溢出去；
   * 而"选区上方放不下就翻到下方"这个判断也依赖真实高度。
   * 用 useLayoutEffect 在浏览器绘制前量好并回写，所以定位在同一帧内完成，看不到跳动。
   */
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    setBubbleSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, [bubble]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPageRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  /** 文档首次就绪后只自动定位一次（回到"上次读到哪页"） */
  const initialScrollDoneRef = useRef<string | null>(null);

  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
  }, []);

  // ===== 打开文档 =====

  useEffect(() => {
    if (!docId) {
      setDoc(null);
      return;
    }

    let cancelled = false;
    setMissingFile(false);
    setLoadError('');

    acquirePdfDocument(docId)
      .then((loaded) => {
        if (!cancelled) setDoc(loaded);
      })
      .catch(async (err) => {
        if (cancelled) return;
        console.error('[PdfPanel] 打开文档失败:', err);
        // 区分"本机没有这份文件"与"文件坏了"：前者要引导用户重新上传
        const exists = await hasLocalPdf(docId).catch(() => false);
        if (cancelled) return;
        setMissingFile(!exists);
        setLoadError((err as Error)?.message ?? '打开失败');
      });

    return () => {
      cancelled = true;
      releasePdfDocument(docId);
    };
  }, [docId]);

  // 页数回填到会话：换设备缺文件时要说清楚"缺的是哪一份、共多少页"
  useEffect(() => {
    if (!doc || !pdfState) return;
    if (pdfState.pageCount === doc.numPages) return;

    setSessionMicroApp(sessionId, 'pdf', { ...pdfState, pageCount: doc.numPages });
  }, [doc, pdfState, sessionId, setSessionMicroApp]);

  // 第一页的原始尺寸：作为所有页的占位高度基准（不逐页 getPage，那在大文档上很慢）
  useEffect(() => {
    if (!doc) return;

    let cancelled = false;
    doc
      .getPage(1)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        setBaseSize({ width: viewport.width, height: viewport.height });
      })
      .catch((err) => {
        if (!cancelled) console.error('[PdfPanel] 读取页面尺寸失败:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [doc]);

  // 容器宽度（缩放基准）。用 ResizeObserver 而不是在 effect 里同步量：
  // 一是回调是异步的（不触发 lint 的 set-state-in-effect），二是面板宽度本来就可能变。
  //
  // 依赖必须带上 doc：滚动容器是等 doc 就绪后才渲染出来的，
  // 只依赖 docId 的话首帧量不到元素、而 effect 不会重跑 —— 宽度永远是 0，
  // 于是缩放算不出来、整页都渲染不出来。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let settleTimer: number | null = null;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;

      // 首次立即采用（否则首屏要白等一个静默期）
      setSettledWidth((prev) => (prev === 0 ? width : prev));

      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => setSettledWidth(width), WIDTH_SETTLE_MS);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (settleTimer !== null) clearTimeout(settleTimer);
    };
  }, [docId, doc]);

  // ===== 尺寸与分页几何 =====

  const fitScale = useMemo(() => {
    if (!baseSize || settledWidth <= 0) return 0;
    return Math.max((settledWidth - SIDE_PADDING * 2) / baseSize.width, ZOOM_MIN);
  }, [baseSize, settledWidth]);

  const scale = fitScale > 0 ? fitScale * zoom : 0;

  const heights = useMemo(() => {
    if (!baseSize || scale <= 0 || !doc) return [];
    const fallback = baseSize.height * scale;
    return Array.from({ length: doc.numPages }, (_, i) =>
      measured.scale === scale ? (measured.heights.get(i + 1) ?? fallback) : fallback
    );
  }, [baseSize, scale, doc, measured]);

  const offsets = useMemo(() => buildOffsets(heights), [heights]);
  const pageWidth = baseSize && scale > 0 ? baseSize.width * scale : 0;

  const handleMeasured = useCallback(
    (pageNumber: number, size: { width: number; height: number }) => {
      setMeasured((prev) => {
        // scale 变了说明这一批测量值已经过期，从新的一批开始
        const heights = prev.scale === scale ? new Map(prev.heights) : new Map<number, number>();
        if (heights.get(pageNumber) === size.height) return prev;
        heights.set(pageNumber, size.height);
        return { scale, heights };
      });
    },
    [scale]
  );

  // ===== 缩放 =====

  /**
   * 缩放锚点：当前页 + 页内比例。
   *
   * 缩放会重排页面高度，不记住位置的话，看到一半放大就会被甩回别处。
   * 锚点在缩放前记下，重排后由下面那个 effect 恢复一次。
   */
  const zoomAnchorRef = useRef<{ page: number; frac: number } | null>(null);

  const applyZoom = useCallback(
    (compute: (current: number) => number) => {
      const el = scrollRef.current;
      if (el && offsets.length > 0) {
        const index = Math.max(Math.min(currentPageRef.current, offsets.length), 1) - 1;
        const height = heights[index] || 1;
        zoomAnchorRef.current = {
          page: currentPageRef.current,
          frac: (el.scrollTop - offsets[index]) / height,
        };
      }
      setZoom((current) => Math.min(Math.max(compute(current), ZOOM_MIN), ZOOM_MAX));
    },
    [offsets, heights]
  );

  // 缩放重排后回到原来的阅读位置（只在刚缩放过时才动作）
  useEffect(() => {
    const anchor = zoomAnchorRef.current;
    const el = scrollRef.current;
    if (!anchor || !el || offsets.length === 0) return;

    zoomAnchorRef.current = null;
    const index = Math.min(anchor.page, offsets.length) - 1;
    el.scrollTop = Math.max(0, offsets[index] + anchor.frac * (heights[index] || 0));
  }, [offsets, heights]);

  /**
   * Ctrl/Cmd + 滚轮缩放（普通滚轮照常滚动）。
   *
   * 用手写监听而不是 React 的 onWheel：React 把 wheel 注册成 passive 的，
   * 在那里 preventDefault 拦不住页面滚动，缩放和滚动会同时发生。
   * 触控板双指捏合在浏览器里也是 ctrlKey 的 wheel 事件，所以这条一并覆盖。
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyZoom((current) => current * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, docId, doc]);

  /**
   * 是否按住 Ctrl / Cmd。
   *
   * 记号笔的交互靠它分流：
   * - **不按**：标记不吃鼠标事件，整段原文照常拖选（原先是这个行为，默认态就该是它）
   * - **按住**：标记变为可点击、光标变手型，点一下在画布上定位到对应节点
   *
   * 状态放在面板这一层，避免每个可见页各挂一套键盘监听。
   * （macOS 上 Ctrl+左键是系统的"次要点击"，所以 Cmd 也一起认。）
   */
  const [modifierHeld, setModifierHeld] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setModifierHeld(e.ctrlKey || e.metaKey);
    // 切走再回来时按键状态会失真（keyup 收不到），所以失焦一律复位
    const onBlur = () => setModifierHeld(false);

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // ===== 滚动：当前页 + 需要挂载的页 =====

  /**
   * 按当前滚动位置算出「可见页范围」与「当前页」。
   *
   * 抽成独立函数是因为它有两个触发源：滚动，以及分页几何刚就绪的那一刻（见下面那个 effect）。
   */
  const syncVisibleRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el || offsets.length === 0) return;

    const { scrollTop, clientHeight } = el;

    const [start, end] = visibleRange(offsets, heights, scrollTop, clientHeight);
    setRange((prev) => (prev[0] === start && prev[1] === end ? prev : [start, end]));

    const page = pageAtOffset(offsets, scrollTop, clientHeight) + 1;
    setCurrentPage((prev) => (prev === page ? prev : page));
  }, [offsets, heights]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || rafRef.current !== null) return;

    // 合并到下一帧：滚动事件比帧还密，逐次计算纯属浪费
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      syncVisibleRange();
    });
  }, [syncVisibleRange]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 页码回写会话（静默期内合并）
  useEffect(() => {
    currentPageRef.current = currentPage;
    if (!docId || !pdfState || pdfState.page === currentPage) return;

    const timer = setTimeout(() => {
      const latest = useSessionStore.getState().sessions[sessionId]?.microApps?.pdf;
      if (latest) {
        setSessionMicroApp(sessionId, 'pdf', { ...latest, page: currentPageRef.current });
      }
    }, PAGE_FLUSH_MS);

    return () => clearTimeout(timer);
  }, [currentPage, docId, pdfState, sessionId, setSessionMicroApp]);

  // 离开面板（关闭或切会话）时立刻补一次，别让最后一段阅读位置丢掉
  useEffect(() => {
    return () => {
      const latest = useSessionStore.getState().sessions[sessionId]?.microApps?.pdf;
      if (latest && latest.page !== currentPageRef.current) {
        useSessionStore.getState().setSessionMicroApp(sessionId, 'pdf', {
          ...latest,
          page: currentPageRef.current,
        });
      }
    };
  }, [sessionId]);

  // 打开文档后回到上次读到的位置（只做一次）
  useEffect(() => {
    if (!doc || !docId || offsets.length === 0) return;
    if (initialScrollDoneRef.current === docId) return;
    initialScrollDoneRef.current = docId;

    const el = scrollRef.current;
    const page = pdfState?.page ?? 1;
    if (!el || page <= 1) return;
    el.scrollTop = Math.max(0, offsets[Math.min(page, offsets.length) - 1] - PAGE_TOP_PADDING);
  }, [doc, docId, offsets, pdfState]);

  /**
   * 分页几何就绪后立刻算一次可见范围。
   *
   * 没有这一步，页面要等到**第一次 scroll 事件**才会挂载，而刚打开一份文档时根本不会
   * 发生滚动：内容还没渲染出来，容器要么不可滚动（单页短文档）、要么滚动位置没变，
   * 两种情况浏览器都不发 scroll。表现是打开 PDF 后只剩页码占位符，手动滚一下内容才出来。
   *
   * 必须排在"回到上次读到的位置"那个 effect **之后**（声明顺序即执行顺序）：它先把
   * scrollTop 摆到上次的页，这里再量，才能一次就落在正确的页上，不会先闪一下第一页。
   */
  useEffect(() => {
    syncVisibleRange();
  }, [syncVisibleRange]);

  // 节点上的页码角标 → 跳到这里
  useEffect(() => {
    if (!pendingJump || pendingJump.docId !== docId || offsets.length === 0) return;

    const el = scrollRef.current;
    if (!el) return;

    const index = Math.min(Math.max(pendingJump.page, 1), offsets.length) - 1;
    el.scrollTo({ top: Math.max(0, offsets[index] - PAGE_TOP_PADDING), behavior: 'smooth' });
    consumeJump();
  }, [pendingJump, docId, offsets, consumeJump]);

  // ===== 选中 → 建节点 =====

  const handleSelectionEnd = useCallback(() => {
    const selection = window.getSelection();
    const el = scrollRef.current;

    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !el || !selection.toString().trim()) {
      setBubble(null);
      return;
    }

    const range = selection.getRangeAt(0);
    // 页码取选区**起点**所在页：跨页选区在 v1 记起始页
    const anchor = selection.anchorNode;
    const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;

    // 译文块里的文字是应用产出的，不是论文原文：选中它就只是选取复制，
    // 不该再弹出"建节点 / 翻译"这套针对原文的操作。
    if (anchorEl?.closest('[data-translation-box]')) {
      setBubble(null);
      return;
    }

    const pageEl = anchorEl?.closest('[data-page]');
    const page = pageEl ? Number(pageEl.getAttribute('data-page')) : NaN;
    if (!page) {
      setBubble(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const host = el.parentElement;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();

    setMarkMenu(false);
    setBubble({
      text: selection.toString(),
      page,
      centerX: rect.left - hostRect.left + rect.width / 2,
      selTop: rect.top - hostRect.top,
      selBottom: rect.bottom - hostRect.top,
      hostW: hostRect.width,
      hostH: hostRect.height,
      garbled: looksGarbled(selection.toString()),
    });
  }, []);

  /**
   * 选区真的变了（尤其是被收成光标）时收起气泡。
   *
   * 只靠滚动容器的 mouseup 不够：在已经选中的文字上再点一下，浏览器会先把选区
   * 收成一个光标，而这一步有时发生在 mouseup 回调**之后** —— 那次 mouseup 读到的
   * 还是旧选区，气泡被原样重建，之后就再没有人来收它了（表现出来就是"点选区里
   * 工具栏不消失，但选中背景已经没了"）。
   *
   * selectionchange 才是选区真正变化的信号，而且不依赖任何一次事件的先后顺序。
   * 只在**收成光标**时动手，不在这里重算气泡：拖选过程中会连续触发，
   * 每次都 `toString()` 一次大选区并不便宜。
   */
  useEffect(() => {
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.isCollapsed) setBubble(null);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  /**
   * 把当前选区建成画布节点。
   *
   * attachTo 决定挂到哪：'current' 挂在用户正看着的激活节点下（默认动作），
   * 'root' 挂在根节点下（想让这条摘录另起一条独立链路时用）。
   */
  const handleCreateNode = useCallback(
    (attachTo: 'current' | 'root') => {
      if (!bubble || !docId) return;

      const parentId = attachTo === 'root' ? rootNodeId : currentNodeId;

      if (!parentId || !sessionNodes?.[parentId]) {
        useDialogStore.getState().showToast(
          attachTo === 'root' ? '这个会话还没有根节点' : '这个会话还没有可挂接的当前节点',
          { type: 'error' }
        );
        return;
      }

      const quote = buildPdfQuote({
        text: bubble.text,
        page: bubble.page,
        docId,
        docName: pdfState?.name,
      });

      // 先把选区在页面上的位置算出来，再建节点 —— 建完后要清空选区，那时就算不到了。
      const rects = collectHighlightRects(bubble.page);

      const nodeId = addQuotedNode({ content: quote.content, parentId, metadata: quote.metadata });
      window.getSelection()?.removeAllRanges();
      setBubble(null);

      if (!nodeId) {
        useDialogStore.getState().showToast('当前没有可写入的会话', { type: 'error' });
        return;
      }

      // 摘录到画布后在原文上留一层记号笔：下次翻到这里就知道"这段已经进画布了"
      if (rects.length > 0) {
        const latest = useSessionStore.getState().sessions[sessionId]?.microApps?.pdf;
        if (latest) {
          setSessionMicroApp(sessionId, 'pdf', {
            ...latest,
            highlights: [
              ...(latest.highlights ?? []),
              { nodeId, docId, page: bubble.page, rects },
            ],
          });
        }
      }

      if (quote.truncated) {
        useDialogStore.getState().showToast(
          `选区过长，已摘取前 ${PDF_QUOTE_MAX_CHARS} 字`,
          { type: 'info' }
        );
      }
    },
    [bubble, docId, pdfState, addQuotedNode, sessionId, setSessionMicroApp, currentNodeId, rootNodeId, sessionNodes]
  );

  // 两个按钮的目标是否可用。不可用时按钮置灰、提示也换成原因，
  // 否则点下去只会弹一个 toast，而按钮看上去还是能点的。
  const hasCurrentTarget = Boolean(currentNodeId && sessionNodes?.[currentNodeId]);
  const hasRootTarget = Boolean(rootNodeId && sessionNodes?.[rootNodeId]);

  /**
   * 给当前选区画一道记号笔（**不建节点**）。
   *
   * 与摘取的区别：摘取的标记绑定节点、可点击跳回；记号笔只是阅读标注，
   * 没有 nodeId，所以既不跳转、也不会因为节点被删而消失。
   */
  const handleMark = useCallback(
    (color: string) => {
      if (!bubble || !docId) return;

      // 先算位置再清选区（清完就取不到了）
      const rects = collectHighlightRects(bubble.page);
      if (rects.length === 0) return;

      const latest = useSessionStore.getState().sessions[sessionId]?.microApps?.pdf;
      if (latest) {
        setSessionMicroApp(sessionId, 'pdf', {
          ...latest,
          highlights: [
            ...(latest.highlights ?? []),
            { docId, page: bubble.page, rects, color },
          ],
        });
      }

      window.getSelection()?.removeAllRanges();
      setBubble(null);
      setMarkMenu(false);
    },
    [bubble, docId, sessionId, setSessionMicroApp]
  );

  /**
   * 选区起点处**真实的字号 ÷ 页面高度**。
   *
   * 为什么不从行高推算：行盒里还夹着 leading，且 pdf.js 的行盒比字的实际高度大，
   * 估出来会偏大一圈 —— 汉字吃满字身框，再偏大就明显"比原文胖"。
   * 文本层的 span 上就有 pdf.js 算好的最终字号，直接读它最准。
   *
   * 返回比例而不是像素，是为了缩放后能按新的页面高度还原。
   * 取不到（选区落在空白、老数据）时返回 undefined，渲染层退回按行高估算。
   */
  const measureSelectionFontRatio = (page: number): number | undefined => {
    const pageEl = scrollRef.current?.querySelector(`[data-page="${page}"]`);
    if (!(pageEl instanceof HTMLElement)) return undefined;

    const pageHeight = pageEl.getBoundingClientRect().height;
    if (pageHeight <= 0) return undefined;

    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
    const span = anchorEl?.closest('.pdf-text-layer span');
    if (!(span instanceof HTMLElement)) return undefined;

    const size = parseFloat(getComputedStyle(span).fontSize);
    return Number.isFinite(size) && size > 0 ? size / pageHeight : undefined;
  };

  /**
   * 把当前选区在某一页上的位置算成归一化矩形。
   *
   * 用比例而不是像素：缩放、改面板宽度、换设备都不用重算。
   * 跨页选区只取落在这一页里的矩形（其余丢掉，v1 不标注到第二页）。
   */
  const collectHighlightRects = (page: number): Array<[number, number, number, number]> => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return [];

    const pageEl = scrollRef.current?.querySelector(`[data-page="${page}"]`);
    if (!(pageEl instanceof HTMLElement)) return [];

    const pageRect = pageEl.getBoundingClientRect();
    if (pageRect.width <= 0 || pageRect.height <= 0) return [];

    const rects: Array<[number, number, number, number]> = [];
    for (const rect of Array.from(selection.getRangeAt(0).getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) continue;

      const x = (rect.left - pageRect.left) / pageRect.width;
      const y = (rect.top - pageRect.top) / pageRect.height;
      const w = rect.width / pageRect.width;
      const h = rect.height / pageRect.height;

      // 越界的碎片（多页选区里属于别的页的那部分）丢掉
      if (y < -0.01 || y > 1.01 || x < -0.01 || x > 1.01) continue;

      rects.push([Math.max(x, 0), Math.max(y, 0), Math.min(w, 1), Math.min(h, 1)]);
    }
    return rects;
  };

  /** 当前文档、按页分组的记号笔（换过文件时旧的不会画到新文件上） */
  const highlightsByPage = useMemo(() => {
    const map = new Map<number, PdfHighlight[]>();
    if (!docId) return map;

    for (const highlight of pdfState?.highlights ?? []) {
      if (highlight.docId !== docId) continue;
      // 节点已被删除的标记就不要再画了："这段已经进画布"这个断言已经不成立。
      // 没有 nodeId 的纯记号笔不依赖任何节点，永远保留。
      if (highlight.nodeId && !sessionNodes?.[highlight.nodeId]) continue;

      const list = map.get(highlight.page);
      if (list) list.push(highlight);
      else map.set(highlight.page, [highlight]);
    }
    return map;
  }, [pdfState, docId, sessionNodes]);

  /** 点标记 → 在画布上聚焦对应节点（画布的跟随逻辑会把它居中） */
  const handleHighlightClick = useCallback((nodeId: string) => {
    const session = useSessionStore.getState().sessions[sessionId];
    if (!session?.nodes[nodeId]) {
      useDialogStore.getState().showToast('这条摘录对应的节点已被删除', { type: 'info' });
      return;
    }
    useSessionStore.getState().focusNode(nodeId);
  }, [sessionId]);

  // ===== 译文（涂改液）=====

  /** 当前文档、按页分组的译文（换过文件时旧的不会画到新文件上） */
  const translationsByPage = useMemo(() => {
    const map = new Map<number, PdfTranslation[]>();
    if (!docId) return map;

    for (const translation of pdfState?.translations ?? []) {
      if (translation.docId !== docId) continue;
      const list = map.get(translation.page);
      if (list) list.push(translation);
      else map.set(translation.page, [translation]);
    }
    return map;
    // 只跟着 translations 走：翻页、缩放同样会换掉 pdfState 的引用，
    // 而它们不该让所有带译文的页重新渲染
  }, [pdfState?.translations, docId]);

  /** 正在翻译的区域，同样按页分组 */
  const pendingByPage = useMemo(() => {
    const map = new Map<number, PendingTranslation[]>();
    if (!docId) return map;

    for (const pending of Object.values(pendingTranslations)) {
      if (pending.docId !== docId) continue;
      const list = map.get(pending.page);
      if (list) list.push(pending);
      else map.set(pending.page, [pending]);
    }
    return map;
  }, [pendingTranslations, docId]);

  /**
   * 翻译当前选区。
   *
   * 目标语言固定中文：不做源语言判断 —— 即使是中文，繁体转简体、口语转书面语
   * 也仍然有意义，加一条"看起来不用翻"的判断反而会让行为不可预期。
   */
  const handleTranslate = useCallback(() => {
    if (!bubble || !docId) return;

    const source = bubble.text;
    if (source.trim().length > PDF_TRANSLATE_MAX_CHARS) {
      useDialogStore.getState().showToast(
        `选区超过 ${PDF_TRANSLATE_MAX_CHARS} 字，请分段翻译`,
        { type: 'info' }
      );
      return;
    }
    if (looksGarbled(source)) {
      useDialogStore.getState().showToast('这段文字可能是乱码，无法翻译', { type: 'error' });
      return;
    }

    // 先算位置和字号再清选区（清完就都取不到了）
    const rects = collectHighlightRects(bubble.page);
    if (rects.length === 0) return;
    const fontRatio = measureSelectionFontRatio(bubble.page);

    const page = bubble.page;
    window.getSelection()?.removeAllRanges();
    setBubble(null);

    const id = newTranslationId();
    setPendingTranslations((prev) => ({
      ...prev,
      [id]: { id, docId, page, rects, fontRatio, text: '' },
    }));

    const finishPending = () => {
      setPendingTranslations((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    void (async () => {
      try {
        const translated = await translateToChinese(source, (partial) => {
          setPendingTranslations((prev) => {
            const current = prev[id];
            if (!current) return prev;
            return { ...prev, [id]: { ...current, text: partial } };
          });
        });

        if (isUnreadableTranslation(translated)) {
          useDialogStore.getState().showToast(
            '这段文字不是可识别的语言（可能是乱码或图片），没有翻译',
            { type: 'error' }
          );
          return;
        }
        if (!translated) {
          useDialogStore.getState().showToast('模型没有返回译文', { type: 'error' });
          return;
        }

        const latest = useSessionStore.getState().sessions[sessionId]?.microApps?.pdf;
        if (!latest) return;

        // 同一位置重复翻译 → 替换，而不是叠两个白块
        const kept = (latest.translations ?? []).filter(
          (item) => !(item.docId === docId && item.page === page && rectsMatch(item.rects, rects))
        );

        setSessionMicroApp(sessionId, 'pdf', {
          ...latest,
          translations: [
            ...kept,
            {
              id,
              docId,
              page,
              rects,
              sourceText: source,
              translatedText: translated,
              targetLang: 'zh',
              fontRatio,
              createdAt: Date.now(),
            },
          ],
        });
      } catch (error: unknown) {
        const err = error as Error;
        useDialogStore.getState().showToast(err?.message || '翻译失败，请稍后重试', { type: 'error' });
      } finally {
        finishPending();
      }
    })();
  }, [bubble, docId, sessionId, setSessionMicroApp]);

  /** 删除一条译文（可撤销：translations 数组变了，setSessionMicroApp 会记一步） */
  const handleDeleteTranslation = useCallback(
    (id: string) => {
      const latest = useSessionStore.getState().sessions[sessionId]?.microApps?.pdf;
      const translations = latest?.translations;
      if (!latest || !translations) return;

      const next = translations.filter((item) => item.id !== id);
      if (next.length === translations.length) return;

      setSessionMicroApp(sessionId, 'pdf', { ...latest, translations: next });
    },
    [sessionId, setSessionMicroApp]
  );

  // ===== 截图：拖框选区 =====

  const cancelCapture = useCallback(() => {
    captureDragRef.current = null;
    setCapturing(false);
    if (marqueeRef.current) marqueeRef.current.style.display = 'none';
  }, []);

  // Esc 取消截图
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelCapture();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capturing, cancelCapture]);

  /** 直接把选框写到 DOM 上，不走 setState（理由见 captureDragRef 的注释） */
  const paintMarquee = useCallback((drag: { clientX0: number; clientY0: number; clientX1: number; clientY1: number }, overlay: DOMRect) => {
    const el = marqueeRef.current;
    if (!el) return;
    el.style.display = 'block';
    el.style.left = `${Math.min(drag.clientX0, drag.clientX1) - overlay.left}px`;
    el.style.top = `${Math.min(drag.clientY0, drag.clientY1) - overlay.top}px`;
    el.style.width = `${Math.abs(drag.clientX1 - drag.clientX0)}px`;
    el.style.height = `${Math.abs(drag.clientY1 - drag.clientY0)}px`;
  }, []);

  const handleCapturePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const drag = { clientX0: e.clientX, clientY0: e.clientY, clientX1: e.clientX, clientY1: e.clientY };
    captureDragRef.current = drag;
    paintMarquee(drag, e.currentTarget.getBoundingClientRect());
  };

  const handleCapturePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = captureDragRef.current;
    if (!drag) return;
    drag.clientX1 = e.clientX;
    drag.clientY1 = e.clientY;
    paintMarquee(drag, e.currentTarget.getBoundingClientRect());
  };

  const handleCapturePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = captureDragRef.current;
    captureDragRef.current = null;

    // 点击（而非拖动）视为取消
    if (!drag || Math.abs(e.clientX - drag.clientX0) < 8 || Math.abs(e.clientY - drag.clientY0) < 8) {
      cancelCapture();
      return;
    }

    setCapturing(false);
    if (marqueeRef.current) marqueeRef.current.style.display = 'none';

    const started = pageAtClientPoint(scrollRef.current, drag.clientX0, drag.clientY0);
    if (!started) {
      useDialogStore.getState().showToast('请在页面区域内框选', { type: 'info' });
      return;
    }

    // 只截一页：把选区夹到起始页的范围内，跨页的部分丢掉
    const pageRect = started.el.getBoundingClientRect();
    const sel = {
      left: Math.max(Math.min(drag.clientX0, e.clientX), pageRect.left),
      top: Math.max(Math.min(drag.clientY0, e.clientY), pageRect.top),
      right: Math.min(Math.max(drag.clientX0, e.clientX), pageRect.right),
      bottom: Math.min(Math.max(drag.clientY0, e.clientY), pageRect.bottom),
    };
    if (sel.right - sel.left < 8 || sel.bottom - sel.top < 8) return;

    try {
      const cropped = await cropPageRegion(started.el, sel);
      if (!cropped) throw new Error('这块区域没有可截取的内容');

      const imageId = await hashFileBytes(await cropped.blob.arrayBuffer());
      await saveImage({
        imageId,
        blob: cropped.blob,
        width: cropped.width,
        height: cropped.height,
      });

      setDraft({
        imageId,
        thumb: cropped.thumb,
        width: cropped.width,
        height: cropped.height,
        page: started.page,
        docId: docId ?? undefined,
      });
      useDialogStore.getState().showToast('已截取，可直接向模型提问', { type: 'success' });
    } catch (err) {
      console.error('[PdfPanel] 截图失败:', err);
      useDialogStore.getState().showToast((err as Error)?.message || '截图失败', { type: 'error' });
    }
  };

  // ===== 打开 / 更换文件 =====

  const handlePickFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const bytes = await file.arrayBuffer();
        const nextDocId = await hashFileBytes(bytes);

        // 已经在本机就复用它（同一份论文被两个会话打开时只存一份）
        if (!(await hasLocalPdf(nextDocId))) {
          const pdfjs = await getPdfjs();
          // 注意：getDocument 会把 bytes **转移**给 worker，此后 bytes 不可再用；
          // 上面存文件用的是 File 对象本身，所以不受影响
          const loadingTask = pdfjs.getDocument({ data: bytes, ...getPdfDocumentParams() });
          const loaded = await loadingTask.promise;
          await saveLocalPdf({ file, docId: nextDocId, pageCount: loaded.numPages });
          // 刚解码的这份直接放进缓存，避免面板打开时再解码一遍
          primePdfDocumentCache(nextDocId, loadingTask);
        }

        if (pdfState && pdfState.docId !== nextDocId) {
          const confirmed = await new Promise<boolean>((resolve) => {
            useDialogStore.getState().showConfirm({
              title: '更换阅读的 PDF',
              message: '这个对话里记录的原文引用仍指向原来那份文件，替换后它们的页码角标会显示为「本机无文件」。确定更换吗？',
              confirmText: '更换',
              onConfirm: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });
          if (!confirmed) return;
        }

        setSessionMicroApp(sessionId, 'pdf', { docId: nextDocId, page: 1, name: file.name });
      } catch (err) {
        console.error('[PdfPanel] 打开文件失败:', err);
        useDialogStore.getState().showToast(
          (err as Error)?.message || '这个文件打不开，可能不是有效的 PDF',
          { type: 'error' }
        );
      } finally {
        setBusy(false);
      }
    },
    [pdfState, sessionId, setSessionMicroApp]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // 先复位，否则连续选同一个文件不会再触发 change
      e.target.value = '';
      if (file) void handlePickFile(file);
    },
    [handlePickFile]
  );

  // ===== 渲染 =====

  const pageCount = doc?.numPages ?? 0;

  /**
   * 气泡摆放：**优先贴选区上方，上方放不下才翻到下方** —— 两种情况都不压住选区。
   *
   * 垂直方向用 bottom 而不是 top 是关键：`bottom: hostH - selTop + GAP` 把气泡的
   * **下边缘**钉在选区上方，因此不依赖气泡高度就保证不遮挡（高度只在决定要不要翻转时才用得上）。
   * 水平方向继续居中（配合 -translate-x-1/2），夹取量用实测半宽，避免贴边时溢出面板。
   */
  const bubblePos = useMemo(() => {
    if (!bubble) return null;

    const halfW = bubbleSize.width / 2;
    const lower = halfW + BUBBLE_PAD;
    // 气泡比面板还宽时 upper 会小于 lower，取 lower 兜底，避免夹取区间反向
    const upper = Math.max(bubble.hostW - halfW - BUBBLE_PAD, lower);
    const left = Math.min(Math.max(bubble.centerX, lower), upper);

    const placeAbove = bubble.selTop - bubbleSize.height - BUBBLE_GAP >= BUBBLE_PAD;

    return placeAbove
      ? { left, bottom: bubble.hostH - bubble.selTop + BUBBLE_GAP }
      : { left, top: bubble.selBottom + BUBBLE_GAP };
  }, [bubble, bubbleSize]);

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
        <FileText size={15} className="text-leaf-600 shrink-0" />
        <span className="text-sm text-gray-700 truncate flex-1" title={pdfState?.name}>
          {pdfState?.name || 'PDF 阅读'}
        </span>

        {pageCount > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                const el = scrollRef.current;
                if (!el || offsets.length === 0) return;
                const index = Math.max(currentPage - 2, 0);
                el.scrollTo({ top: Math.max(0, offsets[index] - PAGE_TOP_PADDING), behavior: 'smooth' });
              }}
              disabled={currentPage <= 1}
              className="p-1 text-gray-400 hover:text-leaf-600 disabled:opacity-30 transition-colors"
              title="上一页"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs text-gray-500 tabular-nums">
              {currentPage} / {pageCount}
            </span>
            <button
              onClick={() => {
                const el = scrollRef.current;
                if (!el || offsets.length === 0) return;
                const index = Math.min(currentPage, offsets.length - 1);
                el.scrollTo({ top: Math.max(0, offsets[index] - PAGE_TOP_PADDING), behavior: 'smooth' });
              }}
              disabled={currentPage >= pageCount}
              className="p-1 text-gray-400 hover:text-leaf-600 disabled:opacity-30 transition-colors"
              title="下一页"
            >
              <ChevronRight size={15} />
            </button>

            <span className="w-px h-4 bg-gray-200 mx-1" />

            <button
              onClick={() => applyZoom((z) => z / ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              className="p-1 text-gray-400 hover:text-leaf-600 disabled:opacity-30 transition-colors"
              title="缩小"
            >
              <Minus size={15} />
            </button>
            <button
              onClick={() => applyZoom(() => 1)}
              className="text-xs text-gray-500 hover:text-leaf-600 tabular-nums w-10 transition-colors"
              title="适应宽度"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => applyZoom((z) => z * ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              className="p-1 text-gray-400 hover:text-leaf-600 disabled:opacity-30 transition-colors"
              title="放大"
            >
              <Plus size={15} />
            </button>
          </div>
        )}

        {/* 截图：进入拖框选区模式 */}
        <button
          onClick={() => { captureDragRef.current = null; setCapturing(true); }}
          disabled={!doc || capturing}
          className="p-1 text-gray-400 hover:text-leaf-600 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors shrink-0"
          title="截图"
        >
          <Camera size={15} />
        </button>

        <span className="w-px h-4 bg-gray-200 mx-1 shrink-0" />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs text-gray-500 hover:text-leaf-600 transition-colors shrink-0"
          title="打开另一份 PDF"
        >
          换文件
        </button>
        <button
          onClick={() => setActiveMicroApp(null)}
          className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors shrink-0"
          title="关闭阅读器"
        >
          <X size={15} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* 主体 */}
      <div className="relative flex-1 overflow-hidden bg-gray-100">
        {busy && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 size={15} className="animate-spin text-leaf-600" />
              正在打开……
            </div>
          </div>
        )}

        {!docId ? (
          <EmptyState
            title="打开一篇论文"
            hint="选中原文即可在右侧画布上建立节点"
            actionLabel="选择 PDF 文件"
            onAction={() => fileInputRef.current?.click()}
          />
        ) : missingFile ? (
          <EmptyState
            title="本机没有这份 PDF"
            hint={
              pdfState?.pageCount
                ? `缺少「${pdfState.name || '未命名'}」（共 ${pdfState.pageCount} 页）。重新上传同一份文件即可恢复阅读位置与引用。`
                : `缺少「${pdfState?.name || '未命名'}」。重新上传同一份文件即可恢复。`
            }
            actionLabel="重新上传同一份"
            onAction={() => fileInputRef.current?.click()}
          />
        ) : !doc ? (
          <div className="flex items-center justify-center h-full">
            {loadError ? (
              <div className="text-sm text-red-600 px-6 text-center">{loadError}</div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={15} className="animate-spin text-leaf-600" />
                正在载入 PDF……
              </div>
            )}
          </div>
        ) : (
          <div
            ref={setScrollEl}
            onScroll={handleScroll}
            onMouseUp={handleSelectionEnd}
            onKeyUp={handleSelectionEnd}
            className="h-full overflow-auto"
          >
            {/*
              缩放还没算出来（容器宽度尚未测量）时先不渲染页面。
              注意这个滚动容器本身必须**始终**渲染：测量宽度的 ResizeObserver 观察的就是它，
              连它一起藏起来就永远量不到宽度，面板会一直空着。
            */}
            {scale <= 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 size={15} className="animate-spin text-leaf-600" />
                  正在载入 PDF……
                </div>
              </div>
            )}

            {scale > 0 && (
              <div className="flex flex-col items-center" style={{ paddingTop: PAGE_TOP_PADDING }}>
                {Array.from({ length: pageCount }, (_, i) => {
                  const pageNumber = i + 1;
                  const inRange = range[0] <= i && i <= range[1];

                  return (
                    <div
                      key={pageNumber}
                      data-page={pageNumber}
                      className="bg-white shadow-sm"
                      style={{
                        width: pageWidth || undefined,
                        height: heights[i],
                        marginBottom: PAGE_GAP,
                      }}
                    >
                      {inRange ? (
                        <PdfPageView
                          doc={doc}
                          pageNumber={pageNumber}
                          scale={scale}
                          onMeasured={handleMeasured}
                          highlights={highlightsByPage.get(pageNumber) ?? EMPTY_HIGHLIGHTS}
                          translations={translationsByPage.get(pageNumber) ?? EMPTY_TRANSLATIONS}
                          pendingTranslations={pendingByPage.get(pageNumber) ?? EMPTY_PENDING}
                          onDeleteTranslation={handleDeleteTranslation}
                          pageHeight={heights[i] ?? 0}
                          onHighlightClick={handleHighlightClick}
                          highlightsInteractive={modifierHeld}
                        />
                      ) : (
                        // 未挂载的页只留位：大文档不可能同时渲染几百页 canvas
                        <div className="w-full h-full flex items-start justify-center pt-6 text-xs text-gray-300">
                          {pageNumber}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/*
          截图模式：盖住页面区域的拖框层。
          放在 body（relative）里而不是滚动容器里 —— 坐标就不必考虑滚动偏移，
          松手时再用页面元素自己的 rect 换算。z-40 要高于选区气泡（z-20）与 busy 遮罩（z-30）。
        */}
        {capturing && (
          <div
            className="absolute inset-0 z-40 cursor-crosshair bg-gray-900/10 touch-none"
            onPointerDown={handleCapturePointerDown}
            onPointerMove={handleCapturePointerMove}
            onPointerUp={handleCapturePointerUp}
            onPointerCancel={cancelCapture}
          >
            <div
              ref={marqueeRef}
              className="absolute border-2 border-leaf-500 bg-leaf-500/10 pointer-events-none"
              style={{ display: 'none' }}
            />
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-gray-900/85 text-white text-xs pointer-events-none whitespace-nowrap shadow-lg">
              拖框选择要截取的区域 · Esc 取消
            </div>
          </div>
        )}

        {/*
          选中后浮出的操作。
          外观与节点里的选中工具条（common/SelectionToolbar）保持一致：白底、灰图标、细边框，
          否则同一个应用里会出现"黑色胶囊 + 白色胶囊"两套视觉语言。
        */}
        {bubble && bubblePos && (
          <div
            ref={bubbleRef}
            style={bubblePos}
            className="absolute z-20 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-white border border-gray-200 shadow-lg"
          >
            <AttachButton
              icon={<CornerDownRight size={14} />}
              tip={hasCurrentTarget ? '在当前节点下创建子节点' : '没有可挂接的当前节点'}
              disabled={!hasCurrentTarget}
              onClick={() => handleCreateNode('current')}
            />
            <AttachButton
              icon={<Sprout size={14} />}
              tip={hasRootTarget ? '在根节点下创建子节点' : '没有可挂接的根节点'}
              disabled={!hasRootTarget}
              onClick={() => handleCreateNode('root')}
            />

            <span className="w-px h-4 bg-gray-200 mx-0.5" />

            {/* 记号笔：点开二级色板，只标注、不建节点 */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMarkMenu((v) => !v)}
                title="记号笔"
                className={cn(
                  'flex items-center justify-center p-1.5 rounded-md transition-colors',
                  markMenu
                    ? 'bg-leaf-100 text-leaf-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                )}
              >
                <Highlighter size={14} />
              </button>

              {markMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-gray-200 shadow-lg">
                  {MARK_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      // 保住选区：handleMark 要拿当前选区算矩形
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleMark(color.value)}
                      className="w-5 h-5 rounded border-2 border-gray-200 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    />
                  ))}
                </div>
              )}
            </div>

            <span className="w-px h-4 bg-gray-200 mx-0.5" />

            {/*
              翻译：不做语言选择，目标固定中文（见 handleTranslate 的说明）。
              乱码时禁用而不是隐藏 —— 隐藏会让用户以为"这里没有这个功能"。
            */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleTranslate}
              disabled={bubble.garbled}
              title={bubble.garbled ? '这段文字可能是乱码，无法翻译' : '翻译成中文并覆盖原文'}
              className={cn(
                'flex items-center justify-center p-1.5 rounded-md transition-colors',
                bubble.garbled
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              )}
            >
              <Languages size={14} />
            </button>

            {/* 乱码警告是条件性的（只在 PDF 缺字符映射时出现），与上面被删掉的页码角标不同：
                它是在提醒"你正要摘的这段字本身可能是坏的"，不该跟着一起省掉。 */}
            {bubble.garbled && (
              <span className="text-[10px] text-amber-600 pr-1" title="这份 PDF 缺少字符映射，取到的文字可能是乱码">
                文字可能乱码
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 截图的输出上限（长边）。超过就等比缩小，避免请求体过大、也省视觉 token */
const CAPTURE_MAX_EDGE = 1600;
/** 节点卡片上缩略图的上限 */
const THUMB_MAX_EDGE = 200;

/** 译文 id。只用来定位/删除，不参与内容判断，所以不必像图片那样做内容哈希 */
function newTranslationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 两组归一化矩形是否落在同一处。
 *
 * 用来把"重复翻译同一段"识别成替换而不是叠加。给一点容差：
 * 同样的选区两次拖出来，像素级不可能完全一致。
 */
function rectsMatch(a: TranslationRects, b: TranslationRects): boolean {
  if (a.length !== b.length) return false;
  const EPS = 0.002;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      if (Math.abs(a[i][j] - b[i][j]) > EPS) return false;
    }
  }
  return true;
}

/** 命中最靠前的、包含该点的页面元素 */
function pageAtClientPoint(
  container: HTMLElement | null,
  x: number,
  y: number
): { page: number; el: HTMLElement } | null {
  if (!container) return null;
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-page]'))) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return { page: Number(el.getAttribute('data-page')), el };
    }
  }
  return null;
}

/**
 * 从某一页的 canvas 里裁出一块，产出主图 + 缩略图。
 *
 * 直接裁 pdf.js 渲染好的 canvas，而不是对 DOM 截图：
 * 画面本身就是位图，裁它最准确，也不会把文本层、记号笔、选区一起拍进去。
 *
 * 注意 `canvas.width` 已经乘过 devicePixelRatio，所以要用 canvas 的**显示宽度**
 * 换算源矩形，不能直接用页面坐标当像素坐标。
 */
async function cropPageRegion(
  pageEl: HTMLElement,
  sel: { left: number; top: number; right: number; bottom: number }
): Promise<{ blob: Blob; width: number; height: number; thumb: string } | null> {
  const canvas = pageEl.querySelector('canvas');
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const sx = Math.max(0, (sel.left - rect.left) * scaleX);
  const sy = Math.max(0, (sel.top - rect.top) * scaleY);
  const sw = Math.min(canvas.width - sx, (sel.right - sel.left) * scaleX);
  const sh = Math.min(canvas.height - sy, (sel.bottom - sel.top) * scaleY);
  if (sw < 1 || sh < 1) return null;

  const outScale = Math.min(1, CAPTURE_MAX_EDGE / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * outScale));
  const outH = Math.max(1, Math.round(sh * outScale));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  // PDF 页面是白纸；不铺白底的话，透明区域在 JPEG 里会变成黑色
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, outW, outH);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) return null;

  const thumbScale = Math.min(1, THUMB_MAX_EDGE / Math.max(outW, outH));
  const tw = Math.max(1, Math.round(outW * thumbScale));
  const th = Math.max(1, Math.round(outH * thumbScale));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = tw;
  thumbCanvas.height = th;
  const tctx = thumbCanvas.getContext('2d');
  if (tctx) {
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, tw, th);
    tctx.drawImage(out, 0, 0, tw, th);
  }

  return { blob, width: outW, height: outH, thumb: thumbCanvas.toDataURL('image/jpeg', 0.7) };
}

/**
 * 气泡里的图标按钮。
 *
 * 提示用绝对定位挂在按钮**上方**，两个原因：
 * - 绝对定位不参与布局，所以 hover 不会改变气泡尺寸 —— 气泡是按自身高度决定
 *   "贴选区上方还是翻到下方"的，尺寸一变就会自己抖一下
 * - 放上方而不是下方，是因为下方紧挨着选区（这个气泡存在的意义就是不挡住选区）
 */
function AttachButton({
  icon,
  tip,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  tip: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative group">
      <button
        // 保住选区：创建节点时要拿当前选区算高亮矩形
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        aria-label={tip}
        className="flex items-center justify-center p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 transition-colors"
      >
        {icon}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap rounded bg-gray-900/95 px-2 py-1 text-[10px] text-white shadow-lg">
        {tip}
      </span>
    </div>
  );
}

function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-leaf-50 flex items-center justify-center mb-4">
        <Upload size={24} className="text-leaf-500" />
      </div>
      <h3 className="text-sm font-semibold text-gray-800 mb-1.5">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed mb-5">{hint}</p>
      <button
        onClick={onAction}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-leaf-600 hover:bg-leaf-700 text-white rounded-lg transition-colors"
      >
        <Upload size={15} />
        {actionLabel}
      </button>
    </div>
  );
}
