/**
 * Prunus Prompt 的成稿调用
 *
 * 输入：用户勾选出来的内容（included）+ 议题；输出：一份结构化、可执行的 Prompt。
 *
 * 两条与"普通总结"不同的要求：
 * 1. **按 PRD 的章节纪律组织**，但读者不一定是人 —— 网页/代码给 agent 看，
 *    图片/视频给生成模型看，后者必须压缩成一段 + 参数，不能套十二个标题。
 * 2. **允许推断标准件，但必须显式标注**：CTA、基础架构、验收标准、非目标、输出格式、
 *    负面词、镜头节奏。事实（产品名/价格/卖点/已有栈）绝不推断，缺失就写 [待确认]。
 */

import { generateAIResponse } from './llmApi';
import { htmlToPlainText } from './richtext';
import { useSessionStore } from '../store/sessionStore';
import { getPromptNodeMeta } from '../types/microApp';

/** 单次成稿最多带多少条勾选内容，防止上下文失控 */
const MAX_INCLUDED = 80;

const SYSTEM_PROMPT = `你是 Prunus Prompt 的成稿器。输入是用户从一棵决策树里勾选出来的内容。

任务：把它写成一份**结构化、可执行**的 Prompt，而不是会议纪要或决策清单。

规则：
1. 先判断目标领域（网页/代码、图片、视频、其他）和读者（执行任务的 agent / 生成模型），据此选章节与详略：
   - 网页/代码：角色、背景与事实、目标、对象、必须包含、关键动作、风格与偏好、约束、验收标准、非目标、输出格式。
   - 图片/视频：用途、主体、风格、构图与光线、色彩/运动、约束、负面、输出格式。压缩成一段 + 参数，不要展开成十几个小标题。
2. 只使用"已纳入"的内容。已纳入的 draft 是候选成品，能原样使用就原样使用。
3. 事实（产品名、价格、真实卖点、已有技术栈、品牌色）绝不编造；缺失时写 [待确认: ...]，并列入最后一节。
4. 可以推断标准件：CTA、基础架构、验收标准、非目标、输出格式、负面词、镜头节奏。
   推断项必须在正文里标（推断）。
5. 用祈使句、具体值和可执行动词。禁止"要吸引人""保持简洁"这类没有具体所指的空话。
6. 结尾必须有且只有一节 "## 假设与待确认"，列出你替用户补了什么、哪里需要确认。

直接输出 Markdown，不要前言。`;

export async function synthesizePrompt(sessionId: string): Promise<string> {
  const session = useSessionStore.getState().sessions[sessionId];
  if (!session) return '';

  const rootId = session.rootNodeId;
  const root = rootId ? session.nodes[rootId] : null;
  if (!root) return '';

  const goal = htmlToPlainText(root.content).trim();
  if (!goal) return '';

  const lines: string[] = [];

  const walk = (parentId: string, path: string[]) => {
    const parent = session.nodes[parentId];
    if (!parent) return;

    for (const childId of parent.childrenIds) {
      const child = session.nodes[childId];
      if (!child) continue;

      const meta = getPromptNodeMeta(child);
      if (!meta) continue;

      const content = htmlToPlainText(child.content).trim();
      if (!content) {
        walk(childId, path);
        continue;
      }

      const nextPath = [...path, content];

      if (meta.included && lines.length < MAX_INCLUDED) {
        const kind = meta.kind ?? 'decision';
        const where = nextPath.slice(0, -1).join(' › ');
        lines.push(`- [${kind}]${where ? ` ${where} ›` : ''} ${content}`);
      }

      walk(childId, nextPath);
    }
  };

  walk(root.id, []);

  if (lines.length === 0) return '';

  const userPrompt = [
    `议题：${goal}`,
    '已纳入的内容（按路径）：',
    lines.join('\n'),
    '请据此生成成稿。',
  ].join('\n\n');

  const response = await generateAIResponse(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    undefined,
    { temperature: 0.4, enableThinking: false }
  );

  return response.content.trim();
}
