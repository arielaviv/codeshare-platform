export const COLORS = {
  bgDeep: '#0c0c0f',
  bg: '#18181b',
  bgRaised: '#1c1c20',
  border: '#27272a',
  borderLight: '#3f3f46',
  text: '#f4f4f5',
  textDim: '#a1a1aa',
  textMute: '#71717a',
  accent: '#FFB229',
  accentSoft: 'rgba(255,178,41,0.15)',
  success: '#22c55e',
  error: '#ef4444',
  running: '#3b82f6',
  mono: `'JetBrains Mono','Fira Code','Menlo','Consolas',monospace`,
} as const;

export const STATUS_COLOR: Record<'running' | 'success' | 'error', string> = {
  running: COLORS.running,
  success: COLORS.success,
  error: COLORS.error,
};

export const KEYFRAMES = `
@keyframes mr8ComputerSlideIn {
  from { opacity: 0; transform: translateX(60px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes mr8AccentPulse {
  0%,100% { opacity: 0.35; }
  50%     { opacity: 1; }
}
@keyframes mr8Spin {
  to { transform: rotate(360deg); }
}
@keyframes mr8CursorBlink {
  0%,50% { opacity: 1; }
  50.01%,100% { opacity: 0; }
}
@keyframes mr8ThumbnailReveal {
  from { clip-path: inset(100% 0 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}
@keyframes mr8Shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes mr8ScanLine {
  0%   { transform: translateY(-100%); opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translateY(200%); opacity: 0; }
}
`;
