# Drumroll product contract

## Status

This file records the product direction for the current Drumroll build.

The user supplied the product goals, reference images, playlist, and delivery scope.
The codebase supplies the current technical constraints and evidence model.

Items marked **Fact** come from the user or the live product.
Items marked **Inference** turn that source material into an implementation decision.

## Product statement

Drumroll is a hands-free drum-learning game for a real electronic drum kit.

The player puts a Mac near the kit, starts one guided session, and keeps playing.
Drumroll listens to MIDI hits, scores musical actions, adapts the session, and controls recovery.

The core promise is simple:

> Sit down. Hit the ready cue. Keep playing. Drumroll chooses the next useful challenge.

## Primary outcome

The product is designed to make one player's drum practice more efficient in
the dimensions MIDI and saved performance evidence can observe. This is a
product goal, not a verified efficacy claim. Drumroll must not claim faster
learning, injury-safe form, or better physical technique until retention,
transfer, and expert-reviewed learner studies support those outcomes.

The product is successful when it does these things:

1. It keeps the player in a focused practice flow.
2. It finds concrete weak patterns from real performance evidence.
3. It gives the player the next exercise in the right difficulty zone.
4. It reduces trips from the kit to the computer.
5. It shows progress that a musician can understand.

## Primary user

- **Fact:** The first user is Konstantin.
- **Fact:** He uses a Yamaha DTX402 electronic drum kit.
- **Fact:** He practices songs, lessons, timing, coordination, and drum-set navigation.
- **Fact:** He wants to use kit hits as the main control input.
- **Inference:** Design for one local player first, but use stable user and session identifiers.
- **Inference:** Keep the storage model ready for account sync without requiring cloud service for practice.

## Experience principles

### 1. Play first

The main screen is a playable drum cockpit.
The primary action starts the next useful session.
The library and settings stay available, but they do not lead the experience.

### 2. The kit is the controller

The player can use a short drum gesture to signal that they are ready.
The player can use distinct gestures to continue, retry, pause, or end a session.
Keyboard and pointer controls remain available for setup and accessibility.

### 3. Practice and Perform are different

Practice protects learning quality.
It can slow the chart, detect a trouble window, rewind, count in, and repeat.

Perform protects continuity.
It scores one canonical pass and does not interrupt the song.

### 4. Recovery is automatic and explainable

Drumroll only triggers recovery from resolved musical judgements.
It does not rewind from raw rendering events.

A recovery shows four facts:

- what pattern failed,
- where the checkpoint starts,
- why the app chose the new speed,
- what success will release the player.

### 5. Progress means musical control

Progress uses recent evidence with time decay.
It never uses an unexplained lifetime percentage.

The product reports mastery by skill and kit lane.
Each score links back to the runs, attempts, and time window that produced it.

### 6. Coaching uses evidence

The Coach can cite saved hits, resolved misses, wrong-pad hits, timing offsets, speed, streaks, and trouble windows.
If bar-level evidence is missing, the Coach says so.
The Coach does not invent a weak bar or a practice loop.

### 7. Bright world, deep focus

The shell uses the bright Daybreak Arena world.
Gameplay keeps notation on warm, light paper so the score stays legible from
the kit without dropping the player into a separate dark visual world.
The visual system uses pearl, ink, amber, coral, magenta, and cyan.
It avoids the dim brown cast in the World Tour reference.

### 8. Fast and calm

MIDI scoring has priority over decoration.
Motion uses transforms, opacity, and filters.
Reduced-motion mode keeps all state and meaning.
The app must not perform network work during a scored run unless the feature needs it.

## Core loop

1. Drumroll selects the next best song or exercise.
2. The player sees the goal, tempo, mode, and ready gesture.
3. The player performs the ready gesture on the kit.
4. Drumroll gives a count-in and starts.
5. The player follows continuous or classic notation.
6. Drumroll resolves hits after the scoring tolerance window.
7. In Practice, a material trouble window starts a recovery loop.
8. In Perform, the song continues and records the error.
9. Drumroll saves the canonical pass and all compact recovery attempts.
10. The Coach explains the result and queues the next useful challenge.
11. The player continues with a kit gesture or lets auto-continue start.

## Practice mode

Practice mode includes these controls:

- adaptive recovery on or off,
- checkpoint recovery on or off,
- relaxed Guided Practice by default, with lives off,
- an opt-in Challenge lives switch,
- three lives when Challenge lives are on,
- auto-continue on or off,
- Flow or Classic notation,
- speed floor and speed ceiling,
- practice goal.

### Recovery rule

The first implementation uses a bounded deterministic rule.

A recovery candidate needs final judgements after the normal timing window.
The rule watches a rolling musical window, not a wall-clock burst.
It triggers only when misses or wrong-pad hits cross a material threshold.
It does not trigger on one isolated mistake.

The recovery starts from the latest safe musical checkpoint before the trouble window.
The app stores a compact failed-attempt trace before it seeks.
It pauses for a short readable explanation instead of jumping immediately.
Recovery and away-resume always use the chart-aware audible count-in, even when
the player has disabled the optional count-in for an ordinary first start.
The count-in resumes at a reduced speed when repeated failure requires it.

The player exits the recovery after clean repetitions at the target threshold.
The app then returns to the original path and speed in bounded steps.

### Checkpoints

Checkpoints use chart structure when it is available.
Preferred boundaries are section markers, phrase boundaries, and bar starts.
The fallback interval is a short fixed number of bars.

The current checkpoint is visible in Practice.
The app can return to it after a life is lost.

### Lives

Lives are an opt-in Challenge mechanic. Guided Practice stays non-punitive and
uses clean-repetition progress without hiding learning evidence.

- A material failure consumes one life.
- A single isolated miss does not consume a life.
- After a life loss, Drumroll stores the attempt and returns to a checkpoint.
- At zero lives, the session changes to a focused recovery block.
- The player can enable or disable Challenge lives at any time before a run.

## Perform mode

Perform mode records one uninterrupted pass.
It keeps streak, score, accuracy, timing, and wrong-pad feedback.
It does not seek backward automatically.
Lives are off.
The end screen can offer a focused Practice session from real trouble evidence.

## Hands-free control

The first control vocabulary must be deliberate and hard to trigger by accident.

- Start from Home or Ready: one deliberate kick after a state-specific quiet
  window.
- Pause while playing, resume from pause, or continue from results: kick,
  crash, kick, crash after a state-specific quiet window.
- Retry from results: snare, kick, snare, kick after a quiet window.
- End from pause or results: ride, kick, ride, crash after a quiet window.
- Every multi-hit command requires four exact, ordered, sufficiently strong
  strikes inside a bounded timing window; an extra, reversed, quiet, or
  mistimed hit cancels the candidate.

Drumroll only recognizes control gestures in eligible states.
Scored song hits never become control actions.
This release draws the state-specific command at drum distance in Ready,
Active Play, Paused, Away, and Results. Songs uses visible kit tokens for
moving, choosing, filtering difficulty, changing source, sorting, and going
back. Journey uses the same visual vocabulary for lesson selection, season
movement, starting, and leaving. Gesture customization remains future work
and is not claimed by the current UI.

## Next-best-practice selector

The selector uses an explainable score.
It combines:

- prerequisite completion,
- recent mastery by required skill,
- recent kit-lane weakness,
- successful speed,
- repeated trouble patterns,
- time since last practice,
- preference for liked songs,
- variety and fatigue limits.

The selector keeps the next task inside a reachable challenge zone.
It avoids an item that is mastered and recent unless spaced repetition makes it due.
It avoids an item that is far above the current prerequisites.

The recommendation always includes a short reason.
Examples are “build Tom 2 accuracy,” “repeat at 80%,” and “ready for the next paradiddle.”

## Curriculum

- **Fact:** The generated Drumroll Method contains 170 playable exercises.
- **Fact:** Exercises include fundamentals, rudiments, coordination, grooves, fills, and musical applications.
- **Fact:** The Journey screen groups exercises into seasons.
- **Inference:** Every lesson needs a stable identifier, prerequisites, skill tags, target lanes, target tempo, and mastery rule.
- **Inference:** Song goals and lesson goals share the same skill taxonomy.

The Journey screen shows the full route, the current season, the next exercise, and meaningful completion state.
It uses actual exercise titles.

## Song library

The library contains three record classes:

1. **Playable local chart:** the app has authorized local audio and a chart.
2. **Chart candidate:** the app has source metadata and needs a legal audio/chart preparation step.
3. **Reference only:** the source is unavailable or cannot provide local playable media.

The UI must never show class 2 or class 3 as ready to play.

### Yandex Music

- **Fact:** The authenticated “Drums” playlist contains 13 visible playlist rows in the final 2026-08-09 capture.
- **Fact:** Eleven rows have stable visible Yandex track links.
- **Fact:** “Heat Waves” by Living In Fiction and “Wantchya” by Ballpoint do not expose stable track links in that capture.
- **Inference:** Import all 13 rows as metadata records.
- **Inference:** Preserve the playlist URL, source track URL when present, artist, title, duration, availability, and capture date.
- **Inference:** Do not download, copy, or redistribute protected Yandex audio.
- **Inference:** A user-supplied local file or an authorized chart source can promote a candidate to playable.

## Session evidence

Each saved session has:

- stable session and song identifiers,
- mode and configuration,
- start and end time,
- final playback speed plus every Tutor-authored recovery speed intervention,
- canonical hit records,
- resolved misses,
- wrong-pad hits,
- timing offsets,
- streak and score,
- lane summaries,
- recovery summaries,
- Tutor checkpoint windows, remaining lives, and recovery-attempt outcomes,
- app and schema version.

An interrupted Practice attempt is saved separately from completed history.
Its append-only attempt record preserves every resolved hit, miss, and
wrong-pad outcome across Tutor rewinds, while its canonical record remains the
single current scoring pass. Reopening the same song surfaces the latest
matching attempt, bar, and evidence count. One kick resumes from that bar with
a fresh count-in; the old draft stays labeled as interrupted evidence until a
completed run is committed atomically. Drafts never award XP, mastery, stars,
or completed-session credit.

Recovery summaries are compact.
They store the window, reason, speed, attempt result, and aggregate evidence.
They do not duplicate the complete chart.

The local store must remain useful without an account or network connection.
Future sync can upload versioned records after the local transaction completes.

## Mastery model

Mastery is a rolling estimate from 0 to 100.
It is not a probability of being a professional drummer.

Each displayed mastery value includes:

- the skill or lane name,
- the evidence window,
- the number of qualifying attempts,
- the recent trend,
- the strongest limiting factor.

The first version uses a deterministic weighted calculation.
It combines recent accuracy, timing consistency, successful speed, and repeatability.
Recent runs receive more weight than old runs.
One exceptional run cannot erase repeated weak evidence.

## Main surfaces

### Home

- interactive kit cockpit,
- one primary Play action,
- current recommendation and reason,
- recent interpretable kit mastery,
- streak and last-session context,
- quick access to Songs, Journey, Coach, profile, and settings.

### Practice

- Flow and Classic notation,
- fixed visual playhead in Flow,
- current goal, tempo, checkpoint, lives, and recovery state,
- localized hit, miss, and wrong-pad feedback,
- hands-free state prompts,
- Coach detail from real evidence.

### Songs

- playable charts,
- source candidates,
- source and availability labels,
- search, filters, import, and preparation status.
- visible DTX commands for move, choose, difficulty, source, sort, and back.

### Journey

- all 170 exercises,
- season rail,
- prerequisite state,
- next exercise,
- actual exercise title and goal.
- visible DTX commands for lesson focus, season movement, start, and back.

### Coach and Profile

- latest run explanation,
- trouble windows when full evidence exists,
- recommended loop or lesson,
- mastery by skill and kit lane,
- session timeline and trend windows.

## Marketing site

The site explains the product and opens the shared web app.
It also provides a verified desktop download path.

The site takes craft cues from UNKNW:

- editorial scale,
- decisive type,
- strong image rhythm,
- compact utility navigation,
- motion that reveals product logic,
- authored composition instead of a generic SaaS card grid.

The site does not copy UNKNW assets, text, or layout.
It uses Drumroll’s bright Daybreak Arena visual language.
It demonstrates the hands-free practice loop, Flow notation, adaptive recovery, Journey, and evidence-backed progress.

Marketing copy can use a richer brand voice.
Technical labels, settings, errors, and documentation use clear controlled English.

## Platforms

- **Fact:** The main product is an Electron macOS app with a shared React renderer.
- **Fact:** The web build installs a browser adapter for the same renderer.
- **Fact:** The web build runs on Cloudflare Pages and uses Web MIDI on secure Chrome origins.
- **Inference:** Desktop remains the reference product for local files, native MIDI, and full practice setup.
- **Inference:** Web demonstrates and shares the core product, but it reports unsupported native features honestly.

## Quality gates

The work is complete only when these gates pass:

1. TypeScript typecheck passes.
2. ESLint passes.
3. All unit tests pass.
4. Renderer and web builds pass.
5. The 170-exercise package check passes.
6. Core web and desktop flows pass automated smoke tests.
7. Visual QA covers Home, Journey, Practice, Coach, Profile, and marketing at target viewports.
8. Reduced-motion and keyboard paths remain usable.
9. Real-profile verification does not erase existing user data.
10. The final macOS app has a valid hardened Developer ID signature.
11. Gatekeeper and notarization states are reported as separate proof states.
12. The public site deploy returns a working production URL.

## Delivery boundaries

- Do not overwrite unrelated worktrees or `~/box`.
- Do not copy protected streaming audio.
- Do not claim a song is playable without local chart and audio evidence.
- Do not claim trouble bars from summary-only legacy runs.
- Do not replace live user data during QA.
- Do not claim notarization without Apple notarization proof.

## Deferred decisions

These decisions do not block the first complete build:

- cloud account sync,
- multi-user social features,
- competitive leaderboards,
- automatic copyrighted audio acquisition,
- learned recommendation models,
- advanced 3D or WebGL scenes,
- App Store distribution.

The architecture must keep these options possible without making them prerequisites.
