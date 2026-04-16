/**
 * Mr8LogoLoader — the branded "Mr8 is working" loading signature.
 *
 * Used anywhere across the product where Mr8 is generating / thinking /
 * bootstrapping an artifact. Single, recognizable loading visual so the
 * product feels coherent across modules (audio / video / apps / decks /
 * research / book).
 *
 * Cell-level loaders (e.g. 6 individual cover cells shimmering in the
 * CoverPickerCard) stay bespoke — they're per-cell, not "Mr8 is working".
 */
import mr8Logo from '../../assets/mr8-logo.png';

export type Mr8LogoLoaderSize = 'sm' | 'md' | 'lg';

interface Props {
  /** Optional text shown under the pulsing logo. e.g. "Drafting your book…" */
  caption?: string;
  /** 'sm' for inline use (chat chips, 20px). 'md' default (48px). 'lg' for full panel empty-states (96px). */
  size?: Mr8LogoLoaderSize;
  /** Extra Tailwind classes on the outer container. */
  className?: string;
}

const SIZE_PX: Record<Mr8LogoLoaderSize, number> = {
  sm: 20,
  md: 48,
  lg: 96,
};

const CAPTION_CLASS: Record<Mr8LogoLoaderSize, string> = {
  sm: 'text-[11px] mt-1.5',
  md: 'text-xs mt-3',
  lg: 'text-sm mt-4',
};

export default function Mr8LogoLoader({
  caption,
  size = 'md',
  className = '',
}: Props): JSX.Element {
  const px = SIZE_PX[size];

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <img
        src={mr8Logo}
        alt="Mr8"
        width={px}
        height={px}
        className="mr8-logo-pulse"
        style={{ width: px, height: px, display: 'block' }}
      />
      {caption && (
        <div className={`${CAPTION_CLASS[size]} text-ink-tertiary dark:text-[#888] text-center max-w-[260px]`}>
          {caption}
        </div>
      )}
    </div>
  );
}
