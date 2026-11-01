/**
 * 截图预览（灯箱）
 *
 * 点击缩略图时打开。缩略图只有 200px 的 data URL，直接放大看会糊，
 * 所以这里从 IndexedDB 读出原图再显示；读不到（换设备、已清理）就退回缩略图，
 * 至少别给用户一个空白框。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { getLocalImage } from '../../utils/imageStore';

interface ImageLightboxProps {
  imageId: string;
  /** 读不到原图时的兜底（通常就是节点/输入框上那张缩略图） */
  fallback?: string;
  onClose: () => void;
}

export default function ImageLightbox({ imageId, fallback, onClose }: ImageLightboxProps) {
  const [src, setSrc] = useState<string | null>(fallback ?? null);

  /**
   * 预览要对齐**画布区域**，而不是整个窗口。
   *
   * 应用左侧有侧边栏、还可能开着 Paper 面板，`fixed inset-0` 居中会落在"整个窗口"的
   * 中心 —— 看起来偏左、压在侧边栏上。这里取画布容器的实际矩形，把遮罩铺在它上面。
   * 找不到画布（例如将来在别处复用）就退回整窗。
   */
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const canvasEl = document.querySelector('[data-tour="canvas"]');

    const measure = () => {
      if (!canvasEl) {
        setBox(null);
        return;
      }
      const r = canvasEl.getBoundingClientRect();
      setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    getLocalImage(imageId)
      .then((record) => {
        if (cancelled || !record) return;
        objectUrl = URL.createObjectURL(record.blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        // 读不到就保持 fallback，不必打扰用户
      });

    return () => {
      cancelled = true;
      // object URL 不释放会一直占着这张图的内存
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /*
   * 必须 portal 到 body：ChatInput 的根节点带 `-translate-x-1/2`，
   * 而**有 transform 的祖先会成为 position: fixed 的包含块** ——
   * 不 portal 的话 left/top 会相对输入框而不是视口，遮罩会整体偏移。
   */
  return createPortal(
    <div
      // 背景压到 45%：70% 在深色画布上几乎全黑，看不清图与画布的交界
      className="fixed z-[200] flex items-center justify-center bg-black/45 p-6"
      style={
        box
          ? { left: box.left, top: box.top, width: box.width, height: box.height }
          : { inset: 0 }
      }
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="截图预览"
    >
      <button
        onClick={onClose}
        title="关闭 (Esc)"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
      >
        <X size={20} />
      </button>

      {src ? (
        <img
          src={src}
          alt="截图预览"
          className="max-w-full max-h-full object-contain rounded-lg bg-white shadow-2xl"
          // 点图片本身不要关闭，只有点空白处才关
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <Loader2 size={24} className="animate-spin text-white" />
      )}
    </div>,
    document.body
  );
}
