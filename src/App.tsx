import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Sidebar from './components/layout/Sidebar';
import ChatCanvas from './components/canvas/ChatCanvas';
import ChatInput from './components/chat/ChatInput';
import SettingsModal from './components/layout/SettingsModal';
import { useSessionStore } from './store/sessionStore';
import { useUIStore } from './store/uiStore';
import { initPersistence, enableAutoSave } from './services/persistenceService';

function App() {
  const sessions = useSessionStore(state => state.sessions);
  const createSession = useSessionStore(state => state.createSession);
  const sidebarCollapsed = useUIStore(state => state.sidebarCollapsed);

  // Initialize persistence and create default session if needed
  useEffect(() => {
    // Initialize IndexedDB persistence
    initPersistence().then(() => {
      enableAutoSave();

      // Create a session if none exists after loading from persistence
      if (Object.keys(useSessionStore.getState().sessions).length === 0) {
        createSession();
      }
    });
  }, [createSession]);

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