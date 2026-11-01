/**
 * 撤销 / 重做历史
 *
 * **只存 ChatSession 的快照引用，不做深拷贝。**
 * sessionStore 全程是不可变更新（每个 action 都用 spread 生成新对象），
 * 所以旧 state 引用本身就已经是一份完整的、不可变的快照；而且因为结构共享，
 * 一份历史只占用"变化路径"的内存（未改动的节点对象是共享的）。
 *
 * 本模块刻意**不 import sessionStore**：sessionStore 要调用这里的 `push()`，
 * 互相 import 会形成循环。当前会话由调用方传入。
 */

import { create } from 'zustand';
import type { ChatSession } from './sessionStore';

/**
 * 同一时间窗内的多次变更合并成一步。
 *
 * 一次用户操作经常触发多次 store 写入：发一条消息会连续调用
 * `addMessage(user)` → `setNodeAttachment` → `addMessage(assistant)`。
 * 不合并的话，用户要按三四次 Ctrl+Z 才看到反应。
 */
const COALESCE_MS = 500;

/** 每个会话最多保留多少步 */
const MAX_STEPS = 50;

interface HistoryState {
  undo: Record<string, ChatSession[]>;
  redo: Record<string, ChatSession[]>;
  /** 上次压栈时间，用于时间窗合并 */
  lastPushAt: Record<string, number>;

  /** 记录一次变更**之前**的会话快照（导航类操作不要调用） */
  push: (sessionId: string, before: ChatSession) => void;
  /** 取出上一步快照，并把当前状态推进 redo 栈 */
  takeUndo: (sessionId: string, current: ChatSession) => ChatSession | null;
  /** 取出重做快照，并把当前状态推回 undo 栈 */
  takeRedo: (sessionId: string, current: ChatSession) => ChatSession | null;
  /** 会话被删除时清掉它的历史 */
  clear: (sessionId: string) => void;
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  undo: {},
  redo: {},
  lastPushAt: {},

  push: (sessionId, before) => {
    const now = Date.now();
    const last = get().lastPushAt[sessionId] ?? 0;

    // 时间窗内合并：保留这一组动作的**第一份**快照（也就是这组动作之前的状态）
    if (now - last < COALESCE_MS) return;

    const stack = [...(get().undo[sessionId] ?? []), before].slice(-MAX_STEPS);

    set((state) => ({
      undo: { ...state.undo, [sessionId]: stack },
      // 产生新的编辑后，原来的"重做"就失效了（标准行为）
      redo: { ...state.redo, [sessionId]: [] },
      lastPushAt: { ...state.lastPushAt, [sessionId]: now },
    }));
  },

  takeUndo: (sessionId, current) => {
    const stack = get().undo[sessionId] ?? [];
    const previous = stack[stack.length - 1];
    if (!previous) return null;

    set((state) => ({
      undo: { ...state.undo, [sessionId]: stack.slice(0, -1) },
      redo: { ...state.redo, [sessionId]: [...(state.redo[sessionId] ?? []), current] },
      // 撤销之后紧接着的编辑不能并进上一步
      lastPushAt: { ...state.lastPushAt, [sessionId]: 0 },
    }));

    return previous;
  },

  takeRedo: (sessionId, current) => {
    const stack = get().redo[sessionId] ?? [];
    const next = stack[stack.length - 1];
    if (!next) return null;

    set((state) => ({
      redo: { ...state.redo, [sessionId]: stack.slice(0, -1) },
      undo: { ...state.undo, [sessionId]: [...(state.undo[sessionId] ?? []), current] },
      lastPushAt: { ...state.lastPushAt, [sessionId]: 0 },
    }));

    return next;
  },

  clear: (sessionId) =>
    set((state) => {
      const undo = { ...state.undo };
      const redo = { ...state.redo };
      const lastPushAt = { ...state.lastPushAt };
      delete undo[sessionId];
      delete redo[sessionId];
      delete lastPushAt[sessionId];
      return { undo, redo, lastPushAt };
    }),
}));
