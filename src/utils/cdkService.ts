/**
 * 社区版 CDK 兑换与额度查询服务
 *
 * COMMUNITY_API 由构建时注入（vite.config.ts 读取 .env 的 COMMUNITY_API）。
 * 为空表示纯开源自托管模式（无 CDK）。
 *
 * 支持三种写法：
 *   https://api.example.com  绝对地址，跨域，需要在后端配 CORS_ORIGIN
 *   /                        相对地址，与前端同源（推荐）
 *   /prunus                  挂在同源子路径下
 *
 * 「/」开头时在**运行时**才解析成绝对地址，因此同一份构建产物既能跑在
 * IP 上也能跑在域名上，换域名不需要重新构建。
 */

const RAW_COMMUNITY_API = (((import.meta as any).env?.VITE_COMMUNITY_API as string) || '').trim();

function resolveCommunityApi(raw: string): string {
  if (!raw) return '';
  // 以 "/" 开头 = 同源，跟随当前站点的协议/主机/端口
  if (raw.startsWith('/')) {
    if (typeof window === 'undefined') return '';
    return window.location.origin + raw.replace(/\/+$/, '');
  }
  return raw.replace(/\/+$/, '');
}

const COMMUNITY_API = resolveCommunityApi(RAW_COMMUNITY_API);

export interface RedeemResult {
  token: string;
  quota: number;
}

export interface QuotaInfo {
  quota: number;
  used_quota: number;
  remaining: number;
}

/** 社区后端是否可用（配了 COMMUNITY_API 才显示 CDK 入口） */
export function hasCommunityBackend(): boolean {
  return Boolean(COMMUNITY_API);
}

/** 社区后端根地址 */
export function communityBaseUrl(): string {
  return COMMUNITY_API;
}

/** 社区后端的 LLM 代理地址（OpenAI 兼容，/v1） */
export function communityV1Url(): string {
  return `${COMMUNITY_API}/v1`;
}

/** 兑换码换 token */
export async function redeemCdk(code: string): Promise<RedeemResult> {
  const res = await fetch(`${COMMUNITY_API}/api/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    let msg = `兑换失败 (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      // 忽略非 JSON 错误体
    }
    throw new Error(msg);
  }
  return res.json();
}

/** 查询某个 token 的额度 */
export async function fetchQuota(token: string): Promise<QuotaInfo> {
  const res = await fetch(`${COMMUNITY_API}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`查询额度失败 (${res.status})`);
  }
  return res.json();
}
