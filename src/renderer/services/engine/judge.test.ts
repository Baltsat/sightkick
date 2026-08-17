import { describe, expect, it, vi } from 'vitest';
import { Measure, Note, ParsedChart } from '../../../chart-parser/types';
import { InputEvent } from '../../input/types';
import { ticksToSeconds } from '../../../chart-parser/timing';
import { Judge } from './judge';
import {
  JudgeContext,
  JudgeHitHandler,
  ResolvedJudgementHandler,
} from './types';

const CHART = {
  resolution: 480,
  tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
} as unknown as ParsedChart;

function note(
  keys: string[],
  tick: number,
  marks: { isRest?: boolean; accents?: string[]; ghosts?: string[] } = {},
): Note {
  return {
    notes: keys,
    tick,
    isRest: marks.isRest ?? false,
    accents: marks.accents,
    ghosts: marks.ghosts,
  } as unknown as Note;
}

function measure(
  notes: Note[],
  bounds: { startTick: number; endTick: number } = {
    startTick: 0,
    endTick: Number.MAX_SAFE_INTEGER,
  },
): Measure {
  return { notes, ...bounds } as unknown as Measure;
}

function hit(controlId: string, value = 100): InputEvent {
  return { controlId, value };
}

function setup(
  overrides: Partial<JudgeContext> = {},
  options: { tick?: number; enabled?: boolean } = {},
) {
  const onHit = vi.fn<JudgeHitHandler>();
  const engine = new Judge();

  engine.setContext({
    chart: CHART,
    measures: [],
    mapping: { snare: ['midi:38'] },
    ...overrides,
  });
  engine.setEnabled(options.enabled ?? true);
  engine.setTick(options.tick ?? 0);
  engine.onHit(onHit);

  return { engine, onHit };
}

describe('Judge', () => {
  it('registers a correct hit and notifies onHit with the matched position', () => {
    const { engine, onHit } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.isHit(480, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
    expect(onHit).toHaveBeenCalledWith({ measureIdx: 0, noteIdx: 0 }, ['c/5'], {
      tick: 480,
      timeSeconds: ticksToSeconds(480, CHART.resolution, CHART.tempos),
      deltaMs: 0,
      element: 'snare',
      velocity: 100,
    });
  });

  it('emits an authoritative hit judgement when a mapped note is accepted', () => {
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.onJudgement(onJudgement);
    engine.handleInput(hit('midi:38'));

    expect(onJudgement).toHaveBeenCalledWith({
      id: 'note:480:c/5',
      verdict: 'hit',
      expectedTick: 480,
      actualTick: 480,
      expectedElement: 'snare',
      actualElement: 'snare',
      measureIndex: 0,
      deltaMs: 0,
      velocity: 100,
      scoreable: true,
    });
  });

  it('attributes a hit to the note actually matched, not the first lane sharing the struck MIDI control', () => {
    const onHit = vi.fn<JudgeHitHandler>();
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup(
      {
        measures: [measure([note(['a/5'], 480)])],
        // 'ride' still on its DTX default, 'crash' just Learned onto the
        // same physical control - a normal, plausible remap collision.
        mapping: { ride: ['midi:51'], crash: ['midi:51'] },
      },
      { tick: 480 },
    );

    engine.onHit(onHit);
    engine.onJudgement(onJudgement);
    engine.handleInput(hit('midi:51'));

    expect(engine.isHit(480, 'a/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
    expect(onHit).toHaveBeenCalledWith(
      { measureIdx: 0, noteIdx: 0 },
      ['a/5'],
      expect.objectContaining({ element: 'crash' }),
    );
    expect(onJudgement).toHaveBeenCalledWith(
      expect.objectContaining({
        verdict: 'hit',
        expectedElement: 'crash',
        actualElement: 'crash',
      }),
    );
  });

  it('resolves a miss only after the late-hit tolerance window closes', () => {
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup({
      measures: [
        measure([note(['c/5'], 480)], { startTick: 0, endTick: 1920 }),
      ],
    });

    engine.onJudgement(onJudgement);
    engine.resolveThrough(575);
    expect(onJudgement).not.toHaveBeenCalled();

    engine.resolveThrough(577);
    expect(onJudgement).toHaveBeenCalledTimes(1);
    expect(onJudgement).toHaveBeenCalledWith({
      id: 'note:480:c/5',
      verdict: 'miss',
      expectedTick: 480,
      expectedElement: 'snare',
      measureIndex: 0,
      scoreable: true,
    });

    engine.resolveThrough(900);
    expect(onJudgement).toHaveBeenCalledTimes(1);
  });

  it('resolves every unjudged chart head when a run ends inside the tail tolerance', () => {
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup({
      measures: [
        measure([note(['c/5'], 480), note(['f/4'], 960)], {
          startTick: 0,
          endTick: 1920,
        }),
      ],
    });

    engine.onJudgement(onJudgement);
    engine.resolveThrough(500);
    engine.resolveAll();

    expect(onJudgement).toHaveBeenCalledTimes(2);
    expect(onJudgement).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'note:960:f/4',
        verdict: 'miss',
        expectedElement: 'kick',
      }),
    );
  });

  it('re-arms resolved judgements when practice rewinds across a note', () => {
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup({
      measures: [
        measure([note(['c/5'], 480)], { startTick: 0, endTick: 1920 }),
      ],
    });

    engine.onJudgement(onJudgement);
    engine.resolveThrough(600);
    engine.rewindTo(0);
    engine.resolveThrough(600);

    expect(onJudgement).toHaveBeenCalledTimes(2);
  });

  it('registers a hit using the remapped control after a remap', () => {
    const measures = [measure([note(['c/5'], 480)])];
    const { engine } = setup(
      { measures, mapping: { snare: ['midi:38'] } },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:40'));
    expect(engine.hitCount).toBe(0);

    engine.setContext({
      chart: CHART,
      measures,
      mapping: { snare: ['midi:40'] },
    });
    engine.handleInput(hit('midi:40'));
    expect(engine.isHit(480, 'c/5')).toBe(true);

    engine.handleInput(hit('midi:38'));
    expect(engine.hitCount).toBe(1);
    expect(engine.falseHitCount).toBe(0);
  });

  it('ignores input with zero value', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38', 0));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(0);
  });

  it('ignores unmapped controls without counting them as misses', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:99'));

    expect(engine.falseHitCount).toBe(0);
    expect(engine.hitCount).toBe(0);
  });

  it('counts a miss when no note is near the playhead', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 5000)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(1);
  });

  it('counts a miss when the nearby note belongs to a different drum', () => {
    const { engine } = setup(
      {
        measures: [measure([note(['f/4'], 480)])],
        mapping: { snare: ['midi:38'], kick: ['midi:36'] },
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.falseHitCount).toBe(1);
    expect(engine.hitCount).toBe(0);
  });

  it('counts a repeat hit on the same note as a miss', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));
    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(1);
    expect(engine.falseHitCount).toBe(1);
  });

  it('counts every simultaneous wrong hit at the same tick', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 5000)], { startTick: 0, endTick: 10000 }),
        ],
        mapping: {
          crash: ['midi:49'],
          ride: ['midi:51'],
          tom1: ['midi:50'],
        },
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:49'));
    engine.handleInput(hit('midi:51'));
    engine.handleInput(hit('midi:50'));

    expect(engine.falseHitCount).toBe(3);
  });

  it('never wipes false hits on backward setTick, regardless of magnitude', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 5000)], { startTick: 0, endTick: 10000 }),
        ],
        mapping: { crash: ['midi:49'] },
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:49'));
    expect(engine.falseHitCount).toBe(1);

    engine.setTick(1);
    engine.setTick(490);
    engine.handleInput(hit('midi:49'));

    expect(engine.falseHitCount).toBe(2);
  });

  it('drops only false hits ahead of a genuine rewind, keeping earlier ones', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 5000)], { startTick: 0, endTick: 10000 }),
        ],
        mapping: { crash: ['midi:49'] },
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:49'));
    engine.setTick(2000);
    engine.handleInput(hit('midi:49'));
    expect(engine.falseHitCount).toBe(2);

    engine.rewindTo(1000);

    expect(engine.falseHitCount).toBe(1);
  });

  it('keeps a recorded hit through backward setTick, regardless of magnitude', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));
    expect(engine.isHit(480, 'c/5')).toBe(true);

    engine.setTick(1);

    expect(engine.isHit(480, 'c/5')).toBe(true);
    expect(engine.hitCount).toBe(1);
  });

  it('does nothing while the current tick is undefined', () => {
    const { engine } = setup({ measures: [measure([note(['c/5'], 480)])] });

    engine.setTick(undefined);
    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(0);
  });

  it('clears hits ahead of the playhead when rewinding', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));
    expect(engine.isHit(480, 'c/5')).toBe(true);

    engine.rewindTo(100);

    expect(engine.isHit(480, 'c/5')).toBe(false);
    expect(engine.falseHitCount).toBe(0);
  });

  it('preserves hit state when the same chart re-renders', () => {
    const measures = [measure([note(['c/5'], 480)])];
    const { engine } = setup({ measures }, { tick: 480 });

    engine.handleInput(hit('midi:38'));
    expect(engine.hitCount).toBe(1);

    engine.setContext({
      chart: CHART,
      measures: [measure([note(['c/5'], 480)])],
      mapping: { snare: ['midi:38'] },
    });

    expect(engine.hitCount).toBe(1);
    expect(engine.isHit(480, 'c/5')).toBe(true);
  });

  it('clears all hit state when the chart changes', () => {
    const measures = [measure([note(['c/5'], 480)])];
    const { engine } = setup({ measures }, { tick: 480 });

    engine.handleInput(hit('midi:38'));
    expect(engine.hitCount).toBe(1);

    const nextChart = {
      resolution: 480,
      tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
    } as unknown as ParsedChart;

    engine.setContext({
      chart: nextChart,
      measures,
      mapping: { snare: ['midi:38'] },
    });

    expect(engine.hitCount).toBe(0);
  });

  it('picks the closest matching note among several', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 530), note(['c/5'], 490)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.isHit(490, 'c/5')).toBe(true);
    expect(engine.isHit(530, 'c/5')).toBe(false);
  });

  it('matches an early Practice strike to the nearest unhit repeated head', () => {
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup(
      {
        measures: [
          measure(
            [note(['c/5'], 480), note(['c/5'], 600), note(['c/5'], 720)],
            { startTick: 0, endTick: 1920 },
          ),
        ],
        hitToleranceSeconds: 0.16,
        preferUnhitNotes: true,
      },
      { tick: 480 },
    );

    engine.onJudgement(onJudgement);
    engine.handleInput(hit('midi:38'));
    // A DTX-style early second strike: 60 ticks (62.5 ms) from both heads.
    // Stable tie-breaking would choose the already-hit 480 head unless
    // Practice excludes consumed heads while finding its nearest candidate.
    engine.setTick(540);
    engine.handleInput(hit('midi:38'));
    engine.setTick(659);
    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(3);
    expect(engine.falseHitCount).toBe(0);
    expect(engine.isHit(480, 'c/5')).toBe(true);
    expect(engine.isHit(600, 'c/5')).toBe(true);
    expect(engine.isHit(720, 'c/5')).toBe(true);
    expect(onJudgement.mock.calls.map(([judgement]) => judgement.id)).toEqual([
      'note:480:c/5',
      'note:600:c/5',
      'note:720:c/5',
    ]);

    engine.resolveAll();

    expect(onJudgement).toHaveBeenCalledTimes(3);
  });

  it.each([
    { strikeTick: 566, accepted: true },
    { strikeTick: 565, accepted: false },
  ])(
    'keeps the Practice repeat window boundary at tick $strikeTick',
    ({ strikeTick, accepted }) => {
      const { engine } = setup(
        {
          measures: [measure([note(['c/5'], 480), note(['c/5'], 720)])],
          hitToleranceSeconds: 0.16,
          preferUnhitNotes: true,
        },
        { tick: 480 },
      );

      engine.handleInput(hit('midi:38'));
      engine.setTick(strikeTick);
      engine.handleInput(hit('midi:38'));

      expect(engine.isHit(720, 'c/5')).toBe(accepted);
      expect(engine.hitCount).toBe(accepted ? 2 : 1);
      expect(engine.falseHitCount).toBe(accepted ? 0 : 1);
    },
  );

  it('keeps Perform nearest-note duplicate semantics for dense repeats', () => {
    const { engine } = setup(
      {
        measures: [measure([note(['c/5'], 480), note(['c/5'], 600)])],
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));
    engine.setTick(539);
    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(1);
    expect(engine.falseHitCount).toBe(1);
    expect(engine.isHit(600, 'c/5')).toBe(false);
  });

  it('records a true Practice duplicate when no unhit same-lane head is in range', () => {
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup(
      {
        measures: [measure([note(['c/5'], 480)])],
        hitToleranceSeconds: 0.16,
        preferUnhitNotes: true,
      },
      { tick: 480 },
    );

    engine.onJudgement(onJudgement);
    engine.handleInput(hit('midi:38'));
    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(1);
    expect(engine.falseHitCount).toBe(1);
    expect(onJudgement.mock.calls.map(([judgement]) => judgement.id)).toEqual([
      'note:480:c/5',
      'wrong:1',
    ]);

    engine.resolveAll();

    expect(onJudgement).toHaveBeenCalledTimes(2);
  });

  it('keeps a wrong-lane Practice strike wrong beside an unhit dense repeat', () => {
    const { engine } = setup(
      {
        measures: [measure([note(['c/5'], 480), note(['c/5'], 600)])],
        mapping: { snare: ['midi:38'], tom1: ['midi:48'] },
        hitToleranceSeconds: 0.16,
        preferUnhitNotes: true,
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));
    engine.setTick(539);
    engine.handleInput(hit('midi:48'));

    expect(engine.hitCount).toBe(1);
    expect(engine.falseHitCount).toBe(1);
    expect(engine.isHit(600, 'c/5')).toBe(false);
  });

  it('skips rest notes when matching', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 480, { isRest: true }), note(['f/4'], 9000)], {
            startTick: 0,
            endTick: 10000,
          }),
        ],
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(1);
  });

  it('ignores hits when not enabled', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480, enabled: false },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(0);
  });

  it('resumes registering hits after enabled transitions to true', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480, enabled: false },
    );

    engine.handleInput(hit('midi:38'));
    expect(engine.hitCount).toBe(0);

    engine.setEnabled(true);
    engine.handleInput(hit('midi:38'));

    expect(engine.isHit(480, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
  });

  it('rejects a soft hit on an accented note as a miss', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480, { accents: ['c/5'] })])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38', 80));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(1);
  });

  it('accepts a hard hit on an accented note', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480, { accents: ['c/5'] })])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38', 110));

    expect(engine.isHit(480, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
  });

  it('rejects a loud hit on a ghost note as a miss', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480, { ghosts: ['c/5'] })])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38', 80));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(1);
  });

  it('accepts a soft hit on a ghost note', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480, { ghosts: ['c/5'] })])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38', 30));

    expect(engine.isHit(480, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
  });

  it('does not also resolve a wrong-dynamic strike as a later miss once the late-hit window closes', () => {
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480, { accents: ['c/5'] })])] },
      { tick: 480 },
    );

    engine.onJudgement(onJudgement);
    // Right pad, right time, too soft for the accent - already scored as
    // one 'wrong' judgement by maybeRecordFalseHit.
    engine.handleInput(hit('midi:38', 80));

    expect(engine.falseHitCount).toBe(1);

    onJudgement.mockClear();
    engine.resolveAll();

    // One physical strike, one scoreable outcome: the late-hit window
    // closing must not fabricate a second scoreable judgement (a 'miss')
    // for the exact same note.
    expect(onJudgement).not.toHaveBeenCalled();
    expect(engine.isHit(480, 'c/5')).toBe(false);
  });

  it('does not count a false hit inside a fully silent measure toward the score', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 480, { isRest: true })], {
            startTick: 0,
            endTick: 1920,
          }),
        ],
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(0);
  });

  it('still shows a false hit made inside a fully silent measure, since it was really struck', () => {
    const onFalseHit = vi.fn();
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 480, { isRest: true })], {
            startTick: 0,
            endTick: 1920,
          }),
        ],
      },
      { tick: 480 },
    );

    engine.onFalseHit(onFalseHit);
    engine.handleInput(hit('midi:38'));

    expect(onFalseHit).toHaveBeenCalledWith(
      expect.objectContaining({ tick: 480, controlId: 'midi:38' }),
    );
  });

  it('still counts a false hit in a measure that contains notes', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 5000)], { startTick: 0, endTick: 10000 }),
        ],
      },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.falseHitCount).toBe(1);
  });

  it('ignores hi-hat pedal false hits before they can affect score or coach evidence', () => {
    const onFalseHit = vi.fn();
    const onJudgement = vi.fn<ResolvedJudgementHandler>();
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 5000)], { startTick: 0, endTick: 10000 }),
        ],
        mapping: { hihat: ['midi:42', 'midi:44'] },
      },
      { tick: 480 },
    );

    engine.onFalseHit(onFalseHit);
    engine.onJudgement(onJudgement);
    engine.handleInput(hit('midi:44'));

    expect(engine.falseHitCount).toBe(0);
    expect(onFalseHit).not.toHaveBeenCalled();
    expect(onJudgement).not.toHaveBeenCalled();

    engine.handleInput(hit('midi:42'));

    expect(engine.falseHitCount).toBe(1);
    expect(onFalseHit).toHaveBeenCalledOnce();
    expect(onJudgement).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'wrong', actualElement: 'hihat' }),
    );
  });

  it('does not count or show a false hit past the last measure', () => {
    const onFalseHit = vi.fn();
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 480)], { startTick: 0, endTick: 1920 }),
        ],
      },
      { tick: 5000 },
    );

    engine.onFalseHit(onFalseHit);
    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(0);
    // Genuinely outside the chart's bounds (not just a silent region),
    // there is nowhere to anchor a marker, so it isn't shown either.
    expect(onFalseHit).not.toHaveBeenCalled();
  });

  it('still registers a late hit on the final note past the last measure', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 1900)], { startTick: 0, endTick: 1920 }),
        ],
      },
      { tick: 1950 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.isHit(1900, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
  });

  it('counts a false hit played alongside a correct early hit into a silent measure', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 1000, { isRest: true })], {
            startTick: 0,
            endTick: 1920,
          }),
          measure([note(['c/5'], 1950)], { startTick: 1920, endTick: 3840 }),
        ],
        mapping: { snare: ['midi:38'], tom1: ['midi:48'] },
      },
      { tick: 1900 },
    );

    engine.handleInput(hit('midi:38'));
    engine.handleInput(hit('midi:48'));

    expect(engine.isHit(1950, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(1);
  });

  it('registers an early hit on a note in the next measure from a silent measure', () => {
    const { engine } = setup(
      {
        measures: [
          measure([note(['c/5'], 1000, { isRest: true })], {
            startTick: 0,
            endTick: 1920,
          }),
          measure([note(['c/5'], 1950)], { startTick: 1920, endTick: 3840 }),
        ],
      },
      { tick: 1900 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.isHit(1950, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
  });

  it('judges a hit arriving late by exactly the latency offset as on-time', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 720 },
    );

    engine.setLatencyMs(250);
    engine.handleInput(hit('midi:38'));

    expect(engine.isHit(480, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
  });

  it('misses the same late hit when latency compensation is left at zero', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 720 },
    );

    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(1);
  });

  it('resets latency compensation back to none when set to zero', () => {
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 720 },
    );

    engine.setLatencyMs(250);
    engine.setLatencyMs(0);
    engine.handleInput(hit('midi:38'));

    expect(engine.hitCount).toBe(0);
    expect(engine.falseHitCount).toBe(1);
  });

  it('scales input-latency compensation by the active playback speed, not a flat wall-clock offset', () => {
    // Note at 480 ticks = 0.5s. At 2x, a 200ms hardware-delay calibration
    // is 400ms of drifted song-time (200ms * 2), not a flat 200ms - a real
    // on-time strike reports its raw (uncompensated) position at
    // 0.5 + 0.4 = 0.9s (864 ticks), not 0.7s.
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 864 },
    );

    engine.setLatencyMs(200);
    engine.setPlaybackSpeed(2);
    engine.handleInput(hit('midi:38'));

    expect(engine.isHit(480, 'c/5')).toBe(true);
    expect(engine.falseHitCount).toBe(0);
  });

  it('notifies an onFalseHit listener with the tick, controlId, resolved element and time of a wrong hit', () => {
    const onFalseHit = vi.fn();
    const { engine } = setup(
      {
        measures: [measure([note(['f/4'], 480)])],
        mapping: { snare: ['midi:38'], kick: ['midi:36'] },
      },
      { tick: 480 },
    );

    engine.onFalseHit(onFalseHit);
    engine.handleInput(hit('midi:38'));

    expect(onFalseHit).toHaveBeenCalledWith({
      tick: 480,
      controlId: 'midi:38',
      element: 'snare',
      timeSeconds: expect.any(Number),
      expectedTick: 480,
      actualTick: 480,
      expectedElement: 'kick',
      actualElement: 'snare',
      scoreable: true,
    });
  });

  it('notifies an onFalseHit listener for a repeat hit on an already-hit note', () => {
    const onFalseHit = vi.fn();
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.handleInput(hit('midi:38'));
    engine.onFalseHit(onFalseHit);
    engine.handleInput(hit('midi:38'));

    expect(onFalseHit).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 480,
        controlId: 'midi:38',
        element: 'snare',
      }),
    );
  });

  it('does not notify onFalseHit for an unmapped controlId', () => {
    const onFalseHit = vi.fn();
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 480)])] },
      { tick: 480 },
    );

    engine.onFalseHit(onFalseHit);
    engine.handleInput(hit('midi:99'));

    expect(onFalseHit).not.toHaveBeenCalled();
  });

  it('stops notifying a removed false-hit listener', () => {
    const onFalseHit = vi.fn();
    const { engine } = setup(
      { measures: [measure([note(['c/5'], 5000)])] },
      { tick: 480 },
    );
    const unsubscribe = engine.onFalseHit(onFalseHit);

    unsubscribe();
    engine.handleInput(hit('midi:38'));

    expect(onFalseHit).not.toHaveBeenCalled();
    expect(engine.falseHitCount).toBe(1);
  });

  it('stops notifying a removed hit listener', () => {
    const onHit = vi.fn<JudgeHitHandler>();
    const engine = new Judge();

    engine.setContext({
      chart: CHART,
      measures: [measure([note(['c/5'], 480)])],
      mapping: { snare: ['midi:38'] },
    });
    engine.setEnabled(true);
    engine.setTick(480);

    const unsubscribe = engine.onHit(onHit);

    unsubscribe();
    engine.handleInput(hit('midi:38'));

    expect(onHit).not.toHaveBeenCalled();
    expect(engine.isHit(480, 'c/5')).toBe(true);
  });
});
