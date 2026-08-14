# one search field – visual proof

these captures use a production Electron preview of this checkout with an
isolated `SK_USER_DATA_DIR`. they show the actual desktop renderer, not a
Storybook fixture.

## captured states

| capture                                                | observed state                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-library-search.png](01-library-search.png)         | typing `3 Nights` filters the existing music shelf. no external request panel appears because the shelf has a match.                                                                           |
| [02-external-results.png](02-external-results.png)     | typing `Dominic Fike 3 Nights Official Audio` finds no local match, then the same field opens ranked YouTube results. the official-audio result is first; the video and lyric variants follow. |
| [03-importing.png](03-importing.png)                   | one click on that first result disables the field and replaces results with its inline status row. the live job was downloading audio and reported `0%`.                                       |
| [04-retry-after-cancel.png](04-retry-after-cancel.png) | after the isolated proof job was cancelled, the same inline row offered `Retry import`; no dialog remained.                                                                                    |

the proof job was cancelled after the capture. the preview process was then
stopped while its real downloader had already moved into transcription, so its
isolated temporary `sk_transcriber_s0eptbkl` directory was moved to the system
Trash instead of being deleted. no song was imported into the isolated library,
and the working `sightkick-auto-chart` root has no job subdirectory.

## flow covered by this lane

`SongSearch` keeps the supplied local search callback in front. its caller
sets `active` only after local search returns no matching shelf entries. an
active field searches YouTube, passes results through the existing identity
ranker, and sends the selected result to the already-proven `autoImport`
pipeline. the selected row stays in the popover through queue, download,
transcription, importing, failure, cancellation, and retry.

on an `imported` queue event it calls `onImported(song)` exactly once. the
Songs view must use that callback to add and open the new song; the exact
parent change is in [HANDOFF.md](HANDOFF.md).

## current integration boundary

the captures honestly still show the older `Add music` controls and an older
global `Create chart` progress panel. those are mounted by `SongListView` and
`AutoChart`, which are owned by another lane and intentionally untouched
here. their duplicate status UI is the remaining integration work, not a
second import path in `SongSearch`.

## automated proof

| command                                                                                                                                  | result                     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `corepack yarn vitest run src/renderer/components/SongSearch src/renderer/components/LibraryCandidateList src/renderer/services/library` | passed – 3 files, 33 tests |
| `corepack yarn vitest run src/main/ipc/remoteAutoChart.test.ts`                                                                          | passed – 7 tests           |
| `corepack yarn typecheck`                                                                                                                | passed                     |
| scoped ESLint on changed source and tests                                                                                                | passed                     |
| `corepack yarn build`                                                                                                                    | passed                     |
| `git diff --check`                                                                                                                       | passed                     |

full-repository lint is tracked separately because unrelated parallel capture
scripts were already failing it; the changed one-search files are lint-clean.
