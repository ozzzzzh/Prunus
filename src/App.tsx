import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Sidebar from './components/layout/Sidebar';
import ChatCanvas from './components/canvas/ChatCanvas';
import ChatInput from './components/chat/ChatInput';
import SettingsModal from './components/layout/SettingsModal';
import { useChatStore } from './store/chatStore';

function App() {
  const sessions = useChatStore(state => state.sessions);
  const createSession = useChatStore(state => state.createSession);

  // Initialize a session if none exists
  useEffect(() => {
    if (Object.keys(sessions).length === 0) {
      createSession();
    }
  }, [sessions, createSession]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar />
      <main className="flex-1 relative flex flex-col h-full overflow-hidden">
        <ReactFlowProvider>
          <ChatCanvas />
        </ReactFlowProvider>
        <ChatInput />
      </main>
      <SettingsModal />
    </div>
  );
}

export default App;