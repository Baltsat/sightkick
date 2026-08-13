# automatic import proof receipt

## current state

The renderer-side automatic-import contract is implemented in this checkout.
It ranks YouTube candidates, rejects accidental variants, maps honest queue
states, and routes the legacy online/download adapter to `create-auto-chart`.
The main-process patch in [../../auto-import-handoff.md](../../auto-import-handoff.md)
is still required before a source-linked YouTube result can receive retained
fetched-audio evidence. Until that patch lands, an end-to-end capture would
misrepresent the feature: the current main process correctly rejects that exact
case, and the source-row UI remains owned by a parallel lane that still exposes
its separate local-audio action.

## evidence already obtained

| proof               | result                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| local tools         | `/opt/homebrew/bin/yt-dlp` (`2026.03.17`) and ffmpeg (`8.1`) are present; the shipped sidecar uses its own pinned `yt-dlp==2026.7.4` |
| renderer contract   | selected candidate, canonical URL, and source provenance are preserved for main-process verification                                 |
| candidate ranking   | exact title, artist, ±8-second duration, and requested-variant checks; live/cover impostors do not reach selection                   |
| queue state         | queued → fetch → chart → scan → import → playable, plus terminal failure and one-click retry                                         |
| focused state tests | `4` files / `8` tests passed (`identity`, queue state, YouTube mapping, failure/retry hook)                                          |
| typecheck           | `corepack yarn typecheck` passed after the renderer contract change                                                                  |
| lint                | `corepack yarn lint` passed before the final documentation-only update; scoped automatic-import ESLint passed after it               |
| production build    | `corepack yarn build` passed after the final renderer contract change                                                                |
| full Vitest run     | `204` files / `2,086` tests passed                                                                                                   |

The web surface was intentionally unchanged. Its deployment disables keyword
search and automatic chart creation until a transcriber connection is
configured; adding a browser-only workaround would be a second, unverified
path rather than this desktop flow.

## required visual capture once the handoff is applied

1. choose a title absent from the seeded library;
2. type it in the one search field and capture the small ranked candidate list;
3. select the exact recording, with `dialog.showOpenDialog` rigged to throw;
4. capture the queue surface during download/transcription and after import;
5. open the imported song and capture the loaded playable chart;
6. repeat a forced fetch failure, press Retry once, and confirm a new job uses a
   fresh working directory.

The final screenshots belong here only after the IPC handoff is implemented and
the test has completed. No placeholder screenshot is included.
