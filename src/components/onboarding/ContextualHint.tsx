/**
 * 情境提示组件
 *
 * 轻量级提示气泡，用于在特定情境下引导用户
 */

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';

export type HintPosition = 'top' | 'bottom' | 'left' | 'right';

interface ContextualHintProps {
  id: string;           // 唯一标识，用于记录是否已关闭
  content: React.ReactNode;
  position?: HintPosition;
  children: React.ReactNode;  // 目标元素
  className?: string;
}

export default function ContextualHint({
  id,
  content,
  position = 'bottom',
  children,
  className,
}: ContextualHintProps) {
  const [visible, setVisible] = useState(true);
  const hasDismissedHint = useUIStore((state) => state.hasDismissedHint);
  const dismissHint = useUIStore((state) => state.dismissHint);

  // 检查是否已关闭
  useEffect(() => {
    if (hasDismissedHint(id)) {
      setVisible(false);
    }
  }, [id, hasDismissedHint]);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVisible(false);
    dismissHint(id);
  };

  if (!visible) {
    return <>{children}</>;
  }

  const positionClasses: Record<HintPosition, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses: Record<HintPosition, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900 border-y-transparent border-l-transparent',
  };

  return (
    <div className={cn('relative', className)}>
      {children}

      {/* 提示气泡 */}
      <div
        className={cn(
          'absolute z-50 animate-in fade-in-0 zoom-in-95 duration-200',
          positionClasses[position]
        )}
      >
        <div className="relative bg-gray-900 text-white text-sm rounded-lg px-4 py-3 shadow-lg max-w-xs">
          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
          >
            <X size={12} />
          </button>

          {content}
        </div>

        {/* 小箭头 */}
        <div
          className={cn(
            'absolute w-0 h-0 border-[6px]',
            arrowClasses[position]
          )}
        />
      </div>
    </div>
  );
}
