import { X, Download, Upload } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAPIConfigStore } from '../../store/apiConfigStore';
import { useSessionStore } from '../../store/sessionStore';

export default function SettingsModal() {
  // 直接订阅各 store，避免 chatStore getter 的问题
  const isSettingsOpen = useUIStore(state => state.isSettingsOpen);
  const toggleSettings = useUIStore(state => state.toggleSettings);
  const apiConfig = useAPIConfigStore(state => state.config);
  const updateApiConfig = useAPIConfigStore(state => state.updateConfig);
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
          <h2 className="text-xl font-bold text-gray-800">API Settings</h2>
          <button
            onClick={() => toggleSettings(false)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
            <input
              type="text"
              value={apiConfig.baseUrl}
              onChange={(e) => updateApiConfig({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf-400 focus:border-transparent text-sm bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiConfig.apiKey}
              onChange={(e) => updateApiConfig({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf-400 focus:border-transparent text-sm bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <input
              type="text"
              value={apiConfig.model}
              onChange={(e) => updateApiConfig({ model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf-400 focus:border-transparent text-sm bg-gray-50"
            />
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Data Management</h3>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors text-sm"
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
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}