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
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  FileText,
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
import { useDialogStore } from '../../../store/dialogStore';
import { getPdfjs, getPdfDocumentParams } from '../../../utils/pdfjs';
import {
  acquirePdfDocument,
  primePdfDocumentCache,
  releasePdfDocument,
} from '../../../utils/pdfDocumentCache';
import { hasLocalPdf, saveLocalPdf } from '../../../utils/pdfDocumentStore';
import { hashFileBytes } from '../../../utils/docHash';
import {
  PAGE_GAP,
  PAGE_TOP_PADDING,
  buildOffsets,
  pageAtOffset,
  visibleRange,
} from '../../../utils/pdfPaging';
import { buildPdfQuote, PDF_QUOTE_MAX_CHARS, looksGarbled } from '../../../utils/pdfSelection';
import type { PdfHighlight } from '../../../types/microApp';
import type { ReactNode } from 'react';
import PdfPageView from './PdfPageView';

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

/** 稳定的空数组：直接写 `[]` 会让 memo 的页面每次渲染都判定 props 变了 */
const EMPTY_HIGHLIGHTS: PdfHighlight[] = [];

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
  const [bubble, setBubble] = useState<SelectionBubble | null>(null);
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
      // 节点已被删除的标记就不要再画了："这段已经进画布"这个断言已经不成立
      if (!sessionNodes?.[highlight.nodeId]) continue;

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

        {/* 选中后浮出的操作：两个图标按钮，hover 变绿并说明会挂到哪个节点上 */}
        {bubble && bubblePos && (
          <div
            ref={bubbleRef}
            style={bubblePos}
            className="absolute z-20 -translate-x-1/2 flex items-center gap-0.5 px-1 py-1 rounded-lg bg-gray-900 text-white shadow-lg"
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

            {/* 乱码警告是条件性的（只在 PDF 缺字符映射时出现），与上面被删掉的页码角标不同：
                它是在提醒"你正要摘的这段字本身可能是坏的"，不该跟着一起省掉。 */}
            {bubble.garbled && (
              <span className="text-[10px] text-amber-300 pr-1" title="这份 PDF 缺少字符映射，取到的文字可能是乱码">
                文字可能乱码
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
        onClick={onClick}
        disabled={disabled}
        aria-label={tip}
        className="flex items-center justify-center p-1.5 rounded-md text-gray-300 hover:bg-leaf-600 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300 transition-colors"
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
