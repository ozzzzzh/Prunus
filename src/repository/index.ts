/**
 * Repository 层入口
 */

export type {
  ISessionRepository,
  ISettingsRepository,
  IPersistenceRepository,
} from './interface';

export {
  IndexedDBRepository,
  IndexedDBSessionRepository,
  IndexedDBSettingsRepository,
} from './indexedDBRepository';

// 默认使用 IndexedDB Repository
import { IndexedDBRepository } from './indexedDBRepository';
export const repository = new IndexedDBRepository();
