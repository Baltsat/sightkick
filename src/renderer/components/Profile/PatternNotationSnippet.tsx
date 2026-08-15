import { useLayoutEffect, useRef } from 'react';
import { ChartParser } from '../../../chart-parser/parser';
import { renderMusic } from '../../../chart-parser/renderer';
import { buildParsedChartFromDsl } from '../SheetMusic/helpers';
import type { PatternExemplar } from '../../services/pattern-model';
import { cn } from '../../cn';

export function PatternNotationSnippet({
  exemplar,
  label,
  size = 'card',
}: {
  exemplar: PatternExemplar;
  label: string;
  size?: 'rose' | 'card' | 'home';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scale = size === 'rose' ? 0.23 : size === 'home' ? 0.31 : 0.38;

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const styles = getComputedStyle(container);
    const note = styles.getPropertyValue('--ink-strong').trim() || '#17130f';
    const chart = buildParsedChartFromDsl(exemplar.dsl);
    const parser = new ChartParser(chart, false);

    renderMusic(
      container,
      parser,
      { note, stave: note },
      false,
      true,
      false,
      'flow',
    );

    return () => container.replaceChildren();
  }, [exemplar.dsl]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--surface-raised)_88%,transparent)]',
        size === 'rose'
          ? 'h-12 w-32'
          : size === 'home'
          ? 'h-16 w-48'
          : 'h-20 w-56',
      )}
      role="img"
      aria-label={`${label} notation`}
      data-testid="pattern-notation-snippet"
    >
      <div
        ref={containerRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `scale(${scale})`, width: 540, height: 190 }}
      />
    </div>
  );
}
