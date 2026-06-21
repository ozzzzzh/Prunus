/**
 * IndexedDB 工具类
 *
 * 封装 IndexedDB 操作，提供简洁的 API
 */

const DB_NAME = 'prunus-db';
const DB_VERSION = 2;

// Store 名称
export const STORES = {
  SESSIONS: 'sessions',
  NODES: 'nodes',
  SETTINGS: 'settings',
  FOLDERS: 'folders',
} as const;

/**
 * 打开数据库连接
 */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建 sessions store
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const sessionStore = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        sessionStore.createIndex('createdAt', 'createdAt', { unique: false });
        sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 创建 nodes store（用于存储单个节点）
      if (!db.objectStoreNames.contains(STORES.NODES)) {
        const nodeStore = db.createObjectStore(STORES.NODES, { keyPath: 'id' });
        nodeStore.createIndex('sessionId', 'sessionId', { unique: false });
        nodeStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 创建 settings store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // 创建 folders store
      if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
        const folderStore = db.createObjectStore(STORES.FOLDERS, { keyPath: 'id' });
        folderStore.createIndex('parentId', 'parentId', { unique: false });
        folderStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

// 缓存数据库连接
let dbInstance: IDBDatabase | null = null;

/**
 * 获取数据库实例（单例）
 */
export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDatabase();
  return dbInstance;
}

/**
 * 通用事务操作
 */
async function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 保存数据
 */
export async function saveData<T>(storeName: string, data: T): Promise<void> {
  await transaction(storeName, 'readwrite', (store) => store.put(data));
}

/**
 * 获取单条数据
 */
export async function getData<T>(storeName: string, key: string): Promise<T | undefined> {
  return transaction(storeName, 'readonly', (store) => store.get(key));
}

/**
 * 获取所有数据
 */
export async function getAllData<T>(storeName: string): Promise<T[]> {
  return transaction(storeName, 'readonly', (store) => store.getAll());
}

/**
 * 删除数据
 */
export async function deleteData(storeName: string, key: string): Promise<void> {
  await transaction(storeName, 'readwrite', (store) => store.delete(key));
}

/**
 * 清空 store
 */
export async function clearStore(storeName: string): Promise<void> {
  await transaction(storeName, 'readwrite', (store) => store.clear());
}

/**
 * 批量保存数据
 */
export async function saveBatch<T>(storeName: string, items: T[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    for (const item of items) {
      store.put(item);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 按索引查询
 */
export async function queryByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
