/**
 * 帮助面板组件
 *
 * 右侧滑出面板，显示功能介绍、快捷键列表和核心操作说明
 */

import { X, Keyboard, GitBranch, MousePointer, Lightbulb } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';

interface ShortcutItem {
  key: string;
  description: string;
}

const KEYBOARD_SHORTCUTS: ShortcutItem[] = [
  { key: '↑', description: '跳到父节点' },
  { key: '↓', description: '跳到第一个子节点' },
  { key: '←', description: '上一个兄弟节点' },
  { key: '→', description: '下一个兄弟节点' },
  { key: 'C', description: '收缩/展开节点' },
  { key: 'Delete', description: '删除当前节点' },
  { key: 'Enter', description: '发送消息' },
  { key: 'Shift + Enter', description: '换行' },
];

const FEATURES = [
  {
    icon: GitBranch,
    title: '树状对话流',
    description: '打破线性聊天限制，从任意回复发散多个分支，平行探索不同想法。',
  },
  {
    icon: MousePointer,
    title: '节点导航',
    description: '点击节点可切换焦点，使用方向键快速在对话树中移动。',
  },
  {
    icon: Lightbulb,
    title: '智能分支',
    description: '使用 Branch Out 功能将 AI 回复拆分为多个子节点，结构更清晰。',
  },
];

export default function HelpPanel() {
  const showHelpPanel = useUIStore((state) => state.showHelpPanel);
  const toggleHelp = useUIStore((state) => state.toggleHelp);

  if (!showHelpPanel) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity"
        onClick={() => toggleHelp(false)}
      />

      {/* 帮助面板 */}
      <div
        className={cn(
          'fixed right-0 top-0 bottom-0 w-80 bg-white shadow-2xl z-50',
          'flex flex-col overflow-hidden',
          'animate-in slide-in-from-right duration-300'
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">帮助与快捷键</h2>
          <button
            onClick={() => toggleHelp(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {/* 功能介绍 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              核心功能
            </h3>
            <div className="space-y-4">
              {FEATURES.map((feature, index) => (
                <div
                  key={index}
                  className="flex gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="w-8 h-8 rounded-lg bg-leaf-100 text-leaf-700 flex items-center justify-center flex-shrink-0">
                    <feature.icon size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-800">{feature.title}</h4>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 快捷键列表 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Keyboard size={14} />
              键盘快捷键
            </h3>
            <div className="bg-gray-50 rounded-lg overflow-hidden divide-y divide-gray-100">
              {KEYBOARD_SHORTCUTS.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2.5"
                >
                  <span className="text-sm text-gray-600">{shortcut.description}</span>
                  <kbd className="px-2 py-1 bg-white border border-gray-200 rounded text-xs font-mono text-gray-700 shadow-sm">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          {/* 操作提示 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              操作提示
            </h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-leaf-600 mt-0.5">•</span>
                <span>点击灰色节点可切换到该对话分支</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-leaf-600 mt-0.5">•</span>
                <span>双击用户消息可编辑内容</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-leaf-600 mt-0.5">•</span>
                <span>使用标签按钮可标记重要节点</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-leaf-600 mt-0.5">•</span>
                <span>右下角聚焦按钮可定位当前节点</span>
              </li>
            </ul>
          </section>
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400 text-center">
            Prunus · 让思维如枝桠般自然伸展
          </p>
        </div>
      </div>
    </>
  );
}
