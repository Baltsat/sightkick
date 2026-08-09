# Drumroll Daybreak Arena design contract

## Goal

Turn the existing shared Electron/web practice app into a bright, premium,
reactive drum-learning world without changing its curriculum, scoring, input,
or song-import contracts.

## Visual truth

- Home concept: `/Users/konstantinbaltsat/.codex/generated_images/019fe58e-9166-71a3-aa16-1ce346d2b9d0/exec-b6123b5e-b4e2-479c-ba27-3307e3d9fba9.png`
- Journey concept: `/Users/konstantinbaltsat/.codex/generated_images/019fe58e-9166-71a3-aa16-1ce346d2b9d0/exec-636a5766-0267-432c-ad04-49cae0e6f0bd.png`
- Flow-practice concept: `/Users/konstantinbaltsat/.codex/generated_images/019fe58e-9166-71a3-aa16-1ce346d2b9d0/exec-fbc6ee35-5278-422a-b086-16d5ff7e38ee.png`
- Runtime home asset: `src/renderer/assets/daybreak/home-kit-studio.png`
- Runtime journey asset: `src/renderer/assets/daybreak/journey-studio.png`
- User references remain the source for notation, kit-stat, season, cockpit,
  neon-lesson, and World Tour comparisons. World Tour contributes structure,
  not its dim brown palette.

## Product hierarchy

1. Home is an interactive drum-kit cockpit, not a library header.
2. Songs is the detailed library and import surface.
3. Journey is a spatial season world backed by all 170 exercises.
4. Practice has a switchable Flow and Classic view.
5. Coach is contextual: a compact focus rail on Home and a detailed panel in
   Practice.
6. Profile/stats remain visible from the shell and use real saved evidence.

## Color and type lock

- Ink: `#111722`
- Ink raised: `#1b2430`
- Pearl: `#f8f5ef`
- Warm paper: `#eee8dc`
- Amber: `#ffad2f`
- Coral: `#ff684f`
- Magenta: `#f73586`
- Cyan: `#56d8f2`
- Body text must meet WCAG AA. Color is never the only hit/miss signal.
- Display: Newsreader. UI: Instrument Sans. No third font.

## Motion contract

- Continuous notation follows the existing chart clock with
  `requestAnimationFrame`; it does not own timing.
- Hit feedback uses transform, opacity, and filter only.
- Home hotspots get a single membrane pulse and short localized particles.
- Lesson unlock energy travels once; completed nodes shimmer once.
- Coach and view transitions may use small React-native/CSS springs; no heavy
  WebGL runtime is required for the first pass.
- `prefers-reduced-motion` removes continuous pan, particles, breathing, and
  shake while preserving position, labels, and state color.

## Evidence honesty

- The 2026-08-08 run is summary-only because it predates full-hit persistence.
  Coach may cite its real accuracy, timing, lane, wrong-hit, speed, and date,
  but must not invent trouble bars or transitions.
- New runs with stored hit records may offer exact trouble bars, targeted
  loops, and matched lessons.
- Desktop and web must both persist and return full run records for new runs.

## Required interactions

- Home kit hotspots respond to pointer, keyboard, and MIDI-derived state where
  available; the kick PLAY action opens the current/next playable item.
- HOME, SONGS, JOURNEY, COACH, profile, and settings affordances work.
- Journey nodes preserve locked, available, next, completed, and keyboard
  activation contracts for all exercises.
- Flow/Classic toggle works without losing speed, loop, score, Coach, or engine
  state.
- Practice hit, miss, wrong-pad, playhead, loop selection, and reduced-motion
  behavior remain testable.

## Acceptance gates

- Existing tracked tests remain green; new surfaces have focused unit tests.
- Typecheck, lint, renderer build, web build/smoke, and macOS package succeed.
- Browser/IAB screenshots at 1600 x 1000 compare against all three concepts.
- `design-qa.md` ends with `final result: passed` after P0-P2 repair.
- Final `.app` has a valid hardened Developer ID signature. Gatekeeper and
  notarization are reported separately and exactly.
