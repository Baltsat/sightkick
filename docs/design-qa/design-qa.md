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

## Release acceptance

### kb.3 historical installed and public acceptance

The final pass uses the installed `1.2.0 (1.2.3)` application, the real
preserved profile, the production Cloudflare site, and the site's shared web
app in the user's desktop Chrome. It does not complete a synthetic run.

| Surface                | Evidence                                       | Result                                                                                                                                  |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Installed Home         | `50-installed-kb3-home.jpg`                    | Dominant bass-drum Play, demoted utility actions, interpretable recent lane evidence, and no control collision.                         |
| Long-horizon Profile   | `51-installed-kb3-profile-history.jpg`         | Lifetime runs, scored notes, hit-weighted accuracy, sample-weighted timing, monthly evidence, and retired curriculum are readable.      |
| Installed Journey      | `52-installed-kb3-journey.jpg`                 | Bright spatial route, real 170-exercise state, and two-line lesson nodes remain legible at the compact installed viewport.              |
| Installed library      | `53-installed-kb3-library.jpg`                 | Local catalog, difficulty, source filters, and add-music actions retain a clear hierarchy.                                              |
| Yandex Drums           | `54-installed-kb3-yandex-drums.jpg`            | All 13 source rows are visible as honest metadata candidates with a reviewed handoff.                                                   |
| Yandex Favorites       | `55-installed-kb3-yandex-favorites.jpg`        | All 230 source rows are represented without implying copyrighted audio is bundled.                                                      |
| Source-to-chart        | `56-installed-kb3-source-to-chart.jpg`         | The selected source pre-fills a reviewed YouTube result picker before local chart creation.                                             |
| Practice Flow          | `57-installed-kb3-practice-flow.jpg`           | Enlarged horizontal score and Tutor HUD read clearly, but the later independent audit found the drum-reference key was covered.         |
| Classic + Tutor        | `58-installed-kb3-classic-tutor.jpg`           | The synchronized traditional score retains colored and positional lane identity plus the same tutor state.                              |
| Zero-touch settings    | `59-installed-kb3-zero-touch-settings.jpg`     | Tutor, rewind, lives, auto-continue, and kit controls are explicit, independently labelled toggles.                                     |
| Public landing         | `60-public-kb3-landing.jpg`                    | The production hero is bright, original, editorial, and anchored by the current installed cockpit.                                      |
| Public Flow story      | `61-public-kb3-flow-story.jpg`                 | The real Tutor/Flow capture is shown without cropping it into a decorative mock.                                                        |
| Public Journey + Coach | `62-public-kb3-journey-coach.jpg`              | Product imagery and evidence-led copy alternate with deliberate editorial rhythm.                                                       |
| Public release callout | `63-public-kb3-download.jpg`                   | The signed Apple Silicon download and checksum are the only dominant conversion actions.                                                |
| Shared web app         | `64-public-kb3-web-app-flow.jpg`               | Web MIDI permission, 170-lesson Journey, lesson fetch, Flow, and Tutor HUD work in production Chrome.                                   |
| UNKNW comparison       | `65-unknw-reference-vs-public-kb3-landing.jpg` | Drumroll keeps the reference's typographic confidence while using distinct copy, bright palette, product imagery, layout, and identity. |

All filenames in this table are relative to
`docs/design-qa/2026-08-09-epoch5/`.

The initial kb.3 visual pass was accepted, but the independent closure audit
correctly reopened it: the color/name reference key sat behind the Tutor HUD.
That makes this table historical proof, not the current release gate.

### kb.4 audit remediation

| Surface                   | Evidence                          | Result                                                                                                                               |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Practice Flow + Tutor key | `66-preview-kb4-tutor-legend.png` | The eight pad-name colors form a dedicated, centered dock above Tutor; Tom 1/2/3 remain visible and neither surface clips the score. |

The kb.4 source preview passes the reopened collision check. Final acceptance
remains **pending** until the exact signed/notarized kb.4 installation and its
clean-HEAD public deployment reproduce the accepted source surfaces.

### kb.4 final light-notation polish

| Surface                  | Evidence                       | Result                                                                                                                                                |
| ------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow                     | `74-preview-light-flow.png`    | Continuous notation now sits on a warm beige horizontal score strip with ink staff lines, restrained lane color, and no dark stage.                   |
| Classic                  | `75-preview-classic-warm.png`  | The traditional score keeps the same warm-paper material, tutor state, lane key, and authored practice controls.                                      |
| Same-viewport comparison | `76-classic-vs-light-flow.png` | Classic and Flow form one coherent light visual system at the same 1225 × 768 viewport; the Flow strip remains the distinct zero-scroll playing mode. |

This final pass follows the Impeccable craft checks for hierarchy, typography,
material restraint, control grouping, and non-generic surface treatment. It
does not change scoring, playback, Tutor behavior, or saved-run semantics.

The first independent pass then caught one genuine contrast regression: Flow
still supplied the retired dark-stage white VexFlow palette underneath the new
paper surface. `77-preview-light-flow-ink.png` is the corrected proof. It uses
the same ink stave, stems, beams, and structural strokes as Classic while
retaining the per-lane note colors, warm horizontal strip, and light Tutor HUD.
