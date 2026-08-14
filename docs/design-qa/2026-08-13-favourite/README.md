# favourite playable proof — 2026-08-13

## result

`Boulevard of Broken Dreams` — Green Day is now a fresh, Favorites-linked local song at `/Users/konstantinbaltsat/Music/SightKick/Green Day - Boulevard of Broken Dreams`.

This is separate from the pre-existing `Green Day - Boulevard of Broken Dreams (Harmonix)` package. The new folder was generated from local audio through Drumroll's normal source-row flow, not by reusing that package's `notes.mid`.

## recording identity and source boundary

| field                     | observed value                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Favorites source row      | `Boulevard of Broken Dreams` — `Green Day` — 261 s — ordinal 204                                                                                                                                                        |
| source track              | https://music.yandex.ru/album/41332/track/370429                                                                                                                                                                        |
| album/version cross-check | [Green Day, _American Idiot_ (Spotify)](https://open.spotify.com/album/01jrNa9Y7CLWnBMT3Fp5vR), where the standard studio track is listed as 4:20                                                                       |
| local input               | owner-controlled `song.opus` plus instrumental/vocal stems from the existing local package, mixed with the installed `ffmpeg`; resulting WAV SHA-256 `51ee0351fc475b3077b39dc681d2743dfcbd956ee3269f19d720104356a4496e` |
| duration reconciliation   | source row: 261 s; local container: 268.007 s; terminal silence begins at 263.598 s, leaving 2.598 s of non-silent-duration difference. This is inside the product's 8 s exact-recording tolerance.                     |

The Yandex source URL is retained as the Favorites provenance record. Its page was unavailable to the unsigned regional session during this run, so no availability claim is made from it.

The lawful-audio boundary is explicit: the product persisted `audio.source = local-user-attested`. This records that the owner selected local audio they own or are allowed to process. It is not independent proof of copyright entitlement. No audio was downloaded or ripped from Yandex Music, Spotify, or YouTube.

## generated package and five gates

The live `Use local audio` action ran the shipped local separation/transcription pipeline, then presented the normal review dialog before import.

| gate         | persisted proof                                                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| identity     | `Boulevard of Broken Dreams` / `Green Day` / 261 s from the Favorites row                                                                                         |
| lawful audio | `local-user-attested`; generated audio-set SHA-256 `455f887b2f843f5d7b49cc8be7fe79302cffcd84a48e34a880592e68dce0317a`                                             |
| chart        | `local-auto-chart`, chart id `207b8580-1aa0-4a8c-a8c0-90bf1cc1450b`, `reviewed: true`, SHA-256 `ccd37bb870e2d19577658d89a9673fe3e0bf2fd76b60dc6497144725391f5352` |
| scan         | `passed: true`, `mid`, drums at easy, medium, hard, and expert                                                                                                    |
| launch       | `passed: true`, `headless-load`, verified `2026-08-13T05:44:25.752Z`                                                                                              |

Direct `scan-chart` on the imported folder returned `playable: true` with drums present. It also reported three non-blocking presentation warnings: no album art, `other.ogg` is not a recognised stem label, and the charter field is blank. Those warnings did not prevent the app's scanned song from satisfying its playability contract.

The persisted playability hashes were recomputed from the imported five audio files and `notes.mid`; both matched exactly.

## live-play proof

1. [auto-chart review](01-auto-chart-review.jpeg) shows the freshly generated `MID` chart, five audio files, and all four drum difficulties before import.
2. [Favorites-linked import](02-favorite-imported.jpeg) shows the new library row as `Green Day · From Favorites`, auto-charted with Drumroll Transcriber, plus the add receipt.
3. [playing notation with a judged hit](03-playing-clean-hit.jpeg) shows the imported song playing in Flow notation on keyboard input and the in-app `PHRASE TIER · 1 CLEAN HITS` receipt.

The saved practice checkpoint confirms the judgement event: the first charted ride note at tick 0 recorded `verdict: "hit"`, velocity 127, and `deltaMs: 112.29166666666666`.

## repeatable path

The one material owner action is to choose a local audio file that they own or are allowed to process and that matches the exact Favorites recording.

1. In **Songs**, search the Favorites title. Focus or hover its source row to reveal **Use local audio**.
2. Choose the matching local audio file. Drumroll automatically mixes/separates, transcribes, scans, writes source provenance and five-gate evidence, then opens the review screen.
3. Confirm **Add to library**, then press the new `From Favorites` row and choose Practice or Perform.

Reject a candidate before selecting audio when title, artist, or recording length do not match; a same-title live cut, cover, remaster, or unrelated recording is not a substitute. The app refuses source-linked launch when identity, user-attested audio, chart, scan, or launch proof is missing.

## repository checks

All requested gates passed on the shared worktree after the live import:

| command                    | result                               |
| -------------------------- | ------------------------------------ |
| `corepack yarn vitest run` | 196 files passed; 1,983 tests passed |
| `corepack yarn typecheck`  | passed                               |
| `corepack yarn lint`       | passed                               |
| `corepack yarn build`      | passed                               |

## capture checksums

| file                        | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `01-auto-chart-review.jpeg` | `baf991050c8ee8da7a4e65946b695ad2020c0f30675031125b94b87759cc7e3e` |
| `02-favorite-imported.jpeg` | `82dbd78240d5fe886c5a9ff9be3acd08dc39ffdf73079b6d98029f8967a201e3` |
| `03-playing-clean-hit.jpeg` | `d77e2ea084ebd09cbd1b87cd30c9fab73e9baf557d5d597e0564cc114bfea441` |
