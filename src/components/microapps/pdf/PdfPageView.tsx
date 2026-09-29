/**
 * 单页渲染：canvas（画面）+ 文本层（可选中）
 *
 * 两层各司其职：
 * - canvas 由 pdf.js 画出来，永远正确，但它只是像素，上面没有可选中的文字
 * - 文本层是叠上去的一层**透明真文字**，按每个字的坐标摆放，负责被拖选
 *
 * 只在可视区附近挂载（由 PdfPanel 决定），所以这里可以放心地把
 * "一次渲染一个页面"当作全部工作。
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfjs } from '../../../utils/pdfjs';
import type { PdfHighlight } from '../../../types/microApp';
// 文本层样式随面板一起懒加载（CSS 也是面板这个 chunk 的一部分）
import './pdfTextLayer.css';

/**
 * 记号笔颜色与浓度。
 *
 * 用 multiply 混合，所以浓度高了会像污渍，宁浅勿深；想调只改这一个数字。
 */
const HIGHLIGHT_COLOR = 'rgba(255, 214, 10, 0.2)';

interface PdfPageViewProps {
  doc: PDFDocumentProxy;
  /** 1-based */
  pageNumber: number;
  scale: number;
  /** 实测到真实尺寸后上报，用于修正占位高度。**必须稳定**，否则会反复重渲染 */
  onMeasured: (pageNumber: number, size: { width: number; height: number }) => void;
  /** 这一页上"已经摘录到画布"的区域，画成记号笔 */
  highlights: PdfHighlight[];
  /** Ctrl/Cmd + 点击标记 → 在画布上聚焦对应节点。**必须稳定** */
  onHighlightClick: (nodeId: string) => void;
  /**
   * 标记是否可点击（= 是否按住 Ctrl/Cmd）。
   *
   * 只在按住修饰键时才吃鼠标事件：可点击意味着标记会把落在它范围内的鼠标事件都拦下来，
   * 那样**已标记区域里就选不了字**了。默认不可点击，就等于默认把"选原文"这条路留着 ——
   * 那是这个面板最常用的动作（按住 Ctrl 是明确的"我要跳转"意图，两者互不打扰）。
   */
  highlightsInteractive: boolean;
}

type TextLayerHandle = { render: () => Promise<void>; cancel: () => void } | null;

function PdfPageView({
  doc,
  pageNumber,
  scale,
  onMeasured,
  highlights,
  onHighlightClick,
  highlightsInteractive,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerContainerRef = useRef<HTMLDivElement>(null);
  /** 这一页有没有可提取的文字（没有通常意味着扫描件/纯图片） */
  const [hasText, setHasText] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayer: TextLayerHandle = null;

    (async () => {
      const pdfjs = await getPdfjs();
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const container = textLayerContainerRef.current;
      if (!canvas || !container) return;

      /**
       * 按设备像素比放大位图，再让 CSS 尺寸**严格等于位图 ÷ 倍率**。
       *
       * 为什么不是直接写 `viewport.width`：那个值通常是小数（如 568.42px）。
       * 位图被取整后两者比值就不再精确等于 dpr，浏览器会对整页做一次亚像素重采样，
       * 表现就是"字有点糊"—— 在 Windows 的 125%/150% 缩放下最明显。
       */
      const outputScale = window.devicePixelRatio || 1;
      const bitmapWidth = Math.floor(viewport.width * outputScale);
      const bitmapHeight = Math.floor(viewport.height * outputScale);
      canvas.width = bitmapWidth;
      canvas.height = bitmapHeight;
      canvas.style.width = `${bitmapWidth / outputScale}px`;
      canvas.style.height = `${bitmapHeight / outputScale}px`;

      onMeasured(pageNumber, { width: viewport.width, height: viewport.height });

      try {
        renderTask = page.render({
          canvas,
          viewport,
          ...(outputScale === 1 ? {} : { transform: [outputScale, 0, 0, outputScale, 0, 0] }),
        });
        await renderTask.promise;
      } catch (err) {
        // 快速滚动/缩放会取消在途渲染，这是正常路径不是错误
        if ((err as Error)?.name !== 'RenderingCancelledException') throw err;
        return;
      }
      if (cancelled) return;

      // 必须在构造 TextLayer **之前**写好缩放因子：构造函数会立刻按它计算文本层尺寸
      container.style.setProperty('--total-scale-factor', String(viewport.scale));
      container.replaceChildren();

      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport,
      });
      textLayer = layer;

      await layer.render();
      if (cancelled) return;
      setHasText(layer.textDivs.length > 0);
    })().catch((err) => {
      if (!cancelled) console.error('[PdfPageView] 渲染失败:', err);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, pageNumber, scale, onMeasured]);

  return (
    <div className="relative bg-white shadow-sm">
      <canvas ref={canvasRef} className="block" />

      {/*
        已经摘录到画布的区域：画一层记号笔。
        位置是归一化比例，所以缩放、换面板宽度都不用重算。

        鼠标行为分两态（见 highlightsInteractive）：默认让开、不挡选字；
        按住 Ctrl/Cmd 时变成可点击 + 手型光标，点一下跳到对应节点。
      */}
      {highlights.length > 0 && (
        <div className="absolute inset-0 z-[2]" style={{ pointerEvents: 'none' }}>
          {highlights.map((highlight) =>
            highlight.rects.map((rect, index) => (
              <div
                key={`${highlight.nodeId}-${index}`}
                onClick={(e) => {
                  if (!highlightsInteractive) return;
                  e.stopPropagation();
                  onHighlightClick(highlight.nodeId);
                }}
                title={highlightsInteractive ? '点击在画布中定位到这条摘录' : undefined}
                className={`absolute rounded-[2px] ${highlightsInteractive ? 'cursor-pointer' : ''}`}
                style={{
                  left: `${rect[0] * 100}%`,
                  top: `${rect[1] * 100}%`,
                  width: `${rect[2] * 100}%`,
                  height: `${rect[3] * 100}%`,
                  backgroundColor: HIGHLIGHT_COLOR,
                  // multiply 才像荧光笔：压暗底下的黑字同时提亮纸面，
                  // 普通半透明叠加会显得像贴了一张黄纸
                  mixBlendMode: 'multiply',
                  // 只有按住修饰键时才拦截鼠标事件，"选原文"这条常用路径因此始终通畅
                  pointerEvents: highlightsInteractive ? 'auto' : 'none',
                }}
              />
            ))
          )}
        </div>
      )}

      {/*
        文本层：绝对定位覆盖在 canvas 上，样式见 pdfTextLayer.css。
        aria-hidden 是刻意的：这层是给鼠标选区用的副本，读屏应该读正文而不是它
      */}
      <div ref={textLayerContainerRef} className="pdf-text-layer" aria-hidden="true" />

      {!hasText && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="px-3 py-1.5 rounded-full bg-gray-900/70 text-white text-[11px]">
            本页没有文字层（可能是扫描件），无法选中取词
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(PdfPageView);
