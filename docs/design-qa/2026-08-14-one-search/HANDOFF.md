# songs-view integration handoff

this lane makes the field emit the imported `Song` after the queue reaches
`imported`. the Songs owner needs to own the one user-visible transition:

```tsx
const handleSearchImported = useCallback(
  (song: Song) => {
    addSong(song);
    navigate(`/${song.id}`);
  },
  [addSong, navigate],
);

<SongSearch
  disabled={currentPath === null}
  inputTestId="song-search"
  onQueryChange={setNameFilter}
  active={offerYoutube}
  onImported={handleSearchImported}
/>;
```

then remove the normal Songs-view `Add music` group and its mounted
`AutoChart`, `SongImport`, and `MyMusic` entry points. `AutoChart` currently
subscribes to every auto-chart job and produces the duplicate lower-right
progress panel seen in `03-importing.png`; it must not be mounted on the main
one-field route.

a local-file picker can survive only behind an advanced/fallback surface, not
beside the search field. after the parent stops passing the legacy
`canUseLocalAudio`, `onUseLocalAudioForSource`, and `onUseLocalAudioForSong`
props, the `LibraryCandidateList` interface can drop them in a follow-up
cleanup.

the main-process resolution is already local-first (`sightkick`, then
`remote`, then `octave`). this lane resolves remote credentials from
`TRANSCRIBER_URL` and `TRANSCRIBER_TOKEN` before stored legacy values, so the
advanced form no longer needs to be touched for the normal route.
