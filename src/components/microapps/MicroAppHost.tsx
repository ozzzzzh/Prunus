/**
 * 微应用宿主
 *
 * 职责只有三件：动态加载当前微应用的面板、给它一个统一的容器与几何、
 * 以及在窄屏下自动关掉（并排会让画布和面板同时不可用）。
 *
 * 注意这个组件**始终留在 App 的 JSX 里**（内部自己 return null），
 * 而不是被条件渲染包起来 —— 位置固定的子节点能保证 `<main>` 的索引不变，
 * 也就保证 React 不会重挂载 ReactFlowProvider / ChatCanvas（那样会丢掉视口与选中）。
 */

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore, clampMicroAppWidth } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import { MICRO_APPS, type MicroAppPanelProps } from './registry';
import { MICRO_APP_PANEL_ATTR } from '../../types/microApp';

/** 低于这个宽度就不适合并排：画布会被挤到不可用 */
const MIN_VIEWPORT_PX = 1024;

export default function MicroAppHost() {
  const activeMicroApp = useUIStore((state) => state.activeMicroApp);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const microAppWidth = useUIStore((state) => state.microAppWidth);
  const dragging = useUIStore((state) => state.isResizingMicroApp);
  const [Panel, setPanel] = useState<ComponentType<MicroAppPanelProps> | null>(null);

  // ===== 拖动分隔条 =====

  /**
   * 拖动期间**不写 store**，而是直接改 `--micro-app-w` 这个 CSS 变量。
   *
   * 为什么：写 store 会让 App 每帧重渲染一次，连带整个画布子树一起 reconile。
   * 而宽度本身只是一个 CSS 值，改变量就能达到同样的视觉效果，React 完全不必参与。
   * 松手时才落一次（值相同，所以不会产生视觉跳动），这样它还作为偏好被持久化。
   *
   * 画布那一侧的 resize 是省不掉的（React Flow 得知道新尺寸），
   * 但 PDF 那一侧靠 WIDTH_SETTLE_MS 的静默期避免了逐帧重新光栅化。
   */
  const dragRef = useRef({ startX: 0, startWidth: 0, next: 0 });

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const next = clampMicroAppWidth(
        dragRef.current.startWidth + (event.clientX - dragRef.current.startX)
      );
      dragRef.current.next = next;
      document.documentElement.style.setProperty('--micro-app-w', `${next}px`);
    };

    const onEnd = () => {
      useUIStore.getState().setResizingMicroApp(false);
      useUIStore.getState().setMicroAppWidth(dragRef.current.next);
    };

    // 拖动时别让光标划过的地方选中文字
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragging]);

  // 按需加载面板代码
  useEffect(() => {
    if (!activeMicroApp) return;

    let cancelled = false;
    MICRO_APPS[activeMicroApp]
      .load()
      .then((mod) => {
        if (!cancelled) setPanel(() => mod.default);
      })
      .catch((err) => {
        console.error('[MicroApp] 加载失败:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [activeMicroApp]);

  // 窗口变窄时自动收起（入口按钮同样在 <1024px 隐藏，这里覆盖"开着的时候把窗口拖窄"）
  useEffect(() => {
    if (!activeMicroApp) return;

    const query = window.matchMedia(`(min-width: ${MIN_VIEWPORT_PX}px)`);
    const onChange = () => {
      if (!query.matches) useUIStore.getState().setActiveMicroApp(null);
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [activeMicroApp]);

  // 没有会话就没有面板可挂（微应用状态本身记在会话上）
  if (!activeMicroApp || !activeSessionId || !Panel) return null;

  return (
    <>
      <div
        {...{ [MICRO_APP_PANEL_ATTR]: '' }}
        // 可聚焦但不出现在 tab 序列里：点一下就能让键盘作用域落到面板，
        // 这是快捷键让路判据的第一条（见 utils/microAppFocus.ts）
        tabIndex={-1}
        onPointerDownCapture={(e) => {
          (e.currentTarget as HTMLDivElement).focus({ preventScroll: true });
        }}
        className="absolute left-0 top-0 bottom-0 z-20 w-[var(--micro-app-w)] bg-white border-r border-gray-200 flex flex-col outline-none"
      >
        <Panel sessionId={activeSessionId} />
      </div>

      {/* 分隔条：拖动调整面板宽度 */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          dragRef.current = {
            startX: e.clientX,
            startWidth: microAppWidth,
            next: microAppWidth,
          };
          useUIStore.getState().setResizingMicroApp(true);
        }}
        className={cn(
          'absolute top-0 bottom-0 z-30 w-1.5 cursor-col-resize transition-colors',
          dragging ? 'bg-leaf-500/50' : 'bg-transparent hover:bg-leaf-500/30'
        )}
        style={{ left: 'calc(var(--micro-app-w) - 3px)' }}
        title="拖动调整宽度"
      />
    </>
  );
}
