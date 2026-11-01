/**
 * 本机截图库
 *
 * Paper 截图问答用到的图片持久化：图片本体存在 IndexedDB 的 images 表里，
 * 节点 metadata 只记 imageId 引用 + 一张小缩略图。
 *
 * 为什么不直接塞 metadata：`persistenceService` 的自动保存是「清表 + 全量重写」，
 * 图片放进去会让画布上任何一次节点改动都重写全部截图。与 pdfDocs 同一套理由。
 *
 * 这里是 repository 之上薄薄一层，与 pdfDocumentStore.ts 保持同样的形态。
 */

import { repository } from '../repository';
import type { ImageRecord } from '../types';

/**
 * 把图片存进本机截图库。
 *
 * 调用方要先自己算好 imageId（见 utils/docHash.ts）：因为"本机是否已有这张图"
 * 必须在**生成记录之前**判断，两边不能各算一次。
 */
export async function saveImage(input: {
  imageId: string;
  blob: Blob;
  width: number;
  height: number;
}): Promise<ImageRecord> {
  const record: ImageRecord = {
    imageId: input.imageId,
    mimeType: 'image/jpeg',
    width: input.width,
    height: input.height,
    size: input.blob.size,
    createdAt: Date.now(),
    // 直接存 Blob：可在 IndexedDB 结构化克隆，不需要转成 base64 再多占一份内存
    blob: input.blob,
  };

  await repository.images.save(record);
  return record;
}

/** 本机是否已有这张图（只查键，不会把图片读进内存） */
export function hasLocalImage(imageId: string): Promise<boolean> {
  return repository.images.has(imageId);
}

/** 取出图片记录（含 blob）。每次都要重新读 blob，理由见 saveImage */
export function getLocalImage(imageId: string): Promise<ImageRecord | null> {
  return repository.images.get(imageId);
}

export function deleteLocalImage(imageId: string): Promise<void> {
  return repository.images.delete(imageId);
}

/** 清空截图库（「重置数据」时用；漏掉会留下没人认领的孤儿图片） */
export function clearLocalImages(): Promise<void> {
  return repository.images.clear();
}

/**
 * Blob → data URL。
 *
 * 发给视觉模型必须是 data URL（OpenAI / Anthropic 两边的 image 块都接受 base64）。
 * 用 FileReader 而不是手写 btoa：后者要先整体读成字符串，大图会多占一份内存。
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}
