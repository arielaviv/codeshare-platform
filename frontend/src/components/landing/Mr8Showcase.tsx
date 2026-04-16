import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

type Phase = 'idle' | 'selected' | 'scanning' | 'complete';

interface AnimationState {
  topText: string;
  bottomText?: string;
  activeStep: number;
  phase: Phase;
}

interface CityPoint {
  lat: number;
  lon: number;
  name: string;
}

interface Projected {
  x: number;
  y: number;
  z: number;
}

interface GlobeColors {
  grid: string;
  gridWidth: number;
  outline: string;
  outlineWidth: number;
  dot: string;
  dotGlow: string;
  dotRadius: number;
  arc: string;
  arcWidth: number;
}

const STEP_DURATION = 3000;
const DEG = Math.PI / 180;
const VIEW_LAT = 15 * DEG;

const STATES: AnimationState[] = [
  { topText: 'Reading your prompt…', activeStep: 0, phase: 'idle' },
  { topText: 'Drafting a plan', activeStep: 1, phase: 'selected' },
  { topText: 'Building', activeStep: 2, phase: 'scanning' },
  { topText: 'Shipped', bottomText: 'Your artifact is live', activeStep: 3, phase: 'complete' },
];

const CITIES: CityPoint[] = [
  { lat: 40.7128 * DEG, lon: -74.006 * DEG, name: 'NY' },
  { lat: 51.5074 * DEG, lon: -0.1278 * DEG, name: 'London' },
  { lat: 35.6762 * DEG, lon: 139.6503 * DEG, name: 'Tokyo' },
  { lat: 25.2048 * DEG, lon: 55.2708 * DEG, name: 'Dubai' },
  { lat: -33.8688 * DEG, lon: 151.2093 * DEG, name: 'Sydney' },
  { lat: -23.5505 * DEG, lon: -46.6333 * DEG, name: 'SP' },
  { lat: 19.076 * DEG, lon: 72.8777 * DEG, name: 'Mumbai' },
  { lat: 1.3521 * DEG, lon: 103.8198 * DEG, name: 'Singapore' },
  { lat: -33.9249 * DEG, lon: 18.4241 * DEG, name: 'Cape Town' },
  { lat: 43.6532 * DEG, lon: -79.3832 * DEG, name: 'Toronto' },
  { lat: 52.52 * DEG, lon: 13.405 * DEG, name: 'Berlin' },
  { lat: 37.5665 * DEG, lon: 126.978 * DEG, name: 'Seoul' },
  { lat: -1.2921 * DEG, lon: 36.8219 * DEG, name: 'Nairobi' },
  { lat: 19.4326 * DEG, lon: -99.1332 * DEG, name: 'Mexico' },
];

const ARCS: [number, number][] = [
  [0, 1], [1, 3], [3, 6], [6, 7], [7, 2], [2, 4], [5, 8], [0, 9], [10, 12],
];

interface StepInfo {
  title: string;
  description: string;
  icon: 'understand' | 'plan' | 'build' | 'ship';
}

const STEPS: StepInfo[] = [
  {
    title: 'Understand',
    description: 'Reads your prompt, intent, and constraints — then asks what is missing.',
    icon: 'understand',
  },
  {
    title: 'Plan',
    description: 'Drafts a build plan with clear steps, gets your approval before moving.',
    icon: 'plan',
  },
  {
    title: 'Execute',
    description: 'Writes code, generates assets, streams progress end-to-end.',
    icon: 'build',
  },
  {
    title: 'Ship',
    description: 'Hands back a working artifact — code, deck, brief, video, or audio.',
    icon: 'ship',
  },
];

function project(lat: number, lon: number, R: number, viewLon: number): Projected {
  const dLon = lon - viewLon;
  return {
    x: R * Math.cos(lat) * Math.sin(dLon),
    y: -(R * (Math.cos(VIEW_LAT) * Math.sin(lat) - Math.sin(VIEW_LAT) * Math.cos(lat) * Math.cos(dLon))),
    z: R * (Math.sin(VIEW_LAT) * Math.sin(lat) + Math.cos(VIEW_LAT) * Math.cos(lat) * Math.cos(dLon)),
  };
}

function drawLatLine(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, latRad: number, viewLon: number, color: string, lw: number) {
  const steps = 90;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  let drawing = false;
  for (let i = 0; i <= steps; i++) {
    const lon = (i / steps) * Math.PI * 2;
    const p = project(latRad, lon, R, viewLon);
    if (p.z > 0) {
      if (!drawing) { ctx.moveTo(cx + p.x, cy + p.y); drawing = true; }
      else { ctx.lineTo(cx + p.x, cy + p.y); }
    } else { drawing = false; }
  }
  ctx.stroke();
}

function drawMeridian(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, lonRad: number, viewLon: number, color: string, lw: number) {
  const steps = 90;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  let drawing = false;
  for (let i = 0; i <= steps; i++) {
    const lat = -Math.PI / 2 + (i / steps) * Math.PI;
    const p = project(lat, lonRad, R, viewLon);
    if (p.z > 0) {
      if (!drawing) { ctx.moveTo(cx + p.x, cy + p.y); drawing = true; }
      else { ctx.lineTo(cx + p.x, cy + p.y); }
    } else { drawing = false; }
  }
  ctx.stroke();
}

function drawGreatCircleArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, c1: CityPoint, c2: CityPoint, viewLon: number, color: string, lw: number) {
  const steps = 40;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  let drawing = false;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = c1.lat + (c2.lat - c1.lat) * t;
    const lon = c1.lon + (c2.lon - c1.lon) * t;
    const lift = 1 + 0.06 * Math.sin(t * Math.PI);
    const p = project(lat, lon, R * lift, viewLon);
    if (p.z > 0) {
      if (!drawing) { ctx.moveTo(cx + p.x, cy + p.y); drawing = true; }
      else { ctx.lineTo(cx + p.x, cy + p.y); }
    } else { drawing = false; }
  }
  ctx.stroke();
}

function drawDots(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, viewLon: number, dotColor: string, glowColor: string, dotRadius: number) {
  for (const city of CITIES) {
    const p = project(city.lat, city.lon, R, viewLon);
    if (p.z > 0) {
      const alpha = 0.3 + 0.7 * (p.z / R);
      ctx.beginPath();
      ctx.arc(cx + p.x, cy + p.y, dotRadius * 3, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.globalAlpha = alpha * 0.3;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + p.x, cy + p.y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawGlobeGeometry(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, viewLon: number, colors: GlobeColors, showArcs: boolean) {
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = colors.outlineWidth;
  ctx.stroke();
  for (let latDeg = -60; latDeg <= 60; latDeg += 30) {
    drawLatLine(ctx, cx, cy, R, latDeg * DEG, viewLon, colors.grid, colors.gridWidth);
  }
  for (let lonDeg = 0; lonDeg < 360; lonDeg += 30) {
    drawMeridian(ctx, cx, cy, R, lonDeg * DEG, viewLon, colors.grid, colors.gridWidth);
  }
  drawDots(ctx, cx, cy, R, viewLon, colors.dot, colors.dotGlow, colors.dotRadius);
  if (showArcs) {
    for (const [i1, i2] of ARCS) {
      drawGreatCircleArc(ctx, cx, cy, R, CITIES[i1], CITIES[i2], viewLon, colors.arc, colors.arcWidth);
    }
  }
}

function drawGlobe(ctx: CanvasRenderingContext2D, w: number, h: number, rotation: number, phase: Phase, scanProg: number) {
  const cx = w / 2;
  const cy = h / 2 - 8;
  const R = 115;
  ctx.clearRect(0, 0, w, h);

  const haloAlpha = phase === 'complete' ? 0.12 : 0.04;
  const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.5);
  halo.addColorStop(0, `rgba(251, 119, 1, ${haloAlpha})`);
  halo.addColorStop(1, 'rgba(251, 119, 1, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  const grayColors: GlobeColors = {
    grid: 'rgba(255,255,255,0.09)',
    gridWidth: 0.6,
    outline: 'rgba(255,255,255,0.12)',
    outlineWidth: 0.8,
    dot: 'rgba(255,255,255,0.28)',
    dotGlow: 'rgba(255,255,255,0.05)',
    dotRadius: phase === 'selected' ? 2.5 : 2,
    arc: 'rgba(255,255,255,0.06)',
    arcWidth: 0.5,
  };
  const showGrayArcs = phase === 'selected' || phase === 'scanning' || phase === 'complete';
  drawGlobeGeometry(ctx, cx, cy, R, rotation, grayColors, showGrayArcs);

  if (phase === 'scanning' || phase === 'complete') {
    const clipWidth = phase === 'complete' ? w : scanProg * w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, clipWidth, h);
    ctx.clip();
    const orangeColors: GlobeColors = {
      grid: 'rgba(251,119,1,0.6)',
      gridWidth: 0.9,
      outline: '#FB7701',
      outlineWidth: 1.2,
      dot: '#FB7701',
      dotGlow: 'rgba(251,119,1,0.25)',
      dotRadius: 2.5,
      arc: 'rgba(251,119,1,0.7)',
      arcWidth: 1,
    };
    drawGlobeGeometry(ctx, cx, cy, R, rotation, orangeColors, true);
    ctx.restore();

    if (phase === 'scanning' && scanProg > 0.01 && scanProg < 0.99) {
      const sx = scanProg * w;
      const grad = ctx.createLinearGradient(sx - 20, 0, sx + 8, 0);
      grad.addColorStop(0, 'rgba(251,119,1,0)');
      grad.addColorStop(0.7, 'rgba(251,119,1,0.18)');
      grad.addColorStop(1, 'rgba(251,119,1,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - 20, 0, 28, h);
    }
  }

  if (phase === 'complete') {
    ctx.strokeStyle = 'rgba(251,119,1,0.35)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy - R - 25);
    ctx.lineTo(cx, cy + R + 25);
    ctx.moveTo(cx - R - 25, cy);
    ctx.lineTo(cx + R + 25, cy);
    ctx.stroke();
  }
}

function GlobeCanvas({ phase, scanProgress }: { phase: Phase; scanProgress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const rotationRef = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const scanRef = useRef(scanProgress);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { scanRef.current = scanProgress; }, [scanProgress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalW = 380;
    const logicalH = 480;
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;

    const loop = () => {
      rotationRef.current += 0.003;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGlobe(ctx, logicalW, logicalH, rotationRef.current, phaseRef.current, scanRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return <canvas ref={canvasRef} role="img" aria-label="Mr8 building loop globe" style={{ width: 380, height: 480 }} />;
}

function StepIcon({ icon, active }: { icon: StepInfo['icon']; active: boolean }) {
  const stroke = active ? '#FB7701' : '#777';
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (icon === 'understand') return (
    <svg {...common}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
  );
  if (icon === 'plan') return (
    <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></svg>
  );
  if (icon === 'build') return (
    <svg {...common}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
  );
  return (
    <svg {...common}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
  );
}

function StatusBadge({ text }: { text: string }) {
  return (
    <div
      className="inline-flex items-center rounded-lg px-4 py-1.5 text-[13px]"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.75)',
        fontFamily: 'var(--font-mono)',
        animation: 'fadeSlideUp 0.4s ease-out',
      }}
    >
      {text}
    </div>
  );
}

function StepCard({ step, active }: { step: StepInfo; active: boolean }) {
  return (
    <div className="flex gap-4 transition-all duration-500" style={{ opacity: active ? 1 : 0.4 }}>
      <div
        className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-500"
        style={{
          border: active ? '1px solid rgba(251,119,1,0.35)' : '1px solid rgba(255,255,255,0.08)',
          background: active ? 'rgba(251,119,1,0.08)' : 'transparent',
        }}
      >
        <StepIcon icon={step.icon} active={active} />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold mb-1 transition-colors duration-500" style={{ color: active ? '#ffffff' : '#888' }}>
          {step.title}
        </h3>
        <p className="text-[13px] leading-relaxed transition-colors duration-500" style={{ color: active ? '#a0a0a0' : '#555' }}>
          {step.description}
        </p>
      </div>
    </div>
  );
}

function CornerBrackets() {
  const color = '#FB7701';
  const size = 50;
  const offset = -28;
  const radius = 12;
  const sw = 2;
  const d = `M ${size} 0 L ${radius} 0 Q 0 0 0 ${radius} L 0 ${size}`;
  const pos = (top: number | 'auto', right: number | 'auto', bottom: number | 'auto', left: number | 'auto', rot: number): React.CSSProperties => ({
    position: 'absolute',
    top: top === 'auto' ? 'auto' : top,
    right: right === 'auto' ? 'auto' : right,
    bottom: bottom === 'auto' ? 'auto' : bottom,
    left: left === 'auto' ? 'auto' : left,
    width: size,
    height: size,
    transform: `rotate(${rot}deg)`,
    animation: 'mr8-corner-pulse 4s ease-in-out infinite',
  });
  return (
    <>
      <svg style={pos(offset, 'auto', 'auto', offset, 0)} viewBox="0 0 50 50" fill="none"><path d={d} stroke={color} strokeWidth={sw} strokeLinecap="round" /></svg>
      <svg style={pos(offset, offset, 'auto', 'auto', 90)} viewBox="0 0 50 50" fill="none"><path d={d} stroke={color} strokeWidth={sw} strokeLinecap="round" /></svg>
      <svg style={pos('auto', offset, offset, 'auto', 180)} viewBox="0 0 50 50" fill="none"><path d={d} stroke={color} strokeWidth={sw} strokeLinecap="round" /></svg>
      <svg style={pos('auto', 'auto', offset, offset, 270)} viewBox="0 0 50 50" fill="none"><path d={d} stroke={color} strokeWidth={sw} strokeLinecap="round" /></svg>
    </>
  );
}

export default function Mr8Showcase() {
  const [stateIndex, setStateIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const state = STATES[stateIndex];

  useEffect(() => {
    const interval = setInterval(() => {
      setStateIndex((prev) => (prev + 1) % STATES.length);
    }, STEP_DURATION);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (state.phase === 'scanning') {
      setScanProgress(0);
      let start: number | null = null;
      let raf: number;
      const duration = STEP_DURATION * 0.85;
      const animate = (ts: number) => {
        if (!start) start = ts;
        const elapsed = ts - start;
        const progress = Math.min(elapsed / duration, 1);
        setScanProgress(progress);
        if (progress < 1) raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(raf);
    }
    if (state.phase === 'complete') setScanProgress(1);
    else setScanProgress(0);
  }, [state.phase]);

  return (
    <section className="relative overflow-hidden" style={{ background: '#08080d' }}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, #08080d 80%)' }}
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-8 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-12 items-center min-h-[600px]">
          <div className="max-w-[420px]">
            <p className="text-xs font-medium tracking-[0.2em] uppercase mb-6 text-[#a0a0a0]" style={{ fontFamily: 'var(--font-mono)' }}>
              How Mr8 works
            </p>
            <h2 className="text-[42px] leading-[1.1] font-semibold mb-8">
              <span className="text-white">One agent. Every surface. </span>
              <span className="text-[#6a6a6a]">
                Mr8 plans, researches, builds, and ships — code apps, decks, research briefs, video,
                audio, visualizations — all from a single prompt.
              </span>
            </h2>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110"
              style={{
                background: 'rgba(251, 119, 1, 0.92)',
                color: '#ffffff',
                border: '1px solid rgba(251, 119, 1, 0.55)',
                boxShadow: '0 4px 18px rgba(251, 119, 1, 0.32)',
              }}
            >
              Start building
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 13L13 1M13 1H5M13 1V9" />
              </svg>
            </Link>
          </div>

          <div className="relative mx-auto">
            <CornerBrackets />
            <div
              className="relative w-[380px] h-[480px] rounded-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="absolute top-0 left-0 right-0 z-10 flex justify-center pt-5">
                <StatusBadge text={state.topText} key={`top-${stateIndex}`} />
              </div>
              <div className="absolute inset-0">
                <GlobeCanvas phase={state.phase} scanProgress={scanProgress} />
              </div>
              {state.bottomText && (
                <div className="absolute bottom-5 left-0 right-0 z-10 flex justify-center">
                  <StatusBadge text={state.bottomText} key={`btm-${stateIndex}`} />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-8 max-w-[320px] lg:ml-4">
            {STEPS.map((step, i) => (
              <StepCard key={step.title} step={step} active={state.activeStep === i} />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[800px]">
        <div
          className="h-px w-full"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.15) 0, rgba(255,255,255,0.15) 4px, transparent 4px, transparent 12px)',
          }}
        />
      </div>
    </section>
  );
}
