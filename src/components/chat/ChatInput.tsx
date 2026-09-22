import { useState, useRef, useEffect } from 'react';
import { Send, CornerDownLeft, Loader2, MessageSquare, Paperclip, X } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useGenerationStore } from '../../store/generationStore';
import { useSessionStore } from '../../store/sessionStore';
import { useUIStore } from '../../store/uiStore';
import { useAPIConfigStore } from '../../store/apiConfigStore';
import { useDialogStore } from '../../store/dialogStore';
import type { AIRole, NodeAttachment } from '../../types';
import { isAIChatNode, getNodeAttachment } from '../../types';
import { generateAIResponse, QuotaExceededError } from '../../utils/llmApi';
import { parseDocument, estimateTokens, LARGE_DOC_TOKENS } from '../../utils/documentParser';
import FormatToolbar, { FormatSubMenu } from './FormatToolbar';
import { isBold, isItalic, isUnderline, isStrikethrough, hasBackgroundColor, hasTextColor, htmlToPlainText } from '../../utils/richtext';

export default function ChatInput() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<'text' | 'color' | 'highlight' | null>(null);
  const isComposing = useRef(false);
  const addMessage = useChatStore(state => state.addMessage);
  const setGeneratingNodeId = useChatStore(state => state.setGeneratingNodeId);
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const sessions = useChatStore(state => state.sessions);
  const editingNodeId = useUIStore(state => state.editingNodeId);
  const enableThinking = useAPIConfigStore(state => state.config.enableThinking) ?? false;
  const expandedNodeId = useUIStore(state => state.expandedNodeId);
  const setExpandedNode = useUIStore(state => state.setExpandedNode);
  const focusNode = useSessionStore(state => state.focusNode);
  const setNodeAttachment = useSessionStore(state => state.setNodeAttachment);

  const session = activeSessionId ? sessions[activeSessionId] : null;
  const activeNode = session && session.currentNodeId ? session.nodes[session.currentNodeId] : null;

  // ===== 上传文档 =====
  // 附件先挂在这里，等发送时节点建出来了再写进那个节点的 metadata ——
  // 这之前还没有属于本次消息的节点可挂。
  const [attachment, setAttachment] = useState<NodeAttachment | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachmentTokens = attachment ? estimateTokens(attachment.text) : 0;

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 先复位，否则连续选同一个文件不会再触发 change
    e.target.value = '';
    if (!file) return;

    setIsParsing(true);
    try {
      const parsed = await parseDocument(file);
      setAttachment({
        name: parsed.name,
        kind: parsed.kind,
        size: parsed.size,
        totalChars: parsed.totalChars,
        truncated: parsed.truncated,
        text: parsed.text,
      });
      const notes = [`已读取「${parsed.name}」`, `${parsed.totalChars.toLocaleString()} 字`];
      if (parsed.pages) notes.push(`${parsed.pages} 页`);
      if (parsed.truncated) notes.push(`内容过长，已截断至 ${parsed.text.length.toLocaleString()} 字`);
      useDialogStore.getState().showToast(notes.join(' · '), {
        type: parsed.truncated ? 'info' : 'success',
      });
    } catch (err) {
      // documentParser 抛出的都是可读的中文提示，直接透出
      useDialogStore.getState().showToast((err as Error).message || '文件解析失败', { type: 'error' });
    } finally {
      setIsParsing(false);
    }
  };

  /** 真正的发送逻辑；由 handleSubmit 在通过护栏（含大附件确认）之后调用 */
  const runSubmit = async () => {
    if (!activeSessionId) return;

    const messageContent = input.trim();
    const pending = attachment;
    setInput('');
    setAttachment(null);

    const userNodeId = addMessage('user', messageContent);

    // 附件写进刚建出来的这个用户节点。刻意不塞进 content ——
    // content 保持是用户手打的那句话，附件走 metadata，卡片上才显示得干净。
    if (pending) {
      setNodeAttachment(userNodeId, pending);
    }

    setIsLoading(true);
    setGeneratingNodeId(userNodeId);

    // 如果在展开模式，更新展开节点ID
    if (expandedNodeId) {
      setExpandedNode(userNodeId);
    }

    try {
      const latestState = useChatStore.getState();
      const currentSession = latestState.sessions[activeSessionId];

      const history: { role: AIRole, content: string }[] = [];
      let currId: string | null = userNodeId || currentSession.currentNodeId;

      while (currId && currentSession.nodes[currId]) {
        const node = currentSession.nodes[currId];
        if (isAIChatNode(node) && node.role !== 'system') {
          // 摊平成纯文本再发：画布上编辑过的节点存的是 HTML，原样发出去既费 token
          // 又是噪音（见 richtext.ts 的 htmlToPlainText）。
          const content = htmlToPlainText(node.content);

          // 附件要沿**整条祖先链**注入，而不是只注入带附件的那一个节点：
          // 大模型调用是无状态的，只注入当前节点的话用户追问时模型就"忘了"文档，
          // 功能会显得是坏的。代价是后续每条消息都重发整篇文档、重复计费 ——
          // 这正是 handleSubmit 里要做额度确认的原因。
          const att = getNodeAttachment(node);
          const parts: string[] = [];
          if (att) {
            parts.push(`<document name="${att.name}">\n${att.text}\n</document>`);
          }
          if (content) parts.push(content);

          // 判空必须在摊平之后：内容全是标记的节点（例如编辑器里只剩一个空 <div>）
          // 摊平后是空串，发过去会变成一条空的 assistant 消息，部分 API 会直接报错。
          if (parts.length) {
            history.unshift({ role: node.role, content: parts.join('\n\n') });
          }
        }
        currId = node.parentId;
      }

      const baseSystemPrompt = 'You are a helpful AI assistant. Provide structured, clear, and concise answers.';
      const globalPrompt = currentSession.globalPrompt?.trim();
      history.unshift({
        role: 'system',
        content: globalPrompt ? `${baseSystemPrompt}\n\n${globalPrompt}` : baseSystemPrompt,
      });

      // 先创建空的 assistant 节点
      const aiNodeId = useSessionStore.getState().addMessage('assistant', '', userNodeId);

      // 更新展开节点ID（如果在展开模式）
      if (expandedNodeId) {
        setExpandedNode(aiNodeId);
      }

      // 用 generationStore 暂存流式内容
      const genStore = useGenerationStore.getState();
      genStore.setGeneratingNodeId(aiNodeId);

      await generateAIResponse(history, (chunk) => {
        const isReasoning = Boolean(chunk.reasoning && chunk.reasoning.length > 0 && !chunk.content);
        genStore.setIsReasoning(isReasoning);
        genStore.appendStreamingContent(chunk.content);
        if (chunk.reasoning) {
          genStore.appendStreamingReasoning(chunk.reasoning);
        }
      }, {
        enableThinking,
      });

      // 流结束后一次性写入 sessionStore
      // 注意：要用 getState() 获取最新状态，不能用之前的快照
      const { streamingContent, streamingReasoning } = useGenerationStore.getState();
      useSessionStore.getState().updateNodeContent(aiNodeId, streamingContent, streamingReasoning || undefined);

      // 聚焦到新的 AI 节点
      focusNode(aiNodeId);

      // 延迟 reset，确保 React 渲染完成后再清空
      setTimeout(() => {
        useGenerationStore.getState().reset();
      }, 100);

    } catch (error: unknown) {
      const err = error as Error;
      if (err instanceof QuotaExceededError) {
        // 社区后端（含免费试用与兑换码）额度耗尽 → 弹回配置页。
        // 清掉本地配置后，App 的配置闸门会重新接管：它会再领一次免费额度，后端把同一个
        // 已耗尽的 token 还回来，于是停在配置页并带上「额度已用完」的说明。
        // 用户数据在 IndexedDB，与这份 API 配置相互独立，所以清掉它不会丢对话树。
        //
        // 只在 cdk 模式下这么做：BYOK 是直连用户自己的 provider，那边返回 402 是对方账号
        // 的问题，不该顺手清掉用户填好的配置。
        if (useAPIConfigStore.getState().config.mode === 'cdk') {
          useAPIConfigStore.getState().resetConfig();
        } else {
          useChatStore.getState().addMessage('system', `Error: ${err.message}`, userNodeId);
        }
      } else {
        useChatStore.getState().addMessage('system', `Error: ${err.message || 'Failed to connect to AI API'}`, userNodeId);
      }
    } finally {
      setIsLoading(false);
      setGeneratingNodeId(null);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // 允许「只传文档不提问」：那是最常见的用法（"总结这份文档"），
    // 所以附件也算有效内容。解析中则一律拦住，避免把半个文件发出去。
    if ((!input.trim() && !attachment) || !activeSessionId || isLoading || isParsing) return;

    // 附件会让本分支的**后续每条消息**都重发整篇文档、重复计费（大模型调用无状态）。
    // 这里是额度最容易被意外耗光的地方，所以超过阈值时先确认，而不是默默扣掉。
    if (attachmentTokens >= LARGE_DOC_TOKENS) {
      useDialogStore.getState().showConfirm({
        title: '这条消息会消耗较多额度',
        message:
          `附件「${attachment?.name}」约 ${attachmentTokens.toLocaleString()} tokens。` +
          `发送之后，本分支的后续每条消息都会重新计入这部分内容。确定继续吗？`,
        confirmText: '仍然发送',
        onConfirm: () => { void runSubmit(); },
      });
      return;
    }

    void runSubmit();
  };

  // 编辑模式下，自动检测选区格式
  const [autoOpenMenu, setAutoOpenMenu] = useState<'text' | 'color' | 'highlight' | null>(null);

  useEffect(() => {
    if (!editingNodeId) {
      setAutoOpenMenu(null);
      return;
    }

    const checkSelectionFormat = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        // 选区为空，关闭菜单
        setAutoOpenMenu(null);
        return;
      }

      // 检测选区是否有格式
      const hasBold = isBold();
      const hasItalic = isItalic();
      const hasUnderline = isUnderline();
      const hasStrikethrough = isStrikethrough();
      const hasBgColor = hasBackgroundColor();
      const hasFgColor = hasTextColor();

      // 如果有格式，自动弹出对应菜单
      if (hasBold || hasItalic || hasUnderline || hasStrikethrough) {
        setAutoOpenMenu('text');
      } else if (hasBgColor) {
        setAutoOpenMenu('highlight');
      } else if (hasFgColor) {
        setAutoOpenMenu('color');
      } else {
        setAutoOpenMenu(null);
      }
    };

    document.addEventListener('selectionchange', checkSelectionFormat);
    return () => document.removeEventListener('selectionchange', checkSelectionFormat);
  }, [editingNodeId]);

  if (!session) return null;

  const isEditing = !!editingNodeId;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10" data-tour="chat-input">
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] border border-gray-200 overflow-hidden flex flex-col">
        {/* 顶部区域：二级菜单或 Replying to */}
        {isEditing && activeSubMenu ? (
          <FormatSubMenu menuType={activeSubMenu} onClose={() => setActiveSubMenu(null)} />
        ) : !isEditing && activeNode ? (
          <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-b border-gray-100 flex items-center gap-2">
            <CornerDownLeft size={12} />
            <span>Replying to: </span>
            <span className="text-gray-600 truncate max-w-[300px]">
              {activeNode.content
                .replace(/<[^>]*>/g, '') // 剥离 HTML 标签
                .replace(/[#*`_\[\]]/g, '')
                .replace(/\n+/g, ' ')
                .trim()
                .substring(0, 50)}
              {activeNode.content.length > 50 ? '...' : ''}
            </span>
          </div>
        ) : null}

        {/* 附件标签：让用户看到读到了多少内容、大概花多少额度 */}
        {!isEditing && attachment && (
          <div className="bg-leaf-50 px-4 py-2 text-xs border-b border-leaf-100 flex items-center gap-2">
            <Paperclip size={12} className="text-leaf-600 flex-shrink-0" />
            <span className="text-leaf-800 truncate max-w-[200px]" title={attachment.name}>
              {attachment.name}
            </span>
            <span className="text-leaf-600 flex-shrink-0">
              {attachment.totalChars.toLocaleString()} 字
            </span>
            {attachment.truncated && (
              <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex-shrink-0">
                已截断
              </span>
            )}
            {/*
              超过阈值时变色提醒。这是额度最容易被意外耗光的地方 ——
              附件会随本分支的每条后续消息重复计入。
            */}
            <span
              className={
                attachmentTokens >= LARGE_DOC_TOKENS
                  ? 'flex-shrink-0 text-amber-700 font-medium'
                  : 'flex-shrink-0 text-leaf-600'
              }
            >
              约 {attachmentTokens.toLocaleString()} tokens
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              title="移除附件"
              className="ml-auto flex-shrink-0 text-leaf-500 hover:text-red-500 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-2 flex items-end gap-2">
          {/* 工具栏主按钮 - 在对话框左边 */}
          <FormatToolbar
            isExpanded={isEditing}
            onMenuToggle={(menuType) => setActiveSubMenu(menuType)}
            autoOpenMenu={autoOpenMenu}
          />

          {/* 分隔线 - 编辑模式下显示 */}
          {isEditing && (
            <div className="w-px h-10 bg-gray-200 flex-shrink-0" />
          )}

          {/* 编辑模式：禁用的图标 */}
          {isEditing && (
            <button
              type="button"
              disabled
              className="p-3 bg-gray-100 text-gray-300 rounded-xl cursor-not-allowed flex-shrink-0"
              title="Send (disabled during editing)"
            >
              <MessageSquare size={18} />
            </button>
          )}

          {/* 正常模式：输入框和发送按钮 */}
          {!isEditing && (
            <>
              {/* 上传文档作为上下文 */}
              <button
                type="button"
                onClick={handlePickFile}
                disabled={isParsing}
                title="上传文档作为上下文（支持 .txt / .md / .csv / .json / .docx / .pdf）"
                className="p-3 text-gray-400 hover:text-leaf-600 hover:bg-leaf-50 disabled:cursor-wait disabled:text-gray-300 rounded-xl transition-colors flex-shrink-0"
              >
                {isParsing ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.csv,.json,.log,.docx,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => {
                  isComposing.current = true;
                }}
                onCompositionEnd={() => {
                  isComposing.current = false;
                }}
                onKeyDown={(e) => {
                  if (isComposing.current) return;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    setTimeout(() => handleSubmit(), 0);
                  }
                }}
                placeholder="Type your message here... (Shift+Enter for new line)"
                className="flex-1 max-h-40 min-h-[44px] bg-transparent resize-none outline-none py-3 px-3 text-sm text-gray-900 placeholder:text-gray-400 custom-scrollbar"
                rows={1}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-3 bg-leaf-600 hover:bg-leaf-700 disabled:bg-leaf-100 disabled:text-leaf-300 text-white rounded-xl transition-colors mb-1"
                data-tour="send-btn"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}