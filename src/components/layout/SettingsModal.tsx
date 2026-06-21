import { X, Download, FileJson } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useSessionStore } from '../../store/sessionStore';

export default function SettingsModal() {
  const isSettingsOpen = useUIStore(state => state.isSettingsOpen);
  const toggleSettings = useUIStore(state => state.toggleSettings);
  const sessions = useSessionStore(state => state.sessions);

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

        {/* API 配置说明 */}
        {/* <div className="mb-6 p-4 bg-leaf-50 rounded-xl border border-leaf-200">
          <h3 className="text-sm font-semibold text-leaf-800 mb-2">🔑 API 配置</h3>
          <p className="text-sm text-leaf-700 leading-relaxed">
            API Key 和 Base URL 现在通过环境变量配置，更安全。
          </p>
          <div className="mt-3 text-xs text-leaf-600 bg-white/50 rounded-lg p-3 font-mono">
            <p className="mb-1"># 在项目根目录创建 .env.local 文件：</p>
            <p className="text-gray-600">LLM_BASE_URL=https://api.openai.com/v1</p>
            <p className="text-gray-600">LLM_API_KEY=sk-your-key-here</p>
            <p className="text-gray-600">LLM_MODEL=gpt-3.5-turbo</p>
          </div>
          <p className="text-xs text-leaf-500 mt-2">
            💡 参考 .env.example 文件进行配置
          </p>
        </div> */}

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