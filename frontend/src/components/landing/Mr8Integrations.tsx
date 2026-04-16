import { useCallback, useEffect, useRef, useState } from 'react';
import mr8Logo from '../../assets/mr8-logo.png';
import { iconifyUrl } from '../../utils/iconifyUrl';

interface ConnectorData {
  id: string;
  name: string;
  iconSlug: string;
  description: string;
  features: string[];
}

type DetailsState = 'idle' | 'loading' | 'loaded';

const SNAP_RADIUS = 80;
const LOADING_MS = 1800;

const CONNECTORS: ConnectorData[] = [
  {
    id: 'github',
    name: 'GitHub',
    iconSlug: 'github',
    description: 'Sync repos, open PRs, read issues, ship commits — Mr8 works where your code lives.',
    features: [
      'Read + write repository access',
      'One-click OAuth install',
      'Automatic repo and issue sync',
      'Mr8 leaves PR comments inline',
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    iconSlug: 'supabase',
    description: 'Mr8 provisions tables, writes migrations, and queries your database from the chat.',
    features: [
      'Schema-aware code generation',
      'Row-level queries and policies',
      'Migration scaffolds on commit',
      'Auth + storage wiring ready',
    ],
  },
];

const SKELETON_BARS = [
  { id: 'a', width: '100%' },
  { id: 'b', width: '72%' },
  { id: 'c', width: '88%' },
  { id: 'd', width: '56%' },
  { id: 'e', width: '100%' },
  { id: 'f', width: '42%' },
];

function SkeletonBars() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
      {SKELETON_BARS.map((bar, i) => (
        <div
          key={bar.id}
          style={{
            height: 12,
            borderRadius: 6,
            width: bar.width,
            background:
              'linear-gradient(90deg, rgba(251,119,1,0.22) 0%, rgba(255,183,120,0.18) 25%, rgba(251,119,1,0.10) 50%, rgba(255,183,120,0.18) 75%, rgba(251,119,1,0.22) 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s linear infinite',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 5" stroke="#FB7701" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Mr8Symbol({ size = 88 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(251,119,1,0.20), 0 0 0 1px rgba(251,119,1,0.18)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <img src={mr8Logo} alt="Mr8" style={{ width: size * 0.72, height: size * 0.72, borderRadius: 10 }} />
    </div>
  );
}

export default function Mr8Integrations() {
  const [dragging, setDragging] = useState<ConnectorData | null>(null);
  const [isOverDrop, setIsOverDrop] = useState(false);
  const [dropped, setDropped] = useState<ConnectorData | null>(null);
  const [detailsState, setDetailsState] = useState<DetailsState>('idle');
  const [hoveredPill, setHoveredPill] = useState<string | null>(null);

  const dropRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs hold per-pointermove state to keep the mousemove path React-render-free.
  const draggingRef = useRef<ConnectorData | null>(null);
  const overDropRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);

  const applyPillPosition = (clientX: number, clientY: number) => {
    const pill = pillRef.current;
    if (pill) {
      pill.style.left = `${clientX}px`;
      pill.style.top = `${clientY}px`;
    }
  };

  const handlePointerDown = useCallback((e: React.PointerEvent, connector: ConnectorData) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    activePointerRef.current = e.pointerId;
    draggingRef.current = connector;
    setDragging(connector);
    // Seed pill position before the first move event so it doesn't flash at 0,0.
    requestAnimationFrame(() => applyPillPosition(e.clientX, e.clientY));
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: PointerEvent) => {
      if (activePointerRef.current !== e.pointerId) return;
      let x = e.clientX;
      let y = e.clientY;
      if (dropRef.current) {
        const rect = dropRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const inZone = dist < SNAP_RADIUS;
        if (inZone !== overDropRef.current) {
          overDropRef.current = inZone;
          setIsOverDrop(inZone);
        }
        if (inZone) {
          const t = 1 - dist / SNAP_RADIUS;
          const strength = t * t;
          x = x + (cx - x) * strength;
          y = y + (cy - y) * strength;
        }
      }
      applyPillPosition(x, y);
    };

    const handleUp = (e: PointerEvent) => {
      if (activePointerRef.current !== e.pointerId) return;
      activePointerRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const landed = draggingRef.current;
      if (landed && overDropRef.current) {
        setDropped(landed);
        setDetailsState('loading');
        loadingTimerRef.current = setTimeout(() => {
          setDetailsState('loaded');
        }, LOADING_MS);
      }

      draggingRef.current = null;
      overDropRef.current = false;
      setDragging(null);
      setIsOverDrop(false);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
    };
  }, [dragging]);

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, []);

  const handleReset = useCallback(() => {
    setDropped(null);
    setDetailsState('idle');
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  const isDragActive = dragging !== null;

  return (
    <section
      className="relative"
      style={{
        background: '#FFF8F0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '96px 40px 120px',
      }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          top: -120,
          left: -80,
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,119,1,0.22) 0%, transparent 65%)',
          filter: 'blur(20px)',
          animation: 'mr8-pulse-slow 9s ease-in-out infinite',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: -140,
          right: -100,
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,180,100,0.22) 0%, transparent 65%)',
          filter: 'blur(20px)',
          animation: 'mr8-pulse-slow 11s ease-in-out infinite',
          animationDelay: '2s',
        }}
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(255, 246, 230, 0.72)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          pointerEvents: 'none',
          zIndex: 30,
          transition: 'opacity 0.3s ease',
          opacity: isDragActive ? 1 : 0,
        }}
      />

      <div style={{ textAlign: 'center', marginBottom: 48, position: 'relative', zIndex: 2 }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-4" style={{ fontFamily: 'var(--font-mono)', color: '#FB7701' }}>
          Integrations
        </p>
        <h2 style={{ fontSize: 40, fontWeight: 700, color: '#1a1a1a', margin: '0 0 12px', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
          Mr8 plugs into <span style={{ color: '#FB7701' }}>your stack</span>
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(26,26,26,0.55)', margin: 0, maxWidth: 520, fontWeight: 400 }}>
          Drop a tool into Mr8 and it connects in seconds. Native push and OAuth — no brittle scripts.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0,
          maxWidth: 1100,
          width: '100%',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.80)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 20,
            padding: '22px 18px 20px',
            boxShadow: '0 4px 24px rgba(251,119,1,0.08), 0 0 0 1px rgba(251,119,1,0.12)',
            width: 320,
            flexShrink: 0,
            position: 'relative',
            zIndex: isDragActive ? 35 : 2,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'rgba(26,26,26,0.55)',
              display: 'block',
              marginBottom: 14,
              paddingLeft: 4,
              fontFamily: 'var(--font-mono)',
            }}
          >
            Connectors
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CONNECTORS.map((c) => {
              const isHovered = hoveredPill === c.id;
              return (
                <div
                  key={c.id}
                  onPointerDown={(e) => handlePointerDown(e, c)}
                  onMouseEnter={() => setHoveredPill(c.id)}
                  onMouseLeave={() => setHoveredPill(null)}
                  role="button"
                  tabIndex={0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 14px',
                    borderRadius: 14,
                    border: isHovered ? '1px solid rgba(251,119,1,0.35)' : '1px solid rgba(26,26,26,0.08)',
                    background: isHovered ? 'rgba(251,119,1,0.06)' : '#ffffff',
                    cursor: 'grab',
                    userSelect: 'none',
                    touchAction: 'none',
                    transition: 'box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease',
                    boxShadow: isHovered ? '0 6px 18px rgba(251,119,1,0.14)' : '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <img src={iconifyUrl(c.iconSlug)} alt="" width={22} height={22} style={{ flexShrink: 0, borderRadius: 3 }} draggable={false} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.25 }}>
                    {c.name}
                  </span>
                </div>
              );
            })}
          </div>
          <p style={{ marginTop: 14, paddingLeft: 4, fontSize: 12, color: 'rgba(26,26,26,0.45)', lineHeight: 1.45 }}>
            More integrations coming soon. Drag a tool into Mr8 to connect it.
          </p>
        </div>

        {/* Middle: drop target — absolutely positioned inside this flex-1 column so it
            follows layout without a scroll listener or getBoundingClientRect(). */}
        <div style={{ flex: 1, minHeight: 420, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: isDragActive ? 35 : 2,
              pointerEvents: isDragActive ? 'none' : 'auto',
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: 340,
                height: 340,
                borderRadius: '50%',
                background: isDragActive
                  ? 'radial-gradient(circle, rgba(251,119,1,0.30) 0%, rgba(251,119,1,0.12) 35%, rgba(255,180,100,0.06) 60%, transparent 75%)'
                  : 'transparent',
                transition: 'all 0.35s ease',
                pointerEvents: 'none',
                transform: isDragActive ? 'scale(1.06)' : 'scale(0.9)',
                opacity: isDragActive ? 1 : 0,
              }}
            />

            <div style={{ position: 'relative', width: 190, height: 170 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
                <Mr8Symbol size={90} />
              </div>

              <div
                ref={dropRef}
                style={{
                  position: 'absolute',
                  top: 50,
                  left: 66,
                  width: 90,
                  height: 90,
                  borderRadius: 20,
                  border: isDragActive
                    ? `2px solid ${isOverDrop ? '#FB7701' : 'rgba(251,119,1,0.55)'}`
                    : '2.5px dashed rgba(251,119,1,0.45)',
                  background: isDragActive ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.78)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  transition: 'all 0.25s ease',
                  boxShadow: isDragActive
                    ? `0 0 ${isOverDrop ? 40 : 24}px rgba(251,119,1,${isOverDrop ? 0.32 : 0.18}), 0 4px 16px rgba(251,119,1,0.12), 0 0 0 1px rgba(255,255,255,0.95)`
                    : '0 2px 10px rgba(251,119,1,0.08)',
                  transform: isOverDrop ? 'scale(1.08)' : 'scale(1)',
                }}
              >
                {dropped ? (
                  <div style={{ position: 'relative', pointerEvents: 'auto' }}>
                    <img src={iconifyUrl(dropped.iconSlug)} alt={dropped.name} width={38} height={38} style={{ borderRadius: 6 }} draggable={false} />
                    <button
                      type="button"
                      onClick={handleReset}
                      style={{
                        position: 'absolute',
                        top: -10,
                        right: -14,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: '#FB7701',
                        border: '2px solid #fff',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        padding: 0,
                        boxShadow: '0 2px 6px rgba(251,119,1,0.35)',
                      }}
                      aria-label="Remove connector"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <svg width="30" height="30" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                    <path
                      d="M14 6V22M6 14H22"
                      stroke="#FB7701"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            width: 380,
            flexShrink: 0,
            minHeight: 420,
            position: 'relative',
            zIndex: isDragActive ? 35 : 2,
          }}
        >
          {detailsState === 'idle' && (
            <div
              style={{
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: 20,
                padding: '26px 28px',
                minHeight: 420,
                border: '1px solid rgba(251,119,1,0.16)',
                boxShadow: '0 4px 24px rgba(251,119,1,0.06)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: '#FB7701',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Integration Details
              </span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p
                  style={{
                    fontSize: 19,
                    lineHeight: 1.5,
                    color: 'rgba(26,26,26,0.78)',
                    textAlign: 'center',
                    maxWidth: 260,
                    fontWeight: 400,
                  }}
                >
                  <span style={{ marginRight: 6 }}>&#9664;</span>
                  <strong style={{ color: '#1a1a1a' }}>Drag and drop</strong> a tool into Mr8 to see how it connects.
                </p>
              </div>
            </div>
          )}

          {detailsState === 'loading' && dropped && (
            <div
              style={{
                background: 'linear-gradient(180deg, #ffffff 0%, rgba(255,246,230,0.9) 100%)',
                borderRadius: 20,
                padding: '28px 28px 36px',
                minHeight: 420,
                border: '1px solid rgba(251,119,1,0.18)',
                boxShadow: '0 8px 28px rgba(251,119,1,0.12)',
                animation: 'fadeSlideUp 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <img src={mr8Logo} alt="Mr8" width={22} height={22} style={{ borderRadius: 6 }} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#FB7701' }}>Mr8</span>
                <span style={{ fontSize: 18, fontWeight: 400, color: '#9ca3af' }}>+</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>{dropped.name}</span>
              </div>
              <SkeletonBars />
            </div>
          )}

          {detailsState === 'loaded' && dropped && (
            <div
              style={{
                background: 'linear-gradient(180deg, #ffffff 0%, rgba(255,246,230,0.9) 100%)',
                borderRadius: 20,
                padding: '28px 28px 24px',
                minHeight: 420,
                border: '1px solid rgba(251,119,1,0.18)',
                boxShadow: '0 8px 28px rgba(251,119,1,0.12)',
                animation: 'fadeSlideUp 0.3s ease',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <img src={mr8Logo} alt="Mr8" width={22} height={22} style={{ borderRadius: 6 }} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#FB7701' }}>Mr8</span>
                <span style={{ fontSize: 18, fontWeight: 400, color: '#9ca3af' }}>+</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>{dropped.name}</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(26,26,26,0.72)', margin: '0 0 22px' }}>
                {dropped.description}
              </p>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#FB7701', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
                What you get
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dropped.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      fontSize: 14,
                      color: '#1a1a1a',
                      lineHeight: 1.45,
                    }}
                  >
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right', marginTop: 24 }}>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#FB7701',
                    background: 'none',
                    border: '1px solid rgba(251,119,1,0.35)',
                    borderRadius: 999,
                    padding: '7px 14px',
                    cursor: 'pointer',
                  }}
                >
                  Try another connector
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {dragging && (
        <div
          ref={pillRef}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            transform: 'translate(-50%, -50%) rotate(-3deg) scale(1.04)',
            zIndex: 50,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 18px 11px 14px',
            borderRadius: 14,
            background: '#ffffff',
            boxShadow: '0 16px 40px rgba(251,119,1,0.28), 0 0 0 1px rgba(251,119,1,0.25)',
            border: '1px solid rgba(251,119,1,0.35)',
          }}
        >
          <img src={iconifyUrl(dragging.iconSlug)} alt="" width={24} height={24} style={{ borderRadius: 4 }} draggable={false} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap' }}>
            {dragging.name}
          </span>
        </div>
      )}
    </section>
  );
}
