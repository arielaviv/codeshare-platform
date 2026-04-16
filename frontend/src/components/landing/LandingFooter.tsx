import { Link } from 'react-router-dom';
import mr8Logo from '../../assets/mr8-logo.png';
import { FEATURES } from '../../data/feature-marketing';

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.268 2.37 4.268 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.543C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);
const YoutubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);
const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

interface FooterLink {
  label: string;
  to: string;
}

const FEATURE_LINKS: FooterLink[] = FEATURES
  .filter((f) => f.mode !== 'deck-page')
  .map((f) => ({ label: f.title, to: `/features/${f.slug}` }));

const PRODUCT_LINKS: FooterLink[] = [
  { label: 'Pricing', to: '/pricing' },
  { label: 'Login', to: '/login' },
  { label: 'Get started', to: '/register' },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Cookies', to: '/cookies' },
];

const SOCIAL = [
  { label: 'X', href: '#', Icon: XIcon },
  { label: 'LinkedIn', href: '#', Icon: LinkedinIcon },
  { label: 'YouTube', href: '#', Icon: YoutubeIcon },
  { label: 'GitHub', href: '#', Icon: GithubIcon },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <span
        className="mb-4 block text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]/55"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {title}
      </span>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="group inline-flex items-center text-[15px] font-medium text-[#1a1a1a]"
            >
              <span className="mr-1.5 text-[#FB7701]/45 transition-colors group-hover:text-[#FB7701]">
                ↳
              </span>
              <span className="relative">
                {link.label}
                <span className="absolute bottom-0 left-0 h-px w-0 bg-[#FB7701] transition-all duration-300 ease-out group-hover:w-full" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="relative w-full text-[#1a1a1a] selection:bg-[#FB7701]/15"
      style={{ background: '#FFF8F0' }}
    >
      <div className="mx-auto max-w-[1440px]">
        {/* Top bar — logo + slogan + Get started */}
        <div
          className="flex flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:justify-between md:px-12 md:py-10"
          style={{ borderBottom: '1px solid rgba(251,119,1,0.18)' }}
        >
          <div className="flex items-center gap-4">
            <Link to="/" aria-label="Mr8 — Home" className="flex items-center gap-3 transition-opacity hover:opacity-80">
              <img src={mr8Logo} alt="Mr8" width={44} height={44} className="rounded-xl" />
              <span className="text-[22px] font-bold tracking-tight text-[#1a1a1a]">Mr8</span>
            </Link>
            <div className="hidden h-7 w-px bg-[#1a1a1a]/15 md:block" />
            <p
              className="hidden text-[12px] uppercase tracking-[0.18em] text-[#1a1a1a]/50 md:block"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Use AI like a Billionaire&trade;
            </p>
          </div>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110"
            style={{
              background: '#FB7701',
              boxShadow: '0 4px 14px rgba(251,119,1,0.35)',
            }}
          >
            Get started
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M1 13L13 1M13 1H5M13 1V9" />
            </svg>
          </Link>
        </div>

        {/* Main grid — 3 columns */}
        <div
          className="grid grid-cols-1 sm:grid-cols-3"
          style={{ borderBottom: '1px solid rgba(251,119,1,0.18)' }}
        >
          <div style={{ borderRight: '1px solid rgba(251,119,1,0.14)' }}>
            <FooterColumn title="Features" links={FEATURE_LINKS} />
          </div>
          <div style={{ borderRight: '1px solid rgba(251,119,1,0.14)' }}>
            <FooterColumn title="Product" links={PRODUCT_LINKS} />
          </div>
          <FooterColumn title="Legal" links={LEGAL_LINKS} />
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center gap-4 px-6 py-6 md:flex-row md:justify-between md:px-12">
          <p
            className="text-[12px] text-[#1a1a1a]/45"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            &copy; {year} Mr8. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-[#1a1a1a]/50">
            {SOCIAL.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="transition-colors hover:text-[#FB7701]"
              >
                <Icon className="w-[17px] h-[17px]" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
