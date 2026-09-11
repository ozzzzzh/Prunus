/**
 * Markdown 渲染前的归一化
 *
 * 这里集中处理两类「按标准规则合法、但对用户就是显示错误」的问题：
 *   1. CommonMark 的强调定界符 flanking 规则导致 `**"..."**` 加粗失效
 *   2. LaTeX 原生定界符 `\[...\]` / `\(...\)` 不被 remark-math 识别
 * 外加价格文本里孤立 `$` 的保护。
 */

/** 零宽空格（U+200B）：不可见，仅用于满足定界符规则。此处必须用转义写法，勿改成字面字符。 */
const ZWSP = '​';

/** Unicode 字母或数字（含中文、日文、韩文），即「词字符」 */
const isWordChar = (ch: string): boolean => /[\p{L}\p{N}]/u.test(ch);

/** 代码片段：围栏代码块 或 行内代码。这些内容一律不处理。 */
const CODE_SPAN = /(```[\s\S]*?```|`[^`\n]*`)/g;

/**
 * 成立的公式片段。
 *
 * 行内公式的判定**刻意与 remark-math 一致**：`$` 的内侧不能紧邻空白。
 * 用同一条规则切分，剩下的孤立 `$` 就必然是价格之类的普通文本，
 * 直接转义即可 —— 不会出现「我保护了但解析器仍当公式」的不一致。
 */
const MATH_SPAN = /(\$\$[\s\S]*?\$\$|\$[^\s$](?:[^$\n]*[^\s$])?\$)/g;

/**
 * 只对「非分隔符」片段施加变换。
 * split 带捕获组时，结果数组中奇数下标即为被捕获的分隔符本身。
 */
function mapOutside(text: string, splitter: RegExp, transform: (segment: string) => string): string {
  return text
    .split(splitter)
    .map((part, index) => (index % 2 === 1 ? part : transform(part)))
    .join('');
}

/**
 * LaTeX 原生定界符 → remark-math 认得的 `$` / `$$`
 *
 * remark-math 只支持 `$...$` 与 `$$...$$`，而 LLM 极常用 `\[...\]` / `\(...\)`。
 */
function convertLatexDelimiters(text: string): string {
  return (
    text
      // \[ ... \] → $$ ... $$（块级：定界符必须独占一行，内容需 trim）
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, tex: string) => `\n$$\n${tex.trim()}\n$$\n`)
      // \( ... \) → $ ... $
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, tex: string) => `$${tex.trim()}$`)
  );
}

/**
 * 转义孤立的 `$`（价格保护）。
 *
 * 只会被用在「已排除公式片段」的纯文本上，所以这里出现的 `$` 全部是孤立定界符，
 * 一律转义。`\$` 在 Markdown 里渲染为字面 `$`。
 */
function escapeLoneDollars(text: string): string {
  return text.replace(/\$/g, '\\$');
}

/**
 * 把成对的 `**...**` 里无法生效的定界符修好。
 */
function fixEmphasisDelimiters(text: string): string {
  // 只匹配成对的 **...**（跨行不匹配），不会误伤单个星号
  return text.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, (_match, inner: string) => {
    let body = inner;
    // 定界符内侧紧邻标点时，CommonMark 的 flanking 规则不允许它开/闭强调，
    // 于是在内侧补一个零宽空格 —— 它既非标点也非空白，规则即满足。
    if (!isWordChar(body[0])) body = ZWSP + body;
    if (!isWordChar(body[body.length - 1])) body = body + ZWSP;
    return `**${body}**`;
  });
}

/**
 * 渲染前的 Markdown 归一化。处理顺序：
 *
 *   1. 按代码切分      → 代码片段原样保留
 *   2. 非代码段：转换 LaTeX 定界符（`\[..\]` / `\(..\)` → `$$..$$` / `$..$`）
 *   3. 再按「代码 + 公式」切分 → 只对纯文本段：转义孤立 `$`、修复 `**`
 *
 * 第 3 步**必须排除公式段**：LaTeX 里 `_` `^` `*` 很常见，不能被 `**` 正则误伤。
 */
export function normalizeMarkdown(text: string): string {
  if (!text) return text;

  return mapOutside(text, CODE_SPAN, (nonCode) => {
    const withDollar = convertLatexDelimiters(nonCode);
    return mapOutside(withDollar, MATH_SPAN, (plain) =>
      fixEmphasisDelimiters(escapeLoneDollars(plain))
    );
  });
}
