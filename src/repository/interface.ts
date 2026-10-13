/**
 * Repository 接口定义
 *
 * 定义数据访问层的抽象接口，支持后续切换数据源
 */

import type { ChatSession } from '../store/sessionStore';
import type { APIConfig } from '../store/apiConfigStore';
import type { FolderItem, PdfDocumentRecord } from '../types';

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
 * 文件夹 Repository 接口
 */
export interface IFolderRepository {
  // CRUD
  getById(id: string): Promise<FolderItem | null>;
  getAll(): Promise<FolderItem[]>;
  save(item: FolderItem): Promise<void>;
  delete(id: string): Promise<void>;

  // 批量操作
  saveAll(items: FolderItem[]): Promise<void>;
  clear(): Promise<void>;

  // 查询
  getByParentId(parentId: string | null): Promise<FolderItem[]>;
}

/**
 * PDF 文档 Repository 接口（微应用「PDF 阅读器」）
 *
 * 刻意不复用 saveAll 语义：文档是几 MB 级的二进制，既不该被防抖保存
 * 反复整表重写，也**绝不进入 JSON 导出**（导出只带 docId 引用，换设备按 hash 重新关联）。
 */
export interface IPdfDocumentRepository {
  /**
   * 文件是否已在本机。
   *
   * 用 getKey 而不是 get：只关心"在不在"却把几 MB 的 blob 读进内存是没必要的开销。
   */
  has(docId: string): Promise<boolean>;
  get(docId: string): Promise<PdfDocumentRecord | null>;
  save(record: PdfDocumentRecord): Promise<void>;
  delete(docId: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * 数据持久化接口（组合）
 */
export interface IPersistenceRepository {
  session: ISessionRepository;
  settings: ISettingsRepository;
  folder: IFolderRepository;
  pdf: IPdfDocumentRepository;

  // 初始化
  init(): Promise<void>;

  // 导入导出
  exportAll(): Promise<{
    sessions: ChatSession[];
    apiConfig: APIConfig | null;
    folderItems: FolderItem[];
  }>;
  importAll(data: {
    sessions: ChatSession[];
    apiConfig?: APIConfig;
    folderItems?: FolderItem[];
  }): Promise<void>;
}