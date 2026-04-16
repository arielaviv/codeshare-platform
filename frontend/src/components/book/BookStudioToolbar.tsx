/**
 * Studio toolbar. Matches DeckEditor's EditorToolbar ergonomics:
 * ← Books · title input · save status · +Add · Theme · Public · Export · Read.
 *
 * Slice 4a: title input + Theme dropdown wired. +Add / Public / Export /
 * Read slots are visible but disabled (they become functional in 4b-7 as
 * the stages land — drafting, cover selection, bundling).
 */
import { useState, useRef, useEffect } from 'react';
import { BOOK_THEMES, type BookThemeId } from '../../themes/book';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  title: string;
  saveStatus: SaveStatus;
  themeId: BookThemeId;
  onTitleChange: (t: string) => void;
  onThemeChange: (id: BookThemeId) => void;
  /** Triggers the Formatter (Slice 7.ii). Disabled until drafted. */
  onExport?: () => void;
  /** When true, export is currently streaming — render the button as running. */
  exportRunning?: boolean;
  /** Disable the export button with a tooltip (e.g. "Draft chapters first"). */
  exportDisabledReason?: string;
  /** Content edited since last export — show a stale-badge dot on Export. */
  artifactsStale?: boolean;
}

export default function BookStudioToolbar({
  title,
  saveStatus,
  themeId,
  onTitleChange,
  onThemeChange,
  onExport,
  exportRunning,
  exportDisabledReason,
  artifactsStale,
}: Props): JSX.Element {
  const [localTitle, setLocalTitle] = useState(title);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  // Debounced save on title blur or Enter.
  const commitTitle = () => {
    const trimmed = localTitle.trim();
    if (trimmed && trimmed !== title) onTitleChange(trimmed);
  };

  useEffect(() => {
    if (!themeOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [themeOpen]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-edge dark:border-[#1A1A1A] bg-white dark:bg-[#0A0A0A] flex-shrink-0">
      {/* ← Books */}
      <a
        href="/books"
        className="flex items-center gap-1 text-xs text-ink-tertiary dark:text-[#888] hover:text-ink dark:hover:text-[#E8E8E8] transition-colors"
        title="Back to your books"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Books
      </a>
      <span className="h-4 w-px bg-edge dark:bg-[#2A2A2A]" />

      {/* Title input */}
      <input
        type="text"
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="text-sm font-medium text-ink dark:text-[#E8E8E8] bg-transparent border border-transparent hover:border-edge dark:hover:border-[#2A2A2A] focus:border-brand-orange focus:outline-none rounded px-2 py-0.5 min-w-0 max-w-sm"
        placeholder="Untitled Book"
      />

      {/* Save status pill */}
      <span
        className={`text-[11px] ${
          saveStatus === 'saving'
            ? 'text-ink-tertiary dark:text-[#888]'
            : saveStatus === 'saved'
              ? 'text-status-live'
              : saveStatus === 'error'
                ? 'text-status-error'
                : 'text-transparent'
        }`}
      >
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : '—'}
      </span>

      <div className="flex-1" />

      {/* +Add — disabled slot (populated in Slice 4b+) */}
      <ToolbarButton disabled title="Add chapter / cover / translation (coming in Slice 4b)">
        + Add
      </ToolbarButton>

      {/* Theme dropdown */}
      <div className="relative" ref={themeRef}>
        <ToolbarButton onClick={() => setThemeOpen((s) => !s)} title="Pick a book theme">
          <ThemeSwatches theme={BOOK_THEMES[themeId]} />
          {BOOK_THEMES[themeId].displayName}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </ToolbarButton>
        {themeOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-[320px] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg shadow-xl py-1 z-50"
            role="menu"
          >
            {Object.values(BOOK_THEMES).map((t) => {
              const isActive = t.id === themeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onThemeChange(t.id);
                    setThemeOpen(false);
                  }}
                  className={`flex items-start gap-3 w-full px-3 py-2 text-left transition-colors ${
                    isActive
                      ? 'bg-surface-secondary dark:bg-[#0F0F0F]'
                      : 'hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A]'
                  }`}
                >
                  <ThemeSwatches theme={t} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isActive ? 'text-brand-orange font-semibold' : 'text-ink dark:text-[#E8E8E8]'}`}>
                        {t.displayName}
                      </span>
                      {isActive && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand-orange">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-tertiary dark:text-[#888] mt-0.5 leading-snug">
                      {t.tagline}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Public toggle — disabled slot (Slice 10). */}
      <ToolbarButton disabled title="Public share (coming in Slice 10)">
        Private
      </ToolbarButton>

      {/* Export — streams the Formatter + Bundler chain (Slice 7). */}
      <div className="relative">
        <ToolbarButton
          onClick={onExport}
          disabled={!onExport || Boolean(exportDisabledReason) || exportRunning}
          title={
            exportRunning
              ? 'Formatting — PDF / EPUB / DOCX building now'
              : exportDisabledReason ??
                (artifactsStale
                  ? 'Content edited since last build — Export will reformat first'
                  : 'Build PDF / EPUB / DOCX + zip bundle')
          }
        >
          {exportRunning ? (
            <>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="animate-spin"
              >
                <circle cx="12" cy="12" r="9" strokeDasharray="42 58" strokeLinecap="round" />
              </svg>
              Formatting…
            </>
          ) : (
            'Export'
          )}
        </ToolbarButton>
        {artifactsStale && !exportRunning && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand-orange ring-2 ring-white dark:ring-[#0A0A0A]"
            aria-label="Content edited — reformat needed"
          />
        )}
      </div>

      {/* Read mode — disabled until chapters exist */}
      <ToolbarButton disabled title="Read mode (coming in Slice 4b)">
        Read
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-edge dark:border-[#2A2A2A] transition-colors ${
        disabled
          ? 'text-ink-tertiary dark:text-[#555] cursor-not-allowed opacity-60'
          : 'text-ink-secondary dark:text-[#A0A0A0] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] hover:text-ink dark:hover:text-[#E8E8E8]'
      }`}
    >
      {children}
    </button>
  );
}

function ThemeSwatches({ theme }: { theme: { previewPalette: [string, string, string] } }): JSX.Element {
  const [a, b, c] = theme.previewPalette;
  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      <span className="w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: a }} />
      <span className="w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: b }} />
      <span className="w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: c }} />
    </span>
  );
}
