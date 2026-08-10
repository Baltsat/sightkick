# Drumroll requirement and proof ledger

Last reconciled: 2026-08-10, kb.5 corrective release in progress

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

| ID   | Requirement                                                                     | State   | Evidence / remaining gate                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R.01 | English product UI, technical copy, docs, release notes, and work updates.      | passed  | User-facing copy scan is English; original Yandex track/artist names remain source data.                                                                                                                                                   |
| R.02 | Work autonomously and resolve normal implementation choices from this contract. | passed  | Nine gated epochs and bounded implementation lanes are recorded; no routine product choice is waiting on the user.                                                                                                                         |
| R.03 | Preserve `~/box`, unrelated worktrees, and real user data.                      | passed  | Product work stayed inside this repo. The pre-kb.3 live-profile backup and post-QA file are byte-identical at SHA-256 `8eca08d0db32a4a6512b33475085793e7f6c434314d5a9c2a1f9f59e7ee8d554`; scored history and personal songs are unchanged. |
| R.04 | One canonical tree with bounded agent lanes and independent verification.       | partial | kb.5 implementation lanes share this tree; their focused proofs pass, but the final integrated audit has not run yet.                                                                                                                      |
| R.05 | Close only after every intent is passed or has a narrow outside blocker.        | partial | The kb.4 release remains recoverable. kb.5 must still pass integrated tests, rendered comparison, signing, notarization, installation, clean download, deployment, and final independent audit.                                            |
| R.06 | Use real data and honest availability/proof language.                           | passed  | Legacy summaries, insufficient evidence, unavailable media, metadata-only sources, and offline fallbacks have explicit states.                                                                                                             |

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
| E2.04 | Start with one Home Play action and a state-gated ready gesture.              | passed  | One deliberate kick after a quiet window starts the recommendation; pointer, keyboard, and direct on-screen fallbacks remain available and tested.                                            |
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

| ID    | Requirement                                                                                               | State   | Evidence / remaining gate                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E6.01 | Use the bright Daybreak direction with premium glow rather than the dim brown World Tour cast.            | passed  | Side-by-side Home/Journey/Flow/Coach comparisons and one-time Impeccable review pass the selected direction.                                                                                                              |
| E6.02 | Make Home a dramatic interactive kit cockpit with one dominant Play and granular Songs/Profile access.    | passed  | Current source and rendered proof show the kit, recommendation, named navigation, recent evidence, and hit state.                                                                                                         |
| E6.03 | Provide left-to-right Flow with a fixed playhead and synchronized Classic alternative.                    | passed  | Equal-viewport captures and the 1,205-note Boulevard regression prove the shared canonical note vocabulary, larger spacing, fixed playhead, beat/bar structure, current-location context, and zero hidden authored notes. |
| E6.04 | Teach T1/T2/T3 with color plus non-color identity.                                                        | passed  | Stable lane position/label and yellow/blue/green styling are implemented; curriculum contains tom-heavy proof charts.                                                                                                     |
| E6.05 | Communicate anticipation, verdict, streak, danger, recovery, and completion without decorative ambiguity. | passed  | Signed-app Flow capture shows the fixed playhead, hit/miss verdicts, three lives, adaptive speed change, checkpoint return, and explicit kit-command copy.                                                                |
| E6.06 | Keep the drumstick pointer bounded and preserve focus/accessibility.                                      | passed  | Pointer is limited to suitable surfaces; visible keyboard focus remains.                                                                                                                                                  |
| E6.07 | Remove dead, stale, clipped, and developer-only surfaces.                                                 | partial | Support controls are removed in source and the Tutor HUD is bounded, but the final kb.5 installed-app sweep for clipping, stale assets, and outer scrolling is pending.                                                   |
| E6.08 | Make results explain the weakest evidence and launch remediation quickly.                                 | passed  | Result/Coach actions use persisted supported findings and one-action retry/continue/lesson paths.                                                                                                                         |

## Epoch 7 — Original product site and shared web app

| ID    | Requirement                                                                                | State   | Evidence / remaining gate                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E7.01 | Tell an original, editorial Drumroll story inspired by UNKNW craft rather than copying it. | passed  | Public Chrome acceptance and `65-unknw-reference-vs-public-kb3-landing.jpg` confirm shared editorial ambition but distinct bright palette, imagery, copy, structure, and product identity. |
| E7.02 | Demonstrate the real Play → ready cue → adaptive Practice → recovery → progress loop.      | passed  | Every site claim maps to implemented/tested behavior and current product imagery.                                                                                                          |
| E7.03 | Share the core renderer while stating browser/native limits honestly.                      | passed  | Browser capability tests retain lessons/Web MIDI/local progress while hiding unsupported folder, My Music, YouTube search, and chart-creation controls.                                    |
| E7.04 | Use one public Drumroll identity while preserving internal compatibility identifiers.      | passed  | Public UI/metadata/release copy is Drumroll; `org.sk.SightKick`, library prefix, protocol, and upstream repo remain documented compatibility boundaries.                                   |
| E7.05 | Deploy the final 170-lesson build and verify every public claim.                           | partial | The kb.4 deployment remains verified. kb.5 must replace its screenshots, release links, checksums, and claims only after the new installed build passes.                                   |

## Epoch 8 — Signed package, install, and public release

| ID    | Requirement                                                                  | State            | Evidence / remaining gate                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E8.01 | Rebuild the full integrated tree and distribution inputs.                    | passed           | The integrated tree passes 145 files/1,678 tests, typecheck, lint, desktop and web builds, 170-lesson/681-file packaging, both Yandex manifests, Cloudflare Functions compilation, FFmpeg runtime/transcriber checks, and 681 integrity hashes.                              |
| E8.02 | Build a fresh Apple Silicon package without overwriting the previous output. | partial          | `release/kb4-final-460b31b` is preserved. A visual-only kb.5 package is explicitly non-release; a fresh accepted-source kb.5 output remains to be built.                                                                                                                     |
| E8.03 | Sign with Developer ID and hardened runtime.                                 | partial          | The signing identity is available and proven on kb.4; the final kb.5 app and nested code have not yet been signed or read back.                                                                                                                                              |
| E8.04 | Notarize, staple, and pass Gatekeeper.                                       | partial          | kb.4 remains notarized. No notarization claim applies to the final kb.5 artifact until Apple accepts it and both app/DMG tickets and Gatekeeper are verified.                                                                                                                |
| E8.05 | Smoke-test clean and copied-real profiles without mutating live data.        | partial          | Live data remains out of scope for mutation. Fresh and copied-profile acceptance must be repeated against the final installed kb.5 build.                                                                                                                                    |
| E8.06 | Publish DMG/source/checksum, verify a clean download, then deploy the site.  | partial          | kb.4 remains public and recoverable. kb.5 publication, remote digest replay, clean download verification, and site deployment are intentionally downstream of installed-app proof.                                                                                           |
| E8.07 | Prove the complete zero-touch loop on the physical Yamaha DTX402.            | external-blocker | The physical Yamaha/DTX device is currently disconnected, so this release does not claim a live cable-cycle result. Deterministic source coverage proves device preference, open acknowledgement, reconnection, gestures, pause/recovery, and truthful Waiting/Ready states. |

## Epoch 9 — Independent closure

| ID    | Requirement                                                                          | State   | Evidence / remaining gate                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E9.01 | Run fresh product, design, technical, and transcript audits against final artifacts. | partial | Prior kb.4 reviews are historical evidence only. Fresh kb.5 reviewers must inspect the exact source, installed app, clean DMG, public site, and intent matrix. |
| E9.02 | Close every P0/P1 and triage each P2.                                                | partial | The kb.5 independent audit has not issued its terminal verdict.                                                                                                |
| E9.03 | Report proof states precisely and retain external limits.                            | partial | This ledger now demotes stale kb.4 artifact claims. Final release notes must retain physical-kit and longitudinal-efficacy limits.                             |

## kb.5 corrective acceptance matrix — every active-session remark

This matrix is the transcript-level guard against declaring a polished release
while a real playing complaint remains open. `passed` below means source-level
proof only when the evidence column says so; the release is not closed until the
same behavior is reproduced from the final installed artifact.

| ID   | User-visible contract                                                                                                 | State   | Evidence / final gate                                                                                                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C.01 | Put the Mac by the kit, sit down once, and complete the session without returning to the trackpad.                    | partial | Ready, library, lesson, pause/resume, recovery, retry, and continuation gestures have deterministic coverage; the complete installed physical-kit route remains.                                    |
| C.02 | No core screen should require outer-page scrolling at the normal laptop viewport.                                     | partial | Home and Journey were compacted; final 1225×768 installed captures must prove Home, Songs, Journey, Flow, Classic, Coach, Results, and Profile.                                                     |
| C.03 | A lesson opens directly as a lesson, waits for readiness, and starts from one deliberate kit cue with a count-in.     | passed  | Direct lesson routing, one-kick ready state, explicit count-in choice, and no mode-picker integration tests pass.                                                                                   |
| C.04 | Playback must render and advance the live notation; audio-only playback is never acceptable.                          | partial | Engine/renderer/SongView integrations cover scheduling and playhead updates; final installed capture and physical input playback remain.                                                            |
| C.05 | Preserve the established lane colors and teach Tom 1/Tom 2/Tom 3 through stable color plus position/label.            | passed  | Central lane constants, renderer tests, reference legend, and tom-specific curriculum coverage pass.                                                                                                |
| C.06 | Classic notation must never delete or hide expected notes during hits, misses, rewinds, recovery, or line wrapping.   | partial | A dedicated kb.5 renderer regression lane is active; final source and installed visual proof are not yet closed.                                                                                    |
| C.07 | Flow must be readable from the kit: spacious horizontal notation, clear quarter/bar divisions, and obvious position.  | partial | A dedicated kb.5 Flow lane is increasing measure density and adding explicit beat/bar/current-location context; equal-viewport comparison remains.                                                  |
| C.08 | Practice notation uses dark musical ink on a warm light-beige strip, never a dim dark notation board.                 | partial | Source tokens are warm paper/dark ink; fresh combined reference-versus-prototype and installed screenshots remain.                                                                                  |
| C.09 | Practice timing should be learner-tolerant and match repeated same-lane notes to the nearest unhit target.            | passed  | Practice uses the wider policy window; Judge nearest-unhit regressions pass while Perform semantics remain strict.                                                                                  |
| C.10 | Practice may rewind and teach; Perform must play through uninterrupted.                                               | passed  | Mode-policy, detector, machine, engine, and SongView tests keep intervention out of Perform.                                                                                                        |
| C.11 | Real kit silence auto-pauses only after meaningful missed authored notes, rewinds safely, and any mapped pad resumes. | passed  | Real-time plus expected-head thresholds, authored-rest protection, forward-seek protection, checkpoint, and any-pad resume tests pass.                                                              |
| C.12 | Practice lives/checkpoints and focused recovery must end in a clear terminal state after two consecutive clean reps.  | passed  | Durable remediation queue tests prove two complete zero-error passes, task completion, preserved source identity, and return to the originating Coach review.                                       |
| C.13 | Post-song weak-loop work must preserve the result/analysis context while every assigned loop is cleared.              | passed  | Coach findings create a durable finite queue keyed by exact chart content; incomplete and completed queues survive navigation/reload and return to the same source review.                          |
| C.14 | Plugging in the Yamaha cable should auto-detect, prefer, open, reconnect, and expose a truthful visible status.       | partial | Fresh/late cable, DTX-over-virtual-port, changed-port, open-failure, disconnect, retry, and readiness transitions pass 63 lifecycle tests; a physical cable cycle remains.                          |
| C.15 | The drum kit must control Home, Songs, difficulty, selection, launch, back, ready, pause/resume, and recovery.        | partial | Explicit mappings plus collision-safe fresh-profile fallbacks pass integration tests; the final physical route remains.                                                                             |
| C.16 | One Play action should choose enjoyable next-zone work from lessons and previously practised/favourite songs.         | passed  | The recommendation service is isolated and deterministic, ranking prerequisites, weakness, spacing, preferred songs, fatigue, and difficulty with an evidence-based explanation.                    |
| C.17 | The full learning path must include fundamentals/rudiments before songs and represent every authored lesson.          | passed  | The bundled 170-exercise, 10-season package and semantic validator cover prerequisites, tempo ladders, lane skills, reading, coordination, transfer, and bounded one-pass clear gates.              |
| C.18 | Every supplied Yandex Drums playlist row and authenticated Favourite is represented without pretending audio exists.  | partial | Drums has 13 rows/11 stable source URLs; Favorites has 230 rows/211 URLs. Catalog coverage is complete, but lawful audio plus reviewed drum charts are still required before every row is playable. |
| C.19 | Session history must be compact, durable, interpretable, and useful for later progress analysis.                      | passed  | Versioned practice evidence, exact chart-content revision, decayed recent mastery, lane confidence, archive compaction, and migrations have deterministic coverage.                                 |
| C.20 | Home/Profile should show meaningful recent kit mastery, not vague lifetime percentages or vanity XP.                  | passed  | Recent window, half-life, sample confidence, trend, lane focus, and achievement separation are explicit in source and tests.                                                                        |
| C.21 | App and website must feel intentionally designed: bright premium glow, editorial hierarchy, not stock whiteboard UI.  | partial | Daybreak direction, reference board, typography/material tokens, and existing comparisons are present; fresh kb.5 core-screen comparisons and site refresh remain.                                  |
| C.22 | Replace the generic icon with a distinctive premium Drumroll macOS icon.                                              | partial | ImageGen produced and locally validated a warm ivory/gold snare-pulse icon with transparent corners at 16–1024 px plus ICNS/ICO; packaged Dock/Finder proof remains.                                |
| C.23 | Remove “Support the project” everywhere.                                                                              | passed  | Component, settings entry points, and obsolete persisted context state are removed; final source scan and packaged readback remain release gates rather than feature work.                          |
| C.24 | Ship a signed, notarized, stapled Apple Silicon app under the available Developer ID.                                 | partial | Identity and scripts are prepared; the accepted kb.5 source has not yet produced the final signed/notarized artifact.                                                                               |
| C.25 | Refresh and deploy the public site with honest capability limits and a verified current download.                     | partial | Web source targets kb.5, but final app screenshots, release assets, remote digests, and production deployment wait on installed-app acceptance.                                                     |
| C.26 | Close only after independent product, visual, technical, and transcript reviewers find no unresolved P0/P1.           | partial | Final audit is deliberately last and must inspect the exact source commit, installed app, clean DMG/download, public site, and every row above.                                                     |

## Current release verdict

Drumroll `1.2.0-kb.4` remains the recoverable published baseline, but it does
not close the user's latest playing feedback. `1.2.0-kb.5` is the active target
and is not yet releasable: notation persistence and Flow legibility are under
corrective implementation; integrated source, visual, packaging, signing,
notarization, installation, clean-download, deployment, and independent-audit
gates remain. The final physical Yamaha DTX route and longitudinal learning
efficacy remain honest external proof limits rather than being inferred from
software tests.
