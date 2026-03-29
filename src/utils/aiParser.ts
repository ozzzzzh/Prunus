import { generateAIResponse } from './llmApi';

/**
 * 智能分析 AI 返回的文本，让大模型自己来判断如何拆分为逻辑上独立的子块（Branches）。
 * 我们要求大模型返回一个特定的 JSON 格式，包含拆分后的数组。
 * 
 * @param content 原始长文本
 * @returns 拆分后的文本数组。如果无法拆分，则返回包含原始文本的单元素数组。
 */
export async function smartParseBranchesFromContent(content: string): Promise<{ outline: string; branches: string[] }> {
  const prompt = `
You are a structural parser. The user will provide a piece of text (usually an AI's response).
Your task is to analyze the text and separate it into an "outline" (the introductory part, summary, or general overview) and multiple logically independent "branches" (distinct points, steps, or list items).

If the text cannot be meaningfully split, put the whole text in "outline" and leave "branches" empty.
DO NOT summarize or change the meaning of the original text. Try to keep the original wording as much as possible.

Return ONLY a valid JSON object with the following structure, nothing else:
{
  "outline": "Introduction or outline here...",
  "branches": ["First point with details...", "Second point with details..."]
}

Here is the text to parse:
"""
${content}
"""
`;

  try {
    const response = await generateAIResponse([
      { role: 'system', content: 'You are a helpful JSON parser.' },
      { role: 'user', content: prompt }
    ]);

    // 尝试从返回内容中提取 JSON 对象（防止 AI 带有 markdown code block 等杂质）
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.outline !== undefined && Array.isArray(parsed.branches)) {
        return parsed;
      }
    }
    
    // 如果解析失败或者格式不对，兜底返回原内容作为大纲，没有分支
    return { outline: content, branches: [] };
  } catch (error) {
    console.error('Smart parsing failed:', error);
    // 如果 API 调用失败，退回到原内容
    return { outline: content, branches: [] };
  }
}
