import { create } from 'zustand';
import exampleData from '../example.json';

export type Role = 'user' | 'assistant' | 'system';

export interface PrunusNode {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: Role;
  content: string;
  timestamp: number;
  marker?: string; // 节点标记，如 🍃、🍑 等
  collapsed?: boolean; // 是否收缩
}

// 新增：会话 (Session) 定义，相当于侧边栏里的一个对话框
export interface ChatSession {
  id: string;
  title: string;
  nodes: Record<string, PrunusNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  createdAt: number;
  pinned?: boolean; // 是否置顶
}

interface ChatState {
  // 所有的会话字典
  sessions: Record<string, ChatSession>;
  // 当前正在画布中显示的会话 ID
  activeSessionId: string | null;
  // 正在等待 AI 回复的用户节点 ID
  generatingNodeId: string | null;
  // API 设置
  apiConfig: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  isSettingsOpen: boolean;
  // 侧边栏收缩状态
  sidebarCollapsed: boolean;

  // Actions
  createSession: () => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newTitle: string) => void;
  togglePinSession: (sessionId: string) => void;
  addMessage: (role: Role, content: string, parentId?: string) => string;
  addBranchedMessages: (role: Role, contents: string[], parentId?: string) => void;
  splitNodeIntoBranches: (nodeId: string, newOutlineContent: string, branchesContent: string[]) => void;
  focusNode: (nodeId: string) => void;
  setNodeMarker: (nodeId: string, marker: string | undefined) => void;
  toggleNodeCollapse: (nodeId: string) => void;
  updateNodeMarkers: (sessionId: string) => void;
  updateApiConfig: (config: Partial<ChatState['apiConfig']>) => void;
  toggleSettings: (isOpen: boolean) => void;
  toggleSidebar: (collapsed: boolean) => void;
  setGeneratingNodeId: (nodeId: string | null) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// 根据 childrenIds 判断应该使用的默认标记
const getDefaultMarker = (node: PrunusNode, isRoot: boolean): string => {
  if (isRoot) return '🌱';
  if (node.childrenIds.length > 0) return '🪵';
  return '🍃';
};

export const useChatStore = create<ChatState>((set) => ({
  // 加载 example.json 作为默认示例 session
  sessions: exampleData.sessions as Record<string, ChatSession>,
  activeSessionId: Object.keys(exampleData.sessions)[0] || null,
  generatingNodeId: null,
  apiConfig: {
    apiKey: 'sk-sp-q42V1XVXEx6Ytf8y8yE0DAC5AnydYaNhBP0qIK8lrliEVg5b',
    baseUrl: 'https://api.lkeap.cloud.tencent.com/coding/v3',
    model: 'glm-5',
  },
  isSettingsOpen: false,
  sidebarCollapsed: false,

  createSession: () => {
    const sessionId = generateId();
    const rootId = generateId();

    const systemNode: PrunusNode = {
      id: rootId,
      parentId: null,
      childrenIds: [],
      role: 'system',
      content: 'Hello, Prunus is ready. The tree begins here.',
      timestamp: Date.now(),
      marker: '🌱', // 根节点自动标记为 Seed
    };

    const newSession: ChatSession = {
      id: sessionId,
      title: 'New Prunus Branch',
      nodes: { [rootId]: systemNode },
      rootNodeId: rootId,
      currentNodeId: rootId,
      createdAt: Date.now(),
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
          [sessionId]: { ...session, title: newTitle },
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
          [sessionId]: { ...session, pinned: !session.pinned },
        },
      };
    });
  },

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

      // 新节点默认标记为 Leaf（末端节点）
      const newNode: PrunusNode = {
        id: newNodeId,
        parentId,
        childrenIds: [],
        role,
        content,
        timestamp: Date.now(),
        marker: '🍃',
      };

      // 更新父节点：添加子节点，标记改为 Trunk（如果之前是 Leaf），并确保展开
      const parentNode = currentSession.nodes[parentId];
      const parentMarker = parentNode.marker === '🍃' ? '🪵' : parentNode.marker;
      const updatedParent = {
        ...parentNode,
        childrenIds: [...parentNode.childrenIds, newNodeId],
        marker: parentMarker,
        collapsed: false, // 添加子节点时自动展开父节点
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          [parentId]: updatedParent,
          [newNodeId]: newNode,
        },
        currentNodeId: newNodeId,
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
        newNodes[newNodeId] = {
          id: newNodeId,
          parentId,
          childrenIds: [],
          role,
          content,
          timestamp: Date.now(),
          marker: '🍃', // 新节点默认为 Leaf
        };
        newChildrenIds.push(newNodeId);
      });

      // 更新父节点标记，并确保展开
      const parentNode = currentSession.nodes[parentId];
      const parentMarker = parentNode.marker === '🍃' ? '🪵' : parentNode.marker;
      const updatedParent = {
        ...parentNode,
        childrenIds: [...parentNode.childrenIds, ...newChildrenIds],
        marker: parentMarker,
        collapsed: false, // 添加子节点时自动展开父节点
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          ...newNodes,
          [parentId]: updatedParent,
        },
        currentNodeId: newChildrenIds[0],
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

  splitNodeIntoBranches: (nodeId, newOutlineContent, branchesContent) => {
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      const targetNode = currentSession.nodes[nodeId];
      if (!targetNode) return state;

      // 生成新的子节点
      const newNodes: Record<string, PrunusNode> = {};
      const newChildrenIds: string[] = [];

      branchesContent.forEach((content) => {
        const newNodeId = generateId();
        newNodes[newNodeId] = {
          id: newNodeId,
          parentId: nodeId,
          childrenIds: [],
          role: targetNode.role,
          content,
          timestamp: Date.now(),
          marker: '🍃', // 新分支默认为 Leaf
        };
        newChildrenIds.push(newNodeId);
      });

      // 更新 targetNode：添加子节点，标记改为 Trunk
      const updatedTargetNode = {
        ...targetNode,
        content: newOutlineContent,
        childrenIds: [...targetNode.childrenIds, ...newChildrenIds],
        marker: '🪵', // 有子节点则为 Trunk
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          ...newNodes,
          [nodeId]: updatedTargetNode,
        },
        currentNodeId: newChildrenIds[0] || currentSession.currentNodeId,
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

      // 如果已经是当前节点，不进行更新
      if (currentSession.currentNodeId === nodeId) return state;

      // 彻底解构 sessions 对象，确保引用完全改变，触发 React 重渲染
      return {
        ...state,
        sessions: {
          ...sessions,
          [activeSessionId]: {
            ...currentSession,
            currentNodeId: nodeId,
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
              [nodeId]: { ...targetNode, marker },
            },
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
              },
            },
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

        // 只自动更新 Seed/Trunk/Leaf，Peach 保持不变
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
          updatedNodes[node.id] = { ...node, marker: newMarker };
        }
      });

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, nodes: updatedNodes },
        },
      };
    });
  },

  updateApiConfig: (config) => {
    set((state) => ({
      apiConfig: { ...state.apiConfig, ...config },
    }));
  },

  toggleSettings: (isOpen) => {
    set({ isSettingsOpen: isOpen });
  },

  toggleSidebar: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
  },

  setGeneratingNodeId: (nodeId) => {
    set({ generatingNodeId: nodeId });
  },
}));
