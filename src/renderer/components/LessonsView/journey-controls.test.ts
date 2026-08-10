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
        hihat: ['midi:42'],
        ride: ['midi:51'],
      },
    );

    expect(controls).toEqual({
      mapping: {
        up: ['midi:48', 'midi:50'],
        down: ['midi:45'],
        left: ['midi:42'],
        right: ['midi:51'],
        confirm: ['midi:38'],
        back: ['midi:49'],
      },
      source: 'kit-lanes',
      legend:
        'Tom 1 / Tom 2 select · Snare starts · Hi-hat / Ride change season · Crash backs',
      kitActions: ['up', 'down', 'left', 'right', 'confirm', 'back'],
    });
  });

  it('keeps explicit actions authoritative while filling only missing actions from the kit', () => {
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

    expect(controls.mapping).toEqual({
      ...explicit,
      left: [],
      right: [],
    });
    expect(controls.source).toBe('explicit');
    expect(controls.legend).toBe('Up / Down select · Enter starts · Esc backs');
    expect(controls.kitActions).toEqual([]);
  });

  it('keeps partial keyboard mappings and adds non-conflicting kit fallbacks', () => {
    const controls = resolveJourneyControls(
      { confirm: ['keyboard:Enter'] },
      {
        tom1: ['midi:48'],
        tom2: ['midi:45'],
        snare: ['midi:38'],
        crash: ['midi:49'],
        hihat: ['midi:42'],
        ride: ['midi:51'],
      },
    );

    expect(controls.mapping).toMatchObject({
      up: ['midi:48'],
      down: ['midi:45'],
      left: ['midi:42'],
      right: ['midi:51'],
      confirm: ['keyboard:Enter'],
      back: ['midi:49'],
    });
    expect(controls.source).toBe('mixed');
    expect(controls.kitActions).toEqual([
      'up',
      'down',
      'left',
      'right',
      'back',
    ]);
    expect(controls.legend).toContain('Enter starts');
    expect(controls.legend).toContain('Tom 1 / Tom 2 select');
  });

  it('reports only the directional kit fallback that actually survived explicit mappings', () => {
    const controls = resolveJourneyControls(
      { up: ['keyboard:ArrowUp'] },
      {
        tom1: ['midi:48'],
        tom2: ['midi:45'],
      },
    );

    expect(controls.mapping.up).toEqual(['keyboard:ArrowUp']);
    expect(controls.mapping.down).toEqual(['midi:45']);
    expect(controls.kitActions).toEqual(['down']);
    expect(controls.legend).toContain('Tom 2 selects next');
    expect(controls.legend).not.toContain('Tom 1 selects previous');
  });
});
