import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it } from 'vitest';
import {
  NotationGlossary,
  NotationKitKey,
  placeNotationGlossary,
  notationKindForTarget,
  shouldShowNotationKitKey,
  useNotationGlossaryIntent,
} from './NotationGlossary';

function GlossaryProbe() {
  const { intent, summon } = useNotationGlossaryIntent();
  const inspect = (event: PointerEvent<HTMLElement>) => {
    if (event.altKey) {
      summon(event.target, event.clientX, event.clientY);
    }
  };

  return (
    <>
      <button data-notation-kind="accent" onPointerDown={inspect}>
        accent
      </button>
      <button
        data-notation-kind="colored-head"
        data-notation-element="snare"
        onPointerDown={inspect}
      >
        snare head
      </button>
      <button
        data-notation-kind="colored-head"
        data-notation-element="kick"
        onPointerDown={inspect}
      >
        kick head
      </button>
      <button
        data-notation-kind="colored-head"
        className="vf-note-hihat vf-note-missed"
        onPointerDown={inspect}
      >
        missed hi-hat head
      </button>
      <NotationGlossary intent={intent} />
    </>
  );
}

describe('NotationGlossary', () => {
  it('keeps a compact staff-position and sticking key at the score bottom', () => {
    render(<NotationKitKey layout="classic" />);

    const key = screen.getByTestId('notation-kit-key');

    expect(key).toHaveAccessibleName('Drum kit notation key');
    expect(key.querySelectorAll('[data-kit-element]')).toHaveLength(10);
    expect(key).toHaveTextContent('staff position · drum name');
    expect(
      key.querySelector('[data-kit-element="kick"] button'),
    ).toHaveAccessibleName('Kick: round head, low on the staff');
    expect(
      key.querySelector('[data-kit-element="hihat"] button'),
    ).toHaveAccessibleName('Hi-hat: cross head, high on the staff');
    expect(key).toHaveTextContent('Cross-stick');
    expect(key).toHaveTextContent('Hi-hat foot');
    expect(key).toHaveTextContent('RF');
    expect(key).toHaveTextContent('Right foot');
  });

  it('names every focused or hovered strip glyph in words', () => {
    render(<NotationKitKey layout="flow" />);

    fireEvent.pointerEnter(screen.getByTestId('notation-kit-key-item-hihat'));
    expect(screen.getByRole('status')).toHaveTextContent('× means Hi-hat.');

    fireEvent.focus(screen.getByTestId('notation-sticking-key-RF'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'RF means Right foot.',
    );
  });

  it('shows automatically while paused or at the computer, unless it is already pinned', () => {
    expect(
      shouldShowNotationKitKey({
        manualVisible: false,
        interactionMode: 'kit',
        presentationPhase: 'playing',
      }),
    ).toBe(false);
    expect(
      shouldShowNotationKitKey({
        manualVisible: false,
        interactionMode: 'kit',
        presentationPhase: 'paused',
      }),
    ).toBe(true);
    expect(
      shouldShowNotationKitKey({
        manualVisible: false,
        interactionMode: 'computer',
        presentationPhase: 'playing',
      }),
    ).toBe(true);
    expect(
      shouldShowNotationKitKey({
        manualVisible: true,
        interactionMode: 'kit',
        presentationPhase: 'playing',
      }),
    ).toBe(true);
  });

  it('requires an option-click and never reopens from ordinary pointer movement', () => {
    render(<GlossaryProbe />);

    fireEvent.pointerMove(screen.getByRole('button', { name: 'accent' }), {
      clientX: 120,
      clientY: 80,
    });

    expect(screen.queryByTestId('notation-glossary')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'accent' }), {
      altKey: true,
      clientX: 120,
      clientY: 80,
    });
    expect(screen.getByTestId('notation-glossary')).toHaveTextContent('Accent');
    fireEvent.pointerLeave(screen.getByRole('button', { name: 'accent' }));
    expect(screen.getByTestId('notation-glossary')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('notation-glossary')).not.toBeInTheDocument();

    fireEvent.pointerMove(screen.getByRole('button', { name: 'accent' }), {
      clientX: 120,
      clientY: 80,
    });
    expect(screen.queryByTestId('notation-glossary')).not.toBeInTheDocument();
  });

  it('names the lane carried by a missed rendered note, with one card at a time', () => {
    render(<GlossaryProbe />);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'missed hi-hat head' }),
      { altKey: true, clientX: 40, clientY: 40 },
    );

    expect(screen.getByTestId('notation-glossary')).toHaveTextContent(
      'Hi-hat note head',
    );
    expect(screen.getAllByTestId('notation-glossary')).toHaveLength(1);
  });

  it('portals an open card into the active practice layer above the score', () => {
    const arena = document.createElement('div');

    arena.className = 'drumroll-practice-shell';
    document.body.append(arena);

    const view = render(
      <NotationGlossary
        intent={{ kind: 'colored-head', x: 900, y: 240, element: 'snare' }}
      />,
    );

    expect(
      arena.querySelector('[data-testid="notation-glossary"]'),
    ).toHaveTextContent('Snare note head');

    view.unmount();
    arena.remove();
  });

  it('stacks the card above the fixed practice overlay', () => {
    const css = readFileSync(
      'src/renderer/components/NotationGlossary/NotationGlossary.css',
      'utf8',
    );

    expect(css).toContain('z-index: 110');
  });

  it('flips a right-edge card inward without covering the explained note', () => {
    const placement = placeNotationGlossary(
      {
        kind: 'colored-head',
        x: 990,
        y: 320,
        anchor: { left: 982, right: 998, top: 312, bottom: 328 },
      },
      { width: 340, height: 140 },
      { width: 1024, height: 700 },
    );

    expect(placement.side).toBe('left');
    expect(placement.left).toBeGreaterThanOrEqual(16);
    expect(placement.left + 340).toBeLessThanOrEqual(1008);
    expect(placement.left + 340).toBeLessThanOrEqual(964);
  });

  it('keeps an inspected card inside both supported practice viewports', () => {
    [
      { width: 1024, height: 700 },
      { width: 1225, height: 768 },
    ].forEach((viewport) => {
      const anchor = {
        left: viewport.width - 42,
        right: viewport.width - 26,
        top: Math.floor(viewport.height / 2) - 8,
        bottom: Math.floor(viewport.height / 2) + 8,
      };
      const placement = placeNotationGlossary(
        {
          kind: 'colored-head',
          x: anchor.right,
          y: anchor.top,
          anchor,
        },
        { width: 340, height: 140 },
        viewport,
      );

      expect(placement.left).toBeGreaterThanOrEqual(16);
      expect(placement.top).toBeGreaterThanOrEqual(16);
      expect(placement.left + 340).toBeLessThanOrEqual(viewport.width - 16);
      expect(placement.top + 140).toBeLessThanOrEqual(viewport.height - 16);
      expect(placement.left + 340).toBeLessThanOrEqual(anchor.left - 18);
    });
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
