/**
 * 把 pdf.js 的侧载资源复制到 public/pdfjs/
 *
 * 为什么要复制：pdf.js 是按需去**请求文件**的（每个 CMap、每个标准字体各是一个独立请求），
 * 所以必须是一份「能直接访问的目录」，没法靠打包成模块解决。
 *
 * 为什么这三类必须有：缺失**不会报错**，只会静默降级，而症状极难联想到配置 ——
 *   - cmaps/         中文 PDF（CID 字体引用预定义 CMap）取不到正确字符 → 文字层乱码
 *   - standard_fonts/ 依赖标准 14 字体的老论文（字体未内嵌）→ 整页文字画不出来
 *   - wasm/          JBIG2 / JPEG2000 图片解码；缺失会回落到 JS 实现（能出图但慢），
 *                    学术 PDF 里的 JPX 插图不罕见，所以一并带上
 *
 * 用版本号做标记：pdfjs 升级后自动重拷，平时启动不重复拷这 4MB。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');
const DIRS = ['cmaps', 'standard_fonts', 'wasm'];

if (!existsSync(src)) {
  console.warn('[pdfjs-assets] 没找到 node_modules/pdfjs-dist，跳过（请先安装依赖）');
  process.exit(0);
}

const version = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version;
const marker = join(dest, '.version');

if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === version) {
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

for (const dir of DIRS) {
  const from = join(src, dir);
  if (!existsSync(from)) {
    console.warn(`[pdfjs-assets] 包里没有 ${dir}/，跳过`);
    continue;
  }
  cpSync(from, join(dest, dir), { recursive: true });
}

writeFileSync(marker, `${version}\n`);
console.log(`[pdfjs-assets] 已复制 pdf.js ${version} 的侧载资源 → public/pdfjs/`);
