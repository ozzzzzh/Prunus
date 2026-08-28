import { useEffect, useState } from 'react';
import { X, Download, Brain, Ticket } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useSessionStore } from '../../store/sessionStore';
import { useAPIConfigStore } from '../../store/apiConfigStore';
import { fetchQuota } from '../../utils/cdkService';
import { cn } from '../../utils/cn';

export default function SettingsModal() {
  const isSettingsOpen = useUIStore(state => state.isSettingsOpen);
  const toggleSettings = useUIStore(state => state.toggleSettings);
  const sessions = useSessionStore(state => state.sessions);
  const config = useAPIConfigStore(state => state.config);
  const updateConfig = useAPIConfigStore(state => state.updateConfig);
  const resetConfig = useAPIConfigStore(state => state.resetConfig);

  // CDK 额度
  const [quota, setQuota] = useState<{ quota: number; used_quota: number; remaining: number } | null>(null);

  useEffect(() => {
    if (isSettingsOpen && config.mode === 'cdk' && config.apiKey) {
      fetchQuota(config.apiKey)
        .then(setQuota)
        .catch(() => setQuota(null));
    } else {
      setQuota(null);
    }
  }, [isSettingsOpen, config.mode, config.apiKey]);

  // 导出 sessions 为 JSON 文件
  const handleExport = () => {
    const data = JSON.stringify({ sessions }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prunus-sessions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-[2px]">
      <div className="bg-white rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)] w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Settings</h2>
          <button
            onClick={() => toggleSettings(false)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* AI 推理设置 */}
        <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Brain size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">深度思考</h3>
                <p className="text-xs text-gray-500 mt-0.5">让 AI 先思考再回答</p>
              </div>
            </div>
            {/* Toggle Switch */}
            <button
              onClick={() => updateConfig({ enableThinking: !config.enableThinking })}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                config.enableThinking ? 'bg-amber-500' : 'bg-gray-300'
              }`}
              title={config.enableThinking ? '关闭深度思考' : '开启深度思考'}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                  config.enableThinking ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
          {config.enableThinking && (
            <p className="text-xs text-amber-600 mt-3 bg-amber-100/50 rounded-lg px-2 py-1.5">
              💡 已开启：AI 会先展示思考过程，再给出最终答案
            </p>
          )}
        </div>

        {/* API 配置 */}
        <div className="pt-4 border-t border-gray-100 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">API 配置</h3>

          {/* CDK 模式：额度 + 重新配置 */}
          {config.mode === 'cdk' && (
            <div className="mb-4 p-3 bg-leaf-50 rounded-lg border border-leaf-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Ticket size={14} /> 兑换码模式（社区版）
                </span>
                <button
                  onClick={() => { resetConfig(); toggleSettings(false); }}
                  className="text-xs text-gray-500 hover:text-leaf-600"
                >
                  重新配置
                </button>
              </div>
              <p className="text-xs text-gray-600">
                剩余额度：
                <span className="font-medium text-leaf-700">
                  {quota ? `${quota.remaining.toLocaleString()} / ${quota.quota.toLocaleString()}` : '加载中...'}
                </span>
              </p>
            </div>
          )}

          {/* BYOK 模式标签 */}
          {config.mode === 'byok' && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">自己的 Key 模式</span>
              <button
                onClick={() => { resetConfig(); toggleSettings(false); }}
                className="text-xs text-gray-500 hover:text-leaf-600"
              >
                重新配置
              </button>
            </div>
          )}

          {/* BYOK 输入（非 CDK 模式显示） */}
          {config.mode !== 'cdk' && (
            <>
              <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                填写 Base URL 与 API Key 后，将使用你自己的 Key 直连大模型。
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">协议 Protocol</label>
                  <div className="mt-1 flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => updateConfig({ protocol: 'openai' })}
                      className={cn(
                        'flex-1 px-3 py-1.5 text-xs rounded-md transition-colors',
                        config.protocol === 'openai' ? 'bg-white shadow-sm text-leaf-700 font-medium' : 'text-gray-500 hover:text-gray-700'
                      )}
                    >
                      OpenAI
                    </button>
                    <button
                      onClick={() => updateConfig({ protocol: 'anthropic' })}
                      className={cn(
                        'flex-1 px-3 py-1.5 text-xs rounded-md transition-colors',
                        config.protocol === 'anthropic' ? 'bg-white shadow-sm text-leaf-700 font-medium' : 'text-gray-500 hover:text-gray-700'
                      )}
                    >
                      Anthropic
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">模型 Model</label>
                  <input
                    value={config.model}
                    onChange={(e) => updateConfig({ model: e.target.value })}
                    placeholder="deepseek-v4-flash"
                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Base URL</label>
                  <input
                    value={config.baseUrl}
                    onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                    placeholder={config.protocol === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.deepseek.com'}
                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">API Key</label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => updateConfig({ apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* 数据管理 */}
        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Data Management</h3>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors text-sm"
            >
              <Download size={16} />
              Export Data
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Export your conversation tree as JSON file
          </p>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => toggleSettings(false)}
            className="px-4 py-2 bg-leaf-600 hover:bg-leaf-700 text-white font-medium rounded-lg transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
