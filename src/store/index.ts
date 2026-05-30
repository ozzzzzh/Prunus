/**
 * Prunus 状态管理入口
 *
 * 导出所有 Store，并提供向后兼容的统一入口
 */

// 新的拆分 Store
export { useSessionStore, type ChatSession } from './sessionStore';
export { useUIStore } from './uiStore';
export { useAPIConfigStore, type APIConfig } from './apiConfigStore';
export { useGenerationStore } from './generationStore';

// 向后兼容：统一 Store（内部组合使用拆分 Store）
export { useChatStore } from './chatStore';
