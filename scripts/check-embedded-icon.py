"""
检查 exe 里**真正内嵌**的图标：把每一帧 RT_ICON 解出来，报告 alpha，并把最大的一帧
渲染到洋红底上存成 PNG —— 透明的地方露洋红，一眼就能看出有没有 alpha。

为什么需要专门的工具：`.NET` 的 `[System.Drawing.Icon]::ExtractAssociatedIcon` 走的是
shell 取图标那条路，会把 alpha 丢成 255，拿它判断「图标有没有透明通道」必然误判。
只有直接读 PE 的资源表才准。

用法：
    python scripts/check-embedded-icon.py src-tauri/target/release/prunus.exe
    python scripts/check-embedded-icon.py "...\\bundle\\nsis\\Prunus_0.1.21_x64-setup.exe" --png out.png
"""

import argparse
import io
import struct
import sys
from pathlib import Path

from PIL import Image

MAGENTA = (255, 0, 255)


def u16(b, o):
    return struct.unpack_from("<H", b, o)[0]


def u32(b, o):
    return struct.unpack_from("<I", b, o)[0]


def collect_icons(path: Path):
    """解析 PE 资源表，返回 [(边长, RGBA Image), ...]"""
    d = path.read_bytes()
    if d[:2] != b"MZ":
        raise SystemExit(f"{path} 不是 PE 文件")

    pe = u32(d, 0x3C)
    nsec = u16(d, pe + 6)
    opt_size = u16(d, pe + 20)
    opt = pe + 24
    dd = opt + (112 if u16(d, opt) == 0x20B else 96)  # PE32+ 与 PE32 的数据目录偏移不同
    res_rva = u32(d, dd + 2 * 8)  # 第 3 个数据目录 = 资源表

    secs = []
    so = opt + opt_size
    for i in range(nsec):
        base = so + i * 40
        secs.append((u32(d, base + 12), u32(d, base + 8), u32(d, base + 20)))

    def rva2off(rva: int) -> int:
        for va, vsize, raw in secs:
            if va <= rva < va + max(vsize, 1):
                return rva - va + raw
        raise ValueError(f"rva 0x{rva:X} 不在任何段内")

    res_off = rva2off(res_rva)
    icons = []

    def walk(dir_off: int, ids: list):
        n = u16(d, dir_off + 12) + u16(d, dir_off + 14)
        for i in range(n):
            ent = dir_off + 16 + i * 8
            name = u32(d, ent)
            off = u32(d, ent + 4)
            if off & 0x80000000:
                walk(res_off + (off & 0x7FFFFFFF), ids + [name])
            elif ids and ids[0] == 3:  # RT_ICON
                de = res_off + off
                start = rva2off(u32(d, de))
                blob = d[start : start + u32(d, de + 4)]
                if blob[:8] == b"\x89PNG\r\n\x1a\n":
                    im = Image.open(io.BytesIO(blob)).convert("RGBA")
                else:
                    # 传统 DIB：BITMAPINFOHEADER + 自下而上的 BGRA + AND mask
                    hdr, w, h, bpp = u32(blob, 0), u32(blob, 4), u32(blob, 8) // 2, u16(blob, 14)
                    if bpp != 32:
                        continue
                    px = blob[hdr : hdr + w * h * 4]
                    im = Image.frombytes("RGBA", (w, h), px).transpose(Image.FLIP_TOP_BOTTOM)
                    # 字节序是 BGRA，PIL 按 RGBA 读进来后要换回 R/B
                    r, g, b, a = im.split()
                    im = Image.merge("RGBA", (b, g, r, a))
                icons.append((im.width, im))

    walk(res_off, [])
    return icons


def main() -> None:
    ap = argparse.ArgumentParser(description="检查 exe 内嵌图标的 alpha 通道")
    ap.add_argument("exe", type=Path)
    ap.add_argument("--png", type=Path, help="把最大的一帧渲染到洋红底并存成这个文件")
    args = ap.parse_args()

    icons = collect_icons(args.exe)
    if not icons:
        raise SystemExit("这个 exe 里没有 RT_ICON 资源")

    print(f"{args.exe}")
    for size, im in sorted(icons, key=lambda t: t[0]):
        alpha = im.getchannel("A")
        # 用 numpy 会更省事，但为了少一个依赖，这里直接统计
        hist = alpha.histogram()
        transparent = sum(hist[:250]) / (im.width * im.height) * 100
        lo = next(i for i, v in enumerate(hist) if v)
        hi = next(i for i in range(255, -1, -1) if hist[i])
        print(f"  {size:>3}px  alpha={lo}/{hi}  透明占比={transparent:5.1f}%")

    if args.png:
        _, best = max(icons, key=lambda t: t[0])
        flat = Image.new("RGB", best.size, MAGENTA)
        flat.paste(best, mask=best.getchannel("A"))
        flat.save(args.png)
        print(f"已渲染到洋红底：{args.png}")


if __name__ == "__main__":
    sys.exit(main())
