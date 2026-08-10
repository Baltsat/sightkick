# Drumroll 1.2.0-kb.4

`kb.4` is the audit-closure release for the adaptive drum tutor. It preserves
the complete `kb.3` learning system while closing the final defects found by
independent product, design, and release reviewers.

## Release-gate fixes

- A remembered MIDI kit now reconnects for the whole app session with bounded
  backoff. Drumroll opens only a port confirmed by enumeration and shows Ready
  only after native or Web MIDI acknowledges that exact open; a locked or stale
  port stays in Waiting while retry continues.
- Home states `ready`, `waiting for kit`, or `choose an input` explicitly. The
  one-touch Practice action and kick-drum Play target stay gated until the
  selected input is genuinely available.
- The Practice lane legend now forms a dedicated dock above Tutor. Hi-hat,
  cymbal, snare, Tom 1, Tom 2, Tom 3, and kick colors remain readable from the
  kit instead of being hidden behind the recovery HUD.
- Flow notation now uses a compact warm-paper strip with dark musical ink,
  preserving SightKick's at-a-glance readability while keeping Drumroll's
  glowing lane, streak, checkpoint, and fixed-playhead feedback.
- Hands-free continuation waits for the main process to confirm that the
  completed run reached disk. A failed or evidence-free run remains on screen
  with an explicit reason instead of silently moving on.
- The public browser app no longer claims that YouTube chart creation is
  available when the production transcriber is not configured. Lessons,
  local progress, and Web MIDI remain available; authorized audio and chart
  creation remain desktop-first.
- The Home recommendation clock refreshes during a long-running session, so
  the visible next task stays aligned with the task that one-touch Practice
  launches.

## Included product

- Adaptive Practice with material-error detection, section-aware checkpoints,
  bounded slowdown, clean-repetition release, optional lives, and automatic
  continuation.
- Uninterrupted Perform mode, horizontal Flow notation, synchronized Classic
  notation, fixed glowing playhead, drum-lane colors, streak feedback, and
  kit gestures.
- 170 playable curriculum exercises across ten seasons, with prerequisites,
  tempo ranges, dose rules, mastery rules, and honest MIDI assessment limits.
- Local-first run history, long-horizon profile evidence, supported Coach
  findings, 13 Yandex Drums candidates, and 230 Yandex Favorites candidates.
- Local Codex Coach support using read-only, ephemeral CLI execution with a
  deterministic evidence-based fallback.

## Publication proof

The exact `kb.4` app and disk image passed the full automated test matrix,
Developer ID signing, hardened-runtime verification, Apple notarization,
stapling, Gatekeeper assessment, curriculum and bundled-tool verification, and
checksum replay. The accepted light Flow cockpit is live on the public site and
passed an independent zero-P0/P1 visual audit. The published artifacts were
also replayed from a clean download before this release was closed.

Physical Yamaha DTX402 latency, mapping, and gesture acceptance still requires
the real connected kit. Claims that Drumroll replaces every aspect of a human
teacher also require longitudinal learning and injury-safety evidence; the app
does not infer grip, posture, rebound, muscular tension, or acoustic tone from
MIDI.
