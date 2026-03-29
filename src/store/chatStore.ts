import { create } from 'zustand';

export type Role = 'user' | 'assistant' | 'system';

export interface PrunusNode {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: Role;
  content: string;
  timestamp: number;
}

// 新增：会话 (Session) 定义，相当于侧边栏里的一个对话框
export interface ChatSession {
  id: string;
  title: string;
  nodes: Record<string, PrunusNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  createdAt: number;
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

  // Actions
  createSession: () => string;
  switchSession: (sessionId: string) => void;
  addMessage: (role: Role, content: string, parentId?: string) => string;
  addBranchedMessages: (role: Role, contents: string[], parentId?: string) => void;
  splitNodeIntoBranches: (nodeId: string, newOutlineContent: string, branchesContent: string[]) => void;
  focusNode: (nodeId: string) => void;
  updateApiConfig: (config: Partial<ChatState['apiConfig']>) => void;
  toggleSettings: (isOpen: boolean) => void;
  setGeneratingNodeId: (nodeId: string | null) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useChatStore = create<ChatState>((set) => ({
  sessions: {},
  activeSessionId: null,
  generatingNodeId: null,
  apiConfig: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  isSettingsOpen: false,

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
    };

    const newSession: ChatSession = {
      id: sessionId,
      title: 'New Prunus Branch', // 默认标题，后续可以让 AI 根据内容自动生成
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

  addMessage: (role, content, customParentId) => {
    let createdNodeId = '';
    set((state) => {
      const { activeSessionId, sessions } = state;
      if (!activeSessionId) return state;

      const currentSession = sessions[activeSessionId];
      // 优先使用传入的 customParentId，否则使用当前聚焦的节点作为父节点
      const parentId = customParentId || currentSession.currentNodeId;
      if (!parentId || !currentSession.nodes[parentId]) return state;

      const newNodeId = generateId();
      createdNodeId = newNodeId;
      
      const newNode: PrunusNode = {
        id: newNodeId,
        parentId,
        childrenIds: [],
        role,
        content,
        timestamp: Date.now(),
      };

      const updatedParent = {
        ...currentSession.nodes[parentId],
        childrenIds: [...currentSession.nodes[parentId].childrenIds, newNodeId],
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          [parentId]: updatedParent,
          [newNodeId]: newNode,
        },
        // 添加新消息后，自动将焦点切换到新节点上
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
        };
        newChildrenIds.push(newNodeId);
      });

      const updatedParent = {
        ...currentSession.nodes[parentId],
        childrenIds: [...currentSession.nodes[parentId].childrenIds, ...newChildrenIds],
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          ...newNodes,
          [parentId]: updatedParent,
        },
        // 默认聚焦到第一个生成的分支
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
          parentId: nodeId, // 以当前节点为父节点
          childrenIds: [],
          role: targetNode.role, // 继承原来的角色（通常是 assistant）
          content,
          timestamp: Date.now(),
        };
        newChildrenIds.push(newNodeId);
      });

      // 更新 targetNode (保留在原位置，内容替换为大纲，添加新的 childrenIds)
      const updatedTargetNode = {
        ...targetNode,
        content: newOutlineContent,
        childrenIds: [...targetNode.childrenIds, ...newChildrenIds],
      };

      const updatedSession: ChatSession = {
        ...currentSession,
        nodes: {
          ...currentSession.nodes,
          ...newNodes,
          [nodeId]: updatedTargetNode,
        },
        // 焦点切到第一个新裂变出来的分支上
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

  updateApiConfig: (config) => {
    set((state) => ({
      apiConfig: { ...state.apiConfig, ...config },
    }));
  },

  toggleSettings: (isOpen) => {
    set({ isSettingsOpen: isOpen });
  },

  setGeneratingNodeId: (nodeId) => {
    set({ generatingNodeId: nodeId });
  },
}));
