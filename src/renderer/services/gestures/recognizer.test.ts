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
  it('starts from one deliberate kick on the home and ready surfaces', () => {
    const ready = hit(createDrumGestureState(), 'ready', 'kick', 1000);

    expect(ready).toMatchObject({
      action: 'start',
      gestureId: 'kit-command-start-kick',
    });

    const home = hit(createDrumGestureState(), 'home', 'kick', 2000);

    expect(home).toMatchObject({
      action: 'start',
      gestureId: 'kit-command-start-kick',
    });
  });

  it('leaves every Home door other than the kick to HomeCockpit', () => {
    // The home screen executes its own painted door map (HOME_KIT_DOORS)
    // straight off the input bus. The recognizer must not answer the same
    // question with a different lane-to-destination map.
    expect(hit(createDrumGestureState(), 'home', 'snare', 1_000).action).toBe(
      undefined,
    );
    expect(hit(createDrumGestureState(), 'home', 'tom1', 2_000).action).toBe(
      undefined,
    );
    expect(hit(createDrumGestureState(), 'home', 'ride', 3_000).action).toBe(
      undefined,
    );
    expect(hit(createDrumGestureState(), 'home', 'crash', 4_000).action).toBe(
      undefined,
    );
  });

  it('gives every result outcome its own single deliberate pad', () => {
    expect(
      hit(createDrumGestureState(), 'result', 'crash', 1_000),
    ).toMatchObject({ action: 'continue', gestureId: 'kit-command-continue' });
    expect(
      hit(createDrumGestureState(), 'result', 'snare', 2_000),
    ).toMatchObject({ action: 'retry', gestureId: 'kit-command-retry' });
    expect(
      hit(createDrumGestureState(), 'result', 'ride', 3_000),
    ).toMatchObject({ action: 'end', gestureId: 'kit-command-end' });
    expect(
      hit(createDrumGestureState(), 'result', 'hihat', 4_000),
    ).toMatchObject({ action: 'open-coach', gestureId: 'kit-command-coach' });
  });

  it('keeps the same one-pad language on insights and stats', () => {
    expect(
      hit(createDrumGestureState(), 'insights', 'crash', 1_000),
    ).toMatchObject({ action: 'continue', gestureId: 'kit-command-continue' });
    expect(
      hit(createDrumGestureState(), 'insights', 'hihat', 2_000),
    ).toMatchObject({ action: 'open-coach', gestureId: 'kit-command-coach' });
    expect(
      hit(createDrumGestureState(), 'insights', 'ride', 3_000),
    ).toMatchObject({ action: 'end', gestureId: 'kit-command-end' });
    expect(hit(createDrumGestureState(), 'stats', 'ride', 4_000)).toMatchObject(
      { action: 'end', gestureId: 'kit-command-end' },
    );
  });

  it('holds a result command until the run has actually gone quiet', () => {
    // Entering Results seeds the quiet clock (see useDrumGestures), so the
    // tail of the run that just ended cannot open the next one.
    const arrived = createDrumGestureState(1_000);

    expect(hit(arrived, 'result', 'crash', 1_400).action).toBeUndefined();
    expect(hit(arrived, 'result', 'crash', 2_000).action).toBe('continue');
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

  it('rejects a wrong lane, a low-velocity kick, and a kick without the required silence', () => {
    const wrongLane = hit(createDrumGestureState(), 'ready', 'crash', 1000);

    expect(wrongLane.action).toBeUndefined();

    const lowVelocity = hit(createDrumGestureState(), 'home', 'kick', 3000, 55);

    expect(lowVelocity.action).toBeUndefined();

    const recentTraffic = hit(createDrumGestureState(), 'ready', 'snare', 5000);
    const tooSoon = hit(recentTraffic.state, 'ready', 'kick', 5400);

    expect(tooSoon.action).toBeUndefined();
  });

  it('maps result and paused signatures only on their eligible surfaces', () => {
    // Single result pads stay on the result screen: while a run is paused,
    // one strike must not end or restart it.
    expect(hit(createDrumGestureState(), 'paused', 'crash', 1000).action).toBe(
      undefined,
    );
    expect(hit(createDrumGestureState(), 'paused', 'snare', 2000).action).toBe(
      undefined,
    );

    const end = playSequence(
      createDrumGestureState(),
      'paused',
      ['ride', 'kick', 'ride', 'crash'],
      3000,
    );

    expect(end).toMatchObject({
      action: 'end',
      gestureId: 'kit-command-paused-end',
    });

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

  it('debounces a one-kick start until the cooldown and silence window both pass', () => {
    let result = hit(createDrumGestureState(), 'ready', 'kick', 1000);

    expect(result.action).toBe('start');

    result = hit(result.state, 'ready', 'kick', 1400);
    expect(result.action).toBeUndefined();

    result = hit(result.state, 'ready', 'kick', 2400);
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
