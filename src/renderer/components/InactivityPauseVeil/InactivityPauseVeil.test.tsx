import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useInactivityPauseVeil } from './InactivityPauseVeil';

describe('useInactivityPauseVeil', () => {
  it('steps aside after pointer activity and returns for a later kit pause', () => {
    const { result, rerender } = renderHook(
      ({ pauseEpoch }: { pauseEpoch: number | undefined }) =>
        useInactivityPauseVeil(pauseEpoch),
      { initialProps: { pauseEpoch: 1 } },
    );

    expect(result.current.visible).toBe(true);

    act(() => result.current.release());
    expect(result.current.visible).toBe(false);

    rerender({ pauseEpoch: 2 });
    expect(result.current.visible).toBe(true);
  });
});
