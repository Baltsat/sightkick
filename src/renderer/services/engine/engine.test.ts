import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stave, StaveNote } from 'vexflow';
import { TrackConfig } from '../audio-player';
import {
  Measure,
  Note,
  ParsedChart,
  RenderData,
  RenderedNote,
} from '../../../chart-parser/types';
import { MidiMessageType } from '../../../types';
import { installIpcMock } from '../../hooks/test-support';
import { InputBus } from '../../input/input-bus';
import { MidiSource } from '../../input/midi-source';
import { InputEvent } from '../../input/types';
import { createPracticeAttemptCheckpointController } from '../../hooks/usePracticeAttemptCheckpoint';
import { Engine } from './engine';
import { EngineContext, ResolvedJudgement } from './types';

vi.mock('../click-track/metronome', () => ({
  renderClickBuffers: vi.fn(() => ({ downbeat: {}, beat: {} })),
}));

const { MockAudioPlayer } = vi.hoisted(() => {
  const fakeContext = () => ({
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: () => Promise.resolve(),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        cancelScheduledValues: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    }),
    createBufferSource: () => ({
      buffer: undefined,
      connect: () => {},
      start: () => {},
      stop: () => {},
      addEventListener: () => {},
    }),
  });

  class MockAudioPlayerImpl {
    static instances: MockAudioPlayerImpl[] = [];
    onEnded: () => void;
    ready = Promise.resolve([]);
    context = fakeContext();
    audioTracks: { name: string; setVolume: () => void }[] = [];
    currentTime = 0;
    duration = 100;
    isInitialised = false;
    startedAt = -1;
    offset = 0;
    start = vi.fn((offset = 0, startAt?: number) => {
      this.isInitialised = true;
      this.offset = offset;
      this.startedAt = startAt ?? this.context.currentTime;
      this.currentTime = offset;
    });
    pause = vi.fn();
    stop = vi.fn();
    setMasterVolume = vi.fn();
    setPlaybackSpeed = vi.fn();
    destroy = vi.fn();

    contextTimeForSongTime(songTime: number) {
      return this.startedAt < 0
        ? this.context.currentTime
        : this.startedAt + (songTime - this.offset);
    }

    constructor(_trackData: unknown, onEnded: () => void) {
      this.onEnded = onEnded;
      MockAudioPlayerImpl.instances.push(this);
    }
  }

  return { MockAudioPlayer: MockAudioPlayerImpl };
});

vi.mock('../audio-player/factories', () => ({
  playerFactoryForMode: () => (trackData: unknown, onEnded: () => void) =>
    new MockAudioPlayer(trackData, onEnded),
}));

type MockPlayer = {
  onEnded: () => void;
  context: { currentTime: number };
  currentTime: number;
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  setMasterVolume: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const TRACKS: TrackConfig[] = [{ name: 'drums', urls: ['d.ogg'] }];
const CHART = {
  resolution: 480,
  tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
} as unknown as ParsedChart;

function svgEl(): SVGElement {
  return document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  ) as SVGElement;
}

function staveNote(keys: string[], isRest = false): StaveNote {
  const noteHeads = keys.map(() => {
    const el = svgEl();

    el.style.fill = '';

    return { getSVGElement: () => el };
  });

  return {
    isRest: () => isRest,
    getKeys: () => keys,
    getAbsoluteX: () => 0,
    noteHeads,
  } as unknown as StaveNote;
}

function fakeStave(): Stave {
  return {
    getX: () => 0,
    getY: () => 10,
    getWidth: () => 100,
    getHeight: () => 40,
  } as unknown as Stave;
}

function rendered(tick: number, note: StaveNote): RenderedNote {
  return { tick, note };
}

function measureData(
  startTick: number,
  endTick: number,
  notes: RenderedNote[],
  modelNotes: Note[] = [],
): RenderData {
  return {
    stave: fakeStave(),
    measure: {
      startTick,
      endTick,
      notes: modelNotes,
      timeSig: [4, 4],
    } as unknown as Measure,
    renderedNotes: notes,
    yOffset: 0,
  };
}

function hasClass(note: StaveNote, cls: string, head = 0): boolean {
  return (
    note.noteHeads[head].getSVGElement() as SVGElement
  ).classList.contains(cls);
}

function uncolored(note: StaveNote, head = 0): boolean {
  return (
    !hasClass(note, 'vf-note-hit', head) &&
    !hasClass(note, 'vf-note-missed', head)
  );
}

function getPlayerInstances(): MockPlayer[] {
  return MockAudioPlayer.instances as unknown as MockPlayer[];
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

let inputListeners: Set<(event: InputEvent) => void>;

function emitInput(controlId: string, value = 100) {
  inputListeners.forEach((listener) => listener({ controlId, value }));
}

async function setup(
  over: Partial<EngineContext> = {},
  subscribeInput: (listener: (event: InputEvent) => void) => () => void = (
    listener,
  ) => {
    inputListeners.add(listener);

    return () => {
      inputListeners.delete(listener);
    };
  },
) {
  const onEnded = vi.fn();
  const onError = vi.fn();
  const engine = new Engine({
    trackData: TRACKS,
    isDev: false,
    player: 'default',
    subscribeInput,
    onEnded,
    onError,
  });
  const renderData = over.renderData ?? [];

  engine.setSettings({ playheadStyle: 'Cursor' });
  engine.setContext({
    chart: CHART,
    measures: renderData.map((rd) => rd.measure),
    renderData,
    delaySeconds: 0,
    minDurationSeconds: 0,
    countInEnabled: false,
    mapping: {},
    ...over,
  });

  await flush();

  const [player] = getPlayerInstances();

  return { engine, onEnded, player };
}

let frameQueue: FrameRequestCallback[] = [];

function flushFrame() {
  const callbacks = frameQueue;

  frameQueue = [];
  callbacks.forEach((cb) => cb(0));
}

function advanceClockTo(
  player: { context: { currentTime: number } },
  t: number,
) {
  player.context.currentTime = t;
  flushFrame();
}

beforeEach(() => {
  inputListeners = new Set();
  frameQueue = [];
  MockAudioPlayer.instances.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frameQueue.push(cb);

    return frameQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Engine', () => {
  it('records a real MIDI stream into an interrupted practice checkpoint across pause, resume, and reattach', async () => {
    const ipc = installIpcMock();
    const bus = new InputBus([new MidiSource()]);
    const checkpoints: unknown[] = [];
    const notes = ['c/5', 'c/5', 'c/5'].map((key) => staveNote([key]));
    const { engine } = await setup(
      {
        renderData: [
          measureData(
            0,
            1_920,
            [
              rendered(480, notes[0]),
              rendered(960, notes[1]),
              rendered(1_440, notes[2]),
            ],
            [
              { tick: 480, isRest: false, notes: ['c/5'] } as Note,
              { tick: 960, isRest: false, notes: ['c/5'] } as Note,
              { tick: 1_440, isRest: false, notes: ['c/5'] } as Note,
            ],
          ),
        ],
      },
      bus.subscribe,
    );
    const checkpoint = createPracticeAttemptCheckpointController({
      readSeed: () => ({
        songId: 'song-1',
        sessionId: 'dtx-session',
        startedAt: '2026-08-12T04:31:28.096Z',
        chartRevision: 'chart:fixture',
        mode: 'practice',
        difficulty: 'expert',
        playbackSpeed: 0.7,
        positionTick: () => 1_440,
      }),
      evidence: { getAttemptRecords: () => engine.getAttemptRecords() },
      send: (_channel, payload) => checkpoints.push(payload),
    });

    bus.start();
    engine.setMapping({ snare: ['midi:38'] });
    engine.setPlaybackSpeed(0.5);
    engine.playFromTick(0);
    engine.seekSeconds(0.5);
    ipc.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 103,
    });

    engine.pause();
    engine.setPlaybackSpeed(0.7);
    engine.playFromTick(480);
    engine.seekSeconds(1);
    ipc.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 96,
    });

    bus.stop();
    bus.start();
    engine.setPlaybackSpeed(1);
    engine.seekSeconds(1.5);
    ipc.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 91,
    });
    checkpoint.flush();

    expect(checkpoints).toEqual([
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          records: [
            expect.objectContaining({
              tick: 480,
              verdict: 'hit',
              element: 'snare',
            }),
            expect.objectContaining({
              tick: 960,
              verdict: 'hit',
              element: 'snare',
            }),
            expect.objectContaining({
              tick: 1_440,
              verdict: 'hit',
              element: 'snare',
            }),
          ],
        }),
      }),
    ]);

    engine.dispose();
    bus.stop();
  });

  it('delegates transport to playback and reflects state', async () => {
    const { engine, player } = await setup({
      renderData: [measureData(0, 1920, [])],
    });

    engine.playFromTick(0);

    expect(player.start).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().isPlaying).toBe(true);
  });

  it('forwards master volume changes to the player', async () => {
    const { engine, player } = await setup({
      renderData: [measureData(0, 1920, [])],
    });

    engine.setMasterVolume(0.6);

    expect(player.setMasterVolume).toHaveBeenCalledWith(0.6);
  });

  it('forwards the score on ended, counting only non-rest model notes', async () => {
    const { onEnded, player } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [],
          [
            { isRest: false, notes: ['c/5', 'g/5'] } as Note,
            { isRest: true, notes: ['x'] } as Note,
            { isRest: false, notes: ['f/4'] } as Note,
          ],
        ),
      ],
    });

    player.onEnded();

    // Every non-rest model note went unplayed, so all three chart notes
    // (c/5 -> snare, g/5 -> hihat, f/4 -> kick) come back as misses in the
    // per-lane analytics, not just as the aggregate score.
    expect(onEnded).toHaveBeenCalledWith(
      {
        hitNotes: 0,
        falseHits: 0,
        totalNotes: 3,
      },
      expect.objectContaining({
        totalHits: 0,
        totalMisses: 3,
        totalWrong: 0,
        laneAccuracy: [
          { element: 'kick', hits: 0, misses: 1, accuracy: 0 },
          { element: 'snare', hits: 0, misses: 1, accuracy: 0 },
          { element: 'hihat', hits: 0, misses: 1, accuracy: 0 },
        ],
      }),
      expect.any(Array),
    );
  });

  it('positions the cursor element from the current time', async () => {
    const note = staveNote(['c/5'], true);
    const { engine } = await setup({
      renderData: [measureData(0, 1920, [rendered(0, note)])],
    });
    const cursorEl = document.createElement('div');

    engine.setRendererRefs({ cursorEl, highlightEls: [] });
    engine.timeStore.set(1);

    expect(cursorEl.style.display).toBe('');
    expect(cursorEl.style.transform).toBe(
      'translate3d(50px, 10px, 0) translateX(-50%)',
    );
    expect(cursorEl.style.height).toBe('70px');
  });

  it('hides the cursor when the playhead style is not Cursor', async () => {
    const note = staveNote(['c/5'], true);
    const { engine } = await setup({
      renderData: [measureData(0, 1920, [rendered(0, note)])],
    });

    engine.setSettings({ playheadStyle: 'Measure' });

    const cursorEl = document.createElement('div');

    engine.setRendererRefs({ cursorEl, highlightEls: [] });
    engine.timeStore.set(1);

    expect(cursorEl.style.display).toBe('none');
  });

  it('toggles the active measure highlight in Measure mode', async () => {
    const { engine } = await setup({
      renderData: [
        measureData(0, 1920, [rendered(0, staveNote(['c/5'], true))]),
        measureData(1920, 3840, [rendered(1920, staveNote(['c/5'], true))]),
      ],
    });

    engine.setSettings({ playheadStyle: 'Measure' });

    const a = document.createElement('div');
    const b = document.createElement('div');

    engine.setRendererRefs({ cursorEl: undefined, highlightEls: [a, b] });
    engine.timeStore.set(2.1);

    expect(b.style.border).toContain('var(--color-accent-bright)');
    expect(b.style.backgroundColor).toBe('var(--color-accent-soft-bg)');
    expect(a.style.backgroundColor).toBe('');
  });

  it('does not mark unresolved notes missed while the transport is parked', async () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const n2 = staveNote(['e/5']);
    const { engine } = await setup({
      renderData: [
        measureData(0, 1920, [
          rendered(0, n0),
          rendered(240, n1),
          rendered(480, n2),
        ]),
      ],
    });

    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
    });
    engine.timeStore.set(0.5);

    expect(uncolored(n0)).toBe(true);
    expect(uncolored(n1)).toBe(true);
    expect(uncolored(n2)).toBe(true);
  });

  it('registers an input hit and hides the struck note head', async () => {
    const note = staveNote(['c/5']);
    const { engine, onEnded, player } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(480, note)],
          [{ tick: 480, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });

    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
    });
    engine.setMapping({ snare: ['midi:38'] });
    engine.playFromTick(0);
    engine.seekSeconds(0.5);

    emitInput('midi:38');

    expect(hasClass(note, 'vf-note-hit')).toBe(true);

    player.onEnded();
    // The struck snare lane comes back with exactly one hit and no misses
    // in the per-lane analytics, not just in the aggregate score.
    expect(onEnded).toHaveBeenCalledWith(
      expect.objectContaining({ hitNotes: 1, falseHits: 0 }),
      expect.objectContaining({
        totalHits: 1,
        totalMisses: 0,
        totalWrong: 0,
        laneAccuracy: [{ element: 'snare', hits: 1, misses: 0, accuracy: 1 }],
      }),
      expect.any(Array),
    );
  });

  it('forwards a latency setting to the Judge so a late hit is judged on-time', async () => {
    const note = staveNote(['c/5']);
    const { engine, onEnded, player } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(480, note)],
          [{ tick: 480, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });

    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
    });
    engine.setMapping({ snare: ['midi:38'] });
    engine.setLatencyMs(250);
    engine.playFromTick(0);
    engine.seekSeconds(0.75);

    emitInput('midi:38');

    expect(hasClass(note, 'vf-note-hit')).toBe(true);

    player.onEnded();
    // The 250ms compensation lands the hit exactly on the note (0.75s
    // struck - 0.25s compensated = the note's own 0.5s), so the analytics'
    // timing bias comes back at 0ms, not +250ms late - the compensation is
    // visible in the stored stats, not just in the raw hit/miss count.
    expect(onEnded).toHaveBeenCalledWith(
      expect.objectContaining({ hitNotes: 1, falseHits: 0 }),
      expect.objectContaining({
        totalHits: 1,
        totalMisses: 0,
        laneAccuracy: [{ element: 'snare', hits: 1, misses: 0, accuracy: 1 }],
        timingBias: expect.objectContaining({ meanMs: 0, sampleCount: 1 }),
      }),
      expect.any(Array),
    );
  });

  it('forwards a wrong hit to the renderer as a marker in the overlay', async () => {
    const note = staveNote(['c/5']);
    const { engine } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(480, note)],
          [{ tick: 480, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });
    const overlayEl = document.createElement('div');

    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
      overlayEl,
    });
    engine.setMapping({ crash: ['midi:49'] });
    engine.playFromTick(0);
    engine.seekSeconds(0.5);

    emitInput('midi:49');

    expect(overlayEl.querySelector('.vf-wronghit-marker')).not.toBeNull();
    expect(engine.getRunRecords()).toEqual([
      expect.objectContaining({
        tick: 480,
        element: 'crash',
        verdict: 'wrong',
        expectedTick: 480,
        actualTick: 480,
        expectedElement: 'snare',
        actualElement: 'crash',
      }),
    ]);
  });

  it('prunes a false hit made ahead of a seek when seeking back', async () => {
    const note = staveNote(['c/5']);
    const { engine, onEnded, player } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(480, note)],
          [{ tick: 480, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });

    engine.setMapping({ crash: ['midi:49'] });
    engine.playFromTick(0);
    engine.seekSeconds(0.5);
    emitInput('midi:49');
    engine.seekSeconds(0.1);

    player.onEnded();
    // Seeking back to before the wrong hit's tick prunes it from the
    // practice-stats records too (mirroring Judge.rewindTo's own cutoff -
    // see the comment on Engine's onSeek handler), so the analytics show
    // zero wrong hits and the still-unplayed snare note comes back as a
    // miss, not a phantom wrong hit surviving the seek.
    expect(onEnded).toHaveBeenCalledWith(
      expect.objectContaining({ falseHits: 0 }),
      expect.objectContaining({
        totalWrong: 0,
        totalMisses: 1,
        wrongHitCounts: [],
        laneAccuracy: [{ element: 'snare', hits: 0, misses: 1, accuracy: 0 }],
      }),
      expect.any(Array),
    );
  });

  it('fires onMiss only after Judge closes the late-hit window', async () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const n2 = staveNote(['e/5']);
    const modelNotes = [
      { tick: 0, isRest: false, notes: ['c/5'] } as Note,
      { tick: 240, isRest: false, notes: ['d/5'] } as Note,
      { tick: 480, isRest: false, notes: ['e/5'] } as Note,
    ];
    const { engine } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(0, n0), rendered(240, n1), rendered(480, n2)],
          modelNotes,
        ),
      ],
    });
    const missed: number[] = [];

    engine.onMiss((tick) => missed.push(tick));
    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
    });
    engine.playFromTick(0);
    engine.timeStore.set(0.55);

    expect(missed).toEqual([0, 240]);
    expect(hasClass(n0, 'vf-note-missed')).toBe(true);
    expect(hasClass(n1, 'vf-note-missed')).toBe(true);
    expect(uncolored(n2)).toBe(true);
  });

  it('does not fabricate a miss when a forward seek skips a note', async () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const { engine } = await setup({
      renderData: [measureData(0, 1920, [rendered(0, n0), rendered(960, n1)])],
    });
    const missed: number[] = [];

    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
    });
    engine.onMiss((tick) => missed.push(tick));
    engine.playFromTick(0);
    // n1 sits at tick 960 (1.0s at this fixture's 120bpm/480 resolution),
    // so seeking to 1.1s makes n1 active and walks n0 as passed.
    engine.seekSeconds(1.1);

    expect(uncolored(n0)).toBe(true);
    expect(missed).toEqual([]);
  });

  it('accepts a late Practice hit after the next visual note activates without a false miss', async () => {
    const snare = staveNote(['c/5']);
    const tom = staveNote(['d/5']);
    const { engine } = await setup({
      hitToleranceSeconds: 0.16,
      mapping: { snare: ['midi:38'] },
      renderData: [
        measureData(
          0,
          1920,
          [rendered(0, snare), rendered(96, tom)],
          [
            { tick: 0, isRest: false, notes: ['c/5'] } as Note,
            { tick: 96, isRest: false, notes: ['d/5'] } as Note,
          ],
        ),
      ],
    });
    const missed: number[] = [];

    engine.onMiss((tick) => missed.push(tick));
    engine.setRendererRefs({ cursorEl: undefined, highlightEls: [] });
    engine.playFromTick(0);
    engine.timeStore.set(0.12);

    expect(uncolored(snare)).toBe(true);
    expect(missed).toEqual([]);

    emitInput('midi:38');

    expect(hasClass(snare, 'vf-note-hit')).toBe(true);
    expect(hasClass(snare, 'vf-note-missed')).toBe(false);
    expect(missed).toEqual([]);
  });

  it('does not emit an authoritative miss judgement for a forward seek', async () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const { engine } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(0, n0), rendered(960, n1)],
          [
            { tick: 0, isRest: false, notes: ['c/5'] } as Note,
            { tick: 960, isRest: false, notes: ['d/5'] } as Note,
          ],
        ),
      ],
    });
    const judgements: ResolvedJudgement[] = [];

    engine.onJudgement((judgement) => judgements.push(judgement));
    engine.playFromTick(0);
    engine.seekSeconds(1.1);

    expect(judgements).toEqual([]);
  });

  it('emits a resolved miss during ordinary play and stores it once', async () => {
    const note = staveNote(['c/5']);
    const { engine, onEnded, player } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(480, note)],
          [{ tick: 480, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });
    const judgements: ResolvedJudgement[] = [];

    engine.onJudgement((judgement) => judgements.push(judgement));
    engine.playFromTick(0);
    engine.timeStore.set(0.61);

    expect(judgements).toEqual([
      expect.objectContaining({
        id: 'note:480:c/5',
        verdict: 'miss',
        expectedTick: 480,
        expectedElement: 'snare',
      }),
    ]);

    player.onEnded();
    expect(onEnded).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ totalMisses: 1 }),
      expect.arrayContaining([
        expect.objectContaining({
          tick: 480,
          element: 'snare',
          verdict: 'miss',
        }),
      ]),
    );
  });

  it('buffers a possible kit command, releases failed patterns, and discards completed commands', async () => {
    const snare = staveNote(['c/5']);
    const { engine } = await setup({
      mapping: { kick: ['midi:36'], crash: ['midi:49'] },
      renderData: [
        measureData(
          0,
          1920,
          [rendered(0, snare)],
          [{ tick: 0, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });
    const judgements: ResolvedJudgement[] = [];

    engine.onJudgement((judgement) => judgements.push(judgement));
    engine.playFromTick(0);

    engine.beginControlGestureCapture();
    emitInput('midi:36');

    expect(engine.getAttemptRecords()).toEqual([]);
    expect(judgements).toEqual([]);

    engine.cancelControlGestureCapture();

    expect(engine.getAttemptRecords()).toEqual([
      expect.objectContaining({ element: 'kick', verdict: 'wrong' }),
    ]);
    expect(judgements).toEqual([
      expect.objectContaining({ actualElement: 'kick', verdict: 'wrong' }),
    ]);

    engine.beginControlGestureCapture();
    emitInput('midi:49');

    expect(engine.getAttemptRecords()).toHaveLength(1);
    expect(judgements).toHaveLength(1);

    engine.completeControlGestureCapture();

    expect(engine.getAttemptRecords()).toHaveLength(1);
    expect(judgements).toHaveLength(1);
  });

  it('returns an exact rewind boundary and removes a near-window command at 2x from score and analytics', async () => {
    const snare = staveNote(['c/5']);
    const { engine, onEnded, player } = await setup({
      mapping: { kick: ['midi:36'], crash: ['midi:49'] },
      renderData: [
        measureData(
          0,
          1920,
          [rendered(1440, snare)],
          [{ tick: 1440, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });

    engine.setPlaybackSpeed(2);
    engine.playFromTick(0);
    engine.beginControlGestureCapture();

    emitInput('midi:36');
    engine.timeStore.set(0.72);
    emitInput('midi:49');
    engine.timeStore.set(1.44);
    emitInput('midi:36');
    engine.timeStore.set(2.16);
    emitInput('midi:49');

    const rewindSeconds = engine.completeControlGestureCapture();

    expect(rewindSeconds).toBe(0);
    expect(engine.getRunRecords()).toEqual([]);
    expect(engine.getAttemptRecords()).toEqual([]);

    engine.pause();
    engine.seekSeconds(rewindSeconds!);
    player.onEnded();

    expect(onEnded).toHaveBeenCalledWith(
      expect.objectContaining({ falseHits: 0, hitNotes: 0 }),
      expect.objectContaining({ totalWrong: 0 }),
      expect.not.arrayContaining([
        expect.objectContaining({
          verdict: 'wrong',
          element: expect.stringMatching(/kick|crash/),
        }),
      ]),
    );
  });

  it('finalizes tail judgements before notifying tutor and SongView run listeners', async () => {
    const note = staveNote(['c/5']);
    const { engine, onEnded, player } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(1440, note)],
          [{ tick: 1440, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });
    const order: string[] = [];

    engine.onJudgement(() => order.push('judgement'));
    engine.onRunEnding(() => {
      order.push('run-ending');

      return true;
    });
    onEnded.mockImplementation(() => order.push('song-view'));
    player.onEnded();

    expect(order).toEqual(['judgement', 'run-ending', 'song-view']);
  });

  it('defers the immutable summary when a run-ending listener starts recovery', async () => {
    const { engine, onEnded, player } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [],
          [{ tick: 1440, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });
    const off = engine.onRunEnding(() => false);

    player.onEnded();
    expect(onEnded).not.toHaveBeenCalled();

    off();
    player.onEnded();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('does not fire onMiss when a seek rewinds the active note backward', async () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const { engine } = await setup({
      renderData: [measureData(0, 1920, [rendered(0, n0), rendered(960, n1)])],
    });
    const missed: number[] = [];

    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
    });
    engine.playFromTick(0);
    engine.timeStore.set(1.1); // normal forward advance past n0, before subscribing below
    engine.onMiss((tick) => missed.push(tick));
    engine.seekSeconds(0.1); // rewinds the active note back to n0 - a real backward walk

    expect(missed).toEqual([]);
  });

  it('fires onReset whenever a seek/restart rewinds Judge state', async () => {
    const { engine } = await setup();
    const resets: number[] = [];

    engine.onReset(() => resets.push(resets.length));
    engine.playFromTick(0);
    expect(resets).toHaveLength(1);

    engine.seekSeconds(0.5);
    expect(resets).toHaveLength(2);
  });

  it('announces seek start before forwarding the completed reset', async () => {
    const { engine } = await setup();
    const events: string[] = [];

    engine.onSeekStart(() => events.push('start'));
    engine.onReset(() => events.push('reset'));
    engine.seekSeconds(0.5);

    expect(events).toEqual(['start', 'reset']);
  });

  it('forwards natural loop restarts to remediation listeners', async () => {
    const { engine, player } = await setup();
    const loopRestarts: number[] = [];

    engine.onLoopRestart(() => loopRestarts.push(loopRestarts.length));
    engine.setLoopRegion({ startTick: 0, endTick: 1920 });
    engine.playFromTick(0);
    player.currentTime = 3;
    flushFrame();

    expect(loopRestarts).toHaveLength(1);
  });

  it('forwards judge hit/false-hit events to external onHit/onFalseHit subscribers', async () => {
    const note = staveNote(['c/5']);
    const { engine } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(480, note)],
          [{ tick: 480, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });
    const hits: unknown[] = [];
    const falseHits: unknown[] = [];

    engine.onHit((pos) => hits.push(pos));
    engine.onFalseHit((record) => falseHits.push(record));
    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
    });
    engine.setMapping({ snare: ['midi:38'], crash: ['midi:49'] });
    engine.playFromTick(0);
    engine.seekSeconds(0.5);

    emitInput('midi:38');
    emitInput('midi:49');

    expect(hits).toHaveLength(1);
    expect(falseHits).toHaveLength(1);
  });

  it('exposes defensive in-progress evidence snapshots for checkpoint persistence', async () => {
    const note = staveNote(['c/5']);
    const { engine } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(480, note)],
          [{ tick: 480, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
    });

    engine.setMapping({ snare: ['midi:38'] });
    engine.playFromTick(0);
    engine.seekSeconds(0.5);
    emitInput('midi:38');

    const firstSnapshot = engine.getRunRecords();

    expect(firstSnapshot).toEqual([
      expect.objectContaining({ tick: 480, element: 'snare', verdict: 'hit' }),
    ]);

    firstSnapshot[0].tick = 999;

    expect(engine.getRunRecords()).toEqual([
      expect.objectContaining({ tick: 480, element: 'snare', verdict: 'hit' }),
    ]);
    expect(engine.getAttemptRecords()).toEqual([
      expect.objectContaining({ tick: 480, element: 'snare', verdict: 'hit' }),
    ]);

    engine.seekSeconds(0);
    engine.seekSeconds(0.5);
    emitInput('midi:38');

    expect(engine.getRunRecords()).toHaveLength(1);
    expect(engine.getAttemptRecords()).toHaveLength(2);

    const attemptSnapshot = engine.getAttemptRecords();

    attemptSnapshot[0].tick = 777;
    expect(engine.getAttemptRecords()[0].tick).toBe(480);
  });

  it('does not register input hits before playback starts', async () => {
    const note = staveNote(['c/5']);
    const { engine } = await setup({
      renderData: [measureData(0, 1920, [rendered(480, note)])],
    });

    engine.setSettings({ playheadStyle: 'Cursor' });
    engine.setMapping({ snare: ['midi:38'] });
    engine.timeStore.set(1);

    emitInput('midi:38');

    expect(uncolored(note)).toBe(true);
  });

  it('does not score input during the count-in, only once playing', async () => {
    const note = staveNote(['c/5']);
    const { engine, player } = await setup({
      renderData: [
        measureData(
          0,
          1920,
          [rendered(480, note)],
          [{ tick: 480, isRest: false, notes: ['c/5'] } as Note],
        ),
      ],
      countInEnabled: true,
    });

    engine.setRendererRefs({
      cursorEl: document.createElement('div'),
      highlightEls: [],
    });
    engine.setMapping({ snare: ['midi:38'] });

    engine.playFromTick(0);
    engine.timeStore.set(0.5);
    emitInput('midi:38');

    expect(uncolored(note)).toBe(true);

    advanceClockTo(player, 5);
    flushFrame();
    engine.timeStore.set(0.5);
    emitInput('midi:38');

    expect(hasClass(note, 'vf-note-hit')).toBe(true);
  });

  it('stops scoring input after dispose', async () => {
    const { engine } = await setup();

    expect(inputListeners.size).toBe(1);

    engine.dispose();

    expect(inputListeners.size).toBe(0);
  });

  it('destroys the player on dispose', async () => {
    const { engine, player } = await setup();

    engine.dispose();

    expect(player.destroy).toHaveBeenCalledTimes(1);
  });
});
