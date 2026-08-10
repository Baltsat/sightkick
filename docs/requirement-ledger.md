# Drumroll requirement and proof ledger

Last reconciled: 2026-08-10, kb.5 released, installed, and independently audited

This is the release contract for the Drumroll redesign. It maps the active
session into sequential epochs and requires evidence, not implementation
claims, before an epoch closes.

Proof states are:

- `passed` — the final integrated tree or artifact has direct repeatable proof;
- `partial` — implemented, but a named final-tree or artifact gate remains;
- `external-blocker` — all safe local work is complete, but proof needs a
  physical device, outside reviewer, or external authority;
- `missing` — no acceptable proof exists yet.

## Product promise

Put the Mac by the Yamaha DTX402, start once, and practice without walking
back to the computer. Drumroll listens locally, chooses useful work,
distinguishes Practice from Perform, detects material breakdowns, returns to a
musical checkpoint, counts in, adapts tempo, confirms clean repetitions,
continues automatically, and explains progress with saved evidence.

The first release can replace a tutor for observable timing, coordination,
reading, repertoire, and practice planning. It cannot observe grip, rebound,
posture, ergonomics, acoustic tone, or injury risk, and it must not claim
validated learning superiority until retention, transfer, and expert-reviewed
learner studies support that claim.

## Release-wide rules

| ID   | Requirement                                                                     | State  | Evidence / remaining gate                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R.01 | English product UI, technical copy, docs, release notes, and work updates.      | passed | User-facing copy scan is English; original Yandex track/artist names remain source data.                                                                                                                                                   |
| R.02 | Work autonomously and resolve normal implementation choices from this contract. | passed | Nine gated epochs and bounded implementation lanes are recorded; no routine product choice is waiting on the user.                                                                                                                         |
| R.03 | Preserve `~/box`, unrelated worktrees, and real user data.                      | passed | Product work stayed inside this repo. The pre-kb.3 live-profile backup and post-QA file are byte-identical at SHA-256 `8eca08d0db32a4a6512b33475085793e7f6c434314d5a9c2a1f9f59e7ee8d554`; scored history and personal songs are unchanged. |
| R.04 | One canonical tree with bounded agent lanes and independent verification.       | passed | The exact tagged source, signed installed app, fresh remote download, and production site passed independent product, visual, technical, and transcript audits.                                                                            |
| R.05 | Close only after every intent is passed or has a narrow outside blocker.        | passed | Every software contract is closed in kb.5; only the physical Yamaha observation, human longitudinal pedagogy, and protected-content rights remain explicitly outside local proof.                                                          |
| R.06 | Use real data and honest availability/proof language.                           | passed | Legacy summaries, insufficient evidence, unavailable media, metadata-only sources, and offline fallbacks have explicit states.                                                                                                             |

## Epoch 1 — Product truth and evidence recovery

| ID    | Requirement                                                                                                                   | State  | Evidence / remaining gate                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| E1.01 | Reconcile every active-session instruction, supplied reference, playlist, prior coding result, and method source.             | passed | `PRODUCT.md`, this ledger, design research, curriculum docs, and source manifests cover the complete brief. |
| E1.02 | Lock the zero-touch tutor contract, safe scope, and proof vocabulary.                                                         | passed | `PRODUCT.md` and tutor research match implementation terms and bounded claims.                              |
| E1.03 | Audit incumbent code, curriculum, user data, installed app, public site, signing identity, and deployment before replacement. | passed | The old installed/public kb.1 state and sparse live-profile counts were read without mutation.              |
| E1.04 | Deliver work as sequential, binary-gated epochs.                                                                              | passed | This ledger and the active plan use nine ordered epochs.                                                    |

## Epoch 2 — Kit readiness and hands-free control

| ID    | Requirement                                                                   | State            | Evidence / remaining gate                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2.01 | Treat Yamaha DTX402 as the primary kit while preserving generic MIDI support. | external-blocker | Mapping, velocity, DTX preference, reconnect, and generic-source tests pass; the physical Yamaha is disconnected, so a live route is not inferred.                                                |
| E2.02 | Reconnect the remembered or sole safe device and recover after disconnect.    | external-blocker | Session-long retry, native/Web MIDI acknowledgement, changed/locked/stale ports, failures, and recovery pass 63 lifecycle tests; repeated real cable cycles require the physical kit.             |
| E2.03 | Make setup, permissions, mapping, latency, and kit-ready state clear.         | external-blocker | The installed app shows Ready only after an exact MIDI-open acknowledgement, otherwise Reconnecting/Waiting/Choose input, and gates Play; clean physical first-run confirmation requires the kit. |
| E2.04 | Start with one Home Play action and a state-gated ready gesture.              | passed           | One deliberate kick after a quiet window starts the recommendation; pointer, keyboard, and direct on-screen fallbacks remain available and tested.                                                |
| E2.05 | Support safe kit gestures for start, pause/resume, retry/continue, and end.   | passed           | State-gated recognizer and integration tests pass; command strikes are excluded from scoring.                                                                                                     |
| E2.06 | Keep judge, tutor, persistence, and deterministic Coach usable offline.       | passed           | Local adapters and offline fallbacks are covered by renderer/main/web tests.                                                                                                                      |
| E2.07 | Preserve reduced motion, contrast, focus, keyboard, and pointer fallbacks.    | passed           | Source/headless gates pass, and the signed installed app exposes labelled controls, keyboard/pointer fallbacks, and non-color state copy throughout the acceptance route.                         |

## Epoch 3 — Autonomous Practice and Perform

| ID    | Requirement                                                                       | State  | Evidence / remaining gate                                                                                                              |
| ----- | --------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| E3.01 | Use Judge-owned final hit, miss, and wrong-pad outcomes.                          | passed | Late-hit tolerance, matching, rewind re-arming, seek, and wrong-pad tests pass.                                                        |
| E3.02 | Intervene only in Practice; keep Perform uninterrupted.                           | passed | Controlled fixtures prove Practice recovery and canonical Perform completion.                                                          |
| E3.03 | Trigger on a material musical breakdown, never one noisy hit.                     | passed | Minimum evidence, distinct-error, repeated-bar, paired-wrong-pad, and timing-spread gates are tested.                                  |
| E3.04 | Choose section-aware safe checkpoints with a lead-in and bounded fallback.        | passed | Phrase/bar fixtures and fallback tests pass.                                                                                           |
| E3.05 | Persist the failed attempt, count in, and replay the trouble phrase with context. | passed | Tutor reducer, engine/transport, timeline, and arbitrary-tick count-in tests pass.                                                     |
| E3.06 | Require clean repetitions, slow after failure, and climb to target speed.         | passed | Two-clean-pass, 0.1x step, 0.5x floor, release, and deferral tests pass.                                                               |
| E3.07 | Offer independent lives and recovery toggles.                                     | passed | Toggle combinations and one-life-per-material-failure rules are tested.                                                                |
| E3.08 | Continue after recovery and tasks with a cancellable countdown or kit command.    | passed | The visible eight-second countdown starts only after durable run-save confirmation; failure and no-evidence states pause continuation. |
| E3.09 | Save all-miss/all-wrong evidence but award nothing for untouched playback.        | passed | Persistence/reward edge-case tests pass.                                                                                               |
| E3.10 | Keep canonical, failed-recovery, and final learning evidence separate.            | passed | Chart-revision-keyed `learningEvidence`, compact recovery traces, and legacy-unavailable states are tested.                            |

## Epoch 4 — Learning intelligence and durable progress

| ID    | Requirement                                                                    | State  | Evidence / remaining gate                                                                                                         |
| ----- | ------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| E4.01 | One Play action selects the next useful, prerequisite-safe task.               | passed | Deterministic ranking covers skill/lane gap, tempo, spacing, preference, variety, fatigue, and difficulty.                        |
| E4.02 | Explain every recommendation with stored evidence and intended gain.           | passed | Home reason objects resolve to saved mastery/Coach evidence and honest fallbacks.                                                 |
| E4.03 | Join Coach findings to exact loops and matching lessons.                       | passed | Persisted finding, weak-bar, remediation, prerequisite, and cross-screen tests pass.                                              |
| E4.04 | Keep AI narrative optional over deterministic cited evidence.                  | passed | Local deterministic narrative works offline; optional provider output cannot invent unsupported bars.                             |
| E4.05 | Use interpretable recent/decayed mastery rather than lifetime vanity accuracy. | passed | Home uses a 28-day window, seven-day half-life, evidence counts, eight-sample confidence gate, trend, and insufficiency state.    |
| E4.06 | Separate recent readiness, raw accuracy, long-term mastery, and achievements.  | passed | Home and Profile label distinct windows/definitions; achievement XP is separate.                                                  |
| E4.07 | Show meaningful recent per-drum metrics on an interactive kit.                 | passed | Lane, window, raw samples, run count, trend, focus, and hit-state behavior are rendered/tested.                                   |
| E4.08 | Use stable session, schema, app, chart, and scoring identity.                  | passed | Versioned storage and atomic lesson-identity migration tests preserve identity through renumbering chains and interrupted writes. |
| E4.09 | Retain compact multi-year evidence beyond per-song detail caps.                | passed | Archive/aggregate policy, exact-alias de-duplication, and 16-revision migration regression tests preserve historical evidence.    |

## Epoch 5 — Curriculum and personal music

| ID    | Requirement                                                                                                            | State            | Evidence / remaining gate                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E5.01 | Ship a deterministic 170-exercise route grounded in the supplied method reference without copying protected prose/art. | passed           | Generator, semantic validator, and complete 170-folder/681-file package pass.                                                                                                                        |
| E5.02 | Carry stable IDs, prerequisites, skill tags, lanes, tempo, dosage, cues, transfer, and mastery rules.                  | passed           | Curriculum validator reports 170 stable IDs, 434 authored lane targets, 11 rising ladders, and reading/transfer coverage.                                                                            |
| E5.03 | Repair T1/T2/T3 identification and transfer.                                                                           | passed           | Validator proves 11 T2 exercises, all directed transitions, isolated drills, eight sweeps, five groove and two fill contexts.                                                                        |
| E5.04 | Represent every supplied Drums playlist row.                                                                           | passed           | Timestamped metadata-only manifest contains 13 rows and 11 stable source URLs, including the two unavailable-link rows.                                                                              |
| E5.05 | Represent all authenticated Yandex Favorites read-only.                                                                | passed           | Timestamped manifest contains 230 rows and 211 stable source URLs.                                                                                                                                   |
| E5.06 | Keep metadata-only, candidate, reviewed-chart, authorized-audio, and playable states distinct.                         | passed           | Candidate loader/UI never launches a metadata-only source; validators enforce availability and provenance.                                                                                           |
| E5.07 | Bundle/bootstrap all lessons on a clean desktop install.                                                               | passed           | The signed installed app exposes 170 Journey exercises across 10 seasons; the package contains 170 folders and 681 lesson files.                                                                     |
| E5.08 | Validate pedagogy and technique limits independently.                                                                  | external-blocker | Curriculum semantics and bounded claims pass independent review; retention, transfer, posture, grip, rebound, tone, tension, and injury risk require longitudinal learners and a human drum teacher. |
| E5.09 | Upgrade the former 118-lesson profile without losing or misassigning evidence.                                         | passed           | Fresh copied-profile boots produce 170 unique active lessons, 112 personal songs, and seven readable retired exercises; the second boot preserves an identical config SHA-256.                       |

## Epoch 6 — Premium app world and gameplay craft

| ID    | Requirement                                                                                               | State  | Evidence / remaining gate                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E6.01 | Use the bright Daybreak direction with premium glow rather than the dim brown World Tour cast.            | passed | Side-by-side Home/Journey/Flow/Coach comparisons and one-time Impeccable review pass the selected direction.                                                                                                              |
| E6.02 | Make Home a dramatic interactive kit cockpit with one dominant Play and granular Songs/Profile access.    | passed | Current source and rendered proof show the kit, recommendation, named navigation, recent evidence, and hit state.                                                                                                         |
| E6.03 | Provide left-to-right Flow with a fixed playhead and synchronized Classic alternative.                    | passed | Equal-viewport captures and the 1,205-note Boulevard regression prove the shared canonical note vocabulary, larger spacing, fixed playhead, beat/bar structure, current-location context, and zero hidden authored notes. |
| E6.04 | Teach T1/T2/T3 with color plus non-color identity.                                                        | passed | Stable lane position/label and yellow/blue/green styling are implemented; curriculum contains tom-heavy proof charts.                                                                                                     |
| E6.05 | Communicate anticipation, verdict, streak, danger, recovery, and completion without decorative ambiguity. | passed | Signed-app Flow capture shows the fixed playhead, hit/miss verdicts, three lives, adaptive speed change, checkpoint return, and explicit kit-command copy.                                                                |
| E6.06 | Keep the drumstick pointer bounded and preserve focus/accessibility.                                      | passed | Pointer is limited to suitable surfaces; visible keyboard focus remains.                                                                                                                                                  |
| E6.07 | Remove dead, stale, clipped, and developer-only surfaces.                                                 | passed | Source and installed-resource scans contain no Support control; installed Home, Songs, Journey, Coach, Flow, Classic, and Profile use contained layouts with no outer-page scroll at audited viewports.                   |
| E6.08 | Make results explain the weakest evidence and launch remediation quickly.                                 | passed | Result/Coach actions use persisted supported findings and one-action retry/continue/lesson paths.                                                                                                                         |

## Epoch 7 — Original product site and shared web app

| ID    | Requirement                                                                                | State  | Evidence / remaining gate                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E7.01 | Tell an original, editorial Drumroll story inspired by UNKNW craft rather than copying it. | passed | Public Chrome acceptance and `65-unknw-reference-vs-public-kb3-landing.jpg` confirm shared editorial ambition but distinct bright palette, imagery, copy, structure, and product identity. |
| E7.02 | Demonstrate the real Play → ready cue → adaptive Practice → recovery → progress loop.      | passed | Every site claim maps to implemented/tested behavior and current product imagery.                                                                                                          |
| E7.03 | Share the core renderer while stating browser/native limits honestly.                      | passed | Browser capability tests retain lessons/Web MIDI/local progress while hiding unsupported folder, My Music, YouTube search, and chart-creation controls.                                    |
| E7.04 | Use one public Drumroll identity while preserving internal compatibility identifiers.      | passed | Public UI/metadata/release copy is Drumroll; `org.sk.SightKick`, library prefix, protocol, and upstream repo remain documented compatibility boundaries.                                   |
| E7.05 | Deploy the final 170-lesson build and verify every public claim.                           | passed | Production `drumroll.pages.dev` serves the kb.5 bundle, 170-exercise claims, final imagery, exact DMG/checksum links, and honest native/browser capability boundaries.                     |

## Epoch 8 — Signed package, install, and public release

| ID    | Requirement                                                                  | State            | Evidence / remaining gate                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E8.01 | Rebuild the full integrated tree and distribution inputs.                    | passed           | The integrated tree passes 145 files/1,678 tests, typecheck, lint, desktop and web builds, 170-lesson/681-file packaging, both Yandex manifests, Cloudflare Functions compilation, FFmpeg runtime/transcriber checks, and 681 integrity hashes.                              |
| E8.02 | Build a fresh Apple Silicon package without overwriting the previous output. | passed           | Fresh kb.5 version 1.2.0, build 1.2.5 was produced from commit `cd381f1899745d85571016018401a594927daab3`; the preceding installed app is retained in `release/installed-backups`.                                                                                           |
| E8.03 | Sign with Developer ID and hardened runtime.                                 | passed           | The final app and nested code pass strict deep verification under Developer ID Application with hardened runtime enabled.                                                                                                                                                    |
| E8.04 | Notarize, staple, and pass Gatekeeper.                                       | passed           | Apple accepted the app and DMG; stapler validation and Gatekeeper assessment pass on the installed app and fresh downloaded DMG.                                                                                                                                             |
| E8.05 | Smoke-test clean and copied-real profiles without mutating live data.        | passed           | The signed installed app passed a fresh-profile 170-lesson boot and a read-only live saved-profile route; scored history and personal songs were not mutated.                                                                                                                |
| E8.06 | Publish DMG/source/checksum, verify a clean download, then deploy the site.  | passed           | GitHub release `v1.2.0-kb.5` exposes seven assets; remote digests replay, the DMG SHA-256 is `3fa4c6264a24257eaf9443202f91c8420ed48c1ff75af92129de833e96027036`, clean-download verification passes, and production is deployed.                                             |
| E8.07 | Prove the complete zero-touch loop on the physical Yamaha DTX402.            | external-blocker | The physical Yamaha/DTX device is currently disconnected, so this release does not claim a live cable-cycle result. Deterministic source coverage proves device preference, open acknowledgement, reconnection, gestures, pause/recovery, and truthful Waiting/Ready states. |

## Epoch 9 — Independent closure

| ID    | Requirement                                                                          | State  | Evidence / remaining gate                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E9.01 | Run fresh product, design, technical, and transcript audits against final artifacts. | passed | Independent reviewers inspected the exact source/tag, installed app, clean downloaded DMG, public site, minimum-viewport visuals, and complete intent matrix.              |
| E9.02 | Close every P0/P1 and triage each P2.                                                | passed | Product/transcript, visual, and technical reviewers each issued GO with no P0/P1; the three visual P2s are bounded compact-layout polish and stale-doc P2s were corrected. |
| E9.03 | Report proof states precisely and retain external limits.                            | passed | Release notes and this ledger retain explicit physical-kit, longitudinal-pedagogy, and protected-content boundaries without weakening software proof.                      |

## kb.5 corrective acceptance matrix — every active-session remark

This matrix is the transcript-level guard against declaring a polished release
while a real playing complaint remains open. `passed` below means source-level
proof only when the evidence column says so; the release is not closed until the
same behavior is reproduced from the final installed artifact.

| ID   | User-visible contract                                                                                                 | State            | Evidence / final gate                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C.01 | Put the Mac by the kit, sit down once, and complete the session without returning to the trackpad.                    | external-blocker | The full state-gated Ready, library, lesson, pause/resume, recovery, retry, and continuation route is implemented and tested; end-to-end live observation requires the connected kit.  |
| C.02 | No core screen should require outer-page scrolling at the normal laptop viewport.                                     | passed           | Installed Home, Songs, Journey, Coach, Flow, Classic, and Profile fit at 1225×768; a clean installed profile also fits the supported minimum 1024×700 viewport.                        |
| C.03 | A lesson opens directly as a lesson, waits for readiness, and starts from one deliberate kit cue with a count-in.     | passed           | Direct lesson routing, one-kick ready state, explicit count-in choice, and no mode-picker integration tests pass.                                                                      |
| C.04 | Playback must render and advance the live notation; audio-only playback is never acceptable.                          | external-blocker | Scheduling, renderer, playhead, seek, recovery, and installed visual proof pass; the final physical-input playback observation requires the connected Yamaha.                          |
| C.05 | Preserve the established lane colors and teach Tom 1/Tom 2/Tom 3 through stable color plus position/label.            | passed           | Central lane constants, renderer tests, reference legend, and tom-specific curriculum coverage pass.                                                                                   |
| C.06 | Classic notation must never delete or hide expected notes during hits, misses, rewinds, recovery, or line wrapping.   | passed           | The real 1,205-note Boulevard regression proves zero hidden authored notes across hit, miss, seek, rewind, recovery, and wrap states; installed visual proof matches.                  |
| C.07 | Flow must be readable from the kit: spacious horizontal notation, clear quarter/bar divisions, and obvious position.  | passed           | Equal-viewport proof shows the spacious horizontal score, fixed playhead, beat/bar guides, current bar/beat, and settled paused seek at kit distance.                                  |
| C.08 | Practice notation uses dark musical ink on a warm light-beige strip, never a dim dark notation board.                 | passed           | Final Flow and Classic captures use the shared warm paper strip, dark musical ink, stable colored lane identities, and consistent note vocabulary.                                     |
| C.09 | Practice timing should be learner-tolerant and match repeated same-lane notes to the nearest unhit target.            | passed           | Practice uses the wider policy window; Judge nearest-unhit regressions pass while Perform semantics remain strict.                                                                     |
| C.10 | Practice may rewind and teach; Perform must play through uninterrupted.                                               | passed           | Mode-policy, detector, machine, engine, and SongView tests keep intervention out of Perform.                                                                                           |
| C.11 | Real kit silence auto-pauses only after meaningful missed authored notes, rewinds safely, and any mapped pad resumes. | passed           | Real-time plus expected-head thresholds, authored-rest protection, forward-seek protection, checkpoint, and any-pad resume tests pass.                                                 |
| C.12 | Practice lives/checkpoints and focused recovery must end in a clear terminal state after two consecutive clean reps.  | passed           | Durable remediation queue tests prove two complete zero-error passes, task completion, preserved source identity, and return to the originating Coach review.                          |
| C.13 | Post-song weak-loop work must preserve the result/analysis context while every assigned loop is cleared.              | passed           | Coach findings create a durable finite queue keyed by exact chart content; incomplete and completed queues survive navigation/reload and return to the same source review.             |
| C.14 | Plugging in the Yamaha cable should auto-detect, prefer, open, reconnect, and expose a truthful visible status.       | external-blocker | Fresh/late cable, DTX-over-virtual-port, changed-port, open failure, disconnect, indefinite retry, and readiness transitions pass 63 tests; a real cable cycle needs the kit.          |
| C.15 | The drum kit must control Home, Songs, difficulty, selection, launch, back, ready, pause/resume, and recovery.        | external-blocker | Explicit collision-safe mappings and fresh-profile fallbacks pass route integration tests; final physical strikes require the connected kit.                                           |
| C.16 | One Play action should choose enjoyable next-zone work from lessons and previously practised/favourite songs.         | passed           | The recommendation service is isolated and deterministic, ranking prerequisites, weakness, spacing, preferred songs, fatigue, and difficulty with an evidence-based explanation.       |
| C.17 | The full learning path must include fundamentals/rudiments before songs and represent every authored lesson.          | passed           | The bundled 170-exercise, 10-season package and semantic validator cover prerequisites, tempo ladders, lane skills, reading, coordination, transfer, and bounded one-pass clear gates. |
| C.18 | Every supplied Yandex Drums playlist row and authenticated Favourite is represented without pretending audio exists.  | external-blocker | Drums has 13 rows/11 stable source URLs and Favorites has 230 rows/211 URLs; protected audio access and reviewed drum charts remain required before every row is playable.             |
| C.19 | Session history must be compact, durable, interpretable, and useful for later progress analysis.                      | passed           | Versioned practice evidence, exact chart-content revision, decayed recent mastery, lane confidence, archive compaction, and migrations have deterministic coverage.                    |
| C.20 | Home/Profile should show meaningful recent kit mastery, not vague lifetime percentages or vanity XP.                  | passed           | Recent window, half-life, sample confidence, trend, lane focus, and achievement separation are explicit in source and tests.                                                           |
| C.21 | App and website must feel intentionally designed: bright premium glow, editorial hierarchy, not stock whiteboard UI.  | passed           | Final kb.5 Home, Coach, Journey, Flow, Classic, icon, and live-site comparisons passed independent visual review with no P0/P1 and only three bounded compact-layout P2s.              |
| C.22 | Replace the generic icon with a distinctive premium Drumroll macOS icon.                                              | passed           | The warm ivory/gold snare-pulse ICNS is packaged in the installed app and used consistently across the app, release, and production site.                                              |
| C.23 | Remove “Support the project” everywhere.                                                                              | passed           | Component, settings entry points, obsolete state, source text, and installed resources contain no user-facing occurrence.                                                              |
| C.24 | Ship a signed, notarized, stapled Apple Silicon app under the available Developer ID.                                 | passed           | Exact kb.5 app and clean downloaded DMG pass Developer ID, hardened runtime, Apple notarization, stapling, and Gatekeeper verification.                                                |
| C.25 | Refresh and deploy the public site with honest capability limits and a verified current download.                     | passed           | Production serves final kb.5 visuals and exact public DMG/checksum links; Chrome and scripted release checks pass the core web route.                                                  |
| C.26 | Close only after independent product, visual, technical, and transcript reviewers find no unresolved P0/P1.           | passed           | Three independent closure lanes inspected the exact commit, installed app, clean DMG/download, public site, minimum-viewport visuals, and every contract above; each issued GO.        |

## Current release verdict

Drumroll `1.2.0-kb.5` is released, installed, notarized, and deployed from exact
commit `cd381f1899745d85571016018401a594927daab3`. Source, packaged lesson
library, signed app, fresh remote download, and public site form one verified
chain. Independent product, transcript, and visual audits report no unresolved
software P0/P1; the final technical verdict is recorded in Epoch 9.

Three outside proof limits remain and are not inferred from software tests: a
real Yamaha cable-cycle and complete physical playing session, longitudinal
learner/teacher evidence for retention and technique, and lawful access plus
reviewed charts for protected Yandex audio. These boundaries do not block the
software release and remain explicit wherever availability or efficacy is
described.
