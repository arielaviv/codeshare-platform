/**
 * ArtifactPanel — the shared right-side panel shell every product module
 * mounts inside. Provides the consistent chrome (tab strip, close X,
 * fixed-width container, transition-in animation) so adding a new
 * module is just filling the body, not rewriting the frame.
 *
 * Corollary frontend rule to the shared-toolbox backend rule:
 *   Module uniqueness lives in the body (the `children`), not in the
 *   chrome. Every future module — Book Studio, future Music Studio,
 *   future Mobile App module — mounts inside this same shell.
 */
import type { ReactNode } from 'react';

export interface ArtifactPanelTab {
  id: string;
  label: string;
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Whether this tab is currently visible in the strip. */
  visible: boolean;
  /** Show a live-streaming dot next to the label (e.g. sheet streaming). */
  pulse?: boolean;
  /** Tooltip shown on hover. */
  title?: string;
}

interface Props {
  /** Tabs to render in the header strip, left-to-right. */
  tabs: ArtifactPanelTab[];
  /** Currently active tab id. */
  activeTab: string;
  /** Called when the user clicks a tab button. */
  onTabChange: (tabId: string) => void;
  /** Called when the user clicks the close X in the top-right. */
  onClose: () => void;
  /**
   * Slot for non-tab header buttons — e.g. the "Mr8's Computer" modal trigger,
   * which isn't a tab (doesn't swap the body) but shares the header row.
   * Rendered between the tabs and the close X (with `ml-auto` pushing the X to the far right).
   */
  extraHeaderButtons?: ReactNode;
  /** The module body. Child panel component picks which rightTab to render. */
  children: ReactNode;
}

export default function ArtifactPanel({
  tabs,
  activeTab,
  onTabChange,
  onClose,
  extraHeaderButtons,
  children,
}: Props): JSX.Element {
  return (
    <div
      className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0A0A0A] animate-fade-slide-up"
      style={{ animationDuration: '300ms' }}
    >
      <div className="flex items-center gap-1 px-3 py-2 border-b border-edge dark:border-[#1A1A1A] flex-shrink-0">
        {tabs
          .filter((t) => t.visible)
          .map((t) => {
            const isActive = t.id === activeTab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                title={t.title}
                className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'text-brand-orange bg-surface-tertiary dark:bg-[#1A1A1A] font-semibold'
                    : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'
                }`}
              >
                {t.pulse && (
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
                )}
                {t.icon}
                {t.label}
              </button>
            );
          })}

        {extraHeaderButtons}

        <button
          type="button"
          onClick={onClose}
          className="ml-auto p-1 rounded text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
          title="Close panel"
          aria-label="Close artifact panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
