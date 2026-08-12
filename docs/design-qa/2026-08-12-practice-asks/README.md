# practice-surface QA — 2026-08-12

| capture                    | proof                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `01-loop-selection.png`    | selected bars 1–2 are visibly looped and have a one-click clear control                |
| `02-notation-glossary.png` | a triple beam opens a warm, graphical explanation card after hover intent              |
| `03-inactivity-pause.png`  | the paused state explains that the score is held while leaving the screen usable       |
| `04-continue-my-wave.png`  | continuation stays explicit as “Continue My Wave”                                      |
| `05-no-musical-input.png`  | a no-input run is called out as a connection/mapping problem, not a scored performance |
| `06-midi-telemetry.png`    | paused input shows raw count, arrival time, port epoch, and mapped lane                |

behavior coverage lives alongside the surfaces: range drag and clear in `SongView.test.tsx`, pause release in `InactivityPauseVeil.test.tsx`, glossary intent in `NotationGlossary.test.tsx`, lesson continuation and the My Wave reason line in `SongView.test.tsx`, and raw MIDI/checkpoint state in `useMidiInputTelemetry.test.tsx` and `usePracticeAttemptCheckpoint.test.ts`.
