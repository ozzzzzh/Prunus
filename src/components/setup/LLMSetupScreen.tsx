import { useState } from 'react';
import { KeyRound, Ticket, Sparkles } from 'lucide-react';
import { useAPIConfigStore, type LLMProtocol } from '../../store/apiConfigStore';
import { redeemCdk, communityV1Url, hasCommunityBackend } from '../../utils/cdkService';
import { cn } from '../../utils/cn';

export default function LLMSetupScreen() {
  const config = useAPIConfigStore((s) => s.config);
  const configureByok = useAPIConfigStore((s) => s.configureByok);
  const configureCdk = useAPIConfigStore((s) => s.configureCdk);

  const [tab, setTab] = useState<'byok' | 'cdk'>('byok');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // BYOK 表单
  const [protocol, setProtocol] = useState<LLMProtocol>('openai');
  const [model, setModel] = useState(config.model);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  // CDK 表单
  const [cdkCode, setCdkCode] = useState('');

  const community = hasCommunityBackend();

  const handleByok = () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      setError('请填写 Base URL 和 API Key');
      return;
    }
    configureByok({
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim() || config.model,
      protocol,
    });
  };

  const handleCdk = async () => {
    if (!cdkCode.trim()) {
      setError('请输入兑换码');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await redeemCdk(cdkCode.trim());
      configureCdk({ token: result.token, baseUrl: communityV1Url(), model: config.model });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#fafafa] canvas-texture overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.15)] border border-gray-200 p-8 my-8">
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-2">
          <img src="/src/assets/PrunusLogoHighQuality.jpg" alt="Prunus" className="w-10 h-10 rounded-full object-cover" />
          <h1 className="text-xl font-bold text-gray-800">开始使用 Prunus</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          使用前需要配置大模型。你可以填自己的 Key，{community ? '或兑换一个社区版兑换码。' : '本版本支持 BYOK。'}
        </p>

        {/* Tab */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          <button
            onClick={() => { setTab('byok'); setError(''); }}
            className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors', tab === 'byok' ? 'bg-white shadow-sm text-leaf-700 font-medium' : 'text-gray-500 hover:text-gray-700')}
          >
            <KeyRound size={14} /> 自己的 Key
          </button>
          {community && (
            <button
              onClick={() => { setTab('cdk'); setError(''); }}
              className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors', tab === 'cdk' ? 'bg-white shadow-sm text-leaf-700 font-medium' : 'text-gray-500 hover:text-gray-700')}
            >
              <Ticket size={14} /> 兑换码
            </button>
          )}
        </div>

        {/* BYOK 表单 */}
        {tab === 'byok' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">协议</label>
              <div className="mt-1 flex gap-1 bg-gray-100 rounded-lg p-1">
                {(['openai', 'anthropic'] as LLMProtocol[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProtocol(p)}
                    className={cn('flex-1 px-3 py-1.5 text-xs rounded-md transition-colors', protocol === p ? 'bg-white shadow-sm text-leaf-700 font-medium' : 'text-gray-500 hover:text-gray-700')}
                  >
                    {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">模型 Model</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-v4-flash" className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Base URL</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={protocol === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.deepseek.com'} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200" />
            </div>
            <div>
              <label className="text-xs text-gray-500">API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200" />
            </div>
            <button onClick={handleByok} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-leaf-600 hover:bg-leaf-700 rounded-lg transition-colors">
              <Sparkles size={14} /> 保存并开始
            </button>
          </div>
        )}

        {/* CDK 表单 */}
        {tab === 'cdk' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">输入兑换码，兑换后将获得一个带额度的 token，用于社区版大模型服务。</p>
            <input value={cdkCode} onChange={(e) => setCdkCode(e.target.value)} placeholder="PRUNUS-XXXX-XXXX-XXXX" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-leaf-400 focus:ring-1 focus:ring-leaf-200 font-mono" />
            <button onClick={handleCdk} disabled={submitting} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-leaf-600 hover:bg-leaf-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors">
              <Ticket size={14} /> {submitting ? '兑换中...' : '兑换'}
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
      </div>
    </div>
  );
}
