/**
 * 桌面构建入口包装器（Windows/macOS 通用）
 *
 * 干两件事，都不改系统设置、只影响本进程树：
 *
 * 1. **兜底 cargo 的 PATH**。Tauri CLI 自己再 spawn `cargo`，而子进程只继承
 *    **当前终端**的环境。Windows 上 rustup 把 `%USERPROFILE%\.cargo\bin` 写进了
 *    用户 PATH，但**早于 rustup 启动的进程不会重读环境变量** —— 典型受害者是
 *    VS Code 的集成终端（主进程先起，之后每个新标签都继承它那份旧环境）。
 *    症状是一句看着像没装 Rust 的报错：
 *      failed to run 'cargo metadata' command ... program not found
 *
 * 2. **直接跑 CLI 的 JS 入口**，不过 shell。
 *    早先的写法是 `spawn('tauri', args, { shell: true })`，在 Node 21+ 会报
 *      DEP0190: Passing args to a child process with shell option true ...
 *    因为参数只做拼接、不做转义。改成 `node node_modules/@tauri-apps/cli/tauri.js`
 *    之后参数是数组直传，既没有这条警告，也不再有 Windows 引号转义问题
 *    （NSIS 包描述里出现中文或空格时尤其重要）。
 *
 * 用法：node scripts/desktop-run.mjs build [--bundles nsis]
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const isWindows = process.platform === 'win32';
const sep = isWindows ? ';' : ':';
const cargoBin = join(homedir(), '.cargo', 'bin');

const env = { ...process.env };
const current = env.PATH ?? env.Path ?? '';
const parts = current.split(sep).filter(Boolean);
const normalized = (p) => (isWindows ? p.replace(/[\\/]+$/, '').toLowerCase() : p.replace(/\/+$/, ''));

if (!parts.some((p) => normalized(p) === normalized(cargoBin)) && existsSync(cargoBin)) {
  const next = [cargoBin, ...parts].join(sep);
  env.PATH = next;
  // Windows 的环境变量名大小写不敏感，但进程里可能只有 `Path` 这一个键；
  // 两个都写，避免子进程读到另一份旧值。
  env.Path = next;
  console.log(`[desktop] cargo 不在 PATH 里，已临时前置：${cargoBin}`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('[desktop] 需要子命令，例如：node scripts/desktop-run.mjs build');
  process.exit(1);
}

/**
 * 图标换了，但 exe 里还是旧图标 —— 这是真的会发生的。
 *
 * `tauri-build` 在 build script 里生成 `resource.rc`（内容是 `32512 ICON "<icon.ico 的绝对路径>"`），
 * 再由 winres 用 rc.exe 编译成 `resource.lib` 链接进 exe。问题在于 winres / tauri-build
 * 都按「文件内容是否变化」决定重写：
 *   - .rc 的内容只跟路径和版本号有关，换图标它一个字都不变 → 不重写；
 *   - .lib 比 .rc 新 → winres 认为不用重编。
 * 结果就是 **icon.ico 换了，exe 里的图标纹丝不动**，而且 cargo 认为 build script 是 fresh，
 * 连脚本都不重跑。NSIS 那边反而正常 —— 它直接读 icon.ico，不走 rc.exe。
 *
 * 所以这里在构建前做一次脏检查：图标比 exe 新就清掉该 profile 的 build/prunus 目录
 * 并 touch build.rs（让 cargo 无条件重跑 build script）。只有真的换了图标才会触发。
 */
function refreshStaleIconResource() {
  const iconDir = join(root, 'src-tauri', 'icons');
  if (!existsSync(iconDir)) return;

  const newestIcon = newestMtime(iconDir);
  if (newestIcon === 0) return;

  const exeName = isWindows ? 'prunus.exe' : 'prunus';
  let dirty = false;

  for (const profile of ['release', 'debug']) {
    const exe = join(root, 'src-tauri', 'target', profile, exeName);
    if (!existsSync(exe)) continue;
    if (statSync(exe).mtimeMs >= newestIcon) continue;

    // 只清 prunus 这一个包的 build 产物，兄弟 crate 的缓存保留（否则等于全量重编）
    const buildDir = join(root, 'src-tauri', 'target', profile, 'build');
    if (existsSync(buildDir)) {
      for (const name of readdirSync(buildDir)) {
        if (name === 'prunus' || name.startsWith('prunus-')) {
          rmSync(join(buildDir, name), { recursive: true, force: true });
        }
      }
    }
    dirty = true;
  }

  if (dirty) {
    // touch build.rs：让 cargo 不看缓存，直接重跑 build script
    const buildRs = join(root, 'src-tauri', 'build.rs');
    const now = new Date();
    if (existsSync(buildRs)) utimesSync(buildRs, now, now);
    console.log('[desktop] 检测到图标比 exe 新，已清掉资源缓存（否则 exe 里会留旧图标）');
  }
}

/** 目录里最新的 mtime（毫秒），只算文件不算目录 */
function newestMtime(dir) {
  let max = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      max = Math.max(max, newestMtime(p));
    } else {
      max = Math.max(max, statSync(p).mtimeMs);
    }
  }
  return max;
}

refreshStaleIconResource();

// 解析 CLI 的 JS 入口（package.json 的 bin 字段指向 tauri.js）
const cliPkg = require.resolve('@tauri-apps/cli/package.json');
const cliEntry = join(dirname(cliPkg), 'tauri.js');

if (!existsSync(cliEntry)) {
  console.error(`[desktop] 找不到 Tauri CLI 入口：${cliEntry}（先执行 npm install）`);
  process.exit(1);
}

const child = spawn(process.execPath, [cliEntry, ...args], {
  stdio: 'inherit',
  env,
  cwd: root,
});

child.on('error', (err) => {
  console.error('[desktop] 启动 Tauri CLI 失败：', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[desktop] Tauri CLI 被信号 ${signal} 终止`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
