# SongView render cost — retracted regression (2026-08-17)

## What this file used to claim

That the adaptive-practice wave made the practice surface five to ten times
more expensive to render, measured as `SongView.test.tsx` taking 209 s against
a 15-20 s baseline and `SongListView.test.tsx` taking 117 s against about 20 s.

## What is actually true

Both numbers were taken while about fifteen lanes were writing files and
competing for the same cores. Re-measured on a settled tree, single worker,
same machine, same commit range:

| suite                              | claimed |     actual |
| ---------------------------------- | ------: | ---------: |
| `SongView.test.tsx` (84 tests)     |   209 s | **15.6 s** |
| `SongListView.test.tsx` (91 tests) |   117 s | **12.0 s** |

Both sit inside the original baseline. There is no render regression. The
"individual tests take 13-49 s" figure came from the same poisoned run.

## What was real

The per-render derivations that this file told the next reader to suspect were
already memoised when it was written: `deriveTimingGrid`,
`deriveAdaptiveTimingWindow`, `selectPracticeOpening`, `filterRunsForSpeedBand`
and `buildTutorChartPlan` all sit behind `useMemo` on stable inputs.
`resolvePracticeSpeed` runs per render and is a small policy function.

The player-facing lag he reported belongs to the earlier freeze - settings that
would not close and a stalled interaction surface - and was fixed there. It was
never evidence for this.

## The lesson, which is the point of keeping this file

A timing taken on a busy machine is not a measurement. This wave produced the
same class of error twice: a 45-failure test reading taken mid-write that
settled at 14, and this. Measure on a settled tree or do not measure.

## The timeout

`vitest.config.ts` raises testTimeout and hookTimeout from 20 s to 60 s. That
change was made for this phantom regression, and it stays - not for render
cost, but because parallel workers on a shared CI runner can starve a test long
enough to trip a 20 s limit, and a starvation timeout reads as a real failure.
The comment there says so.
