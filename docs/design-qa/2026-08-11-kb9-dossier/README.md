# drumroll kb9 visual dossier

run the capture from the repository root after `corepack yarn build`:

```sh
node docs/design-qa/2026-08-11-kb9-dossier/capture-kb9-dossier.mjs
```

the script launches the production Electron output with muted audio and a temporary QA profile. it captures home, journey, practice ready, practice playing, judged hit feedback, and profile at 1224 × 768 and 1024 × 700. it also records a reduced-motion practice frame.

before the app capture, it asks native Finder Quick Look for a thumbnail of the shipped `assets/icon.icns`, round-trips that ICNS through `iconutil`, and renders the 16, 32, 64, 128, 256, 512, and 1024 px icon assets into a scale matrix. the temporary Finder output is removed after the capture.

`baseline/` preserves the seven supplied KB8 captures without resizing or reinterpreting them. KB8 supplied app captures only at 1225 × 768, so the current compact column is a direct geometry regression check; there is no invented compact baseline.

`proof.json` records viewport, outer-scroll, visible-surface, playback-animation, judged-hit, runtime-error, and native icon checks. `before-after-board.html` and `before-after-board.png` are the visual comparison surface.
