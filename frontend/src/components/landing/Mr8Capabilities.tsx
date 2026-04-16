import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { iconifyUrl } from '../../utils/iconifyUrl';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/* ─── Shared Card Shell — warm photographic orange background ─── */

function Mr8CardShell({
  label,
  glowPosition,
  children,
}: {
  label: string;
  glowPosition: 'top-left' | 'top-right' | 'center';
  children: React.ReactNode;
}) {
  const glowStyle =
    glowPosition === 'top-left'
      ? 'radial-gradient(ellipse 75% 55% at 25% 20%, rgba(255,200,120,0.38) 0%, transparent 60%)'
      : glowPosition === 'top-right'
        ? 'radial-gradient(ellipse 75% 55% at 75% 20%, rgba(255,200,120,0.38) 0%, transparent 60%)'
        : 'radial-gradient(ellipse 65% 45% at 50% 35%, rgba(255,220,160,0.28) 0%, transparent 55%)';

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <div
        className="absolute inset-0"
        style={{
          background: [
            glowStyle,
            'radial-gradient(ellipse 90% 70% at 50% 60%, rgba(251,119,1,0.55) 0%, rgba(193,59,0,0.65) 45%, rgba(42,10,0,0.95) 100%)',
            'linear-gradient(135deg, rgba(255,200,120,0.25) 0%, transparent 50%)',
            'linear-gradient(160deg, #2a0a00 0%, #1a0500 100%)',
          ].join(', '),
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 4px)',
        }}
      />
      <div className="absolute left-4 top-4 h-5 w-5 border-l border-t border-white/15" />
      <div className="absolute bottom-4 right-4 h-5 w-5 border-b border-r border-white/15" />
      <div className="absolute left-5 top-5">
        <span className="text-[9px] uppercase tracking-[0.2em] text-white/60" style={{ fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ─── Card 1: Featureset — pills of everything Mr8 does ─── */

function FeaturesCard() {
  const features = [
    'Code apps',
    'Slide decks',
    'Research',
    'Spreadsheets',
    'Video',
    'Audio',
    'Visualizations',
    'Scheduled tasks',
  ];
  return (
    <Mr8CardShell label="Features" glowPosition="top-left">
      <div className="absolute inset-0 flex flex-col justify-between px-6 pb-5 pt-12">
        <div className="flex flex-col gap-2.5">
          <div className="text-[18px] font-semibold leading-tight text-white/95 mb-1">
            Every surface, one agent
          </div>
          <div className="flex flex-wrap gap-1.5">
            {features.map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-medium text-white/90"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/15" />
          <span className="text-[9px] uppercase tracking-[0.18em] text-white/50" style={{ fontFamily: 'var(--font-mono)' }}>
            Streamed end-to-end
          </span>
          <div className="h-px flex-1 bg-white/15" />
        </div>
      </div>
    </Mr8CardShell>
  );
}

/* ─── Card 2: Trusted stack — vendor logos ─── */

function StackCard() {
  const stack: { slug: string; name: string }[] = [
    { slug: 'github', name: 'GitHub' },
    { slug: 'supabase', name: 'Supabase' },
    { slug: 'openai', name: 'OpenAI' },
    { slug: 'anthropic', name: 'Anthropic' },
    { slug: 'vercel', name: 'Vercel' },
    { slug: 'elevenlabs', name: 'ElevenLabs' },
  ];
  return (
    <Mr8CardShell label="Stack" glowPosition="center">
      <div className="absolute inset-0 flex flex-col justify-between px-6 pb-5 pt-12">
        <div>
          <div className="text-[18px] font-semibold leading-tight text-white/95 mb-3">
            Plugs into the stack you trust
          </div>
          <div
            className="rounded-xl p-3"
            style={{
              background: 'rgba(0,0,0,0.28)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              {stack.map((s) => (
                <div
                  key={s.slug}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <img src={iconifyUrl(s.slug, '#ffffff')} alt="" width={14} height={14} style={{ opacity: 0.92 }} draggable={false} />
                  <span className="text-[11px] font-medium text-white/80 truncate">{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#FB7701', boxShadow: '0 0 6px rgba(251,119,1,0.8)' }} />
          <span className="text-[10px] text-white/60" style={{ fontFamily: 'var(--font-mono)' }}>
            Native push & OAuth connectors
          </span>
        </div>
      </div>
    </Mr8CardShell>
  );
}

/* ─── Card 3: Finished work — chat bubble + avatars ─── */

function OutcomeCard() {
  return (
    <Mr8CardShell label="Outcome" glowPosition="top-right">
      <div className="absolute inset-0 flex flex-col justify-between px-6 pb-5 pt-12">
        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl px-5 py-4"
            style={{
              background: 'rgba(255,255,255,0.10)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.20)',
            }}
          >
            <p className="text-[13px] leading-relaxed text-white/95">
              Based on your brief, I shipped the full-stack Porsche showcase, the 12-slide pitch, and a 40-citation research brief. All live at the URLs below.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div
                className="h-3.5 w-3.5 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #FFB97A, #FB7701)',
                  boxShadow: '0 0 6px rgba(251,119,1,0.55)',
                }}
              />
              <span className="text-[10px] tracking-wide text-white/60" style={{ fontFamily: 'var(--font-mono)' }}>
                MR8
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <svg width="12" height="18" viewBox="0 0 12 18" fill="none" aria-hidden="true">
            <path d="M6 1v14M1 10l5 5 5-5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] uppercase tracking-[0.15em] text-white/65" style={{ fontFamily: 'var(--font-mono)' }}>
            Your team
          </span>
          <div className="flex -space-x-2">
            {[
              { bg: 'linear-gradient(135deg,#FB7701,#FF9A3C)', initial: 'A' },
              { bg: 'linear-gradient(135deg,#E85A19,#FB7701)', initial: 'M' },
              { bg: 'linear-gradient(135deg,#C13B00,#FB7701)', initial: 'J' },
              { bg: 'linear-gradient(135deg,#FF9A3C,#FFC98A)', initial: 'S' },
            ].map((a) => (
              <div
                key={a.initial}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                style={{ background: a.bg, border: '2px solid rgba(255,255,255,0.85)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
              >
                {a.initial}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Mr8CardShell>
  );
}

const PHASE_TITLES = [
  'Every tool you need, in one agent',
  'Plugs into the stack you already trust',
  'Ships finished work, not prototypes',
];

export default function Mr8Capabilities() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);
  const title1Ref = useRef<HTMLDivElement>(null);
  const title2Ref = useRef<HTMLDivElement>(null);
  const title3Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const card1 = card1Ref.current;
    const card2 = card2Ref.current;
    const card3 = card3Ref.current;
    const t1 = title1Ref.current;
    const t2 = title2Ref.current;
    const t3 = title3Ref.current;
    if (!section || !card1 || !card2 || !card3 || !t1 || !t2 || !t3) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      gsap.set(card1, { xPercent: -50, yPercent: -50, x: -380, scale: 0.9, rotateY: 25, opacity: 1 });
      gsap.set(card2, { xPercent: -50, yPercent: -50, x: -80, scale: 0.95, rotateY: 25, opacity: 1 });
      gsap.set(card3, { xPercent: -50, yPercent: -50, x: 220, scale: 1, rotateY: 25, opacity: 1 });
      gsap.set(t1, { opacity: 0 });
      gsap.set(t2, { opacity: 0 });
      gsap.set(t3, { opacity: 1, y: 0 });
      return;
    }

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      gsap.set([card1, card2, card3], { clearProps: 'all' });
      gsap.set([t1, t2, t3], { clearProps: 'all' });
      const ctx = gsap.context(() => {
        [card1, card2, card3].forEach((card) => {
          gsap.fromTo(
            card,
            { opacity: 0, y: 40 },
            {
              opacity: 1,
              y: 0,
              duration: 0.8,
              ease: 'power2.out',
              scrollTrigger: { trigger: card, start: 'top 85%', toggleActions: 'play none none reverse' },
            },
          );
        });
      }, section);
      return () => ctx.revert();
    }

    const ctx = gsap.context(() => {
      gsap.set(card1, { xPercent: -50, yPercent: -50, x: 0, y: -60, scale: 0.6, rotateX: 80, rotateY: 0, opacity: 0 });
      gsap.set(card2, { xPercent: -50, yPercent: -50, x: 200, scale: 0.8, rotateY: 25, opacity: 0 });
      gsap.set(card3, { xPercent: -50, yPercent: -50, x: 350, scale: 0.8, rotateY: 25, opacity: 0 });
      gsap.set(t1, { opacity: 0, y: 30 });
      gsap.set(t2, { opacity: 0, y: 30 });
      gsap.set(t3, { opacity: 0, y: 30 });

      const seg = 1 / 3;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${3 * window.innerHeight}`,
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
        },
      });

      tl.to(card1, { y: 0, scale: 1, rotateX: 0, opacity: 1, duration: seg * 0.6, ease: 'power2.out' }, 0);
      tl.to(t1, { opacity: 1, y: 0, duration: seg * 0.45, ease: 'power2.out' }, seg * 0.15);

      tl.to(t1, { opacity: 0, y: -20, duration: seg * 0.35, ease: 'power2.in' }, seg * 0.82);
      tl.to(t2, { opacity: 1, y: 0, duration: seg * 0.4, ease: 'power2.out' }, seg * 1.1);
      tl.to(card1, { x: -260, scale: 0.95, rotateY: 25, duration: seg * 0.75, ease: 'power2.inOut' }, seg * 0.88);
      tl.to(card2, { x: 80, scale: 1, rotateY: 25, opacity: 1, duration: seg * 0.6, ease: 'power2.out' }, seg * 1.0);

      tl.to(t2, { opacity: 0, y: -20, duration: seg * 0.35, ease: 'power2.in' }, seg * 1.82);
      tl.to(t3, { opacity: 1, y: 0, duration: seg * 0.4, ease: 'power2.out' }, seg * 2.1);
      tl.to(card1, { x: -380, scale: 0.9, rotateY: 25, duration: seg * 0.7, ease: 'power2.inOut' }, seg * 1.9);
      tl.to(card2, { x: -80, scale: 0.95, rotateY: 25, duration: seg * 0.7, ease: 'power2.inOut' }, seg * 1.9);
      tl.to(card3, { x: 220, scale: 1, rotateY: 25, opacity: 1, duration: seg * 0.6, ease: 'power2.out' }, seg * 2.05);
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div className="bg-[#050506]">
      <section
        ref={sectionRef}
        className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-[#050506]"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(251,119,1,0.08) 0%, transparent 60%)',
          }}
        />

        <div className="flex w-full flex-col items-center" style={{ maxWidth: 1200, padding: '0 20px' }}>
          <div className="pointer-events-none relative z-20 mb-12 w-full" style={{ minHeight: 44 }}>
            {PHASE_TITLES.map((title, i) => (
              <div
                key={title}
                ref={i === 0 ? title1Ref : i === 1 ? title2Ref : title3Ref}
                className="absolute inset-x-0 text-center"
              >
                <h3 className="text-[clamp(1.5rem,3vw,2.4rem)] font-normal leading-[1.15] tracking-[-0.02em] text-white/80">
                  {title}
                </h3>
              </div>
            ))}
          </div>

          <div
            className="relative"
            style={{
              width: '100%',
              maxWidth: 900,
              height: 400,
              perspective: 1000,
              transformStyle: 'preserve-3d',
            }}
          >
            {([
              { ref: card1Ref, z: 1, Comp: FeaturesCard },
              { ref: card2Ref, z: 2, Comp: StackCard },
              { ref: card3Ref, z: 3, Comp: OutcomeCard },
            ] as const).map(({ ref, z, Comp }) => (
              <div
                key={z}
                ref={ref}
                className="absolute left-1/2 top-1/2 rounded-2xl"
                style={{
                  width: 540,
                  height: 380,
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden',
                  zIndex: z,
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 12px 50px rgba(0,0,0,0.5), 0 0 40px rgba(251,119,1,0.08)',
                }}
              >
                <Comp />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
