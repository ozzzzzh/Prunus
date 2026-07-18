/**
 * IndexedDB Repository 实现
 *
 * 使用 IndexedDB 进行本地数据持久化
 */

import type { ChatSession } from '../store/sessionStore';
import type { APIConfig } from '../store/apiConfigStore';
import type { FolderItem } from '../types';
import type {
  ISessionRepository,
  ISettingsRepository,
  IFolderRepository,
  IPersistenceRepository,
} from './interface';
import {
  getDB,
  saveData,
  getData,
  getAllData,
  deleteData,
  clearStore,
  saveBatch,
  queryByIndex,
  STORES,
} from '../utils/indexedDB';

/**
 * 会话 Repository - IndexedDB 实现
 */
export class IndexedDBSessionRepository implements ISessionRepository {
  async getById(id: string): Promise<ChatSession | null> {
    const session = await getData<ChatSession>(STORES.SESSIONS, id);
    return session || null;
  }

  async getAll(): Promise<ChatSession[]> {
    return getAllData<ChatSession>(STORES.SESSIONS);
  }

  async save(session: ChatSession): Promise<void> {
    await saveData(STORES.SESSIONS, session);
  }

  async delete(id: string): Promise<void> {
    await deleteData(STORES.SESSIONS, id);
  }

  async saveAll(sessions: ChatSession[]): Promise<void> {
    // 先清空再保存，确保删除的 session 不会残留
    await clearStore(STORES.SESSIONS);
    await saveBatch(STORES.SESSIONS, sessions);
  }

  async clear(): Promise<void> {
    await clearStore(STORES.SESSIONS);
  }
}

/**
 * 设置 Repository - IndexedDB 实现
 */
export class IndexedDBSettingsRepository implements ISettingsRepository {
  private static API_CONFIG_KEY = 'apiConfig';

  async getAPIConfig(): Promise<APIConfig | null> {
    const config = await getData<{ key: string; value: APIConfig }>(
      STORES.SETTINGS,
      IndexedDBSettingsRepository.API_CONFIG_KEY
    );
    return config?.value || null;
  }

  async saveAPIConfig(config: APIConfig): Promise<void> {
    await saveData(STORES.SETTINGS, {
      key: IndexedDBSettingsRepository.API_CONFIG_KEY,
      value: config,
    });
  }

  async getSetting<T>(key: string): Promise<T | null> {
    const setting = await getData<{ key: string; value: T }>(STORES.SETTINGS, key);
    return setting?.value || null;
  }

  async saveSetting<T>(key: string, value: T): Promise<void> {
    await saveData(STORES.SETTINGS, { key, value });
  }
}

/**
 * 文件夹 Repository - IndexedDB 实现
 */
export class IndexedDBFolderRepository implements IFolderRepository {
  async getById(id: string): Promise<FolderItem | null> {
    const item = await getData<FolderItem>(STORES.FOLDERS, id);
    return item || null;
  }

  async getAll(): Promise<FolderItem[]> {
    return getAllData<FolderItem>(STORES.FOLDERS);
  }

  async save(item: FolderItem): Promise<void> {
    await saveData(STORES.FOLDERS, item);
  }

  async delete(id: string): Promise<void> {
    await deleteData(STORES.FOLDERS, id);
  }

  async saveAll(items: FolderItem[]): Promise<void> {
    await clearStore(STORES.FOLDERS);
    await saveBatch(STORES.FOLDERS, items);
  }

  async clear(): Promise<void> {
    await clearStore(STORES.FOLDERS);
  }

  async getByParentId(parentId: string | null): Promise<FolderItem[]> {
    if (parentId === null) {
      // 获取根目录项
      const all = await this.getAll();
      return all.filter(item => item.parentId === null);
    }
    return queryByIndex<FolderItem>(STORES.FOLDERS, 'parentId', parentId);
  }
}

/**
 * 组合 Repository - IndexedDB 实现
 */
export class IndexedDBRepository implements IPersistenceRepository {
  session: ISessionRepository;
  settings: ISettingsRepository;
  folder: IFolderRepository;

  constructor() {
    this.session = new IndexedDBSessionRepository();
    this.settings = new IndexedDBSettingsRepository();
    this.folder = new IndexedDBFolderRepository();
  }

  async init(): Promise<void> {
    // 确保 IndexedDB 已初始化
    await getDB();
  }

  async exportAll(): Promise<{
    sessions: ChatSession[];
    apiConfig: APIConfig | null;
    folderItems: FolderItem[];
  }> {
    const sessions = await this.session.getAll();
    const apiConfig = await this.settings.getAPIConfig();
    const folderItems = await this.folder.getAll();
    return { sessions, apiConfig, folderItems };
  }

  async importAll(data: {
    sessions: ChatSession[];
    apiConfig?: APIConfig;
    folderItems?: FolderItem[];
  }): Promise<void> {
    await this.session.clear();
    await this.session.saveAll(data.sessions);
    if (data.apiConfig) {
      await this.settings.saveAPIConfig(data.apiConfig);
    }
    if (data.folderItems) {
      await this.folder.clear();
      await this.folder.saveAll(data.folderItems);
    }
  }
}