/**
 * 撤销 / 重做快捷键
 *
 * Ctrl/Cmd+Z        → 撤销
 * Ctrl/Cmd+Shift+Z  → 重做
 * Ctrl/Cmd+Y        → 重做（Windows 习惯）
 *
 * 作用范围：当前会话的**节点操作**（增删节点、改内容、标记、收起、尺寸、附件、截图…）。
 * 节点**内部**的文本编辑不经过这里 —— contentEditable 自带浏览器的字符级撤销栈，
 * 这里必须让路，否则会把它绕过去、变成"整段编辑一步撤销"，体验反而更差。
 */

import { useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useHistoryStore } from '../store/historyStore';
import { useGenerationStore } from '../store/generationStore';

export function useUndoRedo(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;

      const active = document.activeElement;

      // 普通输入框：一律让给浏览器
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

      if (active && active.getAttribute('contenteditable') === 'true') {
        /**
         * 编辑器里的分流规则。
         *
         * - **敲过字**（data-editor-dirty=true）→ 交给浏览器原生撤销，字符级回退。
         * - **有内容但没敲过**（例如双击打开一个已有节点）→ 也交给原生（此时是空操作）。
         * - **空的、且从未输入过** → 原生撤销无事可做，这时才接管。
         *
         * 最后一种正是"点击新增子节点"的场景：节点刚建好、自动进入编辑态、
         * 一个字都没打。此时 Ctrl+Z 应该撤销"新增节点"这一步，
         * 而不是被"焦点在编辑器里"直接放行成一个无效按键。
         *
         * dirty 必须是**粘性**的（敲过一次就一直是 true）：否则用户打完字再删空，
         * 下一次 Ctrl+Z 会跳过原生、直接去撤销节点创建，反而丢了刚打的字。
         */
        const dirty = active.getAttribute('data-editor-dirty') === 'true';
        const empty = !(active as HTMLElement).innerText.trim();
        if (dirty || !empty) return;
      }

      // 注意：**不**调用 isMicroAppInteracting()。
      // 那个守卫是给画布的导航/删除快捷键用的；撤销是全局动作，
      // 用户刚在 PDF 上画完记号（焦点/选区还在面板里）时恰恰最需要它。

      // 生成中不撤销：流还在往当前节点写，撤销后会被随后的写入覆盖
      if (useGenerationStore.getState().generatingNodeId) return;

      const { activeSessionId, sessions } = useSessionStore.getState();
      if (!activeSessionId) return;
      const current = sessions[activeSessionId];
      if (!current) return;

      const history = useHistoryStore.getState();
      const target = isUndo
        ? history.takeUndo(activeSessionId, current)
        : history.takeRedo(activeSessionId, current);

      if (!target) return;

      e.preventDefault();
      useSessionStore.getState().restoreSession(activeSessionId, target);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
