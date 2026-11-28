"""
生成 Tauri 应用图标源图。

源图：src/assets/PrunusLogoHighQuality.png（4096×4050，**透明底**的剪贴画）。
`tauri icon` 需要一张正方形 PNG（推荐 1024×1024），本脚本负责把源图裁方、缩放。

默认**保留透明底**：图标就是「漂浮的树」，没有白色底块。
想要白底（旧版 jpg 那种方块的观感），加 --flatten：

    python scripts/make-app-icon.py            # 透明底（默认）
    python scripts/make-app-icon.py --flatten  # 合成到白底

两种底色的取舍，别在同一个仓库里反复改主意：

  透明底  │ 现代系统更常见（徽章/贴纸风），任务栏、Dock、开始菜单都直接贴背景；
          │ 代价是小尺寸下细线条（花瓣、飘落的叶子）会和壁纸混在一起。
  白底    │ 在任何背景上都读得清，和 Prunus 的近白界面（#fafafa）一致；
          │ 代价是方形底块，在深色任务栏上像个贴片。

用法：python scripts/make-app-icon.py [--flatten] [--bg RRGGBB]
产物：src-tauri/app-icon.png（喂给 `npm run desktop:icons`）
"""

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "PrunusLogoHighQuality.png"
DST = ROOT / "src-tauri" / "app-icon.png"
SIZE = 1024


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="生成 Tauri 应用图标源图")
    ap.add_argument("--flatten", action="store_true", help="把透明底合成到纯色背景（默认保留透明）")
    ap.add_argument("--bg", default="FFFFFF", help="--flatten 时用的背景色，RRGGBB，默认 FFFFFF")
    return ap.parse_args()


def main() -> None:
    args = parse_args()

    src = SRC
    if not src.exists():
        # 老版本是同目录下的 .jpg（白底、无透明通道）。换文件之后仍要能跑。
        fallback = src.with_suffix(".jpg")
        if not fallback.exists():
            raise SystemExit(f"[app-icon] 找不到源图：{src}")
        print(f"[app-icon] 未找到 {src.name}，回退到 {fallback.name}")
        src = fallback

    img = Image.open(src)
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)

    if has_alpha:
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")

    w, h = img.size

    # 居中裁成正方形。两边尺寸差 1.1%，构图居中，直接裁中间即可。
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))

    # 缩放在 RGBA 上直接做：LANCZOS 会对 alpha 做插值，边缘会有半透明的过渡，
    # 这正是我们要的（硬切 alpha 会让小尺寸边缘出现锯齿）。
    img = img.resize((SIZE, SIZE), Image.LANCZOS)

    if args.flatten:
        bg = tuple(int(args.bg[i : i + 2], 16) for i in (0, 2, 4))
        flat = Image.new("RGB", img.size, bg)
        flat.paste(img, mask=img.getchannel("A") if img.mode == "RGBA" else None)
        img = flat

    DST.parent.mkdir(parents=True, exist_ok=True)
    img.save(DST, format="PNG", optimize=True)

    mode = "透明底" if img.mode == "RGBA" else f"合成底 #{args.bg.upper()}"
    print(f"[app-icon] {src.name} {w}x{h} -> {DST.relative_to(ROOT)} {SIZE}x{SIZE}（{mode}）")


if __name__ == "__main__":
    main()
