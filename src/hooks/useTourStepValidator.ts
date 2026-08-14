/**
 * 引导步骤验证 Hook
 *
 * 用于检测用户是否完成了特定操作，验证步骤完成
 */

import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../store/uiStore';
import { useSessionStore } from '../store/sessionStore';
import { useGenerationStore } from '../store/generationStore';

interface ValidationState {
  isValidated: boolean;
  message?: string;
}

/**
 * 验证指定步骤是否完成
 */
export function useTourStepValidator(stepId: string): ValidationState {
  const [isValidated, setIsValidated] = useState(false);
  const prevRef = useRef({
    currentNodeId: null as string | null,
    nodeCount: 0,
    childrenCount: 0,
  });

  // Store 状态
  const currentPage = useUIStore((s) => s.currentPage);
  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const generatingNodeId = useGenerationStore((s) => s.generatingNodeId);
  const incrementTourStat = useUIStore((s) => s.incrementTourStat);

  // 获取当前会话
  const session = activeSessionId ? sessions[activeSessionId] : null;
  const currentNode = session?.currentNodeId ? session.nodes[session.currentNodeId] : null;

  useEffect(() => {
    if (isValidated) return;

    // 检查验证条件
    switch (stepId) {
      case 'open-example-file':
        // 检测是否打开了 Canvas 页面
        if (currentPage === 'canvas') {
          setIsValidated(true);
        }
        break;

      case 'observe-canvas':
        // 观察类步骤，由 TourOverlay 处理等待时间
        break;

      case 'focus-input':
        // 检测输入框是否有内容
        const inputEl = document.querySelector('[data-tour="chat-input"] textarea') as HTMLTextAreaElement;
        if (inputEl && inputEl.value.trim().length > 0) {
          setIsValidated(true);
        }
        break;

      case 'send-message':
        // 检测是否有新的用户节点（比之前多）
        if (session) {
          const currentCount = Object.keys(session.nodes).length;
          if (currentCount > prevRef.current.nodeCount && prevRef.current.nodeCount > 0) {
            setIsValidated(true);
            incrementTourStat('messagesCreated');
          }
          // 更新记录
          if (prevRef.current.nodeCount === 0) {
            prevRef.current.nodeCount = currentCount;
          }
        }
        break;

      case 'wait-response':
        // 检测 AI 回复是否完成
        if (!generatingNodeId && prevRef.current.nodeCount > 0) {
          // 需要先检测到有生成中的节点，然后再检测完成
          const hasUserMessage = session && Object.values(session.nodes).some(
            n => n.role === 'user' && n.childrenIds.length > 0
          );
          if (hasUserMessage) {
            setIsValidated(true);
          }
        }
        break;

      case 'click-node':
        // 检测 currentNodeId 是否变化
        if (session && prevRef.current.currentNodeId !== null) {
          if (session.currentNodeId !== prevRef.current.currentNodeId) {
            setIsValidated(true);
          }
        }
        // 记录当前 currentNodeId
        if (session && prevRef.current.currentNodeId === null) {
          prevRef.current.currentNodeId = session.currentNodeId;
        }
        break;

      case 'keyboard-nav':
        // 由 TourOverlay 中的键盘事件监听处理
        break;

      case 'branch-out':
        // 检测当前节点是否有多个 children
        if (currentNode && currentNode.childrenIds.length > prevRef.current.childrenCount) {
          setIsValidated(true);
          incrementTourStat('branchesCreated');
        }
        // 记录初始 children 数量
        if (currentNode && prevRef.current.childrenCount === 0) {
          prevRef.current.childrenCount = currentNode.childrenIds.length;
        }
        break;

      case 'edit-node':
        // 检测是否进入编辑模式
        if (editingNodeId) {
          setIsValidated(true);
          incrementTourStat('editsMade');
        }
        break;

      case 'extract-content':
        // 检测是否创建了新节点（在编辑模式结束后）
        // 这个比较复杂，需要检测摘取操作
        // 简化版本：检测节点数增加
        if (session && editingNodeId === null && prevRef.current.nodeCount > 0) {
          const currentCount = Object.keys(session.nodes).length;
          if (currentCount > prevRef.current.nodeCount) {
            setIsValidated(true);
          }
        }
        break;
    }
  }, [stepId, isValidated, currentPage, session, currentNode, editingNodeId, generatingNodeId, incrementTourStat]);

  return { isValidated };
}

/**
 * 记录初始状态（用于验证）
 * 在引导开始时调用
 */
export function useInitTourValidationState() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);

  useEffect(() => {
    if (activeSessionId && sessions[activeSessionId]) {
      const session = sessions[activeSessionId];
      // 记录初始节点数
      const nodeCount = Object.keys(session.nodes).length;
      // 可以存储到某个地方用于后续验证
    }
  }, [activeSessionId, sessions]);
}
