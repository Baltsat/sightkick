# kb.9 songs: playable proof ledger

captured 2026-08-11 from the current `feat/practice-loop` checkout.

a source row is playable only when one stored certificate binds all five
facts to the imported files:

1. exact source identity: title, artists, and duration;
2. lawful audio, hashed from the selected local file;
3. chart provenance with an approved source;
4. a fresh `scan-chart` result with at least one drum difficulty; and
5. a successful headless load preflight.

the three green rows below were imported through Drumroll's local-audio
auto-chart queue into `/Users/konstantinbaltsat/Music/SightKick`, then loaded
in the production Electron build. "local audio" means a file already present
in the owner's iTunes library; this ledger does not assert ownership beyond
that user-controlled local selection. each green certificate is persisted in
its `song.ini`, reconstructed on a normal library rescan, and re-hashed again
before Drumroll loads the chart.

|   # | source identity                                          | outcome             | evidence or exact terminal blocker                                                                                                                                                                                                                                                   |
| --: | -------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Pendant que les champs brûlent — Niagara — 231 s         | blocked             | no exact lawful local audio on this machine; no exact reviewed drum chart found in Chorus Encore or RhythmVerse.                                                                                                                                                                     |
|   2 | Natural Villain — The Man Who — 199 s                    | blocked             | source artist is The Man Who; no exact lawful local audio on this machine; no exact reviewed drum chart found.                                                                                                                                                                       |
|   3 | Loyal — ODESZA — 208 s                                   | **playable**        | local audio hash `a5edd1b873804246bffc159a079fd40620a7d1fd4254010266574ad15afa6b74`; local auto-chart; `mid`; Easy/Medium/Hard/Expert; headless load `2026-08-11T07:46:26.088Z`; rendered launch has 3,794 SVG paths.                                                                |
|   4 | Made To Love — TobyMac — 232 s                           | **playable**        | local audio hash `66612452eff7a91f2661e0cfcf071ed6c0787e028ac2185707ea095483d52ebd`; local auto-chart; `mid`; Easy/Medium/Hard/Expert; headless load `2026-08-11T07:52:43.419Z`; rendered launch has 3,836 SVG paths.                                                                |
|   5 | Help Is On The Way (Maybe Midnight) — TobyMac — 182 s    | blocked             | no exact lawful local audio on this machine; no exact reviewed drum chart found.                                                                                                                                                                                                     |
|   6 | Heat Waves — Living In Fiction                           | identity incomplete | source capture has no duration or stable track URL. Glass Animals' same-title recording is rejected; without exact identity, no resolver or auto-chart path may run.                                                                                                                 |
|   7 | What I Like About You — Jonas Blue + Theresa Rex — 220 s | **playable**        | local audio hash `3ac19446474b0a6c621bad5ca508026ff98d7272fa2466448b5304e93abe886d`; local auto-chart; `mid`; Easy/Medium/Hard/Expert; headless load `2026-08-11T07:56:06.426Z`; rendered launch has 3,629 SVG paths. The Romantics chart is rejected as a different artist/version. |
|   8 | Sanctuary — Welshly Arms — 228 s                         | blocked             | no exact lawful local audio on this machine; Super City and Welshly Arms' "Legendary" are rejected false matches; no exact reviewed drum chart found.                                                                                                                                |
|   9 | Wantchya — Ballpoint                                     | identity incomplete | source capture has no duration or stable track URL; no lawful auto-chart route is allowed.                                                                                                                                                                                           |
|  10 | Can’t Use Me — Morray — 170 s                            | blocked             | no exact lawful local audio on this machine; no exact reviewed drum chart found.                                                                                                                                                                                                     |
|  11 | UNSTOPPABLE Cover — Sukiwat — 227 s                      | blocked             | "Cover" does not identify a recording strongly enough to substitute another version; no exact lawful local audio on this machine and no exact reviewed chart found.                                                                                                                  |
|  12 | Niten Doraku — Sprnova — 158 s                           | blocked             | no exact lawful local audio on this machine; no exact reviewed drum chart found.                                                                                                                                                                                                     |
|  13 | Low — Lenny Kravitz — 319 s                              | blocked             | no exact lawful local audio on this machine. Foo Fighters and Testament same-title charts are rejected as different artists and durations.                                                                                                                                           |

## launch captures

|                       row | review capture                               | library/launch capture                                                                            |
| ------------------------: | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
|     all rows before proof | [proof gate](00-yandex-drums-proof-gate.png) | —                                                                                                 |
|                 3 — Loyal | [review](01-loyal-preview.png)               | [green library](02-loyal-library-green.png), [notation launch](03-loyal-launch.png)               |
|          4 — Made To Love | [review](04-made-to-love-preview.png)        | [green library](05-made-to-love-library-green.png), [notation launch](06-made-to-love-launch.png) |
| 7 — What I Like About You | [review](07-what-i-like-preview.png)         | [green library](08-what-i-like-library-green.png), [notation launch](09-what-i-like-launch.png)   |

## catalog and batch behavior

the resolver requires normalized title, artist, and duration (±8 seconds),
drums, and a review flag before it returns `exact-reviewed-chart`; every
non-match is retained with a rejection reason. Chorus requests now ask for
`drumsReviewed: true`, and a returned candidate counts as reviewed only when
its own response field is `drumsReviewed: true`; main-process package download
also refuses an unreviewed source or a non-Chorus package host and re-scans
the extracted chart for a playable drum part.

the same IPC request accepts an array of source rows, so the existing
Favorites collection can submit the same exact resolver in a later batch.
it deliberately does not auto-select audio for Favorites: each future
auto-chart still needs an explicit lawful local-audio choice.

public catalog references checked for this ledger:

- [Chorus Encore](https://enchor.us/) — reviewed drum-chart search and
  package ecosystem.
- [RhythmVerse song files](https://rhythmverse.co/songfiles/game) — second
  public Clone Hero chart catalog.
- [RhythmVerse copyright policy](https://rhythmverse.co/copyright_policy) —
  public catalog rights context.
- [Bridge releases](https://github.com/Geomitron/Bridge/releases/tag/v3.4.5)
  and [Bridge source](https://github.com/Geomitron/Bridge) — a working Chorus
  package download route, checked without accepting a false match.
- rejected same-title candidates: [The Romantics — What I Like About You](https://enchor.us/chart/81bd8239eabf197c52cc701f627aac4c), [Super City — Sanctuary](https://enchor.us/chart/9748dc54e50efcb2da65017cb4a20d77), [Foo Fighters — Low](https://enchor.us/chart/f90217c8319b6162a088d98ea48b4d17), and [Testament — Low](https://enchor.us/chart/171209c5b09572f6e2203f350eae1f4a).
