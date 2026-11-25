/**
 * 桌面构建入口包装器（Windows/macOS 通用）
 *
 * 为什么需要它：Tauri CLI 自己再 spawn `cargo`，而子进程只继承**当前终端**的环境。
 * Windows 上 rustup 把 `%USERPROFILE%\.cargo\bin` 写进了用户 PATH，但
 * **早于 rustup 启动的进程不会重读环境变量** —— 典型受害者是 VS Code 的集成终端
 * （VS Code 主进程先起，之后每个新终端标签都继承它那份旧环境）。
 *
 * 症状是这句看着像没装 Rust 的报错：
 *   failed to run 'cargo metadata' command ... program not found
 *
 * 所以这里在 spawn 之前把 cargo bin 兜底塞进 PATH：
 *   - 已经在 PATH 里 → 原样不动（不改变现有行为）
 *   - 不在 → 前置插入（仅作用于本进程及其子进程，不污染系统设置）
 *   - 目录不存在 → 什么都不做，让 Tauri 报它原本的错（真没装 Rust 时不该被掩盖）
 *
 * 用法：node scripts/desktop-run.mjs build [--bundles nsis]
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const isWindows = process.platform === 'win32';
const sep = isWindows ? ';' : ':';
const cargoBin = join(homedir(), '.cargo', 'bin');

const env = { ...process.env };
const current = env.PATH ?? env.Path ?? '';
const parts = current.split(sep).filter(Boolean);
const normalized = (p) => (isWindows ? p.replace(/[\\/]+$/, '').toLowerCase() : p.replace(/\/+$/, ''));
const alreadyThere = parts.some((p) => normalized(p) === normalized(cargoBin));

if (!alreadyThere && existsSync(cargoBin)) {
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

const child = spawn('tauri', args, {
  stdio: 'inherit',
  env,
  // Windows 上 tauri 是 .cmd 批处理，必须过 shell 才能执行
  shell: isWindows,
});

child.on('error', (err) => {
  console.error('[desktop] 启动 tauri 失败：', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[desktop] tauri 被信号 ${signal} 终止`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
