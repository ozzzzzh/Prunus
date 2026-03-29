import { Handle, Position } from '@xyflow/react';
import { Bot, User, Cpu, SplitSquareHorizontal, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PrunusNode } from '../../store/chatStore';
import { useChatStore } from '../../store/chatStore';
import { cn } from '../../utils/cn';
import { smartParseBranchesFromContent } from '../../utils/aiParser';
import { useState } from 'react';

interface MessageNodeProps {
  data: {
    node: PrunusNode;
    isActive: boolean;
  };
}

export default function MessageNode({ data }: MessageNodeProps) {
  const { node, isActive } = data;
  const focusNode = useChatStore((state) => state.focusNode);
  const splitNodeIntoBranches = useChatStore((state) => state.splitNodeIntoBranches);
  const generatingNodeId = useChatStore((state) => state.generatingNodeId);
  const [isSplitting, setIsSplitting] = useState(false);

  const isUser = node.role === 'user';
  const isSystem = node.role === 'system';
  
  // 只有 AI 或 System 节点，且不是当前高亮节点时，才允许被点击聚焦
  const isClickable = !isActive && !isUser;

  // 检查是否可以手动裂变：必须是 AI 回复，且当前节点还没有被拆分过
  const canSplit = !isUser && !isSystem && node.childrenIds.length === 0 && !isSplitting;
  
  // 判断当前节点是否正在等待 AI 回复
  const isWaitingForAI = isUser && generatingNodeId === node.id;
  
  const handleSplit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSplitting(true);
    try {
      const { outline, branches } = await smartParseBranchesFromContent(node.content);
      if (branches.length > 0) {
        splitNodeIntoBranches(node.id, outline, branches);
      } else {
        alert("The AI couldn't find a clear way to split this message into multiple distinct branches.");
      }
    } catch (error) {
      console.error("Failed to split:", error);
      alert("Failed to split the message. Please check your API connection.");
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div
      onClick={() => {
        if (isClickable) {
          focusNode(node.id);
        }
      }}
      className={cn(
        "w-[480px] rounded-2xl shadow-sm border p-4 transition-all duration-300",
        isActive 
          ? "border-blue-500 ring-4 ring-blue-500/20 bg-white" 
          : "border-slate-200 bg-slate-50 opacity-70",
        isClickable && "hover:opacity-100 cursor-pointer hover:border-blue-300 hover:shadow-md"
      )}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 opacity-0" />
      
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 pointer-events-none">
          <div className={cn(
            "p-1.5 rounded-lg flex items-center justify-center",
            isUser ? "bg-blue-100 text-blue-700" : isSystem ? "bg-slate-200 text-slate-700" : "bg-purple-100 text-purple-700"
          )}>
            {isUser ? <User size={14} /> : isSystem ? <Cpu size={14} /> : <Bot size={14} />}
          </div>
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            {node.role}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {isWaitingForAI && (
            <div className="flex items-center gap-1 text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md" title="AI is thinking...">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-[10px] font-medium">Generating...</span>
            </div>
          )}

          {isSplitting && (
            <div className="flex items-center gap-1 text-purple-500 bg-purple-50 px-2 py-0.5 rounded-md">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-[10px] font-medium">Splitting...</span>
            </div>
          )}
          
          {canSplit && isActive && !isSplitting && (
            <button
              onClick={handleSplit}
              title="Split into multiple branches"
              className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors flex items-center gap-1"
            >
              <SplitSquareHorizontal size={14} />
              <span className="text-[10px] font-medium">Branch Out</span>
            </button>
          )}

          {isActive && (
            <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full pointer-events-none">
              Active
            </span>
          )}
        </div>
      </div>
      
      <div className="text-sm text-slate-700 leading-relaxed max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
        <div className="prose prose-sm w-full max-w-none break-words pointer-events-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {node.content}
          </ReactMarkdown>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 opacity-0" />
    </div>
  );
}