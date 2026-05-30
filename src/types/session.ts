/**
 * Prunus 会话类型定义
 */

import type { PrunusNode } from './node';

/**
 * 会话/文档 - 一棵完整的节点树
 */
export interface Session {
  id: string;
  title: string;
  nodes: Record<string, PrunusNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 会话摘要 - 用于侧边栏列表展示
 */
export interface SessionSummary {
  id: string;
  title: string;
  nodeCount: number;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

/**
 * 从完整会话生成摘要
 */
export function toSessionSummary(session: Session): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    nodeCount: Object.keys(session.nodes).length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    pinned: session.pinned,
  };
}