import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonEntry } from '../../hooks/useLessons';
import { installIpcMock, installLocalStorage } from '../../hooks/test-support';
import { LessonNode } from './LessonNode';

vi.mock('../../services/kit-preview-audio', () => ({
  playKitPreview: vi.fn(),
}));

function entry(): LessonEntry {
  return {
    song: { id: 'lesson-song', name: 'Snare control' },
    lesson: {
      id: '01.01',
      title: 'Snare control',
      targetLanes: [{ element: 'snare', weight: 1 }],
    },
    bestStars: 0,
    cleared: false,
    unlocked: true,
    clearsNeeded: 0,
  } as LessonEntry;
}

describe('LessonNode kit color maturity', () => {
  beforeEach(() => {
    installLocalStorage();
    installIpcMock();
  });

  it('renders a near-black lane property when the persisted override requests it', () => {
    window.localStorage.setItem(
      'settings.kitColorOverride',
      JSON.stringify('near-black'),
    );

    render(
      <LessonNode
        entry={entry()}
        state="available"
        xPercent={40}
        yPercent={40}
        onPlay={vi.fn()}
        onLockedClick={vi.fn()}
      />,
    );

    const node = screen.getByTestId('lesson-item-01.01');

    expect(node).toHaveAttribute('data-kit-color-mode', 'near-black');
    expect(node.style.getPropertyValue('--kit-color-vividness')).toBe('8.0%');
    expect(node.style.getPropertyValue('--lesson-lane-color')).toContain(
      'var(--color-red) var(--kit-color-vividness)',
    );
  });
});
