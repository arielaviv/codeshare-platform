import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LandingHeader from '../components/LandingHeader';
import TycoonTrustBar from '../components/TycoonTrustBar';
import Mr8Showcase from '../components/landing/Mr8Showcase';
import Mr8Capabilities from '../components/landing/Mr8Capabilities';
import Mr8AssistantLoop from '../components/landing/Mr8AssistantLoop';
import Mr8Integrations from '../components/landing/Mr8Integrations';
import LandingFooter from '../components/landing/LandingFooter';

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
      if (!user.hasClaimedWelcomeBonus) {
        navigate('/welcome-spin', { state: { initialPrompt: prompt } });
      } else {
        navigate('/chat', { state: { initialPrompt: prompt } });
      }
    } else {
      // Temu flow: unauth users go directly into an anonymous build. Register
      // wall appears AFTER the build is running + the slot has been won —
      // register-to-claim maximises sunk-cost.
      navigate('/build', { state: { initialPrompt: prompt } });
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-ink dark:text-[#E8E8E8] flex flex-col">
      <LandingHeader />

      {/* Subtle dot grid backdrop */}
      <div
        className="fixed inset-0 opacity-[0.04] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Warm glow behind hero */}
      <div
        className="fixed inset-x-0 top-0 h-[70vh] pointer-events-none opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(251, 119, 1, 0.18), transparent 65%)',
        }}
      />

      <main className="relative z-10 flex flex-col items-center justify-center px-6 py-10 text-center min-h-[calc(100vh-64px)]">
        <TycoonTrustBar />

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.04] text-ink dark:text-white">
          Use AI like a Billionaire
        </h1>

        <form onSubmit={handleSubmit} className="max-w-2xl w-full mx-auto mb-5 space-y-3">
          <div className="bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] px-4 py-3 transition-colors focus-within:border-brand-orange dark:focus-within:border-brand-orange">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="How can Mr8 help you today?"
              rows={2}
              className="w-full bg-transparent text-sm md:text-base text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>
          <button
            type="submit"
            className="w-full py-3.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(251,119,1,0.35)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14m-7-7l7 7-7 7" />
            </svg>
            Start building
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setPrompt(s)}
              className="text-xs px-4 py-2 rounded-full border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#0F0F0F] text-ink-secondary dark:text-[#888] hover:text-ink dark:hover:text-[#E8E8E8] hover:border-brand-orange/50 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </main>

      <Mr8Showcase />
      <Mr8Capabilities />
      <Mr8AssistantLoop />
      <Mr8Integrations />
      <LandingFooter />
    </div>
  );
}
