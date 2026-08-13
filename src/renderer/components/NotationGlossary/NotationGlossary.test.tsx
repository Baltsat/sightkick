import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NOTATION_GLOSSARY_DELAY_MS,
  NotationGlossary,
  notationKindForTarget,
  useNotationGlossaryIntent,
} from './NotationGlossary';

function GlossaryProbe() {
  const { intent, observe, dismiss } = useNotationGlossaryIntent();

  return (
    <>
      <button
        data-notation-kind="accent"
        onPointerLeave={dismiss}
        onPointerMove={(event) =>
          observe(event.target, event.clientX, event.clientY)
        }
      >
        accent
      </button>
      <button
        data-notation-kind="colored-head"
        data-notation-element="snare"
        onPointerLeave={dismiss}
        onPointerMove={(event) =>
          observe(event.target, event.clientX, event.clientY)
        }
      >
        snare head
      </button>
      <button
        data-notation-kind="colored-head"
        data-notation-element="kick"
        onPointerLeave={dismiss}
        onPointerMove={(event) =>
          observe(event.target, event.clientX, event.clientY)
        }
      >
        kick head
      </button>
      {/* No data-notation-element — the shape every current SheetMusic note
          head renders today, unmodified by this contract. */}
      <button
        data-notation-kind="colored-head"
        onPointerLeave={dismiss}
        onPointerMove={(event) =>
          observe(event.target, event.clientX, event.clientY)
        }
      >
        unmapped head
      </button>
      <NotationGlossary intent={intent} />
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NotationGlossary', () => {
  it('waits for hover intent before opening a notation explanation', () => {
    vi.useFakeTimers();
    render(<GlossaryProbe />);

    fireEvent.pointerMove(screen.getByRole('button', { name: 'accent' }), {
      clientX: 120,
      clientY: 80,
    });

    act(() => vi.advanceTimersByTime(NOTATION_GLOSSARY_DELAY_MS - 1));
    expect(screen.queryByTestId('notation-glossary')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('notation-glossary')).toHaveTextContent('Accent');
    expect(screen.getByTestId('notation-glossary')).toHaveTextContent(
      'stronger',
    );
  });

  it('keeps the original generic copy when no element context is set — every current caller', () => {
    vi.useFakeTimers();
    render(<GlossaryProbe />);

    fireEvent.pointerMove(
      screen.getByRole('button', { name: 'unmapped head' }),
      { clientX: 10, clientY: 10 },
    );
    act(() => vi.advanceTimersByTime(NOTATION_GLOSSARY_DELAY_MS));

    const glossary = screen.getByTestId('notation-glossary');

    expect(glossary).toHaveTextContent('Colored note head');
    expect(glossary).toHaveTextContent('Color names the drum or cymbal lane.');
  });

  it('names the exact drum and re-triggers when hovering a different colored head', () => {
    vi.useFakeTimers();
    render(<GlossaryProbe />);

    fireEvent.pointerMove(screen.getByRole('button', { name: 'snare head' }), {
      clientX: 10,
      clientY: 10,
    });
    act(() => vi.advanceTimersByTime(NOTATION_GLOSSARY_DELAY_MS));
    expect(screen.getByTestId('notation-glossary')).toHaveTextContent(
      'Snare note head',
    );

    fireEvent.pointerMove(screen.getByRole('button', { name: 'kick head' }), {
      clientX: 40,
      clientY: 40,
    });
    // Same `kind` ('colored-head'), different element — must not be
    // deduped away by the same-kind shortcut.
    act(() => vi.advanceTimersByTime(NOTATION_GLOSSARY_DELAY_MS));
    expect(screen.getByTestId('notation-glossary')).toHaveTextContent(
      'Kick note head',
    );
  });

  it('uses the specific glyph before a note-wide annotation', () => {
    const note = document.createElement('g');
    const dot = document.createElement('path');

    note.setAttribute('data-notation-kinds', 'colored-head dot triple-beam');
    dot.setAttribute('data-notation-kind', 'dot');
    note.append(dot);

    expect(notationKindForTarget(dot)).toBe('dot');
    expect(notationKindForTarget(note)).toBe('dot');
    expect(
      notationKindForTarget(document.createElement('div')),
    ).toBeUndefined();
  });
});
