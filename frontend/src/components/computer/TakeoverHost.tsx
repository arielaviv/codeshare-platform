import { useState } from 'react';
import { useComputer } from '../../contexts/ComputerContext';
import { TakeoverDialog, type TakeoverSubmitPayload } from './TakeoverDialog';
import { TakeoverOverlay } from './TakeoverOverlay';

export interface TakeoverEventPayload extends TakeoverSubmitPayload {
  currentUrl?: string;
  currentTitle?: string;
}

interface TakeoverHostProps {
  onSubmit?: (payload: TakeoverEventPayload) => void;
}

export function TakeoverHost({ onSubmit }: TakeoverHostProps): JSX.Element | null {
  const { state, setMode, activeEntry } = useComputer();
  const [showDialog, setShowDialog] = useState(false);

  const streamUrl = activeEntry?.streamUrl;

  if (state.panel.mode !== 'takeover' || !streamUrl) return null;

  if (showDialog) {
    return (
      <TakeoverDialog
        currentUrl={activeEntry?.browserUrl}
        currentTitle={activeEntry?.browserTitle}
        onCancel={() => {
          setShowDialog(false);
          setMode('expanded');
        }}
        onSubmit={(payload) => {
          setShowDialog(false);
          setMode('expanded');
          onSubmit?.({
            ...payload,
            currentUrl: activeEntry?.browserUrl,
            currentTitle: activeEntry?.browserTitle,
          });
        }}
      />
    );
  }

  return (
    <TakeoverOverlay
      streamUrl={streamUrl}
      onExit={() => setShowDialog(true)}
    />
  );
}
