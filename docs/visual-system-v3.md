# drumroll visual system v3

status: implementation specification

scope: the visual rework of the existing Electron/web renderer. This document changes no runtime behaviour by itself. It is deliberately narrower than a rewrite: keep the learning model, MIDI handling, save path, and practice engine; replace the visual grammar that makes them feel like an admin product.

source corpus:

- live, signed-in Yandex Music desktop app, v`5.114.1`, captured on 2026-08-12 in [`design-qa/2026-08-12-yandex-reference/`](design-qa/2026-08-12-yandex-reference/README.md). The canonical public service is [Yandex Music](https://music.yandex.ru/).
- current Drumroll source ownership: `AppShell`, `HomeCockpit`, `SongListView`, `LessonsView` / `LessonsJourney`, `SongView`, `TutorHud`, and `ScoreSummary`.
- earlier direction: [`design-direction-v2.md`](design-direction-v2.md). v3 keeps its one-hit practice ritual and warm-studio premise, but replaces its unverified Yandex reference with a direct desktop-app capture set.

## the decision

Drumroll is a warm-paper instrument room. The photographic kit is the single dominant object on home; notation is the single dominant object during practice; the player’s saved evidence appears only after it earns attention. The product should feel like a personal music service that happens to teach drums: you sit down, recognise your current place, hit a pad, and the room carries the next step.

The borrowed Yandex Music rules are structural:

- a persistent, quiet rail gives every route a home;
- one visual event owns each screen;
- secondary material stays close enough to reach but too quiet to compete;
- a loaded route retains its geometry while data arrives;
- a primary action is visible without studying the page;
- an expanded surface replaces the page only when the task truly needs full attention.

Do not clone the player. Drumroll has a photographic kit, paper, ink, cymbal metal, notation, and real practice evidence. It needs warmth, physical confidence, and calm recovery instead of black glass, album-art gradients, or yellow playback controls.

This connects to the existing personal-music-service direction: Drumroll’s `My Wave` is the player’s personal practice stream, never a file-manager/library header.

## what the reference actually proves

| reference observation                                                                     | why it works                                                  | Drumroll translation                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `My Vibe` uses a huge title, one image field, a rail, and a short personal-choice column. | the user knows where they are before reading any metadata.    | home gets the kit, one current practice manifest, and a quiet `My Wave` chooser only when changing the target is intentional.             |
| search, library, and playlists share a light continuous canvas.                           | content remains dense without turning into a card grid.       | songs, journey, profile, and results live on warm paper with hairlines and row rhythm.                                                    |
| the now-playing surface lets the album art own the field.                                 | full-screen attention is justified by a single live object.   | practice lets notation own the stage; controls sit on edges and never sit on top of noteheads.                                            |
| a selected nav item is a small local state change.                                        | location is obvious without a dashboard header.               | rail selection is one wine line/quiet fill; route labels are normal words, not an achievement banner.                                     |
| yellow is spent on `Listen`, not on everything.                                           | saturation preserves meaning.                                 | ember starts a practice action, yellow marks a count-in beat, green confirms earned progress, and kit colours identify drums only.        |
| track rows have art, two text lines, one evidence glyph, and a duration.                  | density stays legible because the row has a repeated grammar. | song and lesson rows use thumbnail, title, one support line, one right-side evidence mark; no four badges, ring, tag, and button cluster. |
| route loading holds the layout in place.                                                  | attention stays anchored during transitions.                  | skeletons inherit the target route’s main geometry. Do not collapse into generic centred spinners.                                        |

## visual laws

### 1. one dominant object per viewport

| route    | dominant object                             | companion material                                      | forbidden rival                                             |
| -------- | ------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| home     | photographic kit with its live strike zones | current practice manifest and one low `My Wave` shelf   | a second hero card, large XP panel, or permanent coach deck |
| songs    | the selected song/library list              | one search/filter line and an optional continuation row | multiple dashboard banners                                  |
| journey  | the current season path                     | season rail and one next-lesson manifest                | a second curriculum dashboard inside the map                |
| practice | readable notation and active measure        | edge controls and one state caption                     | opaque overlays, duplicated tutor copy, or a blurred score  |
| results  | one musical receipt statement               | three factual evidence cells                            | a chart wall, trophy drawer, and coach briefing at once     |
| profile  | one time scale: today, 30 days, or history  | one navigation control to the other time scales         | all three time scales stacked together                      |

At desktop width, the dominant object gets at least 65% of the usable visual area. At the 1024 × 700 minimum, it still gets at least 58%; the rail collapses before the hero, kit, or notation does.

### 2. the canvas is continuous

There are two allowed materials.

1. **warm paper** for choosing, planning, browsing, reflecting, and results. It is one field with sparse raised moments, not a white card on a beige page inside another card.
2. **studio dusk** for the live kit and performance-critical notation only. It may use controlled image wash to protect readability. It never uses translucent glass cards over cymbals or staff lines.

Within a route, use a hairline, a density shift, or a local paper flap to establish hierarchy before adding shadow. A raised container needs a task: a focused control group, a single expandable receipt, or an image crop. If it has no task, remove its border and shadow.

### 3. primary action has one grammar

`start practice`, `resume`, `continue my wave`, and a concrete recovery action use ember fill, dark ink, one verb, and a leading play/pad icon when that disambiguates the action. There is one such control in the first viewport.

`listen`, `open`, `details`, `settings`, `like`, and filter actions stay quiet. An icon-only action must have a tooltip and accessible name; it does not acquire a coloured chip merely because it is visible.

### 4. practice is a live state, not a stack of panels

During practice, every state has one sentence of live instruction and one visual locus. The active bar and the relevant pad/notation colour can move; all saved evidence, advanced controls, and explanations live in an edge drawer or after-run receipt.

### 5. detail is reachable, never preloaded

The user can get raw MIDI telemetry, timing-window rationale, per-lane history, coach evidence, and settings in one intentional action. None belongs in the default first viewport while the kit or score is asking for a hit.

## token contract

Add the v3 tokens to `src/renderer/styles/theme.css`. Keep legacy aliases during the route-by-route migration; do not perform an unrelated whole-repo literal-colour replacement.

### colour

| role             | token                | value     | use                                            |
| ---------------- | -------------------- | --------- | ---------------------------------------------- |
| warm canvas      | `--dr-canvas`        | `#f4efe5` | default route field                            |
| paper            | `--dr-paper`         | `#fcf9f2` | local readable surface, route loading skeleton |
| paper low        | `--dr-paper-low`     | `#eae1d3` | selected quiet shelf, disabled local field     |
| ink              | `--dr-ink`           | `#241f19` | primary text, icon ink                         |
| ink secondary    | `--dr-ink-muted`     | `#71685e` | support text, quiet controls                   |
| hairline         | `--dr-line`          | `#d9cebd` | structural separation                          |
| studio           | `--dr-studio`        | `#28221b` | kit / performance backdrop                     |
| studio ink       | `--dr-studio-ink`    | `#fff8ed` | text on studio only                            |
| immediate action | `--dr-ember`         | `#e85a36` | start, resume, recovery command                |
| immediate press  | `--dr-ember-pressed` | `#c8452b` | active press only                              |
| selected target  | `--dr-wine`          | `#7b3d46` | active rail, selected journey target           |
| count-in         | `--dr-count`         | `#f4bd3d` | active count beat only                         |
| earned           | `--dr-earned`        | `#2e8068` | clear, saved, genuine improvement              |
| warning          | `--dr-warning`       | `#a95e28` | recoverable attention state                    |
| error            | `--dr-error`         | `#b9473d` | broken save/input state, never ordinary misses |
| focus            | `--dr-focus`         | `#256eaa` | keyboard focus ring on paper                   |

Mapping during P0: `--surface-canvas` → `--dr-canvas`; `--surface-raised` → `--dr-paper`; `--ink-strong` → `--dr-ink`; `--ink-muted` → `--dr-ink-muted`; `--line-soft` → `--dr-line`; `--signal-ember` → `--dr-ember`; `--signal-wine` → `--dr-wine`; `--signal-green` → `--dr-earned`.

### kit colour discipline

The current named kit lanes remain an instrument map. They never colour random cards, goals, badges, or prose.

| element           | token                      | visible role                          |
| ----------------- | -------------------------- | ------------------------------------- |
| kick              | `--dr-kit-kick: #dc7244`   | kick zone and matching notation head  |
| snare             | `--dr-kit-snare: #c9584d`  | snare zone and matching notation head |
| hi-hat / tom 1    | `--dr-kit-yellow: #c99627` | hi-hat and upper-tom family           |
| ride / tom 2      | `--dr-kit-blue: #3e80aa`   | ride and mid-tom family               |
| crash / floor tom | `--dr-kit-green: #3a856c`  | crash and floor-tom family            |

Use the mature colour-fade system already present in `HomeCockpit`; keep at least an ink outline or labelled focus state when colour saturation fades. A user must never lose pad identity because the visual becomes tasteful.

### type

| role            | family                | desktop value | minimum-width value | rule                                                           |
| --------------- | --------------------- | ------------- | ------------------- | -------------------------------------------------------------- |
| route hero      | `var(--font-display)` | `48/48`, 650  | `36/38`, 650        | one per route only                                             |
| object title    | `var(--font-display)` | `30/33`, 650  | `26/29`, 650        | kit manifest, playlist, result line                            |
| section title   | `var(--font-ui)`      | `20/24`, 720  | `18/22`, 720        | normal case, no letter-spaced shouting                         |
| body            | `var(--font-ui)`      | `16/22`, 450  | `15/21`, 450        | one support sentence maximum near a live action                |
| support         | `var(--font-ui)`      | `14/18`, 520  | `13/17`, 520        | artist, evidence reason, state detail                          |
| compact control | `var(--font-ui)`      | `13/16`, 680  | `13/16`, 680        | rails, chips, row metadata                                     |
| micro label     | `var(--font-ui)`      | `11/14`, 700  | `11/14`, 700        | only when an actual label is needed; no dense all-caps systems |

Use `Newsreader` only where an object deserves the emotional hand of a title. The notation, controls, rows, data, and system state stay in `Instrument Sans`. Numeric facts use tabular figures.

### space, radius, and elevation

| role                      | token / value                           | rule                                                           |
| ------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| spatial rhythm            | `4, 8, 12, 16, 24, 32, 48, 64 px`       | use this scale; no ad-hoc 18/22/26 px gaps in new work         |
| desktop rail              | `208 px`                                | contains brand, four route items, profile/settings at the foot |
| compact rail              | `64 px` below `1120 px`                 | icons remain labelled by tooltip and accessible name           |
| route gutter              | `32 px` wide, `24 px` compact           | applies to the main content, not over the kit/score            |
| primary control           | `44 px` min height                      | 48 px only for the lone start/resume action                    |
| row                       | `56 px` min, `64 px` with artwork       | no detached card around each row                               |
| local control radius      | `6 px`                                  | buttons, compact inputs, tabs                                  |
| media / local flap radius | `12 px`                                 | image crop and a deliberate local panel only                   |
| filter chip               | `999 px`                                | allowed solely for a compact mutually exclusive filter         |
| structural surface        | `0 px`                                  | page fields, rails, player-like docks, section separators      |
| flat                      | `none`                                  | default                                                        |
| paper lift                | `0 12px 28px -20px rgb(36 31 25 / 28%)` | only a focused local surface                                   |
| studio lift               | `0 20px 44px -28px rgb(0 0 0 / 54%)`    | only an image object above studio darkness                     |

### motion

The live capture proves that Yandex Music keeps route anchors stable and lets the body resolve in place. It does not provide a direct pointer-hover timing sample; the values below are Drumroll’s design policy.

| event                       | duration            | motion                           | allowed meaning                       |
| --------------------------- | ------------------- | -------------------------------- | ------------------------------------- |
| press / pad acknowledgement | `100 ms`            | opacity + 1–2 px compression     | a hit landed or a control was pressed |
| hover / focus reveal        | `120 ms`            | colour or hairline only          | a secondary action is now reachable   |
| state change                | `180 ms`            | opacity + up to 8 px translation | armed, paused, resumed, selected      |
| route / drawer              | `220 ms`            | opacity + 12 px translation      | attention moved to another task       |
| receipt reveal              | `240 ms`            | paper flap / 10 px rise          | a run became saved evidence           |
| count-in beat               | exact beat duration | scale ≤ `1.05` + colour          | the metronome advances                |
| notation hit                | `120 ms`            | colour/position only             | active note, hit, miss, or wrong pad  |

Use `cubic-bezier(0.2, 0.8, 0.2, 1)` for surfaces and `ease-out` for immediate acknowledgement. No bounce, springy arrival, infinite glow breathing, decorative particle field, high-radius blur, or scrolling parallax. `prefers-reduced-motion` retains static state colour, labels, and progress but removes movement and looping effects.

## global layout law

```text
┌──────── quiet rail ────────┬──────────────── stable route canvas ────────────────┐
│ brand                       │ route context / one quiet utility edge             │
│ home                         │                                                        │
│ songs                        │                  dominant object                     │
│ journey                      │                                                        │
│ profile                      │                                                        │
│                              ├──────────────── low evidence / action strip ──────┤
│ profile + settings           │ one companion surface, if the route needs one        │
└─────────────────────────────┴────────────────────────────────────────────────────┘
```

1. the rail owns global route changes; a route does not rebuild its own left navigation.
2. the top line has location or live status, never both a dashboard header and a hero title.
3. each route owns one scrollable region. Home and practice do not externally scroll at desktop dimensions.
4. a route may have one secondary column only when it changes the user’s immediate choice: song source/filter, lesson season, or alternate `My Wave` target.
5. drawers and overlays replace attention rather than stack over it. One overlay at a time.
6. a user returning from practice gets the same rail and route geometry, then the relevant receipt; do not teleport into a generic analytics dashboard.

## component rules

### rail

- `home`, `songs`, `journey`, and `profile` are the four primary destinations. `coach` stops being a permanent first-order route after its contextual surfaces ship.
- the active item uses a `2 px` wine edge or quiet paper fill, never an oversized selected tile.
- label case stays normal. The current `Daybreak Arena` subtitle, internal progress codes, and motivational rail slogan are not navigation information; remove them from the default rail.
- profile and settings live at the foot as quiet icon/text controls. The rail stays fixed while content changes.

### hero / kit stage

- the kit photograph is one continuous studio plane. Reserve a stable text-safe edge; leave cymbals, heads, and strike zones physically visible.
- the session manifest is direct text on the safe edge or a single paper flap flush to the image boundary. It has title, one evidence or readiness line, and one action.
- a kit zone has an outline, its named lane colour when active, and a short impact response. It does not need a permanent floating label cloud.
- the unresolved-target state says `choose a song to arm your kit` and offers one `choose a song` action. It never shows a disconnected multi-card dashboard.
- the `My Wave` chooser is folded by default. Opening it presents 4–6 large practice choices in a vertical subdivision column: current song, favourite-song payoff, weak skill, next lesson, and a manual browse entry. A choice is concrete enough to play today.

### subdivision column

- it is a route-local choice layer, not a second navigation rail.
- home uses it only to deliberately change the practice target; songs uses it for source/filter; journey uses it for season; profile uses it for time scale.
- each item has one icon/art mark, a title, and one subordinate reason. It has no score ring, chip pile, or embedded button row.
- selected state is wine edge/ink contrast. Hover reveals a single play/open affordance after `120 ms`.

### lists and rows

- rows sit directly on paper with a `1 px` divider or deliberate whitespace. No visible rectangle per item.
- thumbnail: `40 px` in a compact row, `56 px` in a featured row; use artwork only when it identifies the object.
- text: title then one supporting line. Right edge may contain one factual metric such as duration, mastery, availability, or a quiet affordance.
- hover may reveal play and a three-dot menu. It never exposes an unbroken toolbar of pin, like, download, delete, share, tags, and stats.
- the selected row gains a soft paper-low field or wine edge. It never receives a large shadow or a second card container.

### chips, tabs, and controls

- chips are for mutually exclusive filters and modes only: `all`, `favourites`, `ready`, `lessons`, `practice`, `perform`, `flow`, `classic`.
- selected chip: paper/ink boundary plus a 2 px wine or focus outline. Do not use coral/ember for a filter.
- primary actions are 6 px radius, ember-filled, and singular. Secondary actions are text or neutral icon buttons.
- do not present XP, streaks, difficulty, score, mode, and MIDI readiness as five sibling badges. Compose one status phrase and move all other facts to a disclosure.

### overlays and drawers

- use a full reading surface for now-playing-equivalent tasks: practice inspector, detailed coach evidence, focused score receipt, or settings. Its entrance preserves the context name and has a clear return gesture.
- use a `64 px` max-height edge rail for a live practice cue. It may not blur, dim below legibility, or cover noteheads.
- an overlay owns a task. Do not pop a score modal, a coach drawer, an inactivity veil, a count-in panel, and a transport toast on one score at the same time.

### receipts

- a receipt begins with one musical statement: `you held the chorus at 0.8×`, `the snare settled`, or `bar 17 is ready for the full song`.
- beneath it, show at most three factual cells: accuracy/timing, cleared target, and next action. Use hairlines, tabular numbers, and one earned signal.
- charts, raw evidence, AI explanation, and archive history are nested after an explicit `see the evidence` action.
- a receipt stays connected to its song/lesson and return route. It never impersonates a social-game reward screen.

## state system

| state       | dominant visual                                               | copy / action                                                               | what stays quiet                  | prohibited                              |
| ----------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- | --------------------------------------- |
| idle        | warm paper or unarmed studio kit                              | `choose a song to arm your kit`                                             | library details, historical stats | warning colour, faux urgency            |
| armed       | kit with soft named strike zones; target manifest             | `hit any pad to begin`                                                      | one readiness/source line         | extra start buttons, full coach card    |
| counting in | readable score/kit plus exact count beats                     | beat count only; cancel remains an edge action                              | all analysis and route navigation | a floating modal, colour-gradient badge |
| playing     | notation and active measure                                   | controls on the perimeter; tutor caption only if it changes the next action | saved metrics and configuration   | persistent coach panel, pulse soup      |
| paused      | same score, frozen playhead, light local dim outside notation | `paused at bar N · hit any pad to count in`                                 | tutor details                     | blur, large card, score opacity loss    |
| recovering  | same score plus local bar bracket / target lane               | `repeat bars N–M once` or `returning to the song`                           | total history                     | full-screen failure state, red wall     |
| done        | paper receipt with one musical consequence                    | `continue my wave` or a concrete next route                                 | data archive                      | generic `great job`, trophy/card grid   |

State hand-offs:

```text
idle → armed → counting in → playing → paused → counting in
                                      └→ recovering → playing
playing → done → armed or a new explicit route
```

Every transition retains the thing the user is practising. The score does not disappear during a pause; the kit does not disappear while a target is armed; a result does not wipe out which song created it.

## screen directions

### home — the personal kit

**first read:** current song/lesson, physical kit, one way to start.

- put the kit across the major plane; reserve roughly 35% of the composition for the manifest and safe text contrast.
- the manifest has title, `My Wave` reason or readiness, one ember action. Remove supporting buttons that route to the same result.
- a one-line strip at the bottom can show next lesson, last musical win, and current daily commitment. It uses dividers, no cards.
- move colour mode, dense status, and equipment details to settings/disclosure. Keep `MIDI mapped · DTX Drums` as a quiet factual line only when it matters.
- remove the standalone coach desk from home. One `next useful rep` line can live in the manifest or low strip; evidence belongs after an intentional open.

**files:** `src/renderer/components/HomeCockpit/HomeCockpit.tsx`, `src/renderer/components/HomeCockpit/HomeCockpit.css`, `src/renderer/components/HomeCockpit/kit-zone-map.ts`, `src/renderer/components/PracticeCards/EvidencePracticeCards.tsx`, `src/renderer/components/PracticeCards/EvidencePracticeCards.css`.

### songs — personal library, not an admin table

**first read:** search, selected source, playable choice.

- use one route title and a search field. Source/filter controls form a quiet horizontal line or one secondary column at compact widths.
- retain continuation only when it resolves to a real playable song/lesson. It is a featured row, not a separate glass card.
- a song row has artwork, title, artist/source, one readiness/evidence mark, and one right-side play/continue affordance.
- imports, chart provenance, split progress, local/remote technical state, and mass actions fall behind an `add music` sheet. They are operational tools, not the visual start point.

**files:** `src/renderer/views/SongListView/SongListView.tsx`, `src/renderer/components/SongSearch/SongSearch.tsx`, `src/renderer/components/SongFilter/SongFilter.tsx`, `src/renderer/components/SongList/SongList.tsx`, `src/renderer/components/SongListItem/SongListItem.tsx`, `src/renderer/components/MyMusic/MyMusic.tsx`, `src/renderer/components/SongImport/SongImport.tsx`, `src/renderer/components/LibraryCandidateList/LibraryCandidateList.tsx`.

### journey — a readable rehearsal route

**first read:** season, current lesson, one route through the room.

- keep the season rail as the route-local subdivision column. Use full season names and clear `next`, `locked`, or `cleared` states; codes are secondary.
- the stage has one venue/season marker, path, and current lesson. Avoid a second dark plaque plus a dense header plus a card grid.
- node labels show title and one prerequisite or victory line. Stars, lock metadata, detailed curriculum facts, and controls reveal on focus/selection.
- one action starts the current target. `Coach` appears as a reason line attached to that target, not as an adjacent panel.

**files:** `src/renderer/components/LessonsView/LessonsView.tsx`, `src/renderer/components/LessonsJourney/HeaderStrip.tsx`, `src/renderer/components/LessonsJourney/LessonPath.tsx`, `src/renderer/components/LessonsJourney/LessonNode.tsx`, `src/renderer/components/LessonsJourney/SeasonCard.tsx`, `src/renderer/components/LessonsJourney/JourneyV2.css`, `src/renderer/components/LessonsJourney/daybreak-journey.css`.

### practice — the score owns the room

**first read:** song, current bar, what the kit needs now.

- create one narrow top transport line: back, title/artist, mode, speed, true input health, and inspector. Collapse technical telemetry into the inspector after the issue is resolved.
- Flow and Classic use the same materials and state semantics. Flow may feel continuous; Classic may feel like a paper score. Neither has a floating HUD that repeats the toolbar.
- readiness, count-in, inactivity pause, tutor recovery, loop escape, and performance commands resolve into the same edge-caption location. Only one is visible at a time.
- the staff remains 100% readable in `ready`, `counting-in`, `paused`, `inactivity-paused`, and `recovering`. Do not filter-blur, scale, or lower the score below useful contrast.
- state colour uses ember for an immediate next action, yellow for active count, earned green for a cleared phrase, kit lane colours for drum identity. A miss has local notation treatment, not a red dashboard alert.

**files:** `src/renderer/views/SongView/SongView.tsx`, `src/renderer/views/SongView/SongView.css`, `src/renderer/styles/sheet-music.css`, `src/renderer/components/PracticeReadinessCue/PracticeReadinessCue.tsx`, `src/renderer/components/PracticeReadinessCue/PracticeReadinessCue.css`, `src/renderer/components/CountIn/CountIn.tsx`, `src/renderer/components/CountIn/CountIn.css`, `src/renderer/components/InactivityPauseVeil/InactivityPauseVeil.tsx`, `src/renderer/components/InactivityPauseVeil/InactivityPauseVeil.css`, `src/renderer/components/TutorHud/TutorHud.tsx`, `src/renderer/components/TutorHud/TutorHud.css`, `src/renderer/components/ContinuousNotation/ContinuousNotation.tsx`, `src/renderer/components/ContinuousNotation/ContinuousNotation.css`.

### dissolved coach surfaces — help at the moment of use

The persistent `Coach` destination and full card deck are visual debt. Preserve all real coaching logic; redistribute its presentation.

| moment             | surface                               | permitted content                                   |
| ------------------ | ------------------------------------- | --------------------------------------------------- |
| home               | manifest reason / low `My Wave` strip | one actionable target and one honest reason         |
| song selection     | selected row companion                | why this song or section is next                    |
| during practice    | edge caption / local loop marker      | one active correction or clear condition            |
| after a run        | receipt                               | one musical conclusion, next action, `see evidence` |
| voluntary analysis | drawer or profile route               | raw runs, charts, method, and historical comparison |

Until the last contextual surface exists, leave the existing coach route reachable through profile/insights or a temporary `see evidence` entry point. Do not delete coaching access before the new destinations are real.

**files:** `src/renderer/components/AppShell/AppShell.tsx`, `src/renderer/components/AppShell/AppShell.css`, `src/renderer/components/HomeCockpit/HomeCockpit.tsx`, `src/renderer/components/AICoach/AICoach.tsx`, `src/renderer/components/AICoach/CoachCard.tsx`, `src/renderer/components/TutorHud/TutorHud.tsx`, `src/renderer/components/ScoreSummary/ScoreSummary.tsx`, `src/renderer/components/LearningEvidenceReceipt/LearningEvidenceReceipt.tsx`, `src/renderer/components/PracticeStats/PracticeStats.tsx`, `src/renderer/components/Profile/ProfileView.tsx`.

### results and profile — evidence after delight

- the score modal becomes a paper receipt with one strong line and one continuation action. The technical `practice saved` state is factual and quiet.
- a profile opens on a chosen time scale, defaulting to the one that makes the next practice decision. Its radar, history, and detailed runs are progressive disclosures.
- charts must answer a musical question. A graph without an action is archival, not homepage material.

**files:** `src/renderer/components/ScoreSummary/ScoreSummary.tsx`, `src/renderer/components/ScoreSummary/musicalReceipt.ts`, `src/renderer/components/PerformancePostcard/PerformancePostcardDialog.tsx`, `src/renderer/components/Profile/ProfileView.tsx`, `src/renderer/components/Profile/MasteryGraph.tsx`, `src/renderer/components/Profile/PracticeHistory.tsx`, `src/renderer/components/PracticeStats/PracticeStats.tsx`.

## patterns that must die

Treat this as a removal list, not a claim that every screenshot still shows every item.

- glass cards and deep shadows over the photographic kit or score;
- several equal-size cards in a first viewport that should have one hero;
- permanent `Coach` decks, `Practice Cockpit` language, and a route-level coach dashboard;
- repeated wording between readiness cue, count-in, Tutor HUD, transport toast, and inspector;
- score blur, score fade, dimming, or scale transforms used to signal a pause;
- multicolour magenta/cyan/coral decoration competing with the physical kit lanes;
- status-chip swarms for XP, streak, difficulty, speed, MIDI, mode, and goal;
- 8–11 px all-caps control taxonomy where ordinary language would scan faster;
- decorative infinite pulse, glow breathing, particle rain, bouncy motion, and parallax;
- a permanent kit-navigation legend on a practice screen;
- generic cards around each song, lesson, statistic, and coach finding;
- dead-end proof claims such as `no musical payoff yet` framed as a payoff rather than a truthful neutral state.

## ranked build order

This sequence lets an implementation lane work without a design fork. Do P0 in order; each item is a coherent visual patch with its own focused proof. Preserve active sibling edits and avoid reformatting untouched behaviour.

### p0.1 — establish the v3 token and shell contract

**touch:** `src/renderer/styles/theme.css`, `src/renderer/styles/base.css`, `src/renderer/components/AppShell/AppShell.tsx`, `src/renderer/components/AppShell/AppShell.css`.

**do:** add the semantic v3 aliases; make the page/rail continuous paper; reduce the rail to the four real destinations; set desktop and compact rail geometry; make selected state local and make profile/settings quiet.

**proof:** screenshots at 1366 × 768 and 1024 × 700 show the same rail and a single continuous canvas. Keyboard focus is visible. No raw token regression outside touched components.

### p0.2 — make home the canonical personal practice surface

**touch:** `src/renderer/components/HomeCockpit/HomeCockpit.tsx`, `src/renderer/components/HomeCockpit/HomeCockpit.css`, `src/renderer/components/HomeCockpit/kit-zone-map.ts`, `src/renderer/components/HomeCockpit/HomeCockpit.test.tsx`, `src/renderer/components/PracticeCards/EvidencePracticeCards.tsx`, `src/renderer/components/PracticeCards/EvidencePracticeCards.css`.

**do:** keep one text-safe manifest, one primary action, legible kit zones, and one flat low shelf. Fold target alternatives into a true `My Wave` choice column. Remove the home coach desk, surplus status cards, and permanent colour/settings furniture from the first viewport.

**proof:** idle, armed, and post-hit frames show kit ≥60% of usable area; every mapped pad retains the existing shared start/resume behaviour; one primary message appears above the fold.

### p0.3 — make every practice state readable before polishing anything else

**touch:** `src/renderer/views/SongView/SongView.tsx`, `src/renderer/views/SongView/SongView.css`, `src/renderer/styles/sheet-music.css`, `src/renderer/components/PracticeReadinessCue/PracticeReadinessCue.tsx`, `src/renderer/components/PracticeReadinessCue/PracticeReadinessCue.css`, `src/renderer/components/CountIn/CountIn.tsx`, `src/renderer/components/CountIn/CountIn.css`, `src/renderer/components/InactivityPauseVeil/InactivityPauseVeil.tsx`, `src/renderer/components/InactivityPauseVeil/InactivityPauseVeil.css`, `src/renderer/components/TutorHud/TutorHud.tsx`, `src/renderer/components/TutorHud/TutorHud.css`.

**do:** resolve readiness/count-in/pause/recovery into one edge-caption slot; strip blur/opacity/scale treatments from the score; reduce the transport to one readable line; keep Flow and Classic visibly related.

**proof:** ready, counting-in, playing, paused, recovering, loop-selection, and reduced-motion captures keep title, active bar, and noteheads readable without zoom. No state shows duplicate large instructions.

### p0.4 — turn songs into the personal-library pattern

**touch:** `src/renderer/views/SongListView/SongListView.tsx`, `src/renderer/components/SongSearch/SongSearch.tsx`, `src/renderer/components/SongFilter/SongFilter.tsx`, `src/renderer/components/SongList/SongList.tsx`, `src/renderer/components/SongListItem/SongListItem.tsx`, `src/renderer/components/MyMusic/MyMusic.tsx`, `src/renderer/components/SongImport/SongImport.tsx`, `src/renderer/components/LibraryCandidateList/LibraryCandidateList.tsx`.

**do:** use the reference row grammar, one source/filter line, featured continuation only when playable, and technical import states behind an explicit add-music sheet.

**proof:** local, favourites, and candidate sources have stable layout; a selected row carries one clear next action; no first viewport contains a card grid or source/provenance boilerplate.

### p0.5 — reshape journey around a season rail and one route

**touch:** `src/renderer/components/LessonsView/LessonsView.tsx`, `src/renderer/components/LessonsJourney/HeaderStrip.tsx`, `src/renderer/components/LessonsJourney/LessonPath.tsx`, `src/renderer/components/LessonsJourney/LessonNode.tsx`, `src/renderer/components/LessonsJourney/SeasonCard.tsx`, `src/renderer/components/LessonsJourney/JourneyV2.css`, `src/renderer/components/LessonsJourney/daybreak-journey.css`.

**do:** make the season rail the only subdivision column; reduce map labels to title + real state; attach the next lesson and its one action to the path; hide detailed control legend and curriculum metadata until intentional reveal.

**proof:** at 1024 × 700 the current season, current lesson, next action, and selectable/locked state are readable at a glance; no nested card stack competes with the path.

### p0.6 — dissolve coach presentation without deleting the coaching engine

**touch:** `src/renderer/components/AppShell/AppShell.tsx`, `src/renderer/components/AppShell/AppShell.css`, `src/renderer/components/HomeCockpit/HomeCockpit.tsx`, `src/renderer/views/SongView/SongView.tsx`, `src/renderer/components/AICoach/AICoach.tsx`, `src/renderer/components/AICoach/CoachCard.tsx`, `src/renderer/components/TutorHud/TutorHud.tsx`, `src/renderer/components/ScoreSummary/ScoreSummary.tsx`, `src/renderer/components/LearningEvidenceReceipt/LearningEvidenceReceipt.tsx`.

**do:** rehome every coach fact to home reason, selected-song reason, practice caption, result receipt, or voluntary evidence drawer. Remove `Coach` from the primary rail only once each link has a working destination.

**proof:** one real recommendation can be traced home → practice → result → evidence without a dead route; no screen repeats the same coaching sentence in two components.

### p1.1 — turn results and profile into readable evidence surfaces

**touch:** `src/renderer/components/ScoreSummary/ScoreSummary.tsx`, `src/renderer/components/ScoreSummary/musicalReceipt.ts`, `src/renderer/components/PerformancePostcard/PerformancePostcardDialog.tsx`, `src/renderer/components/PracticeStats/PracticeStats.tsx`, `src/renderer/components/Profile/ProfileView.tsx`, `src/renderer/components/Profile/MasteryGraph.tsx`, `src/renderer/components/Profile/PracticeHistory.tsx`, `src/renderer/components/Profile/AtomicSkillRadar.tsx`.

**do:** move from a dashboard deck to a receipt-first outcome; show one time scale per profile view; make raw charts and history disclosures, not default surface furniture.

**proof:** a fresh result produces a musical receipt with a concrete continuation; profile gives a useful next decision in one viewport and all archive detail remains reachable.

### p1.2 — reconcile motion, hover, and accessibility in the real renderer

**touch:** the CSS modules from p0.1–p1.1 plus their existing stories/tests; `src/renderer/styles/sheet-music.css`.

**do:** apply the timing table, verify visible keyboard focus, introduce hover affordances only where pointer use is optional, and add reduced-motion assertions.

**proof:** real desktop and browser frames at normal and reduced motion; hover/press captures from an interaction-capable QA surface; no animation changes score geometry or hides state.

### p1.3 — capture a new visual proof dossier

**touch:** a new dated `docs/design-qa/` capture folder and a short README only.

**do:** recapture home idle/armed/post-hit, songs, journey, Flow ready/playing/paused/recovering, Classic ready, result receipt, profile, and compact 1024 × 700 states. Build a small before/after board from the current baseline.

**proof:** every P0 acceptance condition has a named screenshot plus the relevant focused test/build result. The dossier is evidence, not a substitute for a physical-kit run.

## non-negotiable acceptance bar

- a player can name the current target and the one next action in under two seconds on every route.
- home feels like an instrument awaiting a hit, not a dashboard summarising activity.
- practice screens retain score readability through every live state.
- the same visual language holds at 1366 × 768 and 1024 × 700.
- coloured pad/notation cues remain musician-readable and do not become decorative product accenting.
- a successful run ends in a truthful musical consequence and a concrete next step.
- visual proof comes from the rendered app, not only stories, source diffs, or build logs.
