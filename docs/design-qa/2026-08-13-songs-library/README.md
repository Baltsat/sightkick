# Songs library QA — 2026-08-13

Rendered proof for the Songs-lane visual pass: the shelf sits on the shared field, the default Difficulty sort is honest, hover preview works end to end, and an unplayable row offers one real fix.

| Capture                           | State                                                 | Proof                                                                                                              |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `01-songs-default-1225x768.png`   | Songs, wide viewport                                  | one continuous warm-paper field, row rhythm, hairlines, no card grid; rail and rows share the field                |
| `01-songs-default-1024x700.png`   | Songs, compact viewport                               | same field and row grammar hold at the compact width, no clipping                                                  |
| `02-difficulty-chip-selected.png` | default "Difficulty" sort chip                        | paper/ink boundary + 2px wine outline at rest — no coral/ember/magenta on a filter (v3's chip rule)                |
| `03-hover-preview.png`            | pointer hovering a ready row after the intent delay   | `data-previewing="true"` and the "Drum peak · bars 13–17" chip render live; `capture-notes.json` confirms it fired |
| `04-source-row-actions.png`       | pointer hovering an unresolved playlist-candidate row | "Use local audio" renders as the one primary fix; "Check charts" is a quiet, visually subordinate text link        |

## What this fixture can and cannot show

The `final-qa` fixture library is empty of non-lesson local songs ("0 in your library · 0 ready to play · 243 to add from your playlists" in every capture above). That means **rated difficulty ordering is not visually demonstrable from these screenshots** — there is no locally-charted song here for the background parser to rate. That claim is instead carried by:

- `src/renderer/services/library/unified-library.test.ts` — `order_unified_library`'s 'difficulty' sort against real `learner_relative_difficulty` values.
- `src/renderer/views/SongListView/use-library-difficulty-charts.test.ts` — the background parser itself: requests every plausibly-loadable song once, populates real parsed charts, never fabricates a value for a song whose chart doesn't resolve, and never lets one song's error reply poison a concurrent sibling.

Hover preview and the row-grammar fix _are_ real in this fixture, because the SightKick Method lesson content ships with local audio+chart — `03-hover-preview.png` and `04-source-row-actions.png` are genuine rendered proof, not simulated.

## How these were captured

`capture-songs-library.mjs` drives `out/main/index.js` (the current source tree's own build, not the installed app) via Playwright's Electron driver, using the same `.userdata/final-qa/config.json` fixture and launch pattern as `../2026-08-13-practice-fix/capture-practice-fix.mjs`. Run `corepack yarn build` first, then `node docs/design-qa/2026-08-13-songs-library/capture-songs-library.mjs` from the repo root.

## A real bug the first capture attempt caught

The first pass of `02-difficulty-chip-selected.png` showed the "Difficulty" chip with **no visible wine outline at all** — antd's `.ant-btn` CSS (injected after the static Tailwind sheet) was winning the cascade on `outline-style` even though `outline-2`/`outline-color` were present in the class list. Confirmed via `getComputedStyle` (`outlineStyle: "none"`) on a throwaway debug script before fixing. The fix: `!outline-2 !-outline-offset-2 !outline-[var(--dr-wine)]` on the two antd-`Button` sort/ready chips specifically — plain-`<div>` rows elsewhere in this lane (the row focus ring) don't need `!` because they have no antd reset to beat. Re-verified with the same `getComputedStyle` check before recapturing: `outlineStyle: "solid"`, `outlineColor: rgb(123, 61, 70)` (`--dr-wine`), `outlineWidth: "2px"`.

## Checks

- `corepack yarn vitest run src/renderer/views/SongListView/ src/renderer/services/library/unified-library.test.ts src/renderer/components/LibraryCandidateList/ src/renderer/components/SongSearch/` → 140 passed, 1 pre-existing failure (see below), 0 new failures.
- `corepack yarn eslint` scoped to every touched/added file in this lane → passed.
- `corepack yarn typecheck` → passed, 0 errors anywhere in the repo.
- `corepack yarn build` → passed.

The 1 failing test (`SongListView — loading the library > ranks persisted supported Coach evidence into Home without bypassing lesson prerequisites`) fails identically with every change in this lane fully reverted — it is a kit-routing regression in `HomeCockpit`, a file explicitly out of this lane's scope and under active concurrent edit by another lane. Confirmed by stashing this lane's diff and re-running the same test in isolation.

## What changed (Songs lane scope only)

- `src/renderer/views/SongListView/use-library-difficulty-charts.ts` (new) — background, bounded-concurrency (3 at a time) parse of the player's own local charts so the shelf's default "Difficulty" sort uses the real My Wave learner-relative score (`services/pedagogy/my-wave.ts`, via `unified-library.ts`'s `charts` seam) instead of the prior silent fallback to alphabetical order. Only queues songs that can plausibly load (mirrors `unified-library.ts`'s `song_ready`); a song whose parse never resolves stays honestly unrated, never fabricated. A request cancelled mid-flight (leaving Songs, or unmounting) is freed for retry rather than stranded.
- `src/renderer/views/SongListView/SongListView.tsx` — wires the hook in; a ready song whose parse settled with no score says "· Unrated" once in its support line; token pass (wine/ember/warning instead of the accent-magenta/red/orange defaults) on the eyebrow labels, the Continue-practicing Play button, the sort/ready-only chips, and the Drums/Favorites load-error line.
- `src/renderer/components/LibraryCandidateList/LibraryCandidateList.tsx` — token pass on row hover/focus/preview states; an unplayable song row that's already linked to a source track now offers the single real fix ("Use local audio"), matching the source row; the source row's own two actions are now visually hierarchized (one primary button, one subordinate text link) instead of two equal buttons.
- `src/renderer/components/SongSearch/SongSearch.tsx` — token pass on the YouTube-result hover/active state only; the search/import flow itself (one field, searches the library, offers YouTube candidates only when nothing matches, one click to import) was already correct and needed no behavioural change.
- `src/renderer/components/SongListItem/**` — confirmed dead code (only the unused `SongList.tsx`, itself unreferenced anywhere in the app, imports it) and deliberately left untouched; not the live Songs surface.
