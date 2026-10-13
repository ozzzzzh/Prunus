/**
 * 微应用入口
 *
 * 形态：独立于画布那组按钮（搜索 / 会话背景 / 节点总结），点一下**展开**一个列表，
 * 列表里才是具体的微应用（今天只有「PDF 阅读」）。
 *
 * 为什么要有"展开"这一步而不是直接切换面板：入口的语义是"打开某个微应用"。
 * 将来加第二个时，这里是列表里多一行，而不是再往右上角塞一个按钮。
 * 也因此这一行刻意不混进那组按钮里 —— 那组是"当前会话的操作"，这组是"工具"。
 */

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import { MICRO_APPS } from './registry';

/** 与画布右上角那组按钮同一套外观，避免"多出一个风格不同的东西" */
const LAUNCHER_CLASS =
  'flex items-center gap-1.5 px-4 py-2 text-sm rounded-full border shadow-sm transition-colors';

export default function MicroAppLauncher() {
  const activeMicroApp = useUIStore((state) => state.activeMicroApp);
  const setActiveMicroApp = useUIStore((state) => state.setActiveMicroApp);
  const [expanded, setExpanded] = useState(false);

  const apps = Object.values(MICRO_APPS);

  return (
    <div className="relative">
      {/* 点空白处收起列表（与项目里右键菜单同一种做法） */}
      {expanded && <div className="fixed inset-0 z-0" onClick={() => setExpanded(false)} />}

      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          LAUNCHER_CLASS,
          'relative z-10',
          activeMicroApp
            ? 'bg-leaf-50 text-leaf-700 border-leaf-200'
            : 'bg-white text-gray-600 border-gray-200 hover:text-leaf-600 hover:bg-leaf-50'
        )}
        title="打开微应用"
      >
        <LayoutGrid size={14} />
        微应用
        {activeMicroApp && <span className="w-1.5 h-1.5 rounded-full bg-leaf-500" />}
        {expanded ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-1.5 z-10 min-w-[168px] bg-white border border-gray-200 rounded-xl shadow-lg py-1">
          {apps.map((app) => {
            const isActive = activeMicroApp === app.id;
            return (
              <button
                key={app.id}
                onClick={() => {
                  // 再点已打开的那个 = 收起面板，与入口的开关语义一致
                  setActiveMicroApp(isActive ? null : app.id);
                  setExpanded(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                  isActive ? 'text-leaf-700 bg-leaf-50' : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {app.icon}
                <span className="flex-1 text-left">{app.title}</span>
                {isActive && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
