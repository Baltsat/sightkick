# Drumroll 1.2.0-kb.3

> Superseded by `1.2.0-kb.4` after the final independent audit found a
> Practice legend collision, finite MIDI reconnect retries, an unconfigured
> browser transcriber claim, and a deployed-source provenance mismatch. The
> proof below remains the immutable historical record for `kb.3`.

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

The final Apple Silicon app and DMG pass Developer ID signature validation,
Apple notarization, stapled-ticket validation, Gatekeeper assessment, exact
lesson/Yandex manifest checks, and the bundled transcriber smoke test. Apple
accepted the independently submitted DMG under notarization request
`33a352ad-c19e-4083-8db7-9db8911367f8`; its SHA-256 is
`94aa3122c1e8c7b521c64901c32db36b5e4b2cfaf93a88ff8ff57b0d01163916`.

The seven public assets were downloaded into a clean directory from immutable
tag `v1.2.0-kb.3`; all seven matched the local release bytes, the six payloads
replayed `SHA256SUMS.txt`, and the downloaded DMG independently passed the full
bundle, signature, ticket, Gatekeeper, curriculum, library, transcriber, and
FFmpeg verifier.
