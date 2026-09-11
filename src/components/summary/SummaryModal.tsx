import { useState } from 'react';
import { X, Copy, Check, Loader2, Sparkles, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import MarkdownText from '../markdown/MarkdownText';
import { summarizeNodes, type SummaryNodeInput } from '../../utils/summarize';
import { cn } from '../../utils/cn';

interface SummaryModalProps {
  nodes: SummaryNodeInput[];
  onClose: () => void;
}

export default function SummaryModal({ nodes, onClose }: SummaryModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const generate = async (instruction?: string) => {
    setLoading(true);
    setError(null);
    setHasGenerated(true);
    try {
      const content = await summarizeNodes(nodes, instruction);
      setResult(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : '总结生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = result;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-[2px]">
      <div className="bg-white rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)] w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-200 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-leaf-100 text-leaf-700 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <h2 className="text-lg font-bold text-gray-800">知识总结</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          {/* 自定义总结要求（折叠，生成前后均可编辑） */}
          <div className="mb-4">
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showCustom ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              自定义总结要求（可选）
            </button>
            {showCustom && (
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="例如：侧重对比各节点的差异，用表格呈现..."
                className="mt-2 w-full min-h-[64px] text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200 resize-y"
              />
            )}
          </div>

          {!hasGenerated ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <p className="text-sm text-gray-500">可先填写自定义总结要求，或直接生成。</p>
              <button
                onClick={() => generate(customInstruction)}
                className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-medium text-white bg-leaf-600 hover:bg-leaf-700 rounded-lg transition-colors"
              >
                <Sparkles size={16} />
                生成总结
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 size={24} className="animate-spin text-leaf-500" />
              <span className="text-sm">正在总结 {nodes.length} 个节点...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-red-600 text-center max-w-md">{error}</p>
              <button
                onClick={() => generate(customInstruction)}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                <RefreshCw size={14} />
                重试
              </button>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none">
              <MarkdownText>{result}</MarkdownText>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        {hasGenerated && !loading && !error && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <span className="text-xs text-gray-400">已总结 {nodes.length} 个节点</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => generate(customInstruction)}
                className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw size={14} />
                重新生成
              </button>
              <button
                onClick={handleCopy}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  copied ? 'bg-leaf-100 text-leaf-700' : 'bg-leaf-600 hover:bg-leaf-700 text-white'
                )}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '一键复制'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
