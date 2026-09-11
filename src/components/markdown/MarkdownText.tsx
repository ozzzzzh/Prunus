import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { normalizeMarkdown } from '../../utils/markdown';

/**
 * 全项目统一的 Markdown 渲染组件。
 *
 * 之所以集中到一处：markdown 渲染点有 5 个（节点正文 / 思考过程、
 * 展开视图正文 / 思考过程、总结弹窗）。若各处在自己的 JSX 里内联插件配置，
 * 每加一个插件就要同步改 5 个地方 —— 之前 `preprocessMarkdown` 的重复
 * 就是这么产生的。这里把插件配置和归一化都收拢成唯一真源。
 *
 * 插件说明：
 * - `remarkGfm`    表格、删除线等
 * - `remarkMath`   解析 `$...$` / `$$...$$`（LaTeX 的 `\[..\]` / `\(..\)`
 *                  已由 `normalizeMarkdown` 预先转换，见 utils/markdown.ts）
 * - `rehypeRaw`    允许内容里的原始 HTML（编辑过的节点内容是 HTML）
 * - `rehypeKatex`  把数学节点渲染成 KaTeX
 *
 * 注：顺序（raw 先于 katex）已在 node 端用真实包验证过；
 * 实测两种顺序结果一致，故此处择一即可。
 */
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeRaw, rehypeKatex];

interface MarkdownTextProps {
  children: string;
}

export default function MarkdownText({ children }: MarkdownTextProps) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
      {normalizeMarkdown(children)}
    </ReactMarkdown>
  );
}
