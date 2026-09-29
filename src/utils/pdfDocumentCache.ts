/**
 * 已解码 PDF 文档的缓存（LRU）
 *
 * 为什么需要缓存：微应用跟对话走，用户在两个都开着论文的对话之间来回切是常态，
 * 每次切都重新解码一份几 MB 的 PDF 会明显卡顿。要求就是"切回来不重新解码"。
 *
 * 为什么必须有上限：`PDFDocumentProxy` 不只是一份字节，pdf.js 在 worker 侧还保留着
 * 每页的操作符列表等结构，随阅读页数增长。不做上限的 Map 就是内存无界增长，
 * 所以只留最近 3 份，超出时销毁**引用计数为 0**的那份。
 *
 * 为什么放模块级而不是 zustand：它是重型非序列化对象，放 store 里每次变更都会通知
 * 订阅者、引起无意义重渲染，而我们只需要一个"取用"入口。
 */

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfjs, getPdfDocumentParams } from './pdfjs';
import { getLocalPdf } from './pdfDocumentStore';

/** 最多同时保留几份已解码文档 */
const MAX_CACHED = 3;

interface CacheEntry {
  /**
   * 解码任务。**销毁入口是它而不是 doc**：v6 里 `PDFDocumentProxy` 只有 cleanup()，
   * 释放 worker 侧资源必须走 loadingTask.destroy()。
   * 它本身是 promise，因为创建任务要先读 blob、加载 pdf.js。
   */
  task: Promise<PDFDocumentLoadingTask>;
  doc: Promise<PDFDocumentProxy>;
  /** 正在使用它的面板数量。> 0 时不允许淘汰（淘汰会把别人正在看的文档销毁掉） */
  refs: number;
  lastUsed: number;
}

const cache = new Map<string, CacheEntry>();

/** 单调递增的使用序号，只用于比较"谁更久没用"（比 Date.now() 省一点） */
let acquireCounter = 0;

function destroyEntry(docId: string, entry: CacheEntry): void {
  cache.delete(docId);
  entry.task
    .then((task) => task.destroy())
    .catch(() => {
      // 销毁失败没有补救手段，吞掉即可（通常是加载本来就失败了）
    });
}

/** 淘汰最久未使用、且当前无人引用的文档 */
function trim(): void {
  if (cache.size <= MAX_CACHED) return;

  const candidates = [...cache.entries()]
    .filter(([, entry]) => entry.refs === 0)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

  for (const [docId, entry] of candidates) {
    if (cache.size <= MAX_CACHED) break;
    destroyEntry(docId, entry);
  }
}

/**
 * 取用一份文档（必要时解码）。**调用方用完必须调用 releasePdfDocument**。
 *
 * 同一 docId 的并发请求共享同一份 promise，不会重复解码；
 * 解码失败不入缓存，否则一次失败会把这个 docId 永久钉死。
 */
export function acquirePdfDocument(docId: string): Promise<PDFDocumentProxy> {
  const existing = cache.get(docId);
  if (existing) {
    existing.refs += 1;
    existing.lastUsed = ++acquireCounter;
    return existing.doc;
  }

  const task = (async () => {
    const record = await getLocalPdf(docId);
    if (!record) throw new Error('本机没有这份 PDF 文件');

    // 每次都要从 blob 重新读：getDocument 会把传入的 ArrayBuffer **转移**给 worker，
    // 复用同一份 buffer 第二次就会失败。
    const data = await record.blob.arrayBuffer();
    const pdfjs = await getPdfjs();
    return pdfjs.getDocument({ data, ...getPdfDocumentParams() });
  })();

  const entry: CacheEntry = {
    task,
    doc: task.then((loadingTask) => loadingTask.promise),
    refs: 1,
    lastUsed: ++acquireCounter,
  };
  cache.set(docId, entry);

  entry.doc.catch(() => {
    // 失败就撤出缓存，否则后续 acquire 会一直拿到同一个 rejected promise
    if (cache.get(docId) === entry) cache.delete(docId);
  });

  trim();
  return entry.doc;
}

/**
 * 把一份**已经解开的**文档放进缓存，供随后 acquire 直接命中。
 *
 * 用在"上传并打开"这条路径上：为了校验文件确实是 PDF、并拿到页数，
 * 那时已经解码过一次了；不放进来的话面板会立刻再解码一遍同一份文件。
 */
export function primePdfDocumentCache(docId: string, task: PDFDocumentLoadingTask): void {
  cache.set(docId, {
    task: Promise.resolve(task),
    doc: task.promise,
    refs: 0,
    lastUsed: ++acquireCounter,
  });
  trim();
}

/** 归还引用。计数归零后该文档才允许被淘汰 */
export function releasePdfDocument(docId: string): void {
  const entry = cache.get(docId);
  if (entry && entry.refs > 0) {
    entry.refs -= 1;
    entry.lastUsed = ++acquireCounter;
  }
  trim();
}

/** 清空缓存（「重置数据」时用，顺带销毁 worker 侧资源） */
export function destroyAllPdfDocuments(): void {
  for (const [docId, entry] of [...cache.entries()]) {
    destroyEntry(docId, entry);
  }
}
