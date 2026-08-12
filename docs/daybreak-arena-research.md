# Daybreak Arena visual and motion research

## Sources

- [Dota 2 7.00 HUD update](https://www.dota2.com/700/hud/) — keep the
  musical world visible, reduce permanent chrome, and reveal detail in a
  contextual side surface.
- [Motion quick start](https://motion.dev/docs/quick-start),
  [transitions](https://motion.dev/docs/react-transitions), and
  [performance](https://motion.dev/docs/performance) — spring/stagger patterns
  and transform/opacity/filter guidance.
- [GSAP Timeline](https://gsap.com/docs/v3/GSAP/Timeline/) — evaluated for
  seekable orchestration; rejected for the first pass because Drumroll already
  owns a precise chart clock.
- [tsParticles](https://github.com/tsparticles/tsparticles) — evaluated for
  celebration/ambient particles; deferred in favor of bounded local DOM
  particles and no new runtime dependency.
- [PixiJS](https://github.com/pixijs/pixijs) and its
  [performance guidance](https://pixijs.com/8.x/guides/concepts/performance-tips)
  — reserved for a future measured need to render hundreds of simultaneous
  scene objects; not required for the present VexFlow/DOM surfaces.
- [Rive state machines](https://rive.app/docs/runtimes/state-machines) — a
  future option for an authored Coach orb or brand animation, not a substitute
  for the current product UI.
- [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
  and [seizure/accessibility guidance](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Seizure_disorders)
  — continuous pan, pulse, shake, and particles need a static fallback.

## Decision

Use the existing React, VexFlow, CSS, and engine clock. Flow notation moves
from the same chart time through `requestAnimationFrame`; UI feedback stays on
compositor-friendly transform, opacity, and filter properties. No new motion,
particle, or WebGL package enters the first implementation. This keeps MIDI
timing authoritative, reduces packaging risk, and leaves a clear upgrade path
if profiling later shows a real need.

## Pattern mapping

- Home: interactive kit cockpit, contextual Coach rail, compact navigation.
- Practice: fixed playhead, horizontal lane, local hit/miss/wrong feedback,
  no competing full-screen panels.
- Journey: spatial season scene, one active focus, accessible season rail.
- Profile: real trends and per-drum evidence, no decorative fake metrics.
- Celebration: one short bounded burst; no permanent particle field.
