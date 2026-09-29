/**
 * IndexedDB 工具类
 *
 * 封装 IndexedDB 操作，提供简洁的 API
 */

const DB_NAME = 'prunus-db';
// 3：加 pdfDocs（微应用「PDF 阅读器」的文档库）。升级逻辑见下方 onupgradeneeded，
// 每个 store 都有 contains 守卫，所以老用户升级上来不会丢任何数据。
const DB_VERSION = 3;

// Store 名称
export const STORES = {
  SESSIONS: 'sessions',
  NODES: 'nodes',
  SETTINGS: 'settings',
  FOLDERS: 'folders',
  /** PDF 阅读器打开的文档（含文件本体）。keyPath 就是内容哈希，所以按 hash 查 = 按 id 查 */
  PDF_DOCS: 'pdfDocs',
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

    /**
     * 版本升级被别的标签页挡住。
     *
     * 老连接不关掉升级就没法进行，而**不处理 onblocked 的话这个请求永远不 settle** ——
     * 表现是 initPersistence 一直挂着、应用卡在 Loading...，既没报错也没提示，很难查。
     * 宁可明确失败：告诉用户关掉多余的标签页。
     */
    request.onblocked = () => {
      reject(new Error('本地数据库正在被其它 Prunus 标签页占用，请关闭多余标签页后刷新'));
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

      // 创建 pdfDocs store（DB v3 新增）
      // keyPath 用 docId，而 docId 就是文件内容指纹 —— 因此"按 hash 找文档"
      // 直接 get(docId) 即可，不需要额外索引。
      if (!db.objectStoreNames.contains(STORES.PDF_DOCS)) {
        db.createObjectStore(STORES.PDF_DOCS, { keyPath: 'docId' });
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
 * 判断某个键是否存在。
 *
 * 用 getKey 而不是 get：后者会把整条记录（对 PDF 文档来说是几 MB 的 blob）
 * 反序列化进内存，而调用方往往只想知道"在不在"。
 */
export async function hasData(storeName: string, key: string): Promise<boolean> {
  const result = await transaction<IDBValidKey | undefined>(storeName, 'readonly', (store) =>
    store.getKey(key)
  );
  return result !== undefined;
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
