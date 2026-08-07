# Wiring PracticeStats into a real run

This phase built three new, self-contained pieces:

- `src/renderer/services/practice-stats/` — pure math (`HitRecord` in,
  `RunSummary` out). No dependency on Judge/Engine/React.
- `src/main/ipc/practiceStats.ts` — `savePracticeRun` / `loadPracticeRuns`,
  not yet registered on any `ipcMain` channel.
- `src/renderer/components/PracticeStats/` — presentational, takes a
  `RunSummary` (+ optional trend) as props. Not mounted anywhere yet.

None of that captures a real hit. This doc is the exact, file-by-file plan
to close that gap. It touches `judge.ts` / `engine.ts` / `SongView` /
`ScoreSummary` — files this phase was explicitly told not to edit — so
treat it as a spec for Integrate, not a suggestion to improvise around.

## Where records come from

Judge already distinguishes the three verdicts we need, just not in
`HitRecord` shape yet:

- **hit** — `Judge.onHit(listener)`, fired once per `handleInput` call from
  `judge.ts` (near the bottom of `handleInput`, right before
  `this.hitListeners.forEach(...)`).
- **wrong** — `Judge.onFalseHit(listener)`, fired from
  `maybeRecordFalseHit` with a `FalseHitRecord` that already has
  `{ tick, element, timeSeconds }`.
- **miss** — Judge has no "miss" event; a miss is only knowable in
  retrospect, once the run ends, by diffing every playable note against
  what `judge.isHit(tick, prefix)` says was actually hit. Derive it in
  `Engine.handleEnded()`, next to the existing `totalNotes()` walk.

### Why `onHit` needs a small payload change

`judge.onHit`'s current signature is `(pos: NotePos, prefixes: string[])` —
enough to paint a note, not enough to build a `HitRecord`: it's missing the
struck lane, the actual time, and the timing delta. Judge already computes
all three locally inside `handleInput` (`resolveElement(controlId)`,
`currentTimeS`, `hit.tick`) — it just doesn't hand them to listeners. Add a
`HitEventMeta` object to the emission, computed once per call (not once per
prefix — every prefix in `newPrefixes` comes from the same struck pad, so
they share one `element`/`timeSeconds`/`deltaMs`):

```ts
// engine/types.ts
export interface HitEventMeta {
  tick: number; // hit.tick — the note's expected tick
  timeSeconds: number; // currentTimeS — when it was actually struck
  deltaMs: number; // (currentTimeS - expectedTimeS) * 1000, signed
  element: InputElement | undefined; // resolveElement(controlId); always
  // defined in practice — handleInput only reaches this point after
  // confirming controlId is mapped to some element in this.mapping — but
  // keep the type honest and drop the record defensively if it's ever
  // undefined rather than crash or coerce it.
  velocity: number; // the InputEvent's `value`
}

export type JudgeHitHandler = (
  pos: NotePos,
  prefixes: string[],
  meta: HitEventMeta,
) => void;
```

In `judge.ts`, right before the existing hit emission:

```ts
const expectedTimeS = ticksToSeconds(hit.tick, chart.resolution, chart.tempos);

this.hitListeners.forEach((listener) =>
  listener(pos, newPrefixes, {
    tick: hit.tick,
    timeSeconds: currentTimeS,
    deltaMs: (currentTimeS - expectedTimeS) * 1000,
    element: this.resolveElement(controlId),
    velocity: value,
  }),
);
```

One `HitRecord` per entry in `newPrefixes` (not one per input event) —
that matches the granularity `totalNotes()` and `judge.hitCount` already
use (`note.notes.length`, i.e. per chord-key), so `totalHits + totalMisses`
reconciles against the chart's real note count.

### Miss derivation, precisely

A note-key is a miss iff it's a real (non-rest) chart note whose prefix was
never marked hit by the time the run ends. The lane it belongs to comes
from `ELEMENT_TO_KEYS` (the fixed VexFlow-key ↔ element table used to
_draw_ the chart) — **not** `this.mapping` (the player's controller
mapping) — those are two different tables and only one of them tells you
what a given notated key means:

```ts
// engine/constants.ts — new, small addition
export const KEY_TO_ELEMENT: Record<string, InputElement> = Object.fromEntries(
  Object.entries(ELEMENT_TO_KEYS).flatMap(([element, keys]) =>
    keys.map((key) => [key, element]),
  ),
);
```

In `Engine.handleEnded()`, alongside the existing `totalNotes()` walk:

```ts
private deriveMisses(): HitRecord[] {
  const misses: HitRecord[] = [];

  for (const measure of this.measures) {
    for (const note of measure.notes) {
      if (note.isRest) continue;

      for (const key of note.notes) {
        const prefix = keyPrefix(key);

        if (this.judge.isHit(note.tick, prefix)) continue;

        const element = KEY_TO_ELEMENT[prefix];

        if (!element) continue; // not a kit-lane key, ignore

        misses.push({
          tick: note.tick,
          timeSeconds: ticksToSeconds(note.tick, this.chart!.resolution, this.chart!.tempos),
          deltaMs: 0, // no strike happened; nothing to compare
          element,
          verdict: 'miss',
        });
      }
    }
  }

  return misses;
}
```

## The 5 edits

1. **`engine/types.ts`** — add `HitEventMeta`, widen `JudgeHitHandler` to
   `(pos, prefixes, meta) => void` (above), and widen
   `EngineOptions['onEnded']` from `(score: ScoreData) => void` to
   `(score: ScoreData, practiceSummary: RunSummary) => void`.

2. **`engine/judge.ts`** — compute `expectedTimeS`/`deltaMs` and pass the
   `HitEventMeta` object on every `hitListeners` emission (above). No
   other behavior changes.

3. **`engine/engine.ts`**:
   - `import { HitRecord, summarizeRun } from '../practice-stats';` and
     `import { KEY_TO_ELEMENT } from './constants';`
   - add `private runRecords: HitRecord[] = [];`
   - in the `hitUnsub` subscription, after `this.renderer.paintHit(...)`,
     push one `HitRecord` per prefix in `prefixes` (all sharing `meta`,
     `verdict: 'hit'`), skipping if `meta.element` is undefined.
   - in the `falseHitUnsub` subscription, after `paintWrongHit(...)`, push
     one `HitRecord` (`verdict: 'wrong'`, `deltaMs: 0`), skipping if
     `record.element` is undefined.
   - add `deriveMisses()` (above).
   - in `handleEnded()`: build
     `summarizeRun([...this.runRecords, ...this.deriveMisses()], new Date().toISOString())`
     — this is the one place `Date.now`-equivalent belongs; the
     `practice-stats` module itself stays pure — and pass it as the
     second argument to `onEndedCb`. Reset `this.runRecords = []`.
   - **Open question for whoever implements this**: should a looped
     practice-range replay accumulate into one growing run, or should
     each loop pass count as its own run? `Judge.rewindTo()` already
     prunes `judge.hits` at/after the rewound tick on every seek, so the
     natural default is to also drop the corresponding tail of
     `runRecords` on rewind (mirror `rewindTo`'s tick cutoff) — otherwise
     a looped bar's stats double- or triple-count. Not resolved here;
     pick one and note it in the PR.

4. **`SongView.tsx`** — `onEnded` currently receives just `score`; take the
   second `practiceSummary: RunSummary` argument too. Store it
   (`useState<RunSummary>()`), and — mirroring the existing
   `sendMessage('update-song', ...)` call a few lines below — fire
   `window.electron.ipcRenderer.sendMessage('save-practice-run', { songId: id, summary: practiceSummary })`
   when `id` is set and the run had any attempts. Pass `practiceSummary`
   as a new prop into `<ScoreSummary ... />`.

5. **`ScoreSummary.tsx`** — accept `practiceSummary?: RunSummary`, render
   `<PracticeStats summary={practiceSummary} variant="inline" />` inside
   the modal (e.g. below the existing 3-stat grid at the bottom of the
   component).

## Two one-line infra registrations (not in the four owned files above)

- **`src/preload/index.ts`** — add `'save-practice-run'` and
  `'load-practice-runs'` to the `Channels` union. The bridge itself
  (`sendMessage`/`on`) is already channel-agnostic; no other change.
- **`src/main/AppState.ts`** — import `savePracticeRun, loadPracticeRuns`
  from `./ipc/practiceStats` and register
  `ipcMain.on('save-practice-run', savePracticeRun)` /
  `ipcMain.on('load-practice-runs', loadPracticeRuns)` in `setupIpc()`,
  next to the existing `update-song` registration.

## Per-song stats view (separate surface, not counted above)

`variant="panel"` and the `history`/`computeRunsTrend` path exist for a
standalone per-song view (e.g. from `SongMenu`/`SongListItem`): on open,
`sendMessage('load-practice-runs', songId)`, listen for the reply, take the
last run as `summary` and `computeRunsTrend(runs)` as `trend`, render
`<PracticeStats variant="panel" summary={summary} trend={trend} />`. Which
menu/route triggers it is a UI-ownership decision for whoever owns
`SongMenu`/`SongListItem`, not specified further here.
