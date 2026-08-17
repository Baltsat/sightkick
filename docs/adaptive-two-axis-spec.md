# Adaptive tempo x timing window — implementation spec

Status: ready to build. Read section 0 before you touch any file — the mechanism
already changed since the design review that fed this spec.

## 0. State of the code right now — read this first

Checked directly on disk, branch `feat/practice-loop`, 2026-08-17.

The core file this spec used to target (`adaptive-timing.ts`, old ms-window
model: `phase`, `startingWindow`, `EXPERIENCED_TARGET_WINDOW_MS`,
`accuracyPressure`) **is gone from the working tree.** It was rewritten,
uncommitted, into a **grid-based ladder**: window size comes from the actual
note-to-note gap in the chart, not a fixed ms baseline. `git status` shows
this file, its types, and `SongView.tsx`'s call site all modified together —
this is one in-progress change, not two competing ones.

**This spec targets the code that is actually on disk.** Do not build the old
ms-window mechanism. It does not exist anymore.

Two things to verify again before you start, because this tree is being
edited during the day this spec was written:

```
git -C ~/sightkick log -1 --format="%ci"                       # last commit
git -C ~/sightkick status --short -- src/renderer/services/adaptive-practice/ src/renderer/views/SongView/SongView.tsx
```

If `adaptive-timing.ts` no longer exports `deriveTimingGrid`,
`timingWindowStandard`, `timingStandardForRun`, `deriveAdaptiveTimingWindow`,
and `MIN_TIMING_WINDOW_MS` — stop and re-read the file before touching
anything below. This spec is pinned to that exported surface, not to line
numbers.

## 1. What already works — do not rebuild it

Read `src/renderer/services/adaptive-practice/adaptive-timing.ts` and
`types.ts` in full before writing code. Summary of what is already correct:

- **The window is grid-relative, not a fixed ms number.**
  `deriveTimingGrid(chart, measures, playbackSpeed)` finds the smallest gap
  between two note onsets in real playback seconds (`gapMs`), at whatever
  tempo is passed in. The timing window is a _fraction_ of that gap:
  `target` = gap/3, `better` = gap/2, `ceiling` = gap (floor 35 ms,
  `MIN_TIMING_WINDOW_MS`). This means slowing tempo down already widens the
  window in real ms, automatically, with no separate "reset" step needed —
  keep this property, it is good design.
- **The ladder never widens a failed run.** A non-clean run only lowers
  tempo (`ladderAction: 'lower-tempo'`); it never loosens the standard
  (`target`/`better`/`ceiling`) in the other direction. This is the exact
  fix the player asked for. Do not add any code path that widens the
  standard on bad accuracy.
- **Clean-run gate**: `accuracy >= 0.94 && spreadMs <= 40 && sampleCount >= 8`
  (`cleanRun()`, constants `CLEAN_ACCURACY = 0.94`, `CLEAN_SPREAD_MS = 40`,
  `MIN_HIGH_QUALITY_TIMING_SAMPLES = 8`, all currently unexported — export
  them, see section 5).
- **Legacy-run honesty**: `timingStandardForRun(run)` returns
  `'pre-grid-standard'` for any run that predates this mechanism, instead of
  guessing. Reuse this to gate evidence — see section 5.
- **`SongView.tsx` is already wired**, not broken: it calls
  `deriveTimingGrid` to build a `grid`, passes it into
  `deriveAdaptiveTimingWindow({ kind, grid, playbackSpeed, runs })`, reads
  `hitToleranceSeconds` from the result, and stamps
  `timingGapMs` / `timingStandard` / `timingLadderAction` /
  `effectiveTempoBpm` / `timingNextRun` back onto the completed run. Perform
  mode is untouched — always `HIT_TOLERANCE_SECONDS = 0.1` s
  (`src/renderer/services/engine/constants.ts`, unchanged).

## 2. Three confirmed bugs in the existing ladder — fix these first

These are small, high-value fixes. Do them before adding anything new.

**Bug A — evidence is not tempo-banded.** `deriveAdaptiveTimingWindow` looks
only at `recentRuns[0]`, the single most recent run in the array,
_regardless of what tempo it was played at_. A `target` standard earned at
0.5x on the last run gets applied as this run's window fraction at 1.0x,
producing a window far tighter than anything proven at the current tempo.

_Fix_: at the `SongView.tsx` call site, filter `songRuns` to the current
tempo band before passing them in:

```ts
const SPEED_BAND_EPSILON = 0.05; // half a 0.1 step

const bandRuns = songRuns?.filter(
  (r) =>
    r.playbackSpeed !== undefined &&
    Math.abs(r.playbackSpeed - timingPlaybackSpeed) <= SPEED_BAND_EPSILON,
);

const adaptiveTiming = useMemo(
  () =>
    timingGrid
      ? deriveAdaptiveTimingWindow({
          kind: songData?.lesson ? 'lesson' : 'song',
          grid: timingGrid,
          playbackSpeed: timingPlaybackSpeed,
          runs: bandRuns,
        })
      : undefined,
  [songData?.lesson, bandRuns, timingGrid, timingPlaybackSpeed],
);
```

Same-file, single-call-site change. No new persisted state.

**Bug B — `cleanRun()` ignores wrong hits.** `overallAccuracy` is
`totalHits / (totalHits + totalMisses)` — wrong-lane hits never enter that
ratio (see `compute.ts:175-176`). A run with a bad wrong-hit rate can still
pass `cleanRun()` and count as promotion evidence.

_Fix_: extend `UsableRunEvidence` and `sanitizeRun()` in `adaptive-timing.ts`
to also read `totalHits`, `totalMisses`, `totalWrong` from the raw run, and
add a wrong-rate clause to `cleanRun()`:

```ts
const WRONG_RATE_MAX = 0.05; // new constant, export it

function cleanRun(run: UsableRunEvidence | undefined): boolean {
  if (!run) return false;
  const attempts =
    (run.totalHits ?? 0) + (run.totalMisses ?? 0) + (run.totalWrong ?? 0);
  const wrongRate = attempts > 0 ? (run.totalWrong ?? 0) / attempts : 0;
  return (
    run.accuracy >= CLEAN_ACCURACY &&
    run.spreadMs !== undefined &&
    run.spreadMs <= CLEAN_SPREAD_MS &&
    run.timingSampleCount >= MIN_HIGH_QUALITY_TIMING_SAMPLES &&
    wrongRate <= WRONG_RATE_MAX
  );
}
```

**Bug C — window display precision.** `rounded()` in `adaptive-timing.ts` is
`Math.round(value * 10) / 10` — one decimal place (e.g. `123.4` ms), not a
whole millisecond. Any UI that shows `timingWindowMs` to the player must
call `Math.round(timingWindowMs)` itself. Do not show `123.4ms` to a player.

## 3. The delta — what this spec adds on top

The grid ladder computes a recommendation every run
(`ladderAction: 'hold' | 'tighten-window' | 'lower-tempo' | 'raise-tempo'`,
plus `nextRun.playbackSpeed`) but **nothing applies it.**
`timingPlaybackSpeed` in `SongView.tsx` is only
`learnerPlaybackSpeed ?? requestedPracticeSpeed` — there is no auto slot.
The ladder also reacts to a single run in both directions, which is more
reactive than good control practice allows for raising tempo (a lucky clean
run should not immediately push tempo up).

This spec adds exactly four things, all new code, none of them touching the
pure ladder function's decision logic:

1. An **actuation layer** — a new `autoPracticeSpeed` slot that the ladder's
   recommendation can actually drive, opt-in behind a toggle.
2. A **hysteresis wrapper** around `raise-tempo` only (2 clean runs to
   raise, 3 if re-entering a band you were demoted from). `lower-tempo`
   stays single-run reactive — that is correct and already matches the
   player's "notice fast, react fast" ask.
3. A **chunk-trainer stall hook** so a hard 4-bar spot can demote tempo
   mid-session, not just at run end.
4. A **type fix** so the fields `SongView.tsx` already stamps
   (`timingGapMs`, `timingStandard`, `timingLadderAction`,
   `effectiveTempoBpm`, `timingNextRun`) actually exist on `RunSummary`.

## 4. State this design keeps

All per-song, `localStorage`, same re-derive-on-render pattern as
`useLearnerPlaybackSpeed` (`src/renderer/hooks/useLearnerPlaybackSpeed.ts`) —
**not** `usePersisted`, because `SongView` does not remount between two
songs on the same route and a one-time `useState` initializer would leak
song A's value onto song B.

| State                        | Key                                       | Persisted?                                  | Set by                                                         |
| ---------------------------- | ----------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `learnerPlaybackSpeed`       | `song.${songId}.learnerPlaybackSpeed`     | yes                                         | existing, untouched — only `stepSpeed`/`onExplicitSpeedChange` |
| `autoPracticeSpeed`          | `song.${songId}.autoPracticeSpeed`        | yes, new                                    | actuation layer only, never a manual control                   |
| `autoTempoEnabled`           | `autoTempoEnabled` (global, not per-song) | yes, new                                    | a visible toggle in practice settings, default `false`         |
| `autoTempoPausedThisSession` | —                                         | no, `useState`, reset when `songId` changes | set `true` the instant the learner calls `stepSpeed`           |

New hook, exact mirror of `useLearnerPlaybackSpeed.ts`:

```ts
// src/renderer/hooks/useAutoPracticeSpeed.ts
export function songAutoSpeedKey(
  songId: string | undefined,
): string | undefined {
  return songId ? `song.${songId}.autoPracticeSpeed` : undefined;
}

export function useAutoPracticeSpeed(
  songId: string | undefined,
): [number | null, (speed: number) => void] {
  // identical body to useLearnerPlaybackSpeed, different key function.
}
```

## 5. Functions — exact numbers

New module: `src/renderer/services/adaptive-practice/adaptive-tempo.ts`.

First, export from `adaptive-timing.ts` (currently unexported, needed for
reuse — this is the single source of truth for "clean," do not duplicate the
numbers):

```ts
export const CLEAN_ACCURACY = 0.94;
export const CLEAN_SPREAD_MS = 40;
export const MIN_HIGH_QUALITY_TIMING_SAMPLES = 8;
export const TEMPO_STEP = 0.1;
export const WRONG_RATE_MAX = 0.05; // new, section 2 bug B
```

New constants in `adaptive-tempo.ts` (untuned, proposed — flag for A/B once
real usage data exists, see section 13):

```ts
export const SPEED_BAND_EPSILON = 0.05; // half a TEMPO_STEP, same-band bucket
export const AUTO_SPEED_FLOOR = 0.3; // = usePracticeSession MIN_SPEED
export const AUTO_SPEED_CEILING = 1.0; // auto never pushes past authored tempo
export const HARD_DEMOTE_STEP = 0.2;
export const PROMOTE_STREAK = 2; // clean runs to raise tempo
export const PROMOTE_STREAK_AFTER_DEMOTE = 3; // re-entering a band you failed needs more proof
export const HARD_DEMOTE_STREAK = 2; // consecutive lower-tempo verdicts -> double step
export const PLATEAU_RUNS = 5;
```

**Trust filter** — a run only counts toward a streak if it predates neither
the grid mechanism nor the current band:

```ts
function trustworthy(run: RunSummary): boolean {
  return timingStandardForRun(run) !== 'pre-grid-standard';
}
```

**Band filter** — same runs the `SongView.tsx` call site already filters
(section 2, bug A). Reuse, do not refilter twice with different epsilon
values.

**The actuation function** — called once at run end, after `runSummary` is
finalized (`SongView.tsx`, right after `atomicSkillEvidence` is merged in,
~line 1000 today — verify against current file), with
`[...(songRuns ?? []), runSummary]` so the just-completed run is visible to
its own streak count:

```ts
export interface AutoTempoResult {
  speed: number;
  action: 'hold' | 'promote' | 'demote_soft' | 'demote_hard';
  reason: string;
}

export function deriveNextAutoSpeed({
  currentAutoSpeed,
  currentBand,
  runs, // RunSummary[], already includes the just-finished run
}: {
  currentAutoSpeed: number;
  currentBand: number;
  runs: RunSummary[];
}): AutoTempoResult {
  const bandRuns = runs
    .filter(
      (r) =>
        r.playbackSpeed !== undefined &&
        Math.abs(r.playbackSpeed - currentBand) <= SPEED_BAND_EPSILON &&
        trustworthy(r),
    )
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  const latest = bandRuns[0];

  if (!latest) {
    return {
      speed: currentAutoSpeed,
      action: 'hold',
      reason: 'Gathering evidence at this tempo.',
    };
  }

  if (latest.timingLadderAction === 'lower-tempo') {
    const recentTwo = runs
      .filter(trustworthy)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, 2);
    const hard =
      recentTwo.length === 2 &&
      recentTwo.every((r) => r.timingLadderAction === 'lower-tempo');
    const step = hard ? HARD_DEMOTE_STEP : TEMPO_STEP;
    const speed = clamp(
      currentAutoSpeed - step,
      AUTO_SPEED_FLOOR,
      AUTO_SPEED_CEILING,
    );

    return {
      speed,
      action: hard ? 'demote_hard' : 'demote_soft',
      reason: hard
        ? `2 rough runs in a row. Tempo down to ${pct(speed)} to rebuild clean reps.`
        : `Last run needed a slower tempo. Tempo down to ${pct(speed)}.`,
    };
  }

  if (latest.timingLadderAction === 'raise-tempo') {
    let streak = 0;
    for (const r of bandRuns) {
      if (r.timingLadderAction === 'raise-tempo') streak += 1;
      else break;
    }

    const wasDemotedHere = bandRuns.some(
      (r) => r.timingLadderAction === 'lower-tempo',
    );
    const required = wasDemotedHere
      ? PROMOTE_STREAK_AFTER_DEMOTE
      : PROMOTE_STREAK;

    if (streak >= required) {
      const speed = clamp(
        currentAutoSpeed + TEMPO_STEP,
        AUTO_SPEED_FLOOR,
        AUTO_SPEED_CEILING,
      );
      return {
        speed,
        action: 'promote',
        reason: `${streak} clean runs at ${pct(currentBand)}. Tempo up to ${pct(speed)}.`,
      };
    }

    return {
      speed: currentAutoSpeed,
      action: 'hold',
      reason: `${streak} of ${required} clean runs at ${pct(currentBand)} before raising tempo.`,
    };
  }

  if (bandRuns.length >= PLATEAU_RUNS) {
    return {
      speed: currentAutoSpeed,
      action: 'hold',
      reason: `${PLATEAU_RUNS}+ runs at ${pct(currentBand)}, no clear trend. Tempo held, flagged for review.`,
    };
  }

  return {
    speed: currentAutoSpeed,
    action: 'hold',
    reason: 'Window is still tightening at this tempo.',
  };
}
```

Notes on this function:

- It **reads** `ladderAction` off the pure `deriveAdaptiveTimingWindow`
  output that is already stamped on every run. It does not re-derive
  clean/rough itself — that stays a single source of truth in
  `adaptive-timing.ts`.
- `'tighten-window'` verdicts cause no speed action — the pure ladder
  already handles window tightening within a tempo band on its own, every
  run, and that stays single-run reactive (see section 1: tightening only
  ever fires on a clean run, and a following bad run drops tempo without
  needing the standard reset — the grid scaling handles that automatically).
- Hard-demote detection looks at the last 2 trustworthy runs **overall**,
  not band-filtered, because each demote changes the band — by definition
  you cannot get 2 lower-tempo verdicts in the same band unless the first
  one failed to apply.

**Actuating the result** — the call after `deriveNextAutoSpeed` returns is
two writes, both cheap, both required together (see the hard rule in
section 8):

```ts
setAutoPracticeSpeed(result.speed); // persists to localStorage, section 4
setPlaybackSpeed(result.speed); // usePracticeSession's raw setter — applies to
// the *next* run in this open song without
// remounting. NEVER call stepSpeed/
// onExplicitSpeedChange here — that would
// mark the song learner-owned, which is wrong
// for an automatic change.
```

`usePracticeSession` already exposes `setPlaybackSpeed` as a raw
`Dispatch<SetStateAction<number>>` (`usePracticeSession.ts:52`,
`usePracticeSession.ts:271`) separate from `stepSpeed`
(`usePracticeSession.ts:233-248`, the one that calls
`onExplicitSpeedChange`). This is exactly the "programmatic apply, not
learner action" seam this design needs — it already exists, use it as is.

**Resolution order at song load / speed selection** — replace the current

```ts
const timingPlaybackSpeed = policy.speedControl
  ? (learnerPlaybackSpeed ?? requestedPracticeSpeed)
  : 1;
```

with:

```ts
const zpdSeed =
  learnerPlaybackSpeed === null && autoPracticeSpeed === null
    ? zpdDecision?.scaffold.speed // scaffoldFor, zpd-frontier.ts:195-237
    : undefined;

const timingPlaybackSpeed = policy.speedControl
  ? (learnerPlaybackSpeed ??
    requestedPracticeSpeed ??
    (autoTempoEnabled && !autoTempoPausedThisSession
      ? (autoPracticeSpeed ?? undefined)
      : undefined) ??
    zpdSeed ??
    1)
  : 1;
```

A manual `stepSpeed()` call sets `autoTempoPausedThisSession = true` in the
same tick (wire it through `onExplicitSpeedChange`, since that callback
already fires only on genuine learner action) — auto-tempo yields to a live
choice for the rest of that session, not permanently.

## 6. Promotion and demotion rules

Tied to real, already-persisted fields. No new instrumentation.

**Demotion — fast, single-run, matches the player's "notice, slow down,
watch me improve" complaint:**

- `timingLadderAction === 'lower-tempo'` on the latest band-matched,
  trustworthy run → `-0.1` (`TEMPO_STEP`), floor `0.3` (`AUTO_SPEED_FLOOR`).
- 2 consecutive `lower-tempo` verdicts (any band, since band shifts each
  time) → `-0.2` (`HARD_DEMOTE_STEP`) instead, same floor.
- Chunk-trainer stall (section 7) → `-0.1` immediately, mid-session,
  independent of run-end evaluation.
- The window itself needs no forced reset on demotion — the grid ladder's
  `nextGrid.gapMs` already scales up proportionally when tempo drops
  (`adaptive-timing.ts` `speedRatio`/`nextGrid` computation), so the window
  widens in real ms automatically at the new, slower tempo without any
  special-case "recalibrating" state. Do not add one.

**Promotion — gated, needs proof, prevents flattery on a lucky run:**

- `timingLadderAction === 'raise-tempo'` needs **2 consecutive** such
  verdicts at the same band (`PROMOTE_STREAK`) before the speed actually
  moves.
- If this exact band has a `lower-tempo` verdict anywhere in its own
  trustworthy history (i.e. you were demoted here and are climbing back),
  the requirement becomes **3** (`PROMOTE_STREAK_AFTER_DEMOTE`). This is
  the anti-oscillation hysteresis — without it, a `raise → fail → demote →
raise` loop can repeat forever around a boundary the learner has not
  actually stabilized at.
- Ceiling `1.0` (`AUTO_SPEED_CEILING`) for auto-driven changes. Going past
  1.0x stays a manual, learner-owned action — `stepSpeed` already allows up
  to `MAX_SPEED = 2`.

**Plateau — hold, do not guess a direction:**

- 5+ (`PLATEAU_RUNS`) trustworthy runs at the same band with the latest
  verdict neither `raise-tempo` nor `lower-tempo` → hold, surface
  "plateauing" to the UI (section 8). Ambiguous evidence must never
  silently pick a direction.

**Trust filter — applies to every rule above:**
A run only counts as promotion, demotion, or plateau evidence if
`timingStandardForRun(run) !== 'pre-grid-standard'`. A run from before this
mechanism existed proves nothing about the current standard and must never
be read as if it does.

## 7. Chunk-trainer contract (`useTutorSession.ts`)

This file is **unmodified** on disk — the contract below is exact, not
approximate, verified directly against the current file.

The chunk-repeat loop already has its own stall signal, stronger and more
localized than waiting for a whole run to finish:
`resume-main` commands fire with `reason: 'maximum-failed-attempts'`
(`useTutorSession.ts:288`) or `reason: 'chunk-plan-deferred'`
(`useTutorSession.ts:269`) when a hard spot exhausts its bounded attempts.

The file's own comment at `useTutorSession.ts:226-229` states:
_"command.speed is the tutor's own recommendation, never applied - the
player's speed control is the only thing that changes tempo."_ This spec
consciously relaxes that boundary, but only when the player has opted in
via `autoTempoEnabled` — it does not silently override it.

Add an opt-in callback, gated behind the toggle, inside the existing
`resume-main` branch (`useTutorSession.ts:268-304`):

```ts
if (
  adaptiveTempoEnabled &&
  (command.reason === 'maximum-failed-attempts' ||
    command.reason === 'chunk-plan-deferred')
) {
  onChunkStall?.({ reason: command.reason });
}
```

`SongView` wires `onChunkStall` to an immediate `-0.1`
(`TEMPO_STEP`) demotion of `autoPracticeSpeed`, applied via the same
`setAutoPracticeSpeed` + `setPlaybackSpeed` pair from section 5, **before**
the next attempt — bypassing the end-of-run wait entirely. This is the
concrete fix for "errors kept happening for a whole session before anything
reacted."

## 8. ZPD contract (`zpd-frontier.ts`)

Also unmodified on disk. `scaffoldFor()` (`zpd-frontier.ts:195-237`) already
computes a one-time `starting_speed` per song selection. This design uses it
**only as the seed** for `autoPracticeSpeed`, the first time a song opens
with both `learnerPlaybackSpeed === null` and `autoPracticeSpeed === null`
(section 5, resolution order). After that single seed, the run-reactive
actuation layer in section 5 takes over. ZPD's `repeat_budget` /
`quality_passes_to_advance` / `low_quality_passes_before_stop`
(`adaptationFor`, `zpd-frontier.ts:239-273`) are untouched — this spec adds
one new signal _into_ that loop (the chunk-stall hook), it does not
re-derive those numbers.

## 9. What the player sees, and when

Every write to `autoPracticeSpeed` or the timing standard carries a plain
reason string built from real numbers — reuse the pure ladder's own
`reason` field (`adaptive-timing.ts`, already returned on every call) for
window/standard changes, and the `reason` from `deriveNextAutoSpeed`
(section 5) for tempo changes. Never a generic label.

- **Demotion**: _"Last run needed a slower tempo. Tempo down to 70%."_ /
  _"2 rough runs in a row. Tempo down to 60% to rebuild clean reps."_
- **Promotion**: _"2 clean runs at 90%. Tempo up to 100%."_
- **Holding for streak**: _"1 of 2 clean runs at 90% before raising
  tempo."_ — the counter is shown, not hidden.
- **Plateau**: _"5 runs at 80%, no clear trend. Tempo held, flagged for
  review."_
- **Chunk-trainer stall**: _"That spot needed 3 tries — tempo down to 70%
  before the next attempt."_ Called out distinctly from a run-end demotion
  so it is clear it fired mid-session from one hard passage, not the whole
  run.
- **Badge**: a visible "Auto" vs "You set this" tag next to the speed
  control. The instant the learner calls `stepSpeed`, the badge and
  `autoTempoPausedThisSession` both flip together — never a case where the
  badge says one thing and the state does another.
- **Trend strip**: last up to 6 runs (tempo used, accuracy, standard) shown
  in the end-of-run summary, so the "slow down, rebuild, ease back up" arc
  is visible as a pattern, not something the player has to infer.
- **Hard rule**: no code path may change `autoPracticeSpeed`,
  `timingStandard`, or the effective window without producing a `reason`
  string surfaced in the same UI update. A silent change is a bug, full
  stop — this is the direct fix for "the app thinks I'm playing well" when
  it was actually a number moving underneath the player, not the playing.

## 10. Type fix — required before any of the above compiles cleanly

`SongView.tsx` already writes `timingGapMs`, `timingStandard`,
`timingLadderAction`, `effectiveTempoBpm`, `timingNextRun` onto
`baseRunSummary: RunSummary` (`~SongView.tsx:952-961`). None of these five
fields exist on `RunSummary` today
(`src/renderer/services/practice-stats/types.ts:238-291` — confirmed by
direct read, only `timingWindowMs?: number` is present). Add them:

```ts
// src/renderer/services/practice-stats/types.ts
import type {
  TimingWindowStandard,
  TimingLadderAction,
  TimingRunState,
} from '../adaptive-practice/types';

export interface RunSummary {
  // ...existing fields...
  timingWindowMs?: number;
  /** Real note-to-note gap this run's window was measured against, ms. */
  timingGapMs?: number;
  /** Which grid fraction (target/better/ceiling) this run's window used. */
  timingStandard?: TimingWindowStandard;
  /** What the ladder recommended based on this run's own result. */
  timingLadderAction?: TimingLadderAction;
  effectiveTempoBpm?: number;
  /** The ladder's suggested pairing for the next run — evidence only, not applied
   * unless autoTempoEnabled actuates it (adaptive-tempo.ts). */
  timingNextRun?: TimingRunState;
}
```

No circular import: `adaptive-practice/types.ts` does not import from
`practice-stats`, so this is safe.

## 11. Test list

Name the test, state exactly what it asserts. Put ladder/actuation tests in
`adaptive-tempo.test.ts` (new file, next to the new module); put type/wiring
tests wherever `SongView.test.tsx` and `adaptive-timing.test.ts` already
live, following each file's existing style.

**Bug fixes (section 2):**

1. `band filter excludes runs outside epsilon` — a run at `0.5` speed does
   not appear in `deriveAdaptiveTimingWindow`'s evidence when the call is
   made at `1.0`, once the `SongView.tsx` band filter is in place.
2. `cleanRun rejects a high-wrong-rate run` — accuracy `0.96`, spread `20`,
   sample count `20`, but `totalWrong / attempts > 0.05` → `cleanRun()`
   returns `false`.
3. `rounded window displays as a whole ms` — any UI component that renders
   `timingWindowMs` calls `Math.round` before display; snapshot/string test
   confirms no decimal point appears.

**Actuation (section 5):** 4. `single lower-tempo run demotes by TEMPO_STEP` — one band-matched,
trustworthy run with `timingLadderAction: 'lower-tempo'` → next
`autoPracticeSpeed` is `currentBand - 0.1`, floored at `0.3`. 5. `two consecutive lower-tempo runs hard-demote` — `-0.2` in one step, not
two separate `-0.1` calls. 6. `one raise-tempo run does not promote` — `action: 'hold'`, speed
unchanged, reason string shows `"1 of 2"`. 7. `two consecutive raise-tempo runs at a fresh band promote` — `+0.1`. 8. `raise-tempo at a band with a prior demote requires three, not two` —
with a `lower-tempo` verdict earlier in that band's history, 2 clean
runs hold, the 3rd promotes. 9. `promotion never exceeds AUTO_SPEED_CEILING` — repeated clean streaks at
`0.9` stop at `1.0`, never reach `1.1`. 10. `demotion never crosses AUTO_SPEED_FLOOR` — repeated rough streaks at
`0.4` stop at `0.3`. 11. `pre-grid-standard runs are excluded from every streak` — a run with no
`timingStandard` and no `timingGapMs` (legacy shape) does not count
toward promotion, demotion, or plateau evidence. 12. `plateau after five runs with no trend holds and flags` — 5 band-matched
runs alternating `hold`/`tighten-window` → `action: 'hold'`, reason
mentions plateau. 13. `manual stepSpeed sets autoTempoPausedThisSession and the auto slot yields`
— after a manual speed change, the resolution order in section 5 picks
`learnerPlaybackSpeed`, not `autoPracticeSpeed`, for the rest of the
session. 14. `zpd seed only applies when both learner and auto speed are unset` —
with `autoPracticeSpeed` already set from a prior session, `zpdSeed` is
never read.

**Chunk-trainer (section 7):** 15. `maximum-failed-attempts fires onChunkStall when adaptiveTempoEnabled`
— `resume-main` with that reason calls the callback exactly once. 16. `chunk-plan-deferred fires onChunkStall when adaptiveTempoEnabled` —
same, other reason. 17. `chunk-plan-mastered does not fire onChunkStall` — success path, no
demotion. 18. `onChunkStall is not invoked when adaptiveTempoEnabled is false` — the
existing "never applied" behavior is preserved for players who have not
opted in. 19. `chunk stall demotes mid-session, before the next attempt` — integration
test on `SongView`: `autoPracticeSpeed` changes without waiting for
`onEnded`.

**Type/wiring (section 10):** 20. `RunSummary accepts all five new grid fields without a TS error` —
compile-time check (a `.test-d.ts` type test, or an explicit assignment
test), since the current gap only surfaces as a type-checker complaint,
not a runtime one. 21. `a run stamped with the new fields round-trips through persistence and
    back into deriveAdaptiveTimingWindow's evidence` — end-to-end: save,
reload, re-derive, same `ladderAction`.

**Honesty (section 9):** 22. `every autoPracticeSpeed write in a run-end evaluation carries a non-empty reason`
— property test over `deriveNextAutoSpeed`'s four branches (`hold`,
`promote`, `demote_soft`, `demote_hard`): `reason.length > 0` always. 23. `badge reflects state, not staleness` — after `stepSpeed`, a rerender
shows "You set this" in the same tick the state flips, no one-frame lag
where they disagree.

## 12. Non-goals — explicitly out of scope

- **Not touching** `zpd-frontier.ts`'s `repeat_budget` /
  `quality_passes_to_advance` / `low_quality_passes_before_stop` math. This
  spec adds one signal into that loop (chunk stall), it does not re-derive
  those numbers.
- **Not touching** Perform mode. Always `HIT_TOLERANCE_SECONDS = 0.1` s, no
  grid, no ladder, no auto tempo, regardless of `autoTempoEnabled`.
- **Not making tempo section-aware or lane-aware.** `playbackSpeed` stays
  one scalar for the whole song. A single hard 4-bar fill dragging the
  whole run's accuracy down is a known limitation — the chunk-trainer stall
  hook (section 7) is the intended mitigation, not a full fix. Do not try
  to make song-level tempo section-aware in this pass.
- **Not introducing interleaved/randomized practice.** This remains a
  blocked, progressive-overload scheme (repeat at one tempo until clean,
  then step up). Reintroducing tempo variation for retention is a separate,
  later decision — it conflicts with the player's own "steady climb"
  mental model and needs its own design pass.
- **Not proving convergence.** The 2-clean-to-raise / 1-rough-to-lower
  streak counter is a discrete controller, not a continuous one. The
  3-streak hysteresis after a demote dampens oscillation at a boundary; it
  does not mathematically prove the system converges. Ship it, watch real
  usage, revisit if players report ping-ponging at a specific tempo.
- **Not adding new instrumentation.** Every field this spec reads or writes
  already exists on `RunSummary`/`HitRecord` except the five listed in
  section 10, which are the ladder's own already-computed output, just
  missing from the type.

## 13. Biggest risk

Every number in sections 5 and 6 (`SPEED_BAND_EPSILON`, `AUTO_SPEED_FLOOR`,
`AUTO_SPEED_CEILING`, `HARD_DEMOTE_STEP`, `PROMOTE_STREAK`,
`PROMOTE_STREAK_AFTER_DEMOTE`, `HARD_DEMOTE_STREAK`, `PLATEAU_RUNS`,
`WRONG_RATE_MAX`) is proposed, not validated against real play data. Ship
behind `autoTempoEnabled`, default off, and treat the first real usage
window as the actual test of these constants — not this document.

The second risk is procedural, not technical: this file was rewritten
uncommitted while this spec was being written (section 0). If it drifts
again before an engineer picks this up, re-run the two verification
commands in section 0 before writing a single line.
