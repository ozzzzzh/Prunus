/**
 * 持久化服务
 *
 * 负责 Store 状态与 IndexedDB 的自动同步
 */

import { useSessionStore } from '../store/sessionStore';
import { useAPIConfigStore } from '../store/apiConfigStore';
import { useFolderStore } from '../store/folderStore';
import { repository } from '../repository';

// 是否启用自动保存
let autoSaveEnabled = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// 防抖保存延迟（毫秒）
const SAVE_DELAY = 500;

/**
 * 初始化持久化
 * 从 IndexedDB 加载数据到 Store
 * 首次访问显示空状态引导，不自动加载 example.json
 */
export async function initPersistence(): Promise<void> {
  try {
    await repository.init();

    // 加载会话数据
    const sessions = await repository.session.getAll();

    if (sessions.length > 0) {
      // IndexedDB 有数据，加载到 store
      const sessionsMap = sessions.reduce((acc, session) => {
        acc[session.id] = session;
        return acc;
      }, {} as Record<string, typeof sessions[0]>);

      useSessionStore.getState().importSessions(sessionsMap);
    }
    // 如果 IndexedDB 为空，保持 store 的空会话状态，不自动加载 example.json

    // 加载文件夹数据
    const folderItems = await repository.folder.getAll();
    if (folderItems.length > 0 && sessions.length > 0) {
      const folderMap = folderItems.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {} as Record<string, typeof folderItems[0]>);

      useFolderStore.getState().importItems(folderMap);
    }

    console.log('[Persistence] Initialized successfully');
  } catch (error) {
    console.error('[Persistence] Failed to initialize:', error);
  }
}

/**
 * 保存所有数据到 IndexedDB
 */
export async function saveAll(): Promise<void> {
  try {
    const sessions = Object.values(useSessionStore.getState().sessions);
    await repository.session.saveAll(sessions);

    const apiConfig = useAPIConfigStore.getState().config;
    await repository.settings.saveAPIConfig(apiConfig);

    const folderItems = Object.values(useFolderStore.getState().items);
    await repository.folder.saveAll(folderItems);

    console.log('[Persistence] Saved successfully');
  } catch (error) {
    console.error('[Persistence] Failed to save:', error);
  }
}

/**
 * 防抖保存
 */
export function debouncedSave(): void {
  if (!autoSaveEnabled) return;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(() => {
    saveAll();
    saveDebounceTimer = null;
  }, SAVE_DELAY);
}

/**
 * 启用自动保存
 * 监听 Store 变化，自动持久化
 */
export function enableAutoSave(): void {
  if (autoSaveEnabled) return;

  autoSaveEnabled = true;

  // 监听 SessionStore 变化
  useSessionStore.subscribe((state, prevState) => {
    // 检查是否有变化
    if (state.sessions !== prevState.sessions ||
        state.activeSessionId !== prevState.activeSessionId) {
      debouncedSave();
    }
  });

  // 监听 APIConfigStore 变化
  useAPIConfigStore.subscribe((state, prevState) => {
    if (state.config !== prevState.config) {
      debouncedSave();
    }
  });

  // 监听 FolderStore 变化
  useFolderStore.subscribe((state, prevState) => {
    if (state.items !== prevState.items) {
      debouncedSave();
    }
  });

  console.log('[Persistence] Auto-save enabled');
}

/**
 * 禁用自动保存
 */
export function disableAutoSave(): void {
  autoSaveEnabled = false;
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  console.log('[Persistence] Auto-save disabled');
}

/**
 * 导出所有数据为 JSON
 */
export async function exportToJSON(): Promise<string> {
  const { sessions, apiConfig, folderItems } = await repository.exportAll();
  return JSON.stringify({
    version: 2,
    exportedAt: Date.now(),
    sessions,
    apiConfig,
    folderItems,
  }, null, 2);
}

/**
 * 从 JSON 导入数据
 */
export async function importFromJSON(json: string): Promise<void> {
  try {
    const data = JSON.parse(json);

    if (!data.sessions) {
      throw new Error('Invalid import data: missing sessions');
    }

    await repository.importAll({
      sessions: data.sessions,
      apiConfig: data.apiConfig,
      folderItems: data.folderItems || [],
    });

    // 重新初始化以加载导入的数据
    await initPersistence();

    console.log('[Persistence] Imported successfully');
  } catch (error) {
    console.error('[Persistence] Failed to import:', error);
    throw error;
  }
}

/**
 * 清除所有持久化数据
 */
export async function clearAllData(): Promise<void> {
  await repository.session.clear();
  await repository.folder.clear();

  useSessionStore.getState().importSessions({});
  useFolderStore.getState().importItems({});
  useAPIConfigStore.getState().resetConfig();

  console.log('[Persistence] All data cleared');
}
