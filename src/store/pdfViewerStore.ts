/**
 * PDF 阅读器的跨组件信号
 *
 * 只放**需要跨越组件边界**的东西：
 * 「读的是哪份文档、读到第几页」记在 session.microApps 上（跟对话走、要持久化），
 * 而"跳转到某页"这个动作是**瞬态**的 —— 画布上的页码角标点一下，左侧面板要滚过去。
 * 两者不在同一棵子树里，所以需要一个共享信号。
 *
 * 缩放倍数、当前页码这些只有面板自己关心的状态，留在面板的本地 state 里，
 * 不必绕经 store（少一次全局通知、也少一处要同步的地方）。
 */

import { create } from 'zustand';

export interface PendingJump {
  docId: string;
  /** 1-based */
  page: number;
  /** 自增序号：连点同一个页码也要重新滚动一次，光比较 docId+page 看不出来 */
  nonce: number;
}

interface PdfViewerState {
  pendingJump: PendingJump | null;
  /** 请求面板滚动到某份文档的某一页（并会顺带打开面板） */
  jumpToPage: (docId: string, page: number) => void;
  /** 面板滚动完成后清掉，避免无关的重渲染又把它滚一次 */
  consumeJump: () => void;
}

export const usePdfViewerStore = create<PdfViewerState>()((set) => ({
  pendingJump: null,
  jumpToPage: (docId, page) =>
    set((state) => ({
      pendingJump: { docId, page, nonce: (state.pendingJump?.nonce ?? 0) + 1 },
    })),
  consumeJump: () => set({ pendingJump: null }),
}));
