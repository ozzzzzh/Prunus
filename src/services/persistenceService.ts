/**
 * 持久化服务
 *
 * 负责 Store 状态与 IndexedDB 的自动同步
 */

import { useSessionStore } from '../store/sessionStore';
import { useAPIConfigStore } from '../store/apiConfigStore';
import { repository } from '../repository';

// 是否启用自动保存
let autoSaveEnabled = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// 防抖保存延迟（毫秒）
const SAVE_DELAY = 500;

/**
 * 初始化持久化
 * 从 IndexedDB 加载数据到 Store
 */
export async function initPersistence(): Promise<void> {
  try {
    await repository.init();

    // 加载会话数据
    const sessions = await repository.session.getAll();
    if (sessions.length > 0) {
      const sessionsMap = sessions.reduce((acc, session) => {
        acc[session.id] = session;
        return acc;
      }, {} as Record<string, typeof sessions[0]>);

      useSessionStore.getState().importSessions(sessionsMap);
    }

    // 加载 API 配置
    const apiConfig = await repository.settings.getAPIConfig();
    if (apiConfig) {
      useAPIConfigStore.getState().updateConfig(apiConfig);
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
  const { sessions, apiConfig } = await repository.exportAll();
  return JSON.stringify({
    version: 1,
    exportedAt: Date.now(),
    sessions,
    apiConfig,
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
  await repository.settings.saveAPIConfig({
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
  });

  useSessionStore.getState().importSessions({});
  useAPIConfigStore.getState().resetConfig();

  console.log('[Persistence] All data cleared');
}