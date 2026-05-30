/**
 * 数据迁移模块
 *
 * 负责将旧版本数据格式转换为新版本格式
 * 保持向后兼容性
 */

import type { PrunusNode, AIChatNode, NodeType, NodeMarker } from '../types/node';
import type { Session } from '../types/session';

/**
 * 旧版本节点类型（用于迁移）
 */
export interface LegacyNode {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  marker?: string;
  collapsed?: boolean;
}

/**
 * 旧版本会话类型（用于迁移）
 */
export interface LegacySession {
  id: string;
  title: string;
  nodes: Record<string, LegacyNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  createdAt: number;
  pinned?: boolean;
}

/**
 * 当前数据版本号
 */
export const CURRENT_VERSION = 1;

/**
 * 检测数据版本
 */
export function detectVersion(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;

  const obj = data as Record<string, unknown>;

  // 如果有 version 字段，直接返回
  if (typeof obj.version === 'number') {
    return obj.version;
  }

  // 检测旧版本特征
  if (obj.sessions && typeof obj.sessions === 'object') {
    const sessions = obj.sessions as Record<string, LegacySession>;
    const firstSession = Object.values(sessions)[0];

    if (firstSession?.nodes) {
      const firstNode = Object.values(firstSession.nodes)[0];
      // 旧版本节点有 role 字段但没有 type 字段
      if (firstNode && 'role' in firstNode && !('type' in firstNode)) {
        return 0;
      }
    }
  }

  return CURRENT_VERSION;
}

/**
 * 迁移单个旧版节点到新版节点
 */
export function migrateNode(legacyNode: LegacyNode): AIChatNode {
  return {
    id: legacyNode.id,
    parentId: legacyNode.parentId,
    childrenIds: legacyNode.childrenIds,
    type: 'ai-chat',
    role: legacyNode.role,
    title: undefined,
    content: legacyNode.content,
    metadata: {},
    createdAt: legacyNode.timestamp,
    updatedAt: legacyNode.timestamp,
    collapsed: legacyNode.collapsed,
    marker: legacyNode.marker as NodeMarker | undefined,
  };
}

/**
 * 迁移单个旧版会话到新版会话
 */
export function migrateSession(legacySession: LegacySession): Session {
  const migratedNodes: Record<string, PrunusNode> = {};

  for (const [nodeId, node] of Object.entries(legacySession.nodes)) {
    migratedNodes[nodeId] = migrateNode(node);
  }

  return {
    id: legacySession.id,
    title: legacySession.title,
    nodes: migratedNodes,
    rootNodeId: legacySession.rootNodeId,
    currentNodeId: legacySession.currentNodeId,
    createdAt: legacySession.createdAt,
    updatedAt: legacySession.createdAt,
    pinned: legacySession.pinned,
    tags: [],
    metadata: {},
  };
}

/**
 * 迁移整个数据结构
 */
export function migrateData(legacyData: {
  sessions: Record<string, LegacySession>;
  activeSessionId: string | null;
}): {
  version: number;
  sessions: Record<string, Session>;
  activeSessionId: string | null;
} {
  const migratedSessions: Record<string, Session> = {};

  for (const [sessionId, session] of Object.entries(legacyData.sessions)) {
    migratedSessions[sessionId] = migrateSession(session);
  }

  return {
    version: CURRENT_VERSION,
    sessions: migratedSessions,
    activeSessionId: legacyData.activeSessionId,
  };
}

/**
 * 创建默认的 AI 对话节点
 */
export function createAIChatNode(params: {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  marker?: NodeMarker;
}): AIChatNode {
  const now = Date.now();
  return {
    id: params.id,
    parentId: params.parentId,
    childrenIds: [],
    type: 'ai-chat',
    role: params.role,
    content: params.content,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    marker: params.marker,
  };
}

/**
 * 创建根节点（新会话的起始节点）
 */
export function createRootNode(id: string): AIChatNode {
  return createAIChatNode({
    id,
    parentId: null,
    role: 'system',
    content: 'Hello, Prunus is ready. The tree begins here.',
    marker: '🌱',
  });
}
