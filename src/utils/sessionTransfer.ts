/**
 * 单对话的导出 / 导入
 *
 * 这里只做纯数据处理，不碰 DOM 也不依赖 React，因此可以脱离浏览器单独验证。
 * 触发下载与文件选择的部分放在组件里。
 *
 * 设计要点：
 * - 导出**刻意不包含任何凭据**（apiKey / token / baseUrl）。导出文件很容易被分享，
 *   带上密钥就等于泄露；换设备后重新配置一次即可。
 * - 导入端要能同时吃下三种来源的文件，见 parseSessionFile 的说明。
 * - 导入是**追加合并**：本机已有的一律保留，id 撞了就作为副本导入。
 */

import type { ChatSession } from '../store/sessionStore';

/** 本文件自己的格式版本。与 persistenceService 里的 version 是两回事，不要混。 */
const EXPORT_VERSION = 1;

/** 文件用途标记，便于导入时快速判断「这是不是 Prunus 的对话文件」 */
const EXPORT_KIND = 'prunus-session';

/** 冲突副本的标题后缀 */
const IMPORT_SUFFIX = '（导入）';

/**
 * 与 sessionStore / folderStore 里那个 generateId 同格式（7 位 base36）。
 *
 * 刻意在这里再实现一次而不是从 store 引入：本模块要保持「无 store 依赖」才能单独验证。
 * 会话 id 对外是不透明字符串，只要唯一即可，格式即便将来漂移也不影响正确性。
 */
const generateId = () => Math.random().toString(36).substring(2, 9);

/** 生成一个不在 taken 里的 id */
function uniqueId(taken: Set<string>): string {
  let id = generateId();
  while (taken.has(id)) id = generateId();
  return id;
}

/** 在 taken 之外拼一个不冲突的标题 */
function uniqueTitle(base: string, taken: Set<string>): string {
  const first = `${base}${IMPORT_SUFFIX}`;
  if (!taken.has(first)) return first;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${IMPORT_SUFFIX} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${IMPORT_SUFFIX} ${Date.now()}`;
}

/**
 * 判断一个值是否像一条可用的 ChatSession。
 *
 * 只做「形状」层面的检查 —— 文件是用户从外部拿来的，不能信任。
 * 不深入校验节点之间的引用一致性（例如 childrenIds 是否指向真实存在的节点）：
 * 那种脏数据只会让这一个会话渲染异常，不会影响其它会话。
 */
function isChatSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    typeof s.title === 'string' &&
    typeof s.rootNodeId === 'string' &&
    !!s.nodes &&
    typeof s.nodes === 'object' &&
    !Array.isArray(s.nodes) &&
    Object.keys(s.nodes as object).length > 0
  );
}

/** 把一个会话序列化成可下载的 JSON 文本 */
export function serializeSession(session: ChatSession): string {
  return JSON.stringify(
    {
      version: EXPORT_VERSION,
      kind: EXPORT_KIND,
      exportedAt: Date.now(),
      // 沿用 `sessions` 这个键名（而不是 `session`），使导出的文件与既有的全量导出
      // 结构一致 —— 导入端因此能用同一段解析逻辑吃下两者。
      sessions: { [session.id]: session },
    },
    null,
    2
  );
}

export interface ParsedSessionFile {
  sessions: Record<string, ChatSession>;
  /** 形状不合法、被丢弃的条数 */
  skipped: number;
}

/**
 * 解析导入的文件。
 *
 * 接受的三种来源（已核实它们 `sessions` 的形状不同）：
 *   1. 本模块导出的单对话文件        —— sessions 是 **Record**
 *   2. SettingsModal 旧的全量导出     —— sessions 是 **Record**
 *   3. persistenceService.exportToJSON —— sessions 是 **数组**
 * 所以这里统一按「数组或对象」归一化。
 *
 * `apiConfig` / `folderItems` 等其它键**一律忽略不读** —— 凭据绝不进入导入路径。
 */
export function parseSessionFile(text: string): ParsedSessionFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON，无法解析');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('文件内容不是一个对象，可能不是 Prunus 导出的对话文件');
  }

  const raw = (data as Record<string, unknown>).sessions;
  if (raw === undefined || raw === null) {
    throw new Error('文件里没有 sessions 字段，可能不是 Prunus 导出的对话文件');
  }

  const list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [raw];

  const sessions: Record<string, ChatSession> = {};
  let skipped = 0;

  for (const item of list) {
    if (!isChatSession(item)) {
      skipped++;
      continue;
    }
    sessions[item.id] = item;
  }

  if (Object.keys(sessions).length === 0) {
    throw new Error(
      skipped > 0
        ? `文件里的 ${skipped} 条对话格式都不正确，无法导入`
        : '文件里没有可导入的对话'
    );
  }

  return { sessions, skipped };
}

export interface ResolvedImport {
  sessions: Record<string, ChatSession>;
  /** 因 id 冲突而改名为副本的条数 */
  renamed: number;
}

/**
 * 为待导入的会话分配最终 id 与标题。
 *
 * 规则（按已确认的决策）：**追加合并，永不覆盖本机数据**。
 * id 与本机相同时重新生成 id，并把标题改成「xxx（导入）」—— 宁可留下一份副本，
 * 也不能悄悄把用户本机的那份盖掉。
 *
 * 刻意**不做节点级 id 重映射**：节点 id 的作用域是会话内部，换了会话 id 之后
 * 不会与外部任何东西相撞，重映射只会平白引入出错的机会。
 */
export function resolveImport(
  incoming: Record<string, ChatSession>,
  existing: Record<string, ChatSession>
): ResolvedImport {
  const takenIds = new Set(Object.keys(existing));
  const takenTitles = new Set(Object.values(existing).map((s) => s.title));

  const sessions: Record<string, ChatSession> = {};
  let renamed = 0;

  for (const session of Object.values(incoming)) {
    let id = session.id;
    let title = session.title;

    if (takenIds.has(id)) {
      id = uniqueId(takenIds);
      title = uniqueTitle(title, takenTitles);
      renamed++;
    }

    // 记下来，避免同一次导入里的多份数据互相撞车
    takenIds.add(id);
    takenTitles.add(title);

    sessions[id] = { ...session, id, title };
  }

  return { sessions, renamed };
}

/** 把会话标题净化成安全的文件名（去掉路径分隔符与 Windows 保留字符） */
export function sessionTitleToFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, '_') // 文件系统保留字符
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${cleaned || '未命名对话'}.json`;
}
