import { useEffect, useState } from 'react';

const ACTIVE_MS = 2800;
const ORANGE = '#FB7701';

/* ─── Icons ─────────────────────────────────────────────────────────── */

type IconProps = { active?: boolean };

const iconFill = (active?: boolean) => (active ? ORANGE : '#6b7280');

function BookIcon({ active }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={iconFill(active)} aria-hidden="true">
      <path d="M4 3.5A2.5 2.5 0 0 1 6.5 1H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5v-15zM6 19h12v-2H6.5a.5.5 0 0 0 0 1H6v1zm12-4V3H6.5a.5.5 0 0 0-.5.5V16a2.5 2.5 0 0 1 .5-.05H18z" />
    </svg>
  );
}
function DiamondIcon({ active }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={iconFill(active)} aria-hidden="true">
      <path d="M12 2 2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5z" />
    </svg>
  );
}
function LayersIcon({ active }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconFill(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}
function CodeIcon({ active }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconFill(active)} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
function MegaphoneIcon({ active }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconFill(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11v2a2 2 0 0 0 2 2h1l3 4V5L6 9H5a2 2 0 0 0-2 2z" />
      <path d="M15 5v14" />
      <path d="M19 8v8" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

/* ─── Small primitives ──────────────────────────────────────────────── */

const INK = '#374151';
const INK_DIM = '#9ca3af';

// Fill-on-active wrapper — text sits in gray ink, orange clip-path sweeps L→R
// over the same element to make it look like Mr8 is reading/highlighting it.
function Readable({
  active,
  resetKey,
  delay = 0,
  children,
}: {
  active: boolean;
  resetKey: number;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ color: INK }}>{children}</span>
      {active && (
        <span
          key={resetKey}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            color: ORANGE,
            fontWeight: 500,
            clipPath: 'inset(0 100% 0 0)',
            animation: `mr8-clip-fill 0.55s ease-out ${delay}ms forwards`,
            pointerEvents: 'none',
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

/* ─── Card shell ────────────────────────────────────────────────────── */

function CardHeader({ Icon, label, active }: { Icon: React.FC<IconProps>; label: string; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <Icon active={active} />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.16em',
          color: active ? ORANGE : '#6b7280',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function SourceCard({
  Icon,
  label,
  active,
  resetKey,
  children,
  minHeight,
}: {
  Icon: React.FC<IconProps>;
  label: string;
  active: boolean;
  resetKey: number;
  children: React.ReactNode;
  minHeight: number;
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: '#ffffff',
        borderRadius: 14,
        padding: '16px 18px',
        border: active ? `1.5px solid ${ORANGE}` : '1px solid #e5e7eb',
        boxShadow: active
          ? `0 0 0 3px rgba(251,119,1,0.08), 0 8px 24px rgba(251,119,1,0.10)`
          : '0 1px 2px rgba(0,0,0,0.02)',
        transition: 'border-color 0.35s ease, box-shadow 0.35s ease',
        minHeight,
        overflow: 'hidden',
      }}
    >
      <CardHeader Icon={Icon} label={label} active={active} />
      {children}
      {active && (
        <div
          key={resetKey}
          aria-hidden
          style={{
            position: 'absolute',
            inset: '36px 0 auto 0',
            height: 2,
            background: `linear-gradient(90deg, transparent 0%, ${ORANGE} 45%, ${ORANGE} 55%, transparent 100%)`,
            animation: `mr8-stripe-sweep ${ACTIVE_MS}ms ease-in-out`,
          }}
        />
      )}
    </div>
  );
}

/* ─── Card bodies — each shows real Mr8 content ─────────────────────── */

function PromptBody({ active, resetKey }: { active: boolean; resetKey: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ color: ORANGE, fontFamily: 'var(--font-mono)', fontSize: 11 }}>&rsaquo;_</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: INK, lineHeight: 1.55 }}>
        <Readable active={active} resetKey={resetKey} delay={0}>Build a SaaS pricing page</Readable>{' '}
        <Readable active={active} resetKey={resetKey} delay={300}>with 3 tiers, Stripe checkout,</Readable>{' '}
        <Readable active={active} resetKey={resetKey} delay={650}>and dark mode.</Readable>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        {['fast', 'clean', 'dark'].map((t) => (
          <span
            key={t}
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 999,
              background: '#f3f4f6',
              color: INK_DIM,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em',
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function SpecBody({ active, resetKey }: { active: boolean; resetKey: number }) {
  const items = [
    'Scaffold Vite + React + TS',
    'Auth via Supabase OAuth',
    'Stripe checkout + webhooks',
    'Dark-mode toggle + theme store',
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: active ? ORANGE : '#e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.35s ease',
              animationDelay: `${i * 80}ms`,
            }}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ color: INK, fontSize: 12, lineHeight: 1.4 }}>
            <Readable active={active} resetKey={resetKey} delay={i * 90}>{item}</Readable>
          </span>
        </div>
      ))}
    </div>
  );
}

function BuildsBody({ active, resetKey }: { active: boolean; resetKey: number }) {
  const builds = [
    { emoji: '🏎️', name: 'porsche-gt3.mr8.app', meta: 'Live · 4 pages' },
    { emoji: '📊', name: 'q3-board-deck.pdf', meta: '12 slides' },
    { emoji: '🎙️', name: 'demo-narration.mp3', meta: '2m 30s' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {builds.map((b, i) => (
        <div
          key={b.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 8,
            background: '#f9fafb',
            border: '1px solid #f3f4f6',
          }}
        >
          <span style={{ fontSize: 14 }}>{b.emoji}</span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Readable active={active} resetKey={resetKey} delay={i * 110}>{b.name}</Readable>
            </span>
            <span style={{ fontSize: 10, color: INK_DIM, fontFamily: 'var(--font-mono)', lineHeight: 1.3 }}>
              {b.meta}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Star card — real code lines fill orange one by one while active. */
function CodeSamplesBody({ active, resetKey }: { active: boolean; resetKey: number }) {
  const lines: { text: string; indent: number; delay: number }[] = [
    { text: "export function Pricing() {", indent: 0, delay: 0 },
    { text: "return (", indent: 2, delay: 100 },
    { text: '<section className="py-24">', indent: 4, delay: 200 },
    { text: '<Hero title="Simple pricing" />', indent: 6, delay: 300 },
    { text: "<Tiers plans={PLANS} />", indent: 6, delay: 400 },
    { text: "<StripeCheckout />", indent: 6, delay: 500 },
    { text: "</section>", indent: 4, delay: 600 },
    { text: ");", indent: 2, delay: 700 },
    { text: "}", indent: 0, delay: 800 },
  ];
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        lineHeight: 1.5,
        color: INK,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        whiteSpace: 'pre',
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: INK_DIM, fontSize: 10, width: 14, textAlign: 'right', userSelect: 'none' }}>
            {i + 1}
          </span>
          <span>
            <Readable active={active} resetKey={resetKey} delay={l.delay}>
              {' '.repeat(l.indent) + l.text}
            </Readable>
          </span>
        </div>
      ))}
    </div>
  );
}

function UsageBody({ active, resetKey }: { active: boolean; resetKey: number }) {
  const heights = [12, 9, 16, 11, 20, 14, 10, 18, 26, 22];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: active ? ORANGE : INK, lineHeight: 1, transition: 'color 0.35s ease' }}>
            12
          </div>
          <div style={{ fontSize: 10, color: INK_DIM, fontFamily: 'var(--font-mono)', marginTop: 2 }}>builds / mo</div>
        </div>
        <div style={{ width: 1, height: 22, background: '#e5e7eb' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: active ? ORANGE : INK, lineHeight: 1, transition: 'color 0.35s ease' }}>
            45m
          </div>
          <div style={{ fontSize: 10, color: INK_DIM, fontFamily: 'var(--font-mono)', marginTop: 2 }}>avg delivery</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 36 }}>
        {heights.map((h, i) => (
          <div
            key={`${resetKey}-${i}`}
            style={{
              width: 5,
              height: h,
              borderRadius: 2,
              background: active ? ORANGE : '#e5e7eb',
              transition: 'background 0.35s ease',
              animation: active ? `mr8-clip-fill 0.4s ease-out ${i * 45}ms both` : undefined,
              clipPath: active ? undefined : 'inset(0 0 0 0)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Chat panel ────────────────────────────────────────────────────── */

function ChatBubble({ w, delay, resetKey, children }: { w: string; delay: number; resetKey: number; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', width: w, alignSelf: 'flex-end' }}>
      <div
        style={{
          minHeight: 36,
          borderRadius: 999,
          background: '#f3f4f6',
          padding: '9px 16px',
          fontSize: 12,
          color: INK_DIM,
          display: 'flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {children}
      </div>
      <div
        key={resetKey}
        style={{
          position: 'absolute',
          inset: 0,
          minHeight: 36,
          borderRadius: 999,
          background: ORANGE,
          padding: '9px 16px',
          fontSize: 12,
          color: '#ffffff',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          animation: `mr8-clip-fill 0.9s ease-out ${delay}ms forwards`,
          clipPath: 'inset(0 100% 0 0)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ChatMeta({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        color: INK_DIM,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
        alignSelf: 'flex-end',
      }}
    >
      {text}
    </span>
  );
}

function ChatPanel({ resetKey }: { resetKey: number }) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 14,
        border: `1.5px solid ${ORANGE}`,
        boxShadow: '0 0 0 3px rgba(251,119,1,0.08), 0 12px 32px rgba(251,119,1,0.12)',
        padding: '22px 20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 340,
        justifyContent: 'flex-end',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <ChatMeta text="Mr8 · just now" />
        <ChatBubble w="92%" delay={0} resetKey={resetKey}>
          Scaffolded Vite + Tailwind, Supabase auth wired
        </ChatBubble>
        <ChatMeta text="Mr8 · 2s" />
        <ChatBubble w="82%" delay={520} resetKey={resetKey}>
          Live at pricing.mr8.app ↗
        </ChatBubble>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 6px 10px 14px',
          borderRadius: 999,
          background: '#f3f4f6',
        }}
      >
        <span style={{ fontSize: 13, color: '#9ca3af', flex: 1 }}>Ask Mr8 anything…</span>
        <button
          type="button"
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: ORANGE,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          aria-label="Send"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

/* ─── Ghost column (faded sibling) ──────────────────────────────────── */

function GhostCard({ lines, chips = false, chart = false }: { lines: number; chips?: boolean; chart?: boolean }) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 14,
        padding: '16px 18px',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: 7, borderRadius: 4, background: '#e5e7eb', width: `${90 - i * 14}%` }} />
      ))}
      {chips && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <div style={{ width: 40, height: 16, borderRadius: 999, background: '#e5e7eb' }} />
          <div style={{ width: 52, height: 16, borderRadius: 999, background: '#e5e7eb' }} />
        </div>
      )}
      {chart && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 40, marginTop: 4 }}>
          {[10, 14, 8, 18, 13, 22, 16].map((h, i) => (
            <div key={i} style={{ width: 5, height: h, borderRadius: 2, background: '#e5e7eb' }} />
          ))}
        </div>
      )}
    </div>
  );
}

function GhostColumn({ side }: { side: 'left' | 'right' }) {
  const mask =
    side === 'left'
      ? 'linear-gradient(to right, transparent 0%, black 70%)'
      : 'linear-gradient(to left, transparent 0%, black 70%)';
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        width: 140,
        flexShrink: 0,
        opacity: 0.55,
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    >
      <GhostCard lines={3} chips />
      <GhostCard lines={2} chart />
      <GhostCard lines={3} />
    </div>
  );
}

/* ─── Main section ──────────────────────────────────────────────────── */

type Variant =
  | { kind: 'prompt' }
  | { kind: 'spec' }
  | { kind: 'builds' }
  | { kind: 'code' }
  | { kind: 'usage' };

const LEFT: Array<{ Icon: React.FC<IconProps>; label: string; variant: Variant['kind']; minHeight: number }> = [
  { Icon: BookIcon, label: 'YOUR PROMPT', variant: 'prompt', minHeight: 138 },
  { Icon: DiamondIcon, label: 'SPEC', variant: 'spec', minHeight: 140 },
  { Icon: LayersIcon, label: 'PAST BUILDS', variant: 'builds', minHeight: 176 },
];

const RIGHT: Array<{ Icon: React.FC<IconProps>; label: string; variant: Variant['kind']; minHeight: number }> = [
  { Icon: CodeIcon, label: 'CODE SAMPLES', variant: 'code', minHeight: 248 },
  { Icon: MegaphoneIcon, label: 'USAGE', variant: 'usage', minHeight: 132 },
];

const TOTAL = LEFT.length + RIGHT.length;

function renderBody(variant: Variant['kind'], active: boolean, resetKey: number) {
  if (variant === 'prompt') return <PromptBody active={active} resetKey={resetKey} />;
  if (variant === 'spec') return <SpecBody active={active} resetKey={resetKey} />;
  if (variant === 'builds') return <BuildsBody active={active} resetKey={resetKey} />;
  if (variant === 'code') return <CodeSamplesBody active={active} resetKey={resetKey} />;
  return <UsageBody active={active} resetKey={resetKey} />;
}

export default function Mr8AssistantLoop() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % TOTAL);
    }, ACTIVE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{ background: '#ffffff', padding: '120px 24px 96px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', marginBottom: 72 }}>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-3"
          style={{ fontFamily: 'var(--font-mono)', color: ORANGE }}
        >
          How Mr8 thinks
        </p>
        <h2 style={{ fontSize: 40, fontWeight: 700, color: '#111827', margin: '0 0 12px', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
          Every answer reads your whole context
        </h2>
        <p style={{ fontSize: 16, color: '#6b7280', margin: 0, lineHeight: 1.55 }}>
          Your prompt, your spec, every past build, the code you&rsquo;ve shipped, your usage patterns — Mr8 indexes them all before writing a single line.
        </p>
      </div>

      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 24,
          borderRadius: 24,
          border: '1px solid #e5e7eb',
          background: 'linear-gradient(180deg, #ffffff 0%, #fffbf5 100%)',
          display: 'flex',
          alignItems: 'stretch',
          gap: 14,
          overflow: 'hidden',
        }}
      >
        <GhostColumn side="left" />

        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {LEFT.map((c, i) => {
              const isActive = activeIndex === i;
              return (
                <SourceCard
                  key={c.variant}
                  Icon={c.Icon}
                  label={c.label}
                  active={isActive}
                  resetKey={activeIndex}
                  minHeight={c.minHeight}
                >
                  {renderBody(c.variant, isActive, activeIndex)}
                </SourceCard>
              );
            })}
          </div>

          <ChatPanel resetKey={activeIndex} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {RIGHT.map((c, i) => {
              const idx = LEFT.length + i;
              const isActive = activeIndex === idx;
              return (
                <SourceCard
                  key={c.variant}
                  Icon={c.Icon}
                  label={c.label}
                  active={isActive}
                  resetKey={activeIndex}
                  minHeight={c.minHeight}
                >
                  {renderBody(c.variant, isActive, activeIndex)}
                </SourceCard>
              );
            })}
          </div>
        </div>

        <GhostColumn side="right" />
      </div>
    </section>
  );
}
