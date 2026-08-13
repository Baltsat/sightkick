# final verification — 2026-08-14

checked release source `ac6f199a2ad7a884cba6e6c2afe8657366dc66e3` on
`feat/practice-loop`. This replaces the earlier kb.13 snapshot in place because
the filename is the historical audit handle.

## release boundary

- `HEAD` is eight commits after `v1.2.0-kb.14` (`314159e`): `e883428`,
  `7f4c2d4`, `8653fd5`, `1988493`, `d549699`, `190e765`, `88aa88c`, and
  `ac6f199`.
- a fresh run on the current checkout passed `205` test files and `2,099`
  tests; `corepack yarn typecheck` also passed. That checkout includes active,
  uncommitted automatic-import/search work, so this is a working-tree gate,
  not proof of a kb.15 release artifact.
- `package.json` still declares `1.2.0-kb.14` / build `1.2.14`. There is no
  kb.15 tag, DMG, signing, notarization, installed-app capture, GitHub release,
  or deployment.
- the active dirty lane touches `src/main`, `src/library-sources`, `SongSearch`,
  `LibraryCandidateList`, E2E fixtures, and automatic-import captures. Its
  behavior is called out below, but none of it is described as shipped.

## scorecard

| scope                                  | closed | partial | open | blocked outside | total |
| -------------------------------------- | -----: | ------: | ---: | --------------: | ----: |
| distinct 2026-08-12 bug-hunt defects   |     27 |       1 |    0 |               0 |    28 |
| seven operator-facing remediation rows |      7 |       0 |    0 |               0 |     7 |
| fidelity-map asks                      |     26 |      11 |    3 |              13 |    53 |
| newly checked reliability cases        |      0 |       3 |    4 |               1 |     8 |

five remediation rows duplicate defects already counted in the 28-item hunt:
Configure Input, inactivity MIDI parking, odd-meter count-in, local-day
archiving, and artist validation. The historical defect total is therefore 28,
not 35.

## what the earlier audit now gets wrong

1. `P1 — 14 of 14 CLOSED` was too strong. Atomic skill evidence is written for
   lesson runs only; free-play songs, imported favourites, and My Wave songs
   without a lesson manifest still produce none. The correct historical P1
   result is 13 closed and 1 partial.
2. Tutor speed and speed-scaled inactivity timing were described as uncommitted
   mid-audit work. They are committed in `6972568` and `7f4c2d4`.
3. The temporary TutorHud failure is stale. `TutorHud.test.tsx` now passes
   `10/10`; `mistake-evidence.ts` and `TutorHud` give expected drum, actual
   drum, and a concrete correction after the player opens Why.
4. The old `196 files / 1,984 tests` result belongs to `1d8eaab`, not this
   tree. The current working-tree result is `205 / 2,099`.
5. The launcher dossier's old shell-handoff warning is stale. `SongListView`
   now passes `onOpenJourney`, `onFindNewMusic`, and `onStartSong` into
   `HomeCockpit`; `kit-door-routing.test.tsx` covers every destination.
6. The claim that every source row still requires Use local audio is stale for
   the current dirty lane. The lane has moved toward verified YouTube fetch and
   automatic import, but it is uncommitted and has the open failure cases in
   [new reliability findings](#new-reliability-findings).

## historical defect audit

### P0 — 9 of 9 closed

| id  | defect                                                      | state  | proof                                                                   |
| --- | ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| B01 | downloaded song accepted with no audio                      | closed | `downloadSong.ts`, `downloadSong.test.ts`, `47adacc`                    |
| B02 | unscoreable false hit persisted as wrong evidence           | closed | `engine.ts`, `engine.test.ts`, `c4c60a3`                                |
| B03 | rewind kept a stale miss under the same judgement id        | closed | `tutor/machine.ts`, `machine.test.ts`, `c4c60a3` / `6972568`            |
| B04 | mid-song run fabricated pre-start misses                    | closed | `engine.ts`, `engine.test.ts`, `c4c60a3`                                |
| B05 | Perform could leave before its save/reward reply            | closed | `SongView.tsx`, `ScoreSummary.test.tsx`, `SongView.test.tsx`, `47adacc` |
| B06 | input latency ignored playback speed                        | closed | `judge.ts`, `judge.test.ts`, `engine.test.ts`, `3421a3b`                |
| B07 | pause during a speed restart resumed audio behind paused UI | closed | `speed/player.ts`, `player.test.ts`, `c4c60a3`                          |
| B08 | removing one default MIDI note blanked its full lane        | closed | `InputContext.tsx`, `InputContext.test.tsx`, `c4c60a3`                  |
| B09 | remapped MIDI note stayed active on its default lane        | closed | `InputContext.tsx`, `InputContext.test.tsx`, `c4c60a3`                  |

### P1 — 13 closed, 1 partial

| id  | defect                                                | state   | proof or residual                                                                                                                    |
| --- | ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| B10 | local row claimed playable without audio/chart        | closed  | `SongListItem.tsx`, `SongListItem.test.tsx`, `c4c60a3`                                                                               |
| B11 | loop wrap restarted count-in                          | closed  | `transport.ts`, `transport.test.ts`, `c4c60a3`                                                                                       |
| B12 | shared MIDI control credited the wrong lane           | closed  | `judge.ts`, `judge.test.ts`, `c4c60a3`                                                                                               |
| B13 | velocity-failed note became both wrong and miss       | closed  | `judge.ts`, `engine.test.ts`, `6972568`                                                                                              |
| B14 | checkpoint hits vanished after resume                 | closed  | `practiceStats.ts`, `SongView.practice-run.test.tsx`, `47adacc`                                                                      |
| B15 | completed runs never wrote atomic skill evidence      | partial | lesson writes are covered by `SongView.practice-run.test.tsx`; `SongView.tsx:769-795` skips free-play runs without `songData.lesson` |
| B16 | near-perfect Perform run read Perfect                 | closed  | `ScoreSummary.tsx`, `ScoreSummary.test.tsx`, `6972568`                                                                               |
| B17 | dismissed inactivity veil left no caption             | closed  | `SongView.tutor.test.tsx`, `6972568`                                                                                                 |
| B18 | atomic evidence vanished after the 50-run summary cap | closed  | `practiceStats.ts`, `practiceStats.test.ts`, `47adacc`                                                                               |
| B19 | failed download stranded a folder and blocked retry   | closed  | `downloadSong.ts`, `downloadSong.test.ts`, `47adacc`                                                                                 |
| B20 | zero-chart song became a My Wave practice candidate   | closed  | `SongListView.tsx`, `SongListView.test.tsx`, `c4c60a3`                                                                               |
| B21 | inactivity timing used scaled song time               | closed  | `useKitInactivityRecovery.test.ts`, `6972568`                                                                                        |
| B22 | opening Learn mid-run swallowed a real strike         | closed  | `SettingsButton.tsx`, `SongView.tutor.test.tsx`, `7f4c2d4`                                                                           |
| B23 | tutor overwrote a manual tempo change                 | closed  | `useTutorSession.test.tsx`, `machine.ts`, `6972568`                                                                                  |

### P2 — 5 of 5 closed

| id  | defect                                                    | state  | proof                                            |
| --- | --------------------------------------------------------- | ------ | ------------------------------------------------ |
| B24 | artist validation was a duplicated structural no-op       | closed | `provenance.ts`, `provenance.test.ts`, `7f4c2d4` |
| B25 | inactivity parking reopened MIDI before the resume strike | closed | `SongView.tutor.test.tsx`, `7f4c2d4`             |
| B26 | Profile no-scroll test never executed its assertion       | closed | `no-outer-scroll.test.tsx`, `c4c60a3`            |
| B27 | five-plus beat count-ins clipped                          | closed | `CountIn.tsx`, `CountIn.test.tsx`, `7f4c2d4`     |
| B28 | archive and streak used different calendar days           | closed | `archive.ts`, `archive.test.ts`, `7f4c2d4`       |

### operator-facing remediation — 7 of 7 closed

| row                                          | state  | proof                                                                   |
| -------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| visible Home connection state                | closed | `HomeCockpit.test.tsx` covers connected, reconnecting, and absent input |
| pause before Configure Input learns a strike | closed | B22 / `SongView.tutor.test.tsx`                                         |
| only confirm starts an armed Home door       | closed | `HomeCockpit.test.tsx` and `kit-door-routing.test.tsx`                  |
| inactivity park leaves MIDI live             | closed | B25 / `SongView.tutor.test.tsx`                                         |
| odd-meter count-in has every beat            | closed | B27 / `CountIn.test.tsx`                                                |
| archive uses the player's local day          | closed | B28 / `archive.test.ts` crosses the UTC+8 boundary                      |
| malformed source artist is rejected          | closed | B24 / `provenance.test.ts`                                              |

## fidelity map — 53 asks rescored

`closed` means current source plus a regression test or current visual proof.
`partial` means a concrete remaining product/code gap. `blocked outside` means
the remaining deciding evidence requires Konstantin on the DTX; it is not a
request for more source-only work.

### sitting down and starting

| id  | state           | current evidence or remaining proof                                                                                                         |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | blocked outside | every drum is a labelled door and `kit-door-routing.test.tsx` covers it; only a real first ten minutes at the kit can settle hands-free use |
| S02 | closed          | Home visibly names connected, reconnecting, and absent input; late connection and remembered-device tests cover the state machine           |
| S03 | blocked outside | the deliberate strike-then-confirm path is wired; pedal path and actual seated launch remain DTX proof                                      |
| S04 | closed          | lesson launch goes straight to Practice without a mode/difficulty fork; `SongListView.test.tsx` covers it                                   |
| S05 | closed          | a labelled pad selects a door and only confirm starts it; stray-strike regression is in `HomeCockpit.test.tsx`                              |
| S06 | blocked outside | count-in, reversed-stick treatment, and zone flare have source/capture proof; legibility at playing distance needs the real kit             |
| S07 | closed          | `no-outer-scroll.test.tsx` and 1024×700 / 1225×768 captures cover the field routes                                                          |

### playing and being judged

| id  | state           | current evidence or remaining proof                                                                                                           |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 | blocked outside | score persistence defects are closed and Kit Signal exposes received/mapped/saved evidence; a real strike-to-saved-run proof remains DTX-only |
| P02 | blocked outside | `boulevard-regression.test.ts` protects the renderer path; a complete Classic replay on real audio remains unobserved                         |
| P03 | blocked outside | Flow timing has speed/seek regression coverage; audible playhead synchrony needs real audio and hands                                         |
| P04 | closed          | `2026-08-13-teach` shows the quiet top transport and full notation field                                                                      |
| P05 | closed          | current Flow captures show readable measures; repeated figures are now rendered as repeats                                                    |
| P06 | blocked outside | practice/Perform data policies and tutor guardrails are tested; beginner forgiveness at a slow physical tempo is a feel check                 |
| P07 | blocked outside | parking no longer reopens MIDI and pointer release remains wired; musical checkpoint and one-pad resume need DTX proof                        |
| P08 | closed          | veil pointer-down, move, and wheel release are retained and tested                                                                            |
| P09 | closed          | paused-score drag selection and loop wiring remain covered by `SongView.test.tsx`                                                             |
| P10 | closed          | the 500 ms notation glossary path is wired and covered; current Why disclosure is deliberate rather than hover-only                           |
| P11 | blocked outside | lane colours, labels, contrast checks, and captures are present; two-metre physical readability is outside automation                         |
| P12 | partial         | note, lane colour, kit key, and Why correction now join; a free-play atomic-evidence gap still breaks the complete feedback-to-next-work loop |
| P13 | blocked outside | loop escape and player-owned tempo are in source; whether a real recovery feels finite and useful needs a DTX run                             |
| P14 | closed          | challenge lives default off and remain an explicit player setting                                                                             |

### understanding a mistake

| id  | state           | current evidence or remaining proof                                                                                 |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| U01 | blocked outside | the detector threshold and scoring repairs are covered; real slow-beginner tolerance needs physical play            |
| U02 | closed          | tutor no longer sets engine speed; `useTutorSession.test.tsx` proves a manual speed survives tutor activity         |
| U03 | closed          | unqualified lesson pass defaults to replaying the current loop, with My Wave secondary                              |
| U04 | blocked outside | deferral and max-attempt paths are present; terminal-state legibility needs a real recovery session                 |
| U05 | partial         | atomic model and recommendations exist, but B15 leaves free-play practice invisible to it                           |
| U06 | closed          | `mistake-evidence.test.ts` and `TutorHud.test.tsx` prove expected drum, actual drum, and concrete correction in Why |
| U07 | closed          | score, persistence, and result-receipt fixes now agree under their regression tests                                 |

### seeing progress

| id  | state   | current evidence or remaining proof                                                                           |
| --- | ------- | ------------------------------------------------------------------------------------------------------------- |
| G01 | partial | full-window history and atomic evidence exist; free-play evidence does not enter the same model               |
| G02 | closed  | result and statistics are full-window receipts in `2026-08-13-push` captures                                  |
| G03 | closed  | the Home XP strip is no longer rendered; Profile owns detailed figures                                        |
| G04 | partial | Home frames work as musical progress, but it does not consistently name the favourite-song payoff             |
| G05 | partial | the receipt and Why surface explain a next step; causal bridge to a named favourite remains thin              |
| G06 | open    | no month-scale outcome model or longitudinal learner evidence exists                                          |
| G07 | partial | broad regression tests and visual dossiers exist, but no single named gate binds every owner ask to a release |

### choosing music

| id  | state   | current evidence or remaining proof                                                                                  |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| M01 | closed  | snare starts My Wave; `my-wave.test.ts` and `recommend.test.ts` cover favourites, replays, reachability, and reasons |
| M02 | closed  | My Wave receipts carry shared musical features and learner-relative difficulty change                                |
| M03 | closed  | suggested starting speed comes from song/profile evidence and tutor no longer overwrites it                          |
| M04 | partial | one favourite path is proven; the bulk source library is still not a bulk playable library                           |
| M05 | closed  | Songs is one field/list with honest source states rather than separate library destinations                          |
| M06 | open    | automatic import at HEAD is renderer-only; the fuller current lane is uncommitted and has open interruption cases    |
| M07 | partial | drum-peak preview works for playable local songs, while most source rows remain unplayable                           |
| M08 | closed  | rows remain honest about missing audio/chart evidence and do not present false Play actions                          |
| M09 | closed  | the Support project CTA remains absent from source                                                                   |
| M10 | partial | My Wave uses affection and fit, but the Home payoff is not consistently a named favourite song                       |

### the feel of the room

| id  | state           | current evidence or remaining proof                                                                                     |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| F01 | closed          | `2026-08-13-wave-field` proves one shell/field and reduced-motion readability                                           |
| F02 | blocked outside | current launcher captures show the kit owning Home; physical two-metre readability is a DTX check                       |
| F03 | closed          | first view has no XP strip or competing dashboard card                                                                  |
| F04 | partial         | current warm-field captures are materially closer; aesthetic acceptance beyond the captured routes is a human judgement |
| F05 | closed          | rail is Home, Songs, Journey, and Profile; My Wave is the snare and Coach is no longer a destination                    |
| F06 | partial         | route-change motion has transition/reduced-motion proof; Journey hover's musical event semantics remain untraced        |
| F07 | closed          | obsolete Daybreak Arena and slogan copy are absent from `src/`                                                          |
| F08 | open            | no kb.15 package or installed verification exists yet; physical play then remains DTX-only                              |

## blocked outside — DTX session only

these are not code defects to chase in this audit:

1. sit down from a cold-ish start, select each labelled Home door with the DTX,
   confirm it, and confirm kick/pedal behavior feels intentional.
2. use Kit Signal to verify every physical zone arrives, maps to the intended
   lane, and ends in a saved run. The one-minute protocol is in
   [`kit-test-drill.md`](kit-test-drill.md).
3. read labels and lane colours from playing distance, run count-in, and check
   Flow against audible audio at at least one slow and one normal tempo.
4. deliberately trigger inactivity/recovery and a tutor loop; judge whether
   the checkpoint, tempo, and exit feel fair.

## new reliability findings

| rank | finding                                                                                                      | state           | evidence and smallest missing proof                                                                                                               |
| ---: | ------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | a non-zero `yt-dlp` search exit can return parsed partial stdout as success and drop `stderr`                | open            | current dirty `searchYoutube.ts:546-564`; tests cover non-zero with zero results, not non-zero with partial results                               |
|    2 | import failure after preparation and app shutdown during `importing` have no complete cleanup/readback proof | open            | current dirty `autoChart.ts:1471-1475,1574-1642`; inject `importSong` failure and shutdown, then prove no temp dir/row remains and retry is clean |
|    3 | quit/relaunch checkpoint recovery is synthetic-event coverage, not a real Electron lifecycle proof           | open            | checkpoint unit/view tests exist; run an actual close/relaunch with the same user data before claiming durable interruption recovery              |
|    4 | full-disk save handling uses an injected store failure, not a real `ENOSPC` boundary                         | partial         | existing-save preservation and error receipt are tested; force/read back a true filesystem failure if this claim matters                          |
|    5 | missing/malformed chart handling lacks a list-then-disappears end-to-end test                                | partial         | row, loader, and notation fallback paths are individually covered                                                                                 |
|    6 | first launch is covered in pieces, not as a packaged clean-profile journey                                   | open            | bootstrap, folder selection, and E2E seedless state exist; no packaged first Home → Journey → relaunch proof                                      |
|    7 | archive/streak UTC+8 storage is correct, but an app mounted across midnight has no rerender proof            | partial         | `archive.test.ts` crosses UTC+8; this is a low-risk display gap                                                                                   |
|    8 | actual DTX signal, mapping, latency, and kit feel cannot be established by synthetic MIDI                    | blocked outside | current tests simulate MIDI; perform the one-minute kit drill                                                                                     |

## ranked open list

1. make a non-zero partial `yt-dlp` result visibly fail or explicitly surface
   incompleteness; do not let automatic search look complete when its process
   failed.
2. prove automatic-import cleanup for import-stage failure and quit/shutdown,
   then commit the lane before calling one-name import a release feature.
3. run a real Electron quit/relaunch checkpoint recovery proof.
4. let free-play songs write atomic skill evidence, or state that the mastery
   model only learns from curriculum lessons.
5. package and install kb.15 only after the first four items and the DTX feel
   verdict; current manifest/artifact state is still kb.14.
6. turn more than one source favourite into a playable song; M04 cannot close
   on catalogue metadata alone.
7. decide whether a named favourite payoff is required on Home. The present
   wording has motivation, but its musical object is often implicit.

## release claims that are not yet supportable

- a signed, notarized, installed, or public kb.15 build;
- a final DMG checksum or release URL;
- source-linked automatic import as a completed/reliable release feature;
- bulk playable Yandex favourite/drum coverage;
- durable crash/quit recovery under a real Electron lifecycle;
- physical Yamaha DTX402 reliability, pedal feel, two-metre legibility, audible
  Flow sync, tutor fairness, retention, transfer, or month-scale learning
  outcomes.
