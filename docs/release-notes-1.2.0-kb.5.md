# Drumroll 1.2.0-kb.5

`kb.5` closes the hands-free practice defects observed on the real drum kit.
It keeps the complete adaptive tutor and library from `kb.4`, while making a
lesson behave like a playable game rather than a desktop form.

## Kit-first learning loop

- Plugging in a remembered or newly discovered Yamaha/DTX kit now triggers
  session-long automatic open and reconnect attempts. Home says Ready only
  after MIDI acknowledges the live port; a deliberate “None” choice remains a
  durable opt-out.
- Opening a lesson now enters Practice directly. A single kick announces that
  the drummer is ready, then the configured count-in starts without requiring
  another trip to the laptop.
- Practice uses a learner-friendly hit window, while Perform preserves its
  stricter scoring contract.
- Authored notes remain visible after the playhead passes. Flow and Classic use
  the same canonical drum shapes and color map, and Flow keeps the current note
  at a fixed, glowing playhead on a compact warm-paper strip.
- Meaningful silence over authored notes parks the session, rewinds to a musical
  checkpoint, and lets any mapped pad resume. Real rests and intentional seeks
  do not trigger recovery.

## Daybreak product world

- Home is a compact, no-scroll kit cockpit with a dominant practice action,
  truthful connection status, recent songs, and interpretable 28-day per-drum
  evidence.
- Journey uses physical drum and cymbal nodes across all ten seasons, with
  kit-driven selection, start, and back instructions visible at laptop
  distance.
- Flow and Classic share the same warm-paper musical language, canonical lane
  colors, note texture, and explicit bar/beat position.
- The app, DMG, Dock, Finder, and public site use the new premium Drumroll icon
  and the refreshed release imagery.

## Coach and remediation

- Coach findings use stable tempo buckets, minimum evidence thresholds, and
  wrong-hit handling that does not double-count paired misses.
- Every weak section is retained in a durable remediation queue tied to the
  original run and chart revision.
- A section clears only after exactly two consecutive, full-coverage,
  zero-error natural loop passes. Failed and partial attempts remain evidence.
- Completing all sections returns to the original Coach review with a durable
  completion receipt instead of losing the post-song analysis.

## Included product

- 170 playable curriculum exercises across ten seasons.
- Local-first run history, per-drum evidence, supported Coach findings, and
  progress views grounded in saved sessions.
- All 13 rows from the supplied Yandex Drums playlist and 230 Yandex Favorites
  rows represented as source metadata. Protected streaming audio is not
  bundled; a track becomes playable only after lawful local audio and a chart
  are imported.

## Evidence boundary

The release is gated by source tests, packaged-app verification, Developer ID
signing, Apple notarization, stapling, Gatekeeper assessment, checksum replay,
and same-viewport visual inspection. Physical Yamaha DTX402 mapping and latency
still depend on the connected kit and are reported only when live MIDI input is
observed. Drumroll does not infer posture, grip, muscular tension, rebound, or
acoustic tone from MIDI.
