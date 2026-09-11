import { Handle, Position, NodeToolbar, useReactFlow } from '@xyflow/react';
import { Bot, User, Cpu, SplitSquareHorizontal, Loader2, Tag, X, Brain, Trash2, ChevronDown, ChevronRight, Lightbulb, Maximize2, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { PrunusNode, NodeMarker, AIChatNode } from '../../types';
import { isAIChatNode } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { useGenerationStore } from '../../store/generationStore';
import { reportNodeSize } from '../../store/nodeSizeStore';
import { useUIStore } from '../../store/uiStore';
import { useDialogStore } from '../../store/dialogStore';
import { cn } from '../../utils/cn';
import { DEFAULT_WIDTH, STREAMING_CARD_HEIGHT, clampSize } from '../../utils/nodeSize';
import { countRender } from '../../utils/devCounters';
import { smartParseBranchesFromContent } from '../../utils/aiParser';
import { splitContentLocally } from '../../utils/contentSplit';
import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { markdownToHtml, getSelectedHTML, saveSelectionRange, restoreSelectionRange, deleteSelection, deleteHTMLContent } from '../../utils/richtext';

const preprocessMarkdown = (text: string): string => {
  return text
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'");
};

const MARKER_OPTIONS = [
  { emoji: '🍃', label: 'Leaf' },
  { emoji: '🍑', label: 'Peach' },
  { emoji: '🪵', label: 'Trunk' },
  { emoji: '🌱', label: 'Seed' },
];

/** 角标需长按这么久才进入缩放模式，避免误触 */
const RESIZE_ARM_MS = 300;

interface MessageNodeProps {
  data: {
    node: PrunusNode;
    isActive: boolean;
  };
}

function MessageNode({ data }: MessageNodeProps) {
  countRender('MessageNode'); // 临时诊断：拖动期间的增长量 = 重渲染次数

  const { node, isActive } = data;
  const focusNode = useChatStore((state) => state.focusNode);
  const splitNodeIntoBranches = useChatStore((state) => state.splitNodeIntoBranches);
  const setNodeMarker = useChatStore((state) => state.setNodeMarker);
  const toggleNodeCollapse = useChatStore((state) => state.toggleNodeCollapse);
  const deleteNode = useSessionStore((state) => state.deleteNode);
  const updateNodeContent = useSessionStore((state) => state.updateNodeContent);
  const editingNodeId = useUIStore((state) => state.editingNodeId);
  const setEditingNode = useUIStore((state) => state.setEditingNode);
  const setExpandedNode = useUIStore((state) => state.setExpandedNode);
  const isSelectingMode = useUIStore((state) => state.isSelectingMode);
  const isSelected = useUIStore((state) => state.selectedNodeIds.includes(node.id));
  const toggleNodeSelection = useUIStore((state) => state.toggleNodeSelection);
  const [isSplitting, setIsSplitting] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  // 临时存储编辑后的内容，用于退出编辑模式时避免闪烁
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  // 保存右键时的选中内容（防止浏览器清空选区）
  const [savedSelection, setSavedSelection] = useState<string>('');
  // 保存右键时的选区 Range 信息（用于移动摘取时恢复选区并删除）
  const [savedRange, setSavedRange] = useState<ReturnType<typeof saveSelectionRange>>(null);
  // 菜单点击动画状态
  const [clickedItem, setClickedItem] = useState<'copy' | 'cut' | null>(null);
  // 菜单淡出动画状态
  const [menuFading, setMenuFading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const prevCollapsedRef = useRef(node.collapsed);

  // 是否处于编辑模式
  const isEditing = editingNodeId === node.id;

  // ===== 手动缩放节点 =====
  const setNodeSize = useSessionStore((state) => state.setNodeSize);
  const { getZoom } = useReactFlow();

  // 拖拽中的实时尺寸：只存本地 state，避免每次 pointermove 都触发全树重排
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const armedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, w: 0, h: 0, pointerId: -1 });
  const armTimerRef = useRef<number | null>(null);
  // liveSize 的 ref 镜像：pointerup 时可能尚未重渲染，读 state 会拿到旧值
  const liveSizeRef = useRef<{ w: number; h: number } | null>(null);

  // 从展开变成收缩时，自动显示 tooltip
  useEffect(() => {
    if (!prevCollapsedRef.current && node.collapsed && node.marker) {
      setShowTooltip(true);
    }
    prevCollapsedRef.current = node.collapsed;
  }, [node.collapsed, node.marker]);

  // 流式内容 — 仅当前 streaming 节点订阅真实内容，其余节点返回空值避免无意义重渲染
  const generatingNodeId = useGenerationStore((state) => state.generatingNodeId);
  const isThisStreaming = generatingNodeId === node.id;
  const streamingContent = useGenerationStore((state) =>
    state.generatingNodeId === node.id ? state.streamingContent : ''
  );
  const streamingReasoning = useGenerationStore((state) =>
    state.generatingNodeId === node.id ? state.streamingReasoning : ''
  );
  const isReasoning = useGenerationStore((state) =>
    state.generatingNodeId === node.id ? state.isReasoning : false
  );

  // ===== 实测高度上报（布局需要真实高度才能算出精确层间距）=====
  // 只在内容自适应（非固定高度）时才有意义：固定高度时尺寸不随内容变，无需测量。
  // node.collapsed 必须在依赖里：收缩态没有卡片可观察，展开时需重新执行才能挂上。
  //
  // 两种情形要抑制上报，否则都会让整棵树逐帧/逐键重排：
  //   - 编辑中：内容自适应下每敲一个字卡片高度都变
  //   - 拖拽缩放中：卡片每帧都在变大小（实时尺寸已由 liveSize 本地承担）
  const isEditingRef = useRef(isEditing);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  const isResizingRef = useRef(isResizing);
  useEffect(() => {
    isResizingRef.current = isResizing;
  }, [isResizing]);

  useEffect(() => {
    if (node.collapsed) return;
    const el = cardRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (isEditingRef.current || isResizingRef.current) return;
      // offsetHeight 是 border-box 的布局像素，不受画布 zoom 影响。
      // 读 border-box 而非 content-box 是关键：否则滚动条出现/消失会造成宽度抖动。
      // reportNodeSize 内部用 rAF 推迟到下一帧，避免在 RO 回调里同步改 store
      // 造成「测量 → 重排 → 再测量」的同周期循环。
      reportNodeSize(node.id, { width: el.offsetWidth, height: el.offsetHeight });
    });

    observer.observe(el, { box: 'border-box' });
    return () => observer.disconnect();
  }, [node.id, node.collapsed]);

  // 编辑结束时补一次测量：编辑期间被抑制，而尺寸可能已经变了却不会再触发 RO
  useEffect(() => {
    if (isEditing || node.collapsed) return;
    const el = cardRef.current;
    if (!el) return;
    reportNodeSize(node.id, { width: el.offsetWidth, height: el.offsetHeight });
  }, [isEditing, node.id, node.collapsed]);

  // ===== 长按右下角标缩放 =====
  const clearArmTimer = () => {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  };

  const resetResizeVisuals = () => {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    armedRef.current = false;
    liveSizeRef.current = null;
    setIsResizing(false);
    setLiveSize(null);
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 中/右键留给画布平移
    if (isEditing || isSelectingMode) return;
    // pointerdown 的 stopPropagation 不会抑制随后的合成 click，
    // 因此角标上还需单独拦截 click/dblclick（见 JSX）。
    e.stopPropagation();
    e.preventDefault();

    const card = cardRef.current;
    if (!card) return;

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: node.width ?? card.offsetWidth,
      h: node.height ?? card.offsetHeight,
      pointerId: e.pointerId,
    };
    armedRef.current = false;

    const handle = e.currentTarget;
    clearArmTimer();
    armTimerRef.current = window.setTimeout(() => {
      armTimerRef.current = null;
      armedRef.current = true;
      setIsResizing(true);
      liveSizeRef.current = { w: dragStartRef.current.w, h: dragStartRef.current.h };
      setLiveSize(liveSizeRef.current);
      try {
        handle.setPointerCapture(dragStartRef.current.pointerId);
      } catch {
        // 指针已释放，忽略
      }
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'nwse-resize';
    }, RESIZE_ARM_MS);
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!armedRef.current) return;
    e.stopPropagation();

    const zoom = getZoom() || 1;
    const next = clampSize({
      width: dragStartRef.current.w + (e.clientX - dragStartRef.current.x) / zoom,
      height: dragStartRef.current.h + (e.clientY - dragStartRef.current.y) / zoom,
    });
    liveSizeRef.current = { w: next.width, h: next.height };
    setLiveSize(liveSizeRef.current);
  };

  const handleResizeEnd = () => {
    clearArmTimer();
    if (!armedRef.current) return; // 短按：完全无副作用

    const finalSize = liveSizeRef.current;
    resetResizeVisuals();
    if (finalSize) {
      setNodeSize(node.id, { width: finalSize.w, height: finalSize.h });
    }
  };

  const handleResizeCancel = () => {
    clearArmTimer();
    if (!armedRef.current) return;
    resetResizeVisuals();
  };

  // 拖拽中按 Escape 取消（不提交）
  useEffect(() => {
    if (!isResizing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleResizeCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // 卸载时清掉定时器与 body 上的临时样式
  useEffect(() => () => {
    clearArmTimer();
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  // 视口剔除会让节点滚出视野时卸载。若此时正处于编辑态，组件内的 editorContent
  // 会随之丢失；节点重新进入视野时会重新挂载，编辑器内容为空却仍标记为「编辑中」，
  // 一旦失焦就会把空内容写回节点 —— 静默的数据丢失。卸载时必须清掉编辑态。
  // （代价：滚出视野时未保存的编辑内容会被丢弃，而不是写入空值。）
  useEffect(
    () => () => {
      const ui = useUIStore.getState();
      if (ui.editingNodeId === node.id) {
        ui.setEditingNode(null);
      }
    },
    [node.id]
  );

  useEffect(() => {
    if (node.collapsed) return;
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const handleWheelCapture = (e: WheelEvent) => {
      const target = contentEl;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const hasScrollbar = scrollHeight > clientHeight;

      if (hasScrollbar) {
        const atTop = scrollTop === 0;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
        const scrollingUp = e.deltaY < 0;
        const scrollingDown = e.deltaY > 0;

        if (!((scrollingUp && atTop) || (scrollingDown && atBottom))) {
          e.stopPropagation();
        }
      }
    };

    contentEl.addEventListener('wheel', handleWheelCapture, { capture: true });
    return () => contentEl.removeEventListener('wheel', handleWheelCapture, { capture: true });
  }, [node.collapsed]);

  const isAIChat = isAIChatNode(node);
  const role = isAIChat ? node.role : null;
  const isUser = role === 'user';
  const isSystem = role === 'system';

  const isClickable = !isActive;
  const canSplit = isAIChat && role === 'assistant' && node.childrenIds.length === 0 && !isSplitting;

  // 判断是否为根节点
  const isRootNode = !node.parentId;

  // 判断当前节点是否正在流式生成
  const isStreaming = isAIChat && role === 'assistant' && isThisStreaming;

  // Reasoning 相关状态和内容
  const [reasoningExpanded, setReasoningExpanded] = useState(true);
  const nodeReasoning = isAIChat ? (node as AIChatNode).reasoning : undefined;
  const nodeReasoningCollapsed = isAIChat ? (node as AIChatNode).reasoningCollapsed : undefined;
  const displayReasoning = isStreaming ? streamingReasoning : nodeReasoning;

  // 当流式生成完成后，同步折叠状态
  useEffect(() => {
    if (!isStreaming && nodeReasoningCollapsed !== undefined) {
      setReasoningExpanded(!nodeReasoningCollapsed);
    }
  }, [isStreaming, nodeReasoningCollapsed]);

  // 获取显示内容：优先使用临时内容（避免退出编辑模式时闪烁），然后是流式内容，最后是节点内容
  const displayContent = pendingContent || ((isStreaming && streamingContent.length > 0) ? streamingContent : node.content);

  // 当节点内容更新后，清除临时内容
  useEffect(() => {
    if (pendingContent && node.content === pendingContent) {
      setPendingContent(null);
    }
  }, [node.content, pendingContent]);

  // Markdown 渲染结果按内容缓存。
  // 这是整个节点最贵的操作（remark-gfm 解析 + rehype-raw 重建 HTML），
  // 不缓存的话，父组件每次重渲染都会把所有可见节点的全文重新解析一遍。
  const renderedReasoning = useMemo(
    () =>
      displayReasoning ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {preprocessMarkdown(displayReasoning)}
        </ReactMarkdown>
      ) : null,
    [displayReasoning]
  );

  const renderedContent = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {preprocessMarkdown(displayContent)}
      </ReactMarkdown>
    ),
    [displayContent]
  );

  // 获取缩略信息（剥离 HTML 标签和 markdown 符号）
  const getSummary = () => {
    // 先剥离 HTML 标签
    const textWithoutHtml = node.content.replace(/<[^>]*>/g, '');
    // 再移除 markdown 符号
    const text = textWithoutHtml.replace(/[#*`_\[\]]/g, '').trim();
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  };

  const handleSplit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSplitting(true);
    try {
      // 先尝试本地结构化拆分（毫秒级），失败再回退 LLM
      let outline: string;
      let branches: string[];

      const local = splitContentLocally(node.content);
      if (local) {
        outline = local.outline;
        branches = local.branches;
      } else {
        const result = await smartParseBranchesFromContent(node.content);
        outline = result.outline;
        branches = result.branches;
      }

      if (branches.length > 0) {
        splitNodeIntoBranches(node.id, outline, branches);
      } else {
        useDialogStore.getState().showToast('AI 未能将这条消息拆分为多个独立分支。', { type: 'info' });
      }
    } catch (error) {
      console.error("Failed to split:", error);
      useDialogStore.getState().showToast('拆分失败，请检查 API 连接。', { type: 'error' });
    } finally {
      setIsSplitting(false);
    }
  };

  const handleMarkerSelect = (emoji: NodeMarker | undefined) => {
    setNodeMarker(node.id, emoji);
    setShowToolbar(false);
  };

  const handleCollapseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelectingMode) {
      if (!isRootNode) {
        toggleNodeSelection(node.id);
      }
      return;
    }
    toggleNodeCollapse(node.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSelectingMode) return;

    // 编辑模式下的特殊处理
    if (isEditing) {
      // 根节点不能摘取（因为没有父节点，无法创建兄弟节点）
      if (!node.parentId) {
        return;
      }

      // 立即保存选中的HTML内容（防止浏览器清空选区）
      const selectionHTML = getSelectedHTML();
      if (!selectionHTML) {
        // 没有选中文字，不显示菜单
        return;
      }

      // 保存选区内容和 Range 信息
      setSavedSelection(selectionHTML);

      // 保存 Range 信息（用于移动摘取时恢复并删除）
      // 传递编辑器元素，确保路径计算正确
      if (editRef.current) {
        const rangeInfo = saveSelectionRange(editRef.current);
        if (rangeInfo) {
          setSavedRange(rangeInfo);
        }
      }
    }

    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleDelete = () => {
    // 不能删除根节点
    if (node.parentId) {
      deleteNode(node.id);
    }
    setShowContextMenu(false);
  };

  // 摘取操作 - 复制模式
  const handleExtractCopy = () => {
    if (!savedSelection) return;

    // 创建新节点作为当前节点的兄弟节点
    const parentId = node.parentId ?? undefined;

    // 继承当前节点的角色
    const role = isAIChat ? node.role : 'user';

    // 创建新节点
    const newNodeId = useSessionStore.getState().addMessage(role, savedSelection, parentId);

    // 清空保存的选区
    setSavedSelection('');

    // 退出编辑模式
    setEditingNode(null);

    // 聚焦到新节点
    focusNode(newNodeId);

    // 关闭菜单
    setShowContextMenu(false);
  };

  // 摘取操作 - 移动模式
  const handleExtractCut = () => {
    if (!savedSelection || !editRef.current) return;

    const editorEl = editRef.current;

    // 1. 尝试恢复选区并删除
    let deleted = false;
    let remainingHTML = '';

    if (savedRange) {
      // 先聚焦编辑器
      editorEl.focus();

      // 尝试恢复选区
      const restored = restoreSelectionRange(savedRange, editorEl);

      if (restored) {
        // 使用 Range API 直接删除
        deleted = deleteSelection();
      }
    }

    // 2. 如果通过恢复选区删除失败，使用备用方案
    if (!deleted) {
      // 直接从编辑器内容中删除匹配的 HTML
      const result = deleteHTMLContent(savedSelection, editorEl);
      if (result !== null) {
        remainingHTML = result;
        deleted = true;
      } else {
        // 最后的备选：使用原始内容减去选中内容（简单文本匹配）
        const originalContent = editorEl.innerHTML;
        // 尝试直接替换 HTML
        const newContent = originalContent.replace(savedSelection, '');
        if (newContent !== originalContent) {
          remainingHTML = newContent;
          deleted = true;
        }
      }
    }

    // 3. 获取删除后的编辑器内容（如果还没获取）
    if (!remainingHTML) {
      remainingHTML = editorEl.innerHTML;
    }

    // 4. 更新当前节点内容
    updateNodeContent(node.id, remainingHTML);

    // 5. 创建新节点
    const parentId = node.parentId ?? undefined;
    const role = isAIChat ? node.role : 'user';
    const newNodeId = useSessionStore.getState().addMessage(role, savedSelection, parentId);

    // 6. 清空保存的选区
    setSavedSelection('');
    setSavedRange(null);

    // 7. 退出编辑模式
    setEditingNode(null);

    // 8. 聚焦到新节点
    focusNode(newNodeId);

    // 9. 关闭菜单
    setShowContextMenu(false);
  };

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClick = () => setShowContextMenu(false);
    if (showContextMenu) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [showContextMenu]);

  // 防止重复保存的标记
  const isSavingRef = useRef(false);
  // 记录编辑前的内容
  const originalContentRef = useRef<string>('');
  // 编辑器内容状态（用于 React 控制渲染）
  const [editorContent, setEditorContent] = useState<string>('');
  // 标记编辑器是否已完成初始化
  const isInitializedRef = useRef(false);

  // 进入编辑模式
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isSelectingMode) return;
    if (!isStreaming) {
      // 重置所有标记
      isSavingRef.current = false;
      // 记录编辑前的内容
      originalContentRef.current = node.content;
      // 重置初始化标记
      isInitializedRef.current = false;
      // 直接设置编辑器内容（同步，不依赖 useEffect）
      const isHtml = node.content.includes('<') && node.content.includes('>');
      if (isHtml) {
        setEditorContent(node.content);
        isInitializedRef.current = true;
      } else {
        // 如果不是 HTML，异步转换
        markdownToHtml(node.content).then((html) => {
          // 只有当仍然处于编辑模式时才设置内容
          if (useUIStore.getState().editingNodeId === node.id) {
            setEditorContent(html);
            isInitializedRef.current = true;
          }
        });
      }
      setEditingNode(node.id);
    }
  };

  // 当退出编辑模式时，清空编辑器内容状态
  useEffect(() => {
    if (!isEditing) {
      setEditorContent('');
      isInitializedRef.current = false;
    }
  }, [isEditing]);

  // 当编辑器内容设置完成后，聚焦并将光标移动到末尾
  useEffect(() => {
    if (isEditing && editorContent && editRef.current) {
      // 使用 setTimeout 确保 DOM 更新完成
      setTimeout(() => {
        if (editRef.current && isEditing) {
          editRef.current.focus();
          // 将光标移动到末尾
          const range = document.createRange();
          const selection = window.getSelection();
          if (selection && editRef.current.childNodes.length > 0) {
            range.selectNodeContents(editRef.current);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }, 0);
    }
  }, [isEditing, editorContent]);

  // 退出编辑模式并保存内容
  const handleEditBlur = (e: React.FocusEvent) => {
    // 防止事件冒泡
    e.stopPropagation();

    // 如果编辑器还没初始化完成，直接退出
    if (!isInitializedRef.current) {
      setEditingNode(null);
      return;
    }

    // 防止重复保存
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    if (editRef.current) {
      const newContent = editRef.current.innerHTML;
      // 先设置临时内容，避免退出编辑模式时闪烁
      setPendingContent(newContent);
      // 只有内容真正改变时才更新
      if (newContent !== originalContentRef.current) {
        updateNodeContent(node.id, newContent);
      }
    }
    setEditingNode(null);
  };

  // 处理编辑器粘贴事件 - 使用浏览器默认行为
  const handleEditPaste = () => {
    // 不阻止默认行为，让浏览器处理粘贴
  };

  // 收缩状态：用 NodeToolbar 显示 tooltip，避免被连接线遮挡
  if (node.collapsed && node.marker) {
    return (
      <>
        <div
          className="w-14 h-14 flex items-center justify-center"
          onContextMenu={handleContextMenu}
        >
          <div
            onClick={handleCollapseClick}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className={cn(
              "w-14 h-14 rounded-full bg-white shadow-lg border-2 flex items-center justify-center cursor-pointer transition-transform duration-200",
              isSelectingMode && isSelected
                ? "scale-110 border-leaf-500 ring-4 ring-leaf-200 shadow-xl"
                : isActive
                  ? "scale-110 border-leaf-400 shadow-xl"
                  : "border-gray-200 hover:scale-110 hover:border-leaf-300",
              isSelectingMode && !isSelected && isRootNode && "opacity-40"
            )}
            title={isSelectingMode ? "点击选中" : "Click to expand"}
          >
            <span className="text-2xl">{node.marker}</span>
          </div>

          <Handle type="target" position={Position.Top} className="!top-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
          <Handle type="source" position={Position.Bottom} className="!bottom-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />
        </div>

        {/* 使用 NodeToolbar 渲染 tooltip，在最顶层显示 */}
        <NodeToolbar
          isVisible={showTooltip}
          position={Position.Bottom}
          offset={8}
          className="!bg-gray-900 text-white text-xs rounded-lg px-4 py-2.5 shadow-lg w-64"
        >
          <div className="font-medium mb-1">{node.marker} {role}</div>
          <div className="text-gray-300 text-[11px] leading-relaxed">{getSummary()}</div>
        </NodeToolbar>

        {/* 右键菜单 - 使用 Portal 渲染到 body */}
        {showContextMenu && node.parentId && createPortal(
          <div
            className="fixed z-[1000] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>,
          document.body
        )}
      </>
    );
  }

  // 卡片尺寸：
  //   宽度始终显式（默认 480 或用户手动值）；
  //   高度默认留给内容自适应，仅在「用户手动设定过」或「拖拽中」或「流式生成中」才锁死。
  // 高度锁死时内容区改为吃满剩余空间并在内部滚动。
  const isFixedHeight = node.height !== undefined || liveSize !== null || isStreaming;
  const cardStyle: React.CSSProperties = liveSize
    ? { width: liveSize.w, height: liveSize.h }
    : {
        width: node.width ?? DEFAULT_WIDTH,
        ...(node.height !== undefined
          ? { height: node.height }
          : isStreaming
            ? { height: STREAMING_CARD_HEIGHT }
            : {}),
      };

  return (
    <>
      <div
        ref={cardRef}
        onClick={(e) => {
          if (isResizing) return;
          if (isSelectingMode) {
            e.stopPropagation();
            if (!isRootNode) {
              toggleNodeSelection(node.id);
            }
            return;
          }
          if (isEditing) {
            e.stopPropagation();
            return;
          }
          if (isClickable) {
            focusNode(node.id);
          }
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={cardStyle}
        className={cn(
          // 注意：不能对卡片用 transition-all —— 它会动画 width/height，
          // 而 React Flow 靠测量节点几何来画连接线，几何持续变化会导致
          // 测量错乱、连接线整条消失。只过渡颜色类属性：
          // opacity 可能触发图层提升、box-shadow 重绘昂贵，都不进过渡列表。
          "group rounded-2xl border p-4 flex flex-col relative",
          "transition-[background-color,border-color] duration-300",
          isResizing && "!transition-none select-none",
          isEditing && "editing-mode",
          isEditing
            ? "border-leaf-500 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)] z-30 ring-2 ring-leaf-200"
            : isActive
              ? "border-leaf-400 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] z-20"
              : "border-gray-200 bg-white/80 opacity-60 shadow-sm z-0",
          isSelectingMode && !isEditing && isSelected && "border-leaf-500 ring-2 ring-leaf-300 bg-white opacity-100 z-20 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)]",
          isSelectingMode && !isEditing && !isSelected && !isRootNode && "bg-white opacity-100 hover:border-leaf-300 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)]",
          isSelectingMode && !isEditing && !isSelected && isRootNode && "opacity-40",
          !isEditing && !isSelectingMode && isClickable && "hover:opacity-100 cursor-pointer hover:border-leaf-300 hover:bg-white hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] hover:z-10"
        )}
        data-tour={isActive ? "current-node" : isRootNode ? "root-node" : undefined}
      >
        {node.marker && (
          <div
            onClick={handleCollapseClick}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-lg z-10 cursor-pointer hover:scale-110 hover:shadow-lg transition-transform duration-200"
            title="Click to collapse"
          >
            {node.marker}
          </div>
        )}

        {isSelectingMode && isSelected && (
          <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-leaf-600 text-white flex items-center justify-center z-10 shadow-md">
            <Check size={16} />
          </div>
        )}

        <Handle type="target" position={Position.Top} className="!top-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />

        <div className="flex justify-between items-center mb-3 shrink-0">
          <div className="flex items-center gap-2 pointer-events-none">
            <div className={cn(
              "p-1.5 rounded-lg flex items-center justify-center",
              isUser ? "bg-leaf-100 text-leaf-700" : isSystem ? "bg-gray-100 text-gray-600" : "bg-blossom-light text-leaf-700"
            )}>
              {isUser ? <User size={14} /> : isSystem ? <Cpu size={14} /> : <Bot size={14} />}
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {role}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 正在思考图标 */}
            {isStreaming && isReasoning && (
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md" title="Model is thinking...">
                <Brain size={12} className="animate-pulse" />
                <span className="text-[10px] font-medium">Thinking...</span>
              </div>
            )}

            {/* 正在生成内容 */}
            {isStreaming && !isReasoning && (
              <div className="flex items-center gap-1 text-leaf-600 bg-leaf-50 px-2 py-0.5 rounded-md">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[10px] font-medium">Streaming...</span>
              </div>
            )}

            {isSplitting && (
              <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[10px] font-medium">分析中…</span>
              </div>
            )}

            {canSplit && isActive && !isSplitting && !isSelectingMode && (
              <button
                onClick={handleSplit}
                title="Split into multiple branches"
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
                data-tour="branch-out-btn"
              >
                <SplitSquareHorizontal size={14} />
                <span className="text-[10px] font-medium">Branch Out</span>
              </button>
            )}

            {/* 展开按钮：仅叶子节点显示 */}
            {isActive && node.childrenIds.length === 0 && !isSelectingMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedNode(node.id);
                }}
                title="展开链路编辑"
                className="p-1.5 text-gray-400 hover:text-leaf-600 hover:bg-leaf-50 rounded-md transition-colors"
                data-tour="expand-btn"
              >
                <Maximize2 size={14} />
              </button>
            )}

            {isActive && !isUser && !isSelectingMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowToolbar(!showToolbar);
                }}
                title="Add marker"
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  showToolbar ? "bg-leaf-100 text-leaf-600" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                )}
              >
                <Tag size={14} />
              </button>
            )}

            {isEditing && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full pointer-events-none">
                Editing
              </span>
            )}

            {!isEditing && isActive && (
              <span className="text-[10px] font-medium text-leaf-600 bg-leaf-50 px-2 py-0.5 rounded-full pointer-events-none">
                Active
              </span>
            )}
          </div>
        </div>

        {/* Reasoning 内容 - 思考过程 */}
        {displayReasoning && displayReasoning.length > 0 && !isEditing && (
          <div className="mb-3 border-l-2 border-amber-300 bg-amber-50/50 rounded-r-lg overflow-hidden shrink-0">
            {/* 标题栏 - 可点击折叠 */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-amber-100/50 transition-colors"
              onClick={() => setReasoningExpanded(!reasoningExpanded)}
            >
              {isStreaming && isReasoning ? (
                <Loader2 size={12} className="animate-spin text-amber-600" />
              ) : (
                <Lightbulb size={12} className="text-amber-600" />
              )}
              <span className="text-xs font-medium text-amber-700">
                {isStreaming ? '思考中...' : '思考过程'}
              </span>
              <span className="ml-auto">
                {reasoningExpanded ? (
                  <ChevronDown size={14} className="text-amber-500" />
                ) : (
                  <ChevronRight size={14} className="text-amber-500" />
                )}
              </span>
            </div>
            {/* 内容区域 */}
            {reasoningExpanded && (
              <div className="px-3 py-2 text-xs text-gray-600 leading-relaxed border-t border-amber-200/50 max-h-[150px] overflow-y-auto custom-scrollbar">
                <div className="prose prose-xs max-w-none">
                  {renderedReasoning}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 主内容 */}
        <div
          ref={contentRef}
          className={cn(
            "text-sm text-gray-900 leading-relaxed pr-1 custom-scrollbar",
            // 固定高度：内容吃满剩余空间并在内部滚动；
            // 内容自适应：按内容撑开卡片高度，超过 300px 才滚动
            isFixedHeight ? "flex-1 min-h-0 overflow-y-auto" : "overflow-y-auto max-h-[300px]"
          )}
          onDoubleClick={handleDoubleClick}
        >
          {isEditing ? (
            <div
              ref={editRef}
              contentEditable
              onBlur={handleEditBlur}
              onPaste={handleEditPaste}
              onKeyDown={(e) => {
                // 阻止方向键冒泡（避免触发节点导航）
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                  e.stopPropagation();
                }
                // 如果按 Escape，退出编辑模式
                if (e.key === 'Escape') {
                  editRef.current?.blur();
                }
              }}
              className="outline-none min-h-[60px] w-full max-w-none break-words prose prose-sm"
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: editorContent }}
            />
          ) : (
            <div className="prose prose-sm w-full max-w-none break-words">
              {renderedContent}
            </div>
          )}
        </div>

        <Handle type="source" position={Position.Bottom} className="!bottom-0 !left-1/2 !-translate-x-1/2 !w-2 !h-2 opacity-0" />

        {/* 右下角缩放角标：长按 0.3s 后拖动 */}
        {!isEditing && !isSelectingMode && (
          <div
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeCancel}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            title="长按 0.3s 后拖动调整大小"
            className={cn(
              "nodrag nopan touch-none absolute bottom-0 right-0 w-5 h-5 z-20 flex items-end justify-end cursor-nwse-resize transition-opacity",
              isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            {/* 两道 45° 细线，与卡片边框同一视觉语言；不用实心圆以免破坏整体一致性 */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              className={cn(
                "mr-1.5 mb-1.5 transition-colors",
                isResizing ? "text-leaf-500" : "text-gray-300 group-hover:text-gray-400"
              )}
            >
              <path
                d="M10 1.5 L1.5 10"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <path
                d="M10 6 L6 10"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>

      <NodeToolbar
        isVisible={showToolbar}
        position={Position.Top}
        offset={8}
        className="bg-white rounded-xl shadow-lg border border-gray-200 p-2 flex gap-1"
      >
        {MARKER_OPTIONS.map((option) => (
          <button
            key={option.emoji}
            onClick={() => handleMarkerSelect(option.emoji as NodeMarker)}
            title={option.label}
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-colors",
              node.marker === option.emoji
                ? "bg-leaf-100 ring-2 ring-leaf-400"
                : "hover:bg-gray-100"
            )}
          >
            {option.emoji}
          </button>
        ))}
        {node.marker && (
          <button
            onClick={() => handleMarkerSelect(undefined)}
            title="Remove marker"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </NodeToolbar>

      {/* 右键菜单 - 使用 Portal 渲染到 body */}
      {showContextMenu && createPortal(
        <div
          className={cn(
            "fixed z-[1000] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] transition-opacity duration-150",
            menuFading && "opacity-0"
          )}
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onMouseDown={(e) => {
            // 只阻止冒泡，不阻止默认行为（让 Ctrl+C/V 仍然工作）
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 有保存的选中内容时显示摘取菜单 */}
          {savedSelection ? (
            <>
              <div className="px-3 py-1.5 text-xs text-gray-400 font-medium border-b border-gray-100">
                摘取选中内容
              </div>
              {/* 选中内容预览 */}
              <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100 max-w-[200px]">
                <span className="line-clamp-2 break-words">
                  "{savedSelection.replace(/<[^>]*>/g, '')}"
                </span>
              </div>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setClickedItem('copy');
                  setMenuFading(true);
                  setTimeout(() => {
                    handleExtractCopy();
                    setClickedItem(null);
                    setMenuFading(false);
                  }, 150);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-leaf-50 hover:text-leaf-700 transition-all duration-150",
                  clickedItem === 'copy' && "bg-leaf-100 text-leaf-700 scale-[0.98]"
                )}
              >
                <span className="text-base">📋</span>
                <span>复制摘取</span>
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setClickedItem('cut');
                  setMenuFading(true);
                  setTimeout(() => {
                    handleExtractCut();
                    setClickedItem(null);
                    setMenuFading(false);
                  }, 150);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-leaf-50 hover:text-leaf-700 transition-all duration-150",
                  clickedItem === 'cut' && "bg-leaf-100 text-leaf-700 scale-[0.98]"
                )}
              >
                <span className="text-base">✂️</span>
                <span>移动摘取</span>
              </button>
            </>
          ) : (
            /* 非编辑模式下显示删除菜单 */
            node.parentId && (
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />
                <span>删除节点</span>
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * 只比较真正影响渲染结果的字段。
 *
 * React Flow 会在每次布局重算时重建整个 node 对象（`data` 引用必然变化），
 * 默认的浅比较会失效，所以必须自己挑字段比。漏掉哪个字段就会导致该字段
 * 更新时节点不刷新——新增可渲染的节点字段时，记得同步加到这里。
 */
function arePropsEqual(prev: MessageNodeProps, next: MessageNodeProps): boolean {
  if (prev.data.isActive !== next.data.isActive) return false;

  const a = prev.data.node;
  const b = next.data.node;
  if (a === b) return true;

  const aChat = isAIChatNode(a) ? a : null;
  const bChat = isAIChatNode(b) ? b : null;

  return (
    a.id === b.id &&
    a.content === b.content &&
    a.marker === b.marker &&
    a.collapsed === b.collapsed &&
    a.width === b.width &&
    a.height === b.height &&
    a.childrenIds.length === b.childrenIds.length &&
    aChat?.role === bChat?.role &&
    aChat?.reasoning === bChat?.reasoning &&
    aChat?.reasoningCollapsed === bChat?.reasoningCollapsed
  );
}

export default memo(MessageNode, arePropsEqual);
