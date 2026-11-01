/**
 * Paper 截图记录（存在 IndexedDB 的 images 表）
 *
 * 与 PdfDocumentRecord 同一套取舍：
 * - **不随会话导出**：导出的 JSON 只带 imageId 引用。截图是本机产物，
 *   塞进用于分享的 JSON 里既笨重又没道理。
 * - **不参与防抖保存**：图片是二进制，且每次保存都是整表重写，
 *   混在一起会让画布上任何一次改动都重写全部图片。
 *
 * keyPath 就是 imageId（内容哈希），所以"按 hash 查"直接 get(imageId) 即可。
 */
export interface ImageRecord {
  /** 内容哈希（见 utils/docHash.ts），同时也是一张图去重的依据 */
  imageId: string;
  /** 截图统一压成 jpeg */
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  /** 压缩后的字节数 */
  size: number;
  createdAt: number;
  /** 图片本体，结构化克隆进 IndexedDB，不占 JS 堆 */
  blob: Blob;
}
