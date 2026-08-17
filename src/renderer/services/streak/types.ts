/**
 * The in-play combo streak ("STREAK/RAGE mode"): consecutive correct hits
 * during a single run, escalating through named stages the longer it runs
 * unbroken. This is deliberately a different thing from
 * `services/streaks` (plural) - the day-over-day *practice* streak that
 * powers `GamificationHeaderStrip`/`StreakFlame`. That one counts practice
 * days across a whole career; this one counts consecutive hits within one
 * run and forgets everything the moment you close the song.
 */

/** One rung on the streak ladder. */
export interface StreakStage {
  /** Stable, kebab-case identity - used to detect "did we just cross into
   * a new stage" without comparing display names (which are free to be
   * retuned without breaking that comparison). */
  id: string;
  /** Drum-domain, punchy display name - shown in the meter and the
   * stage-up announce flash. */
  name: string;
  /** Consecutive-hit count required to reach this stage. */
  threshold: number;
  /** 0-based ordinal position in `STREAK_STAGES`. Drives escalating visual
   * intensity (color temperature, glow, animation) via a `data-tier`
   * attribute - kept separate from `threshold` so the CSS ramp never has
   * to know the actual numbers. */
  tier: number;
}

/** Current in-play streak state, pure data - no timers, no DOM. */
export interface StreakState {
  /** Current consecutive-correct-hit count. Zeroed by a miss, a wrong hit,
   * or an administrative reset (seek/restart). */
  count: number;
  credit: number;
  /**
   * Highest `count` reached so far. Survives a failure reset (miss/wrong
   * hit) - that's the whole point of tracking a "best" instead of just
   * watching `count`. It does NOT survive an administrative reset
   * (seek/restart): see `resetForSeek` in `streak-tracker.ts` for why that
   * matches the engine's own established semantics for a rewound run.
   */
  best: number;
  bestCredit: number;
  /** The highest stage `count` has reached, or `undefined` below the
   * first stage's threshold. */
  stage: StreakStage | undefined;
  /**
   * Identities of notes already counted toward `count` this streak - lets
   * a multi-key chord add exactly 1 to the streak no matter how many of
   * its keys arrive as separate hit events (each key of a drummed chord
   * reaches the judge as its own `onHit` call). Cleared on every reset.
   * A caller building an id should use something stable per chart note
   * (e.g. `${measureIdx}:${noteIdx}`), not the tick alone - two notes can
   * theoretically share a tick in the same measure only if they *are* the
   * same note, so tick alone would already be safe, but the pair reads
   * more obviously unique at call sites.
   */
  countedNoteIds: ReadonlySet<string>;
}

/** Result of applying one event to a `StreakState`. */
export interface StreakTransition {
  state: StreakState;
  /** Set only when this hit just crossed into a new, higher stage - the
   * signal to fire the stage-up announce flash. `undefined` for every
   * miss/wrong-hit/reset event, and for a hit that didn't cross a new
   * threshold (including a chord key that was deduped away). */
  stageUp: StreakStage | undefined;
  /** True only when a miss or wrong hit actually dropped a running
   * (`count > 0`) streak back to zero - the "shatter" trigger. Never true
   * for a failure that lands while already at zero (no repeated shatter
   * for a string of misses), and never true for an administrative
   * seek/restart reset (that one is silent - see `resetForSeek`). */
  didShatter: boolean;
}
