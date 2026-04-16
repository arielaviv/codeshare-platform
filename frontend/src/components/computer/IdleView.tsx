/**
 * Tiny "booted but idle" view shown in the Computer modal when a
 * sandbox has been spawned but no tool has run yet. Manus-parity
 * placeholder — so the modal never feels empty at turn 1.
 */
import type { TimelineEntry } from './types';

interface Props {
  entry: TimelineEntry;
}

export function IdleView({ entry }: Props): JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-[#0A0A0A]">
      <div className="w-14 h-14 rounded-full bg-brand-green-soft dark:bg-brand-green/20 flex items-center justify-center">
        <span className="w-3 h-3 rounded-full bg-brand-green animate-pulse" />
      </div>
      <div className="text-center space-y-1">
        <div className="text-base font-semibold text-ink dark:text-[#E8E8E8]">
          {entry.description ?? "Mr8's Computer is ready"}
        </div>
        <div className="text-sm text-ink-secondary dark:text-[#A0A0A0] max-w-md">
          Waiting for the next task. Once Mr8 browses, runs Python, or
          verifies a build, the activity will stream in here.
        </div>
      </div>
      {entry.mediaModel && (
        <div className="text-[10px] font-mono text-ink-tertiary dark:text-[#666]">
          sandbox {entry.mediaModel.slice(0, 12)}…
        </div>
      )}
    </div>
  );
}
