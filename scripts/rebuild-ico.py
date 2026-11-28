"""
把 `tauri icon` 生成的 icon.ico 重写成 Windows 期望的形状。

为什么要多这一步：`tauri icon` 用 `ico` crate 写出来的 ico，**每一帧都是 PNG 压缩**的
（16/24/32/48/64/256 全是）。而 Windows 的约定是：
  - 256×256 用 PNG 压缩（Vista 之后支持），这是官方推荐、也是省体积的做法；
  - 256 以下用 **32bpp DIB**（BITMAPINFOHEADER + BGRA + AND mask）。
小于 256 的 PNG 帧属于"能用但不保证"：Explorer 自己认得，但不少 shell 面（部分系统对话框、
Windows Installer 的图标列、第三方工具、旧版 Windows 10）会退化成没有 alpha 的位图，
表现就是**图标突然有了白底**、或者干脆显示空白。

这个脚本直接从 app-icon.png 重新组装 ico：
  16/20/24/32/40/48/64/128 → 32bpp DIB（带真 alpha）
  256                      → PNG 压缩
这样每个尺寸都是 Windows 原生支持的编码，透明通道不会被某条老旧路径吃掉。

用法（`npm run desktop:icons` 已经串在 tauri icon 之后）：
    python scripts/rebuild-ico.py
"""

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src-tauri" / "app-icon.png"
DST = ROOT / "src-tauri" / "icons" / "icon.ico"

# Windows 常见取值：16/24/32/48 是经典尺寸，20/40 服务于 125% 缩放，
# 64/128 给大图标视图，256 用于额外大图标与商店。
DIB_SIZES = [16, 20, 24, 32, 40, 48, 64, 128]
PNG_SIZE = 256


def dib_frame(img: Image.Image) -> bytes:
    """32bpp 图标帧：BITMAPINFOHEADER(40) + BGRA 自下而上 + 全零 AND mask"""
    w, h = img.size
    px = img.convert("RGBA").tobytes()  # RGBA, 自上而下

    # ICON 里的 DIB 是 BGRA 且自下而上
    rows = []
    stride = w * 4
    for y in range(h - 1, -1, -1):
        row = bytearray(px[y * stride : (y + 1) * stride])
        # RGBA -> BGRA
        row[0::4], row[2::4] = row[2::4], row[0::4]
        rows.append(bytes(row))
    bitmap = b"".join(rows)

    header = struct.pack(
        "<IiiHHIIiiII",
        40,            # biSize
        w,             # biWidth
        h * 2,         # biHeight：XOR 图 + AND 掩码，所以是两倍
        1,             # biPlanes
        32,            # biBitCount
        0,             # biCompression = BI_RGB
        w * h * 4,     # biSizeImage
        0, 0,          # biXPelsPerMeter / biYPelsPerMeter
        0, 0,          # biClrUsed / biClrImportant
    )

    # AND mask：32bpp 下 alpha 才是权威，掩码置零即可；每行按 4 字节对齐
    mask_row = ((w + 31) // 32) * 4
    mask = b"\x00" * (mask_row * h)

    return header + bitmap + mask


def png_frame(img: Image.Image) -> bytes:
    buf = BytesIO()
    img.convert("RGBA").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"[ico] 找不到 {SRC}（先跑 scripts/make-app-icon.py）")

    src = Image.open(SRC).convert("RGBA")

    entries = []  # (边长, 数据)
    for size in DIB_SIZES:
        entries.append((size, dib_frame(src.resize((size, size), Image.LANCZOS))))
    entries.append((PNG_SIZE, png_frame(src.resize((PNG_SIZE, PNG_SIZE), Image.LANCZOS))))

    count = len(entries)
    out = bytearray(struct.pack("<HHH", 0, 1, count))  # ICONDIR
    offset = 6 + 16 * count

    dir_entries = bytearray()
    for size, data in entries:
        dir_entries += struct.pack(
            "<BBBBHHII",
            size if size < 256 else 0,  # 256 用 0 表示
            size if size < 256 else 0,
            0,      # 调色板色数
            0,      # 保留
            1,      # 色彩平面
            32,     # 位深
            len(data),
            offset,
        )
        offset += len(data)

    out += dir_entries
    for _, data in entries:
        out += data

    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_bytes(bytes(out))
    print(
        f"[ico] {DST.relative_to(ROOT)}  {count} 帧  "
        f"{len(out) / 1024:.1f} KB  "
        f"DIB={DIB_SIZES} PNG=[{PNG_SIZE}]"
    )


if __name__ == "__main__":
    main()
