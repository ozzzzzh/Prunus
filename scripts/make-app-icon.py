"""
生成 Tauri 应用图标源图。

`tauri icon` 要求一张**正方形 PNG**（推荐 1024×1024），而仓库里只有
src/assets/PrunusLogoHighQuality.jpg（4096×4050，自带白边）。

这里做的是「最小改动」而不是重新设计：
  - 居中裁成 4050×4050（左右各裁 23px，画面主体不动）
  - 缩放到 1024×1024（Lanczos，保留线条锐度）
  - 不做圆角/描边：Windows 11 与 macOS 的系统图标规范不同，
    Windows 要直角满铺、macOS 会自己套圆角遮罩，提前切圆角两边都错。

用法：python scripts/make-app-icon.py
产物：src-tauri/app-icon.png（喂给 `npm run desktop:icons`）
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "PrunusLogoHighQuality.jpg"
DST = ROOT / "src-tauri" / "app-icon.png"
SIZE = 1024

img = Image.open(SRC).convert("RGB")
w, h = img.size

# 居中裁成正方形。两边尺寸差小于 1.5%，构图居中，直接裁中间即可。
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
img = img.crop((left, top, left + side, top + side))

img = img.resize((SIZE, SIZE), Image.LANCZOS)

DST.parent.mkdir(parents=True, exist_ok=True)
img.save(DST, format="PNG", optimize=True)

print(f"[app-icon] {SRC.name} {w}x{h} -> {DST.relative_to(ROOT)} {SIZE}x{SIZE}")
