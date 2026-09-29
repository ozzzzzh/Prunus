/**
 * 会话状态管理
 *
 * 负责会话的 CRUD 操作和节点管理
 */

import { create } from 'zustand';
import type {
  PrunusNode,
  AIChatNode,
  NodeMarker,
  NodeAttachment,
  SessionMicroApps,
  MicroAppId,
} from '../types';
import { ATTACHMENT_KEY } from '../types';
import { createAIChatNode, createRootNode, migrateNode, type LegacyNode, type LegacySession } from '../utils/migration';

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
  globalPrompt?: string;
  /**
   * 微应用状态（目前只有 PDF 阅读器：打开的是哪份文档、读到第几页）。
   *
   * 放在**会话**上是刻意的：微应用跟对话走，切会话切的就是这里读到的文档。
   * 不初始化成 `{}` —— 缺省即"没开过"，少一处要维护的默认值。
   */
  microApps?: SessionMicroApps;
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
  setGlobalPrompt: (sessionId: string, prompt: string) => void;

  // 微应用操作
  /** 写某个会话的微应用状态；next 传 null 表示移除该微应用 */
  setSessionMicroApp: <K extends MicroAppId>(
    sessionId: string,
    app: K,
    next: SessionMicroApps[K] | null
  ) => void;

  // 节点操作
  addMessage: (role: 'user' | 'assistant' | 'system', content: string, parentId?: string) => string;
  /** 把一段摘录（原文 + 出处）建成当前焦点节点下的子节点。内容与 metadata 一次写入 */
  addQuotedNode: (params: {
    content: string;
    parentId?: string;
    metadata: Record<string, unknown>;
  }) => string;
  addBranchedMessages: (role: 'user' | 'assistant' | 'system', contents: string[], parentId?: string) => void;
  /**
   * 更新节点正文。
   *
   * metadataPatch 是可选的第 4 个参数：值为 null 表示删除该键。
   * 「编辑摘录节点」需要它 —— 用户改完内容后要清掉"原文摘录"标记，
   * 让节点回到普通的 markdown/HTML 渲染路径，而这一步必须与正文写入同时发生。
   */
  updateNodeContent: (
    nodeId: string,
    content: string,
    reasoning?: string,
    metadataPatch?: Record<string, unknown>
  ) => void;
  toggleNodeReasoningCollapse: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  splitNodeIntoBranches: (nodeId: string, newOutlineContent: string, branchesContent: string[]) => void;
  focusNode: (nodeId: string) => void;
  setNodeMarker: (nodeId: string, marker: NodeMarker | undefined) => void;
  toggleNodeCollapse: (nodeId: string) => void;
  setNodesCollapsed: (nodeIds: string[], collapsed: boolean) => void;
  setNodeSize: (nodeId: string, size: { width?: number; height?: number }) => void;
  /** 设置或清除节点的附件（存进 metadata，不占用单独的节点字段） */
  setNodeAttachment: (nodeId: string, attachment: NodeAttachment | null) => void;
  updateNodeMarkers: (sessionId: string) => void;

  // 批量操作
  importSessions: (sessions: Record<string, ChatSession>) => void;
  mergeSessions: (incoming: Record<string, ChatSession>) => void;
  exportSessions: () => Record<string, ChatSession>;

  // 加载示例数据
  loadExampleData: () => string | null;
}

// ===== 工具函数 =====

const generateId = () => Math.random().toString(36).substring(2, 9);

/**
 * 在指定父节点下插入一个子节点的公共逻辑。
 *
 * addMessage 与 addQuotedNode 要做的是同一件事：挂进父节点 childrenIds、
 * 把父节点标记从 🍃 升级为 🪵、把 currentNodeId 指过去、更新 updatedAt。
 * 抽出来是为了不让两处各写一遍 —— 这类重复改漏一边，症状会非常难查。
 *
 * 返回 null 表示前置条件不满足（没有活跃会话 / 父节点不存在），调用方应原样返回 state。
 */
function insertChildNode(
  state: { sessions: Record<string, ChatSession>; activeSessionId: string | null },
  parentId: string | null,
  buildNode: (id: string) => PrunusNode
): { sessionId: string; updatedSession: ChatSession; nodeId: string } | null {
  const { activeSessionId, sessions } = state;
  if (!activeSessionId || !parentId) return null;

  const currentSession = sessions[activeSessionId];
  if (!currentSession || !currentSession.nodes[parentId]) return null;

  const nodeId = generateId();
  const parentNode = currentSession.nodes[parentId] as AIChatNode;

  const updatedSession: ChatSession = {
    ...currentSession,
    nodes: {
      ...currentSession.nodes,
      [parentId]: {
        ...parentNode,
        childrenIds: [...parentNode.childrenIds, nodeId],
        marker: parentNode.marker === '🍃' ? '🪵' : parentNode.marker,
        collapsed: false,
        updatedAt: Date.now(),
      },
      [nodeId]: buildNode(nodeId),
    },
    currentNodeId: nodeId,
    updatedAt: Date.now(),
  };

  return { sessionId: activeSessionId, updatedSession, nodeId };
}

/** 微应用状态的浅比较：字段完全相同就认为没变（用于跳过无意义的重排与持久化） */
function sameMicroAppState(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;

  return leftKeys.every((key) => left[key] === right[key]);
}

// ===== 初始数据 =====

import exampleData from '../example.json';

const initializeSessions = (): Record<string, ChatSession> => {
  // 首次访问不加载 example.json，显示空状态引导
  // 用户可以点击"查看示例"按钮手动加载
  const sessions: Record<string, ChatSession> = {};

  // 创建一个空的默认会话
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
  // 取第一个exampleData.sessions的键作为初始activeSessionId，如果没有则为null
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
        // 如果删掉了目前正在阅读的sessionid则默认激活下一个session
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

  setGlobalPrompt: (sessionId, prompt) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            globalPrompt: prompt,
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
      const session = state.activeSessionId ? state.sessions[state.activeSessionId] : null;
      if (!session) return state;

      const inserted = insertChildNode(state, customParentId || session.currentNodeId, (id) =>
        createAIChatNode({
          id,
          parentId: customParentId || session.currentNodeId,
          role,
          content,
          marker: '🍃',
        })
      );
      if (!inserted) return state;

      createdNodeId = inserted.nodeId;

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [inserted.sessionId]: inserted.updatedSession,
        },
      };
    });

    return createdNodeId;
  },

  /**
   * 把一段摘录（目前来自 PDF 阅读器）变成当前焦点节点下的子节点。
   *
   * 与 addMessage 的唯一实质差别：**正文与来源 metadata 在同一次 set 里写入**。
   * 这不是洁癖 —— MessageNode 的 arePropsEqual 按字段白名单比较，metadata 不在其中，
   * 分两次写的话第二次更新会被判成"没变化"，角标永远刷不出来。
   * 这个约束很隐蔽，所以宁可专门开一个动作，也不让调用方自己拼。
   */
  addQuotedNode: ({ content, parentId, metadata }) => {
    let createdNodeId = '';

    set((state) => {
      const session = state.activeSessionId ? state.sessions[state.activeSessionId] : null;
      if (!session) return state;

      const parent = parentId || session.currentNodeId;

      const inserted = insertChildNode(state, parent, (id) => ({
        ...createAIChatNode({ id, parentId: parent, role: 'user', content, marker: '🍃' }),
        // 覆盖 createAIChatNode 给的空 metadata：内容与出处必须同时到位
        metadata: { ...metadata },
      }));
      if (!inserted) return state;

      createdNodeId = inserted.nodeId;

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [inserted.sessionId]: inserted.updatedSession,
        },
      };
    });

    return createdNodeId;
  },

  setSessionMicroApp: (sessionId, app, next) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const current = session.microApps?.[app];

      const microApps = { ...session.microApps };
      if (next === null) {
        if (current === undefined) return state;
        // 清除时删键而不是置 null，与 setNodeAttachment 同一套理由：
        // 不留无用字段，也不会随导出文件带出去
        delete microApps[app];
      } else {
        // 无实际变化就返回原 state。阅读器会周期性回写页码，而任何一次 session 写入
        // 都会触发画布重排（布局 memo 依赖 session）与整库防抖保存，白耗很可观。
        if (sameMicroAppState(current, next)) return state;
        microApps[app] = next;
      }

      return {
        ...state,
        sessions: {
          ...state.sessions,
          // 刻意不更新 updatedAt：读了几页不算"会话有改动"，
          // 否则文件管理页按时间排序时会因为阅读而把对话顶到最前面
          [sessionId]: { ...session, microApps },
        },
      };
    });
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

  updateNodeContent: (nodeId, content, reasoning, metadataPatch) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const node = currentSession.nodes[nodeId];
      if (!node) return state;

      let metadata = node.metadata;
      if (metadataPatch) {
        // 与正文在同一次写入里改 metadata：分两次写会被 MessageNode 的
        // arePropsEqual 判成"没变化"（它比较 metadata 的引用），改动就丢了
        metadata = { ...node.metadata };
        for (const [key, value] of Object.entries(metadataPatch)) {
          if (value === null) delete metadata[key];
          else metadata[key] = value;
        }
      }

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
                metadata,
                reasoning: reasoning !== undefined ? reasoning : (node as any).reasoning,
                reasoningCollapsed: reasoning ? true : (node as any).reasoningCollapsed,
                updatedAt: Date.now(),
              },
            },
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  toggleNodeReasoningCollapse: (nodeId) => {
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
                reasoningCollapsed: !(node as any).reasoningCollapsed,
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

  setNodesCollapsed: (nodeIds, collapsed) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const updatedNodes = { ...currentSession.nodes };
      let changed = false;

      for (const id of nodeIds) {
        const node = updatedNodes[id];
        // 只有带标记的节点才有收缩态：渲染与布局都以 `collapsed && marker` 为准
        // （见 MessageNode 与 resolveNodeSize），对无标记节点设置 collapsed 不会有任何效果
        if (!node || !node.marker || node.collapsed === collapsed) continue;
        updatedNodes[id] = { ...node, collapsed, updatedAt: Date.now() };
        changed = true;
      }

      // 无实际变化就返回原 state：Zustand 按引用比较，引用不变则不会通知订阅者，
      // 避免多余的重排与持久化（例如按钮被重复点击时）
      if (!changed) return state;

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [activeSessionId]: {
            ...currentSession,
            nodes: updatedNodes,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  setNodeSize: (nodeId, size) => {
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
                width: size.width ?? node.width,
                height: size.height ?? node.height,
                updatedAt: Date.now(),
              },
            },
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  setNodeAttachment: (nodeId, attachment) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const node = currentSession.nodes[nodeId];
      if (!node) return state;

      const metadata = { ...node.metadata };
      if (attachment) {
        metadata[ATTACHMENT_KEY] = attachment;
      } else {
        // 清除时把键删掉而不是置 null —— getNodeAttachment 靠「键不存在」判断无附件，
        // 留一个 null 会让 metadata 里堆积无用字段，也会随导出文件一起带出去
        delete metadata[ATTACHMENT_KEY];
      }

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [activeSessionId]: {
            ...currentSession,
            nodes: {
              ...currentSession.nodes,
              [nodeId]: { ...node, metadata, updatedAt: Date.now() },
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

  /**
   * 追加会话（导入对话用）。
   *
   * 与 importSessions 的区别，也是不能复用它做导入的原因：
   *   1. 它是**整体替换**，会把本机已有的会话全冲掉；
   *   2. 它会把 activeSessionId 重置成第一个键 —— 导入是安静的追加操作，
   *      不该把用户正在看的会话切走。
   * 同 id 的项仍会被覆盖，但调用方（sessionTransfer.resolveImport）已经保证
   * 传进来的 id 不与本机冲突。
   */
  mergeSessions: (incoming) => {
    set((state) => ({
      sessions: { ...state.sessions, ...incoming },
    }));
  },

  exportSessions: () => {
    return get().sessions;
  },

  // 加载示例数据（example.json）
  loadExampleData: () => {
    if (!exampleData.sessions) return null;

    const migratedNodes: Record<string, PrunusNode> = {};
    const sessions = exampleData.sessions as Record<string, LegacySession>;
    const exampleSessionId = Object.keys(sessions)[0];
    const legacySession = sessions[exampleSessionId];

    if (!legacySession) return null;

    for (const [nodeId, legacyNode] of Object.entries(legacySession.nodes) as [string, LegacyNode][]) {
      migratedNodes[nodeId] = migrateNode(legacyNode);
    }

    const exampleSession: ChatSession = {
      id: exampleSessionId,
      title: legacySession.title,
      nodes: migratedNodes,
      rootNodeId: legacySession.rootNodeId,
      currentNodeId: legacySession.currentNodeId,
      createdAt: legacySession.createdAt,
      updatedAt: legacySession.createdAt,
      pinned: legacySession.pinned,
    };

    set((state) => ({
      sessions: { ...state.sessions, [exampleSessionId]: exampleSession },
      activeSessionId: exampleSessionId,
    }));

    return exampleSessionId;
  },
}));
