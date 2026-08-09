# Drumroll Daybreak Arena design QA

Run date: 2026-08-09

## Scope and method

This QA run compares the supplied product references with the current
implementation at the same desktop state and viewport. A screenshot alone is
not counted as proof: every accepted desktop surface has a side-by-side
comparison image, and the marketing site also has desktop and mobile captures.
The final packaged application repeats the core interaction smoke test against
the real upgraded profile. It does not complete or save a synthetic run.

The source reference set is preserved under
`docs/design-qa/2026-08-09-epoch5/ref-*.{jpg,png}`. The UNKNW capture used only
for composition and editorial-rhythm study is
`docs/design-qa/2026-08-09-epoch5/01-unknw-reference-1440x900.png`. Drumroll
does not copy its imagery, text, layout, or brand system.

## Visual comparisons

### Home — interactive kit cockpit

Reference and final installed implementation:
`docs/design-qa/2026-08-09-epoch5/47-reference-vs-final-installed-home.png`

- **Passed:** one dominant Play target remains physically attached to the
  bass drum.
- **Passed:** Songs, Journey, Coach, profile, and settings stay available
  without competing with Play.
- **Passed:** the light Daybreak shell avoids the dim brown World Tour cast,
  while the photographic kit keeps the scene tactile.
- **Passed:** every kit value is tied to a named lane; unknown evidence is
  rendered as a dash rather than a fabricated score.
- **Passed:** foreground contrast remains legible over the photograph through
  a bounded dark focus layer.

### Journey — bright spatial learning world

Reference and implementation:
`docs/design-qa/2026-08-09-epoch5/compare-journey-polished.png`

- **Passed:** the route is spatial and drum-native rather than a generic card
  list.
- **Passed:** the current exercise, season state, stars, locks, and Play action
  use real curriculum metadata.
- **Passed:** one active node has the strongest glow; locked nodes remain
  subordinate.
- **Accepted advisory:** the scene uses a curved spatial grid. This is an
  intentional world-map device, not a decorative dashboard background.

### Practice — left-to-right Flow notation

Reference and final installed implementation:
`docs/design-qa/2026-08-09-epoch5/48-reference-vs-final-practice-flow.png`

- **Passed:** notation advances horizontally through a stable playhead.
- **Passed:** miss markers, the active note, tempo, Flow/Classic switch, loop,
  and tutor message stay inside one focus stage.
- **Passed:** the gameplay stage is deliberately dark for notation contrast
  while the surrounding product remains bright.
- **Passed:** the tutor message states speed and recovery intent instead of
  using glow as the only signal.

### Coach — evidence before decoration

Reference and implementation:
`docs/design-qa/2026-08-09-epoch5/compare-coach.png`

- **Passed:** the current empty/sparse state says that more scored evidence is
  needed; it does not invent weak bars or mastery.
- **Passed:** the primary action routes to a real lesson rather than a dead
  card.
- **Passed:** the orb is a bounded focal accent; it does not obscure the
  evidence hierarchy.

## Current implementation captures

| Surface       | Viewport | Evidence                                     | Result |
| ------------- | -------: | -------------------------------------------- | ------ |
| Home          | 1440×900 | `12-app-home-polished-1440x900.jpg`          | Passed |
| Journey       | 1440×900 | `10-app-journey-polished-1440x900.jpg`       | Passed |
| Practice Flow | 1440×900 | `11-app-practice-flow-polished-1440x900.jpg` | Passed |
| Profile       | 1440×900 | `16-app-profile-1440x900.jpg`                | Passed |
| Coach         | 1440×900 | `18-app-coach-1440x900.jpg`                  | Passed |
| Marketing     | 1440×900 | `13-marketing-desktop-1440x900.jpg`          | Passed |
| Marketing     |  390×844 | `14-marketing-mobile-390x844.jpg`            | Passed |
| Mobile menu   |  390×844 | `15-marketing-mobile-menu-390x844.jpg`       | Passed |

All filenames in the table are relative to
`docs/design-qa/2026-08-09-epoch5/`.

## Final notarized installed-app matrix

The following captures come from `/Applications/Drumroll.app` installed from
the final separately signed and notarized DMG. They use the real upgraded
profile and preserve its existing scored run; playback QA exits before a
synthetic result can be saved.

| Surface                 | Evidence                                          | Acceptance result                                                                                                                   |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Home                    | `37-final-installed-home-real-profile.png`        | Californication recommendation restored at Medium; 28-day time-decayed lane evidence is labelled with counts and confidence limits. |
| Local Songs             | `38-final-installed-songs-local.png`              | 112 personal songs, real metadata, availability and progress states.                                                                |
| Yandex Drums            | `39-final-installed-yandex-drums.png`             | All 13 playlist rows represented as honest metadata candidates.                                                                     |
| Yandex Favorites        | `40-final-installed-yandex-favorites.png`         | All 230 authenticated Favorites represented as honest metadata candidates.                                                          |
| Journey                 | `41-final-installed-journey-170.png`              | 170 exercises across 10 seasons with prerequisite locks and mastery copy.                                                           |
| Practice Flow ready     | `42-final-installed-practice-flow-ready.png`      | Horizontal Flow, fixed playhead, visible lanes, speed, loop, lives, and ready cue.                                                  |
| Practice Classic ready  | `43-final-installed-practice-classic-ready.png`   | Synchronized Classic alternative retains the same tutor/game state.                                                                 |
| Adaptive tutor settings | `44-final-installed-adaptive-tutor-settings.png`  | Tutor listening, smart rewind, lives, auto-continue, and kit controls are explicit independent toggles.                             |
| Coach                   | `45-final-installed-coach-real-profile.png`       | Advice cites Tom 2 evidence from 31 samples across one real run.                                                                    |
| Profile                 | `46-final-installed-profile-archived-history.png` | Per-drum evidence and seven retired curriculum records remain readable.                                                             |
| Flow live               | `49-final-installed-practice-flow-live.png`       | Miss feedback, glow, live streak/lives, adaptive 0.8→0.7→0.6 pacing, checkpoint recovery, and kit pause copy are visible.           |

All filenames in this table are relative to
`docs/design-qa/2026-08-09-epoch5/`.

## System and accessibility checks

- **Passed:** all controls in the core route retain semantic button/link
  behavior and visible labels.
- **Passed:** color is not the only status channel for toms, results, tutor
  state, locks, or availability.
- **Passed:** `prefers-reduced-motion` removes continuous and decorative motion
  while preserving position and meaning.
- **Passed:** the two-font system is Newsreader for editorial display and
  Instrument Sans for UI. The earlier Space Grotesk detector warnings were
  resolved without adding a third family.
- **Passed:** the fixed drumstick cursor is limited to suitable mouse surfaces;
  keyboard focus remains a standard visible fallback.
- **Passed packaged proof:** final desktop navigation, core CTA, Flow/Classic
  state, labelled fallbacks, and 112/13/230 Songs source counts.

## Tooling qualifications

- The Impeccable detector was run once, as required. Its seven Space Grotesk
  warnings were addressed by the Instrument Sans migration. Its one spatial
  grid advisory was reviewed and accepted for the Journey world-map surface.
- The in-app browser refused a later local-page snapshot because of its URL
  safety policy. That restriction was respected. Existing same-run captures
  remain visual evidence; final interaction proof will come from the signed
  packaged desktop application rather than a browser-policy workaround.

## Final gate

Final installed-app result: **passed**. Public-site visual and release readback
remain release gates rather than desktop-design gates.
