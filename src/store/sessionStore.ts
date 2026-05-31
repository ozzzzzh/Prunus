/**
 * 会话状态管理
 *
 * 负责会话的 CRUD 操作和节点管理
 */

import { create } from 'zustand';
import type { PrunusNode, AIChatNode, NodeMarker } from '../types';
import { createAIChatNode, createRootNode, migrateNode, type LegacyNode } from '../utils/migration';

// ===== 类型定义 =====

export interface ChatSession {
  id: string;
  title: string;
  nodes: Record<string, PrunusNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

interface SessionState {
  sessions: Record<string, ChatSession>;
  activeSessionId: string | null;

  // 会话操作
  createSession: () => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newTitle: string) => void;
  togglePinSession: (sessionId: string) => void;

  // 节点操作
  addMessage: (role: 'user' | 'assistant' | 'system', content: string, parentId?: string) => string;
  addBranchedMessages: (role: 'user' | 'assistant' | 'system', contents: string[], parentId?: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  deleteNode: (nodeId: string) => void;
  splitNodeIntoBranches: (nodeId: string, newOutlineContent: string, branchesContent: string[]) => void;
  focusNode: (nodeId: string) => void;
  setNodeMarker: (nodeId: string, marker: NodeMarker | undefined) => void;
  toggleNodeCollapse: (nodeId: string) => void;
  updateNodeMarkers: (sessionId: string) => void;

  // 批量操作
  importSessions: (sessions: Record<string, ChatSession>) => void;
  exportSessions: () => Record<string, ChatSession>;
}

// ===== 工具函数 =====

const generateId = () => Math.random().toString(36).substring(2, 9);

// ===== 初始数据 =====

import exampleData from '../example.json';

const initializeSessions = (): Record<string, ChatSession> => {
  const sessions: Record<string, ChatSession> = {};

  // 迁移 example.json 中的旧数据
  if (exampleData.sessions) {
    for (const [sessionId, legacySession] of Object.entries(exampleData.sessions) as [string, any][]) {
      const migratedNodes: Record<string, PrunusNode> = {};

      for (const [nodeId, legacyNode] of Object.entries(legacySession.nodes) as [string, LegacyNode][]) {
        migratedNodes[nodeId] = migrateNode(legacyNode);
      }

      sessions[sessionId] = {
        id: sessionId,
        title: legacySession.title,
        nodes: migratedNodes,
        rootNodeId: legacySession.rootNodeId,
        currentNodeId: legacySession.currentNodeId,
        createdAt: legacySession.createdAt,
        updatedAt: legacySession.createdAt,
        pinned: legacySession.pinned,
      };
    }
  }

  // 创建默认会话
  const emptySessionId = generateId();
  const emptyRootId = generateId();
  sessions[emptySessionId] = {
    id: emptySessionId,
    title: 'New Prunus Branch',
    nodes: {
      [emptyRootId]: createRootNode(emptyRootId),
    },
    rootNodeId: emptyRootId,
    currentNodeId: emptyRootId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return sessions;
};

// ===== Store 创建 =====

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: initializeSessions(),
  activeSessionId: Object.keys(exampleData.sessions || {})[0] || null,

  // ===== 会话操作 =====

  createSession: () => {
    const sessionId = generateId();
    const rootId = generateId();

    const newSession: ChatSession = {
      id: sessionId,
      title: 'New Prunus Branch',
      nodes: {
        [rootId]: createRootNode(rootId),
      },
      rootNodeId: rootId,
      currentNodeId: rootId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: newSession },
      activeSessionId: sessionId,
    }));

    return sessionId;
  },

  switchSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  deleteSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: deleted, ...remainingSessions } = state.sessions;
      const newActiveId = state.activeSessionId === sessionId
        ? Object.keys(remainingSessions)[0] || null
        : state.activeSessionId;

      return {
        sessions: remainingSessions,
        activeSessionId: newActiveId,
      };
    });
  },

  renameSession: (sessionId, newTitle) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            title: newTitle,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  togglePinSession: (sessionId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            pinned: !session.pinned,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  // ===== 节点操作 =====

  addMessage: (role, content, customParentId) => {
    let createdNodeId = '';

    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const parentId = customParentId || currentSession.currentNodeId;
      if (!parentId || !currentSession.nodes[parentId]) return state;

      const newNodeId = generateId();
      createdNodeId = newNodeId;

      const newNode = createAIChatNode({
        id: newNodeId,
        parentId,
        role,
        content,
        marker: '🍃',
      });

      const parentNode = currentSession.nodes[parentId] as AIChatNode;
      const parentMarker = parentNode.marker === '🍃' ? '🪵' : parentNode.marker;
      const updatedParent: PrunusNode = {
        ...parentNode,
        childrenIds: [...parentNode.childrenIds, newNodeId],
        marker: parentMarker,
        collapsed: false,
        updatedAt: Date.now(),
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          [parentId]: updatedParent,
          [newNodeId]: newNode,
        },
        currentNodeId: newNodeId,
        updatedAt: Date.now(),
      };

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [activeSessionId]: updatedSession,
        },
      };
    });

    return createdNodeId;
  },

  addBranchedMessages: (role, contents, targetParentId) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const parentId = targetParentId || currentSession.currentNodeId;
      if (!parentId || !currentSession.nodes[parentId]) return state;

      const newNodes: Record<string, PrunusNode> = {};
      const newChildrenIds: string[] = [];

      contents.forEach((content) => {
        const newNodeId = generateId();
        newNodes[newNodeId] = createAIChatNode({
          id: newNodeId,
          parentId,
          role,
          content,
          marker: '🍃',
        });
        newChildrenIds.push(newNodeId);
      });

      const parentNode = currentSession.nodes[parentId] as AIChatNode;
      const parentMarker = parentNode.marker === '🍃' ? '🪵' : parentNode.marker;
      const updatedParent: PrunusNode = {
        ...parentNode,
        childrenIds: [...parentNode.childrenIds, ...newChildrenIds],
        marker: parentMarker,
        collapsed: false,
        updatedAt: Date.now(),
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          ...newNodes,
          [parentId]: updatedParent,
        },
        currentNodeId: newChildrenIds[0],
        updatedAt: Date.now(),
      };

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [activeSessionId]: updatedSession,
        },
      };
    });
  },

  updateNodeContent: (nodeId, content) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const node = currentSession.nodes[nodeId];
      if (!node) return state;

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [activeSessionId]: {
            ...currentSession,
            nodes: {
              ...currentSession.nodes,
              [nodeId]: {
                ...node,
                content,
                updatedAt: Date.now(),
              },
            },
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  deleteNode: (nodeId) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const node = currentSession.nodes[nodeId];
      if (!node) return state;

      const parentId = node.parentId;
      let updatedNodes = { ...currentSession.nodes };

      if (parentId && updatedNodes[parentId]) {
        const parentNode = updatedNodes[parentId];
        updatedNodes[parentId] = {
          ...parentNode,
          childrenIds: parentNode.childrenIds.filter(id => id !== nodeId),
          updatedAt: Date.now(),
        };
      }

      // 递归删除子节点
      const nodesToDelete = new Set<string>();
      const collectNodesToDelete = (id: string) => {
        nodesToDelete.add(id);
        const n = updatedNodes[id];
        if (n?.childrenIds) {
          n.childrenIds.forEach(collectNodesToDelete);
        }
      };
      collectNodesToDelete(nodeId);

      for (const id of nodesToDelete) {
        delete updatedNodes[id];
      }

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [activeSessionId]: {
            ...currentSession,
            nodes: updatedNodes,
            currentNodeId: currentSession.currentNodeId === nodeId ? parentId : currentSession.currentNodeId,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  splitNodeIntoBranches: (nodeId, newOutlineContent, branchesContent) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const targetNode = currentSession.nodes[nodeId];
      if (!targetNode) return state;

      const newNodes: Record<string, PrunusNode> = {};
      const newChildrenIds: string[] = [];

      branchesContent.forEach((content) => {
        const newNodeId = generateId();
        newNodes[newNodeId] = createAIChatNode({
          id: newNodeId,
          parentId: nodeId,
          role: (targetNode as AIChatNode).role,
          content,
          marker: '🍃',
        });
        newChildrenIds.push(newNodeId);
      });

      const updatedTargetNode: PrunusNode = {
        ...targetNode,
        content: newOutlineContent,
        childrenIds: [...targetNode.childrenIds, ...newChildrenIds],
        marker: '🪵',
        updatedAt: Date.now(),
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          ...newNodes,
          [nodeId]: updatedTargetNode,
        },
        currentNodeId: newChildrenIds[0] || currentSession.currentNodeId,
        updatedAt: Date.now(),
      };

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [activeSessionId]: updatedSession,
        },
      };
    });
  },

  focusNode: (nodeId) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      if (!currentSession.nodes[nodeId]) return state;

      if (currentSession.currentNodeId === nodeId) return state;

      return {
        ...state,
        sessions: {
          ...sessions,
          [activeSessionId]: {
            ...currentSession,
            currentNodeId: nodeId,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  setNodeMarker: (nodeId, marker) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const targetNode = currentSession.nodes[nodeId];
      if (!targetNode) return state;

      return {
        ...state,
        sessions: {
          ...sessions,
          [activeSessionId]: {
            ...currentSession,
            nodes: {
              ...currentSession.nodes,
              [nodeId]: { ...targetNode, marker, updatedAt: Date.now() },
            },
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  toggleNodeCollapse: (nodeId) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const targetNode = currentSession.nodes[nodeId];
      if (!targetNode || !targetNode.marker) return state;

      return {
        ...state,
        sessions: {
          ...sessions,
          [activeSessionId]: {
            ...currentSession,
            nodes: {
              ...currentSession.nodes,
              [nodeId]: {
                ...targetNode,
                collapsed: !targetNode.collapsed,
                updatedAt: Date.now(),
              },
            },
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  updateNodeMarkers: (sessionId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const updatedNodes = { ...session.nodes };
      const rootNodeId = session.rootNodeId;

      Object.values(session.nodes).forEach(node => {
        const isRoot = node.id === rootNodeId;
        let newMarker = node.marker;

        if (node.marker !== '🍑') {
          if (isRoot && node.marker !== '🌱') {
            newMarker = '🌱';
          } else if (!isRoot) {
            if (node.childrenIds.length > 0 && node.marker === '🍃') {
              newMarker = '🪵';
            } else if (node.childrenIds.length === 0 && node.marker === '🪵') {
              newMarker = '🍃';
            }
          }
        }

        if (newMarker !== node.marker) {
          updatedNodes[node.id] = { ...node, marker: newMarker, updatedAt: Date.now() };
        }
      });

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, nodes: updatedNodes, updatedAt: Date.now() },
        },
      };
    });
  },

  // ===== 批量操作 =====

  importSessions: (sessions) => {
    set({ sessions, activeSessionId: Object.keys(sessions)[0] || null });
  },

  exportSessions: () => {
    return get().sessions;
  },
}));
