# one-search field – visual proof

the current capture runs the production Electron build from this checkout with
an isolated `SK_USER_DATA_DIR`. [capture-one-search.mjs](capture-one-search.mjs)
types and clicks through the desktop renderer, then uses deterministic
main-process replies for external search and import. the normal `load-song`
IPC opens a real playable fixture from the isolated `live-import` library.

## captured journey

| capture                                                    | observed state                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [05-one-search-library.png](05-one-search-library.png)     | Songs has one search field, `Ready now`, `Favourites`, `Recently imported`, and the browse door. the legacy import controls are absent. |
| [06-one-search-results.png](06-one-search-results.png)     | typing `3 Nights One Search Proof` produces no local match, then the same field shows the selected YouTube result.                      |
| [07-one-search-importing.png](07-one-search-importing.png) | one click disables the field and shows its `42%` download status inline in the result popover.                                          |
| [08-one-search-song-open.png](08-one-search-song-open.png) | the imported event adds the song, navigates to its route, and opens its real notation screen.                                           |

[capture-notes.json](capture-notes.json) records zero rendered instances of
the removed `Add music`, local import, My Music, Create chart, global progress,
local-audio copy, and remote-transcriber controls. it also records a clean
renderer and the opened fixture title.

## proof boundary

the script temporarily removes the isolated Electron process’s real
`search-youtube` and `create-auto-chart` handlers before the renderer types and
clicks. it then emits the matching search and queue updates through the real
IPC channel. this keeps the capture deterministic and prevents a downloader or
network request. the last event carries an existing locally playable song; the
normal main-process loader reads it and `SongView` renders its notation.

the earlier [01-library-search.png](01-library-search.png) through
[04-retry-after-cancel.png](04-retry-after-cancel.png) capture the prior live
search/import states. the new four-image journey is the post-integration
receipt for the one-search route.

## automated proof

| command                                                                                                                                                                    | result                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `corepack yarn vitest run src/renderer/views/SongListView/SongListView.test.tsx --testNamePattern='keeps the shelves while one-search imports open the new song directly'` | passed – 1 focused integration test                             |
| `corepack yarn vitest run src/renderer/views/SongListView src/renderer/components/AutoChart`                                                                               | 128 passed; 2 pre-existing Journey failures outside this change |
| `corepack yarn typecheck`                                                                                                                                                  | passed                                                          |
| scoped ESLint on `SongListView.tsx` and its test                                                                                                                           | passed                                                          |
| `corepack yarn build`                                                                                                                                                      | passed                                                          |
| `node docs/design-qa/2026-08-14-one-search/capture-one-search.mjs`                                                                                                         | passed                                                          |
| `git diff --check`                                                                                                                                                         | passed                                                          |

full-repository lint currently fails in shared-tree changes under
`ScoreSummary`, `TutorHud`, `SongView`, and pedagogy/remediation. the scoped
Songs files are lint-clean.
