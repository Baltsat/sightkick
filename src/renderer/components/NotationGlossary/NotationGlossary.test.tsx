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
