import React, { useState } from 'react';
import { AppMode } from './types';
import VeoStudio from './components/VeoStudio';
import LiveConversation from './components/LiveConversation';

const App: React.FC = () => {
  const [activeMode, setActiveMode] = useState<AppMode>(AppMode.VEO_STUDIO);

  const requestApiKey = async () => {
    if (window.aistudio?.openSelectKey) {
       await window.aistudio.openSelectKey();
    } else {
        alert("API Key selection is handled by the embedding environment. If you are running this locally, ensure process.env.API_KEY is set.");
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-100 font-sans selection:bg-purple-500/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#09090b]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-xl tracking-tight">Gemini Fusion</span>
          </div>

          <nav className="flex items-center space-x-1 bg-white/5 p-1 rounded-full border border-white/10">
            <button
              onClick={() => setActiveMode(AppMode.VEO_STUDIO)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeMode === AppMode.VEO_STUDIO
                  ? 'bg-purple-500/20 text-purple-300 shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Veo Studio
            </button>
            <button
              onClick={() => setActiveMode(AppMode.LIVE_CONVERSATION)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeMode === AppMode.LIVE_CONVERSATION
                  ? 'bg-cyan-500/20 text-cyan-300 shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Live Chat
            </button>
          </nav>

          <button 
            onClick={requestApiKey}
            className="hidden md:flex items-center space-x-2 text-xs font-medium text-gray-400 hover:text-white transition-colors border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span>API Key</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4 max-w-7xl mx-auto min-h-[calc(100vh-64px)]">
        {activeMode === AppMode.VEO_STUDIO ? (
          <div className="animate-fade-in">
             <VeoStudio />
          </div>
        ) : (
          <div className="animate-fade-in">
             <LiveConversation />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-gray-600 text-sm">
        <p>Powered by Gemini 2.5 Flash & Veo 3.1 • Built with Google GenAI SDK</p>
      </footer>
    </div>
  );
};

export default App;