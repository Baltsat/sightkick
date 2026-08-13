# Kit launcher QA — 2026-08-13

| Capture                        | State                                            | Proof                                                                                  |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `01-labelled-kit-1225x768.png` | armed launcher at the wide supported viewport    | every physical surface carries a concise, lane-coloured door label                     |
| `02-labelled-kit-1024x700.png` | armed launcher at the compact supported viewport | labels, drumheads, and safe text bands remain readable without cropping the kit        |
| `03-empty-top-tom.png`         | no saved top-three songs                         | each tom names the absence and directs the player to the action that creates a ranking |
| `04-snare-struck-flare.png`    | deliberate snare press                           | My Wave’s snare head flares once in its red lane while the rest of the kit settles     |

The capture script uses the local Storybook surface with the installed Google Chrome binary and writes the four images above. It is deliberately a component-level visual dossier; `kit-door-routing.test.tsx` proves the door-to-callback contract. The shell still needs to wire the three new callbacks before this can be called end-to-end navigation proof.

## Door map

| Drum                      | Door                  | Concrete behaviour                                                                                     |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| Kick                      | Continue              | starts the armed learning session, or the last worked song when no ranking is available                |
| Snare                     | My Wave               | starts the songs-only composed My Wave session                                                         |
| Hi-hat                    | Next lesson           | opens Journey at the curriculum path                                                                   |
| Ride                      | Your songs            | opens the library                                                                                      |
| Crash                     | Find new              | opens the discovery entry point                                                                        |
| Tom 1 / Tom 2 / Floor tom | Top 1 / Top 2 / Top 3 | starts the first, second, or third most-played song; ties resolve by song id to preserve muscle memory |

Pointer presses launch a door directly. On a physical kit, a labelled-pad hit selects that door and the existing confirm control starts it; a hit without confirm never starts a session.

## Checks

- `corepack yarn vitest run src/renderer/components/HomeCockpit/HomeCockpit.test.tsx src/renderer/components/HomeCockpit/kit-door-routing.test.tsx src/renderer/components/HomeCockpit/kit-zone-map.test.ts src/renderer/components/HomeCockpit/kit-text-safe-bands.test.ts` → 35 passed
- `corepack yarn vitest run src/renderer/views/SongListView/SongListView.test.tsx --testNamePattern='opens on the playfield-first Home cockpit|keeps physical MIDI feedback silent'` → 2 passed
- `corepack yarn eslint` scoped to the touched HomeCockpit and capture files → passed
- `corepack yarn lint` → passed
- `corepack yarn typecheck` → passed
- `corepack yarn build` → passed

The latest full `corepack yarn vitest run` could not complete: unrelated `InputContext`, `SongListView`, and `SongView` cases exceeded their 20-second timeouts, then Vitest exhausted its fork worker pool. A one-worker retry reached the pre-existing slow `SongListView` cases (up to 111 seconds per test) before it was stopped. The launcher contract and its parent integration checks above are green; this remains a repository-suite infrastructure blocker outside this lane.

## Shell handoff

`HomeCockpit` exposes three optional callbacks that the shell must now pass:

- `onOpenJourney={() => setView('journey')}` for the hi-hat.
- `onStartSong={(song) => openManualPractice(song.id)}` for the three top-song toms and a remembered kick target.
- `onFindNewMusic={openDiscovery}` for the crash, where `openDiscovery` enters Songs and focuses the existing search/add-music surface.

Until those callbacks are connected, the component uses its old Songs fallback so no pad becomes dead. With `onStartSong` present, an empty tom always opens Songs instead of borrowing the armed target.
