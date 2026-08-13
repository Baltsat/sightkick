# recovery handoff — `practiceStats`

The real Electron lifecycle capture in `docs/design-qa/2026-08-14-recovery/capture-recovery-relaunch.mjs` isolates the recovery defect to the main-process checkpoint loader.

1. It opens `Lesson 01.01` in Practice, records eight actual input events at chart tick `3029`, and persists an in-progress checkpoint.
2. `SIGKILL` ends the built Electron main process; the same isolated profile relaunches with the original session id, records, and tick unchanged.
3. The renderer's real `load-practice-attempt-checkpoints` reply for `lesson:01.01` is `{"songId":"lesson:01.01","checkpoints":[]}`. The screen therefore says `Ready Kick to count in The first beat is armed.` instead of `Resume bar N · kick to count in`.

The mismatch is in `src/main/ipc/practiceStats.ts`:

- `savePracticeAttemptCheckpoint` writes the full `practiceAttemptCheckpoints` map and stores the array at `checkpointsBySong[checkpoint.songId]`.
- `loadPracticeAttemptCheckpoints` reads `appState.store.get(checkpointStoreKey(songId))`.
- `checkpointStoreKey('lesson:01.01')` creates a dotted Electron Store path, so it addresses nested `lesson:01` then `01`, not the literal map key `lesson:01.01`. Existing `song-1` tests miss this because that id has no dot.

Minimal repair:

```ts
const checkpointsBySong =
  (appState.store.get(PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY) as
    | PracticeAttemptCheckpointsStore
    | undefined) ?? {};
const checkpoints = readPracticeAttemptCheckpoints(checkpointsBySong[songId]);
```

Keep `finalizePracticeAttemptCheckpoint` as the reference shape: it already reads the root map and indexes it with the literal song id.

Add a `practiceStats.test.ts` regression that saves then loads a checkpoint whose song id is `lesson:01.01`; assert its non-empty records and position tick return. That test fails under the current dotted-store lookup. Then rerun the real lifecycle capture: it must show both the original persisted records/tick and `Resume bar N · kick to count in`.
