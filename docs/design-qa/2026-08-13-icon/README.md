# App icon fidelity check — 2026-08-13

The owner's complaint: _"картинка что-то непонятная, раньше классная была"_ — the
app icon is unclear now; the earlier one was good. This folder is the evidence
for the fix: three genuinely different candidates in the warm-ember language,
rendered at the seven sizes the icon actually ships at, judged honestly at the
small end, and the winner shipped.

## the verdict

**Current production mark: kb.14 "Drum Mark."** See `comparison-grid.png` /
`comparison-grid.html` for the decisive evidence — kb.5, the prior Signal
Disc, and Drum Mark at 16×16, 32×32, 128×128, and 1024×1024. The revision
uses the actual iconset slot files, so no cell hides behind a mock render.

At 16 px the rejected icon is close to a plain black square with a barely
visible cream oval — the exact failure the owner named. Signal Disc corrected
that small-slot failure, but its waveform made the large mark look like a
generic audio app. kb.5 remains the more intricate full-size illustration.
Drum Mark keeps the small-size dark ring and adds a legible crossed-stick X,
so it wins the required trade: readable in a Dock and plainly drums at full
size.

## the three candidates

All three share the same field: a warm cream-to-gold rounded square built
from the actual `docs/visual-system-v3.md` tokens (`dr-canvas`/`dr-paper` for
the light values, `dr-ink` for the dark linework, `dr-ember` → `dr-count` for
the signature glow). They are structurally different drawings, not three
tints of one drawing:

|                                                                | composition                                                                                                                                                     | reads at 16px?                                                                                                        | reads at 1024px?                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **A — Ember Snare** (`candidates/candidate-a-ember-snare.svg`) | literal 3/4-view snare, crossed sticks above, ember waveform across the head — the direct, properly-drawn restoration of the kb.5 idea                          | **no** — collapses into an ambiguous dark blob, and at 32–64px the crossed sticks read as TV antennae, not drumsticks | yes, charming, but the antenna misread is a real defect                                             |
| **B — Signal Disc** (`candidates/candidate-b-signal-disc.svg`) | the drumhead _is_ the whole icon: a thick dark rim with eight lug dots standing in for tension rods, and one ember-to-gold waveform spike as the signature mark | **yes** — a dark ring with a warm ember core is unambiguous at 16px                                                   | legible, but generic audio rather than explicitly drums                                             |
| C — Strike Impact (`candidates/candidate-c-strike-impact.svg`) | no drum body at all: a single diagonal stick striking an ember burst, with concentric sound-ripple rings                                                        | **no** — rings and stick fade to a soft blob, the weakest of the three small                                          | yes — the most painterly/dynamic of the three at 1024px, but form is lost long before it gets there |

Full 16/32/64/128/256/512/1024px renders of all three candidates are in
`candidates/renders/`, generated straight from the SVGs with
`rsvg-convert` — reproduce any of them yourself, no image-gen tool required
(unlike the previous icon; see `assets/ICON_PROVENANCE.md`).

Candidate B went through one revision before selection: the first draft of
its waveform had a below-baseline undershoot after the spike (a classic
ECG/heart-monitor "QRS complex" shape), which made the mark read as a
medical pulse-oximeter icon rather than a struck drum. It was redrawn, in
the same working session, as a single smooth flame-shaped spike entirely
above the baseline — that redrawn version is the one in
`candidates/candidate-b-signal-disc.svg`. It was the kb.13 production source;
kb.14 supersedes it with `assets/icon.svg` and `assets/icon-small.svg`.

## small-size handling

`assets/icon-small.svg` is the kb.14 hand-simplified source for the 16px/32px
iconset and `.ico` slots. It keeps a bold rim and crossed-stick silhouette,
drops the full lug ring, and enlarges the ember strike so the tiny mark stays
readable. This is normal professional icon practice — Apple's own iconset
format expects distinct per-size artwork, not one vector blindly scaled to
every slot. Full rationale is in `assets/ICON_PROVENANCE.md`.

## reference sources

- `reference-sources/kb5-icon-1024.png` — the icon the owner remembered as
  good, recovered with `git show 025c384:assets/icon.png`.
- `reference-sources/current-rejected-icon-1024.png` — the icon being
  replaced, recovered with `git show 5abdfc4:assets/icon.png` (this is the
  same file as the live `assets/icon.png` before this change).
- `reference-sources/kb5-downscaled/`, `reference-sources/current-downscaled/`
  — both of the above resized to 16/32/128px with ImageMagick
  (`magick <src> -resize <N>x<N> <out>`) for the comparison grid.

## sidebar brand mark

`sidebar-brand-mark-proof.html` is a real, self-contained HTML page (open it
in any browser, no server needed) that reproduces the _exact_ CSS rules from
`src/renderer/components/AppShell/AppShell.css`
(`.arena-shell__brand-mark` — 2rem circle, `overflow: hidden`,
`border-radius: 50%`, `object-fit: cover`) around the shipped
`assets/icon.png`. It was verified rendering in a real Chromium tab (the
same engine Electron uses) at the actual 32×32px rail size: the mark crops
cleanly into a warm ember-ring circle with no dead space and no leftover
dark corners — replacing what was previously a near-black blob in the
sidebar, because the old icon's dark square corners showed through the
circular crop. No changes were needed to `AppShell.tsx` or `AppShell.css`:
the brand mark imports `assets/icon.png` directly, so swapping that file's
content is sufficient and this task's file scope (`assets/**` plus the
brand mark surface) is satisfied without touching shared shell code that
other lanes are editing in parallel.

## kb.14, exactly as shipped

`kb14-drum-mark/{16,32,128,1024}.png` are copies of the actual production
files from `assets/icon.iconset/` — not re-renders — so this folder proves
what is really going into the notarized build, not an idealized version.
