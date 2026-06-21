/**
 * 文件夹状态管理
 *
 * 负责文件夹树的 CRUD 操作
 */

import { create } from 'zustand';
import type { FolderItem, TreeNode } from '../types';
import { buildTree, getDescendantIds, isDescendant, getChildren } from '../types';

// ===== 类型定义 =====

interface FolderState {
  items: Record<string, FolderItem>;

  // 文件夹操作
  createFolder: (parentId: string | null, name: string) => string;
  renameFolder: (folderId: string, name: string) => void;
  renameItem: (itemId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;
  moveItem: (itemId: string, targetFolderId: string | null) => boolean;

  // 会话项操作
  createSessionItem: (parentId: string | null, sessionId: string, name: string) => string;
  deleteSessionItem: (itemId: string) => void;

  // UI 操作
  toggleCollapse: (folderId: string) => void;
  togglePin: (itemId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  // 排序
  reorderItems: (parentId: string | null, itemIds: string[]) => void;

  // 批量操作
  importItems: (items: Record<string, FolderItem>) => void;
  exportItems: () => Record<string, FolderItem>;

  // 辅助方法
  getTree: () => TreeNode[];
  getItem: (id: string) => FolderItem | undefined;
}

// ===== 工具函数 =====

const generateId = () => Math.random().toString(36).substring(2, 9);

// ===== Store 创建 =====

export const useFolderStore = create<FolderState>((set, get) => ({
  items: {},

  // ===== 文件夹操作 =====

  createFolder: (parentId, name) => {
    const folderId = generateId();
    const siblings = getChildren(get().items, parentId);
    const maxOrder = siblings.length > 0
      ? Math.max(...siblings.map(s => s.order ?? 0))
      : -1;

    const newFolder: FolderItem = {
      id: folderId,
      name,
      type: 'folder',
      parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      collapsed: true,
      order: maxOrder + 1,
    };

    set((state) => ({
      items: { ...state.items, [folderId]: newFolder },
    }));

    return folderId;
  },

  renameFolder: (folderId, name) => {
    set((state) => {
      const folder = state.items[folderId];
      if (!folder || folder.type !== 'folder') return state;

      return {
        items: {
          ...state.items,
          [folderId]: { ...folder, name, updatedAt: Date.now() },
        },
      };
    });
  },

  renameItem: (itemId, name) => {
    set((state) => {
      const item = state.items[itemId];
      if (!item) return state;

      return {
        items: {
          ...state.items,
          [itemId]: { ...item, name, updatedAt: Date.now() },
        },
      };
    });
  },

  deleteFolder: (folderId) => {
    set((state) => {
      const folder = state.items[folderId];
      if (!folder || folder.type !== 'folder') return state;

      // 获取所有需要删除的后代
      const descendantIds = getDescendantIds(state.items, folderId);
      const idsToDelete = [folderId, ...descendantIds];

      // 创建新的 items，排除被删除的项
      const newItems = { ...state.items };
      idsToDelete.forEach(id => delete newItems[id]);

      return { items: newItems };
    });
  },

  moveItem: (itemId, targetFolderId) => {
    const state = get();
    const item = state.items[itemId];

    if (!item) return false;

    // 检查是否移动到自己的后代文件夹
    if (item.type === 'folder' && targetFolderId) {
      if (isDescendant(state.items, itemId, targetFolderId)) {
        return false;
      }
    }

    // 检查目标是否有效
    if (targetFolderId && !state.items[targetFolderId]) {
      return false;
    }

    // 计算新的排序
    const siblings = getChildren(state.items, targetFolderId);
    const maxOrder = siblings.length > 0
      ? Math.max(...siblings.map(s => s.order ?? 0))
      : -1;

    set((state) => ({
      items: {
        ...state.items,
        [itemId]: {
          ...item,
          parentId: targetFolderId,
          order: maxOrder + 1,
          updatedAt: Date.now(),
        },
      },
    }));

    return true;
  },

  // ===== 会话项操作 =====

  createSessionItem: (parentId, sessionId, name) => {
    const itemId = generateId();
    const siblings = getChildren(get().items, parentId);
    const maxOrder = siblings.length > 0
      ? Math.max(...siblings.map(s => s.order ?? 0))
      : -1;

    const newItem: FolderItem = {
      id: itemId,
      name,
      type: 'session',
      parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: maxOrder + 1,
      sessionId,
    };

    set((state) => ({
      items: { ...state.items, [itemId]: newItem },
    }));

    return itemId;
  },

  deleteSessionItem: (itemId) => {
    set((state) => {
      const item = state.items[itemId];
      if (!item || item.type !== 'session') return state;

      const newItems = { ...state.items };
      delete newItems[itemId];

      return { items: newItems };
    });
  },

  // ===== UI 操作 =====

  toggleCollapse: (folderId) => {
    set((state) => {
      const folder = state.items[folderId];
      if (!folder || folder.type !== 'folder') return state;

      return {
        items: {
          ...state.items,
          [folderId]: { ...folder, collapsed: !folder.collapsed },
        },
      };
    });
  },

  togglePin: (itemId) => {
    set((state) => {
      const item = state.items[itemId];
      if (!item) return state;

      return {
        items: {
          ...state.items,
          [itemId]: { ...item, pinned: !item.pinned, updatedAt: Date.now() },
        },
      };
    });
  },

  expandAll: () => {
    set((state) => {
      const newItems = { ...state.items };
      Object.values(newItems)
        .filter(item => item.type === 'folder')
        .forEach(folder => {
          newItems[folder.id] = { ...folder, collapsed: false };
        });

      return { items: newItems };
    });
  },

  collapseAll: () => {
    set((state) => {
      const newItems = { ...state.items };
      Object.values(newItems)
        .filter(item => item.type === 'folder')
        .forEach(folder => {
          newItems[folder.id] = { ...folder, collapsed: true };
        });

      return { items: newItems };
    });
  },

  // ===== 排序 =====

  reorderItems: (parentId, itemIds) => {
    set((state) => {
      const newItems = { ...state.items };
      itemIds.forEach((id, index) => {
        const item = newItems[id];
        if (item && item.parentId === parentId) {
          newItems[id] = { ...item, order: index, updatedAt: Date.now() };
        }
      });

      return { items: newItems };
    });
  },

  // ===== 批量操作 =====

  importItems: (items) => {
    set({ items });
  },

  exportItems: () => {
    return get().items;
  },

  // ===== 辅助方法 =====

  getTree: () => {
    return buildTree(get().items);
  },

  getItem: (id) => {
    return get().items[id];
  },
}));
