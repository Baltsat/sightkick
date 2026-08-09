import { describe, expect, it } from 'vitest';
import { STREAK_STAGES } from './constants';
import {
  INITIAL_STREAK_STATE,
  registerFailure,
  registerHit,
  resetForSeek,
  stageForCount,
} from './streak-tracker';
import { StreakState } from './types';

function hitN(state: StreakState, n: number): StreakState {
  let current = state;

  for (let i = 0; i < n; i += 1) {
    current = registerHit(current, `note-${i}`).state;
  }

  return current;
}

describe('STREAK_STAGES', () => {
  it('is ascending by threshold with tier mirroring array index', () => {
    STREAK_STAGES.forEach((stage, index) => {
      expect(stage.tier).toBe(index);

      if (index > 0) {
        expect(stage.threshold).toBeGreaterThan(
          STREAK_STAGES[index - 1].threshold,
        );
      }
    });
  });

  it('has unique ids', () => {
    const ids = STREAK_STAGES.map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('stageForCount', () => {
  it('is undefined below the first threshold', () => {
    expect(stageForCount(0)).toBeUndefined();
    expect(stageForCount(STREAK_STAGES[0].threshold - 1)).toBeUndefined();
  });

  it('returns the exact stage right at its threshold', () => {
    expect(stageForCount(STREAK_STAGES[0].threshold)?.id).toBe(
      STREAK_STAGES[0].id,
    );
  });

  it('returns the highest reached stage between thresholds', () => {
    const [first, second] = STREAK_STAGES;
    const between = first.threshold + 1;

    expect(between).toBeLessThan(second.threshold);
    expect(stageForCount(between)?.id).toBe(first.id);
  });

  it('returns the top stage for a count past every threshold', () => {
    const top = STREAK_STAGES[STREAK_STAGES.length - 1];

    expect(stageForCount(top.threshold + 1000)?.id).toBe(top.id);
  });
});

describe('registerHit', () => {
  it('grows count by 1 per distinct note', () => {
    const t1 = registerHit(INITIAL_STREAK_STATE, 'a');

    expect(t1.state.count).toBe(1);

    const t2 = registerHit(t1.state, 'b');

    expect(t2.state.count).toBe(2);
  });

  it('tracks best as the running max', () => {
    const state = hitN(INITIAL_STREAK_STATE, 5);

    expect(state.best).toBe(5);
  });

  it('dedupes a chord: a second key of the same note does not double-count', () => {
    const t1 = registerHit(INITIAL_STREAK_STATE, 'chord-1');

    expect(t1.state.count).toBe(1);

    const t2 = registerHit(t1.state, 'chord-1');

    expect(t2.state.count).toBe(1);
    expect(t2.stageUp).toBeUndefined();
  });

  it('dedupes correctly even when a different note is counted in between', () => {
    // kick of chord A, then note B, then a late-arriving snare of chord A -
    // A must still only ever count once.
    const afterA = registerHit(INITIAL_STREAK_STATE, 'A').state;
    const afterB = registerHit(afterA, 'B').state;
    const afterLateA = registerHit(afterB, 'A');

    expect(afterLateA.state.count).toBe(2);
  });

  it('announces a stage-up exactly on the hit that crosses a threshold', () => {
    const firstThreshold = STREAK_STAGES[0].threshold;
    const state = hitN(INITIAL_STREAK_STATE, firstThreshold - 1);
    const crossing = registerHit(state, `note-${firstThreshold - 1}`);

    expect(crossing.stageUp?.id).toBe(STREAK_STAGES[0].id);
    expect(crossing.state.stage?.id).toBe(STREAK_STAGES[0].id);
  });

  it('does not announce a stage-up on a hit that stays within the same stage', () => {
    const firstThreshold = STREAK_STAGES[0].threshold;
    const state = hitN(INITIAL_STREAK_STATE, firstThreshold);
    const next = registerHit(state, `note-${firstThreshold}`);

    expect(next.stageUp).toBeUndefined();
  });

  it('walks every stage in order across a long streak', () => {
    let state = INITIAL_STREAK_STATE;
    const seenStageUps: string[] = [];

    for (
      let i = 0;
      i < STREAK_STAGES[STREAK_STAGES.length - 1].threshold;
      i += 1
    ) {
      const t = registerHit(state, `note-${i}`);

      state = t.state;

      if (t.stageUp) {
        seenStageUps.push(t.stageUp.id);
      }
    }

    expect(seenStageUps).toEqual(STREAK_STAGES.map((s) => s.id));
  });
});

describe('registerFailure', () => {
  it('resets count to 0 and reports a shatter when a running streak breaks', () => {
    const running = hitN(INITIAL_STREAK_STATE, 10);
    const failed = registerFailure(running);

    expect(failed.state.count).toBe(0);
    expect(failed.state.stage).toBeUndefined();
    expect(failed.didShatter).toBe(true);
  });

  it('preserves best across a failure reset', () => {
    const running = hitN(INITIAL_STREAK_STATE, 10);
    const failed = registerFailure(running);

    expect(failed.state.best).toBe(10);
  });

  it('is idempotent (no repeated shatter) while already at zero', () => {
    const first = registerFailure(INITIAL_STREAK_STATE);

    expect(first.didShatter).toBe(false);
    expect(first.state).toBe(INITIAL_STREAK_STATE);
  });

  it('clears counted note ids so a post-reset hit is never deduped away', () => {
    const running = registerHit(INITIAL_STREAK_STATE, 'x').state;
    const failed = registerFailure(running).state;
    const rehit = registerHit(failed, 'x');

    expect(rehit.state.count).toBe(1);
  });
});

describe('resetForSeek', () => {
  it('zeroes both count and best (unlike registerFailure)', () => {
    const running = hitN(INITIAL_STREAK_STATE, 10);
    const afterFailure = registerFailure(running).state; // best is now 10
    const rebuilt = hitN(afterFailure, 3); // count 3, best still 10
    const seeked = resetForSeek(rebuilt);

    expect(seeked.state.count).toBe(0);
    expect(seeked.state.best).toBe(0);
    expect(seeked.state.stage).toBeUndefined();
  });

  it('never reports a shatter, even when it zeroes a running streak', () => {
    const running = hitN(INITIAL_STREAK_STATE, 5);
    const seeked = resetForSeek(running);

    expect(seeked.didShatter).toBe(false);
    expect(seeked.stageUp).toBeUndefined();
  });

  it('is a no-op when already fully at rest', () => {
    const seeked = resetForSeek(INITIAL_STREAK_STATE);

    expect(seeked.state).toBe(INITIAL_STREAK_STATE);
  });
});
