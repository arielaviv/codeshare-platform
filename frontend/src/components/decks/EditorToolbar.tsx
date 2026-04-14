import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SlidePalette, SlideTheme, EditorElement } from '../../types/deck';
import { DEFAULT_THEMES } from './themes';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type AddType = EditorElement['type'];

interface Props {
  deckId: string;
  title: string;
  theme: SlideTheme;
  saveStatus: SaveStatus;
  onTitleChange: (title: string) => void;
  onThemeChange: (theme: SlideTheme) => void;
  onAddElement: (type: AddType) => void;
  onExportPDF: () => void;
  isPublic: boolean;
  onTogglePublic: () => void;
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

const SAVE_CLS: Record<SaveStatus, string> = {
  idle: 'text-ink-tertiary dark:text-[#666]',
  saving: 'text-ink-tertiary dark:text-[#666]',
  saved: 'text-brand-green font-medium',
  error: 'text-status-error font-medium',
};

export default function EditorToolbar({
  deckId,
  title,
  theme,
  saveStatus,
  onTitleChange,
  onThemeChange,
  onAddElement,
  onExportPDF,
  isPublic,
  onTogglePublic,
}: Props) {
  const navigate = useNavigate();
  const [themeOpen, setThemeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="border-b border-edge dark:border-[#2A2A2A] px-3 py-2 flex items-center gap-3 bg-white dark:bg-[#0A0A0A]">
      <button
        type="button"
        onClick={() => navigate('/decks')}
        className="text-xs text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-white flex items-center gap-1"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Decks
      </button>

      <div className="h-4 w-px bg-edge dark:bg-[#2A2A2A]" />

      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-accent dark:focus:ring-white/50 rounded px-1 text-ink dark:text-[#E8E8E8] min-w-0 flex-shrink"
        placeholder="Untitled deck"
      />

      <div className={`text-[11px] flex-shrink-0 flex items-center gap-1 ${SAVE_CLS[saveStatus]}`}>
        {saveStatus === 'saved' && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {SAVE_LABEL[saveStatus]}
      </div>

      <div className="flex-1" />

      {/* Add element */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setAddOpen((v) => !v);
            setThemeOpen(false);
          }}
          className="px-2.5 py-1 text-xs border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add
        </button>
        {addOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded shadow-lg py-1 z-20">
            {(['text', 'image', 'shape', 'chart', 'stat'] as AddType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onAddElement(t);
                  setAddOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] text-ink dark:text-[#E8E8E8] capitalize"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Theme */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setThemeOpen((v) => !v);
            setAddOpen(false);
          }}
          className="px-2.5 py-1 text-xs border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] flex items-center gap-1"
        >
          <div
            className="w-3 h-3 rounded-sm border border-white/20"
            style={{ backgroundColor: theme.accentColor }}
          />
          Theme
        </button>
        {themeOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded shadow-lg py-1 z-20">
            {(Object.keys(DEFAULT_THEMES) as SlidePalette[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onThemeChange(DEFAULT_THEMES[p]);
                  setThemeOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] text-ink dark:text-[#E8E8E8] flex items-center gap-2 ${
                  theme.palette === p ? 'font-medium' : ''
                }`}
              >
                <div
                  className="w-3 h-3 rounded-sm border border-white/20"
                  style={{ backgroundColor: DEFAULT_THEMES[p].accentColor }}
                />
                <span className="capitalize">{p.replace('-', ' ')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onTogglePublic}
        className={`px-2.5 py-1 text-xs border rounded transition-colors ${
          isPublic
            ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10 text-ink dark:text-white'
            : 'border-edge dark:border-[#2A2A2A] text-ink dark:text-[#E8E8E8] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A]'
        }`}
        title={isPublic ? 'Public — anyone with link can view' : 'Private'}
      >
        {isPublic ? 'Public' : 'Private'}
      </button>

      <button
        type="button"
        onClick={onExportPDF}
        className="px-2.5 py-1 text-xs border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] flex items-center gap-1"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        PDF
      </button>

      <button
        type="button"
        onClick={() => navigate(`/decks/${deckId}/preview`)}
        className="px-3 py-1.5 text-xs bg-brand-orange hover:bg-brand-orange-hover text-white rounded-full font-semibold flex items-center gap-1 shadow-[0_2px_8px_rgba(251,119,1,0.4)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Present
      </button>
    </div>
  );
}
