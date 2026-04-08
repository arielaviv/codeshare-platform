import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SUGGESTIONS = [
  'Build a Porsche GT3 RS showcase with hero images',
  'Create an AI-powered chat assistant',
  'Build a 3D interactive globe with Mapbox',
  'Design a news blog like Washington Post',
];

export default function LandingPage() {
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    if (user) {
      navigate('/chat', { state: { initialPrompt: prompt } });
    } else {
      navigate('/register', { state: { redirectPrompt: prompt } });
    }
  };

  return (
    <div className="h-screen bg-[#0A0A0A] text-[#E8E8E8] overflow-hidden flex flex-col">
      <div className="fixed inset-0 bg-gradient-to-b from-[#0A0A0A] via-[#0A0A14] to-[#0A0A0A] pointer-events-none" />
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative z-10 flex flex-col h-full">
        <nav className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00EAFA" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span className="text-lg font-bold tracking-tight">CodeShare</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/feed" className="text-sm bg-white text-[#0A0A0A] px-5 py-2.5 rounded-full font-medium hover:bg-[#E8E8E8] transition-colors">
                Open App
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-sm text-[#A0A0A0] hover:text-white transition-colors px-3 py-2">Login</Link>
                <Link to="/register" className="text-sm bg-white text-[#0A0A0A] px-5 py-2.5 rounded-full font-medium hover:bg-[#E8E8E8] transition-colors">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>

        <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#2A2A2A] bg-[#141414] text-xs text-[#A0A0A0] mb-6">
            <span className="text-sm">🚀</span>
            Introducing CodeShare AI
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4 leading-[1.05]">
            Build Stunning apps
            <br />
            <span className="bg-gradient-to-r from-[#00EAFA] via-[#3B82F6] to-[#8B5CF6] bg-clip-text text-transparent">effortlessly</span>
          </h1>

          <p className="text-base text-[#777] max-w-md mx-auto mb-8">
            Describe your app and watch it come to life with React, TypeScript, and Tailwind.
          </p>

          <form onSubmit={handleSubmit} className="max-w-2xl w-full mx-auto mb-5">
            <div className="flex items-center bg-[#141414] border border-[#2A2A2A] rounded-full px-4 py-2 hover:border-[#3A3A3A] transition-colors focus-within:border-[#555]">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="How can CodeShare help you today?"
                className="flex-1 bg-transparent text-sm text-[#E8E8E8] placeholder:text-[#555] focus:outline-none px-3 py-2"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              />
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="w-9 h-9 bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#333] rounded-full flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setPrompt(s); }}
                className="text-xs px-4 py-2 rounded-full border border-[#2A2A2A] bg-[#0F0F0F] text-[#888] hover:text-[#E8E8E8] hover:border-[#444] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <footer className="px-6 py-4 flex items-center justify-between text-[10px] text-[#444] flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00EAFA" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
            CodeShare
          </div>
          <span>Ariel Aviv | Colman 2025</span>
        </footer>
      </div>
    </div>
  );
}
