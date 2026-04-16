/**
 * Shared dark-pill tooltip with an arrow. Wraps a single child and
 * renders the label into document.body via createPortal so it
 * escapes overflow:hidden / stacking-context traps.
 *
 * Pattern:
 *   <Tooltip content="Hide chat panel" side="bottom">
 *     <button>…</button>
 *   </Tooltip>
 *
 * 150ms show delay, 0ms hide, hover + keyboard-focus triggered,
 * Esc dismisses.
 */
import { cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

interface TooltipProps {
  content: ReactNode;
  side?: Side;
  align?: Align;
  delay?: number;
  /** Explicit disable (e.g. when element is itself disabled). */
  disabled?: boolean;
  children: ReactElement;
}

const SHOW_DELAY_MS = 150;
const OFFSET_PX = 8;

interface Rect {
  left: number;
  top: number;
  side: Side;
  arrowOffset: number;
}

function computePosition(
  trigger: DOMRect,
  tooltip: DOMRect,
  side: Side,
  align: Align
): Rect {
  // Flip to the opposite side if there isn't room.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let resolved: Side = side;
  if (side === 'bottom' && trigger.bottom + tooltip.height + OFFSET_PX > vh) resolved = 'top';
  if (side === 'top' && trigger.top - tooltip.height - OFFSET_PX < 0) resolved = 'bottom';
  if (side === 'right' && trigger.right + tooltip.width + OFFSET_PX > vw) resolved = 'left';
  if (side === 'left' && trigger.left - tooltip.width - OFFSET_PX < 0) resolved = 'right';

  let left = 0;
  let top = 0;
  if (resolved === 'top' || resolved === 'bottom') {
    top = resolved === 'bottom' ? trigger.bottom + OFFSET_PX : trigger.top - tooltip.height - OFFSET_PX;
    if (align === 'start') left = trigger.left;
    else if (align === 'end') left = trigger.right - tooltip.width;
    else left = trigger.left + (trigger.width - tooltip.width) / 2;
    left = Math.max(8, Math.min(vw - tooltip.width - 8, left));
  } else {
    left = resolved === 'right' ? trigger.right + OFFSET_PX : trigger.left - tooltip.width - OFFSET_PX;
    if (align === 'start') top = trigger.top;
    else if (align === 'end') top = trigger.bottom - tooltip.height;
    else top = trigger.top + (trigger.height - tooltip.height) / 2;
    top = Math.max(8, Math.min(vh - tooltip.height - 8, top));
  }

  const arrowOffset =
    resolved === 'top' || resolved === 'bottom'
      ? trigger.left + trigger.width / 2 - left
      : trigger.top + trigger.height / 2 - top;

  return { left, top, side: resolved, arrowOffset };
}

export function Tooltip({
  content,
  side = 'bottom',
  align = 'center',
  delay = SHOW_DELAY_MS,
  disabled,
  children,
}: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    if (disabled) return;
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), delay);
  }, [disabled, delay, clearTimer]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current?.getBoundingClientRect();
    const tt = tooltipRef.current?.getBoundingClientRect();
    if (!t || !tt) return;
    setRect(computePosition(t, tt, side, align));
  }, [open, side, align, content]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  if (!isValidElement(children)) return <>{children}</>;

  const original = children as ReactElement<Record<string, unknown>>;
  const originalProps: Record<string, unknown> = original.props ?? {};

  const trigger = cloneElement(original, {
    ref: (node: HTMLElement) => {
      triggerRef.current = node;
      const prevRef = (original as unknown as { ref?: unknown }).ref;
      if (typeof prevRef === 'function') (prevRef as (n: HTMLElement) => void)(node);
      else if (prevRef && typeof prevRef === 'object' && 'current' in prevRef) {
        (prevRef as { current: HTMLElement | null }).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      (originalProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (originalProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      (originalProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      (originalProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="pointer-events-none fixed z-[100] select-none rounded-md bg-black/90 px-2 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm dark:bg-[#1A1A1A] dark:text-[#F0F0F0] dark:ring-1 dark:ring-[#2A2A2A]"
            style={{
              left: rect?.left ?? -9999,
              top: rect?.top ?? -9999,
              visibility: rect ? 'visible' : 'hidden',
              transition: 'opacity 80ms ease-out',
              opacity: rect ? 1 : 0,
            }}
          >
            {content}
            {rect && <TooltipArrow side={rect.side} offset={rect.arrowOffset} />}
          </div>,
          document.body
        )}
    </>
  );
}

function TooltipArrow({ side, offset }: { side: Side; offset: number }): JSX.Element {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
  };
  if (side === 'bottom') {
    return (
      <span
        aria-hidden
        style={{
          ...baseStyle,
          top: -4,
          left: Math.max(8, Math.min(offset - 4, 9999)),
          borderWidth: '0 4px 4px 4px',
          borderColor: 'transparent transparent rgba(0,0,0,0.9) transparent',
        }}
      />
    );
  }
  if (side === 'top') {
    return (
      <span
        aria-hidden
        style={{
          ...baseStyle,
          bottom: -4,
          left: Math.max(8, Math.min(offset - 4, 9999)),
          borderWidth: '4px 4px 0 4px',
          borderColor: 'rgba(0,0,0,0.9) transparent transparent transparent',
        }}
      />
    );
  }
  if (side === 'left') {
    return (
      <span
        aria-hidden
        style={{
          ...baseStyle,
          right: -4,
          top: Math.max(8, Math.min(offset - 4, 9999)),
          borderWidth: '4px 0 4px 4px',
          borderColor: 'transparent transparent transparent rgba(0,0,0,0.9)',
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        ...baseStyle,
        left: -4,
        top: Math.max(8, Math.min(offset - 4, 9999)),
        borderWidth: '4px 4px 4px 0',
        borderColor: 'transparent rgba(0,0,0,0.9) transparent transparent',
      }}
    />
  );
}
