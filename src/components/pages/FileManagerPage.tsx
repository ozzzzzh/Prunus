/**
 * 文件管理页面
 *
 * 全屏文件管理界面，支持网格/列表视图、文件夹导航、置顶
 */

import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Folder,
  MessageSquare,
  Plus,
  FolderPlus,
  Grid,
  List,
  MoreVertical,
  Pencil,
  Trash2,
  ChevronRight,
  Home,
  Pin,
} from 'lucide-react';
import { useFolderStore } from '../../store/folderStore';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import type { FolderItem } from '../../types';

type ViewMode = 'grid' | 'list';
type SortMode = 'name' | 'date';

export default function FileManagerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid'); // 默认网格视图
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Store 状态
  const items = useFolderStore((state) => state.items);
  const createFolder = useFolderStore((state) => state.createFolder);
  const renameFolder = useFolderStore((state) => state.renameFolder);
  const deleteFolder = useFolderStore((state) => state.deleteFolder);
  const createSessionItem = useFolderStore((state) => state.createSessionItem);
  const deleteSessionItem = useFolderStore((state) => state.deleteSessionItem);
  const togglePin = useFolderStore((state) => state.togglePin);

  const createSession = useSessionStore((state) => state.createSession);
  const deleteSession = useSessionStore((state) => state.deleteSession);
  const sessions = useSessionStore((state) => state.sessions);
  const switchSession = useSessionStore((state) => state.switchSession);

  const setCurrentPage = useUIStore((state) => state.setCurrentPage);

  // 获取面包屑路径
  const breadcrumbs = useMemo(() => {
    const path: { id: string | null; name: string }[] = [{ id: null, name: '根目录' }];
    if (currentFolderId) {
      let currentId: string | null = currentFolderId;
      const tempPath: { id: string; name: string }[] = [];

      while (currentId) {
        const item = items[currentId];
        if (item) {
          tempPath.unshift({ id: currentId, name: item.name });
          currentId = item.parentId;
        } else {
          break;
        }
      }

      path.push(...tempPath);
    }
    return path;
  }, [currentFolderId, items]);

  // 获取当前文件夹的子项
  const currentItems = useMemo(() => {
    const children = Object.values(items).filter((item) => item.parentId === currentFolderId);

    return children.sort((a, b) => {
      // 1. 文件夹优先（文件夹排在会话前面）
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      // 2. 同类型中置顶优先
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      // 3. 按名称或时间排序
      switch (sortMode) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
        default:
          return b.updatedAt - a.updatedAt;
      }
    });
  }, [items, currentFolderId, sortMode]);

  // 新建文件夹
  const handleCreateFolder = () => {
    createFolder(currentFolderId, '新建文件夹');
  };

  // 新建会话
  const handleCreateSession = () => {
    const sessionId = createSession();
    const session = useSessionStore.getState().sessions[sessionId];
    createSessionItem(currentFolderId, sessionId, session?.title || '新会话');
  };

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  // 重命名
  const handleRename = (id: string) => {
    const item = items[id];
    if (!item) return;

    const newName = prompt('重命名:', item.name);
    if (newName && newName.trim()) {
      renameFolder(id, newName.trim());
    }
    setContextMenu(null);
  };

  // 删除单个
  const handleDelete = (id: string) => {
    const item = items[id];
    if (!item) return;

    if (item.type === 'folder') {
      if (confirm('确定要删除此文件夹及其所有内容吗？')) {
        deleteFolder(id);
      }
    } else {
      if (confirm('确定要删除此会话吗？')) {
        if (item.sessionId) {
          deleteSession(item.sessionId);
        }
        deleteSessionItem(id);
      }
    }
    setContextMenu(null);
  };

  // 置顶
  const handleTogglePin = (id: string) => {
    togglePin(id);
    setContextMenu(null);
  };

  // 打开项目
  const handleOpenItem = (item: FolderItem) => {
    if (item.type === 'folder') {
      setCurrentFolderId(item.id);
    } else if (item.sessionId) {
      switchSession(item.sessionId);
      setCurrentPage('canvas');
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentPage('canvas')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="返回画布"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <img src="/src/assets/PrunusLogoHighQuality.jpg" alt="Prunus Logo" className="w-7 h-7 rounded-full object-cover" />
                <span>文件管理</span>
              </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateFolder}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FolderPlus size={18} />
              <span>新建文件夹</span>
            </button>
            <button
              onClick={handleCreateSession}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-leaf-600 hover:bg-leaf-700 text-white rounded-lg transition-colors"
            >
              <Plus size={18} />
              <span>新建会话</span>
            </button>
          </div>
        </div>
      </div>

      {/* 面包屑导航 + 视图/排序工具栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-2">
        <div className="flex items-center justify-between">
          {/* 面包屑 */}
          <div className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id ?? 'root'} className="flex items-center">
                {index > 0 && <ChevronRight size={14} className="text-gray-400 mx-1" />}
                <button
                  onClick={() => setCurrentFolderId(crumb.id)}
                  className={cn(
                    'px-2 py-1 rounded transition-colors',
                    index === breadcrumbs.length - 1
                      ? 'text-leaf-700 font-medium bg-leaf-50'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {index === 0 ? <Home size={14} /> : crumb.name}
                </button>
              </div>
            ))}
          </div>

          {/* 视图/排序工具 */}
          <div className="flex items-center gap-2">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="date">按时间排序</option>
              <option value="name">按名称排序</option>
            </select>

            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                )}
                title="网格视图"
              >
                <Grid size={16} className="text-gray-600" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                )}
                title="列表视图"
              >
                <List size={16} className="text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 文件列表区域 */}
      <div className="flex-1 overflow-auto p-6">
        {currentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Folder size={64} className="mb-4 opacity-30" />
            <p className="text-lg mb-2">当前文件夹为空</p>
            <p className="text-sm">点击上方按钮创建文件夹或会话</p>
          </div>
        ) : viewMode === 'list' ? (
          /* 列表视图 */
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    名称
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 w-24">
                    类型
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 w-32">
                    修改时间
                  </th>
                  <th className="w-12 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleOpenItem(item)}
                    onContextMenu={(e) => handleContextMenu(e, item.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.type === 'folder' ? (
                          <Folder size={18} className="text-gray-400" />
                        ) : (
                          <MessageSquare size={18} className="text-gray-400" />
                        )}
                        <span className="text-sm text-gray-800 truncate max-w-xs">
                          {item.type === 'session' && item.sessionId
                            ? sessions[item.sessionId]?.title || item.name
                            : item.name}
                        </span>
                        {item.pinned && (
                          <Pin size={12} className="text-leaf-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {item.type === 'folder' ? '文件夹' : '会话'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContextMenu(e, item.id);
                        }}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <MoreVertical size={16} className="text-gray-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* 网格视图 - 无边框卡片风格 */
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {currentItems.map((item) => (
              <div
                key={item.id}
                className="group relative flex flex-col items-center p-4 rounded-lg cursor-pointer transition-all hover:bg-gray-100"
                onClick={() => handleOpenItem(item)}
                onContextMenu={(e) => handleContextMenu(e, item.id)}
              >
                {/* 右上角菜单按钮 - hover时显示 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, item.id);
                  }}
                  className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-all"
                >
                  <MoreVertical size={14} className="text-gray-500" />
                </button>

                {/* 置顶标记 */}
                {item.pinned && (
                  <Pin size={14} className="absolute top-2 left-2 text-leaf-500" />
                )}

                {/* 图标 */}
                <div className="mb-3">
                  {item.type === 'folder' ? (
                    <Folder size={48} className="text-gray-400" strokeWidth={1.5} />
                  ) : (
                    <MessageSquare size={48} className="text-gray-400" strokeWidth={1.5} />
                  )}
                </div>

                {/* 名称 */}
                <p className="text-sm text-gray-700 text-center line-clamp-2 max-w-full">
                  {item.type === 'session' && item.sessionId
                    ? sessions[item.sessionId]?.title || item.name
                    : item.name}
                </p>

                {/* 日期 */}
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(item.updatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleTogglePin(contextMenu.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Pin size={14} />
              {items[contextMenu.id]?.pinned ? '取消置顶' : '置顶'}
            </button>
            <button
              onClick={() => handleRename(contextMenu.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Pencil size={14} />
              重命名
            </button>
            <button
              onClick={() => handleDelete(contextMenu.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
