/**
 * 侧边栏组件
 *
 * 显示文件夹树形结构，支持右键菜单操作
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  FolderPlus,
  Pin,
  Plus,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  Move,
} from 'lucide-react';
import { useFolderStore } from '../../store/folderStore';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import type { TreeNode, FolderItem } from '../../types';

export default function Sidebar() {
  const [contextMenu, setContextMenu] = useState<{
    type: 'item' | 'empty';
    itemId?: string;
    x: number;
    y: number;
  } | null>(null);
  const [moveDialog, setMoveDialog] = useState<{
    itemId: string;
    itemName: string;
  } | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Store 状态
  const items = useFolderStore((state) => state.items);
  const getTree = useFolderStore((state) => state.getTree);
  const createFolder = useFolderStore((state) => state.createFolder);
  const renameItem = useFolderStore((state) => state.renameItem);
  const deleteFolder = useFolderStore((state) => state.deleteFolder);
  const moveItem = useFolderStore((state) => state.moveItem);
  const createSessionItem = useFolderStore((state) => state.createSessionItem);
  const deleteSessionItem = useFolderStore((state) => state.deleteSessionItem);
  const togglePin = useFolderStore((state) => state.togglePin);

  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const switchSession = useSessionStore((state) => state.switchSession);
  const createSession = useSessionStore((state) => state.createSession);
  const deleteSession = useSessionStore((state) => state.deleteSession);

  const toggleSettings = useUIStore((state) => state.toggleSettings);
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  // 获取树形结构并分区显示
  const { pinnedNodes, otherNodes } = useMemo(() => {
    const tree = getTree();
    const pinned: TreeNode[] = [];
    const other: TreeNode[] = [];

    tree.forEach(node => {
      if (node.pinned) {
        pinned.push(node);
      } else {
        other.push(node);
      }
    });

    return { pinnedNodes: pinned, otherNodes: other };
  }, [getTree, items]); // 添加 items 依赖，确保状态变化时重新渲染

  // 新建文件夹
  const handleCreateFolder = useCallback((parentId: string | null) => {
    createFolder(parentId, '新建文件夹');
  }, [createFolder]);

  // 新建会话
  const handleCreateSession = useCallback((parentId: string | null) => {
    const sessionId = createSession();
    const session = useSessionStore.getState().sessions[sessionId];
    createSessionItem(parentId, sessionId, session?.title || '新会话');
    switchSession(sessionId);
  }, [createSession, createSessionItem, switchSession]);

  // 重命名
  const handleRename = useCallback((itemId: string) => {
    const item = items[itemId];
    if (!item) return;

    const newName = prompt('重命名:', item.name);
    if (newName && newName.trim()) {
      renameItem(itemId, newName.trim());
      // 如果是 session 项，同步更新 sessionStore 中的 title
      if (item.type === 'session' && item.sessionId) {
        useSessionStore.getState().renameSession(item.sessionId, newName.trim());
      }
    }
  }, [items, renameItem]);

  // 删除
  const handleDelete = useCallback((itemId: string) => {
    const item = items[itemId];
    if (!item) return;

    if (item.type === 'folder') {
      if (confirm('确定要删除此文件夹及其所有内容吗？')) {
        deleteFolder(itemId);
      }
    } else {
      if (confirm('确定要删除此会话吗？')) {
        if (item.sessionId) {
          deleteSession(item.sessionId);
        }
        deleteSessionItem(itemId);
      }
    }
  }, [items, deleteFolder, deleteSession, deleteSessionItem]);

  // 移动项目
  const handleMove = useCallback((itemId: string) => {
    const item = items[itemId];
    if (!item) return;
    setMoveDialog({ itemId, itemName: item.name });
  }, [items]);

  // 执行移动
  const handleMoveTo = useCallback((targetFolderId: string | null) => {
    if (moveDialog) {
      moveItem(moveDialog.itemId, targetFolderId);
      setMoveDialog(null);
    }
  }, [moveDialog, moveItem]);

  // 置顶
  const handleTogglePin = useCallback((itemId: string) => {
    togglePin(itemId);
  }, [togglePin]);

  // 右键菜单
  const handleItemContextMenu = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ type: 'item', itemId, x: e.clientX, y: e.clientY });
  };

  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ type: 'empty', x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  // 选择会话
  const handleSelectSession = useCallback((sessionId: string) => {
    switchSession(sessionId);
  }, [switchSession]);

  // 渲染节点
  const renderNodes = (nodes: TreeNode[], depth: number) => (
    nodes.map((node) => {
      const item = items[node.id];
      const isActive = node.type === 'session' && node.sessionId === activeSessionId;
      const isFolderSelected = node.type === 'folder' && activeSessionId === null;
      const sessionTitle = node.sessionId ? useSessionStore.getState().sessions[node.sessionId]?.title : node.name;
      const hasChildren = node.children.length > 0;
      const isCollapsed = item?.collapsed ?? true;
      const isPinned = node.pinned ?? false;

      return (
        <div key={node.id}>
          {/* 主项 */}
          <div
            className={cn(
              'group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm',
              isActive || isFolderSelected ? 'bg-leaf-50 text-gray-800 font-medium' : 'text-gray-600 hover:bg-gray-50'
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (node.type === 'session' && node.sessionId) {
                handleSelectSession(node.sessionId);
              } else if (node.type === 'folder' && hasChildren) {
                // 只有非空文件夹才切换展开/折叠
                useFolderStore.getState().toggleCollapse(node.id);
              }
            }}
            onContextMenu={(e) => handleItemContextMenu(e, node.id)}
            onDoubleClick={() => {
              if (node.type === 'folder') {
                handleRename(node.id);
              }
            }}
          >
            {/* 箭头 - 空文件夹不显示 */}
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              {node.type === 'folder' && hasChildren ? (
                isCollapsed ? (
                  <ChevronRight size={14} className="text-gray-400" />
                ) : (
                  <ChevronDown size={14} className="text-gray-400" />
                )
              ) : null}
            </span>

            {/* 图标 */}
            {node.type === 'folder' ? (
              !isCollapsed ? (
                <FolderOpen
                  size={16}
                  className={cn(
                    'flex-shrink-0',
                    isActive || isFolderSelected ? 'text-leaf-600' : 'text-gray-800'
                  )}
                />
              ) : (
                <Folder
                  size={16}
                  className={cn(
                    'flex-shrink-0',
                    isActive || isFolderSelected ? 'text-leaf-600' : 'text-gray-800'
                  )}
                />
              )
            ) : (
              <MessageSquare
                size={16}
                className={cn('flex-shrink-0', isActive ? 'text-leaf-600' : 'text-gray-300')}
              />
            )}

            {/* 名称 */}
            <span className="flex-1 truncate">{node.type === 'session' ? sessionTitle : node.name}</span>

            {/* 置顶标记 */}
            {isPinned && <Pin size={12} className="text-leaf-500 flex-shrink-0" />}
          </div>

          {/* 子项 - 只有非空文件夹且展开时才显示 */}
          {node.type === 'folder' && !isCollapsed && hasChildren && (
            <div>
              {renderNodes(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    })
  );

  // 获取可移动的目标文件夹列表
  const getMoveTargets = (itemId: string) => {
    const item = items[itemId];
    if (!item) return [];

    const targets: { id: string | null; name: string; depth: number }[] = [
      { id: null, name: '根目录', depth: 0 }
    ];

    const addFolders = (nodes: TreeNode[], depth: number) => {
      nodes.forEach(node => {
        if (node.type === 'folder' && node.id !== itemId) {
          if (item.type === 'folder') {
            let isChild = false;
            let currentId: string | null = node.id;
            while (currentId) {
              if (currentId === itemId) {
                isChild = true;
                break;
              }
              currentId = items[currentId]?.parentId ?? null;
            }
            if (isChild) return;
          }
          targets.push({ id: node.id, name: node.name, depth });
          const childItem = items[node.id];
          if (!childItem?.collapsed) {
            addFolders(node.children, depth + 1);
          }
        }
      });
    };

    const tree = getTree();
    addFolders(tree, 1);

    return targets;
  };

  return (
    <div
      className={cn(
        'absolute left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out z-10',
        sidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
      )}
    >
      {/* Logo 区域 */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-gray-100">
        <h1
          className="text-lg font-bold flex items-center gap-2 cursor-pointer group"
          onClick={() => useUIStore.getState().setCurrentPage('fileManager')}
          title="打开文件管理"
        >
          <img src="/src/assets/PrunusLogoHighQuality.jpg" alt="Prunus Logo" className="w-6 h-6 rounded-full object-cover" />
          <span className="flex">
            {['P', 'r', 'u', 'n', 'u', 's'].map((letter, index) => (
              <span
                key={index}
                className="text-gray-800 transition-colors duration-200 group-hover:text-leaf-500"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                {letter}
              </span>
            ))}
          </span>
        </h1>
        <button
          onClick={() => toggleSidebar(true)}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          title="收起侧边栏"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* 文件树区域 */}
      <div
        className="flex-1 overflow-y-auto p-2 custom-scrollbar"
        onContextMenu={handleEmptyContextMenu}
        onClick={closeContextMenu}
      >
        {/* 置顶项 */}
        {pinnedNodes.length > 0 && (
          <>
            <div className="space-y-0.5">{renderNodes(pinnedNodes, 0)}</div>
            <div className="border-t border-gray-200 my-2" />
          </>
        )}

        {/* 其他项 */}
        {otherNodes.length > 0 && (
          <div className="space-y-0.5">{renderNodes(otherNodes, 0)}</div>
        )}

        {/* 空状态 */}
        {pinnedNodes.length === 0 && otherNodes.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-6 px-4 py-4">
            还没有任何内容<br />右键创建文件夹或会话
          </div>
        )}
      </div>

      {/* 底部区域 */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={() => toggleSettings(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
        <div className="text-[11px] text-gray-400 text-center mt-2">
          Prunus Core v0.1.21
        </div>
      </div>

      {/* 右键菜单 - 项目 */}
      {contextMenu?.type === 'item' && contextMenu.itemId && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          item={items[contextMenu.itemId]}
          onRename={() => handleRename(contextMenu.itemId!)}
          onDelete={() => handleDelete(contextMenu.itemId!)}
          onMove={() => handleMove(contextMenu.itemId!)}
          onTogglePin={() => handleTogglePin(contextMenu.itemId!)}
          onCreateFolder={() => handleCreateFolder(contextMenu.itemId!)}
          onCreateSession={() => handleCreateSession(contextMenu.itemId!)}
        />
      )}

      {/* 右键菜单 - 空白处 */}
      {contextMenu?.type === 'empty' && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onCreateFolder={() => handleCreateFolder(null)}
          onCreateSession={() => handleCreateSession(null)}
        />
      )}

      {/* 移动对话框 */}
      {moveDialog && (
        <MoveDialog
          itemName={moveDialog.itemName}
          targets={getMoveTargets(moveDialog.itemId)}
          onMove={handleMoveTo}
          onClose={() => setMoveDialog(null)}
        />
      )}
    </div>
  );
}

// 右键菜单组件
function ContextMenu({
  x,
  y,
  onClose,
  item,
  onRename,
  onDelete,
  onMove,
  onTogglePin,
  onCreateFolder,
  onCreateSession,
}: {
  x: number;
  y: number;
  onClose: () => void;
  item?: FolderItem;
  onRename?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onTogglePin?: () => void;
  onCreateFolder?: () => void;
  onCreateSession?: () => void;
}) {
  return (
    <div
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 文件夹专属选项 */}
      {item?.type === 'folder' && (
        <>
          {onCreateFolder && (
            <button
              onClick={() => { onCreateFolder(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Plus size={14} />
              新建子文件夹
            </button>
          )}
          {onCreateSession && (
            <button
              onClick={() => { onCreateSession(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <MessageSquare size={14} />
              新建会话
            </button>
          )}
          <div className="border-t border-gray-100 my-1" />
        </>
      )}

      {/* 通用选项 */}
      {item && (
        <>
          {onTogglePin && (
            <button
              onClick={() => { onTogglePin(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Pin size={14} />
              {item.pinned ? '取消置顶' : '置顶'}
            </button>
          )}
          {onMove && (
            <button
              onClick={() => { onMove(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Move size={14} />
              移动到...
            </button>
          )}
          {onRename && (
            <button
              onClick={() => { onRename(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Pencil size={14} />
              重命名
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              删除
            </button>
          )}
        </>
      )}

      {/* 空白处选项 */}
      {!item && (
        <>
          {onCreateFolder && (
            <button
              onClick={() => { onCreateFolder(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FolderPlus size={14} />
              新建文件夹
            </button>
          )}
          {onCreateSession && (
            <button
              onClick={() => { onCreateSession(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Plus size={14} />
              新建会话
            </button>
          )}
        </>
      )}
    </div>
  );
}

// 移动对话框组件
function MoveDialog({
  itemName,
  targets,
  onMove,
  onClose,
}: {
  itemName: string;
  targets: { id: string | null; name: string; depth: number }[];
  onMove: (targetId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-72 max-h-96 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-medium text-gray-800">移动「{itemName}」</h3>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {targets.map((target) => (
            <button
              key={target.id ?? 'root'}
              onClick={() => onMove(target.id)}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-leaf-50 hover:text-leaf-700 transition-colors"
              style={{ paddingLeft: `${target.depth * 16 + 16}px` }}
            >
              <Folder size={14} className="text-leaf-600" />
              <span>{target.name}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}