import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { decksAPI } from '../services/api';
import type {
  Deck,
  Slide,
  SlideTheme,
  EditorElement,
} from '../types/deck';
import { resolveTheme, SLIDE_WIDTH, SLIDE_HEIGHT } from '../components/decks/themes';
import { deriveElements, newBlankSlide, newElement, duplicateElement } from '../components/decks/defaultLayouts';
import EditorToolbar from '../components/decks/EditorToolbar';
import SlideThumbnailStrip from '../components/decks/SlideThumbnailStrip';
import SlideCanvas from '../components/decks/SlideCanvas';
import PropertiesPanel from '../components/decks/PropertiesPanel';
import { exportDeckToPDF } from '../services/deckExport';

const AUTOSAVE_DELAY_MS = 1000;
const MAX_HISTORY = 50;

function hydrateSlide(slide: Slide, theme: SlideTheme): Slide {
  if (slide.elements && slide.elements.length > 0) return slide;
  return { ...slide, elements: deriveElements(slide, theme) };
}

function hydrateDeck(deck: Deck): Deck {
  return {
    ...deck,
    slides: deck.slides.map((s) => hydrateSlide(s, deck.theme)),
  };
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function DeckEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [history, setHistory] = useState<Deck[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoad = useRef(true);

  // Initial fetch
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    decksAPI
      .get(id)
      .then(({ deck }) => {
        if (cancelled) return;
        const hydrated = hydrateDeck(deck);
        setDeck(hydrated);
        setHistory([hydrated]);
        setHistoryIdx(0);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load deck');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Debounced autosave on any deck change (except initial load)
  useEffect(() => {
    if (!deck || !id) return;
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await decksAPI.update(id, {
          title: deck.title,
          description: deck.description,
          theme: deck.theme,
          slides: deck.slides,
          isPublic: deck.isPublic,
        });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [deck, id]);

  const pushHistory = useCallback(
    (next: Deck) => {
      setHistory((prev) => {
        const base = prev.slice(0, historyIdx + 1);
        const trimmed = [...base, next].slice(-MAX_HISTORY);
        return trimmed;
      });
      setHistoryIdx((i) => Math.min(i + 1, MAX_HISTORY - 1));
    },
    [historyIdx]
  );

  const commit = useCallback(
    (next: Deck) => {
      setDeck(next);
      pushHistory(next);
    },
    [pushHistory]
  );

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    setHistoryIdx(historyIdx - 1);
    setDeck(prev);
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    setHistoryIdx(historyIdx + 1);
    setDeck(next);
  }, [history, historyIdx]);

  // Undo/redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const currentSlide = useMemo(
    () => (deck && deck.slides[currentSlideIdx]) || null,
    [deck, currentSlideIdx]
  );

  const selectedElement = useMemo<EditorElement | null>(() => {
    if (!currentSlide || !selectedId) return null;
    return currentSlide.elements?.find((el) => el.id === selectedId) || null;
  }, [currentSlide, selectedId]);

  const updateCurrentSlide = useCallback(
    (updater: (slide: Slide) => Slide) => {
      if (!deck) return;
      const slides = deck.slides.map((s, i) => (i === currentSlideIdx ? updater(s) : s));
      commit({ ...deck, slides });
    },
    [deck, currentSlideIdx, commit]
  );

  const updateElements = useCallback(
    (updater: (els: EditorElement[]) => EditorElement[]) => {
      updateCurrentSlide((slide) => ({
        ...slide,
        elements: updater(slide.elements || []),
      }));
    },
    [updateCurrentSlide]
  );

  const updateSelectedElement = useCallback(
    (patch: Partial<EditorElement>) => {
      if (!selectedId) return;
      updateElements((els) =>
        els.map((el) => (el.id === selectedId ? ({ ...el, ...patch } as EditorElement) : el))
      );
    },
    [selectedId, updateElements]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    updateElements((els) => els.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, updateElements]);

  const duplicateSelected = useCallback(() => {
    if (!selectedElement) return;
    const dup = duplicateElement(selectedElement);
    updateElements((els) => [...els, dup]);
    setSelectedId(dup.id);
  }, [selectedElement, updateElements]);

  const addElement = useCallback(
    (type: EditorElement['type']) => {
      if (!deck) return;
      const el = newElement(type, deck.theme);
      updateElements((els) => [...els, el]);
      setSelectedId(el.id);
    },
    [deck, updateElements]
  );

  const addSlide = useCallback(() => {
    if (!deck) return;
    const slide = newBlankSlide(deck.theme);
    commit({ ...deck, slides: [...deck.slides, slide] });
    setCurrentSlideIdx(deck.slides.length);
    setSelectedId(null);
  }, [deck, commit]);

  const moveSlide = useCallback(
    (from: number, to: number) => {
      if (!deck) return;
      if (to < 0 || to >= deck.slides.length) return;
      const slides = [...deck.slides];
      const [moved] = slides.splice(from, 1);
      slides.splice(to, 0, moved);
      commit({ ...deck, slides });
      setCurrentSlideIdx(to);
    },
    [deck, commit]
  );

  const deleteSlide = useCallback(
    (idx: number) => {
      if (!deck || deck.slides.length <= 1) return;
      const slides = deck.slides.filter((_, i) => i !== idx);
      commit({ ...deck, slides });
      setCurrentSlideIdx((prev) => Math.min(prev, slides.length - 1));
      setSelectedId(null);
    },
    [deck, commit]
  );

  const changeTheme = useCallback(
    (theme: SlideTheme) => {
      if (!deck) return;
      const colors = resolveTheme(theme);
      // Re-color text elements that use palette text colors
      const oldColors = resolveTheme(deck.theme);
      const slides = deck.slides.map((s) => ({
        ...s,
        elements: (s.elements || []).map((el) => {
          if (el.type === 'text' && el.color === oldColors.text) {
            return { ...el, color: colors.text };
          }
          if (el.type === 'text' && el.color === oldColors.textMuted) {
            return { ...el, color: colors.textMuted };
          }
          if (el.type === 'shape' && el.fill === deck.theme.accentColor) {
            return { ...el, fill: theme.accentColor };
          }
          if (el.type === 'chart' && el.accentColor === deck.theme.accentColor) {
            return { ...el, accentColor: theme.accentColor };
          }
          return el;
        }),
      }));
      commit({ ...deck, theme, slides });
    },
    [deck, commit]
  );

  const setTitle = useCallback(
    (title: string) => {
      if (!deck) return;
      setDeck({ ...deck, title });
      // Title edits don't push history — debounced autosave only
    },
    [deck]
  );

  const togglePublic = useCallback(() => {
    if (!deck) return;
    commit({ ...deck, isPublic: !deck.isPublic });
  }, [deck, commit]);

  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = useCallback(async () => {
    if (!deck) return;
    setIsExporting(true);
    // Wait for hidden export slides to render + charts to measure
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 400));
    try {
      await exportDeckToPDF(deck);
    } finally {
      setIsExporting(false);
    }
  }, [deck]);

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <div className="text-sm text-status-error mb-4">{loadError}</div>
        <button
          type="button"
          onClick={() => navigate('/decks')}
          className="text-sm text-accent dark:text-white underline"
        >
          Back to decks
        </button>
      </div>
    );
  }

  if (!deck || !currentSlide) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="skeleton w-8 h-8 rounded-full" />
      </div>
    );
  }

  // Canvas container derives the visible width based on available space
  const aspectRatio = SLIDE_WIDTH / SLIDE_HEIGHT;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0A0A0A]">
      <EditorToolbar
        deckId={deck._id}
        title={deck.title}
        theme={deck.theme}
        saveStatus={saveStatus}
        onTitleChange={setTitle}
        onThemeChange={changeTheme}
        onAddElement={addElement}
        onExportPDF={handleExportPDF}
        isPublic={deck.isPublic}
        onTogglePublic={togglePublic}
      />
      <div className="flex-1 flex overflow-hidden">
        <SlideThumbnailStrip
          slides={deck.slides}
          theme={deck.theme}
          activeIndex={currentSlideIdx}
          onSelect={(i) => {
            setCurrentSlideIdx(i);
            setSelectedId(null);
            setEditingTextId(null);
          }}
          onAdd={addSlide}
          onMoveUp={(i) => moveSlide(i, i - 1)}
          onMoveDown={(i) => moveSlide(i, i + 1)}
          onDelete={deleteSlide}
        />
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-surface-secondary dark:bg-[#0A0A0A]">
          <div
            className="w-full max-w-5xl"
            style={{ aspectRatio: `${aspectRatio}` }}
          >
            <SlideCanvas
              slide={currentSlide}
              theme={deck.theme}
              selectedId={selectedId}
              editingTextId={editingTextId}
              onSelect={(id) => {
                setSelectedId(id);
                if (id === null) setEditingTextId(null);
              }}
              onEnterEditText={setEditingTextId}
              onExitEditText={() => setEditingTextId(null)}
              onChange={updateElements}
              onDeleteSelected={deleteSelected}
              onDuplicateSelected={duplicateSelected}
            />
          </div>
        </div>
        <PropertiesPanel
          element={selectedElement}
          onChange={updateSelectedElement}
          onDelete={deleteSelected}
        />
      </div>

      {isExporting && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: -20000,
            top: 0,
            pointerEvents: 'none',
          }}
        >
          {deck.slides.map((s, i) => (
            <div
              id={`export-slide-${i}`}
              key={`export-${s.id}`}
              style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}
            >
              <SlideCanvas
                slide={s}
                theme={deck.theme}
                selectedId={null}
                editingTextId={null}
                interactive={false}
                onSelect={() => {}}
                onEnterEditText={() => {}}
                onExitEditText={() => {}}
                onChange={() => {}}
                onDeleteSelected={() => {}}
                onDuplicateSelected={() => {}}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
