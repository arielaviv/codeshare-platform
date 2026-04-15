import { useEffect } from 'react';

const DEFAULT_TITLE = 'Mr8';

/**
 * Sets `document.title` to `<title> · Mr8` (or just `Mr8` if title is falsy).
 * Restores previous title on unmount.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
