# Drumroll 1.2.0-kb.3

Drumroll is an adaptive drum tutor and performance game built around one
practical promise: place the Mac beside a MIDI drum kit, start once, and keep
practising without walking back to the computer between tasks.

## What is new

- A kit-distance Tutor HUD with a dominant instruction, explicit speed,
  numeric lives, and visible clean-repetition progress during recovery.
- A stronger Flow gameplay surface: larger synchronized notation, a more
  legible fixed playhead, and restrained surrounding controls. Classic remains
  available at its selected zoom.
- Distinct Practice and Perform contracts. Practice can detect a material
  breakdown, preserve the failed attempt, return to a musical checkpoint,
  count in, slow recovery work, require clean repetitions, and restore tempo.
  Perform preserves one uninterrupted canonical attempt.
- Optional three-life checkpoint play, automatic continuation, and deliberate
  kit gestures for start, pause/resume, retry/continue, and end.
- Atomic practice evidence: run summaries, detailed records, and compact
  archive data are written as one store snapshot. High scores, XP, practice
  days, and streaks are minted only after that evidence is confirmed saved.
- A long-horizon Profile view combining retained runs and compact archives
  without double counting. It reports interpretable lifetime runs, scored
  notes, hit accuracy, timing center, and a bounded monthly history.
- Evidence-led Home recommendation and Coach actions that cite recent weak
  bars, timing bias, lane accuracy, prerequisite state, and suggested speed.
- A deterministic 170-exercise Drumroll Method journey covering fundamentals,
  rudiments, reading, coordination, grooves, fills, musical transfer, and
  explicit three-tom reinforcement.
- Read-only Yandex Music source metadata for the 13-track Drums playlist and
  230 Favorites tracks. Candidate tracks remain clearly non-playable until the
  user reviews a source and creates or imports lawful local audio and a chart.
- Bright Daybreak Arena visual language across Home, Journey, Flow, Coach,
  Profile, results, and the public product story, with accessible small-text
  contrast and clearer action hierarchy.

## Safety and scope

Drumroll can observe MIDI timing, expected pad choice, consistency, reading,
coordination, and practice history. MIDI alone cannot see grip, posture,
rebound, muscular tension, acoustic tone, or injury risk. Those physical
technique areas still benefit from a skilled human teacher or a separately
validated camera-based review path.

## Compatibility

- This macOS preview targets Apple Silicon.
- The application identifier remains `org.sk.SightKick` deliberately so
  existing fork profiles and updater history remain compatible while the
  product name is Drumroll.
- Local MIDI scoring and the bundled lesson path work without a network
  connection after installation. Online discovery and optional remote chart
  services require network access and may need separate credentials.

## Distribution proof

The public release is accepted only after the final Apple Silicon app and DMG
pass Developer ID signature validation, Apple notarization, stapled-ticket
validation, Gatekeeper assessment, exact lesson/Yandex manifest checks, and a
clean-download SHA-256 replay against the immutable GitHub release assets.
