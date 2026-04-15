/**
 * Open/close state for the full-screen Mr8's Computer modal overlay.
 * Anchor entry id tells the modal which TimelineEntry to focus on open.
 *
 * The modal is independent from the right-side artifact panel: opening
 * the modal does NOT change the artifact panel state, and vice versa.
 * Both read from ComputerContext so they stay in sync as data updates.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useComputer } from './ComputerContext';

interface ComputerModalContextValue {
  open: boolean;
  anchorEntryId: string | null;
  openModal: (entryId?: string) => void;
  closeModal: () => void;
}

const ComputerModalContext = createContext<ComputerModalContextValue | null>(null);

export function ComputerModalProvider({ children }: { children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [anchorEntryId, setAnchorEntryId] = useState<string | null>(null);
  const { state, setActive } = useComputer();

  const openModal = useCallback(
    (entryId?: string) => {
      if (entryId) {
        const idx = state.timeline.findIndex((e) => e.id === entryId);
        if (idx !== -1) {
          setActive(idx, { isLive: idx === state.timeline.length - 1 });
        }
        setAnchorEntryId(entryId);
      }
      setOpen(true);
    },
    [state.timeline, setActive]
  );

  const closeModal = useCallback(() => {
    setOpen(false);
    setAnchorEntryId(null);
  }, []);

  // Esc closes the modal (but not the artifact panel — that's handled
  // separately).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeModal]);

  const value = useMemo<ComputerModalContextValue>(
    () => ({ open, anchorEntryId, openModal, closeModal }),
    [open, anchorEntryId, openModal, closeModal]
  );

  return (
    <ComputerModalContext.Provider value={value}>
      {children}
    </ComputerModalContext.Provider>
  );
}

export function useComputerModal(): ComputerModalContextValue {
  const ctx = useContext(ComputerModalContext);
  if (!ctx) throw new Error('useComputerModal must be used inside ComputerModalProvider');
  return ctx;
}
