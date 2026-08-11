# Drumroll 1.2.0-kb.7

`kb.7` makes adaptive Practice more humane and more personal: a learner can
clear a lesson at 82% accuracy from 0.7x speed, while the tutor retains the
evidence needed to raise the bar over time.

## Learner-tolerant adaptive practice

- Lessons can clear at 82% accuracy from 0.7x, rather than requiring a
  perfection-shaped run.
- The Practice timing window begins at ±220 ms and tightens toward 140 ms only
  after repeated strong evidence; the learned window persists across sessions.
- Recovery retains its adapted speed instead of resetting every phrase, and
  clean work can restore tempo.
- Tutor recovery has a finite success path: focused work, two clean
  repetitions, then a return to the originating evidence view. kb.8 adds a
  four-bar cap so repeated failed attempts cannot keep a long task alive.

## A personal practice wave

- One My Wave action uses the learner profile and recent sessions to choose a
  focus task, an application, and a consolidation task rather than repeating a
  fixed sequence.
- The profile tracks eight atomic drum skills and renders their balance as a
  skill radar, making the next recommendation explainable through saved
  practice evidence.
- Lane colors now carry onto kit-facing playing surfaces, strengthening the
  color-and-place association used while reading notation.

## Playing-surface refinements

- Flow keeps its warm-paper notation field and dark musical ink, with the
  playhead anchored to its reading position instead of drifting with the score.
- The public website now serves kb.7 and keeps the native/browser capability
  boundary explicit.

## Distribution

- Release: [GitHub v1.2.0-kb.7](https://github.com/Baltsat/sightkick/releases/tag/v1.2.0-kb.7)
- Apple Silicon DMG: [Drumroll-1.2.0-kb.7-arm64.dmg](https://github.com/Baltsat/sightkick/releases/download/v1.2.0-kb.7/Drumroll-1.2.0-kb.7-arm64.dmg)
- DMG SHA-256: `53f6391113d4181c9b0a6e7d979c40833088246136e773f6c7aca6c443373d4c`

The public DMG hash matches the local notarized artifact. The installed
`/Applications/Drumroll.app` is stapled; its `app.asar` SHA-256 is
`b6141e9344d847b16e1d57f5a766184c3d44206fae632a27f3a6391eb1af99f4`.

## Known follow-ups for kb.8

- Resonance Runway loop-escape visual and installed-state captures.
- Direct remediation routing ahead of generic recommendation ranking.
- A curriculum timing skill tag for lesson 01.01.
- Judge-evidence schema that retains expected and actual hit context.
- A four-bar remediation cap, splitting longer Coach ranges into finite tasks.

## Evidence boundary

The release has a signed, notarized, stapled, checksum-replayed public DMG and
production website. Final artifact replay for the remaining playing-feedback
matrix is in the L1 verification lane; the ledger labels those rows
`pending-verification`. Physical Yamaha DTX402 cable-cycle behavior still
requires a connected kit, and MIDI cannot establish posture, grip, rebound,
tension, or acoustic tone.
