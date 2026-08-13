# Drumroll app icon provenance

## 2026-08-13 — "Signal Disc," hand-authored SVG (current)

Replaces the 2026-08-11 OpenAI-image-generation icon below. The owner's
complaint: _"картинка что-то непонятная, раньше классная была"_ — the icon
is unclear now, the earlier (kb.5, 2026-08-05) one was good. Full before/after
evidence, all three candidates considered, and the small-size legibility test
live in
[`docs/design-qa/2026-08-13-icon/`](../docs/design-qa/2026-08-13-icon/README.md).

### why hand-authored SVG instead of another AI image

The 2026-08-11 icon (see below) could not be regenerated, tuned, or debugged
without a fresh AI image-generation call and a fresh roll of the dice — the
prompt is a description of a photograph, not a reproducible drawing. That is
also _why_ it failed: an AI photo-render of a snare drum is full of fine
texture (wood grain, chrome specular highlights, brushed-metal shading) that
reads as a rich object at 1024px and as pixel mud at 16px, and there is no
lever to pull to fix just the small sizes without re-rolling the whole image.

This icon is instead a hand-written SVG (`assets/icon.svg`), built from flat
shapes, gradients, and strokes with explicit pixel coordinates. That makes
every claim in this document checkable by anyone with `rsvg-convert`: open
the SVG, change a number, re-render, see the exact effect. No proprietary
model, no prompt, no non-determinism.

### design

**"Signal Disc."** The drumhead _is_ the icon: a thick dark ring (standing in
for the rim, with eight small gold lug dots for the tension rods) around a
warm paper disc, crossed once by a single ember-to-gold waveform spike — the
"struck" moment rendered as sound, not as a photograph of a drum. This is a
deliberate application of the product's own design law
(`docs/design-acceptance-notes.md`: _"one dominant object per screen"_) to
the icon itself: one shape, one accent color, nothing competing with it.

Colour is not invented for the icon — it is read directly from
`docs/visual-system-v3.md`'s token table:

| icon element              | source token                                         | value                        |
| ------------------------- | ---------------------------------------------------- | ---------------------------- |
| field / disc light values | `dr-canvas`, `dr-paper` (deepened for icon contrast) | `#f4efe5` / `#fcf9f2` family |
| ring, dark linework       | `dr-ink`                                             | `#241f19`                    |
| waveform spike            | `dr-ember` → `dr-count`                              | `#e85a36` → `#f4bd3d`        |
| lug dots                  | kit "hi-hat/tom1" lane                               | `#c99627`                    |

Two other structurally distinct candidates were drawn and rejected after
rendering all three at 16/32/64/128/256/512/1024px — see the QA folder for
the full comparison and the specific reason each lost (candidate A's crossed
sticks read as TV antennae by 32px; candidate C's impact ripples fade to a
blob by 32px). The winning candidate went through one further revision after
initial review: the waveform's first draft had a below-baseline undershoot
that read as an ECG/heart-monitor trace rather than a struck drum; it was
redrawn as a single smooth above-baseline spike.

### small-size handling

`assets/icon-small.svg` is a hand-simplified variant used only for the 16px
and 32px slots. The rim lugs and the thin inner gold hairline are dropped
(sub-pixel noise below ~64px) and the ring/waveform stroke widths are
increased so the icon stays a confident dark ring with a visible ember spike
at 16px instead of thinning into anti-aliased grey. `assets/icon.svg` (the
full master) is used for every slot 64px and larger.

### files and generation recipe

- `assets/icon.svg` — 1024px master source. Everything 64px and up is
  rendered from this file.
- `assets/icon-small.svg` — 16px/32px source variant.
- `assets/icon.png` — the 1024px master render, used as the in-app brand
  mark (`src/renderer/components/AppShell/AppShell.tsx` imports this file
  directly — no code change was needed there, the mark updates by swapping
  this asset) and as the runtime `BrowserWindow` icon fallback on platforms
  that are neither macOS, Windows, nor Linux.
- `assets/icon.iconset/` — macOS iconset, ten representations
  (16/32/32/64/128/256/256/512/512/1024px, per Apple's `iconutil` naming
  convention). 16 and 32px come from `icon-small.svg`; 64px and up come from
  `icon.svg`.
- `assets/icon.icns` — built from `icon.iconset` with `iconutil`.
- `assets/icon.ico` — 16/32/128/256/512px representations, 16/32 from the
  small variant, built with ImageMagick.
- `assets/icons/{16,32,48,64,128,256,512}x*.png` — Linux/tray-icon set and
  the Linux `BrowserWindow` icon fallback (`main/AppState.ts` reads
  `icons/512x512.png`). 16/32 from the small variant, 48px and up from the
  master.

Toolchain used (all local, versions pinned so this is reproducible):
`rsvg-convert 2.62.1` (librsvg, cairo 1.18) for SVG → PNG, `iconutil`
(macOS) for iconset → `.icns`, ImageMagick `7.1.2` to pack PNGs into
`.ico`. The exact, runnable command sequence for every output above —
not a paraphrase of it — is `assets/make-icons.sh`. Run it after any
edit to `icon.svg` or `icon-small.svg` to regenerate every derived file:

```bash
bash assets/make-icons.sh
```

### verification

- Corner-pixel alpha checked with ImageMagick (`magick icon.png -format
'%[pixel:p{2,2}]' info:` → `srgba(0,0,0,0)`): the squircle mask leaves the
  four corners fully transparent, same convention as the icon it replaces.
- The in-app sidebar brand mark (`.arena-shell__brand-mark`: 2rem circle,
  `border-radius: 50%`, `object-fit: cover`) was proven in a real Chromium
  render, not just reasoned about — see
  `docs/design-qa/2026-08-13-icon/sidebar-brand-mark-proof.html`, a
  self-contained page using the exact CSS from `AppShell.css` around the
  shipped `icon.png`.
- `docs/design-qa/2026-08-13-icon/comparison-grid.png` puts kb.5, the
  rejected current icon, and this icon side by side at their actual
  16/32/128px shipped pixels.

---

## 2026-08-11 — OpenAI image generation (superseded, kept for history)

created 2026-08-11 with OpenAI image generation, then rendered into platform
icon sizes locally.

prompt:

> create a distinctive premium Drumroll app icon for a MIDI drum-practice
> application: a single snare drum viewed straight-on and slightly from
> above, centered, with a taut warm ivory drumhead, black graphite rim, six
> simple chrome lugs, and one small ember-orange impact flare at the center.
> two subtle crossed drumsticks form a compact dark silhouette behind the
> snare. use a full-bleed deep ink-black to charcoal rounded-square field; no
> text, no beige tile, no neon beams, no confetti, and no glow cloud. keep
> the central snare silhouette recognizable at Dock and Finder sizes.

This icon was rejected 2026-08-13: the owner reported it as "unclear" next
to the warmer 2026-08-05 (kb.5) icon it replaced, and the small-size check in
`docs/design-qa/2026-08-13-icon/` confirms why — the near-black field and
photographic drum detail collapse into a low-contrast blob well before
16px. Recoverable with `git show 5abdfc4:assets/icon.png`.
