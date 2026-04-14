import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LandingHeader from '../components/LandingHeader';

interface Tier {
  name: string;
  price: number; // USD / month
  tagline: string;
  messageCredits: number;
  integrationCredits: number;
  featured?: boolean;
  cta: string;
}

const TIERS: Tier[] = [
  {
    name: 'Free',
    price: 0,
    tagline: 'See what Mr8 can do, no card required.',
    messageCredits: 25,
    integrationCredits: 100,
    cta: 'Start free',
  },
  {
    name: 'Starter',
    price: 16,
    tagline: 'For personal projects and early-stage ideas.',
    messageCredits: 100,
    integrationCredits: 2000,
    cta: 'Choose Starter',
  },
  {
    name: 'Builder',
    price: 40,
    tagline: 'Take your idea to the next level.',
    messageCredits: 250,
    integrationCredits: 10000,
    featured: true,
    cta: 'Choose Builder',
  },
  {
    name: 'Pro',
    price: 80,
    tagline: 'Advanced tools for complex apps.',
    messageCredits: 500,
    integrationCredits: 20000,
    cta: 'Choose Pro',
  },
  {
    name: 'Elite',
    price: 160,
    tagline: 'Scale effortlessly with dedicated support.',
    messageCredits: 1200,
    integrationCredits: 50000,
    cta: 'Choose Elite',
  },
];

function TierCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={`relative bg-white dark:bg-[#141414] border rounded-2xl p-6 flex flex-col transition-all ${
        tier.featured
          ? 'border-brand-orange shadow-[0_12px_40px_rgba(251,119,1,0.2)] scale-[1.02]'
          : 'border-edge dark:border-[#2A2A2A] hover:border-brand-orange/50'
      }`}
    >
      {tier.featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-brand-orange text-white text-[10px] uppercase tracking-wider rounded-full font-bold">
          Most popular
        </div>
      )}
      <div className="text-2xl font-bold text-ink dark:text-white mb-2">{tier.name}</div>
      <p className="text-xs text-ink-tertiary dark:text-[#888] mb-5 min-h-[2.5rem]">{tier.tagline}</p>
      <div className="mb-5">
        <span className="text-5xl font-black text-ink dark:text-white tracking-tight">
          ${tier.price}
        </span>
        <span className="text-sm text-ink-tertiary dark:text-[#888] ml-1">/mo</span>
        {tier.price > 0 && (
          <div className="text-[11px] text-ink-tertiary dark:text-[#888] mt-1">
            Billed annually
          </div>
        )}
      </div>
      <ul className="text-xs text-ink-secondary dark:text-[#A0A0A0] space-y-2 mb-6 flex-1">
        <li className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-green flex-shrink-0">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>
            <span className="font-semibold text-ink dark:text-white">
              {tier.messageCredits.toLocaleString()}
            </span>{' '}
            message credits / mo
          </span>
        </li>
        <li className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-green flex-shrink-0">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>
            <span className="font-semibold text-ink dark:text-white">
              {tier.integrationCredits.toLocaleString()}
            </span>{' '}
            integration credits / mo
          </span>
        </li>
        <li className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-green flex-shrink-0">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>AI code apps + AI decks</span>
        </li>
        {tier.price > 0 && (
          <li className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-green flex-shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Priority AI model access</span>
          </li>
        )}
      </ul>
      <Link
        to="/register"
        className={`w-full py-2.5 rounded-full text-sm font-semibold text-center transition-colors ${
          tier.featured
            ? 'bg-brand-orange hover:bg-brand-orange-hover text-white shadow-[0_4px_14px_rgba(251,119,1,0.35)]'
            : 'bg-surface-tertiary dark:bg-[#1A1A1A] text-ink dark:text-white hover:bg-edge dark:hover:bg-[#222]'
        }`}
      >
        {tier.cta}
      </Link>
    </div>
  );
}

export default function PricingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-ink dark:text-[#E8E8E8]">
      <LandingHeader />

      <main className="max-w-7xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange-soft dark:bg-brand-orange/10 text-xs font-semibold text-brand-orange mb-4">
            Pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Build more. Pay less.
          </h1>
          <p className="text-base text-ink-secondary dark:text-[#A0A0A0] max-w-lg mx-auto">
            Every new account starts with a welcome spin for{' '}
            <span className="font-semibold text-brand-green">free credits</span>. Upgrade only when you need more.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {TIERS.map((tier) => (
            <TierCard key={tier.name} tier={tier} />
          ))}
        </div>

        <div className="mt-16 text-center text-xs text-ink-tertiary dark:text-[#666]">
          Integration credits are used for external API calls (web search, document parsing, email).
          <br />
          Mr8 automatically gives you the best-priced plan if you stay within a lower tier's limits.
          {user && (
            <>
              <br />
              <Link to="/account" className="text-brand-orange hover:underline mt-2 inline-block">
                View your current balance →
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
