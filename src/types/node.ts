/**
 * Prunus 节点类型系统
 *
 * 设计原则：
 * 1. 类型与角色分离 - 支持笔记场景扩展
 * 2. 向后兼容 - 保留旧数据迁移路径
 * 3. 扩展友好 - 新节点类型通过联合类型添加
 */

// ===== 节点类型定义 =====

/**
 * 节点类型枚举
 * - note: 普通笔记节点
 * - todo: 待办事项节点
 * - question: 问题节点
 * - idea: 灵感/想法节点
 * - reference: 引用其他节点的节点
 * - image: 图片节点
 * - code: 代码块节点
 * - link: 外部链接节点
 * - ai-chat: AI 对话节点（保留现有功能）
 */
export type NodeType =
  | 'note'
  | 'todo'
  | 'question'
  | 'idea'
  | 'reference'
  | 'image'
  | 'code'
  | 'link'
  | 'ai-chat';

/**
 * AI 对话角色（仅 ai-chat 类型使用）
 */
export type AIRole = 'user' | 'assistant' | 'system';

/**
 * @deprecated 使用 AIRole 替代，保留向后兼容
 */
export type Role = AIRole;

/**
 * Todo 状态
 */
export type TodoStatus = 'pending' | 'in-progress' | 'completed';

/**
 * 节点标记类型
 */
export type NodeMarker = '🌱' | '🪵' | '🍃' | '🍑';

/**
 * 基础节点接口 - 所有节点类型的公共属性
 */
export interface BaseNode {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  type: NodeType;
  title?: string;
  content: string;
  metadata: Record<string, unknown>; // 灵活的选择 有助于后续拓展
  createdAt: number;
  updatedAt: number;
  collapsed?: boolean;
  marker?: NodeMarker;
}

/**
 * AI 对话节点 - 保留现有对话功能
 */
export interface AIChatNode extends BaseNode {
  type: 'ai-chat';
  role: AIRole;
}

/**
 * 普通笔记节点
 */
export interface NoteNode extends BaseNode {
  type: 'note';
}

/**
 * 待办事项节点
 */
export interface TodoNode extends BaseNode {
  type: 'todo';
  status: TodoStatus;
  dueDate?: number;
}

/**
 * 问题节点
 */
export interface QuestionNode extends BaseNode {
  type: 'question';
  resolved?: boolean;
  resolvedBy?: string;  // 解答节点 ID
}

/**
 * 灵感节点
 */
export interface IdeaNode extends BaseNode {
  type: 'idea';
  priority?: 'low' | 'medium' | 'high';
}

/**
 * 引用节点 - 链接到其他节点
 */
export interface ReferenceNode extends BaseNode {
  type: 'reference';
  targetNodeId: string;
  targetSessionId?: string;
}

/**
 * 图片节点
 */
export interface ImageNode extends BaseNode {
  type: 'image';
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

/**
 * 代码块节点
 */
export interface CodeNode extends BaseNode {
  type: 'code';
  language?: string;
  filename?: string;
}

/**
 * 外部链接节点
 */
export interface LinkNode extends BaseNode {
  type: 'link';
  url: string;
  favicon?: string;
  description?: string;
}

/**
 * 联合类型 - 所有节点类型
 */
export type PrunusNode =
  | AIChatNode
  | NoteNode
  | TodoNode
  | QuestionNode
  | IdeaNode
  | ReferenceNode
  | ImageNode
  | CodeNode
  | LinkNode;

/**
 * 节点类型守卫
 */
export function isAIChatNode(node: PrunusNode): node is AIChatNode {
  return node.type === 'ai-chat';
}

export function isNoteNode(node: PrunusNode): node is NoteNode {
  return node.type === 'note';
}

export function isTodoNode(node: PrunusNode): node is TodoNode {
  return node.type === 'todo';
}

export function isQuestionNode(node: PrunusNode): node is QuestionNode {
  return node.type === 'question';
}

export function isIdeaNode(node: PrunusNode): node is IdeaNode {
  return node.type === 'idea';
}

export function isReferenceNode(node: PrunusNode): node is ReferenceNode {
  return node.type === 'reference';
}

export function isImageNode(node: PrunusNode): node is ImageNode {
  return node.type === 'image';
}

export function isCodeNode(node: PrunusNode): node is CodeNode {
  return node.type === 'code';
}

export function isLinkNode(node: PrunusNode): node is LinkNode {
  return node.type === 'link';
}

/**
 * 判断节点是否可编辑（AI 对话节点的 assistant 消息不可直接编辑）
 */
export function isNodeEditable(node: PrunusNode): boolean {
  if (isAIChatNode(node)) {
    return node.role === 'user';
  }
  return true;
}

/**
 * 获取节点的显示图标
 */
export function getNodeIcon(node: PrunusNode): string {
  if (node.marker) return node.marker;

  switch (node.type) {
    case 'ai-chat':
      return node.role === 'assistant' ? '🤖' : node.role === 'user' ? '👤' : '⚙️';
    case 'note':
      return '📝';
    case 'todo':
      return node.status === 'completed' ? '✅' : '⬜';
    case 'question':
      return node.resolved ? '❓✅' : '❓';
    case 'idea':
      return '💡';
    case 'reference':
      return '🔗';
    case 'image':
      return '🖼️';
    case 'code':
      return '💻';
    case 'link':
      return '🔖';
    default:
      return '📄';
  }
}
