# real Electron recovery evidence

status on 2026-08-14: red. The crash checkpoint remains in Electron's on-disk store, but the relaunched practice screen does not offer to resume it.

`capture-recovery-relaunch.mjs` launches the built app from `out/main/index.js` with an isolated user-data directory. It opens `Lesson 01.01` in Practice, maps `KeyJ` to snare, plays twelve strikes, waits for a persisted in-progress checkpoint, sends `SIGKILL` to Electron's main process, and relaunches the same profile.

The current capture retained the original session id, eight recorded events, and tick `3029`. The renderer then received an empty `load-practice-attempt-checkpoints` reply for `lesson:01.01`, so the relaunched UI read `Ready Kick to count in The first beat is armed.` The required recovery cue is `Ready Resume bar N · kick to count in`.

Artifacts from the failing real-lifecycle run:

- `01-live-before-force-quit.png`
- `02-relaunched-recovery-ui.png`
- `checkpoint-before-force-quit.json`
- `checkpoint-after-relaunch.json`
- `checkpoints-after-relaunch.json`
- `ipc-checkpoint-load.json`
- `recovery-evidence.json`

The exact `SongView` handoff is in [`../../recovery-handoff.md`](../../recovery-handoff.md).

Run the capture again after that fix:

```sh
corepack yarn build
corepack yarn node docs/design-qa/2026-08-14-recovery/capture-recovery-relaunch.mjs
```

On a passing run, the script renames the post-relaunch screenshot to `02-resumed-after-relaunch.png` and sets `passed` to `true` in `recovery-evidence.json`.
