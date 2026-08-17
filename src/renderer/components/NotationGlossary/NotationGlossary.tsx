import {
  CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  KIT_ELEMENT_COLOR_VAR,
  KIT_ELEMENT_LABEL,
} from '../../services/pedagogy';
import type { KitElement } from '../../services/practice-stats';
import './NotationGlossary.css';

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

function isKitElement(value: string): value is KitElement {
  return value in KIT_ELEMENT_LABEL;
}

const KIT_ELEMENTS = Object.keys(KIT_ELEMENT_LABEL) as KitElement[];

type NotationKitKeyPosition =
  | 'low'
  | 'lower-middle'
  | 'middle'
  | 'upper-middle'
  | 'high';

interface NotationKitKeyItem {
  id: string;
  element: KitElement;
  glyph: '●' | '×';
  label: string;
  position: NotationKitKeyPosition;
}

const NOTATION_KIT_KEY: ReadonlyArray<NotationKitKeyItem> = [
  {
    id: 'hihat',
    element: 'hihat',
    glyph: '×',
    label: 'Hi-hat',
    position: 'high',
  },
  { id: 'ride', element: 'ride', glyph: '×', label: 'Ride', position: 'high' },
  {
    id: 'crash',
    element: 'crash',
    glyph: '×',
    label: 'Crash',
    position: 'high',
  },
  {
    id: 'snare',
    element: 'snare',
    glyph: '●',
    label: 'Snare',
    position: 'lower-middle',
  },
  {
    id: 'cross-stick',
    element: 'snare',
    glyph: '×',
    label: 'Cross-stick',
    position: 'lower-middle',
  },
  {
    id: 'tom1',
    element: 'tom1',
    glyph: '●',
    label: 'High tom',
    position: 'upper-middle',
  },
  {
    id: 'tom2',
    element: 'tom2',
    glyph: '●',
    label: 'Mid tom',
    position: 'middle',
  },
  {
    id: 'tom3',
    element: 'tom3',
    glyph: '●',
    label: 'Floor tom',
    position: 'lower-middle',
  },
  { id: 'kick', element: 'kick', glyph: '●', label: 'Kick', position: 'low' },
  {
    id: 'hihat-foot',
    element: 'hihat',
    glyph: '×',
    label: 'Hi-hat foot',
    position: 'low',
  },
];
const POSITION_MARK: Record<NotationKitKeyPosition, string> = {
  low: '↓',
  'lower-middle': '↙',
  middle: '↔',
  'upper-middle': '↗',
  high: '↑',
};
const STICKING_KEY = [
  { glyph: 'R', label: 'Right hand' },
  { glyph: 'L', label: 'Left hand' },
  { glyph: 'RF', label: 'Right foot' },
  { glyph: 'LF', label: 'Left foot' },
] as const;

export type NotationKitKeyPresentationPhase =
  | 'ready'
  | 'counting-in'
  | 'playing'
  | 'paused'
  | 'inactivity-paused'
  | 'recovery-explain'
  | 'result';

export function shouldShowNotationKitKey({
  manualVisible,
  interactionMode,
  presentationPhase,
}: {
  manualVisible: boolean;
  interactionMode: 'kit' | 'computer';
  presentationPhase: NotationKitKeyPresentationPhase;
}) {
  return (
    manualVisible ||
    interactionMode === 'computer' ||
    presentationPhase === 'paused' ||
    presentationPhase === 'inactivity-paused'
  );
}

export function NotationKitKey({ layout }: { layout: 'classic' | 'flow' }) {
  const [activeItem, setActiveItem] = useState<
    NotationKitKeyItem | (typeof STICKING_KEY)[number]
  >();
  const description = activeItem
    ? `${activeItem.glyph} means ${activeItem.label}.`
    : 'Hover or focus a mark to name it.';

  return (
    <aside
      id="notation-kit-key"
      className="drumroll-notation-key"
      data-testid="notation-kit-key"
      data-layout={layout}
      aria-label="Drum kit notation key"
    >
      <div className="drumroll-notation-key__heading">
        <strong>kit key</strong>
        <span>staff position · drum name</span>
      </div>
      <ul>
        {NOTATION_KIT_KEY.map((item) => (
          <li key={item.id} data-kit-element={item.id}>
            <button
              type="button"
              className="drumroll-notation-key__item"
              data-testid={`notation-kit-key-item-${item.id}`}
              aria-describedby="notation-kit-key-detail"
              aria-label={`${item.label}: ${
                item.glyph === '●' ? 'round head' : 'cross head'
              }, ${item.position} on the staff`}
              title={`${item.label}: ${item.position} on the staff`}
              style={
                {
                  '--notation-key-color': KIT_ELEMENT_COLOR_VAR[item.element],
                } as CSSProperties
              }
              onFocus={() => setActiveItem(item)}
              onBlur={() => setActiveItem(undefined)}
              onPointerEnter={() => setActiveItem(item)}
              onPointerLeave={() => setActiveItem(undefined)}
            >
              <span className="drumroll-notation-key__head" aria-hidden="true">
                {item.glyph}
              </span>
              <span>{item.label}</span>
              <span
                className="drumroll-notation-key__position"
                aria-hidden="true"
              >
                {POSITION_MARK[item.position]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div
        className="drumroll-notation-key__sticking"
        aria-label="Sticking key"
      >
        {STICKING_KEY.map((item) => (
          <button
            key={item.glyph}
            type="button"
            className="drumroll-notation-key__sticking-item"
            data-testid={`notation-sticking-key-${item.glyph}`}
            aria-describedby="notation-kit-key-detail"
            aria-label={`${item.glyph}: ${item.label}`}
            title={`${item.glyph}: ${item.label}`}
            onFocus={() => setActiveItem(item)}
            onBlur={() => setActiveItem(undefined)}
            onPointerEnter={() => setActiveItem(item)}
            onPointerLeave={() => setActiveItem(undefined)}
          >
            <strong aria-hidden="true">{item.glyph}</strong>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <output
        id="notation-kit-key-detail"
        className="drumroll-notation-key__detail"
      >
        {description}
      </output>
    </aside>
  );
}

export function notationElementForTarget(
  target: EventTarget | null,
): KitElement | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const raw = target
    .closest('[data-notation-element]')
    ?.getAttribute('data-notation-element');

  if (raw && isKitElement(raw)) {
    return raw;
  }

  return KIT_ELEMENTS.find((element) =>
    Boolean(target.closest(`.vf-note-${element}`)),
  );
}

export interface NotationAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface NotationGlossaryIntent {
  kind: NotationKind;
  x: number;
  y: number;
  element?: KitElement;
  anchor?: NotationAnchor;
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

function anchorForTarget(
  target: EventTarget | null,
): NotationAnchor | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const rect = target
    .closest('[data-notation-kind], [data-notation-kinds]')
    ?.getBoundingClientRect();

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }

  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
  };
}

export function useNotationGlossaryIntent() {
  const [intent, setIntent] = useState<NotationGlossaryIntent>();
  const dismiss = useCallback(() => setIntent(undefined), []);
  const summon = useCallback(
    (target: EventTarget | null, x: number, y: number) => {
      const kind = notationKindForTarget(target);

      if (!kind) {
        dismiss();

        return;
      }

      const element = notationElementForTarget(target);
      const anchor = anchorForTarget(target);

      setIntent({
        kind,
        x,
        y,
        ...(element ? { element } : {}),
        ...(anchor ? { anchor } : {}),
      });
    },
    [dismiss],
  );

  useEffect(() => {
    if (!intent) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismiss, intent]);

  return { intent, summon, dismiss };
}

export interface NotationGlossaryPlacement {
  left: number;
  top: number;
  side: 'right' | 'left' | 'bottom' | 'top';
}

interface GlossarySize {
  width: number;
  height: number;
}

interface GlossaryViewport {
  width: number;
  height: number;
}

const GLOSSARY_GUTTER = 16;
const GLOSSARY_GAP = 18;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function overlaps(left: NotationAnchor, right: NotationAnchor) {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

function anchorForIntent(intent: NotationGlossaryIntent): NotationAnchor {
  return (
    intent.anchor ?? {
      left: intent.x - 10,
      right: intent.x + 10,
      top: intent.y - 10,
      bottom: intent.y + 10,
    }
  );
}

export function placeNotationGlossary(
  intent: NotationGlossaryIntent,
  size: GlossarySize,
  viewport: GlossaryViewport,
): NotationGlossaryPlacement {
  const anchor = anchorForIntent(intent);
  const anchorCenterX = (anchor.left + anchor.right) / 2;
  const anchorCenterY = (anchor.top + anchor.bottom) / 2;
  const candidates: NotationGlossaryPlacement[] = [
    {
      side: 'right',
      left: anchor.right + GLOSSARY_GAP,
      top: anchorCenterY - size.height / 2,
    },
    {
      side: 'left',
      left: anchor.left - GLOSSARY_GAP - size.width,
      top: anchorCenterY - size.height / 2,
    },
    {
      side: 'bottom',
      left: anchorCenterX - size.width / 2,
      top: anchor.bottom + GLOSSARY_GAP,
    },
    {
      side: 'top',
      left: anchorCenterX - size.width / 2,
      top: anchor.top - GLOSSARY_GAP - size.height,
    },
  ];
  const maxLeft = viewport.width - GLOSSARY_GUTTER - size.width;
  const maxTop = viewport.height - GLOSSARY_GUTTER - size.height;
  const fits = (placement: NotationGlossaryPlacement) =>
    placement.left >= GLOSSARY_GUTTER &&
    placement.left <= maxLeft &&
    placement.top >= GLOSSARY_GUTTER &&
    placement.top <= maxTop;
  const cardRect = (placement: NotationGlossaryPlacement): NotationAnchor => ({
    left: placement.left,
    right: placement.left + size.width,
    top: placement.top,
    bottom: placement.top + size.height,
  });
  const fitting = candidates.find(
    (placement) => fits(placement) && !overlaps(cardRect(placement), anchor),
  );

  if (fitting) {
    return fitting;
  }

  return candidates
    .map((placement) => ({
      ...placement,
      left: clamp(placement.left, GLOSSARY_GUTTER, maxLeft),
      top: clamp(placement.top, GLOSSARY_GUTTER, maxTop),
    }))
    .sort((left, right) => {
      const leftOverlaps = overlaps(cardRect(left), anchor) ? 1 : 0;
      const rightOverlaps = overlaps(cardRect(right), anchor) ? 1 : 0;

      if (leftOverlaps !== rightOverlaps) {
        return leftOverlaps - rightOverlaps;
      }

      const leftDistance =
        Math.abs(left.left - anchorCenterX) +
        Math.abs(left.top - anchorCenterY);
      const rightDistance =
        Math.abs(right.left - anchorCenterX) +
        Math.abs(right.top - anchorCenterY);

      return leftDistance - rightDistance;
    })[0];
}

function NotationGlyph({
  kind,
  element,
}: {
  kind: NotationKind;
  element?: KitElement;
}) {
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
  const laneStyle =
    colors && element
      ? ({
          fill: KIT_ELEMENT_COLOR_VAR[element],
          stroke: KIT_ELEMENT_COLOR_VAR[element],
        } as CSSProperties)
      : undefined;

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
        style={laneStyle}
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
          style={laneStyle}
        />
      )}
    </svg>
  );
}

function coloredHeadCopy(element: KitElement | undefined) {
  if (!element) {
    return notationCopy['colored-head'];
  }

  const label = KIT_ELEMENT_LABEL[element];

  return {
    title: `${label} note head`,
    detail: `This colour is the ${label.toLowerCase()} lane. Match it to the ${label.toLowerCase()} zone on the kit, then hit that voice.`,
  };
}

export function NotationGlossary({
  intent,
}: {
  intent: NotationGlossaryIntent | undefined;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState<GlossarySize>({ width: 340, height: 140 });
  const [, setViewportRevision] = useState(0);

  useLayoutEffect(() => {
    const rect = cardRef.current?.getBoundingClientRect();

    if (rect && rect.width > 0 && rect.height > 0) {
      setSize({ width: rect.width, height: rect.height });
    }
  }, [intent]);

  useEffect(() => {
    const refresh = () => setViewportRevision((revision) => revision + 1);

    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);

    return () => {
      window.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
    };
  }, []);

  if (!intent) {
    return null;
  }

  const placement = placeNotationGlossary(intent, size, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const copy =
    intent.kind === 'colored-head'
      ? coloredHeadCopy(intent.element)
      : notationCopy[intent.kind];
  const card = (
    <aside
      ref={cardRef}
      className="drumroll-notation-glossary"
      data-testid="notation-glossary"
      data-placement={placement.side}
      role="tooltip"
      style={{ left: placement.left, top: placement.top }}
    >
      <NotationGlyph kind={intent.kind} element={intent.element} />
      <div>
        <span className="drumroll-notation-glossary__eyebrow">
          notation guide
        </span>
        <strong>{copy.title}</strong>
        <p>{copy.detail}</p>
      </div>
    </aside>
  );

  if (typeof document === 'undefined') {
    return card;
  }

  return createPortal(
    card,
    document.querySelector('.drumroll-practice-shell') ?? document.body,
  );
}
