/**
 * Floating toolbar shown next to a selected element in Edit mode.
 * Actions are ephemeral: they postMessage into the iframe's edit
 * bridge, which mutates the live DOM. "Save" collects the patch
 * series and asks the agent to write it into source.
 */
import { Paintbrush, Copy, Trash2, X, Type, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';

export interface EditPatch {
  textContent?: string;
  style?: Record<string, string>;
  remove?: boolean;
  duplicate?: boolean;
}

interface Props {
  anchor: { x: number; y: number; w: number; h: number };
  tag: string;
  text: string;
  onPatch: (patch: EditPatch) => void;
  onSave: () => void;
  onClose: () => void;
  edited: boolean;
}

export function EditModeToolbar({ anchor, tag, text, onPatch, onSave, onClose, edited }: Props): JSX.Element {
  // Place below the element. Clamp to viewport.
  const left = Math.max(8, Math.min(window.innerWidth - 420, anchor.x));
  const top = Math.min(window.innerHeight - 60, anchor.y + anchor.h + 8);

  return (
    <div
      className="fixed z-[90] flex items-center gap-1 rounded-lg border border-edge bg-white text-ink px-2 py-1.5 shadow-lg dark:bg-[#141414] dark:border-[#2A2A2A] dark:text-[#E8E8E8]"
      style={{ left, top }}
    >
      <span className="px-2 text-[10px] font-mono text-ink-tertiary dark:text-[#666] uppercase">{tag}</span>

      <Tooltip content="Edit text" side="bottom">
        <button
          type="button"
          onClick={() => {
            const next = window.prompt('Edit text', text);
            if (next !== null) onPatch({ textContent: next });
          }}
          className="p-1.5 rounded hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
        >
          <Type size={14} />
        </button>
      </Tooltip>

      <Tooltip content="Fill color" side="bottom">
        <button
          type="button"
          onClick={() => {
            const color = window.prompt('Background color (hex or CSS)', '#111111');
            if (color) onPatch({ style: { backgroundColor: color } });
          }}
          className="p-1.5 rounded hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
        >
          <Paintbrush size={14} />
        </button>
      </Tooltip>

      <Tooltip content="Align left" side="bottom">
        <button
          type="button"
          onClick={() => onPatch({ style: { textAlign: 'left' } })}
          className="p-1.5 rounded hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
        >
          <AlignLeft size={14} />
        </button>
      </Tooltip>
      <Tooltip content="Align center" side="bottom">
        <button
          type="button"
          onClick={() => onPatch({ style: { textAlign: 'center' } })}
          className="p-1.5 rounded hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
        >
          <AlignCenter size={14} />
        </button>
      </Tooltip>
      <Tooltip content="Align right" side="bottom">
        <button
          type="button"
          onClick={() => onPatch({ style: { textAlign: 'right' } })}
          className="p-1.5 rounded hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
        >
          <AlignRight size={14} />
        </button>
      </Tooltip>

      <span className="w-px h-5 bg-edge dark:bg-[#2A2A2A] mx-1" />

      <Tooltip content="Duplicate" side="bottom">
        <button
          type="button"
          onClick={() => onPatch({ duplicate: true })}
          className="p-1.5 rounded hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
        >
          <Copy size={14} />
        </button>
      </Tooltip>
      <Tooltip content="Delete" side="bottom">
        <button
          type="button"
          onClick={() => onPatch({ remove: true })}
          className="p-1.5 rounded text-status-error hover:bg-status-error/10"
        >
          <Trash2 size={14} />
        </button>
      </Tooltip>

      <span className="w-px h-5 bg-edge dark:bg-[#2A2A2A] mx-1" />

      <button
        type="button"
        onClick={onSave}
        disabled={!edited}
        className="px-3 py-1 text-[12px] rounded bg-brand-orange text-white font-medium disabled:opacity-50"
      >
        Save changes
      </button>
      <Tooltip content="Close" side="bottom">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8]"
        >
          <X size={14} />
        </button>
      </Tooltip>
    </div>
  );
}
