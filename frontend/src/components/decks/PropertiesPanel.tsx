import type { EditorElement, ChartDataPoint } from '../../types/deck';

interface Props {
  element: EditorElement | null;
  onChange: (patch: Partial<EditorElement>) => void;
  onDelete: () => void;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-medium mb-1.5">
      {children}
    </label>
  );
}

function inputCls(): string {
  return 'w-full px-2 py-1 text-xs bg-surface-secondary dark:bg-[#0A0A0A] border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-accent dark:focus:border-white/50';
}

export default function PropertiesPanel({ element, onChange, onDelete }: Props) {
  if (!element) {
    return (
      <div className="w-64 flex-shrink-0 border-l border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0A0A0A] p-3 text-xs text-ink-tertiary dark:text-[#666]">
        Select an element to edit its properties.
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 border-l border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0A0A0A] overflow-y-auto subtle-scrollbar">
      <div className="px-3 py-2 border-b border-edge dark:border-[#2A2A2A] flex items-center justify-between sticky top-0 bg-surface-secondary dark:bg-[#0A0A0A] z-10">
        <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-medium">
          {element.type}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-[11px] text-status-error hover:underline"
        >
          Delete
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* position */}
        <div>
          <Label>Position</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <div className="text-[10px] text-ink-tertiary dark:text-[#666] mb-0.5">X</div>
              <input
                type="number"
                value={Math.round(element.x)}
                onChange={(e) => onChange({ x: Number(e.target.value) })}
                className={inputCls()}
              />
            </div>
            <div>
              <div className="text-[10px] text-ink-tertiary dark:text-[#666] mb-0.5">Y</div>
              <input
                type="number"
                value={Math.round(element.y)}
                onChange={(e) => onChange({ y: Number(e.target.value) })}
                className={inputCls()}
              />
            </div>
            <div>
              <div className="text-[10px] text-ink-tertiary dark:text-[#666] mb-0.5">W</div>
              <input
                type="number"
                value={Math.round(element.w)}
                onChange={(e) => onChange({ w: Number(e.target.value) })}
                className={inputCls()}
              />
            </div>
            <div>
              <div className="text-[10px] text-ink-tertiary dark:text-[#666] mb-0.5">H</div>
              <input
                type="number"
                value={Math.round(element.h)}
                onChange={(e) => onChange({ h: Number(e.target.value) })}
                className={inputCls()}
              />
            </div>
          </div>
        </div>

        {element.type === 'text' && <TextControls element={element} onChange={onChange} />}
        {element.type === 'image' && <ImageControls element={element} onChange={onChange} />}
        {element.type === 'shape' && <ShapeControls element={element} onChange={onChange} />}
        {element.type === 'chart' && <ChartControls element={element} onChange={onChange} />}
        {element.type === 'stat' && <StatControls element={element} onChange={onChange} />}
      </div>
    </div>
  );
}

function TextControls({
  element,
  onChange,
}: {
  element: Extract<EditorElement, { type: 'text' }>;
  onChange: (patch: Partial<EditorElement>) => void;
}) {
  return (
    <>
      <div>
        <Label>Content</Label>
        <textarea
          value={element.content}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={3}
          className={inputCls()}
        />
      </div>
      <div>
        <Label>Font size</Label>
        <input
          type="number"
          value={element.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className={inputCls()}
        />
      </div>
      <div>
        <Label>Weight</Label>
        <select
          value={element.fontWeight}
          onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
          className={inputCls()}
        >
          <option value={300}>Light (300)</option>
          <option value={400}>Regular (400)</option>
          <option value={500}>Medium (500)</option>
          <option value={600}>Semibold (600)</option>
          <option value={700}>Bold (700)</option>
          <option value={800}>Extra bold (800)</option>
        </select>
      </div>
      <div>
        <Label>Align</Label>
        <div className="grid grid-cols-3 gap-1">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ align: a })}
              className={`px-2 py-1 text-xs rounded border capitalize ${
                element.align === a
                  ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10'
                  : 'border-edge dark:border-[#2A2A2A]'
              } text-ink dark:text-[#E8E8E8]`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Color</Label>
        <input
          type="color"
          value={element.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-full h-8 bg-transparent cursor-pointer"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ italic: !element.italic })}
          className={`flex-1 px-2 py-1 text-xs rounded border italic ${
            element.italic
              ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10'
              : 'border-edge dark:border-[#2A2A2A]'
          } text-ink dark:text-[#E8E8E8]`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => onChange({ underline: !element.underline })}
          className={`flex-1 px-2 py-1 text-xs rounded border underline ${
            element.underline
              ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10'
              : 'border-edge dark:border-[#2A2A2A]'
          } text-ink dark:text-[#E8E8E8]`}
        >
          U
        </button>
      </div>
    </>
  );
}

function ImageControls({
  element,
  onChange,
}: {
  element: Extract<EditorElement, { type: 'image' }>;
  onChange: (patch: Partial<EditorElement>) => void;
}) {
  return (
    <>
      <div>
        <Label>Image URL</Label>
        <textarea
          value={element.src}
          onChange={(e) => onChange({ src: e.target.value })}
          rows={3}
          className={inputCls()}
        />
      </div>
      <div>
        <Label>Fit</Label>
        <div className="grid grid-cols-2 gap-1">
          {(['cover', 'contain'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onChange({ objectFit: f })}
              className={`px-2 py-1 text-xs rounded border capitalize ${
                element.objectFit === f
                  ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10'
                  : 'border-edge dark:border-[#2A2A2A]'
              } text-ink dark:text-[#E8E8E8]`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ShapeControls({
  element,
  onChange,
}: {
  element: Extract<EditorElement, { type: 'shape' }>;
  onChange: (patch: Partial<EditorElement>) => void;
}) {
  return (
    <>
      <div>
        <Label>Shape</Label>
        <div className="grid grid-cols-3 gap-1">
          {(['rect', 'circle', 'line'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ shape: s })}
              className={`px-2 py-1 text-xs rounded border capitalize ${
                element.shape === s
                  ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10'
                  : 'border-edge dark:border-[#2A2A2A]'
              } text-ink dark:text-[#E8E8E8]`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Fill</Label>
        <input
          type="color"
          value={element.fill.startsWith('rgb') ? '#000000' : element.fill}
          onChange={(e) => onChange({ fill: e.target.value })}
          className="w-full h-8 bg-transparent cursor-pointer"
        />
      </div>
      {element.shape === 'rect' && (
        <div>
          <Label>Corner radius</Label>
          <input
            type="number"
            min={0}
            value={element.borderRadius || 0}
            onChange={(e) => onChange({ borderRadius: Number(e.target.value) })}
            className={inputCls()}
          />
        </div>
      )}
    </>
  );
}

function ChartControls({
  element,
  onChange,
}: {
  element: Extract<EditorElement, { type: 'chart' }>;
  onChange: (patch: Partial<EditorElement>) => void;
}) {
  const updatePoint = (i: number, point: Partial<ChartDataPoint>) => {
    const data = [...element.data];
    data[i] = { ...data[i], ...point };
    onChange({ data });
  };

  return (
    <>
      <div>
        <Label>Type</Label>
        <div className="grid grid-cols-3 gap-1">
          {(['bar', 'line', 'pie'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ chartType: t })}
              className={`px-2 py-1 text-xs rounded border capitalize ${
                element.chartType === t
                  ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10'
                  : 'border-edge dark:border-[#2A2A2A]'
              } text-ink dark:text-[#E8E8E8]`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Data</Label>
        <div className="space-y-1.5">
          {element.data.map((point, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-1.5">
              <input
                type="text"
                value={point.label}
                onChange={(e) => updatePoint(i, { label: e.target.value })}
                placeholder="Label"
                className={inputCls()}
              />
              <input
                type="number"
                value={point.value}
                onChange={(e) => updatePoint(i, { value: Number(e.target.value) })}
                className={inputCls()}
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ data: element.data.filter((_, idx) => idx !== i) })
                }
                className="px-1 text-status-error text-xs"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ data: [...element.data, { label: 'New', value: 0 }] })
            }
            className="w-full px-2 py-1 text-[11px] border border-dashed border-edge dark:border-[#2A2A2A] rounded text-ink-tertiary hover:text-ink dark:hover:text-white"
          >
            + Add point
          </button>
        </div>
      </div>
    </>
  );
}

function StatControls({
  element,
  onChange,
}: {
  element: Extract<EditorElement, { type: 'stat' }>;
  onChange: (patch: Partial<EditorElement>) => void;
}) {
  return (
    <>
      <div>
        <Label>Value</Label>
        <input
          type="text"
          value={element.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className={inputCls()}
        />
      </div>
      <div>
        <Label>Label</Label>
        <input
          type="text"
          value={element.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className={inputCls()}
        />
      </div>
      <div>
        <Label>Caption</Label>
        <input
          type="text"
          value={element.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className={inputCls()}
        />
      </div>
      <div>
        <Label>Trend</Label>
        <div className="grid grid-cols-3 gap-1">
          {(['up', 'neutral', 'down'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ trend: t })}
              className={`px-2 py-1 text-xs rounded border capitalize ${
                element.trend === t
                  ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10'
                  : 'border-edge dark:border-[#2A2A2A]'
              } text-ink dark:text-[#E8E8E8]`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
