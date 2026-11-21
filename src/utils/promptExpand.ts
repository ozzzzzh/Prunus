/**
 * Prunus Prompt 的发散调用
 *
 * 一次调用 = 给某个节点想出 2–N 个"下一步值得确定的点"。它是这个功能里
 * **唯一**需要模型的环节：勾选、删除、合成提示词全是本地的。
 *
 * 为什么上下文要带整棵树的标题、而不只是祖先链：不同分支很容易给出重复建议
 * （"配色"在三个地方各出现一次）。带上已展开节点的标题，模型才知道哪些已经想过。
 */

import { generateAIResponse } from './llmApi';
import { htmlToPlainText } from './richtext';
import { useSessionStore } from '../store/sessionStore';
import { getPromptNodeMeta, isPromptProposal } from '../types/microApp';

export interface PromptExpandItem {
  title: string;
  why: string;
  /** draft = 可直接粘贴的候选稿；decision = 方向/偏好选择 */
  kind: 'decision' | 'draft';
}

export type PromptExpandResult = 'expanded' | 'done' | 'busy' | 'error';

/** 同一节点同一时间只允许一个在途请求（按钮被连点两次不该发两次） */
const inFlight = new Set<string>();

const FALLBACK_OPTION_COUNT = 3;

function newBatchId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从可能带 Markdown 围栏的输出里抠出 JSON 对象 */
function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `你是 Prunus Prompt 的分支发散器。用户正在把模糊议题收敛成可执行的方案。

给定：议题、从根到当前节点的路径、已经想过的全部标题、当前节点已有的子项。

请为当前节点提出"下一步值得确定的内容"，遵守以下规则：
1. 优先给**成品**：可以直接粘贴进最终产物的文案、页面结构、配色、技术片段、图片 prompt、镜头描述。
   只有当这一项确实是偏好/方向选择时，才给简短标签。
2. 每一项都必须能直接改变最终产物。禁止"要吸引人""保持简洁"这类没有具体所指的建议。
3. 通用最佳实践（首屏要有 CTA、移动端要适配）不要问出来 —— 它们会由成稿阶段作为默认约束补上。
4. 遇到用户可能不熟悉的概念，在 why 里用一句人话解释，并给一个与当前议题直接相关的例子。
5. 不要重复"已经想过的标题"；优先在当前节点已有子项的基础上补充。
6. 当前节点已经足够具体、再拆分没有实际价值时，返回 done: true 和空数组。

只返回 JSON，不要解释：
{"done": boolean, "items": [{"title": "...", "why": "...", "kind": "draft" | "decision"}]}

title 规则：kind=draft 时是完整候选稿（可多行，≤120 字）；kind=decision 时是短标签（≤20 字）。
why 用一句话说明"选它会带来什么"。`;

/**
 * 为某个节点发散下一层。
 *
 * 调用方（节点上的"细分"、父节点上的"再想几个"）只需要关心返回值：
 * - expanded：已创建新节点
 * - done：模型认为不需要再拆
 * - busy：已有在途请求
 * - error：请求或解析失败（调用方负责提示）
 */
export async function expandPromptNode(
  sessionId: string,
  nodeId: string
): Promise<PromptExpandResult> {
  if (inFlight.has(nodeId)) return 'busy';
  inFlight.add(nodeId);

  try {
    const session = useSessionStore.getState().sessions[sessionId];
    if (!session) return 'error';

    const node = session.nodes[nodeId];
    if (!node) return 'error';

    const rootId = session.rootNodeId;
    const goal = rootId ? (session.nodes[rootId]?.content ?? '').trim() : '';
    if (!goal) return 'error';

    const requested = session.microApps?.prompt?.optionCount ?? FALLBACK_OPTION_COUNT;

    const promptChildren = node.childrenIds
      .map((id) => session.nodes[id])
      .filter((child): child is NonNullable<typeof child> => Boolean(child));

    const existingTitles = promptChildren
      .map((child) => htmlToPlainText(child.content).trim())
      .filter(Boolean);

    // 只数"AI 提议的决策/候选稿"：手动补充的笔记、追问的解释都不占发散名额
    const proposalCount = promptChildren.filter((child) =>
      isPromptProposal(getPromptNodeMeta(child))
    ).length;

    // 补齐时只补充缺的；首次发散时就是全量
    const missing = Math.max(1, requested - proposalCount);

    // 根 → 当前节点的标题路径
    const path: string[] = [];
    let cursor: string | null = node.parentId;
    while (cursor) {
      const current: typeof node | undefined = session.nodes[cursor];
      if (!current) break;
      const title = htmlToPlainText(current.content).trim();
      if (title) path.unshift(title);
      cursor = current.parentId;
    }

    // 已经想过的全部标题（整棵树，不只是路径）
    const knownTitles = Object.values(session.nodes)
      .filter((item) => getPromptNodeMeta(item) !== null)
      .map((item) => htmlToPlainText(item.content).trim())
      .filter(Boolean);

    const userPrompt = [
      `议题：${goal}`,
      `当前节点：${node.content.trim() || '（议题）'}`,
      path.length > 0 ? `路径：${path.join(' → ')}` : '',
      knownTitles.length > 0 ? `已经想过的标题：\n- ${knownTitles.join('\n- ')}` : '',
      existingTitles.length > 0 ? `当前节点已有的子项：\n- ${existingTitles.join('\n- ')}` : '',
      `请提出 ${missing} 项。`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await generateAIResponse(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      undefined,
      { temperature: 0.7, enableThinking: false }
    );

    const parsed = extractJson(response.content) as
      | { done?: unknown; items?: unknown }
      | null;

    if (!parsed) return 'error';

    const done = parsed.done === true;
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

    const seen = new Set(existingTitles.map((title) => title.trim()));
    const items: PromptExpandItem[] = [];

    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      if (!title || seen.has(title)) continue;
      seen.add(title);
      items.push({
        title,
        why: typeof record.why === 'string' ? record.why.trim() : '',
        kind: record.kind === 'draft' ? 'draft' : 'decision',
      });
      if (items.length >= missing) break;
    }

    if (done || items.length === 0) {
      useSessionStore.getState().setPromptNodeMeta(sessionId, nodeId, {
        expanded: true,
        done: true,
      });
      return 'done';
    }

    useSessionStore.getState().addPromptProposals({
      sessionId,
      parentId: nodeId,
      items,
      batchId: newBatchId(),
    });

    return 'expanded';
  } catch (error) {
    console.error('[PromptExpand] 发散失败:', error);
    return 'error';
  } finally {
    inFlight.delete(nodeId);
  }
}
