/**
 * Jev 语义检索客户端
 *
 * 这是检索的**第二段**：只在本地关键字零命中、且用户主动点击时才调用。
 *
 * 上游 API 决定了调用形态：**每个节点一次请求**（`state` = 节点全文，
 * 问一个 `noul` 问题判定「与检索词是否相关」），取概率做排名。
 * 300 个节点就是 300 次请求 —— 所以这里的重点是**并发**与**渐进式呈现**，
 * 而不是单次请求的效率。
 */

import type { PrunusNode } from '../types';
import { htmlToPlainText } from './richtext';
import { communityBaseUrl, hasCommunityBackend } from './cdkService';

/** 并发上限。太高会被上游限流，太低等太久 —— 8 是折中值，实测后可调。 */
export const JEV_CONCURRENCY = 8;

/** 至多返回几个候选 */
export const JEV_TOP_N = 5;

export interface JevHit {
  nodeId: string;
  probability: number;
}

export interface JevProgress {
  done: number;
  total: number;
  /** 请求失败（含被跳过）的节点数 */
  failed: number;
  /** 当前累计的前 N 名，供界面渐进式刷新 */
  top: JevHit[];
}

export interface JevSearchOptions {
  signal?: AbortSignal;
  concurrency?: number;
  onProgress?: (progress: JevProgress) => void;
  /** 便于单测注入假实现；默认走真实后端 */
  request?: (state: string, query: string, signal?: AbortSignal) => Promise<number>;
}

/** 语义检索是否可用（需要配置了社区后端） */
export function isJevAvailable(): boolean {
  return hasCommunityBackend();
}

/** 调后端代理取单个节点的概率。后端已经把上游的畸形响应挡在外面了。 */
async function requestJevProbability(
  state: string,
  query: string,
  signal?: AbortSignal
): Promise<number> {
  const res = await fetch(`${communityBaseUrl()}/api/jev`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, query }),
    signal,
  });

  if (!res.ok) {
    let msg = `语义检索失败 (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      // 忽略非 JSON 错误体
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as { probability?: unknown };
  // 后端已经挡过 NaN，这里再挡一次：概率会参与排序，混进非有限数会把顺序彻底搞乱
  return typeof data?.probability === 'number' && Number.isFinite(data.probability)
    ? data.probability
    : Number.NaN;
}

/** 按概率降序取前 N */
function topHits(all: JevHit[]): JevHit[] {
  return [...all].sort((a, b) => b.probability - a.probability).slice(0, JEV_TOP_N);
}

/**
 * 对整棵节点树做语义检索。
 *
 * 三个关键设计：
 * - **并发池**：默认 8 个并发，把 300 次请求从"几分钟"压到"十几秒"
 * - **渐进式**：每完成一个就回调一次，界面能边搜边出结果，而不是干等到底
 * - **最近优先**：按 `updatedAt` 倒序发起。用户搜的多半是刚写的东西，
 *   这样它最先出结果，而不是排在队尾
 *
 * 单个节点失败**不中断整轮**，只累加 `failed` 继续跑完。
 */
export async function searchWithJev(
  query: string,
  nodes: PrunusNode[],
  opts: JevSearchOptions = {}
): Promise<JevHit[]> {
  const {
    signal,
    concurrency = JEV_CONCURRENCY,
    onProgress,
    request = requestJevProbability,
  } = opts;

  // 先摊平成纯文本再排序：
  // - 空节点没有可判定的内容，直接排除（计入 total 之外，不算失败）
  // - 节点内容可能是编辑过的 HTML，必须剥标签后再发给模型
  const searchable = nodes
    .map((node) => ({
      id: node.id,
      text: htmlToPlainText(node.content),
      updatedAt: node.updatedAt ?? 0,
    }))
    .filter((n) => n.text.trim().length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const hits: JevHit[] = [];
  let done = 0;
  let failed = 0;
  let cursor = 0;

  const report = () => {
    onProgress?.({ done, total: searchable.length, failed, top: topHits(hits) });
  };

  const worker = async () => {
    while (cursor < searchable.length) {
      if (signal?.aborted) return;
      const item = searchable[cursor++];

      try {
        const probability = await request(item.text, query, signal);
        if (Number.isFinite(probability)) {
          hits.push({ nodeId: item.id, probability });
        } else {
          failed++;
        }
      } catch {
        // 单个节点失败不能中断整轮 —— 否则一个偶发错误会让整次检索白做
        failed++;
      }

      done++;
      report();
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, searchable.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  return topHits(hits);
}
