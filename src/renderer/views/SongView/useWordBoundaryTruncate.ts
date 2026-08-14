import { RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * CSS `text-overflow: ellipsis` clips at a pixel width with zero regard for
 * word boundaries, so a long title or "My Wave" reason routinely lands mid-
 * word ("...Alternating Singles ...", "...next les...") - it reads as
 * broken, not as an intentional ellipsis. This measures the element's own
 * rendered font against its real (current) width and backs off to the last
 * whole word that fits, re-measuring on resize.
 */

let measureCanvas: HTMLCanvasElement | undefined;

function measureTextWidth(text: string, font: string): number {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }

  const context = measureCanvas.getContext('2d');

  if (!context) {
    // No canvas 2D context (unusual outside a real renderer) - a rough
    // average-glyph-width estimate still keeps truncation in the right
    // ballpark rather than skipping it entirely.
    return text.length * 7;
  }

  context.font = font;

  return context.measureText(text).width;
}

export function fitTextToWidth(
  text: string,
  font: string,
  maxWidth: number,
  ellipsis = '…',
): string {
  if (maxWidth <= 0 || measureTextWidth(text, font) <= maxWidth) {
    return text;
  }

  const words = text.split(' ');
  let candidate = '';

  for (const word of words) {
    const next = candidate ? `${candidate} ${word}` : word;

    if (measureTextWidth(`${next}${ellipsis}`, font) > maxWidth) {
      break;
    }

    candidate = next;
  }

  if (candidate) {
    return `${candidate}${ellipsis}`;
  }

  // Not even one whole word fits (an extremely narrow container) - fall
  // back to a hard character clip so something legible still renders
  // instead of an empty label.
  let hard = text;

  while (
    hard.length > 1 &&
    measureTextWidth(`${hard}${ellipsis}`, font) > maxWidth
  ) {
    hard = hard.slice(0, -1);
  }

  return `${hard}${ellipsis}`;
}

/**
 * Returns the ref to attach and the text to render. When the element's real
 * width is not yet measurable (not mounted, or a test environment without
 * layout, e.g. jsdom) this returns the untouched `text` - the same content
 * CSS `text-overflow: ellipsis` would otherwise have shown in full.
 */
export function useWordBoundaryTruncate<T extends HTMLElement>(
  text: string,
): { ref: RefObject<T | null>; display: string } {
  const ref = useRef<T>(null);
  const [display, setDisplay] = useState(text);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      setDisplay(text);

      return undefined;
    }

    const recompute = () => {
      const width = element.clientWidth;

      if (width <= 0) {
        setDisplay(text);

        return;
      }

      const font = window.getComputedStyle(element).font;

      setDisplay(fitTextToWidth(text, font, width));
    };

    recompute();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(recompute);

    observer.observe(element);

    return () => observer.disconnect();
  }, [text]);

  return { ref, display };
}
