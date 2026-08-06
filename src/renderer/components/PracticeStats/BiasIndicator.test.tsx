import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BiasIndicator } from './BiasIndicator';
import {
  emptyRunFixture,
  multiLaneRunFixture,
  perfectRunFixture,
  singleLaneRunFixture,
} from './test-fixtures';

describe('BiasIndicator', () => {
  it('names the worst-offending lane when multiple lanes were struck', () => {
    const { timingBias, laneBias } = multiLaneRunFixture();

    render(<BiasIndicator timingBias={timingBias} laneBias={laneBias} />);

    expect(screen.getByTestId('bias-indicator')).toHaveTextContent(
      'You hit 12 ms early on average — especially Kick.',
    );
  });

  it('reports a late bias without naming a lane when only one lane was struck', () => {
    const { timingBias, laneBias } = singleLaneRunFixture();

    render(<BiasIndicator timingBias={timingBias} laneBias={laneBias} />);

    const text = screen.getByTestId('bias-indicator').textContent;

    expect(text).toContain('13 ms late on average');
    expect(text).not.toContain('especially');
  });

  it('reports dead-on-time when the mean signed bias is exactly zero', () => {
    const { timingBias, laneBias } = perfectRunFixture();

    render(<BiasIndicator timingBias={timingBias} laneBias={laneBias} />);

    expect(screen.getByTestId('bias-indicator')).toHaveTextContent(
      'Your timing is dead on average.',
    );
  });

  it('shows an honest empty state when there is no timing data at all', () => {
    const { timingBias, laneBias } = emptyRunFixture();

    render(<BiasIndicator timingBias={timingBias} laneBias={laneBias} />);

    expect(screen.getByTestId('bias-indicator-empty')).toHaveTextContent(
      'Not enough timing data yet.',
    );
  });
});
