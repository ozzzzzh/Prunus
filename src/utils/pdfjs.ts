/**
 * pdf.js 的统一引导
 *
 * 为什么集中到一处：worker 地址与三类侧载资源（cmaps / standard_fonts / wasm）
 * **只在 getDocument 的初始化参数里生效**，散在两处调用必然会漏配其中一处，
 * 而漏配的表现是「中文 PDF 渲染出方块字」「老论文整页空白」这类
 * 看起来像文件坏了、实际是配置问题的症状。
 *
 * 目前两个使用方：附件解析（documentParser.extractPdf）与 PDF 阅读器面板。
 */

type PdfjsModule = typeof import('pdfjs-dist');

/** getDocument 的公共参数。类型不引用 pdfjs 的深层类型，避免依赖其内部文件结构 */
export interface PdfDocumentParams {
  cMapUrl: string;
  cMapPacked: boolean;
  standardFontDataUrl: string;
  wasmUrl: string;
  /**
   * 硬件加速的画布。
   *
   * 官方 viewer 的默认值就是 true；不传的话 pdf.js 会退化成
   * `willReadFrequently` 的**软件**画布 —— 更慢，而且合成时看起来更软。
   * 注意它是 getDocument 的参数（不是 page.render 的）。
   */
  enableHWA: boolean;
}

let loading: Promise<PdfjsModule> | null = null;

/**
 * 取 pdf.js 模块（动态 import，只加载一次，worker 只配置一次）。
 *
 * 保持动态 import 是有意的：pdf.js 约 2MB，首屏不该带它（与 documentParser 同一条理由）。
 * 加载失败会清掉缓存，否则一次网络抖动会把这个模块**永久**钉死成失败状态。
 */
export function getPdfjs(): Promise<PdfjsModule> {
  if (!loading) {
    loading = (async () => {
      const pdfjs = await import('pdfjs-dist');
      // worker 让解码与渲染不阻塞主线程。
      // 用 Vite 的 ?url 拿到打包后 worker 的真实地址（这条必须走 Vite，不能拼字符串）。
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

/**
 * 侧载资源路径。
 *
 * 必须走 `import.meta.env.BASE_URL`：生产构建的 base 是 `/app/`（见 vite.config.ts），
 * 资源在 `/app/pdfjs/...` 下，写死 `/pdfjs/` 会在生产环境全部 404 —— 而 404 只是静默降级。
 * 资源由 `scripts/copy-pdfjs-assets.mjs` 在 dev/build 前复制到 public/pdfjs/。
 */
export function getPdfDocumentParams(): PdfDocumentParams {
  const base = import.meta.env.BASE_URL;
  return {
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    enableHWA: true,
  };
}
