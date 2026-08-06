import { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { LessonsView } from './LessonsView';
import { LessonProgress } from '../../hooks/useLessons';

const EMPTY_PROGRESS: LessonProgress = {
  entries: [],
  groups: [],
  totalLessons: 0,
  unlockedCount: 0,
  totalStars: 0,
  continueEntry: undefined,
  nextLockedEntry: undefined,
};

function wrapper({ children }: { children: ReactNode }) {
  return <AntdApp>{children}</AntdApp>;
}

describe('LessonsView — empty state', () => {
  it('never dead-ends: shows a primary Rescan library button instead of text-only instructions', () => {
    const onRescan = vi.fn();

    render(
      <LessonsView
        progress={EMPTY_PROGRESS}
        onPlay={vi.fn()}
        onRescan={onRescan}
      />,
      { wrapper },
    );

    expect(screen.getByText('No lessons found')).toBeInTheDocument();

    const button = screen.getByTestId('lessons-rescan');

    expect(button).toBeInTheDocument();
    fireEvent.click(button);

    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it('shows scan progress instead of the dead-end message while a rescan is running', () => {
    render(
      <LessonsView
        progress={EMPTY_PROGRESS}
        onPlay={vi.fn()}
        onRescan={vi.fn()}
        scanPercent={42}
      />,
      { wrapper },
    );

    expect(screen.getByTestId('lessons-scan-progress')).toBeInTheDocument();
    expect(screen.queryByText('No lessons found')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lessons-rescan')).not.toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});
