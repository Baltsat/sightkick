# Drumroll 1.2.0-kb.16

The first public release since kb.10, carrying the kb.11–kb.16 line: Drumroll
becomes **your music service for drums** — the kit is the launcher, typing a
name brings a real song down from the internet, and the tutor teaches the way
the learning-science audit demands.

## the kit is the launcher

- Home is a labelled drum-kit: kick continues, snare starts My Wave, hi-hat
  opens the next lesson, ride opens your songs, crash finds something new, and
  the toms hold your top three. Labels are light on the drum head, not
  stickers.
- A deliberate strike selects a door; a stray hit cannot start a session.
- Home shows whether the kit is connected, reconnecting, or absent; plugging
  the wire in is enough.

## your music, one search field

- One search field is the only way in: it searches your library first, then
  YouTube. Picking a result downloads, charts, scans, and opens the song — no
  file dialog, no URL field, no read-only modal. Proven live: a typed name
  came down past a 403 fallback into a 508-hit chart, played, and survived a
  relaunch.
- A failed search fails honestly with retry; quitting mid-import leaves
  nothing behind.
- Favourites are one press, persist, and outweigh replay counts in My Wave;
  your saved Yandex tracks enter warm.
- Songs opens with actionable shelves — Ready now, Favourites, Recently
  imported — behind one browse door, instead of an endless list.
- Hovering a song auditions its drum-heavy part, not the intro.

## the tutor teaches

- All 170 lessons are open. The prerequisite order still drives what gets
  recommended, but nothing is forbidden; a played node shows its earned
  stars, an unplayed one shows nothing.
- Practice varies instead of drilling one bar: an anchor pass carries the
  target into a real following bar; a skill assessed yesterday returns today.
- Tempo is yours. Coach proposes a change and waits; nothing shifts under
  your hands. Remediation closes through planned target-speed probes
  (0.8 → 0.9 → 1.0, two clean passes each) instead of calling a slowed
  same-session clear "learned".
- The finished-run screen waits for you — the 8-second auto-continue timer is
  gone.
- Wrong notes explain themselves from real judge evidence; the glossary
  appears when summoned and stays inside the window.
- An interrupted run is actually restored after a crash or force-quit, with a
  visible "Resume bar N" cue — proven by a real kill-and-relaunch harness.
- Playing songs for pleasure counts toward mastery.

## one living field

- Home, songs, Journey, practice, result, and statistics sit on one warm
  paper-and-ember field; the Journey keeps its photograph beneath it.
- Every kit image and every notehead carries its drum's lane colour, with a
  regression test that fails if they ever diverge.
- Statistics is full-screen; the streak sits centered; repeat figures read as
  bounded rails, not a purple wash.
- The app icon is unmistakably drums, verified inside the installed bundle.

## proof

- 2,000+ tests green with typecheck and lint at the release commit; the
  hostile learning-science audit and the per-ask fidelity audit are in
  `docs/learning-science-audit-20260814.md` and
  `docs/final-fidelity-20260814.md`.
- Full capture sets under `docs/design-qa/2026-08-13-*` and
  `docs/design-qa/2026-08-14-*`, including the live import walk and the
  recovery relaunch.

## evidence boundary

A physical Yamaha DTX402 session remains the last proof: strike arrival, pad
mapping, pedal launch, and tutor feel at the kit are harness-proven but not
hand-proven. `docs/kit-test-drill.md` is the one-minute check.

## distribution

- Release: [GitHub v1.2.0-kb.16](https://github.com/Baltsat/sightkick/releases/tag/v1.2.0-kb.16)
- Apple Silicon DMG SHA-256: `b5944dc1a5a355f7966feb3b62f846548406e6f53cb2fe17e47ea35266e2b24e`
