# one library – integration and proof

## what is ready

- `src/renderer/services/library/unified-library.ts` builds one list from local songs, Drums, and Favorites. Source rows remain ordinary rows with their real availability and proof state; they never become playable by metadata alone.
- Default ordering uses `score_my_wave_difficulty` from My Wave when a chart or skill manifest exists. The other supported orders are newest, shortest, and ready first.
- A YouTube result now carries `autoImport: true`: the existing queue fetches, transcribes, scans, prepares, then imports it. It does not expose a playable row before that final import. Source-linked rows still refuse YouTube audio.
- Every successful local import queues a chart-and-metadata mirror. Audio remains local-only. A failed mirror upload stays in the private outbox and retries when sync runs again.

## protected library-view handoff

This is the exact remaining UI change for the app-shell and `SongListView` owner. Delete the `local`, `drums`, and `favorites` modes and render one continuous list from `build_unified_library`.

```ts
const entries = build_unified_library({
  songs: songList,
  sources: yandexSources,
  charts,
  manifests,
  atomicStates,
  now: new Date().toISOString(),
});
const matches = search_unified_library(entries, nameFilter);
const visible = order_unified_library(
  filter_unified_library(matches, readinessFilter),
  sort,
);
const offerYoutube = should_offer_youtube(entries, nameFilter);
```

Keep the existing search field as the only field. Render local matches whenever `matches.length > 0`; mount the YouTube candidate surface only when `offerYoutube` is true. Its selected result already auto-imports through the queue.

Rows need only a title, a support line, and one status/action:

- `Ready to play` enables the existing play action.
- Every other `stateLabel` is visible but cannot launch practice.
- Use `sourceLabels` only as a small support line such as `From Drums` or `From Favorites`; never as tabs or a separate panel.
- Make `difficulty` the selected sort on entry, with `recent`, `length`, and `ready` as alternatives.

Visual contract from `docs/visual-system-v3.md`: warm-paper continuous rows, 56–64 px rhythm, one search-and-filter line, and no card grid or generic loading spinner. Import stages are already explicit queue copy; do not add a second status language.

The Settings owner also needs one small `Library mirror` group: endpoint, token, status, and `Sync now`. On mount send `get-library-mirror-settings`; submit with `save-library-mirror-settings`; the sync button sends `sync-library-mirror`. A missing network or pending outbox must never disable the local library.

## cloud activation

The implementation uses the existing Cloudflare Pages route at `web/functions/api/library/[[path]].ts`. It requires two intentionally unprovisioned values:

1. a dedicated Cloudflare KV namespace bound as `DRUMROLL_LIBRARY` for the Pages project;
2. a Pages secret named `LIBRARY_MIRROR_TOKEN`, then the same endpoint and token in the desktop app settings or `DRUMROLL_LIBRARY_MIRROR_URL` and `DRUMROLL_LIBRARY_MIRROR_TOKEN`.

After that, call `sync-library-mirror` once. It stages every locally imported song, uploads chart plus metadata, and leaves the local library usable if the network fails. The service rejects raw audio and audio paths. Existing local audio still needs its own lawful attachment on another machine before playback.

The live Pages route returns an error until the KV binding and secret exist; that is deliberate rather than a pretend cloud mirror.

## proof

- `src/renderer/services/library/unified-library.test.ts` covers merge, honest source states, My Wave ordering, local-match suppression of YouTube, and readiness filtering.
- `src/main/ipc/autoChart.test.ts` covers one-click import only after a prepared chart exists.
- `src/renderer/components/SongSearch/SongSearch.test.tsx` verifies the selected YouTube result asks for auto-import.
- `src/main/libraryMirror.test.ts` covers metadata/chart-only serialization, offline outbox retry, disabled state, and sync of existing local songs.

### gate readback

| command                                                       | result                                                                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| focused library/import tests                                  | 55 passed                                                                                                                                            |
| `corepack yarn typecheck`                                     | passed                                                                                                                                               |
| `corepack yarn build`                                         | passed                                                                                                                                               |
| Pages function typecheck and `wrangler pages functions build` | passed                                                                                                                                               |
| `git diff --check`                                            | passed                                                                                                                                               |
| full `corepack yarn vitest run`                               | 1,899 passed, 2 failures in the concurrent `no-outer-scroll` Insights/Profile assertion                                                              |
| full `corepack yarn lint`                                     | 31 shared-tree errors in app-shell/view, Home, My Wave, an unrelated capture, and concurrent formatting churn; new library/mirror modules lint clean |

## visual capture

- `00-current-renderer-1225x768.png` is the isolated packaged renderer at the default home state.
- `01-pre-integration-songs-1225x768.png` captures the current Songs screen and makes the redundant Local, Drums, Favorites, and Online controls explicit.
- `02-pre-integration-drums-1225x768.png` captures the 13 current Drums rows with their existing honest proof state.

The latter two are deliberately labelled pre-integration: they are a visual baseline and handoff target, not a claim that the protected view has already adopted the unified model. The next capture belongs after the view owner wires the contract above.
