/**
 * Markdown 渲染前的归一化
 *
 * 这里集中处理两类「按标准规则合法、但对用户就是显示错误」的问题：
 *   1. 加粗定界符 `**` 在两种情况下失效（见 convertBoldDelimiters）
 *   2. LaTeX 原生定界符 `\[...\]` / `\(...\)` 不被 remark-math 识别
 * 外加价格文本里孤立 `$` 的保护。
 */

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

/** 成对的加粗定界符：`**` + 非空白开头 + 非空白结尾 + `**`（不跨行） */
const BOLD_SPAN = /\*\*(?=\S)([^\n]*?\S)\*\*/g;

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
 * 把成对的 `**...**` 直接转成 `<strong>`。
 *
 * 为什么不靠 Markdown 自己的强调语法，而要自己转？两种情况下它都失效：
 *
 * 1. **CommonMark 的 flanking 规则**：`**` 后面紧邻标点（如引号）、前面又是
 *    非空白/标点时，这个定界符不能开启强调，闭合符同理。于是
 *    `提供**"低温、湿润、透气"**的环境。` 整对失效、星号原样显示。
 *    LLM 输出里这种写法非常常见。
 *
 * 2. **HTML 块内的 Markdown 不被解析**：节点被双击编辑过之后，内容会存成 HTML
 *    （见 markdownToHtml）。而 CommonMark 规定 HTML 块内部不再按 Markdown 解析，
 *    于是里面字面写着的 `**` 永远不会变成加粗。
 *
 * 直接产出 `<strong>` 一举覆盖两种情况：在 Markdown 内容里它是合法的内联 HTML，
 * 在 HTML 内容里它本来就是 HTML。顺带也不再需要「往文字里插零宽空格」那种 hack。
 *
 * 注意：调用方已按代码块 / 公式切分，所以不会误伤代码与 LaTeX 里的字面星号。
 */
function convertBoldDelimiters(text: string): string {
  return text.replace(BOLD_SPAN, (_match, inner: string) => `<strong>${inner}</strong>`);
}

/**
 * 渲染前的 Markdown 归一化。处理顺序：
 *
 *   1. 按代码切分      → 代码片段原样保留
 *   2. 非代码段：转换 LaTeX 定界符（`\[..\]` / `\(..\)` → `$$..$$` / `$..$`）
 *   3. 再按「代码 + 公式」切分 → 只对纯文本段：转义孤立 `$`、把 `**..**` 转成 `<strong>`
 *
 * 第 3 步**必须排除公式段**：LaTeX 里 `_` `^` `*` 很常见，不能被 `**` 正则误伤。
 */
export function normalizeMarkdown(text: string): string {
  if (!text) return text;

  return mapOutside(text, CODE_SPAN, (nonCode) => {
    const withDollar = convertLatexDelimiters(nonCode);
    return mapOutside(withDollar, MATH_SPAN, (plain) =>
      convertBoldDelimiters(escapeLoneDollars(plain))
    );
  });
}
