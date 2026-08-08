import { useEffect, useRef } from 'react';
import { ChartParser } from '../../../chart-parser/parser';
import { renderMusic } from '../../../chart-parser/renderer';
import { Measure } from '../../../chart-parser/types';
import { KEY_TO_ELEMENT } from '../../services/engine/constants';
import { StoredHitRecord } from '../../services/practice-stats';

interface Props {
  measures: Measure[];
  barStart: number;
  barEnd: number;
  records: StoredHitRecord[];
}

export function MiniNotation({ measures, barStart, barEnd, records }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const selected = measures.slice(
      barStart - 1,
      Math.min(barEnd, barStart + 1),
    );

    if (selected.length === 0) {
      container.replaceChildren();

      return;
    }

    const rendered = renderMusic(
      container,
      { measures: selected } as ChartParser,
      { note: '#1b1b1b', stave: '#1b1b1b' },
      false,
      false,
      false,
    );
    const misses = new Set(
      records
        .filter((record) => record.verdict === 'miss')
        .map((record) => `${record.tick}:${record.element}`),
    );

    rendered.forEach(({ renderedNotes }) => {
      renderedNotes.forEach(({ tick, note }) => {
        note.getKeys().forEach((key, index) => {
          const element = KEY_TO_ELEMENT[key];

          if (element && misses.has(`${tick}:${element}`)) {
            note.noteHeads[index]
              ?.getSVGElement()
              ?.classList.add('vf-note-missed');
          }
        });
      });
    });
    container.querySelectorAll<SVGSVGElement>('svg').forEach((svg) => {
      const width = Number(svg.getAttribute('width')) || 1200;
      const height = Number(svg.getAttribute('height')) || 180;

      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '108');
      svg.style.display = 'block';
    });
    container.querySelectorAll<HTMLElement>(':scope > div').forEach((row) => {
      row.style.width = '100%';
      row.style.height = '108px';
    });
  }, [barEnd, barStart, measures, records]);

  return (
    <div
      className="overflow-hidden rounded-lg border border-border-soft bg-paper px-2"
      data-testid="coach-notation"
      aria-label={`Notation for bars ${barStart} to ${barEnd}`}
    >
      <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink/70">
        {barStart === barEnd ? `Bar ${barStart}` : `Bars ${barStart}–${barEnd}`}
      </div>
      <div ref={containerRef} />
    </div>
  );
}
