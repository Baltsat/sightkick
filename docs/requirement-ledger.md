# Drumroll requirement and proof ledger

Last reconciled: 2026-08-10, kb.4 published-artifact closure

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
| R.04 | One canonical tree with bounded agent lanes and independent verification.       | passed | The kb.4 source, visual, and release-artifact lanes all returned zero P0/P1 after the independent contrast and deployment-provenance findings were fixed.                                                                                  |
| R.05 | Close only after every intent is passed or has a narrow outside blocker.        | passed | Exact package, clean download, installation, public deployment, and final independent audits pass; only physical-kit behavior and longitudinal learning efficacy remain outside evidence.                                                  |
| R.06 | Use real data and honest availability/proof language.                           | passed | Legacy summaries, insufficient evidence, unavailable media, metadata-only sources, and offline fallbacks have explicit states.                                                                                                             |

## Epoch 1 — Product truth and evidence recovery

| ID    | Requirement                                                                                                                   | State  | Evidence / remaining gate                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| E1.01 | Reconcile every active-session instruction, supplied reference, playlist, prior coding result, and method source.             | passed | `PRODUCT.md`, this ledger, design research, curriculum docs, and source manifests cover the complete brief. |
| E1.02 | Lock the zero-touch tutor contract, safe scope, and proof vocabulary.                                                         | passed | `PRODUCT.md` and tutor research match implementation terms and bounded claims.                              |
| E1.03 | Audit incumbent code, curriculum, user data, installed app, public site, signing identity, and deployment before replacement. | passed | The old installed/public kb.1 state and sparse live-profile counts were read without mutation.              |
| E1.04 | Deliver work as sequential, binary-gated epochs.                                                                              | passed | This ledger and the active plan use nine ordered epochs.                                                    |

## Epoch 2 — Kit readiness and hands-free control

| ID    | Requirement                                                                   | State   | Evidence / remaining gate                                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2.01 | Treat Yamaha DTX402 as the primary kit while preserving generic MIDI support. | partial | Mapping, velocity, reconnect, and generic-source tests pass; the physical DTX402 is currently disconnected.                                                                                   |
| E2.02 | Reconnect the remembered or sole safe device and recover after disconnect.    | partial | Enumeration-confirmed ports use bounded session-long retry; native/Web MIDI open acknowledgement, locked-port, and stale-port regressions pass. Five real cable cycles remain physical proof. |
| E2.03 | Make setup, permissions, mapping, latency, and kit-ready state clear.         | partial | Home shows Ready only after an exact MIDI-open acknowledgement, otherwise Waiting or Choose input, and gates Play; clean physical first-run remains external.                                 |
| E2.04 | Start with one Home Play action and a state-gated ready gesture.              | passed  | Fixed four-hit recognition, quiet-window cancellation, Home prompt, and pointer/keyboard fallback tests pass.                                                                                 |
| E2.05 | Support safe kit gestures for start, pause/resume, retry/continue, and end.   | passed  | State-gated recognizer and integration tests pass; command strikes are excluded from scoring.                                                                                                 |
| E2.06 | Keep judge, tutor, persistence, and deterministic Coach usable offline.       | passed  | Local adapters and offline fallbacks are covered by renderer/main/web tests.                                                                                                                  |
| E2.07 | Preserve reduced motion, contrast, focus, keyboard, and pointer fallbacks.    | passed  | Source/headless gates pass, and the signed installed app exposes labelled controls, keyboard/pointer fallbacks, and non-color state copy throughout the acceptance route.                     |

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

| ID    | Requirement                                                                                                            | State   | Evidence / remaining gate                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E5.01 | Ship a deterministic 170-exercise route grounded in the supplied method reference without copying protected prose/art. | passed  | Generator, semantic validator, and complete 170-folder/681-file package pass.                                                                                                  |
| E5.02 | Carry stable IDs, prerequisites, skill tags, lanes, tempo, dosage, cues, transfer, and mastery rules.                  | passed  | Curriculum validator reports 170 stable IDs, 434 authored lane targets, 11 rising ladders, and reading/transfer coverage.                                                      |
| E5.03 | Repair T1/T2/T3 identification and transfer.                                                                           | passed  | Validator proves 11 T2 exercises, all directed transitions, isolated drills, eight sweeps, five groove and two fill contexts.                                                  |
| E5.04 | Represent every supplied Drums playlist row.                                                                           | passed  | Timestamped metadata-only manifest contains 13 rows and 11 stable source URLs, including the two unavailable-link rows.                                                        |
| E5.05 | Represent all authenticated Yandex Favorites read-only.                                                                | passed  | Timestamped manifest contains 230 rows and 211 stable source URLs.                                                                                                             |
| E5.06 | Keep metadata-only, candidate, reviewed-chart, authorized-audio, and playable states distinct.                         | passed  | Candidate loader/UI never launches a metadata-only source; validators enforce availability and provenance.                                                                     |
| E5.07 | Bundle/bootstrap all lessons on a clean desktop install.                                                               | passed  | The signed installed app exposes 170 Journey exercises across 10 seasons; the package contains 170 folders and 681 lesson files.                                               |
| E5.08 | Validate pedagogy and technique limits independently.                                                                  | partial | Curriculum semantics and bounded claims pass automated review; human drum-teacher/learner retention and transfer study remains outside proof.                                  |
| E5.09 | Upgrade the former 118-lesson profile without losing or misassigning evidence.                                         | passed  | Fresh copied-profile boots produce 170 unique active lessons, 112 personal songs, and seven readable retired exercises; the second boot preserves an identical config SHA-256. |

## Epoch 6 — Premium app world and gameplay craft

| ID    | Requirement                                                                                               | State  | Evidence / remaining gate                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E6.01 | Use the bright Daybreak direction with premium glow rather than the dim brown World Tour cast.            | passed | Side-by-side Home/Journey/Flow/Coach comparisons and one-time Impeccable review pass the selected direction.                                               |
| E6.02 | Make Home a dramatic interactive kit cockpit with one dominant Play and granular Songs/Profile access.    | passed | Current source and rendered proof show the kit, recommendation, named navigation, recent evidence, and hit state.                                          |
| E6.03 | Provide left-to-right Flow with a fixed playhead and synchronized Classic alternative.                    | passed | Flow is enlarged 1.65x for one-to-two-metre viewing; mode, seek, speed, loop, and camera tests pass.                                                       |
| E6.04 | Teach T1/T2/T3 with color plus non-color identity.                                                        | passed | Stable lane position/label and yellow/blue/green styling are implemented; curriculum contains tom-heavy proof charts.                                      |
| E6.05 | Communicate anticipation, verdict, streak, danger, recovery, and completion without decorative ambiguity. | passed | Signed-app Flow capture shows the fixed playhead, hit/miss verdicts, three lives, adaptive speed change, checkpoint return, and explicit kit-command copy. |
| E6.06 | Keep the drumstick pointer bounded and preserve focus/accessibility.                                      | passed | Pointer is limited to suitable surfaces; visible keyboard focus remains.                                                                                   |
| E6.07 | Remove dead, stale, clipped, and developer-only surfaces.                                                 | passed | The exact installed app and public site reproduce the corrected warm-paper Flow strip, complete eight-lane key, dark musical ink, and unclipped Tutor HUD. |
| E6.08 | Make results explain the weakest evidence and launch remediation quickly.                                 | passed | Result/Coach actions use persisted supported findings and one-action retry/continue/lesson paths.                                                          |

## Epoch 7 — Original product site and shared web app

| ID    | Requirement                                                                                | State  | Evidence / remaining gate                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E7.01 | Tell an original, editorial Drumroll story inspired by UNKNW craft rather than copying it. | passed | Public Chrome acceptance and `65-unknw-reference-vs-public-kb3-landing.jpg` confirm shared editorial ambition but distinct bright palette, imagery, copy, structure, and product identity.        |
| E7.02 | Demonstrate the real Play → ready cue → adaptive Practice → recovery → progress loop.      | passed | Every site claim maps to implemented/tested behavior and current product imagery.                                                                                                                 |
| E7.03 | Share the core renderer while stating browser/native limits honestly.                      | passed | Browser capability tests retain lessons/Web MIDI/local progress while hiding unsupported folder, My Music, YouTube search, and chart-creation controls.                                           |
| E7.04 | Use one public Drumroll identity while preserving internal compatibility identifiers.      | passed | Public UI/metadata/release copy is Drumroll; `org.sk.SightKick`, library prefix, protocol, and upstream repo remain documented compatibility boundaries.                                          |
| E7.05 | Deploy the final 170-lesson build and verify every public claim.                           | passed | Production deployment `52d7ce9d-bb6d-46b7-b99e-ae87424281cb` reports Source `f3e1656`; Chrome readback confirms the kb.4 DMG/checksum links, 170 lessons, current Flow image, and browser limits. |

## Epoch 8 — Signed package, install, and public release

| ID    | Requirement                                                                  | State            | Evidence / remaining gate                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E8.01 | Rebuild the full integrated tree and distribution inputs.                    | passed           | Typecheck, lint, 1,592 tests across 135 files, desktop/web builds, curriculum, Yandex, Cloudflare Functions, FFmpeg, transcriber, and integrity gates pass.                            |
| E8.02 | Build a fresh Apple Silicon package without overwriting the previous output. | passed           | `release/kb4-final-460b31b` was built from accepted app-source commit `460b31b`; prior release outputs and the pre-final installed app remain recoverable.                             |
| E8.03 | Sign with Developer ID and hardened runtime.                                 | passed           | The exact app and nested code pass signature validation, hardened-runtime checks, entitlements, and Team ID `3BGK34ZGS6` readback.                                                     |
| E8.04 | Notarize, staple, and pass Gatekeeper.                                       | passed           | Apple submission `fb0fafb4-c0af-493e-9830-e57a4dd06656` is Accepted; both app and DMG tickets validate and both Gatekeeper assessments pass.                                           |
| E8.05 | Smoke-test clean and copied-real profiles without mutating live data.        | passed           | `/Applications/Drumroll.app` passes the full verifier and real-window Home/Flow acceptance; live profile and backup remain byte-identical at SHA-256 `8eca08d0…`.                      |
| E8.06 | Publish DMG/source/checksum, verify a clean download, then deploy the site.  | passed           | `v1.2.0-kb.4` publishes exactly seven assets; all remote digests match, `/tmp/drumroll-kb4-clean.tC7DEh` replays every checksum and the full DMG verifier, and Pages source is sealed. |
| E8.07 | Prove the complete zero-touch loop on the physical Yamaha DTX402.            | external-blocker | macOS now detects the active Yamaha USB device and the installed app reports `DTX Drums ready`; the user's live play session is the remaining end-to-end recovery/pause/result proof.  |

## Epoch 9 — Independent closure

| ID    | Requirement                                                                          | State  | Evidence / remaining gate                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E9.01 | Run fresh product, design, technical, and transcript audits against final artifacts. | passed | Independent source, design, and final release-artifact reviewers inspected the exact source, installed app, clean DMG, public site, and live-profile hashes.                       |
| E9.02 | Close every P0/P1 and triage each P2.                                                | passed | Final independent verdicts are zero P0/P1. Release metadata now names exact commit `460b31b`; the remaining unsigned annotated tag note does not weaken Apple-signed binary proof. |
| E9.03 | Report proof states precisely and retain external limits.                            | passed | Release notes and this ledger distinguish source, signed package, notarization, installation, public deployment, physical-kit proof, and efficacy limits.                          |

## Current release verdict

Drumroll `1.2.0-kb.4` is green at source, visual, package, notarization,
installation, clean-download, public-deployment, and independent-audit gates.
The GitHub tag peels exactly to app-source commit `460b31b`; the public site is
sealed to web-source commit `f3e1656`; the installed build is `1.2.4`; and all
final reviewers report zero P0/P1. The connected Yamaha DTX device and exact
native port are now Ready in the installed app. The user's active play session
remains the honest proof for physical latency, mappings, kit gestures, and the
complete zero-touch recovery loop. Longitudinal learning efficacy and
injury-safety limits remain external rather than being inferred from software
tests.
