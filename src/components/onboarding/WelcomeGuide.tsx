/**
 * 欢迎引导组件
 *
 * 首次访问时显示的模态引导，介绍核心概念
 */

import { useState } from 'react';
import { GitBranch, Navigation, Lightbulb, ChevronLeft, ChevronRight, LayoutDashboard, Pencil } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';

interface GuideStep {
  icon: typeof GitBranch;
  title: string;
  description: string;
  color: string;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    icon: GitBranch,
    title: '树状对话文件',
    description: '不同于传统线性聊天，Prunus 将每次对话保存为文件。你可以从任意回复发散出多个分支，让思维如枝桠般自然生长。',
    color: 'bg-leaf-100 text-leaf-700',
  },
  {
    icon: Navigation,
    title: '灵活的节点导航',
    description: '点击任意节点可切换到该对话分支。使用方向键 ↑↓←→ 快速在对话树中移动，C 键收缩节点，Delete 键删除。',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    icon: Pencil,
    title: '节点编辑与标注',
    description: '双击消息节点可以编辑内容。点击标签按钮可以为节点添加标记（🌱🪵🍃🍑），方便识别重要节点。',
    color: 'bg-rose-100 text-rose-700',
  },
  {
    icon: Lightbulb,
    title: '智能分支拆分',
    description: '当 AI 回复包含多个要点时，使用 "Branch Out" 自动拆分为多个子节点。双击编辑后选中文字右键，还可以手动摘取内容创建兄弟节点。',
    color: 'bg-amber-100 text-amber-700',
  },
  {
    icon: LayoutDashboard,
    title: '文件管理入口',
    description: '点击左上角的 Prunus Logo 可以回到文件管理页面，在那里可以创建文件夹、管理对话文件、导入导出数据。',
    color: 'bg-purple-100 text-purple-700',
  },
];

export default function WelcomeGuide() {
  const [currentStep, setCurrentStep] = useState(0);
  const onboardingCompleted = useUIStore((state) => state.onboardingCompleted);
  const setOnboardingCompleted = useUIStore((state) => state.setOnboardingCompleted);

  // 如果已完成引导，不显示
  if (onboardingCompleted) return null;

  const handleComplete = () => {
    setOnboardingCompleted(true);
  };

  const handleNext = () => {
    if (currentStep < GUIDE_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = GUIDE_STEPS[currentStep];
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px]">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
        {/* 进度指示器 */}
        <div className="flex items-center justify-center gap-2 pt-6">
          {GUIDE_STEPS.map((_, index) => (
            <div
              key={index}
              className={cn(
                'w-2 h-2 rounded-full transition-all duration-300',
                index === currentStep
                  ? 'bg-leaf-600 w-6'
                  : index < currentStep
                    ? 'bg-leaf-400'
                    : 'bg-gray-200'
              )}
            />
          ))}
        </div>

        {/* 内容区域 */}
        <div className="p-8 text-center">
          {/* 图标 */}
          <div className={cn(
            'w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center',
            step.color
          )}>
            <Icon size={32} />
          </div>

          {/* 标题 */}
          <h2 className="text-2xl font-bold text-gray-800 mb-4">{step.title}</h2>

          {/* 描述 */}
          <p className="text-gray-600 leading-relaxed mb-8">{step.description}</p>

          {/* 导航按钮 */}
          <div className="flex items-center justify-center gap-4">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-2 px-4 py-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={18} />
                <span>上一步</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors',
                currentStep === GUIDE_STEPS.length - 1
                  ? 'bg-leaf-600 hover:bg-leaf-700 text-white'
                  : 'bg-leaf-100 hover:bg-leaf-200 text-leaf-700'
              )}
            >
              <span>{currentStep === GUIDE_STEPS.length - 1 ? '开始使用' : '下一步'}</span>
              {currentStep < GUIDE_STEPS.length - 1 && <ChevronRight size={18} />}
            </button>
          </div>
        </div>

        {/* 跳过按钮 */}
        <button
          onClick={handleComplete}
          className="absolute top-4 right-4 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          跳过
        </button>

        {/* 欢迎标识 */}
        <div className="px-8 pb-6 text-center">
          <p className="text-xs text-gray-400 flex items-center justify-center gap-2">
            欢迎使用 Prunus
            <img
              src="/src/assets/PrunusLogoHighQuality.jpg"
              alt="Prunus Logo"
              className="w-5 h-5 rounded-full object-cover"
            />
          </p>
        </div>
      </div>
    </div>
  );
}
