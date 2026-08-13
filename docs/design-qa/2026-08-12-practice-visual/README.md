# practice visual qa — 2026-08-12

source: production Electron build of the final QA lesson fixture. The visual comparison corpus is [the live Yandex Music desktop reference](../2026-08-12-yandex-reference/README.md), inspected before this capture.

run:

```sh
corepack yarn build
corepack yarn node docs/design-qa/2026-08-12-practice-visual/capture-practice-visual.mjs
```

| state                | evidence                                         |
| -------------------- | ------------------------------------------------ |
| idle                 | [01-idle.png](01-idle.png)                       |
| armed                | [02-armed.png](02-armed.png)                     |
| armed at 1024 × 700  | [03-armed-1024x700.png](03-armed-1024x700.png)   |
| armed with inspector | [04-armed-inspector.png](04-armed-inspector.png) |
| counting in          | [05-counting-in.png](05-counting-in.png)         |
| playing              | [06-playing.png](06-playing.png)                 |
| paused               | [07-paused.png](07-paused.png)                   |
| recovering           | [08-recovering.png](08-recovering.png)           |
| done                 | [09-done.png](09-done.png)                       |

[qa-runtime.json](qa-runtime.json) records the actual state assertions: every active live state has either zero captions while playing or exactly one 52 px edge caption; no document/body outer scroll at either target viewport; the score and each ancestor retain `opacity: 1` and `filter: none`; the done state is the real score receipt.

the idle screenshot holds the app's existing `load-song` reply at the Electron IPC boundary only long enough to show the real pending screen, then releases that same reply. The done screenshot disables hands-free/tutor recovery in its isolated QA profile, scrubs through the final two percent of the real practice timeline, and waits for the real engine result. The normal captures retain both systems.

the keyboard fixture supplies no actual MIDI packets, so the inspector frame proves placement and reachability but correctly has no raw-MIDI row. Raw MIDI telemetry remains conditional on real MIDI input and stays inside that inspector.

## hostile visual read

the practice field now has one subject: notation. The toolbar is a hairline context strip, the score sits vertically in the available field, and the one state sentence stays in a 52 px paper rail below it. There are no competing floating cards, kit legends, persistent tutor panel, or pause/recovery blur. The active measure keeps the only warm signal while lane colours remain musical notation, not generic interface decoration.

the remaining visual mismatch is the score receipt: it is an existing result surface with a dimmed backdrop and rounded evidence cells. It is outside this practice-surface change; the capture is included to prove the hand-off, not to claim that results have already received the v3 receipt pass.
