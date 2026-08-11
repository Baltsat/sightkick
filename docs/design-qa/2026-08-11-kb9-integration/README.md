# kb9 integration captures

`capture-integration.mjs` runs the current production Electron build with an isolated copy of the final QA user-data config. It adds one local regular-song record built from the checked-in lesson chart and audio so the Songs intent has a real playable song candidate. The temporary fixture is removed after capture and never changes the user's library.

- `01-insights-from-shell.png` proves the app-shell profile control enters the dedicated Insights route without mounting a drawer.
- `02-songs-mode-pad-launch.png` proves a Songs-mode pad hit opens the composed candidate in Practice mode.
- `proof.json` records the pre-hit armed target, post-hit route and launch parameters, viewport checks, and renderer error state.

Run after `corepack yarn build`:

```sh
node docs/design-qa/2026-08-11-kb9-integration/capture-integration.mjs
```
