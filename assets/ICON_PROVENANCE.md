# drumroll app icon provenance

created 2026-08-11 with OpenAI image generation, then rendered into platform icon sizes locally.

prompt:

> create a distinctive premium Drumroll app icon for a MIDI drum-practice application: a single snare drum viewed straight-on and slightly from above, centered, with a taut warm ivory drumhead, black graphite rim, six simple chrome lugs, and one small ember-orange impact flare at the center. two subtle crossed drumsticks form a compact dark silhouette behind the snare. use a full-bleed deep ink-black to charcoal rounded-square field; no text, no beige tile, no neon beams, no confetti, and no glow cloud. keep the central snare silhouette recognizable at Dock and Finder sizes.

derivatives:

- `icon.png` is the 1024 px in-app mark and development-window source.
- `icon.iconset/` holds 16, 32, 64, 128, 256, 512, and 1024 px macOS source representations.
- `icon.icns` is generated from that complete icon set for the macOS bundle and runtime window icon.
- `icon.ico` contains 16, 32, 128, 256, and 512 px representations for Windows.

the set was generated with macOS `sips` and `iconutil`, plus ImageMagick for the ICO container. the scale check was reviewed at 16, 32, 128, 256, and 1024 px before handoff.
