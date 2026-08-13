# Drumroll streak motion gallery

Two isolated comparison surfaces for choosing Drumroll's reward language. The
primary live-play study is now a borderless in-game VFX tier ladder: typography
starts with the tier name as the semantic and visual lead; a smaller streak
count follows as proof. The energy progressively gains trails, electricity,
flame, runes, and finally prismatic legendary layers before dissolving directly
into the playfield. The earlier visible plaque/container direction was rejected.
The original cinematic study is retained only for rare milestones or end-of-track
celebrations. Neither surface changes the existing practice renderer or installs
a runtime package.

## Open

Serve this directory with any static server. For example:

```sh
python3 -m http.server 4179 --directory docs/streak-motion-gallery
```

Then open:

- `http://127.0.0.1:4179/plaques.html` — primary borderless live-play VFX study.
- `http://127.0.0.1:4179/` — cinematic celebration study.

## Borderless VFX controls

- Select a representative streak tier, or press `1`–`6`.
- Click the live effect, press `Space`, or choose **Replay tier-up**.
- Choose **Simulate hit** or press `H` for the shorter micro-confirmation.
- Choose **Miss state** or press `M` for a quiet dissolve and saved best.
- Choose **Reduced motion** or press `R` for the crossfade-only equivalent.

## Borderless VFX tier ladder

1. **Warm-Up · 8** — readable type and a faint amber glow only.
2. **Groove Machine · 32** — adds a cyan/violet wake and soft horizontal trail.
3. **Fill Wizard · 75** — adds lightning, charged dust, and a sharper strike.
4. **DRUMROLL! · 100** — adds asymmetric flame, sparks, and a solar flare.
5. **Rhythm Deity · 200** — adds broken ritual runes, smoke, and a mythic halo.
6. **Buzz Roll Berserker · 500** — combines all layers with prismatic slashes,
   shards, a larger type peak, and a very short impact shake.

These are representative checkpoints from the existing ten-stage progression.
`In the Pocket · 16`, `Backbeat Boss · 50`, `Thunderstruck · 150`, and
`POSSESSED · 300` can interpolate between the neighboring authored states. The
six proofs therefore define an intensity system, not six mutually exclusive
skins.

Every authored tier-up reveals the name first. The secondary `STREAK · N · HITS`
line follows `80–160 ms` later, with the delay scaling by rarity. A normal hit
pulses only this small proof line, so repeated confirmation does not repeatedly
move the main title or compete with notation.

A normal hit uses a `213–380 ms` micro-confirmation. A full tier-up ramps from
`280 ms` at Warm-Up to `1,180 ms` at Legendary, then removes every Canvas VFX
pixel while leaving readable typography. The outer shape stays irregular and
alpha-feathered. A miss dissolves the energy, shows `STREAK ENDED`, and
preserves the best streak without a red interruption.

## Cinematic study controls

- Select a direction from the left rail, or press `1`–`6`.
- Click the visualization, press `Space`, or choose **Replay**.
- Choose **Auto tour** to cycle through all six directions.
- Choose **Miss state** or press `M` to inspect the soft visual reset.
- Choose **Reduced motion** or press `R` to inspect the static proof state.

## Cinematic directions

1. **Aurora Current** — atmospheric ribbons; broad, emotional, premium.
2. **Drumhead Resonance** — concentric membrane physics; most drum-specific.
3. **Liquid Chrome** — prismatic material and reflected wave energy.
4. **Kinetic Print** — paper, ink, waveform, and fast editorial typography.
5. **Stage Bloom** — bounded concert beams, haze, and local particles.
6. **Spectral Orbit** — radial timing/frequency geometry; most precise.

All directions run the same proof event: `100`, `DRUMROLL!`, `100 CLEAN HITS`,
and `±18 ms TIMING`. The existing streak/scoring contracts remain the source of
truth; the gallery only explores presentation.

## Implementation boundary

- Canvas 2D renders a transparent `540 × 166` compositing surface around the
  floating typography. The surface has no visible background or clipping edge.
- GSAP choreographs the one-shot `280–1,180 ms` tier reveal and the separate
  `1.35–2.65 second` celebration sequences.
- The warm notation surface remains code-native and unobscured.
- Animation updates transforms, opacity, filters, canvas pixels, and text only.
- `prefers-reduced-motion` and the explicit Reduced motion control preserve all
  labels and evidence while removing continuous movement.
- The selected direction can be ported to the existing `StreakMeter` without
  changing the engine, judge, reset, or persistence logic.

## Design and QA receipt

- Borderless VFX concept: [`plaque-game-vfx-concept.png`](./plaque-game-vfx-concept.png)
- Name-first sequence proof: [`proof/title-first-sequence.png`](./proof/title-first-sequence.png)
- Progressive tier comparison: [`proof/all-streak-tiers-focused.png`](./proof/all-streak-tiers-focused.png)
- Progressive tier motion tour: [`proof/streak-tier-ladder-tour.mp4`](./proof/streak-tier-ladder-tour.mp4)
- Progressive tier mobile proof: [`proof/title-first-mobile.png`](./proof/title-first-mobile.png)
- Focused VFX comparison: [`proof/all-borderless-vfx-focused.png`](./proof/all-borderless-vfx-focused.png)
- Borderless VFX motion tour: [`proof/borderless-vfx-tour.mp4`](./proof/borderless-vfx-tour.mp4)
- Borderless VFX mobile proof: [`proof/vfx-mobile.png`](./proof/vfx-mobile.png)
- Cinematic concept: [`concept.png`](./concept.png)
- Cinematic comparison: [`proof/all-directions.png`](./proof/all-directions.png)
- Cinematic motion tour: [`proof/streak-directions-tour.mp4`](./proof/streak-directions-tour.mp4)
- Desktop browser: system Google Chrome controlled through Playwright, because
  the Browser/IAB tool and bundled Playwright Chromium were unavailable.
- Native verification viewport: 1600 × 1000; responsive verification viewport:
  390 × 844.
- Functional checks: tier selection, click/keyboard replay, hit, miss, reduced
  motion, and screenshot capture passed. Thresholds are `8, 32, 75, 100, 200,
500`; duration, title scale, peak energy, and layer count increase strictly at
  every checkpoint. The title font is larger than the count at all six tiers.
  A deterministic motion check confirms that the legendary name is visible
  while the proof line still has zero opacity and still reads `499`; the proof
  then resolves to `500`. Console/page errors: zero. Horizontal overflow: zero
  at both viewports.

### Fidelity ledger

| Comparison point    | Concept                                              | Browser result                                                        | Resolution |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- | ---------- |
| Product identity    | Warm Flow notation with a game-native reward event   | Energy materializes in the reserved gap above the notes               | Matched    |
| Container semantics | No card, pill, plaque, panel, or readable boundary   | Live node has transparent background, zero border, and no shadow      | Matched    |
| Tier selector       | Six progressively stronger representative milestones | The event grows from one Canvas layer to six cumulative layers        | Matched    |
| Attention hierarchy | Notation primary; tier name leads the reward         | Name appears first; the smaller count follows without a field wash    | Matched    |
| Motion language     | Strike, materialize, peak, dissolve                  | Canvas pixels clear after a tier-scaled `280–1,180 ms` sequence       | Matched    |
| Miss handling       | Preserve motivation without punishment flash         | Quiet dissolve, `STREAK ENDED`, and persistent `BEST 46`              | Matched    |
| Accessibility       | Reduced motion retains the feedback state            | Crossfade preserves count, tier, best, color, and ARIA status         | Matched    |
| Responsive behavior | Same peripheral hierarchy on a narrow practice view  | Mobile selector scrolls internally; document has no horizontal scroll | Matched    |

Above-the-fold copy diff against the VFX concept: no required direction, streak,
or tier label is missing. The browser build adds only selector metadata and the
transient-presence indicator.

Intentional deviations from the raster concept: the code-native flame and smoke
are deliberately less volumetric than a GPU particle simulation. Canvas 2D is
enough for the comparison because the VFX is small, one-shot, and has no
continuous particle loop. The toolbar is a close context mock rather than a
change to the installed practice build.
