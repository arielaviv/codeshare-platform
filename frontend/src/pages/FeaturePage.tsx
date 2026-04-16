import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import LandingHeader from '../components/LandingHeader';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, FEATURES_BY_SLUG, type FeatureCopy } from '../data/feature-marketing';

export default function FeaturePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const feature = FEATURES_BY_SLUG[slug];
  if (!feature) return <Navigate to="/landing" replace />;

  const { user } = useAuth();
  const navigate = useNavigate();

  const handlePrimaryCta = () => {
    if (feature.ctaTo === '/decks') {
      navigate(user ? '/decks' : '/login');
      return;
    }
    if (user) {
      navigate('/chat', { state: { initialPrompt: '' } });
    } else {
      navigate('/build');
    }
  };

  const handlePromptCta = (prompt: string) => {
    if (feature.ctaTo === '/decks') {
      navigate(user ? '/decks' : '/login', { state: { initialPrompt: prompt } });
      return;
    }
    if (user) {
      navigate('/chat', { state: { initialPrompt: prompt } });
    } else {
      navigate('/build', { state: { initialPrompt: prompt } });
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-ink dark:text-[#E8E8E8] flex flex-col">
      <LandingHeader />

      <div
        className="fixed inset-0 opacity-[0.04] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />
      <div
        className="fixed inset-x-0 top-0 h-[60vh] pointer-events-none opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(251, 119, 1, 0.18), transparent 65%)',
        }}
      />

      <main className="relative z-10 flex-1">
        {/* Hero */}
        <section className="px-6 pt-16 pb-12 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange-soft dark:bg-brand-orange/15 text-brand-orange text-xs font-semibold mb-6">
            <FeatureIcon slug={feature.slug} />
            {feature.eyebrow}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] mb-5 text-ink dark:text-white">
            {feature.title}
          </h1>
          <p className="text-xl md:text-2xl text-ink-secondary dark:text-[#A0A0A0] mb-4 font-medium">
            {feature.tagline}
          </p>
          <p className="text-base text-ink-tertiary dark:text-[#888] max-w-2xl mx-auto mb-8 leading-relaxed">
            {feature.hero}
          </p>
          <button
            onClick={handlePrimaryCta}
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-sm font-semibold rounded-full transition-colors shadow-[0_4px_14px_rgba(251,119,1,0.35)]"
          >
            {feature.ctaText}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14m-7-7l7 7-7 7" />
            </svg>
          </button>
        </section>

        {/* Benefits */}
        <section className="px-6 pb-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {feature.benefits.map((b) => (
              <div
                key={b.title}
                className="p-6 rounded-2xl bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A]"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-orange-soft dark:bg-brand-orange/15 text-brand-orange flex items-center justify-center mb-4">
                  <CheckIcon />
                </div>
                <h3 className="text-base font-semibold text-ink dark:text-white mb-2">
                  {b.title}
                </h3>
                <p className="text-sm text-ink-secondary dark:text-[#A0A0A0] leading-relaxed">
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Sample prompts */}
        <section className="px-6 pb-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-ink dark:text-white mb-2">
            Try one of these
          </h2>
          <p className="text-sm text-ink-tertiary dark:text-[#888] text-center mb-8">
            Click a prompt to start building with it.
          </p>
          <div className="space-y-2">
            {feature.samplePrompts.map((p) => (
              <button
                key={p}
                onClick={() => handlePromptCta(p)}
                className="w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] text-sm text-ink dark:text-[#E8E8E8] hover:border-brand-orange dark:hover:border-brand-orange transition-colors group"
              >
                <span className="flex-1">{p}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-ink-tertiary dark:text-[#666] group-hover:text-brand-orange transition-colors flex-shrink-0"
                >
                  <path d="M5 12h14m-7-7l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </section>

        {/* Other features */}
        <section className="px-6 pb-20 max-w-5xl mx-auto">
          <h2 className="text-xl font-semibold text-ink dark:text-white mb-4">
            More from Mr8
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {FEATURES.filter((f) => f.slug !== feature.slug)
              .slice(0, 4)
              .map((f) => (
                <Link
                  key={f.slug}
                  to={`/features/${f.slug}`}
                  className="p-4 rounded-xl bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] hover:border-brand-orange/60 transition-colors"
                >
                  <div className="text-xs font-semibold text-brand-orange mb-1.5">
                    {f.eyebrow}
                  </div>
                  <div className="text-sm font-semibold text-ink dark:text-white mb-1">
                    {f.title}
                  </div>
                  <div className="text-xs text-ink-tertiary dark:text-[#888] line-clamp-2">
                    {f.tagline}
                  </div>
                </Link>
              ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureIcon({ slug }: { slug: FeatureCopy['slug'] }) {
  const stroke = 'currentColor';
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (slug) {
    case 'code-apps':
      return <svg {...common}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>;
    case 'decks':
      return <svg {...common}><rect x="3" y="4" width="18" height="14" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    case 'spreadsheets':
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></svg>;
    case 'research':
      return <svg {...common}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
    case 'visualization':
      return <svg {...common}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
    case 'video':
      return <svg {...common}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>;
    case 'audio':
      return <svg {...common}><path d="M3 12h2l3-9 4 18 3-9h6" /></svg>;
    case 'design':
      return <svg {...common}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>;
    case 'schedule':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    default:
      return null;
  }
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
