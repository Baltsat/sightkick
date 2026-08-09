# Drumroll 1.2.0-kb.2

Drumroll is now an adaptive drum tutor and performance game rather than only
a chart player. This prerelease focuses on a single practical promise: place
the Mac beside a MIDI drum kit, start once, and keep practising without
walking back to the computer between tasks.

## What is new

- Bright Daybreak Arena world across Home, Journey, Coach, Profile, results,
  and the new public product story.
- Flow notation with a stable left-to-right play line, alongside synchronized
  Classic notation.
- Distinct Practice and Perform contracts. Practice can detect a material
  breakdown, preserve the failed attempt, return to a musical checkpoint,
  count in, slow recovery work, require clean repetitions, and restore tempo.
  Perform preserves one uninterrupted canonical attempt.
- Optional three-life checkpoint play, automatic continuation, and deliberate
  kit gestures for start, pause/resume, retry/continue, and end.
- Judge-owned hit, miss, and wrong-pad outcomes with immutable evidence
  snapshots, stable run identity, configuration/version provenance, and no XP
  for untouched playback.
- Evidence-led Home recommendation and Coach actions that cite recent weak
  bars, timing bias, lane accuracy, prerequisite state, and suggested speed.
- Meaningful recent readiness, per-drum evidence, goals, streaks, and a compact
  multi-year per-day/per-song archive beyond the detailed-run retention caps.
- A deterministic 170-exercise Drumroll Method journey covering fundamentals,
  rudiments, reading, coordination, grooves, fills, musical transfer, and
  explicit three-tom reinforcement.
- Read-only Yandex Music source metadata. Candidate tracks are never presented
  as playable until lawful local audio and a reviewed drum chart are present.
- App-private lesson installation that coexists with a selected personal song
  library instead of replacing it.
- Safe curriculum reconciliation for profiles created by the former
  118-lesson build. Exact exercises keep their best scores and saved evidence,
  renumbering chains move atomically, and replaced exercises remain readable as
  archived curriculum history instead of being assigned to unrelated lessons.

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

The public release is only considered valid when its Developer ID signature,
Apple notarization ticket, Gatekeeper assessment, packaged 170-lesson manifest,
Yandex metadata manifests, and published SHA-256 all pass the release verifier.
The final checksum is published beside the downloadable artifact.
