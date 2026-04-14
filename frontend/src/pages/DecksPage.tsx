import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { decksAPI } from '../services/api';
import type { DeckSummary } from '../types/deck';
import type { PrizeAward } from '../types';
import { useAuth } from '../contexts/AuthContext';
import GenerateDeckModal from '../components/decks/GenerateDeckModal';
import PrizeModal from '../components/PrizeModal';

function firePrizeConfetti() {
  const colors = ['#FB7701', '#FFB800', '#FFFFFF', '#FF9A3C', '#0B8800'];
  confetti({
    particleCount: 200,
    spread: 110,
    startVelocity: 55,
    origin: { y: 0.55 },
    colors,
    scalar: 1.2,
  });
  setTimeout(() => {
    confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0.1, y: 0.6 }, colors });
    confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 0.9, y: 0.6 }, colors });
  }, 200);
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function paletteSwatches(palette: string): string[] {
  switch (palette) {
    case 'dark':
      return ['#0A0A0A', '#171717', '#E5E5E5'];
    case 'light':
      return ['#FFFFFF', '#F5F5F5', '#2563EB'];
    case 'gartner-blue':
      return ['#002060', '#1E3A8A', '#FFFFFF'];
    case 'gartner-warm':
      return ['#FDF6E3', '#B8956A', '#8B4513'];
    default:
      return ['#FFFFFF', '#F5F5F5', '#171717'];
  }
}

function DeckCard({
  deck,
  onDelete,
  onOpen,
}: {
  deck: DeckSummary;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const swatches = paletteSwatches(deck.theme.palette);

  return (
    <div className="group relative bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg overflow-hidden hover:border-accent/50 dark:hover:border-white/30 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left"
      >
        <div
          className="aspect-[16/9] flex items-center justify-center p-4 border-b border-edge dark:border-[#2A2A2A]"
          style={{
            background: `linear-gradient(135deg, ${swatches[0]}, ${swatches[1]})`,
          }}
        >
          <div className="text-center space-y-2 px-4">
            <div
              className="text-sm font-semibold truncate"
              style={{ color: swatches[2] }}
            >
              {deck.title}
            </div>
            <div className="flex items-center justify-center gap-1">
              {swatches.map((c, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full border border-white/20"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="p-3">
          <div className="text-sm font-medium text-ink dark:text-[#E8E8E8] truncate">
            {deck.title}
          </div>
          <div className="text-[11px] text-ink-tertiary dark:text-[#666] mt-1 flex items-center gap-2">
            <span>{formatRelativeTime(deck.updatedAt)}</span>
            {deck.isPublic && (
              <span className="px-1.5 py-0.5 bg-surface-tertiary dark:bg-[#1A1A1A] rounded-full text-[9px] uppercase tracking-wider">
                public
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="p-1 bg-white/90 dark:bg-black/60 backdrop-blur rounded text-ink dark:text-white"
          aria-label="Deck options"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-[#1A1A1A] border border-edge dark:border-[#2A2A2A] rounded shadow-lg py-1 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-status-error hover:bg-surface-tertiary dark:hover:bg-[#222]"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DecksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [prize, setPrize] = useState<PrizeAward | null>(null);
  const [pendingNavigate, setPendingNavigate] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['decks'],
    queryFn: () => decksAPI.list(1, 50),
  });

  const createBlank = useMutation({
    mutationFn: () => decksAPI.create({ title: 'Untitled deck' }),
    onSuccess: ({ deck, prize: awarded }) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      if (awarded) {
        firePrizeConfetti();
        setPrize(awarded);
        setPendingNavigate(`/decks/${deck._id}`);
        refreshUser();
      } else {
        navigate(`/decks/${deck._id}`);
      }
    },
  });

  const handlePrizeClose = () => {
    setPrize(null);
    if (pendingNavigate) {
      const target = pendingNavigate;
      setPendingNavigate(null);
      navigate(target);
    }
  };

  const deleteDeck = useMutation({
    mutationFn: (id: string) => decksAPI.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  const decks = data?.decks || [];

  return (
    <div className="max-w-6xl px-6 py-6 subtle-scrollbar">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink dark:text-[#E8E8E8]">AI Decks</h1>
          <p className="text-sm text-ink-tertiary dark:text-[#666] mt-1">
            Generate Gartner-style slide decks with AI, then edit freely.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => createBlank.mutate()}
            disabled={createBlank.isPending}
            className="px-3 py-1.5 text-sm border border-edge dark:border-[#2A2A2A] text-ink dark:text-[#E8E8E8] rounded hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors disabled:opacity-50"
          >
            Blank deck
          </button>
          <button
            type="button"
            onClick={() => setShowGenerateModal(true)}
            className="px-4 py-2 text-sm bg-brand-orange hover:bg-brand-orange-hover text-white rounded-full font-semibold transition-colors flex items-center gap-1.5 shadow-[0_4px_14px_rgba(251,119,1,0.35)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L15 9L22 10L17 15L18 22L12 19L6 22L7 15L2 10L9 9L12 2z" />
            </svg>
            Generate with AI
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-[16/9] bg-surface-tertiary dark:bg-[#141414] rounded-lg skeleton"
            />
          ))}
        </div>
      ) : decks.length === 0 ? (
        <div className="border border-dashed border-edge dark:border-[#2A2A2A] rounded-lg py-16 text-center">
          <div className="text-3xl mb-3">✨</div>
          <div className="text-sm text-ink-secondary dark:text-[#A0A0A0] mb-4">
            No decks yet. Describe a topic and let AI draft the first version.
          </div>
          <button
            type="button"
            onClick={() => setShowGenerateModal(true)}
            className="px-5 py-2.5 text-sm bg-brand-orange hover:bg-brand-orange-hover text-white rounded-full font-semibold transition-colors shadow-[0_4px_14px_rgba(251,119,1,0.35)]"
          >
            Generate my first deck
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <DeckCard
              key={deck._id}
              deck={deck}
              onOpen={() => navigate(`/decks/${deck._id}`)}
              onDelete={() => {
                if (confirm(`Delete "${deck.title}"? This cannot be undone.`)) {
                  deleteDeck.mutate(deck._id);
                }
              }}
            />
          ))}
        </div>
      )}

      {showGenerateModal && (
        <GenerateDeckModal
          onClose={() => setShowGenerateModal(false)}
          onComplete={(deckId) => {
            setShowGenerateModal(false);
            queryClient.invalidateQueries({ queryKey: ['decks'] });
            navigate(`/decks/${deckId}`);
          }}
          onPrizeAwarded={(award) => {
            firePrizeConfetti();
            setPrize(award);
            refreshUser();
          }}
        />
      )}

      {prize && <PrizeModal prize={prize} onClose={handlePrizeClose} />}
    </div>
  );
}
