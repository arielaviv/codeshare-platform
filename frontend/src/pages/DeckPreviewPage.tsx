import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { decksAPI } from '../services/api';
import type { Deck, SlideTheme } from '../types/deck';
import SlideCanvas from '../components/decks/SlideCanvas';
import { deriveElements } from '../components/decks/defaultLayouts';

function hydrateDeck(deck: Deck): Deck {
  return {
    ...deck,
    slides: deck.slides.map((s) =>
      s.elements && s.elements.length > 0 ? s : { ...s, elements: deriveElements(s, deck.theme) }
    ),
  };
}

export default function DeckPreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ['deck', id],
    queryFn: () => decksAPI.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!data) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, data.deck.slides.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Escape') {
        navigate(`/decks/${id}`);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [data, id, navigate]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="skeleton w-8 h-8 rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-sm">Deck unavailable.</div>
      </div>
    );
  }

  const deck = hydrateDeck(data.deck);
  const theme: SlideTheme = deck.theme;
  const slide = deck.slides[index];
  if (!slide) return null;

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-8">
      <div className="w-full max-w-[min(100vw,calc(100vh*16/9))]" style={{ aspectRatio: '16/9' }}>
        <SlideCanvas
          slide={slide}
          theme={theme}
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
      <div className="fixed bottom-6 right-6 text-white/70 text-xs font-mono">
        {index + 1} / {deck.slides.length}
      </div>
      <button
        type="button"
        onClick={() => navigate(`/decks/${id}`)}
        className="fixed top-6 right-6 text-white/70 hover:text-white text-xs flex items-center gap-1"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        Exit (Esc)
      </button>
      {index > 0 && (
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          className="fixed left-6 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
          aria-label="Previous slide"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      {index < deck.slides.length - 1 && (
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(i + 1, deck.slides.length - 1))}
          className="fixed right-6 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
          aria-label="Next slide"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
