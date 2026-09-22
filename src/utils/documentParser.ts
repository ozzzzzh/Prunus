/**
 * 文本文档解析：把用户上传的文件在浏览器端解析成纯文本
 *
 * 为什么放在浏览器端而不是服务端：本项目支持 BYOK —— 用户直连自己的 provider，
 * **根本不经过社区后端**。解析若放服务端，BYOK 用户就完全用不了这个功能。
 * 客户端解析同时覆盖 BYOK 与社区版两条路径，顺带让文档不出本机。
 *
 * 代价是解析库体积（mammoth ~300KB、pdfjs ~2MB），所以一律用**动态 import**
 * 按需加载：首屏不受影响，只有真的上传对应格式时才去下载。代价是首次使用有加载
 * 延迟，**调用方必须准备 loading 态**。
 */

import type { DocKind } from '../types/node';

/** 解析后保留的最大字符数，超出即截断（截断会在界面上明确告知用户） */
export const MAX_DOC_CHARS = 20000;

/** 单个文件大小上限。超过直接拒绝 —— 解析在主线程上跑，再大会把标签页卡死 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 估算 token 超过这个值时，发送前先让用户确认（额度最容易被意外耗光的地方） */
export const LARGE_DOC_TOKENS = 5000;

export interface ParsedDocument {
  name: string;
  kind: DocKind;
  size: number;
  /** 已截断的正文 */
  text: string;
  /** 截断**之前**的字符数，用于告知用户实际丢了多少 */
  totalChars: number;
  truncated: boolean;
  /** PDF 页数，其它格式为 undefined */
  pages?: number;
}

/** 零依赖的纯文本类格式 */
const TEXT_EXTS = ['.txt', '.md', '.markdown', '.csv', '.json', '.log'];

const SUPPORTED_HINT = '支持 .txt / .md / .csv / .json / .log / .docx / .pdf';

/** 中日韩字符（含假名、谚文、扩展区）。这些字符大约 1 字 = 1 token */
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i === -1 ? '' : fileName.slice(i).toLowerCase();
}

/**
 * 估算 token 数。
 *
 * 中日韩字符按 1 字 1 token、其余按 4 字符 1 token 分开算 —— 比一律 `length / 4`
 * 准得多（后者对中文会低估约 4 倍）。之所以要尽量准：这个数字会给用户看，
 * 而计费最终取决于上游返回的真实 usage，两者口径越接近，用户越不会被账单吓到。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(CJK_RE) || []).length;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

/** 归一化空白：统一换行符、压掉多余空行、去掉行尾空白 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/** .docx → 纯文本 */
async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/** .pdf → 纯文本（逐页提取） */
async function extractPdf(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  // worker 让解析不阻塞主线程。用 Vite 的 ?url 拿到打包后 worker 的实际地址。
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join('')
    );
  }

  return { text: pages.join('\n\n'), pages: doc.numPages };
}

/**
 * 解析上传的文件。
 *
 * 失败一律抛**可读的中文错误**（调用方直接 showToast 出去），不要抛底层异常 ——
 * 用户看不懂 "Setting up fake worker failed"。
 */
export async function parseDocument(file: File): Promise<ParsedDocument> {
  // 大小检查放在读取内容**之前**，避免白白把 200MB 读进内存再报错
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`文件太大（${mb} MB），上限为 ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  }

  const ext = extOf(file.name);

  // mammoth 不支持旧版二进制 .doc，静默失败会让用户以为功能坏了 —— 明确指路
  if (ext === '.doc') {
    throw new Error('不支持旧版 .doc 格式，请在 Word 里「另存为」.docx 后再上传');
  }

  let kind: DocKind;
  let raw: string;
  let pages: number | undefined;

  if (TEXT_EXTS.includes(ext)) {
    kind = 'text';
    raw = await file.text();
  } else if (ext === '.docx') {
    kind = 'docx';
    raw = await extractDocx(file);
  } else if (ext === '.pdf') {
    kind = 'pdf';
    const result = await extractPdf(file);
    raw = result.text;
    pages = result.pages;
  } else {
    throw new Error(`不支持的文件类型${ext ? `（${ext}）` : ''}。${SUPPORTED_HINT}`);
  }

  const normalized = normalizeWhitespace(raw);

  // 扫描件/纯图片 PDF 提取不出文字。这里必须报错，而不是给用户一个空附件 ——
  // 他会以为传成功了，然后奇怪为什么模型什么都不知道。
  if (!normalized) {
    throw new Error(
      kind === 'pdf'
        ? '这个 PDF 里没有可提取的文字（可能是扫描件或纯图片）'
        : '文件里没有可用的文字内容'
    );
  }

  const totalChars = normalized.length;
  const truncated = totalChars > MAX_DOC_CHARS;

  return {
    name: file.name,
    kind,
    size: file.size,
    text: truncated ? normalized.slice(0, MAX_DOC_CHARS) : normalized,
    totalChars,
    truncated,
    pages,
  };
}
