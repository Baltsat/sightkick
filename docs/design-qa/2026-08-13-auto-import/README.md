# automatic import proof receipt

## delivered desktop path

typing a title in Song Search now returns ranked YouTube candidates. Choosing a
candidate creates an automatic chart job; no song-row local-audio action is
offered as the entry path.

the desktop main process owns the trust boundary. It resolves the pinned
transcriber-venv `yt-dlp`, re-inspects the selected canonical URL before
downloading, and requires an exact video id/title/artist match, a duration
delta of at most eight seconds, and no unrequested live, cover, karaoke,
tribute, instrumental, remix, acoustic, sped-up, slowed, or nightcore variant.

only a verified fetched recording may produce `youtube-fetched` audio
provenance. Import still requires real hashed audio, a generated chart,
scan-chart drums, and a headless-load proof. A job failure or cancellation
removes its fresh attempt directory; Retry creates a new job and directory.

## captured Electron run

the deterministic smoke test runs the actual desktop app, IPC queue, ranking,
main-process identity check, import, library scan, song view, and player. Its
`yt-dlp` and transcriber executables are deterministic fixtures, so this is not
a claim of a public-network YouTube transfer. The shipped path separately
verified the pinned real venv executable at
`~/Library/Application Support/sight-kick/transcriber/.venv/bin/yt-dlp` as
`2026.07.04`.

the test installs a throwing `dialog.showOpenDialog` handler before search. A
file picker would therefore fail the run instead of being hidden by the
capture.

| capture                                            | observed result                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [01-search-progress.png](01-search-progress.png)   | exact Mokita recording selected; live and cover decoys are absent; the actual queue reports fetch progress |
| [02-launched-playing.png](02-launched-playing.png) | imported song opens a rendered drum chart; count-in/play has started                                       |
| [03-forced-failure.png](03-forced-failure.png)     | injected sidecar failure presents its precise error and one-click Retry                                    |
| [04-retry-imported.png](04-retry-imported.png)     | retry imports successfully, shows one ready song, and replaces the old failure card                        |

## checks

| command                    | result                        |
| -------------------------- | ----------------------------- |
| `corepack yarn vitest run` | 205 files, 2,100 tests passed |
| `corepack yarn typecheck`  | passed                        |
| `corepack yarn lint`       | passed                        |
| `corepack yarn build`      | passed                        |

the focused coverage includes main-side identity re-validation, complete and
forged fetched-audio provenance, cleanup after failure, a fresh retry, and the
renderer replacement of a failed job with its retry successor.
