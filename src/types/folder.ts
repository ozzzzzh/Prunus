/**
 * Prunus 文件夹类型定义
 *
 * 支持嵌套文件夹和会话的树形结构
 */

/**
 * 文件夹项 - 文件系统中的基本单位
 * 可以是文件夹或会话
 */
export interface FolderItem {
  id: string;
  name: string;
  type: 'folder' | 'session';
  parentId: string | null;  // null = 根目录
  createdAt: number;
  updatedAt: number;
  collapsed?: boolean;       // UI 状态：文件夹是否折叠
  order?: number;            // 同级排序顺序
  sessionId?: string;        // 仅 type='session' 时，引用 sessionStore 中的 session
  pinned?: boolean;          // 置顶标记
}

/**
 * 树节点 - 运行时构建的树形结构
 */
export interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'session';
  sessionId?: string;
  collapsed?: boolean;
  order?: number;
  pinned?: boolean;
  children: TreeNode[];
}

/**
 * 从扁平结构构建树形结构
 */
export function buildTree(items: Record<string, FolderItem>): TreeNode[] {
  const itemArray = Object.values(items);

  // 创建节点映射
  const nodeMap = new Map<string, TreeNode>();
  itemArray.forEach(item => {
    nodeMap.set(item.id, {
      id: item.id,
      name: item.name,
      type: item.type,
      sessionId: item.sessionId,
      collapsed: item.collapsed,
      order: item.order,
      pinned: item.pinned,
      children: [],
    });
  });

  // 构建树形结构
  const rootNodes: TreeNode[] = [];
  itemArray.forEach(item => {
    const node = nodeMap.get(item.id)!;
    if (item.parentId === null) {
      rootNodes.push(node);
    } else {
      const parent = nodeMap.get(item.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  });

  // 排序：置顶优先 > 文件夹优先 > 时间倒序
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .sort((a, b) => {
        // 置顶优先
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        // 文件夹优先（同级情况下文件夹在会话上方）
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        // 时间倒序（最新的在上面）
        return (b.order ?? 0) - (a.order ?? 0);
      })
      .map(node => ({
        ...node,
        children: sortNodes(node.children),
      }));
  };

  return sortNodes(rootNodes);
}

/**
 * 获取文件夹的所有后代 ID（用于级联删除）
 */
export function getDescendantIds(
  items: Record<string, FolderItem>,
  folderId: string
): string[] {
  const descendants: string[] = [];
  const queue: string[] = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    Object.values(items).forEach(item => {
      if (item.parentId === currentId) {
        descendants.push(item.id);
        if (item.type === 'folder') {
          queue.push(item.id);
        }
      }
    });
  }

  return descendants;
}

/**
 * 检查目标文件夹是否是源文件夹的后代（防止循环引用）
 */
export function isDescendant(
  items: Record<string, FolderItem>,
  sourceId: string,
  targetId: string
): boolean {
  let current: FolderItem | undefined = items[targetId];
  while (current) {
    if (current.id === sourceId) return true;
    current = current.parentId ? items[current.parentId] : undefined;
  }
  return false;
}

/**
 * 获取文件夹的直接子项
 */
export function getChildren(
  items: Record<string, FolderItem>,
  parentId: string | null
): FolderItem[] {
  return Object.values(items)
    .filter(item => item.parentId === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
