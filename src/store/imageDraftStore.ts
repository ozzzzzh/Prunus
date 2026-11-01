/**
 * Paper 截图的跨组件草稿
 *
 * 只放**需要跨越组件边界**的东西：PDF 面板截完图，输入框要立刻显示它的缩略图；
 * 两者在 App 里是兄弟子树，只能靠共享状态传递。
 *
 * 与 pdfViewerStore 同一套取舍：真正要持久化的东西（图片本体）在 IndexedDB，
 * 节点上的引用在 node.metadata；这里只是"还没发送的那一张"的瞬态信号。
 */

import { create } from 'zustand';

export interface ImageDraft {
  /** images 表主键（内容哈希） */
  imageId: string;
  /** 缩略图 data URL，直接用于输入框与节点卡片 */
  thumb: string;
  width: number;
  height: number;
  /** 截自哪一页（1-based） */
  page?: number;
  docId?: string;
}

interface ImageDraftState {
  draft: ImageDraft | null;
  setDraft: (draft: ImageDraft) => void;
  clearDraft: () => void;
}

export const useImageDraftStore = create<ImageDraftState>()((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
