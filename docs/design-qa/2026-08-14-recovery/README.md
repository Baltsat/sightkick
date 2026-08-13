# real Electron recovery proof

- launched the built Electron main process from `out/main/index.js` with an isolated temporary profile
- entered `Lesson 01.01` in Practice, played twelve mapped snare strikes, and waited for a non-empty on-disk checkpoint
- sent `SIGKILL` to the Electron main process, then relaunched the same profile
- verified the original session id, recorded hit journal, and chart tick were byte-for-byte unchanged in the Electron store
- verified the resumed practice UI says `Ready Resume bar 2 · kick to count in The first beat is armed.`

Artifacts:

- `01-live-before-force-quit.png`
- `02-resumed-after-relaunch.png`
- `checkpoint-before-force-quit.json`
- `checkpoint-after-relaunch.json`
- `recovery-evidence.json`
