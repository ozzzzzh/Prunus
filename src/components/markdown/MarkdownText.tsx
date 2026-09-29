import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { normalizeMarkdown } from '../../utils/markdown';
import { splitStreamingMarkdown } from '../../utils/markdownSegments';

interface MarkdownTextProps {
  children: string;
  /**
   * 是否为「正在流式生成」的内容。打开后走分段渲染，见下方组件说明。
   */
  streaming?: boolean;
}

/**
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

/**
 * 真正的渲染。用 memo 包起来是为了配合 streaming 模式的分段渲染：
 * 已定稿的块文本不再变化，props 相同就直接跳过，解析只发生一次。
 */
const BaseMarkdown = memo(function BaseMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
      {normalizeMarkdown(children)}
    </ReactMarkdown>
  );
});

/**
 * 全项目统一的 Markdown 渲染组件。
 *
 * 之所以集中到一处：markdown 渲染点有 5 个（节点正文 / 思考过程、
 * 展开视图正文 / 思考过程、总结弹窗）。若各处在自己的 JSX 里内联插件配置，
 * 每加一个插件就要同步改 5 个地方 —— 之前 `preprocessMarkdown` 的重复
 * 就是这么产生的。这里把插件配置和归一化都收拢成唯一真源。
 *
 * `streaming` 打开时走**分段渲染**：把内容切成「已定稿的块 + 正在写的尾巴」，
 * 每个块各自解析一次并被 memo 住，只有尾巴每个 chunk 重解析。
 *
 * 不这么做的代价是主线程被堵死：流式期间每个 chunk 都会重渲染，而这里会把
 * **全部已收到的内容**重新解析一遍 —— 内容越长越慢，总量是 O(n²)。
 * 实测 16k 字回复累计 45 秒主线程耗时（20 chunk/秒时需求 1160ms/秒，
 * 超过一个核心），分段后 0.6 秒。切分规则与正确性验证见 utils/markdownSegments.ts。
 */
export default function MarkdownText({ children, streaming = false }: MarkdownTextProps) {
  if (!streaming) return <BaseMarkdown>{children}</BaseMarkdown>;

  const { blocks, tail } = splitStreamingMarkdown(children);
  return (
    <>
      {blocks.map((block, i) => (
        <BaseMarkdown key={i}>{block}</BaseMarkdown>
      ))}
      {tail.trim() ? <BaseMarkdown>{tail}</BaseMarkdown> : null}
    </>
  );
}
