import { describe, expect, it } from 'vitest';
import { resolveLibraryControls } from './library-controls';

describe('resolveLibraryControls', () => {
  it('keeps each explicit action authoritative and fills only missing actions', () => {
    const controls = resolveLibraryControls(
      { down: ['midi:91'] },
      {
        tom1: ['midi:91', 'midi:48'],
        tom2: ['midi:47'],
        snare: ['midi:91', 'midi:38'],
      },
    );

    expect(controls.mapping.down).toEqual(['midi:91']);
    expect(controls.mapping.up).toEqual(['midi:48']);
    expect(controls.mapping.confirm).toEqual(['midi:38']);
    expect(controls.source).toBe('mixed');
    expect(controls.kitActions).toEqual(['up', 'confirm']);
    expect(controls.legend).toBe(
      'Explicit: 91 move · Kit fallback: Tom 1 moves up · Snare chooses',
    );
  });

  it('claims a duplicate kit note for only one fallback action', () => {
    const controls = resolveLibraryControls(
      {},
      {
        tom2: ['midi:60'],
        snare: ['midi:60', 'midi:61'],
      },
    );

    expect(controls.mapping.down).toEqual(['midi:60']);
    expect(controls.mapping.confirm).toEqual(['midi:61']);
    expect(controls.kitActions).toEqual(['down', 'confirm']);
  });
});
