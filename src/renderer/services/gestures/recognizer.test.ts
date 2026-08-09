import { describe, expect, it } from 'vitest';
import { KitElement } from '../practice-stats';
import { createDrumGestureState, recognizeDrumGesture } from './recognizer';
import {
  DrumGestureState,
  DrumGestureSurface,
  DrumGestureTransition,
} from './types';

function hit(
  state: DrumGestureState,
  surface: DrumGestureSurface,
  element: KitElement,
  timeMs: number,
  velocity = 100,
) {
  return recognizeDrumGesture(state, { element, timeMs, velocity }, surface);
}

function playSequence(
  state: DrumGestureState,
  surface: DrumGestureSurface,
  elements: KitElement[],
  startMs: number,
  gapMs = 180,
) {
  let result: DrumGestureTransition = { state };

  elements.forEach((element, index) => {
    result = hit(result.state, surface, element, startMs + index * gapMs);
  });

  return result;
}

const PRIMARY_COMMAND: KitElement[] = ['kick', 'crash', 'kick', 'crash'];

describe('drum gesture recognizer', () => {
  it('recognizes only the exact ordered four-strike ready command', () => {
    const ready = playSequence(
      createDrumGestureState(),
      'ready',
      PRIMARY_COMMAND,
      1000,
    );

    expect(ready).toMatchObject({
      action: 'start',
      gestureId: 'kit-command-start',
    });

    const reversed = playSequence(
      createDrumGestureState(),
      'home',
      ['crash', 'kick', 'crash', 'kick'],
      2000,
    );

    expect(reversed.action).toBeUndefined();
  });

  it('recognizes pause only after silence and the full signature while playing', () => {
    let state = hit(createDrumGestureState(), 'playing', 'hihat', 1000).state;
    const tooSoon = playSequence(state, 'playing', PRIMARY_COMMAND, 1800);

    expect(tooSoon.action).toBeUndefined();

    state = tooSoon.state;

    const pause = playSequence(state, 'playing', PRIMARY_COMMAND, 4000);

    expect(pause).toMatchObject({
      action: 'pause',
      gestureId: 'kit-command-pause',
    });
  });

  it('rejects extra hits, reversed hits, quiet hits, short gaps, and slow sequences', () => {
    const withExtra = playSequence(
      createDrumGestureState(),
      'ready',
      ['kick', 'crash', 'snare', 'kick', 'crash'],
      1000,
    );

    expect(withExtra.action).toBeUndefined();

    const quiet = PRIMARY_COMMAND.reduce<DrumGestureTransition>(
      (result, element, index) =>
        hit(result.state, 'ready', element, 3000 + index * 180, 30),
      { state: createDrumGestureState() },
    );

    expect(quiet.action).toBeUndefined();

    const rushed = playSequence(
      createDrumGestureState(),
      'ready',
      PRIMARY_COMMAND,
      5000,
      20,
    );

    expect(rushed.action).toBeUndefined();

    const slow = playSequence(
      createDrumGestureState(),
      'ready',
      PRIMARY_COMMAND,
      7000,
      450,
    );

    expect(slow.action).toBeUndefined();
  });

  it('maps result and paused signatures only on their eligible surfaces', () => {
    const retry = playSequence(
      createDrumGestureState(),
      'result',
      ['snare', 'kick', 'snare', 'kick'],
      1000,
    );

    expect(retry.action).toBe('retry');

    const end = playSequence(
      createDrumGestureState(),
      'result',
      ['ride', 'kick', 'ride', 'crash'],
      3000,
    );

    expect(end.action).toBe('end');

    const resume = playSequence(
      createDrumGestureState(),
      'paused',
      PRIMARY_COMMAND,
      5000,
    );

    expect(resume.action).toBe('resume');

    const retryOnPause = playSequence(
      createDrumGestureState(),
      'paused',
      ['snare', 'kick', 'snare', 'kick'],
      7000,
    );

    expect(retryOnPause.action).toBeUndefined();
  });

  it('debounces one completed command', () => {
    let result = playSequence(
      createDrumGestureState(),
      'ready',
      PRIMARY_COMMAND,
      1000,
    );

    expect(result.action).toBe('start');

    result = playSequence(result.state, 'ready', PRIMARY_COMMAND, 1700);
    expect(result.action).toBeUndefined();

    result = playSequence(result.state, 'ready', PRIMARY_COMMAND, 3500);
    expect(result.action).toBe('start');
  });

  it('replays representative DTX402 song traffic without an accidental command', () => {
    const dtxLaneByNote: Record<number, KitElement> = {
      36: 'kick',
      38: 'snare',
      42: 'hihat',
      47: 'tom2',
      48: 'tom1',
      49: 'crash',
      51: 'ride',
      43: 'tom3',
    };
    const rawMidi: { note: number; timeMs: number; velocity: number }[] = [];

    for (let bar = 0; bar < 96; bar += 1) {
      const barStart = bar * 2000;

      for (let eighth = 0; eighth < 8; eighth += 1) {
        rawMidi.push({
          note: bar % 8 === 0 ? 51 : 42,
          timeMs: barStart + eighth * 250,
          velocity: 72,
        });

        if (eighth === 0 || eighth === 4) {
          rawMidi.push({
            note: 36,
            timeMs: barStart + eighth * 250 + 8,
            velocity: 96,
          });
        }

        if (eighth === 2 || eighth === 6) {
          rawMidi.push({
            note: 38,
            timeMs: barStart + eighth * 250 + 8,
            velocity: 94,
          });
        }
      }

      if (bar % 8 === 0) {
        rawMidi.push({ note: 49, timeMs: barStart + 12, velocity: 108 });
      }

      if (bar % 12 === 11) {
        [48, 47, 43, 38].forEach((note, index) =>
          rawMidi.push({
            note,
            timeMs: barStart + 1500 + index * 110,
            velocity: 88 + index,
          }),
        );
      }
    }

    rawMidi.sort((a, b) => a.timeMs - b.timeMs);

    let state = createDrumGestureState();
    const actions: string[] = [];

    rawMidi.forEach((event) => {
      const transition = hit(
        state,
        'playing',
        dtxLaneByNote[event.note],
        event.timeMs,
        event.velocity,
      );

      state = transition.state;

      if (transition.action) {
        actions.push(transition.action);
      }
    });

    expect(actions).toEqual([]);
  });
});
