/**
 * 知识总结服务
 *
 * 将多个节点内容发送给 LLM，生成结构化的知识总结。
 */

import { generateAIResponse } from './llmApi';

export interface SummaryNodeInput {
  role: string;
  content: string;
}

/**
 * 剥离 HTML 标签，减少发送给 LLM 的噪音。
 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/**
 * 对多个节点内容进行知识总结与凝练。
 *
 * @param nodes 待总结的节点列表（按选择顺序）。
 * @param customInstruction 可选的自定义总结要求。
 * @returns 总结文本（Markdown）。
 */
export async function summarizeNodes(
  nodes: SummaryNodeInput[],
  customInstruction?: string
): Promise<string> {
  const systemPrompt =
    'You are a knowledge summarization assistant. ' +
    'Condense the provided node contents into a clear, structured summary. ' +
    'Preserve key facts and important details, remove redundancy, and keep the original meaning. ' +
    'Use Markdown formatting with headings and bullet points where appropriate.';

  const nodeBlocks = nodes
    .map((node, index) => `【节点 ${index + 1}】\n${stripHtml(node.content).trim()}`)
    .join('\n\n');

  let userPrompt = `请对以下节点内容进行知识总结和凝练：\n\n${nodeBlocks}`;

  if (customInstruction && customInstruction.trim()) {
    userPrompt += `\n\n总结要求：${customInstruction.trim()}`;
  }

  const response = await generateAIResponse([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  return response.content;
}
