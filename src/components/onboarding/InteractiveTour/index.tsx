/**
 * 交互式引导主组件
 *
 * 负责协调整个引导流程，包括：
 * - 检测引导状态
 * - 渲染遮罩层和聚光灯
 * - 显示引导卡片
 * - 监听用户操作并验证步骤
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../../store/uiStore';
import { useSessionStore } from '../../../store/sessionStore';
import { useGenerationStore } from '../../../store/generationStore';
import { TOUR_STEPS, getTotalSteps } from '../../../types/tour';
import type { TourStep } from '../../../types/tour';
import TourOverlay from './TourOverlay';
import TourCompletion from './TourCompletion';

export default function InteractiveTour() {
  const tourState = useUIStore((s) => s.tourState);
  const startTour = useUIStore((s) => s.startTour);

  const [isReady, setIsReady] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  // 检查是否需要启动引导
  useEffect(() => {
    // 如果引导已完成，不启动
    if (tourState.completedAt) return;

    // 如果引导正在激活，直接准备好
    if (tourState.isActive) {
      setIsReady(true);
      return;
    }

    // 首次访问 — 无论当前在哪个页面，直接启动引导
    if (!tourState.startedAt) {
      const timer = setTimeout(() => {
        startTour();
        setIsReady(true);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // 如果引导已启动过但未完成（用户中途离开），继续引导
    if (tourState.startedAt && !tourState.completedAt) {
      const timer = setTimeout(() => {
        setIsReady(true);
        if (!tourState.isActive) {
          startTour();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tourState, startTour]);

  // 引导完成时显示完成弹窗
  useEffect(() => {
    if (tourState.completedAt && !tourState.isActive && tourState.completedSteps.length > 0) {
      // 检查是否是刚完成的（5秒内）
      const completedTime = new Date(tourState.completedAt).getTime();
      const now = Date.now();
      if (now - completedTime < 5000) {
        setShowCompletion(true);
      }
    }
  }, [tourState.completedAt, tourState.isActive, tourState.completedSteps]);

  // 获取当前步骤
  const currentStep: TourStep | null = useMemo(() => {
    if (!tourState.isActive) return null;
    const stepIndex = tourState.completedSteps.length;
    return TOUR_STEPS[stepIndex] || null;
  }, [tourState.isActive, tourState.completedSteps]);

  // 不渲染的情况
  if (!isReady || !tourState.isActive || !currentStep) {
    // 显示完成弹窗
    if (showCompletion) {
      return createPortal(
        <TourCompletion onClose={() => setShowCompletion(false)} />,
        document.body
      );
    }
    return null;
  }

  return createPortal(
    <TourOverlay step={currentStep} />,
    document.body
  );
}
