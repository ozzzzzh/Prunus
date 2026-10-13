/**
 * 文件内容指纹
 *
 * 用途：给一份 PDF 一个**由内容决定**的稳定标识，让「换设备后重新上传同一份文件」
 * 能自动重新关联到会话里记录的文档。
 *
 * 为什么不能用文件名/大小/修改时间：用户会改名、会重新下载（修改时间会变），
 * 而这些情况下我们仍然希望认出"就是同一份论文"。
 *
 * 为什么优先 SHA-256 且有降级：`crypto.subtle` 只在**安全上下文**存在
 * （https / localhost）。vite.config.ts 里 `server.host: '0.0.0.0'`，
 * 意味着局域网用 http 访问开发服务器时它是 undefined —— 那种情况下退化成
 * FNV-1a 的 64 位扩展版本。
 *
 * 降级的已知代价：若同一份文件在两台设备上分别用不同算法算过（一台走 http 局域网、
 * 一台走 https），指纹会不一致，表现为"提示这好像是另一份文件、需要确认替换"。
 * 不会丢数据，只是多一次确认 —— 这是刻意选择的失败方式。
 */

const SHA_PREFIX = 'sha256-';
const FNV_PREFIX = 'fnv1a64-';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * FNV-1a 的 64 位扩展：用两个不同初值各跑一遍 32 位 FNV，拼起来。
 *
 * 不用 BigInt 逐字节算 64 位：那在 10MB 文件上会慢到秒级；
 * Math.imul 是 32 位整数乘法，快得多，而两个独立初值的输出拼起来同样有 64 位混合度。
 * 末尾再混入长度，避免"只差结尾若干字节"的文件撞在一起。
 */
function fnv1a64(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 = Math.imul((h1 ^ b) >>> 0, 0x01000193) >>> 0;
    h2 = Math.imul((h2 + b) >>> 0, 0x85ebca6b) >>> 0;
  }

  const len = bytes.length >>> 0;
  h1 = Math.imul((h1 ^ len) >>> 0, 0x01000193) >>> 0;
  h2 = Math.imul((h2 ^ len) >>> 0, 0xc2b2ae35) >>> 0;

  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** 计算内容指纹。返回带算法前缀的字符串（前缀便于排查"为什么没关联上"） */
export async function hashFileBytes(bytes: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return SHA_PREFIX + toHex(new Uint8Array(digest));
    } catch {
      // 落到下面的廉价指纹。走到这里说明环境不支持，不是文件的问题
    }
  }
  return FNV_PREFIX + fnv1a64(new Uint8Array(bytes));
}
