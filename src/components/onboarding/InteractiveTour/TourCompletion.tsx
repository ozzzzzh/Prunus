/**
 * 引导完成弹窗组件
 *
 * 显示用户完成引导后的成就信息
 */

import { useEffect, useState } from 'react';
import { X, PartyPopper, ArrowRight, RotateCcw } from 'lucide-react';
import { useUIStore } from '../../../store/uiStore';
import { cn } from '../../../utils/cn';

interface TourCompletionProps {
  onClose: () => void;
}

export default function TourCompletion({ onClose }: TourCompletionProps) {
  const tourStats = useUIStore((s) => s.tourStats);
  const resetTour = useUIStore((s) => s.resetTour);
  const [showConfetti, setShowConfetti] = useState(true);

  // 停止庆祝动画
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // 重新开始引导
  const handleRestart = () => {
    if (confirm('确定要重新开始引导吗？')) {
      resetTour();
      onClose();
      // 延迟启动，让用户看到重置效果
      setTimeout(() => {
        useUIStore.getState().startTour();
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* 庆祝弹窗 */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-100 duration-500">
        {/* 顶部装饰 */}
        <div className="h-24 bg-gradient-to-br from-leaf-400 via-leaf-500 to-blossom-400 relative overflow-hidden">
          {/* 庆祝图标 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl animate-bounce">🌳</div>
          </div>

          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-8 text-center">
          {/* 标题 */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <PartyPopper className="text-amber-500" size={28} />
            <h2 className="text-2xl font-bold text-gray-800">
              恭喜你完成引导！
            </h2>
          </div>

          {/* 描述 */}
          <p className="text-gray-600 leading-relaxed mb-6">
            你已经掌握了 Prunus 的核心操作。<br />
            现在可以自由探索，让思维如枝桠般自然伸展！
          </p>

          {/* 统计数据 */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatCard icon="💬" value={tourStats.messagesCreated} label="消息" />
            <StatCard icon="🌿" value={tourStats.branchesCreated} label="分支" />
            <StatCard icon="🧭" value={tourStats.nodesNavigated} label="导航" />
            <StatCard icon="✏️" value={tourStats.editsMade} label="编辑" />
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-leaf-600 hover:bg-leaf-700 text-white rounded-xl font-medium transition-colors"
            >
              <span>开始自由探索</span>
              <ArrowRight size={18} />
            </button>
            <button
              onClick={handleRestart}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
            >
              <RotateCcw size={16} />
              <span>重新开始引导</span>
            </button>
          </div>

          {/* 提示 */}
          <p className="text-xs text-gray-400 mt-4">
            💡 提示：你可以随时在设置中重新查看引导
          </p>
        </div>
      </div>

      {/* 简单的庆祝效果 */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-10%`,
                backgroundColor: ['#6a9e62', '#f8b4b4', '#fbbf24', '#a5b4fc'][i % 4],
                animation: `fall ${2 + Math.random() * 2}s linear forwards`,
                animationDelay: `${Math.random() * 0.5}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* CSS 动画 */}
      <style>{`
        @keyframes fall {
          to {
            transform: translateY(120vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * 统计卡片组件
 */
function StatCard({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-lg font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
