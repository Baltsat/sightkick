# Drumroll 1.2.0-kb.9

`kb.9` makes the kit the centre of Drumroll again: sit down, see one useful
next action, and begin it with one deliberate mapped-pad hit. It is prepared
from source commit `8544ff5`. This note does not claim a signed, notarized, or
published kb.9 package until the distribution placeholders below are replaced
with the release receipt.

## Kit home and one-hit start

- Home is an armed kit rather than a dashboard. The session composer chooses a
  next action from learner evidence, current intent, prerequisites, and
  favourite-song paths, then explains the choice.
- Learn and Songs are explicit intents. Either can arm the target without
  hiding the mouse, keyboard, or chooser fallbacks.
- One mapped pad starts the armed target. The captured composer route covers
  Learn and Songs at 1225×768 and 1024×700 without outer-page overflow.

## Practice reads as a performance surface

- Ready, count-in, playing, pause, recovery, and judged-hit states now have
  their own compact chrome. Practice retains its warm paper notation field and
  fixed reading position.
- Motion is tied to current musical evidence: a playing note and a judged hit
  can animate; idle states do not loop for decoration. Reduced motion suppresses
  those effects.
- The new snare icon has dedicated Finder-context and scale-matrix captures.

## Evidence-backed learning and Insights

- Pedagogy engine v2 maps all 170 authored exercises into an atomic skill graph
  and stores replayable evidence rather than a second statistics silo.
- It distinguishes acquisition from delayed retention and musical transfer.
  Recommendations carry a ZPD receipt describing the task, evidence, and any
  scaffold such as slower speed, shorter range, preview, cue, or Tutor loop.
- Favourite songs can become visible goals with a path through prerequisite
  skills. The user can still select a song, lesson, or difficulty directly.
- Insights brings that saved evidence into a dedicated route instead of leaving
  the learner with a single lifetime score.

This is a practice-selection model with bounded MIDI evidence. It cannot prove
posture, grip, rebound, tension, acoustic tone, injury safety, or longitudinal
learning efficacy.

## Songs: five gates, three playable rows

A source row is playable only when one stored certificate binds all five facts:
exact title/artist/duration identity; hashed lawful local audio selected by the
owner; approved chart provenance; a fresh drum-difficulty scan; and a successful
headless load preflight. The complete certificates and captures are retained in
[the kb.9 songs proof ledger](design-qa/2026-08-11-kb9-songs/status.md).

|   # | Source identity                                          | State               | Proof or exact blocker                                                                                                                                                                                                                                                               |
| --: | -------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Pendant que les champs brûlent — Niagara — 231 s         | blocked             | No exact lawful local audio on this machine; no exact reviewed drum chart found in Chorus Encore or RhythmVerse.                                                                                                                                                                     |
|   2 | Natural Villain — The Man Who — 199 s                    | blocked             | Source artist is The Man Who; no exact lawful local audio on this machine; no exact reviewed drum chart found.                                                                                                                                                                       |
|   3 | Loyal — ODESZA — 208 s                                   | playable            | Local audio hash `a5edd1b873804246bffc159a079fd40620a7d1fd4254010266574ad15afa6b74`; local auto-chart, `mid`, Easy/Medium/Hard/Expert, headless load at `2026-08-11T07:46:26.088Z`, and a 3,794-path rendered launch.                                                                |
|   4 | Made To Love — TobyMac — 232 s                           | playable            | Local audio hash `66612452eff7a91f2661e0cfcf071ed6c0787e028ac2185707ea095483d52ebd`; local auto-chart, `mid`, Easy/Medium/Hard/Expert, headless load at `2026-08-11T07:52:43.419Z`, and a 3,836-path rendered launch.                                                                |
|   5 | Help Is On The Way (Maybe Midnight) — TobyMac — 182 s    | blocked             | No exact lawful local audio on this machine; no exact reviewed drum chart found.                                                                                                                                                                                                     |
|   6 | Heat Waves — Living In Fiction                           | identity incomplete | The source capture has no duration or stable track URL. Glass Animals’ same-title recording is rejected; no resolver or auto-chart path may run.                                                                                                                                     |
|   7 | What I Like About You — Jonas Blue + Theresa Rex — 220 s | playable            | Local audio hash `3ac19446474b0a6c621bad5ca508026ff98d7272fa2466448b5304e93abe886d`; local auto-chart, `mid`, Easy/Medium/Hard/Expert, headless load at `2026-08-11T07:56:06.426Z`, and a 3,629-path rendered launch. The Romantics chart is rejected as a different artist/version. |
|   8 | Sanctuary — Welshly Arms — 228 s                         | blocked             | No exact lawful local audio on this machine; Super City and Welshly Arms’ “Legendary” are rejected false matches; no exact reviewed drum chart found.                                                                                                                                |
|   9 | Wantchya — Ballpoint                                     | identity incomplete | The source capture has no duration or stable track URL; no lawful auto-chart route is allowed.                                                                                                                                                                                       |
|  10 | Can’t Use Me — Morray — 170 s                            | blocked             | No exact lawful local audio on this machine; no exact reviewed drum chart found.                                                                                                                                                                                                     |
|  11 | UNSTOPPABLE Cover — Sukiwat — 227 s                      | blocked             | “Cover” does not identify a recording strongly enough to substitute another version; no exact lawful local audio on this machine and no exact reviewed chart found.                                                                                                                  |
|  12 | Niten Doraku — Sprnova — 158 s                           | blocked             | No exact lawful local audio on this machine; no exact reviewed drum chart found.                                                                                                                                                                                                     |
|  13 | Low — Lenny Kravitz — 319 s                              | blocked             | No exact lawful local audio on this machine. Foo Fighters and Testament same-title charts are rejected as different artists and durations.                                                                                                                                           |

User action: drop the exact lawful local-audio files for the eight blocked
source identities into a user-controlled selection. That unlocks Drumroll’s
local auto-chart route; the row becomes playable only after its new chart passes
the drum scan and headless-load gates. The two identity-incomplete rows first
need a stable source URL and duration; a same-title substitute is not allowed.

## Regression dossier

The kb.9 dossier retains before/after boards, compact Home and Journey captures,
Practice states, Profile and Insights captures, Finder icon proof, and a
reduced-motion case. Its runtime records no console or page errors across the
captured 1224×768 and 1024×700 routes. See
[the kb.9 dossier](design-qa/2026-08-11-kb9-dossier/README.md).

## Distribution

- Source commit: `8544ff5`
- Release: <RELEASE-URL>
- Apple Silicon DMG SHA-256: `<DMG-SHA256>`

## Evidence boundary

Physical Yamaha DTX402 cable-cycle behavior and a complete hands-free playing
session still require the connected kit. MIDI cannot establish posture, grip,
rebound, muscular tension, acoustic tone, or injury safety. Retention and
transfer claims need longitudinal learner and teacher evidence. Protected music
is not made available by a metadata row, a same-title match, or a chart alone.
