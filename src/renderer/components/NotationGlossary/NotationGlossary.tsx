import { useCallback, useEffect, useRef, useState } from 'react';
import './NotationGlossary.css';

export const NOTATION_GLOSSARY_DELAY_MS = 500;

export const NOTATION_KINDS = [
  'dot',
  'triple-beam',
  'beam',
  'accent',
  'rest',
  'sticking',
  'colored-head',
  'tuplet',
  'grace',
  'ghost',
] as const;

export type NotationKind = (typeof NOTATION_KINDS)[number];

export interface NotationGlossaryIntent {
  kind: NotationKind;
  x: number;
  y: number;
}

const notationCopy: Record<NotationKind, { title: string; detail: string }> = {
  dot: {
    title: 'Dot',
    detail:
      'Adds half of the note’s written value. A dotted quarter lasts one and a half beats in 4/4.',
  },
  'triple-beam': {
    title: 'Triple beam',
    detail:
      'Three joined flags mean 32nd notes: very short notes that fit eight to one beat in 4/4.',
  },
  beam: {
    title: 'Beam',
    detail:
      'The bar joining note stems groups their rhythm. More bars mean shorter notes.',
  },
  accent: {
    title: 'Accent',
    detail:
      'Lean into this hit. Make it clearly stronger than the notes around it without rushing.',
  },
  rest: {
    title: 'Rest',
    detail:
      'Leave this space empty. Keeping the silence in time is part of the groove.',
  },
  sticking: {
    title: 'Sticking',
    detail:
      'R and L mark the hand to use. They are a coordination hint, not an extra sound.',
  },
  'colored-head': {
    title: 'Colored note head',
    detail:
      'Color names the drum or cymbal lane. Match it to the colored kit cue, then hit that voice.',
  },
  tuplet: {
    title: 'Tuplet',
    detail:
      'The number changes the usual subdivision. A 3 means three evenly spaced hits in the room normally used by two.',
  },
  grace: {
    title: 'Grace note',
    detail:
      'A tiny lead-in into the main hit. Keep it close enough to feel like one gesture.',
  },
  ghost: {
    title: 'Ghost note',
    detail:
      'Play this soft and low in the mix. It gives the groove motion without becoming the backbeat.',
  },
};
const pluralPriority: NotationKind[] = [
  'dot',
  'triple-beam',
  'beam',
  'tuplet',
  'grace',
  'ghost',
  'rest',
  'colored-head',
];

function isNotationKind(
  value: string | null | undefined,
): value is NotationKind {
  return (
    value !== null &&
    value !== undefined &&
    (NOTATION_KINDS as readonly string[]).includes(value)
  );
}

export function notationKindForTarget(
  target: EventTarget | null,
): NotationKind | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const exact = target
    .closest('[data-notation-kind]')
    ?.getAttribute('data-notation-kind');

  if (isNotationKind(exact)) {
    return exact;
  }

  const kinds = target
    .closest('[data-notation-kinds]')
    ?.getAttribute('data-notation-kinds')
    ?.split(' ');

  return pluralPriority.find((kind) => kinds?.includes(kind));
}

export function useNotationGlossaryIntent(
  delayMs: number = NOTATION_GLOSSARY_DELAY_MS,
) {
  const [intent, setIntent] = useState<NotationGlossaryIntent>();
  const timerRef = useRef<number | undefined>(undefined);
  const pendingRef = useRef<NotationGlossaryIntent | undefined>(undefined);
  const clear = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    pendingRef.current = undefined;
    setIntent(undefined);
  }, []);
  const observe = useCallback(
    (target: EventTarget | null, x: number, y: number) => {
      const kind = notationKindForTarget(target);

      if (!kind) {
        clear();

        return;
      }

      if (intent?.kind === kind || pendingRef.current?.kind === kind) {
        return;
      }

      clear();

      const next = { kind, x, y };

      pendingRef.current = next;
      timerRef.current = window.setTimeout(() => {
        pendingRef.current = undefined;
        timerRef.current = undefined;
        setIntent(next);
      }, delayMs);
    },
    [clear, delayMs, intent?.kind],
  );

  useEffect(() => clear, [clear]);

  return { intent, observe, dismiss: clear };
}

function NotationGlyph({ kind }: { kind: NotationKind }) {
  if (kind === 'accent') {
    return (
      <svg viewBox="0 0 96 64" aria-hidden="true">
        <path d="M25 48h35M51 48V16" />
        <ellipse cx="25" cy="48" rx="10" ry="7" transform="rotate(-20 25 48)" />
        <path d="M37 11l15 7-15 7" />
      </svg>
    );
  }

  if (kind === 'rest') {
    return (
      <svg viewBox="0 0 96 64" aria-hidden="true">
        <path d="M43 8v14l12 8-18 11 16 10-8 8" />
        <path d="M20 55h56" className="drumroll-notation-glyph__staff" />
      </svg>
    );
  }

  if (kind === 'sticking') {
    return (
      <svg viewBox="0 0 96 64" aria-hidden="true">
        <text x="14" y="39">
          R
        </text>
        <text x="54" y="39">
          L
        </text>
        <path
          d="M10 50h30M50 50h30"
          className="drumroll-notation-glyph__staff"
        />
      </svg>
    );
  }

  if (kind === 'tuplet') {
    return (
      <svg viewBox="0 0 96 64" aria-hidden="true">
        <path d="M18 45h48M34 45V18M58 45V18M34 18h24" />
        <text x="42" y="15">
          3
        </text>
        <ellipse cx="18" cy="45" rx="8" ry="6" transform="rotate(-20 18 45)" />
        <ellipse cx="42" cy="45" rx="8" ry="6" transform="rotate(-20 42 45)" />
        <ellipse cx="66" cy="45" rx="8" ry="6" transform="rotate(-20 66 45)" />
      </svg>
    );
  }

  if (kind === 'ghost') {
    return (
      <svg viewBox="0 0 96 64" aria-hidden="true">
        <path d="M19 48h32M51 48V18" />
        <ellipse cx="19" cy="48" rx="10" ry="7" transform="rotate(-20 19 48)" />
        <path
          d="M5 37c-8 8-8 18 0 25M33 37c8 8 8 18 0 25"
          className="drumroll-notation-glyph__soft"
        />
      </svg>
    );
  }

  const beams =
    kind === 'triple-beam' ? [16, 22, 28] : kind === 'beam' ? [18] : [];
  const dot = kind === 'dot';
  const colors = kind === 'colored-head';
  const grace = kind === 'grace';

  return (
    <svg viewBox="0 0 96 64" aria-hidden="true">
      {grace && (
        <>
          <path
            d="M16 42h18M34 42V24"
            className="drumroll-notation-glyph__soft"
          />
          <ellipse
            cx="16"
            cy="42"
            rx="6"
            ry="4"
            transform="rotate(-20 16 42)"
            className="drumroll-notation-glyph__soft"
          />
        </>
      )}
      <path d="M42 47h26M68 47V12" />
      <ellipse
        cx="42"
        cy="47"
        rx="10"
        ry="7"
        transform="rotate(-20 42 47)"
        className={colors ? 'drumroll-notation-glyph__lane' : undefined}
      />
      {beams.map((y) => (
        <path key={y} d={`M68 ${y}h20`} />
      ))}
      {dot && (
        <circle
          cx="60"
          cy="47"
          r="3.5"
          className="drumroll-notation-glyph__dot"
        />
      )}
      {colors && (
        <circle
          cx="75"
          cy="45"
          r="6"
          className="drumroll-notation-glyph__lane"
        />
      )}
    </svg>
  );
}

export function NotationGlossary({
  intent,
}: {
  intent: NotationGlossaryIntent | undefined;
}) {
  if (!intent) {
    return null;
  }

  const copy = notationCopy[intent.kind];

  return (
    <aside
      className="drumroll-notation-glossary"
      data-testid="notation-glossary"
      role="tooltip"
      style={{ left: intent.x + 18, top: intent.y + 18 }}
    >
      <NotationGlyph kind={intent.kind} />
      <div>
        <span className="drumroll-notation-glossary__eyebrow">
          notation guide
        </span>
        <strong>{copy.title}</strong>
        <p>{copy.detail}</p>
      </div>
    </aside>
  );
}
