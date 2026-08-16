/**
 * 引导遮罩层组件
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useUIStore } from '../../../store/uiStore';
import { useSessionStore } from '../../../store/sessionStore';
import { useDialogStore } from '../../../store/dialogStore';
import { cn } from '../../../utils/cn';
import { isAIChatNode } from '../../../types';
import type { TourStep } from '../../../types/tour';
import { TOUR_STEPS } from '../../../types/tour';

interface TourOverlayProps {
  step: TourStep;
}

export default function TourOverlay({ step }: TourOverlayProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [copied, setCopied] = useState(false);
  const initialCurrentNodeIdRef = useRef<string | null>(null);
  const initialNodeCountRef = useRef(0);

  const tourState = useUIStore((s) => s.tourState);
  const advanceTourStep = useUIStore((s) => s.advanceTourStep);
  const skipTourStep = useUIStore((s) => s.skipTourStep);
  const skipTour = useUIStore((s) => s.skipTour);
  const incrementTourStat = useUIStore((s) => s.incrementTourStat);

  // 展开状态
  const expandedNodeId = useUIStore((s) => s.expandedNodeId);
  const isExpanded = !!expandedNodeId;

  // 判断是否应该隐藏聚光灯效果（展开模式下只有特定步骤显示聚光灯）
  const expandedViewStepsWithSpotlight = ['expanded-view-intro', 'expanded-view-input'];
  const shouldHideSpotlight = isExpanded && !expandedViewStepsWithSpotlight.includes(step.id);

  // 步骤切换时重置验证状态
  useEffect(() => {
    setIsValidated(false);
    initialCurrentNodeIdRef.current = null;
    initialNodeCountRef.current = 0;
  }, [step.id]);

  // 获取目标元素位置
  useEffect(() => {
    const updateTargetRect = () => {
      // 展开视图相关的步骤允许在展开模式下查找目标
      const expandedViewSteps = ['expanded-view-intro', 'expanded-view-input'];
      if (isExpanded && !expandedViewSteps.includes(step.id)) {
        return;
      }

      const targetEl = document.querySelector(step.target);
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setTargetRect(rect);
          if (step.id !== 'expanded-view-intro' && step.id !== 'expanded-view-input') {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    };

    updateTargetRect();
    const timer1 = setTimeout(updateTargetRect, 50);
    const timer2 = setTimeout(updateTargetRect, 200);
    window.addEventListener('resize', updateTargetRect);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', updateTargetRect);
    };
  }, [step.target, step.id, isExpanded]);

  // 初始化：记录当前节点ID（用于点击检测）
  useEffect(() => {
    if (step.id === 'click-node') {
      const activeSessionId = useSessionStore.getState().activeSessionId;
      if (activeSessionId) {
        const session = useSessionStore.getState().sessions[activeSessionId];
        if (session) {
          initialCurrentNodeIdRef.current = session.currentNodeId;
        }
      }
    }
  }, [step.id]);

  // 步骤验证逻辑
  useEffect(() => {
    if (isValidated) return;

    // 初始化：记录当前节点ID（用于点击检测）
    if (step.id === 'click-node' && initialCurrentNodeIdRef.current === null) {
      const activeSessionId = useSessionStore.getState().activeSessionId;
      if (activeSessionId) {
        const session = useSessionStore.getState().sessions[activeSessionId];
        if (session) {
          initialCurrentNodeIdRef.current = session.currentNodeId;
        }
      }
    }

    // 初始化：记录当前节点数（用于 expanded-view-input 检测新消息）
    if (step.id === 'expanded-view-input' && initialNodeCountRef.current === 0) {
      const activeSessionId = useSessionStore.getState().activeSessionId;
      if (activeSessionId) {
        const session = useSessionStore.getState().sessions[activeSessionId];
        if (session) {
          initialNodeCountRef.current = Object.keys(session.nodes).length;
        }
      }
    }

    // 订阅 store 变化
    const unsubscribeSession = useSessionStore.subscribe((state) => {
      const activeSessionId = state.activeSessionId;
      if (!activeSessionId) return;

      const session = state.sessions[activeSessionId];
      if (!session) return;

      switch (step.id) {
        case 'input-and-send': {
          const currentNode = session.currentNodeId ? session.nodes[session.currentNodeId] : null;
          if (currentNode && isAIChatNode(currentNode) && currentNode.role === 'user' && currentNode.content) {
            setIsValidated(true);
            incrementTourStat('messagesCreated');
          }
          break;
        }

        case 'click-node': {
          if (initialCurrentNodeIdRef.current !== null && session.currentNodeId !== initialCurrentNodeIdRef.current) {
            setIsValidated(true);
          }
          break;
        }

        case 'branch-out': {
          const currentNode = session.currentNodeId ? session.nodes[session.currentNodeId] : null;
          if (currentNode && currentNode.childrenIds.length > 0) {
            setIsValidated(true);
            incrementTourStat('branchesCreated');
          }
          break;
        }

        case 'expanded-view-input': {
          // 检测到新节点（用户发送了消息）
          const currentCount = Object.keys(session.nodes).length;
          if (initialNodeCountRef.current > 0 && currentCount > initialNodeCountRef.current) {
            setIsValidated(true);
            incrementTourStat('messagesCreated');
          }
          break;
        }
      }
    });

    // 订阅 uiStore - 检测 UI 状态变化
    const unsubscribeUI = useUIStore.subscribe((state, prevState) => {
      // 展开模式返回 - 检测退出展开模式
      if (step.id === 'expanded-view-intro' && !state.expandedNodeId && prevState.expandedNodeId) {
        setIsValidated(true);
      }

      // 编辑检测 - 检测退出编辑模式
      if (step.id === 'edit-node' && !state.editingNodeId && prevState.editingNodeId) {
        setIsValidated(true);
        incrementTourStat('editsMade');
      }
    });

    // 键盘导航
    if (step.id === 'keyboard-nav') {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'c', 'C'].includes(e.key)) {
          setIsValidated(true);
          incrementTourStat('nodesNavigated');
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        unsubscribeSession();
        unsubscribeUI();
      };
    }

    return () => {
      unsubscribeSession();
      unsubscribeUI();
    };
  }, [step, isValidated, incrementTourStat]);

  // 自动推进
  useEffect(() => {
    if (isValidated && !step.requireConfirm) {
      const timer = setTimeout(advanceTourStep, 500);
      return () => clearTimeout(timer);
    }
  }, [isValidated, step.requireConfirm, advanceTourStep]);

  const progress = {
    current: tourState.completedSteps.length + 1,
    total: TOUR_STEPS.length, // 动态获取
  };

  const handleSkipStep = useCallback(() => {
    skipTourStep();
    advanceTourStep();
  }, [skipTourStep, advanceTourStep]);

  const handleSkipTour = useCallback(() => {
    useDialogStore.getState().showConfirm({
      title: '跳过引导',
      message: '确定要跳过引导吗？',
      onConfirm: () => skipTour(),
    });
  }, [skipTour]);

  const getCardPosition = useCallback(() => {
    const cardWidth = 360;
    const cardHeight = 280;
    const gap = 20;
    const padding = 24;

    let top = (window.innerHeight - cardHeight) / 2;
    let left = (window.innerWidth - cardWidth) / 2;

    // 展开视图引导步骤 - 卡片位置调整
    if (step.id === 'expanded-view-intro') {
      // 返回按钮在右上角，卡片放在左边
      top = padding + 60;
      left = padding;
      return { top, left };
    }

    if (step.id === 'expanded-view-input') {
      // 输入框在底部，卡片放在上方
      top = (window.innerHeight - cardHeight) / 2;
      left = (window.innerWidth - cardWidth) / 2;
      // 如果有输入框位置，放在输入框上方
      if (targetRect && targetRect.width > 0) {
        top = targetRect.top - cardHeight - gap;
        left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      }
      return { top, left };
    }

    if (targetRect && targetRect.width > 0 && targetRect.height > 0) {
      switch (step.placement) {
        case 'top':
          top = targetRect.top - cardHeight - gap;
          left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
          break;
        case 'bottom':
          top = targetRect.bottom + gap;
          left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
          break;
        case 'left':
          top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
          left = targetRect.left - cardWidth - gap;
          break;
        case 'right':
          top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
          left = targetRect.right + gap;
          break;
      }
    }

    if (left < padding) left = padding;
    if (left + cardWidth > window.innerWidth - padding) left = window.innerWidth - cardWidth - padding;
    if (top < padding) top = Math.max(padding, targetRect ? targetRect.bottom + gap : padding);
    if (top + cardHeight > window.innerHeight - padding) top = window.innerHeight - cardHeight - padding;

    return { top, left };
  }, [targetRect, step.placement, step.id]);

  const cardPosition = getCardPosition();

  return (
    <>
      {/* 聚光灯效果 - 展开后隐藏 */}
      {targetRect && step.spotlight && !shouldHideSpotlight && (
        <>
          <div
            className="fixed rounded-xl ring-4 ring-leaf-400 pointer-events-none"
            style={{
              left: targetRect.left - 8,
              top: targetRect.top - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
              zIndex: 101,
            }}
          />
          <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 99 }}>
            <div className="absolute bg-gray-900/10" style={{ left: 0, top: 0, right: 0, height: Math.max(0, targetRect.top - 8) }} />
            <div className="absolute bg-gray-900/10" style={{ left: 0, top: targetRect.bottom + 8, right: 0, bottom: 0 }} />
            <div className="absolute bg-gray-900/10" style={{ left: 0, top: targetRect.top - 8, width: Math.max(0, targetRect.left - 8), height: targetRect.height + 16 }} />
            <div className="absolute bg-gray-900/10" style={{ left: targetRect.right + 8, top: targetRect.top - 8, right: 0, height: targetRect.height + 16 }} />
          </div>
        </>
      )}

      {/* 引导卡片 */}
      <div
        className="fixed w-[360px] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        style={{ top: cardPosition.top, left: cardPosition.left, zIndex: 102 }}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-leaf-50 to-blossom-light/30 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-leaf-100 text-leaf-700 flex items-center justify-center text-sm font-bold">
              {progress.current}
            </div>
            <span className="text-sm text-gray-500">/ {progress.total}</span>
          </div>
          <button onClick={handleSkipTour} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <h3 className="text-lg font-bold text-gray-800 mb-2">{step.title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line">{step.description}</p>

          {step.exampleInput && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">示例输入：</p>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(step.exampleInput!);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      // fallback for older browsers
                      const textarea = document.createElement('textarea');
                      textarea.value = step.exampleInput!;
                      document.body.appendChild(textarea);
                      textarea.select();
                      document.execCommand('copy');
                      document.body.removeChild(textarea);
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-leaf-600 transition-colors"
                  title="复制示例文字"
                >
                  {copied ? (
                    <>
                      <Check size={12} />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>复制</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-sm text-leaf-700 font-medium">"{step.exampleInput}"</p>
            </div>
          )}

          <div className="flex items-center gap-1 mb-4">
            {Array.from({ length: progress.total }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-all',
                  i < progress.current - 1 ? 'bg-leaf-500' : i === progress.current - 1 ? isValidated ? 'bg-leaf-500' : 'bg-leaf-300' : 'bg-gray-200'
                )}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            {step.allowSkip && !isValidated && !step.requireConfirm && (
              <button onClick={handleSkipStep} className="text-sm text-gray-500 hover:text-gray-700">
                跳过此步
              </button>
            )}
            <div className="ml-auto">
              {step.requireConfirm ? (
                <button onClick={advanceTourStep} className="px-4 py-2 bg-leaf-600 hover:bg-leaf-700 text-white text-sm font-medium rounded-lg">
                  下一步 →
                </button>
              ) : isValidated ? (
                <span className="text-sm font-medium text-leaf-600">✓ 完成</span>
              ) : (
                <span className="text-sm text-gray-400">请完成上述操作...</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
