/**
 * 新建一个 Prompt 会话
 *
 * Prompt 工作台是"独立会话"而不是给聊天会话加个开关：
 * 它的根节点就是议题，树上的节点全部由发散产生。混进历史对话会让
 * 根节点、上下文和文件管理里的图标都变得含糊。
 *
 * 三个入口（文件管理、侧边栏、面板空态）共用这里，避免三处各写一遍。
 */

import { useSessionStore } from '../store/sessionStore';
import { useFolderStore } from '../store/folderStore';
import { useUIStore } from '../store/uiStore';

const DEFAULT_TITLE = 'New Prompt';

/**
 * 把 Prompt 会话里的聊天节点标成"解释"。
 *
 * 恢复底部聊天框之后，用户可以在任意节点下追问概念。这些问答默认不进入成稿，
 * 但仍然可以被勾选成「备注」—— 所以要打上 prompt 标记，让画布用 PromptNode 渲染，
 * 并在左侧清单里归到「知识笔记」。
 *
 * 非 Prompt 会话直接跳过，聊天流程完全不受影响。
 */
export function tagPromptChatNode(
  sessionId: string,
  nodeId: string,
  role: 'user' | 'assistant'
): void {
  const session = useSessionStore.getState().sessions[sessionId];
  if (!session?.microApps?.prompt) return;

  useSessionStore.getState().setPromptNodeMeta(sessionId, nodeId, {
    kind: 'explain',
    origin: role === 'user' ? 'user' : 'ai',
    included: false,
  });
}

export function createPromptSession(folderId: string | null = null): string {
  const sessionId = useSessionStore.getState().createSession();

  /**
   * 清掉根节点上的默认欢迎语。
   *
   * `createRootNode` 会给每个新会话写一句 "Hello, Prunus is ready…"。
   * 而在 Prompt 里根节点就是**议题**：留着那句话，面板会以为用户已经输入过议题，
   * 直接跳到大纲页，输入框就再也不出现了。
   */
  const rootNodeId = useSessionStore.getState().sessions[sessionId]?.rootNodeId;
  if (rootNodeId) {
    useSessionStore.getState().updateNodeContent(rootNodeId, '');
  }

  useSessionStore.getState().setSessionMicroApp(sessionId, 'prompt', { optionCount: 3 });
  useSessionStore.getState().renameSession(sessionId, DEFAULT_TITLE);

  // 让它在文件管理页里有位置（没有 folder item 的会话在侧边栏是不可见的）
  useFolderStore.getState().createSessionItem(folderId, sessionId, DEFAULT_TITLE);

  useUIStore.getState().setCurrentPage('canvas');
  useUIStore.getState().setActiveMicroApp('prompt');

  return sessionId;
}
