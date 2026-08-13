# wave field QA — 2026-08-13

these captures came from the production Electron build at 1365 × 820 with the final-QA fixture.

| capture                                                    | state                 | assertion                                                                              |
| ---------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| [00-home-kit-field.png](00-home-kit-field.png)             | home                  | kit fills the home canvas while the rail stays fixed on the same warm field            |
| [01-field-at-rest.png](01-field-at-rest.png)               | songs, settled        | rail and library sit on one paper-and-ember field; My Wave is absent from navigation   |
| [02-field-mid-transition.png](02-field-mid-transition.png) | songs → journey       | the existing shell remains mounted while the field makes its single route-change drift |
| [03-field-reduced-motion.png](03-field-reduced-motion.png) | songs, reduced motion | the field remains readable with animation disabled                                     |

[proof.json](proof.json) records exact route state, no outer scroll, the absence of the old My Wave destination, and `animation_name: "none"` under reduced motion. Run `corepack yarn build && corepack yarn exec node docs/design-qa/2026-08-13-wave-field/capture-wave-field.mjs` to reproduce.

## kit-surface handoff

`HomeCockpit` owns the kit photograph and its crop. Expose that resolved image and crop as a home-field custom property on the outer shell, then let `AppShell` paint the matching edge behind the rail and blend it into `--dr-field-low`. This is the one missing seam for a literal photograph-to-rail continuation; do not add a `view="wave"` route back. The home action must stay a direct `onStartSession(homeSession)` launch from the deliberate snare or confirm strike, with the kick reserved for continuation.
