# App icon fidelity check — 2026-08-13

The owner's complaint: _"картинка что-то непонятная, раньше классная была"_ — the
app icon is unclear now; the earlier one was good. This folder is the evidence
for the fix: three genuinely different candidates in the warm-ember language,
rendered at the seven sizes the icon actually ships at, judged honestly at the
small end, and the winner shipped.

## the verdict

**Winner: Candidate B, "Signal Disc."** See `comparison-grid.png` /
`comparison-grid.html` for the decisive evidence — kb.5, the current
(rejected) icon, and the winner, all three at their actual 16×16, 32×32, and
128×128 shipped pixels, nearest-neighbor scaled so no cell hides behind
smoothing.

At 16 px the current icon is close to a plain black square with a barely
visible cream oval — the exact failure the owner named. kb.5 is a warm,
appealing blob at 1024 px but the photographic drum/stick/waveform detail
collapses into an indistinct smear by 32 px. The winner is the only one of
the three that stays a confident, legible shape — a dark ring around a warm
ember spike — all the way down to 16 px, while also being the boldest, most
premium mark at 1024 px. It is the only candidate that passes both halves of
the brief's own test at once.

## the three candidates

All three share the same field: a warm cream-to-gold rounded square built
from the actual `docs/visual-system-v3.md` tokens (`dr-canvas`/`dr-paper` for
the light values, `dr-ink` for the dark linework, `dr-ember` → `dr-count` for
the signature glow). They are structurally different drawings, not three
tints of one drawing:

|                                                                             | composition                                                                                                                                                     | reads at 16px?                                                                                                        | reads at 1024px?                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **A — Ember Snare** (`candidates/candidate-a-ember-snare.svg`)              | literal 3/4-view snare, crossed sticks above, ember waveform across the head — the direct, properly-drawn restoration of the kb.5 idea                          | **no** — collapses into an ambiguous dark blob, and at 32–64px the crossed sticks read as TV antennae, not drumsticks | yes, charming, but the antenna misread is a real defect                                             |
| **B — Signal Disc** (`candidates/candidate-b-signal-disc.svg`) — **winner** | the drumhead _is_ the whole icon: a thick dark rim with eight lug dots standing in for tension rods, and one ember-to-gold waveform spike as the signature mark | **yes** — a dark ring with a warm ember core is unambiguous at 16px                                                   | yes — bold, premium, poster-simple                                                                  |
| C — Strike Impact (`candidates/candidate-c-strike-impact.svg`)              | no drum body at all: a single diagonal stick striking an ember burst, with concentric sound-ripple rings                                                        | **no** — rings and stick fade to a soft blob, the weakest of the three small                                          | yes — the most painterly/dynamic of the three at 1024px, but form is lost long before it gets there |

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
`candidates/candidate-b-signal-disc.svg` and the one shipped as
`assets/icon.svg` (the two files are byte-identical; this copy exists so
the losing candidates and the winner sit side by side and nothing here
depends on the live `assets/` tree).

## small-size handling

`candidates/candidate-b-signal-disc-small.svg` is a hand-simplified variant
of the winner used only for the 16px/32px iconset and `.ico` slots: the rim
lugs and the thin gold hairline ring are dropped (both are sub-pixel noise
below ~64px) and the ring/waveform strokes are thickened so the small icon
stays a confident dark ring with a bright spike instead of thinning into a
grey smear. This is normal professional icon practice — Apple's own iconset
format expects distinct per-size artwork, not one vector blindly scaled to
every slot. Full rationale in `assets/ICON_PROVENANCE.md`.

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

## winner, exactly as shipped

`winner-shipped/{16,32,128,1024}.png` are copies of the actual production
files from `assets/icon.iconset/` — not re-renders — so this folder proves
what is really going into the notarized build, not an idealized version.
