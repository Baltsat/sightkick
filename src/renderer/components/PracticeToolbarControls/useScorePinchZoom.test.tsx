import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useScorePinchZoom } from './useScorePinchZoom';

function ScoreZoomProbe() {
  const [zoom, setZoom] = useState(1);
  const { onWheelCapture } = useScorePinchZoom({ zoom, setZoom });

  return (
    <div data-testid="score" onWheelCapture={onWheelCapture}>
      <output>{zoom.toFixed(1)}</output>
      <input aria-label="Unrelated control" />
    </div>
  );
}

describe('useScorePinchZoom', () => {
  it('zooms the score from a two-finger pinch gesture', () => {
    render(<ScoreZoomProbe />);

    fireEvent.wheel(screen.getByTestId('score'), {
      ctrlKey: true,
      deltaY: -120,
    });

    expect(screen.getByRole('status')).toHaveTextContent('1.1');
  });

  it('keeps Command or Control plus and minus as keyboard fallbacks', () => {
    render(<ScoreZoomProbe />);

    fireEvent.keyDown(window, { ctrlKey: true, key: '+' });
    expect(screen.getByRole('status')).toHaveTextContent('1.1');

    fireEvent.keyDown(window, { metaKey: true, key: '-' });
    expect(screen.getByRole('status')).toHaveTextContent('1.0');
  });

  it('does not catch shortcuts while a form control has focus', () => {
    render(<ScoreZoomProbe />);

    const control = screen.getByRole('textbox', { name: 'Unrelated control' });

    fireEvent.keyDown(control, { ctrlKey: true, key: '+' });

    expect(screen.getByRole('status')).toHaveTextContent('1.0');
  });
});
