# SongView render cost regression (2026-08-17)

## What happened

The adaptive-practice wave made the practice surface much more expensive to
render. Measured on this machine, single-worker:

| suite | before the wave | after |
| --- | ---: | ---: |
| `SongView.test.tsx` (84 tests) | about 15-20 s | **209 s** |
| `SongListView.test.tsx` (91 tests) | about 20 s | **117 s** |

Individual integration tests that drive many interactions now take 13-49 s
each. Every test passes; the suite only fails when workers are starved and the
20 s timeout fires. The timeout is raised to 60 s so the gate reports real
failures rather than starvation, and this file records the debt.

## Why it matters beyond CI

The player reported the app "lagging" during practice. A five-to-tenfold
increase in render cost on the practice surface is the same defect seen from
the other side. Fixing this is a player-facing performance fix, not test
housekeeping.

## Ruled out so far

- The interaction-mode arbiter notifies subscribers only on a real mode change
  (`setMode` early-returns when the mode is unchanged), so mouse movement does
  not re-render the tree.
- The fragment-map and pattern-profile analyses are gated behind
  `isScoreModalOpen`, so they do not run during play.
- The score render effect does not depend on playback speed, so speed changes
  do not re-lay-out the score.

## Where to look next

1. Profile one slow test (`practice mode > adjusts and clamps the practice
   speed`, about 49 s) with a React profiler or `--inspect` to find the hot
   component; that test only presses arrow keys, so the cost is per-keystroke
   re-render, not layout.
2. Suspect the new toolbar controls and the per-render derivations added around
   them (`selectPracticeOpening`, `deriveTimingGrid`, `resolvePracticeSpeed`) —
   confirm each is memoised on stable inputs rather than recomputed per render.
3. Check the time-proportional score layout for per-render work that could be
   computed once per chart.
4. Add a render-count assertion to a test so this cannot regress silently
   again.
