import { describe, expect, it } from 'vitest';
import { resolveJourneyControls } from './journey-controls';

describe('resolveJourneyControls', () => {
  it('derives collision-free Journey-only actions from mapped MIDI lanes', () => {
    const controls = resolveJourneyControls(
      {},
      {
        tom1: ['midi:48', 'midi:50'],
        tom2: ['midi:45', 'midi:48'],
        snare: ['midi:38'],
        crash: ['midi:49'],
      },
    );

    expect(controls).toEqual({
      mapping: {
        up: ['midi:48', 'midi:50'],
        down: ['midi:45'],
        confirm: ['midi:38'],
        back: ['midi:49'],
      },
      source: 'kit-lanes',
      legend: 'Tom 1 / Tom 2 select · Snare starts · Crash backs',
    });
  });

  it('keeps explicit Journey controls authoritative instead of mixing in lane hits', () => {
    const explicit = {
      up: ['keyboard:ArrowUp'],
      down: ['keyboard:ArrowDown'],
      confirm: ['keyboard:Enter'],
      back: ['keyboard:Escape'],
    };
    const controls = resolveJourneyControls(explicit, {
      tom1: ['midi:48'],
      tom2: ['midi:45'],
      snare: ['midi:38'],
      crash: ['midi:49'],
    });

    expect(controls.mapping).toBe(explicit);
    expect(controls.source).toBe('explicit');
    expect(controls.legend).toBe('Up / Down select · Enter starts · Esc backs');
  });
});
