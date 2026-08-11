# drumroll design direction v2

## decision

drumroll’s home is the physical kit, armed for the next meaningful hit. it is a personal practice service with a single dominant object, not a dashboard wearing a drum photo.

the reference to take from yandex music is structural:

- a personal, alive center of gravity (`моя волна`), not an app launcher;
- one obvious next action;
- a quiet left rail for library and navigation;
- rich, product-native artwork that earns its space;
- secondary shelves that support the primary ritual rather than compete with it.

we do **not** copy yandex music’s palette, cards, or player chrome. drumroll is a warm daylight instrument studio: paper, ink, wood, metal, vibration, and evidence from real practice. the kit is the wave.

### recovered-reference note

the owner-provided yandex screenshot could not be recovered from the scoped `~/.codex/attachments`, `~/.codex/generated_images`, session references, or active chronicle buffer on 2026-08-11. this direction therefore uses the live public yandex music surface plus yandex’s official support imagery and documentation. the old screenshot must not be reconstructed from memory.

## source corpus and extracted rules

### yandex music

- live public home: https://music.yandex.ru/ — checked 2026-08-11; unauthenticated access redirects to the public root, so this is a live-product availability check rather than a personalised-home capture.
- official collection/search documentation: https://yandex.ru/support/music/ru/collection/search-collection — the desktop product keeps navigation and pinning in the left rail, while a personal collection remains the content source. use that hierarchy: library is reachable, but it is not the home’s protagonist.
- official desktop screenshot exposed from that support page: https://yandex.ru/support/music/docs-assets/support-music-tld-ru/rev/r18753692/ru/_assets/image_15.png — use only to study navigation density and the dominant `моя волна` placement.

applied rule: home gets one 70–80% visual event, one current practice choice, and one follow-on shelf. nav, profile, settings, coach, and library are available without asking for equal visual weight.

### agent-design repos worth using as rules, not as an install spree

| rank | source                                                                                                                                           | concrete rule to keep                                                                                                                                                                                                           | use in drumroll                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                                                      | reject default fonts, purple-to-blue gradients, gray text on coloured grounds, card nesting, and bounce/elastic motion; use a real audit/polish loop. source: https://github.com/pbakaus/impeccable                             | delete the rounded-card salad, hot-pink/cyan decoration, and unbounded pulse motion before adding any new ornament.                                                      |
| 2    | [anthropics/frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)                                     | ground the visual system in the subject’s real materials and name one justified aesthetic risk. source: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md                                          | the kit, sticks, drumheads, notation, rehearsal-room daylight, and impact timing are the vocabulary. “daybreak arena” is a theme name, not a reason to add glass panels. |
| 3    | [addyosmani/agent-skills: frontend-ui-engineering](https://github.com/addyosmani/agent-skills/blob/main/skills/frontend-ui-engineering/SKILL.md) | production UI needs design-system adherence, accessible interaction, responsive states, and focused composable components. source: https://github.com/addyosmani/agent-skills/blob/main/skills/frontend-ui-engineering/SKILL.md | one component owns one visual responsibility; a home hit action, readiness cue, score, and coach message must not render duplicate instructions.                         |
| 4    | [marvkr/better-design](https://github.com/marvkr/better-design)                                                                                  | use semantic tokens, one icon family, hierarchy/spacing/motion rules, and a visual plus accessibility review before handoff. source: https://github.com/marvkr/better-design                                                    | create Drumroll tokens from this document, then review screenshots at the target viewport. do not import Linear, Stripe, or a generic shadcn theme.                      |
| 5    | [ibelick/ui-skills](https://github.com/ibelick/ui-skills)                                                                                        | route a task to a focused baseline, motion, accessibility, or component skill instead of treating “design” as one vague command. source: https://github.com/ibelick/ui-skills                                                   | split implementation into home ritual, score/readiness, journey map, and profile evidence surfaces; each gets its own visual proof.                                      |

two nearby search results are not the answer to the owner’s request:

- [lantos1618/better-ui](https://www.npmjs.com/package/@lantos1618/better-ui) is an agent-tool rendering package, not a strong visual-design rule set.
- [bergside/typeui](https://github.com/bergside/typeui) is a useful catalogue of prompts and systems, but its randomiser/registry model would pull this project back toward generated-theme variance.

do not install an MCP, a new skill, or a component library in this pass. the bottleneck is a missing product art direction and a missing visual acceptance bar; another agent wrapper would be theatre.

## visual contract

### product sentence

“sit at your kit, see today’s next musical move, hit any pad, and the right rehearsal begins.”

every home element must answer one of three questions:

1. what am i playing now?
2. is the kit ready?
3. what changed because i played?

everything else moves to the rail, a secondary shelf, or a dedicated view.

### home information architecture

```text
┌──────── quiet rail ───────┬──────────────────────── kit home ────────────────────────┐
│ logo                      │  current room / exercise                                  │
│ home                      │                                                           │
│ songs                     │             full, tactile drum kit                        │
│ journey                   │         any mapped hit → count-in → practice              │
│ coach                     │                                                           │
│                           │  one-line readiness      one-line current target           │
├───────────────────────────┴───────────────────────────────────────────────────────────┤
│ practice wave: next lesson · recent pass · one proof of progress                         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- the kit owns the large home area. use the current studio image only if it becomes a single coherent material plane; no floating product tour inside it.
- one selected lesson/song is visible beside the kit: title, artist or lesson unit, suggested speed, and one short musical cue. this is a session manifest, not a card stack.
- while a playable recommendation exists, **every mapped pad starts or resumes that same recommendation**. a pad may animate with its notation-lane colour, but it must not navigate to songs, journey, coach, or profile.
- when there is no playable recommendation, show one fixed inline choice: “choose a song.” once chosen, the next physical hit starts. no pad-specific detour maze.
- `songs`, `journey`, `coach`, profile, and settings stay in the rail. their home summaries have a single text link or a small shelf cell, never a competing hero button.
- the first post-hit response is physical: the struck head compresses for 120 ms, a low-detail impact ring travels into the kit, the session manifest changes to “count-in,” then the score appears. no celebratory confetti, badge shower, or infinite idle pulse.

### tokens

put these in `src/renderer/styles/theme.css` as semantic tokens before screen work. replace raw colour literals in touched components; do not run a whole-repo colour migration.

| role              | token              | value     | restriction                                             |
| ----------------- | ------------------ | --------- | ------------------------------------------------------- |
| page paper        | `--surface-canvas` | `#f5f0e7` | the default field, warm but not cream-glow.             |
| raised paper      | `--surface-raised` | `#fffdf8` | a sheet, inspector, or one supporting shelf.            |
| rehearsal ink     | `--ink-strong`     | `#1b1814` | primary copy, score, silhouettes.                       |
| muted ink         | `--ink-muted`      | `#6f685e` | explanation only; never under 4.5:1.                    |
| hairline          | `--line-soft`      | `#ddd3c4` | separators and instrument geometry.                     |
| action / live hit | `--signal-ember`   | `#d75a34` | start, count-in, and the current beat.                  |
| current target    | `--signal-wine`    | `#932d4c` | a singular current/focus state.                         |
| earned / verified | `--signal-green`   | `#287a64` | real progress, never decorative success.                |
| dark studio       | `--surface-studio` | `#24201b` | photo contrast and only the kit-stage local background. |

notation keeps lane colour because it carries musical routing; other screens use one signal colour per state. a screen must never use orange, pink, cyan, green, yellow, and red merely to appear energetic.

| system    | rule                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| spacing   | 4, 8, 12, 16, 24, 32, 48, 64 px only. one panel’s internal rhythm is 8/16/24; page rhythm is 24/48.                                                                                                                                                                      |
| radius    | 4 px for controls, 10 px for a local surface, 18 px for the one home studio frame. `999px` is reserved for a compact status dot or an actual meter; it is not a default button shape.                                                                                    |
| type      | `Newsreader` only for the one large scene title or a measured lesson title; `Instrument Sans` for every control, metric, and supporting line. desktop body starts at 14 px; supporting text at 12 px; no screen-critical 8–10 px telemetry.                              |
| elevation | flat canvas → one raised paper shelf → one studio frame. no translucent panel on a translucent panel.                                                                                                                                                                    |
| icons     | retain one Font Awesome family only until a branded icon set exists. do not mix emoji, glyphs, illustrated stickers, and solid icons in one control row.                                                                                                                 |
| motion    | 120 ms hit feedback, 180 ms state change, 260 ms surface transition. every animation mirrors MIDI/playback state; continuous animation exists only while a real session is counting or playing. `prefers-reduced-motion` keeps state changes visible without scale/blur. |

### visual quality gate

a screen does not pass because it has more effects. it passes only when these checks are true at 1224 × 768 and at the smallest supported desktop width:

- one object has an unmistakable visual priority within one second;
- no primary copy truncates, no chart label crops, and no critical label is smaller than 12 px;
- every action has one state, one label, and one visual treatment; duplicate “ready,” “kick,” or timing instruction is a defect;
- semantic state has a label and shape in addition to colour;
- a blurred score is never the ready, paused, or recovery state; use a calm dimming veil only where it does not erase notation legibility;
- a screenshot has at most one large raised surface in its first viewport, apart from a true modal;
- hit, count-in, pause, and recovery have an observable state transition with no decorative loop;
- native and web proof includes a normal-motion and reduced-motion frame.

## merciless kb.8 screen audit

this is an audit of the installed proof frames in `docs/design-qa/2026-08-11-kb8-final/`. no literal headline collision appears in frames 01–05; the deeper issue is competing overlays, bad reading order, and microcopy that collides with the player’s sightline. frame 06 has actual radar-label clipping.

### 01 — home

source: [`01-installed-home.png`](design-qa/2026-08-11-kb8-final/01-installed-home.png)

| offense                                                                                                                                                              | why it reads vibe-coded                                                                                                                     | concrete correction                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| eight coloured hotspot labels sit on the kit at once                                                                                                                 | the kit is presented as a clickable debug map. every drum asks for attention, so the visual eye has no downbeat.                            | hide all labels at rest; show only the selected session target and the struck pad’s 120 ms response. retain accessible labels in the DOM.                    |
| `kick` starts practice, while snare/tom/ride/crash silently map to unrelated sections                                                                                | the advertised “interactive kit” turns into navigation trivia. it violates one-hit launch.                                                  | remove `HOME_KIT_NAV_LABEL` behaviour from `HomeCockpit.tsx`; mapped home strikes converge on `onStartRecommended`/resume.                                   |
| day streak, lessons open, predicted success, lane data, reconnecting, two buttons, colour selector, coach callout, wave, recents, and XP all compete in one viewport | this is a product dashboard pasted over hero photography. the buttons and status boxes have the same visual grammar as the intended ritual. | preserve one readiness line and one session manifest. move kit colour to settings; collapse the three lower cards into one low-emphasis practice-wave shelf. |
| hot pink, cyan, green, yellow, orange, and red appear outside notation                                                                                               | colour has no hierarchy, so “important” means every colour.                                                                                 | use ember for armed/start, wine for one focus, green only for real attainment; keep lane colours inside the score or momentary pad feedback.                 |
| bright title, badges, and dark glass labels float across cymbals and heads                                                                                           | the photo is a wallpaper rather than an instrument surface. contrast varies by image region and the overlays obscure the thing being sold.  | build a controlled left-to-right studio gradient; keep text in one fixed manifest zone, leave the kit uncluttered, and avoid stacked glass cards.            |
| lower shelf has three unrelated rounded cards with different density                                                                                                 | card edges, shadows, and tiny type outnumber meaningful rhythm.                                                                             | one horizontal strip, three equal semantic cells, flat dividers, one line each.                                                                              |

source ownership: `src/renderer/components/HomeCockpit/HomeCockpit.tsx`, `src/renderer/components/HomeCockpit/HomeCockpit.css`, `src/renderer/components/AppShell/AppShell.css`.

### 02 — journey

source: [`02-installed-journey.png`](design-qa/2026-08-11-kb8-final/02-installed-journey.png)

| offense                                                                                                         | why it fails                                                                                                                   | concrete correction                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| top strip contains long curriculum metadata, a detailed continue card, six tiny season pills, and a giant stage | four hierarchy systems fight: administrative lesson state, card UI, tab UI, and game-map UI.                                   | make one “next lesson” manifest at the top-left of the stage; make season switching a quiet rail with full names and no 8 px lock telemetry.              |
| dark glass signs float over a washed-out studio image                                                           | it resembles a game mockup rather than a playable curriculum. glass appears because it is easy, not because the room needs it. | use one material logic: warm paper map labels directly attached to drum nodes, plus one dark venue plaque only for the selected season.                   |
| node cards contain lock, colour tag, title, stars, and instructional text at kit distance                       | the content is smaller than the player can read from the throne. nodes expose system state before musical intent.              | show `next`, `locked`, or `cleared` with title and one prerequisite line. reveal extra evidence on focus/selection, not permanently.                      |
| horizontal season tabs use truncated codes such as `01 · FO…`                                                   | internal curriculum coordinates leak into the product and make scanning hostile.                                               | label the selected rail item “season 01 · foundations”; unselected items use number plus an icon and full accessible name.                                |
| cyan/magenta/amber beams and several independent glow treatments compete with the lesson path                   | the stage has atmospheric effects without a single spatial story.                                                              | retain one daylight-to-ember progression tied to selected season state; kill decorative beams and use a visible path line from cleared node to next node. |
| permanent “kit navigation” legend occupies the map                                                              | it is a mechanical manual inside the performance surface.                                                                      | reveal controls on first use, help key, or a collapsed lower edge. never overlay it on the lesson route by default.                                       |

source ownership: `src/renderer/components/LessonsView/LessonsView.tsx`, `src/renderer/components/LessonsJourney/HeaderStrip.tsx`, `src/renderer/components/LessonsJourney/LessonPath.tsx`, `src/renderer/components/LessonsJourney/daybreak-journey.css`.

### 03 — practice, idle cue

source: [`03-installed-flow-idle-cue.png`](design-qa/2026-08-11-kb8-final/03-installed-flow-idle-cue.png)

| offense                                                                                                                                                         | why it fails                                                                           | concrete correction                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| score is blurred and muted behind a large centred card before the player begins                                                                                 | notation is the job; hiding it before the first hit makes the first screen ornamental. | score stays sharp at 100% opacity. use a 48–64 px horizon cue near the first beat or the bottom status strip.                                   |
| the central card and bottom “lesson ready” panel both say the same thing                                                                                        | duplicate teaching produces a fake onboarding feel and steals the score’s hierarchy.   | render one readiness component with one sentence and one physical-action cue.                                                                   |
| “one kick starts the groove” is a generic marketing line sitting above the actual score                                                                         | the UI narrates the action instead of embodying it.                                    | show the kick-head/pedal glyph next to the current start state, then let the physical hit be the confirmation.                                  |
| top toolbar holds a back button, oversized play button, truncated title, timer, segmented mode switch, speed control, loop, settings, mapping, and chart action | it is generic app chrome and breaks the performance field into a control bar.          | keep back, transport, current title, and one compact mode indicator. place speed, loop, mapping, and chart options under one inspector trigger. |

source ownership: `src/renderer/views/SongView/SongView.tsx`, `src/renderer/views/SongView/SongView.css`, `src/renderer/components/PracticeReadinessCue/PracticeReadinessCue.tsx`, `src/renderer/components/PracticeReadinessCue/PracticeReadinessCue.css`.

### 04 — practice, ready

source: [`04-installed-flow-ready.png`](design-qa/2026-08-11-kb8-final/04-installed-flow-ready.png)

the cue state remains visually identical to frame 03, despite the user now being ready to act. `Flow`/`Classic` plus speed/loop fields create a segmented-control strip with no performance priority. the active state is pink, while the physical action is in a separate large card; two unrelated “primary” signals coexist.

fix: the ready state changes only three things: the first beat gains a warm target ring, the one-line cue changes to “kick to count in,” and the selected kick head arms. all other notation stays readable. the mode control becomes a compact labelled popover; it never competes with readiness.

### 05 — practice, inactivity pause

source: [`05-installed-flow-playing.png`](design-qa/2026-08-11-kb8-final/05-installed-flow-playing.png)

| offense                                                                                                        | why it fails                                                                                        | concrete correction                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| entire score is blurred and faded during pause                                                                 | losing the score is the wrong punishment for a pause. the player needs it to recover.               | hold the playhead and retain sharp score; use a thin paused band at the active bar plus one lower prompt.                  |
| 160 px bottom panel says “paused — no hits detected” and repeats speed, timing window, and form in three cards | an interruption consumes a third of the score and turns useful feedback into dashboard furniture.   | one bottom line: “paused at bar 1 · hit any pad to count in.” put details in the inspector or coach after the resumed run. |
| “any pad” is tiny and visually weaker than the large empty surface                                             | the action cue is easy to miss at distance.                                                         | use a single instrument glyph plus 14 px label and direct it toward the next actionable pad.                               |
| active score and action affordance do not share a visual language                                              | magenta current markers, pale large cards, and red pause wording each use different intent grammar. | ember means immediate action; wine means selected target; all recovery copy uses ink plus ember, no new colour.            |

source ownership: `src/renderer/views/SongView/SongView.css`, `src/renderer/components/TutorHud/`, `src/renderer/components/CountIn/`.

### 06 — profile drawer

source: [`06-installed-profile-radar.png`](design-qa/2026-08-11-kb8-final/06-installed-profile-radar.png)

| offense                                                                                                        | why it fails                                                                                                  | concrete correction                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| primary learning evidence is forced into a 480 px drawer                                                       | the profile is a real product area rendered as an afterthought. every graph and label loses room.             | create a first-class profile/insights route or a full-width modal at desktop. keep a quick profile button, but it opens a full surface.                              |
| radar axis labels are clipped and unreadable; “Fills & Kit Navigation” wraps into the chart’s visual territory | this is literal label failure, not a taste disagreement. the chart communicates neither dimensions nor score. | remove the radar from the compact state. if retained in the full route, give it a fixed 320 px square with labels outside the plotting field and a text alternative. |
| title says a focus area, then estimate/confidence/evidence/trend read like a research dashboard                | the actual next musical move gets buried in measurement vocabulary.                                           | headline: one tangible practice target and one supporting reason. evidence stays available as a smaller disclosure.                                                  |
| eight per-drum rows, archive cards, and profile history all crowd the same sheet                               | one drawer asks the player to parse three time scales and two evidence systems.                               | split into “today,” “last 30 days,” and “history”; show only one on first load.                                                                                      |
| cards, pills, tiny uppercase labels, and progress bars use generic component grammar                           | no visual connection to the kit or practice session.                                                          | use a simple horizontal skill spine whose marked segments map to a specific drum or rudiment. colour only the current weak point.                                    |

source ownership: `src/renderer/views/SongListView/SongListView.tsx`, `src/renderer/components/Profile/ProfileView.tsx`, `src/renderer/components/Profile/AtomicSkillRadar.tsx`, `src/renderer/components/Profile/SkillBars.tsx`, `src/renderer/components/AppShell/`.

### 07 — installed app icon and finder context

source: [`07-installed-app-icon-context.png`](design-qa/2026-08-11-kb8-final/07-installed-app-icon-context.png)

the finder frame exposes two product issues:

- the visible icon reads as a tiny beige/orange generic app tile at finder scale; it does not carry the drum/home ritual when isolated from the UI.
- three near-identical app names (`Drumroll.app`, a timestamped build, and a kb.1 backup) make the live product feel provisional. this is release hygiene, not permission to delete anything in this design lane.

fix: make the icon a high-contrast struck drumhead or kick/pedal silhouette with one ember impact mark, tested at 16, 32, 64, and 128 px. release ownership must separately define one canonical installed name and a non-destructive backup policy.

## ranked implementation backlog

### p0 — restore the home ritual and score legibility

#### p0.1 — kit home has exactly one hit action

**owner files:** `HomeCockpit.tsx`, `HomeCockpit.css`, `HomeCockpit.test.tsx`; integration touchpoint: the existing `SongListView` callbacks.

1. replace the pad-to-navigation contract with `start-or-resume-current-practice`. every mapped `KIT_HOTSPOTS` hit follows the same action while home is armed.
2. keep pad identity only for hit animation, audio preview where appropriate, and accessibility text; remove `HOME_KIT_NAV_LABEL` as visible product behaviour.
3. replace the hero’s reconnecting card, two buttons, colour select, lane labels, and coach callout with one session manifest: current title, short cue, readiness state.
4. replace `home-cockpit__below`’s three cards with one flat `practice wave` strip. show next lesson, last completed pass, and daily progress as three short cells.
5. make the left rail quiet: logo, four routes, settings/profile. kill “practice cockpit” as a label and use the current room/exercise as the top context.

**acceptance:** at 1224 × 768 the kit occupies at least 60% of the usable home viewport; only one actionable primary message is visible; virtual or physical hits on kick, snare, hi-hat, tom, ride, crash, and floor tom all begin the same selected recommendation; no hit opens a different route. add focused behaviour tests for that contract and capture one idle and one post-hit native frame.

#### p0.2 — the score is always readable

**owner files:** `SongView.css`, `SongView.tsx`, `PracticeReadinessCue.tsx`, `PracticeReadinessCue.css`, readiness tests.

1. delete the `filter: blur(...)`, low-opacity, and scale treatments applied to `.drumroll-notation-stage` for `ready`, `paused`, `inactivity-paused`, `counting-in`, and recovery. a subtle, non-blurring bar-state veil is allowed only outside the score’s readable staff area.
2. collapse `PracticeReadinessCue` into a narrow status rail that occupies no more than 64 px of stage height and never duplicates `TutorHud` wording.
3. use the first target note/pad and a single “kick to count in” line as readiness. the score stays in focus before, during, and after count-in.
4. turn pause into a local timeline state: stationary playhead, active-bar highlight, and one 14 px recovery line. never open a dashboard-sized bottom sheet for a timeout.
5. make count-in a score-adjacent beat marker, not a separate centered white panel. retain audio and accessible live narration.

**acceptance:** ready, counting-in, paused, recovery, and playing screenshots all allow a reviewer to read the title, the active bar, and noteheads without zoom. no state renders both `PracticeReadinessCue` and a second large tutor/readiness instruction. reduced-motion mode keeps every state intelligible.

#### p0.3 — replace generic control chrome with performance chrome

**owner files:** `SongView.tsx`, `SongView.css`, `SettingsButton/SongViewSettings.tsx`, focused interaction tests.

1. toolbar first row: back, transport, current lesson/song, one timeline, one mode indicator, one inspector trigger.
2. inspector owns speed, loop, MIDI offset/mapping, notation options, and secondary chart tools. use a labelled icon button with keyboard access; do not hide a required active state.
3. remove visual outlines and individual shadows from every nested segmented control. mode is a single low-emphasis label unless the user is changing it.
4. use a hard 48 px height rhythm; title truncation has a full accessible name and secondary artist line, never a mystery ellipsis as the only identity.

**acceptance:** no row in the 1224 px toolbar has more than six visual clusters; each cluster has a semantic label; changing speed/loop/mode still works from mouse, keyboard, and current kit control flow.

### p1 — give secondary views an authored spatial system

#### p1.1 — journey becomes a legible rehearsal route

**owner files:** `LessonsView.tsx`, `HeaderStrip.tsx`, `LessonPath.tsx`, `LessonNode.tsx`, `SeasonCard.tsx`, `daybreak-journey.css`.

1. stage header contains current season, current lesson, one cue, and one `start` action; remove the detailed curriculum admin paragraph from the first viewport.
2. show a single four-node window with direct visual path. a node card contains status, title, and one unlock condition; stars/details appear on focus.
3. season rail uses full language for the selected season and icon + sequence for other seasons. avoid forced all-cap microcopy and clipped codes.
4. remove decorative cyan/magenta/amber beams and excess glass layers. one selected venue plaque plus one visible path treatment is enough.
5. hide kit navigation by default; reveal it after the first kit navigation event, through help, or on focus.

**acceptance:** screenshot has one clear next lesson at a normal seated distance; all visible node titles and states are readable at 12 px minimum; no permanent overlay crosses the map route; keyboard and kit navigation remain discoverable and testable.

#### p1.2 — profile is an insights surface, not a drawer

**owner files:** `SongListView.tsx`, `AppShell.tsx`, `ProfileView.tsx`, `AtomicSkillRadar.tsx`, `SkillBars.tsx`.

1. introduce a dedicated `profile`/`insights` route in the app shell. keep the profile button as entry, but remove the 480 px drawer as the primary presentation.
2. top of the route: one current practice target, one evidence line, one action that starts the targeted loop. no radar by default.
3. show a readable horizontal skill spine for current weak point and a separate expandable evidence section for accuracy/history.
4. remove `AtomicSkillRadar` from the default desktop first viewport. if it survives research, render it only with a 320 px minimum plotting area, non-clipped labels, and equivalent text table.
5. split long-term archive/history below the first viewport, with explicit time range and provenance labels.

**acceptance:** no clipped radar label, no 10 px critical label, no sidebar drawer for the primary view; the player can identify a concrete next exercise and why it was chosen in one glance.

#### p1.3 — lock the visual token contract

**owner files:** `theme.css`, `AppShell.css`, touched surface styles only.

1. add the semantic token set above, then migrate only home, practice, journey, profile, and app shell work in this backlog.
2. prune raw magenta/cyan decorative gradients from touched components; reserve semantic signals by meaning.
3. cap raised-surface depth and radius by the token table. each refactored surface must remove at least one unnecessary nested card or shadow.
4. use `Newsreader` only for the scene title / lesson title. eliminate dense all-caps micro-labels from the first viewport.

**acceptance:** token audit of changed files finds no raw colour literal except a documented notation-lane asset or an external image treatment; screenshot comparison shows a single colour hierarchy per screen.

### p2 — brand finish after the interaction is honest

#### p2.1 — real product icon and desktop identity

**owner files:** the icon source and packaging configuration, with a release owner separate from this UI lane.

- design one struck-head/pedal silhouette against paper or studio ink, with an ember impact mark.
- render and inspect 16/32/64/128 px assets in Finder and the macOS dock.
- define a canonical `Drumroll.app` install name and a documented backup location; do not delete existing installed builds as a design refactor.

#### p2.2 — motion pass tied to sound and evidence

**owner files:** home hit treatment, `ContinuousNotation`, `CountIn`, `TutorHud`, reduced-motion tests.

- replace generic infinite scale/pulse loops with hit-gated impact, beat-gated count-in, and active-note emphasis.
- use one motion family: compression → rebound → settling. no bounce easing, no decorative glow breathing.
- test normal, paused, reconnecting, and reduced-motion states from the real installed flow.

#### p2.3 — visual regression dossier

**owner files:** existing `docs/design-qa/` capture workflow and its owner.

- recapture home idle/post-hit, journey, practice ready/count-in/playing/paused, insights, and Finder icon at 1224 × 768.
- use an explicit before/after board with the current kb.8 images as baseline. reject a pass when the score is blurred, a primary title truncates, or the first viewport contains competing primary cards.
- this dossier is proof, not a substitute for the live input and practice-flow checks.

## integration notes

- home changes are behavioural as well as visual. `HomeCockpit` owns the one-hit contract; do not let a CSS-only lane simulate it while existing mapped pads still navigate elsewhere.
- practice work must be owned as one coupled surface (`SongView`, readiness cue, tutor HUD, count-in, notation). splitting those files across writers will reintroduce duplicate prompts and overlay races.
- profile route work crosses `SongListView`’s drawer, `AppShell` navigation, and `ProfileView`; give one lane ownership of that seam.
- token work should land before or alongside the first home patch, but do not make it a whole-repo style migration.
- none of this document authorizes release cleanup, app deletion, packaging changes, or a commit. those are outside this design direction lane.
