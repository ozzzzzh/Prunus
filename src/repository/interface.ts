/**
 * Repository 接口定义
 *
 * 定义数据访问层的抽象接口，支持后续切换数据源
 */

import type { ChatSession } from '../store/sessionStore';
import type { APIConfig } from '../store/apiConfigStore';

/**
 * 会话 Repository 接口
 */
export interface ISessionRepository {
  // CRUD
  getById(id: string): Promise<ChatSession | null>;
  getAll(): Promise<ChatSession[]>;
  save(session: ChatSession): Promise<void>;
  delete(id: string): Promise<void>;

  // 批量操作
  saveAll(sessions: ChatSession[]): Promise<void>;
  clear(): Promise<void>;
}

/**
 * 设置 Repository 接口
 */
export interface ISettingsRepository {
  getAPIConfig(): Promise<APIConfig | null>;
  saveAPIConfig(config: APIConfig): Promise<void>;
  getSetting<T>(key: string): Promise<T | null>;
  saveSetting<T>(key: string, value: T): Promise<void>;
}

/**
 * 数据持久化接口（组合）
 */
export interface IPersistenceRepository {
  session: ISessionRepository;
  settings: ISettingsRepository;

  // 初始化
  init(): Promise<void>;

  // 导入导出
  exportAll(): Promise<{
    sessions: ChatSession[];
    apiConfig: APIConfig | null;
  }>;
  importAll(data: {
    sessions: ChatSession[];
    apiConfig?: APIConfig;
  }): Promise<void>;
}