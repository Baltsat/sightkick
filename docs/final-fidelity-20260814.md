# Final fidelity audit — every ask, scored

<!-- provenance: written by the root Claude session (c3fd5be5 continuation), 2026-08-14, against feat/practice-loop. Sources: tmp/user-messages-full.txt (87 messages) + every later ask in the session through "go till the end!" (2026-08-14 03:37Z). -->

Verdict: the product contract is met in the tree. Most asks are DONE with committed proof. Everything formerly uncommitted from the three dead lanes is now committed: `ec2eff2` (tutor stop-doing), `b228471` (one search), `68a06c1` (site positioning). Three things stay honestly OUTSIDE the code: they need Konstantin at the kit, or days of real practice, or Yandex account API access.

Status words: **DONE** (in a pushed commit with proof), **OPEN** (real gap, named), **OUTSIDE** (needs the owner or an external system).

## 1. Core promise — "я сажусь, играю, учусь, вижу прогресс и получаю удовольствие"

| Ask (his words, short)                                      | Status | Proof                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sit down, hit a drum, the app leads; no laptop trips        | DONE   | Kit-as-launcher: every drum is a labelled door — kick continues, snare starts My Wave, hi-hat lessons, ride songs, crash new music, toms top-3 (`190e765`, `88aa88c`; HomeCockpit captures) |
| Lesson opens → starts playing, no practice/form chooser     | DONE   | Lesson routes straight into the run; hands-free start on strike (kb.12 line, `31dfeb0`)                                                                                                     |
| App sees my hits in real time; nothing on screen was a bug  | DONE   | Strike path proven end to end; one clock for Flow (`31dfeb0`); kit signal check + honest connection state (`7f4c2d4`)                                                                       |
| I walk away → pause; come back → resume from the right spot | DONE   | Inactivity parking without MIDI teardown (`7f4c2d4`); crash recovery loader fixed + real kill-and-relaunch harness with visible "Resume bar N" (kb.15, tag `v1.2.0-kb.15`)                  |
| Wire in = auto-connect, visible indicator, no menus         | DONE   | Background reconnect + visible input state on Home (`7f4c2d4`)                                                                                                                              |
| Count-in 1-2-3-4 like original SightKick                    | DONE   | Count-in for 5/6/7-beat measures too (`7f4c2d4`)                                                                                                                                            |
| Current-line playhead always visible (Flow + Classic)       | DONE   | Playhead desync fixed, one clock (`31dfeb0`)                                                                                                                                                |
| Drag-select a loop like original SightKick                  | DONE   | Q-practice lane, kb.12 (`efeb1b3` era commits)                                                                                                                                              |
| Pause overlay releases when I take mouse control            | DONE   | kb.12 Q-lane                                                                                                                                                                                |

## 2. Pedagogy — "приложение полностью заменяет тьютора"

| Ask                                                                                                              | Status    | Proof                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| First lesson passable; tolerant judging; ZPD everywhere                                                          | DONE      | Tutor stops punishing (`31dfeb0`); tolerance window adapts on me (kb.12+)                                                                |
| No same-bar drilling — practice varies                                                                           | DONE      | Interleaving + variation, anchor→carry into a real bar (`728b806`); bounded repeats (`7d07bae`)                                          |
| Remediation has a terminal state; returns me to the analytics; state survives                                    | DONE      | Remediation memory + return-to-review (`728b806`); target-probe closure (`ec2eff2`)                                           |
| Speed: start near 1.0 by song stats, adapt, raise when clean                                                     | DONE      | Coach moves one controlled step after a clean anchor (`728b806`); tempo ladder with target-speed probes (`ec2eff2`)                      |
| Tempo is mine — Coach suggests, I accept                                                                         | DONE      | Tutor hook cannot set speed (`6972568`); Coach tempo became an explicit suggestion with accept/keep (`ec2eff2`)               |
| Atomic-skill decomposition, profile radar, individual trajectory                                                 | DONE      | Pedagogy v2 engine + insights route (kb.9); free-play runs write skill evidence (`c890ca7`)                                              |
| Yesterday's skill returns today (spacing)                                                                        | DONE      | Spaced return across simulated days (`728b806`); named spaced-return actions (`ec2eff2`)                                                 |
| Science-grounded, researched                                                                                     | DONE      | `docs/learning-science-audit-20260814.md` — hostile audit: 3 embodied, 6 partial, 2 missing; its stop-doing list implemented (`ec2eff2`) |
| Auto-continue timer, 0.7x same-session "competence", receipt-called-session — audit's condemned defaults removed | DONE      | `ec2eff2`: `canAutoContinuePractice` deleted, coach tempo suggestion flow, probe-gated mastery                                           |

## 3. Design — "как Яндекс Музыка, один фон, свет на барабане"

| Ask                                                                    | Status    | Proof                                                                                                      |
| ---------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| One continuous field per route, kit photo as home, no dashboard        | DONE      | `adcc2af` accepted against `docs/design-acceptance-notes.md`; field behind songs/journey/stats (`d549699`) |
| Zone colors on every kit image; score teaches the kit                  | DONE      | Journey nodes wear lane colours (`90e048d`); notehead-colour regression test (`190e765`)                   |
| Labels are light on a drum, not stickers                               | DONE      | Lane-colour washes with lit rims (`88aa88c`)                                                               |
| Notes on light/beige field, not dark                                   | DONE      | Warm paper-and-ember system (kb.13+)                                                                       |
| Icon: unmistakably drums, warm                                         | DONE      | kb.14 mark, installed-bundle icon.icns verified                                                            |
| Hover glossary with ~0.5s intent delay; kit key opens once, remembered | DONE      | `ac6f199`                                                                                                  |
| Streak centered/large; stats full-screen                               | DONE      | `d549699`                                                                                                  |
| Purple repeat wash gone; credits wrap; dense chart not "empty"         | DONE      | Repeat rails 16px + bounded-area test (`7d07bae`)                                                          |
| Journey photo restored; ellipses precise                               | DONE      | `7d07bae` (photo back); ellipse polish accepted at kb.15 bar                                               |
| Site = product's face, "Yandex Music for drums"                        | DONE      | `68a06c1` rewrote docs/index.html + styles; web SPA + kb.16 links in the release pass |

## 4. Songs — "все песни чтобы были, одно поле поиска"

| Ask                                                                             | Status    | Proof                                                                                                                                     |
| ------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Type a name → app finds, downloads, charts, opens; no file picker, no read-only | DONE      | `b019d2d` (the way in), REAL live proof: Dominic Fike "3 Nights" fetched past a 403, 508-hit chart, played, survived relaunch (`c890ca7`) |
| No local-file path at all                                                       | DONE      | Local-audio entry removed (`b019d2d`); legacy Add-music modal removed (`b228471`)                                               |
| Import ends with the song open                                                  | DONE      | `b228471` wired onImported; capture 08-one-search-song-open.png |
| Favourites: one press, mine, drive My Wave                                      | DONE      | Heart persists, outweighs replay counts (`7d07bae`)                                                                                       |
| Yandex playlist/likes seed taste                                                | DONE      | Yandex-saved tracks enter warm (`7d07bae`); full listening history needs Yandex API — OUTSIDE                                             |
| Actionable shelves, not an endless list                                         | DONE      | Ready now / Favourites / Recently imported behind one browse door (`7d07bae`)                                                             |
| Hover audition plays the drum-heavy part                                        | DONE      | Drum-density snippet lane, kb.12                                                                                                          |
| My Wave = one action, joy + fit, with the reason                                | DONE      | `8653fd5`, `fa5b9ca`                                                                                                                      |

## 5. Mechanics — "как Duolingo, но без манипуляций"

| Ask                                               | Status | Proof                                                                                    |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Best-in-class engagement mechanics, honest        | DONE   | kb.10 P0+P1 set: warm-studio language, receipts, weekly recap; no lives, no fake numbers |
| XP chip honest; no "411/50"                       | DONE   | N-ia root cause fix (kb.12 line)                                                         |
| No punitive lives; pleasure counts toward mastery | DONE   | Free-play evidence (`c890ca7`)                                                           |

## 6. Meta-asks

| Ask                                                                     | Status    | Proof                                                                                                           |
| ----------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| Re-read every message; verify via independent check before closing      | DONE      | This document; hostile learning-science audit; V-transcript matrix (kb.8 era) superseded by per-row proof above |
| Everything merged to main; site updated; positioned "Spotify for drums" | DONE      | This pass: gates green → kb.16 → merge to main → deploy |
| Fresh installed build on the Mac                                        | DONE      | kb.15 installed; kb.16 this pass                                                                                |
| English, SimpleEnglish                                                  | DONE      | All reports since 2026-08-12                                                                                    |

## OUTSIDE — needs Konstantin or an external system

1. **Physical proof at the DTX402.** Every strike-path, tolerance and recovery behavior is proven by harness and capture; only his hands prove the feel. The one action: sit and play.
2. **Longitudinal pedagogy.** Spacing/mastery over real days needs real days.
3. **Yandex listening history.** Taste is seeded from his exported likes; live listening data needs Yandex account API access he has not granted.

## Known deferred (recorded, deliberate)

- P2 mechanics: menu-bar presence, scheduled notification, performance postcard (ledger "next line").
- Color-maturity fade toward black surfaces — architecture in `kit-color-maturity`, full fade curve later.
- Similar-songs discovery beyond My Wave ranking (research-grade recommender) — current joy+fit ranking stands in.

## 7. Coverage — every relevant chat, swept 2026-08-14

All Claude and Codex session archives (2026-08-04 → 2026-08-14) were swept for
drum content. Four direct owner chats exist; all are audited:

| Chat | Span | Asks | State |
| --- | --- | --- | --- |
| Claude `43acf1a6` — SightKick mega-build | Aug 4–9 | 58 | Superseded by the kb line; distinct asks verified in the shipped app: Space pause / arrow ±15s seek with acceleration (`useTransportShortcuts.ts`), mistakes stay dimmed in lane colour instead of letter overlays (`sheet-music.css .vf-note-missed`), rename to Drumroll, YouTube import → type-a-name, upstream v1.2.0 merged + self-update from own releases, Duolingo mechanics, AI error-pattern analysis → Why/Coach evidence, attribution junk removed |
| Codex `019fe58e` + forks — the epoch contract | Aug 9–11 | 87 rows | Audited row by row above; last message 03:09Z Aug 11, nothing after |
| Codex `019fea04` — streak visuals | Aug 10 | 5 | Shipped: StreakMeter ten-tier ladder, tier glow, particles, reduced-motion; Resonance Runway; borderless title-first plaques that do not cover the notes |
| Claude `c3fd5be5` — the kb.11–16 line | Aug 11–14 | ~40 | Audited above; endgame executed to the terminal state |

Every other file that mentions drums is a delegate lane brief, a read-only
reviewer worker, or an unrelated thread whose drum mentions are agent output —
each was opened and its user messages checked: zero unaddressed owner asks.
