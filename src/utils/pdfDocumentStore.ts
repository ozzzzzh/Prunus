/**
 * 本机 PDF 文档库
 *
 * 微应用「PDF 阅读器」用到的文件持久化：文件本体存在 IndexedDB 的 pdfDocs 里，
 * 会话只记 docId（内容指纹）与其上的页码，所以：
 * - 同一份论文被两个会话打开，只存一份
 * - 会话导出成 JSON 时只带引用，不带几 MB 的文件
 *
 * 这里是 repository 之上薄薄一层，负责把「文件 + 页数」变成记录、并保证顺序正确。
 */

import { repository } from '../repository';
import type { PdfDocumentRecord } from '../types';

/**
 * 把文件存进本机文档库。
 *
 * 调用方要先自己算好 docId（见 utils/docHash.ts）：因为「本机是否已有这份文件」
 * 必须在**解码之前**判断，而判断依据就是 docId，两边不能各算一次。
 *
 * ⚠️ 必须在把 ArrayBuffer 交给 `getDocument` **之前**调用：pdf.js 会把传入的
 * ArrayBuffer **转移**给 worker，之后那份 buffer 就废了，blob 就没法再建。
 * 这里直接存 File 对象本身（File 是 Blob，可在 IndexedDB 结构化克隆，
 * 且不需要在内存里多拷一份）。
 */
export async function saveLocalPdf(input: {
  file: File;
  docId: string;
  pageCount: number;
}): Promise<PdfDocumentRecord> {
  const record: PdfDocumentRecord = {
    docId: input.docId,
    name: input.file.name,
    size: input.file.size,
    pageCount: input.pageCount,
    addedAt: Date.now(),
    blob: input.file,
  };

  await repository.pdf.save(record);
  return record;
}

/** 本机是否已有这份文件（只查键，不会把几 MB 的 blob 读进内存） */
export function hasLocalPdf(docId: string): Promise<boolean> {
  return repository.pdf.has(docId);
}

/** 取出文档记录（含文件本体）。每次都要重新读 blob，理由见 saveLocalPdf 的说明 */
export function getLocalPdf(docId: string): Promise<PdfDocumentRecord | null> {
  return repository.pdf.get(docId);
}

/** 清空文档库（「重置数据」时用；不清理的话会在 IndexedDB 里留下孤儿大文件） */
export function clearLocalPdfs(): Promise<void> {
  return repository.pdf.clear();
}
