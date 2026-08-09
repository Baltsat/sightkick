# Drumroll requirement and proof ledger

Last reconciled: 2026-08-09, integrated source freeze

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

| ID   | Requirement                                                                     | State   | Evidence / remaining gate                                                                                                      |
| ---- | ------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| R.01 | English product UI, technical copy, docs, release notes, and work updates.      | passed  | User-facing copy scan is English; original Yandex track/artist names remain source data.                                       |
| R.02 | Work autonomously and resolve normal implementation choices from this contract. | passed  | Nine gated epochs and bounded implementation lanes are recorded; no routine product choice is waiting on the user.             |
| R.03 | Preserve `~/box`, unrelated worktrees, and real user data.                      | passed  | Product work stayed inside this repo; QA uses isolated or copied profiles and never rewrites the live profile.                 |
| R.04 | One canonical tree with bounded agent lanes and independent verification.       | passed  | Learning, release, and visual lanes finished; root reran the integrated gates.                                                 |
| R.05 | Close only after every intent is passed or has a narrow outside blocker.        | partial | Fresh final transcript/artifact audit remains Epoch 9.                                                                         |
| R.06 | Use real data and honest availability/proof language.                           | passed  | Legacy summaries, insufficient evidence, unavailable media, metadata-only sources, and offline fallbacks have explicit states. |

## Epoch 1 — Product truth and evidence recovery

| ID    | Requirement                                                                                                                   | State  | Evidence / remaining gate                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| E1.01 | Reconcile every active-session instruction, supplied reference, playlist, prior coding result, and method source.             | passed | `PRODUCT.md`, this ledger, design research, curriculum docs, and source manifests cover the complete brief. |
| E1.02 | Lock the zero-touch tutor contract, safe scope, and proof vocabulary.                                                         | passed | `PRODUCT.md` and tutor research match implementation terms and bounded claims.                              |
| E1.03 | Audit incumbent code, curriculum, user data, installed app, public site, signing identity, and deployment before replacement. | passed | The old installed/public kb.1 state and sparse live-profile counts were read without mutation.              |
| E1.04 | Deliver work as sequential, binary-gated epochs.                                                                              | passed | This ledger and the active plan use nine ordered epochs.                                                    |

## Epoch 2 — Kit readiness and hands-free control

| ID    | Requirement                                                                   | State   | Evidence / remaining gate                                                                                     |
| ----- | ----------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| E2.01 | Treat Yamaha DTX402 as the primary kit while preserving generic MIDI support. | partial | Mapping, velocity, reconnect, and generic-source tests pass; the physical DTX402 is currently disconnected.   |
| E2.02 | Reconnect the remembered or sole safe device and recover after disconnect.    | partial | Deterministic input tests pass; five real cable cycles remain physical proof.                                 |
| E2.03 | Make setup, permissions, mapping, latency, and kit-ready state clear.         | partial | UI/source proof passes; clean physical first-run remains external.                                            |
| E2.04 | Start with one Home Play action and a state-gated ready gesture.              | passed  | Fixed four-hit recognition, quiet-window cancellation, Home prompt, and pointer/keyboard fallback tests pass. |
| E2.05 | Support safe kit gestures for start, pause/resume, retry/continue, and end.   | passed  | State-gated recognizer and integration tests pass; command strikes are excluded from scoring.                 |
| E2.06 | Keep judge, tutor, persistence, and deterministic Coach usable offline.       | passed  | Local adapters and offline fallbacks are covered by renderer/main/web tests.                                  |
| E2.07 | Preserve reduced motion, contrast, focus, keyboard, and pointer fallbacks.    | partial | Source and headless proof pass; signed packaged-app walkthrough remains Epoch 8.                              |

## Epoch 3 — Autonomous Practice and Perform

| ID    | Requirement                                                                       | State  | Evidence / remaining gate                                                                                   |
| ----- | --------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| E3.01 | Use Judge-owned final hit, miss, and wrong-pad outcomes.                          | passed | Late-hit tolerance, matching, rewind re-arming, seek, and wrong-pad tests pass.                             |
| E3.02 | Intervene only in Practice; keep Perform uninterrupted.                           | passed | Controlled fixtures prove Practice recovery and canonical Perform completion.                               |
| E3.03 | Trigger on a material musical breakdown, never one noisy hit.                     | passed | Minimum evidence, distinct-error, repeated-bar, paired-wrong-pad, and timing-spread gates are tested.       |
| E3.04 | Choose section-aware safe checkpoints with a lead-in and bounded fallback.        | passed | Phrase/bar fixtures and fallback tests pass.                                                                |
| E3.05 | Persist the failed attempt, count in, and replay the trouble phrase with context. | passed | Tutor reducer, engine/transport, timeline, and arbitrary-tick count-in tests pass.                          |
| E3.06 | Require clean repetitions, slow after failure, and climb to target speed.         | passed | Two-clean-pass, 0.1x step, 0.5x floor, release, and deferral tests pass.                                    |
| E3.07 | Offer independent lives and recovery toggles.                                     | passed | Toggle combinations and one-life-per-material-failure rules are tested.                                     |
| E3.08 | Continue after recovery and tasks with a cancellable countdown or kit command.    | passed | Persistent auto-continue setting and visible eight-second result countdown tests pass.                      |
| E3.09 | Save all-miss/all-wrong evidence but award nothing for untouched playback.        | passed | Persistence/reward edge-case tests pass.                                                                    |
| E3.10 | Keep canonical, failed-recovery, and final learning evidence separate.            | passed | Chart-revision-keyed `learningEvidence`, compact recovery traces, and legacy-unavailable states are tested. |

## Epoch 4 — Learning intelligence and durable progress

| ID    | Requirement                                                                    | State  | Evidence / remaining gate                                                                                                      |
| ----- | ------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| E4.01 | One Play action selects the next useful, prerequisite-safe task.               | passed | Deterministic ranking covers skill/lane gap, tempo, spacing, preference, variety, fatigue, and difficulty.                     |
| E4.02 | Explain every recommendation with stored evidence and intended gain.           | passed | Home reason objects resolve to saved mastery/Coach evidence and honest fallbacks.                                              |
| E4.03 | Join Coach findings to exact loops and matching lessons.                       | passed | Persisted finding, weak-bar, remediation, prerequisite, and cross-screen tests pass.                                           |
| E4.04 | Keep AI narrative optional over deterministic cited evidence.                  | passed | Local deterministic narrative works offline; optional provider output cannot invent unsupported bars.                          |
| E4.05 | Use interpretable recent/decayed mastery rather than lifetime vanity accuracy. | passed | Home uses a 28-day window, seven-day half-life, evidence counts, eight-sample confidence gate, trend, and insufficiency state. |
| E4.06 | Separate recent readiness, raw accuracy, long-term mastery, and achievements.  | passed | Home and Profile label distinct windows/definitions; achievement XP is separate.                                               |
| E4.07 | Show meaningful recent per-drum metrics on an interactive kit.                 | passed | Lane, window, raw samples, run count, trend, focus, and hit-state behavior are rendered/tested.                                |
| E4.08 | Use stable session, schema, app, chart, and scoring identity.                  | passed | Versioned storage and migration/legacy tests preserve identity and evidence limits.                                            |
| E4.09 | Retain compact multi-year evidence beyond per-song detail caps.                | passed | Archive/aggregate policy and regression tests preserve historical trend availability.                                          |

## Epoch 5 — Curriculum and personal music

| ID    | Requirement                                                                                                            | State   | Evidence / remaining gate                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| E5.01 | Ship a deterministic 170-exercise route grounded in the supplied method reference without copying protected prose/art. | passed  | Generator, semantic validator, and complete 170-folder/681-file package pass.                                                                 |
| E5.02 | Carry stable IDs, prerequisites, skill tags, lanes, tempo, dosage, cues, transfer, and mastery rules.                  | passed  | Curriculum validator reports 170 stable IDs, 434 authored lane targets, 11 rising ladders, and reading/transfer coverage.                     |
| E5.03 | Repair T1/T2/T3 identification and transfer.                                                                           | passed  | Validator proves 11 T2 exercises, all directed transitions, isolated drills, eight sweeps, five groove and two fill contexts.                 |
| E5.04 | Represent every supplied Drums playlist row.                                                                           | passed  | Timestamped metadata-only manifest contains 13 rows and 11 stable source URLs, including the two unavailable-link rows.                       |
| E5.05 | Represent all authenticated Yandex Favorites read-only.                                                                | passed  | Timestamped manifest contains 230 rows and 211 stable source URLs.                                                                            |
| E5.06 | Keep metadata-only, candidate, reviewed-chart, authorized-audio, and playable states distinct.                         | passed  | Candidate loader/UI never launches a metadata-only source; validators enforce availability and provenance.                                    |
| E5.07 | Bundle/bootstrap all lessons on a clean desktop install.                                                               | partial | Packaging integrity is green; signed clean-profile installation is Epoch 8.                                                                   |
| E5.08 | Validate pedagogy and technique limits independently.                                                                  | partial | Curriculum semantics and bounded claims pass automated review; human drum-teacher/learner retention and transfer study remains outside proof. |

## Epoch 6 — Premium app world and gameplay craft

| ID    | Requirement                                                                                               | State   | Evidence / remaining gate                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| E6.01 | Use the bright Daybreak direction with premium glow rather than the dim brown World Tour cast.            | passed  | Side-by-side Home/Journey/Flow/Coach comparisons and one-time Impeccable review pass the selected direction.          |
| E6.02 | Make Home a dramatic interactive kit cockpit with one dominant Play and granular Songs/Profile access.    | passed  | Current source and rendered proof show the kit, recommendation, named navigation, recent evidence, and hit state.     |
| E6.03 | Provide left-to-right Flow with a fixed playhead and synchronized Classic alternative.                    | passed  | Flow is enlarged 1.5x for one-to-two-metre viewing; mode, seek, speed, loop, and camera tests pass.                   |
| E6.04 | Teach T1/T2/T3 with color plus non-color identity.                                                        | passed  | Stable lane position/label and yellow/blue/green styling are implemented; curriculum contains tom-heavy proof charts. |
| E6.05 | Communicate anticipation, verdict, streak, danger, recovery, and completion without decorative ambiguity. | partial | Source/headless states pass; packaged motion/interaction capture remains Epoch 8.                                     |
| E6.06 | Keep the drumstick pointer bounded and preserve focus/accessibility.                                      | passed  | Pointer is limited to suitable surfaces; visible keyboard focus remains.                                              |
| E6.07 | Remove dead, stale, clipped, and developer-only surfaces.                                                 | partial | Core empty/sparse/rich states pass; final packaged viewport matrix remains Epoch 8.                                   |
| E6.08 | Make results explain the weakest evidence and launch remediation quickly.                                 | passed  | Result/Coach actions use persisted supported findings and one-action retry/continue/lesson paths.                     |

## Epoch 7 — Original product site and shared web app

| ID    | Requirement                                                                                | State   | Evidence / remaining gate                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E7.01 | Tell an original, editorial Drumroll story inspired by UNKNW craft rather than copying it. | partial | Complete responsive source and captures exist; fresh post-freeze full-page comparison remains.                                                           |
| E7.02 | Demonstrate the real Play → ready cue → adaptive Practice → recovery → progress loop.      | passed  | Every site claim maps to implemented/tested behavior and current product imagery.                                                                        |
| E7.03 | Share the core renderer while stating browser/native limits honestly.                      | passed  | Direct `?app=1`, 170-lesson web library, Web MIDI adapter, local persistence, and capability copy are tested.                                            |
| E7.04 | Use one public Drumroll identity while preserving internal compatibility identifiers.      | passed  | Public UI/metadata/release copy is Drumroll; `org.sk.SightKick`, library prefix, protocol, and upstream repo remain documented compatibility boundaries. |
| E7.05 | Deploy the final 170-lesson build and verify every public claim.                           | missing | Deployment is intentionally gated on notarized artifact and exact public release readback.                                                               |

## Epoch 8 — Signed package, install, and public release

| ID    | Requirement                                                                  | State            | Evidence / remaining gate                                                                                                                  |
| ----- | ---------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| E8.01 | Rebuild the full integrated tree and distribution inputs.                    | passed           | Typecheck, lint, 1,540 tests, desktop/web builds, curriculum, Yandex, Cloudflare Functions, FFmpeg, transcriber, and integrity gates pass. |
| E8.02 | Build a fresh Apple Silicon package without overwriting the previous output. | missing          | Credentialed `release:build:mac:api-key` run is next.                                                                                      |
| E8.03 | Sign with Developer ID and hardened runtime.                                 | missing          | Final `codesign --deep --strict` and authority/runtime readback required.                                                                  |
| E8.04 | Notarize, staple, and pass Gatekeeper.                                       | missing          | Apple Accepted result, stapler validation, and `spctl` acceptance required.                                                                |
| E8.05 | Smoke-test clean and copied-real profiles without mutating live data.        | missing          | Packaged Home/Songs/Journey/Practice/Coach/Profile flow and 170/13/230 counts required.                                                    |
| E8.06 | Publish DMG/source/checksum, verify a clean download, then deploy the site.  | missing          | Exact public HTTP, SHA-256, release, production manifest, and deployment readback required.                                                |
| E8.07 | Prove the complete zero-touch loop on the physical Yamaha DTX402.            | external-blocker | The kit is disconnected; real ready → play → recovery → pause/resume → result → continue/end remains physical proof.                       |

## Epoch 9 — Independent closure

| ID    | Requirement                                                                          | State   | Evidence / remaining gate                                                                        |
| ----- | ------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| E9.01 | Run fresh product, design, technical, and transcript audits against final artifacts. | missing | Independent reviewers must inspect the signed build, public site, and this ledger after Epoch 8. |
| E9.02 | Close every P0/P1 and triage each P2.                                                | partial | First audit findings were fixed or converted to explicit artifact/physical gates; rerun remains. |
| E9.03 | Report proof states precisely and retain external limits.                            | partial | Final handoff must separate source, package, notarization, public, and physical-device proof.    |

## Current release verdict

The integrated source is locally green and the core tutor, learning, curriculum,
library, and visual-system requirements are implemented. Release closure is
still **pending** the credentialed package, packaged-app QA, public readback,
and fresh independent artifact audit. Physical DTX402 and human learning-
efficacy validation remain explicit outside proof rather than being guessed.
