# My Music — integration checklist

This feature was built with **new files only** (per the CORE-phase constraint) and does
not touch any file another lane owns. Four edits, in files this phase deliberately did
not touch, wire it into the app:

## 1. `src/preload/index.ts` — register the channel

Add `'my-music-fetch'` to the `Channels` union (it carries both the request and the
reply, same as `'search-youtube'`):

```ts
export type Channels =
  | 'load-song-list'
  // ...
  | 'my-music-fetch'
  | 'export-pdf';
```

## 2. `src/main/AppState.ts` — register the handler

```ts
import { fetchMyMusic } from './ipc/myMusic';
// ...
ipcMain.on('my-music-fetch', fetchMyMusic);
```

Put it near the other `check-*`/`create-*` registrations (e.g. next to
`ipcMain.on('check-auto-chart-backends', checkAutoChartBackends);`).

## 3. `src/types.ts` — hoist the shared IPC contract (recommended, not required)

`src/main/ipc/myMusic.ts` and `src/renderer/components/MyMusic/types.ts` each declare
their own copy of the same contract right now (`IpcMyMusicRequest`,
`IpcMyMusicResponse`, `MyMusicSong`, `MyMusicErrorCode`, `IpcMyMusicError`,
`IpcMyMusicReply`) — this is the same "renderer can't import a main-process module"
workaround `searchYoutube.ts` / `SongSearch/types.ts` already use, and both files carry
a comment pointing here. Once you're touching `types.ts` anyway:

1. Move those interfaces into `src/types.ts` verbatim (field names already match —
   `MyMusicSong.durationSec`, not `durationSeconds`, to match what `myMusic.ts` returns).
2. In `src/main/ipc/myMusic.ts`, replace the local declarations with
   `import { IpcMyMusicRequest, IpcMyMusicReply, ... } from '../../types';`.
3. In `src/renderer/components/MyMusic/types.ts`, replace `MyMusicSong`/
   `MyMusicErrorCode`/`MyMusicReply`/`isMyMusicError` with re-exports from
   `'../../../types'`, keeping only `LibrarySongRef` and `MyMusicErrorInfo` (renderer-only
   shapes with no main-process equivalent).
4. In `src/renderer/hooks/useMyMusic.ts`, drop the local `MyMusicIpc` cast/interface and
   call `window.electron.ipcRenderer` directly now that `Channels` includes
   `'my-music-fetch'`.

This step is safe to skip for a first landing — the duplicated-copy convention already
works and matches how `search-youtube` shipped — but do it before a second consumer of
these types shows up.

## 4. `src/renderer/views/SongListView/SongListView.tsx` — mount point

`songList` (`Song[]`) is already in scope there and is structurally compatible with
`LibrarySongRef` (`{ artist: string; name: string }`) — no adapter needed, pass it
straight through. Follow the same disabled-gate as `SongSearch`/`AutoChart`
(`currentPath === null`).

Minimal placement, matching how `AutoChart` opens as a trigger button + `Modal`
(`import { MyMusic } from '../../components/MyMusic';`):

```tsx
const [myMusicOpen, setMyMusicOpen] = useState(false);

// in the header toolbar, alongside SongSearch/SongImport/AutoChart:
<Button data-testid="my-music-trigger" disabled={currentPath === null} onClick={() => setMyMusicOpen(true)}>
  My Music
</Button>

<Modal open={myMusicOpen} onCancel={() => setMyMusicOpen(false)} footer={null} width={640}>
  <MyMusic librarySongs={songList} disabled={currentPath === null} />
</Modal>
```

`MyMusic`'s own "Add" / "Add top 10" actions already send `create-auto-chart` on the
existing channel — no change needed to `AutoChart.tsx` or the auto-chart queue for
imports to land in the library exactly the way a pasted YouTube URL does today.
Whether it's a modal, a new panel/tab, or something else is an integration call; the
props and channel above are all it needs.

## What's exported for you

`src/renderer/components/MyMusic/index.ts` re-exports:

- `MyMusic` component (`{ librarySongs: LibrarySongRef[]; disabled?: boolean }`)
- `LibrarySongRef`, `MyMusicSong`, `MyMusicErrorCode`, `MyMusicErrorInfo`,
  `MyMusicSuccess`, `MyMusicError`, `MyMusicReply`, `isMyMusicError` (from `./types`)

`src/renderer/hooks/useMyMusic.ts` exports `useMyMusic()` /
`UseMyMusicResult` if you need the fetch/dedup state outside the packaged panel.

`src/main/ipc/myMusic.ts` exports `fetchMyMusic` (the `ipcMain.on` handler),
plus `resolveYtDlpPath`, `parseMyMusicLine`, and `classifyMyMusicStderr` for reuse/testing.
