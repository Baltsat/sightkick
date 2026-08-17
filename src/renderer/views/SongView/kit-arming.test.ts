import { describe, expect, it } from 'vitest';
import { shouldArmForKitStart } from './kit-arming';

const base = {
  kitConnected: true,
  handsFreeControlsEnabled: true,
  alreadyArmed: false,
  hasInterruptedAttempt: false,
};

describe('starting a run from the laptop', () => {
  it('arms and waits for a strike when the kit is connected', () => {
    expect(shouldArmForKitStart(base)).toBe(true);
  });

  it('starts immediately when no kit is connected', () => {
    expect(shouldArmForKitStart({ ...base, kitConnected: false })).toBe(false);
  });

  it('starts immediately when kit controls are off', () => {
    expect(
      shouldArmForKitStart({ ...base, handsFreeControlsEnabled: false }),
    ).toBe(false);
  });

  it('starts on the second press, so he can play without the kit', () => {
    expect(shouldArmForKitStart({ ...base, alreadyArmed: true })).toBe(false);
  });

  it('leaves an interrupted attempt to its own resume prompt', () => {
    expect(shouldArmForKitStart({ ...base, hasInterruptedAttempt: true })).toBe(
      false,
    );
  });
});
