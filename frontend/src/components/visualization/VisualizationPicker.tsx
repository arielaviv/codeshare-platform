/**
 * Manus-exact Visualization picker (image #58–60). Renders below the chat
 * input when forceMode === 'visualization'.
 *
 * "Choose output format": 5 cards. "Preferred charts": 18 thumbnails,
 * grayscale by default, full color on hover. Selected = orange ring.
 */
export type OutputFormat = 'graph' | 'slides' | 'website' | 'spreadsheet' | 'report';
export type ChartKind =
  | 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap' | 'bubble'
  | 'wordcloud' | 'sankey' | 'themeriver' | 'radar' | 'stackedbar' | 'sunburst'
  | 'funnel' | 'treemap' | 'candlestick' | 'flow' | 'area' | 'gantt';

interface Props {
  outputFormat: OutputFormat;
  preferredCharts: ChartKind[];
  onOutputFormatChange: (f: OutputFormat) => void;
  onPreferredChartsChange: (charts: ChartKind[]) => void;
}

const OUTPUT_FORMATS: { kind: OutputFormat; label: string; sketch: JSX.Element }[] = [
  { kind: 'graph', label: 'Graph', sketch: <GraphSketch /> },
  { kind: 'slides', label: 'Slides', sketch: <SlidesSketch /> },
  { kind: 'website', label: 'Website', sketch: <WebsiteSketch /> },
  { kind: 'spreadsheet', label: 'Spreadsheet', sketch: <SpreadsheetSketch /> },
  { kind: 'report', label: 'Report', sketch: <ReportSketch /> },
];

const CHART_THUMBNAILS: { kind: ChartKind; label: string; thumb: JSX.Element }[] = [
  { kind: 'bar',         label: 'Bar',         thumb: <BarThumb /> },
  { kind: 'line',        label: 'Line',        thumb: <LineThumb /> },
  { kind: 'pie',         label: 'Pie',         thumb: <PieThumb /> },
  { kind: 'scatter',     label: 'Scatter',     thumb: <ScatterThumb /> },
  { kind: 'heatmap',     label: 'Heat map',    thumb: <HeatmapThumb /> },
  { kind: 'bubble',      label: 'Bubble',      thumb: <BubbleThumb /> },
  { kind: 'wordcloud',   label: 'Word cloud',  thumb: <WordCloudThumb /> },
  { kind: 'sankey',      label: 'Sankey',      thumb: <SankeyThumb /> },
  { kind: 'themeriver',  label: 'ThemeRiver',  thumb: <ThemeRiverThumb /> },
  { kind: 'radar',       label: 'Radar',       thumb: <RadarThumb /> },
  { kind: 'stackedbar',  label: 'Stacked bar', thumb: <StackedBarThumb /> },
  { kind: 'sunburst',    label: 'Sunburst',    thumb: <SunburstThumb /> },
  { kind: 'funnel',      label: 'Funnel',      thumb: <FunnelThumb /> },
  { kind: 'treemap',     label: 'Treemap',     thumb: <TreemapThumb /> },
  { kind: 'candlestick', label: 'Candlestick', thumb: <CandlestickThumb /> },
  { kind: 'flow',        label: 'Flow',        thumb: <FlowThumb /> },
  { kind: 'area',        label: 'Area',        thumb: <AreaThumb /> },
  { kind: 'gantt',       label: 'Gantt',       thumb: <GanttThumb /> },
];

export default function VisualizationPicker({
  outputFormat,
  preferredCharts,
  onOutputFormatChange,
  onPreferredChartsChange,
}: Props): JSX.Element {
  const toggleChart = (kind: ChartKind) => {
    if (preferredCharts.includes(kind)) {
      onPreferredChartsChange(preferredCharts.filter((k) => k !== kind));
    } else {
      onPreferredChartsChange([...preferredCharts, kind]);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Choose output format */}
      <section>
        <h3 className="text-sm font-semibold text-ink dark:text-[#E8E8E8] mb-3">
          Choose output format
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {OUTPUT_FORMATS.map((f) => {
            const selected = outputFormat === f.kind;
            return (
              <button
                key={f.kind}
                type="button"
                onClick={() => onOutputFormatChange(f.kind)}
                className={`flex flex-col items-center justify-end gap-2 p-3 pb-2 rounded-lg border-2 transition-all ${
                  selected
                    ? 'border-brand-orange bg-brand-orange-soft dark:bg-brand-orange/15'
                    : 'border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:border-ink-tertiary dark:hover:border-[#444]'
                }`}
              >
                <div className={`text-sm font-semibold ${selected ? 'text-brand-orange' : 'text-ink dark:text-[#E8E8E8]'}`}>
                  {f.label}
                </div>
                <div className="w-full h-16 flex items-center justify-center bg-surface-secondary dark:bg-[#0F0F0F] rounded">
                  {f.sketch}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Preferred charts */}
      <section>
        <h3 className="text-sm font-semibold text-ink dark:text-[#E8E8E8] mb-3">
          Preferred charts <span className="text-[11px] font-normal text-ink-tertiary dark:text-[#666]">(optional)</span>
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {CHART_THUMBNAILS.map((c) => {
            const selected = preferredCharts.includes(c.kind);
            return (
              <button
                key={c.kind}
                type="button"
                onClick={() => toggleChart(c.kind)}
                className={`group flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all ${
                  selected
                    ? 'border-brand-orange ring-2 ring-brand-orange/30'
                    : 'border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#444]'
                }`}
              >
                <div className="w-full aspect-[5/3] flex items-center justify-center bg-surface-secondary dark:bg-[#0F0F0F] rounded overflow-hidden">
                  <div className={`transition-all duration-200 ${
                    selected ? '' : 'grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100'
                  }`}>
                    {c.thumb}
                  </div>
                </div>
                <div className={`text-[11px] ${selected ? 'text-brand-orange font-medium' : 'text-ink-secondary dark:text-[#A0A0A0]'}`}>
                  {c.label}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Output format sketches (small, illustrative, mostly monochrome)
// ============================================================================

function GraphSketch() {
  return (
    <svg width="64" height="40" viewBox="0 0 64 40">
      <polyline points="2,32 14,22 24,28 34,12 44,18 54,6 62,10" fill="none" stroke="#FB7701" strokeWidth="2" />
      <polyline points="2,38 14,30 24,34 34,22 44,28 54,14 62,18" fill="none" stroke="#10B981" strokeWidth="2" />
    </svg>
  );
}
function SlidesSketch() {
  return (
    <svg width="56" height="40" viewBox="0 0 56 40">
      <rect x="2" y="6" width="16" height="11" rx="1.5" fill="#334155" />
      <rect x="20" y="6" width="16" height="11" rx="1.5" fill="#334155" />
      <rect x="38" y="6" width="16" height="11" rx="1.5" fill="#334155" />
      <rect x="2" y="22" width="52" height="14" rx="1.5" fill="#475569" />
      <rect x="6" y="26" width="14" height="2" fill="#94A3B8" />
      <rect x="6" y="30" width="20" height="2" fill="#94A3B8" />
    </svg>
  );
}
function WebsiteSketch() {
  return (
    <svg width="60" height="40" viewBox="0 0 60 40">
      <rect x="2" y="2" width="56" height="36" rx="2" fill="none" stroke="#334155" />
      <rect x="2" y="2" width="56" height="6" fill="#334155" />
      <rect x="6" y="14" width="20" height="3" fill="#94A3B8" />
      <rect x="6" y="20" width="48" height="2" fill="#CBD5E1" />
      <rect x="6" y="26" width="48" height="2" fill="#CBD5E1" />
      <rect x="6" y="32" width="32" height="3" fill="#FB7701" />
    </svg>
  );
}
function SpreadsheetSketch() {
  return (
    <svg width="56" height="40" viewBox="0 0 56 40">
      <rect x="2" y="2" width="52" height="36" fill="none" stroke="#334155" />
      <line x1="2" y1="11" x2="54" y2="11" stroke="#334155" />
      <line x1="2" y1="20" x2="54" y2="20" stroke="#94A3B8" />
      <line x1="2" y1="29" x2="54" y2="29" stroke="#94A3B8" />
      <line x1="20" y1="2" x2="20" y2="38" stroke="#94A3B8" />
      <line x1="38" y1="2" x2="38" y2="38" stroke="#94A3B8" />
      <rect x="2" y="2" width="52" height="9" fill="#334155" opacity="0.4" />
    </svg>
  );
}
function ReportSketch() {
  return (
    <svg width="56" height="40" viewBox="0 0 56 40">
      <rect x="6" y="2" width="36" height="36" rx="1.5" fill="#475569" />
      <rect x="14" y="2" width="36" height="36" rx="1.5" fill="#334155" stroke="#1E293B" />
      <rect x="18" y="8" width="20" height="2.5" fill="#FB7701" />
      <rect x="18" y="14" width="28" height="1.5" fill="#94A3B8" />
      <rect x="18" y="18" width="28" height="1.5" fill="#94A3B8" />
      <rect x="18" y="26" width="14" height="8" fill="#94A3B8" />
    </svg>
  );
}

// ============================================================================
// 18 chart thumbnails — each is a tiny illustrative SVG.
// Rule: black-and-white shapes by default, brand-orange/colorful on hover.
// We achieve B&W via the parent's `grayscale` class; the thumbs use color
// internally, the wrapper desaturates them when not selected/hovered.
// ============================================================================

const I = ({ children }: { children: React.ReactNode }) => (
  <svg width="60" height="40" viewBox="0 0 60 40">{children}</svg>
);

function BarThumb() {
  return <I>
    <rect x="6"  y="20" width="6" height="16" fill="#FB7701" />
    <rect x="16" y="10" width="6" height="26" fill="#FB7701" />
    <rect x="26" y="14" width="6" height="22" fill="#FB7701" />
    <rect x="36" y="6"  width="6" height="30" fill="#FB7701" />
    <rect x="46" y="22" width="6" height="14" fill="#FB7701" />
  </I>;
}
function LineThumb() {
  return <I><polyline points="4,30 14,22 24,26 34,12 44,18 56,8" fill="none" stroke="#FB7701" strokeWidth="2.5" /></I>;
}
function PieThumb() {
  return <I>
    <circle cx="30" cy="20" r="14" fill="#94A3B8" />
    <path d="M30 20 L30 6 A14 14 0 0 1 42 24 Z" fill="#FB7701" />
    <path d="M30 20 L42 24 A14 14 0 0 1 22 32 Z" fill="#10B981" />
  </I>;
}
function ScatterThumb() {
  return <I>{[ [10,28], [16,22], [22,26], [28,18], [34,20], [40,12], [46,16], [52,8], [12,32], [44,28] ].map(([x,y], i) => (
    <circle key={i} cx={x} cy={y} r="2" fill="#FB7701" />
  ))}</I>;
}
function HeatmapThumb() {
  const cells: { x: number; y: number; v: number }[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) cells.push({ x: 4 + c * 9, y: 4 + r * 8, v: Math.random() });
  return <I>{cells.map((c, i) => (
    <rect key={i} x={c.x} y={c.y} width="8" height="7" fill={`rgba(251,119,1,${0.2 + c.v * 0.8})`} />
  ))}</I>;
}
function BubbleThumb() {
  return <I>
    <circle cx="14" cy="26" r="6" fill="#FB7701" opacity="0.7" />
    <circle cx="30" cy="14" r="9" fill="#10B981" opacity="0.7" />
    <circle cx="46" cy="24" r="5" fill="#3B82F6" opacity="0.7" />
    <circle cx="20" cy="34" r="3" fill="#F59E0B" opacity="0.7" />
  </I>;
}
function WordCloudThumb() {
  return <I>
    <text x="6"  y="14" fontSize="9"  fill="#FB7701" fontWeight="bold">data</text>
    <text x="26" y="20" fontSize="11" fill="#10B981" fontWeight="bold">CHART</text>
    <text x="6"  y="28" fontSize="7"  fill="#3B82F6">vis</text>
    <text x="22" y="34" fontSize="8"  fill="#F59E0B">tag</text>
    <text x="40" y="32" fontSize="7"  fill="#FB7701">word</text>
  </I>;
}
function SankeyThumb() {
  return <I>
    <path d="M4 12 C 20 12, 20 18, 30 18 L 30 24 C 20 24, 20 30, 4 30 Z" fill="#FB7701" opacity="0.6" />
    <path d="M30 6 C 44 6, 44 16, 56 16 L 56 22 C 44 22, 44 32, 30 32 Z" fill="#10B981" opacity="0.6" />
  </I>;
}
function ThemeRiverThumb() {
  return <I>
    <path d="M2 22 C 14 18, 24 28, 36 22 C 48 16, 56 24, 58 22 L 58 26 C 56 26, 48 18, 36 24 C 24 30, 14 20, 2 26 Z" fill="#FB7701" opacity="0.7" />
    <path d="M2 28 C 14 24, 24 34, 36 28 C 48 22, 56 30, 58 28 L 58 32 C 56 32, 48 24, 36 30 C 24 36, 14 26, 2 32 Z" fill="#10B981" opacity="0.7" />
  </I>;
}
function RadarThumb() {
  return <I>
    <polygon points="30,4 54,18 48,36 12,36 6,18" fill="none" stroke="#94A3B8" strokeWidth="1" />
    <polygon points="30,12 44,20 40,32 20,32 16,20" fill="#FB7701" opacity="0.5" stroke="#FB7701" />
  </I>;
}
function StackedBarThumb() {
  return <I>{[6, 16, 26, 36, 46].map((x, i) => (
    <g key={i}>
      <rect x={x} y="22" width="6" height="14" fill="#FB7701" />
      <rect x={x} y="14" width="6" height="8"  fill="#10B981" />
      <rect x={x} y="6"  width="6" height="8"  fill="#3B82F6" />
    </g>
  ))}</I>;
}
function SunburstThumb() {
  return <I>
    <circle cx="30" cy="20" r="6" fill="#94A3B8" />
    <path d="M30 20 L30 4 A16 16 0 0 1 44 13 Z" fill="#FB7701" />
    <path d="M30 20 L44 13 A16 16 0 0 1 44 27 Z" fill="#10B981" />
    <path d="M30 20 L44 27 A16 16 0 0 1 30 36 Z" fill="#3B82F6" />
    <path d="M30 20 L30 36 A16 16 0 0 1 16 27 Z" fill="#F59E0B" />
    <path d="M30 20 L16 27 A16 16 0 0 1 16 13 Z" fill="#EF4444" />
    <path d="M30 20 L16 13 A16 16 0 0 1 30 4 Z" fill="#A855F7" />
  </I>;
}
function FunnelThumb() {
  return <I>
    <polygon points="6,6 54,6 48,14 12,14" fill="#FB7701" />
    <polygon points="12,16 48,16 42,24 18,24" fill="#10B981" />
    <polygon points="18,26 42,26 36,34 24,34" fill="#3B82F6" />
  </I>;
}
function TreemapThumb() {
  return <I>
    <rect x="2" y="2" width="36" height="22" fill="#FB7701" />
    <rect x="2" y="26" width="22" height="12" fill="#10B981" />
    <rect x="26" y="26" width="14" height="12" fill="#3B82F6" />
    <rect x="40" y="2" width="18" height="14" fill="#F59E0B" />
    <rect x="40" y="18" width="18" height="20" fill="#EF4444" />
  </I>;
}
function CandlestickThumb() {
  return <I>{[
    [10, 8, 18, 30, 26], [20, 14, 22, 28, 24], [30, 12, 24, 32, 28], [40, 8, 14, 26, 18], [50, 16, 22, 34, 28]
  ].map(([x, hi, op, lo, cl], i) => {
    const up = cl > op;
    return <g key={i}>
      <line x1={x} y1={hi} x2={x} y2={lo} stroke="#94A3B8" />
      <rect x={x - 3} y={Math.min(op, cl)} width="6" height={Math.abs(cl - op) || 1} fill={up ? '#10B981' : '#EF4444'} />
    </g>;
  })}</I>;
}
function FlowThumb() {
  return <I>
    <rect x="4"  y="14" width="14" height="12" rx="2" fill="none" stroke="#FB7701" strokeWidth="1.5" />
    <rect x="42" y="6"  width="14" height="12" rx="2" fill="none" stroke="#10B981" strokeWidth="1.5" />
    <rect x="42" y="22" width="14" height="12" rx="2" fill="none" stroke="#3B82F6" strokeWidth="1.5" />
    <line x1="18" y1="20" x2="42" y2="12" stroke="#94A3B8" />
    <line x1="18" y1="20" x2="42" y2="28" stroke="#94A3B8" />
  </I>;
}
function AreaThumb() {
  return <I>
    <path d="M2 30 L14 22 L24 26 L34 14 L44 18 L56 8 L56 36 L2 36 Z" fill="#FB7701" opacity="0.6" />
    <polyline points="2,30 14,22 24,26 34,14 44,18 56,8" fill="none" stroke="#FB7701" strokeWidth="2" />
  </I>;
}
function GanttThumb() {
  return <I>
    <rect x="6"  y="6"  width="20" height="4" fill="#FB7701" />
    <rect x="14" y="14" width="24" height="4" fill="#10B981" />
    <rect x="22" y="22" width="22" height="4" fill="#3B82F6" />
    <rect x="34" y="30" width="20" height="4" fill="#F59E0B" />
  </I>;
}
