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
  const sidebarCollapsed = useChatStore(state => state.sidebarCollapsed);

  // Initialize a session if none exists
  useEffect(() => {
    if (Object.keys(sessions).length === 0) {
      createSession();
    }
  }, [sessions, createSession]);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#fafafa] text-gray-900">
      <Sidebar />
      <main className={`absolute top-0 right-0 bottom-0 flex flex-col h-full overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'left-0' : 'left-64'}`}>
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