import { X, Download, Brain } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useSessionStore } from '../../store/sessionStore';
import { useAPIConfigStore } from '../../store/apiConfigStore';

export default function SettingsModal() {
  const isSettingsOpen = useUIStore(state => state.isSettingsOpen);
  const toggleSettings = useUIStore(state => state.toggleSettings);
  const sessions = useSessionStore(state => state.sessions);
  const config = useAPIConfigStore(state => state.config);
  const updateConfig = useAPIConfigStore(state => state.updateConfig);

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
      <div className="bg-white rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)] w-full max-w-md p-6 border border-gray-200">
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
