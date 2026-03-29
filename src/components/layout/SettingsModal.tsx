import { X } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

export default function SettingsModal() {
  const isSettingsOpen = useChatStore(state => state.isSettingsOpen);
  const toggleSettings = useChatStore(state => state.toggleSettings);
  const apiConfig = useChatStore(state => state.apiConfig);
  const updateApiConfig = useChatStore(state => state.updateApiConfig);

  if (!isSettingsOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">API Settings</h2>
          <button 
            onClick={() => toggleSettings(false)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
            <input
              type="text"
              value={apiConfig.baseUrl}
              onChange={(e) => updateApiConfig({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiConfig.apiKey}
              onChange={(e) => updateApiConfig({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
            <input
              type="text"
              value={apiConfig.model}
              onChange={(e) => updateApiConfig({ model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => toggleSettings(false)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}