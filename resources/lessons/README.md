# Drumroll Method — Lesson Library Generator

A deterministic pipeline that turns `curriculum.yaml` (170 drumset exercises,
hand-authored in this repo) into playable Drumroll song folders: a chart
(`notes.mid`), a click track (`song.ogg`), an audible drum-pattern demo
rendered from real (CC0) drum samples (`drums.ogg`), and metadata
(`song.ini`).

## Inspiration and copyright

The unit/lesson progression uses the broad topic order observed in a beginner
drumset-method reference supplied for curriculum gap analysis (stroke basics →
reading → coordination → eighth notes → toms → ties/rests/accents → fills →
musical form → sixteenth notes → triplets → jazz/shuffle → new meters →
capstone work). Rudiments (single strokes, paradiddles) and standard beat
vocabulary (rock backbeat, shuffle, jazz ride, waltz, 12/8) are traditional
material, not the reference's IP.

No prose, engravings, or images from the book are reproduced anywhere in
this directory. Every exercise title, coaching cue, and the specific note
pattern (the exact grid of hits below) is original work written for this
project — none of it is transcribed from the book's pages. Where an
exercise is clearly _inspired by_ a specific book passage (e.g. "the basic
jazz ride pattern" or "the shuffle"), that's because the underlying rhythm
is public-domain musical vocabulary any method book would teach, taught
here in different words with a different note pattern.

The exact source identity, SHA-256, 90-page section map, 118-exercise base
coverage, 52-exercise original extension, and disclosed representation limits
are recorded in `docs/curriculum-source-coverage.md`.

The three "Rudiment Gym" units (see below) draw their rudiment names and
stickings from the Percussive Arts Society's PAS International Drum
Rudiments list — a standardized, public-domain naming system maintained by
a nonprofit educational body, not any one publisher's proprietary content.
Every exercise's specific note pattern, tempo ladder, and coaching cue in
those units is original work written for this project, same as the rest of
the curriculum.

## Curriculum shape

10 units → 25 lessons → 170 exercises. The original 7 units / 18 lessons /
118 exercises (17 lessons map 1:1 to the book's Lesson 1–17; the 18th,
"Encore Repertoire", stands in for the book's two capstone song charts) are
the retained base. The three-tom repair intentionally re-authors 07.02–07.08
and reinforces the T2 lane in 10.05, 18.01, and 18.02; all other pre-existing
exercise content remains retained. Three new "Rudiment Gym" units (the
Fundamentals/rudiments wing, see below) are interleaved between them, which
is why the unit letters below aren't a plain A–J run and why lesson/exercise
numbers shifted for everything at or after Lesson 3 (`04.01` is still the
same "Single Paradiddle Drill" exercise it always was — it just lives at a
higher lesson number now, since two Rudiment Gym I lessons were inserted
ahead of it. `stars_to_unlock`/`next` were fully recomputed, so the unlock
chain itself is unaffected).

| Unit | Name                                   | Exercises |
| ---- | -------------------------------------- | --------- |
| A    | Foundations                            | 6         |
| RG1  | Rudiment Gym I: Sticking Foundations   | 17        |
| B    | First Grooves                          | 12        |
| C    | Toms, Dynamics & Fills I               | 30        |
| D    | Groove Vocabulary & Musical Form       | 10        |
| RG2  | Rudiment Gym II: The Paradiddle Family | 19        |
| E    | 16th-Note Mastery                      | 22        |
| F    | Triplets, Jazz & Shuffle               | 28        |
| RG3  | Rudiment Gym III: Measured Rolls       | 16        |
| G    | New Meters & Capstones                 | 10        |

Full lesson-by-lesson breakdown is in `curriculum.yaml` (`units[].lessons[]`).

### Curriculum contract validation

Run the checked-in curriculum validator after changing lesson content:

```sh
resources/lessons/.venv/bin/python3 resources/lessons/validate_curriculum.py
```

It renders every chart's `notes.mid` payload in memory and parses the emitted
tom marker notes; it does not accept YAML lane text as proof that a generated
chart contains a tom. In addition to the stable 170-exercise unlock chain, it
enforces the three-tom gates in `docs/requirement-ledger.md` E4.04–E4.05:
T2 appears in at least eight exercises (four in Lesson 7 and two later
reinforcements), each tom has at least three isolated drills, both directions
of the T1↔T2 and T2↔T3 moves are present, at least two full sweeps exist, and
at least two all-three-tom groove contexts and two fill contexts remain.

### Rudiment Gym (the Fundamentals wing)

The owner's brief for this wing: grasp the rudiments and elements
thoroughly, then apply them in real playing. That's the shape of all three
Rudiment Gym units — every rudiment gets a **tempo ladder** (3–5 exercises
of the identical pattern at rising `bpm_target`, e.g. 60→80→100→120) plus
one **application exercise** that places the same sticking inside a groove
or fill, usually naming where that vocabulary shows up in real music.

**Placement.** Three seasons, interleaved by difficulty rather than bolted
on as one block at the end, so the player meets rudimentary technique right
before the unit that would otherwise ask them to invent it from scratch:

- **Rudiment Gym I: Sticking Foundations** — after Unit A, before Unit B
  "First Grooves". Unit A's own Lesson 1 already touches alternating
  singles and paired doubles informally (`01.01`/`01.02`); RG1 turns that
  into disciplined single/double/triple-stroke rolls and two accent
  studies _before_ Unit B asks the player to build grooves out of that
  vocabulary.
- **Rudiment Gym II: The Paradiddle Family** — after Unit D "Groove
  Vocabulary & Musical Form", before Unit E "16th-Note Mastery". All four
  paradiddle-family rudiments (single/double/triple/paradiddle-diddle) plus
  hand-to-foot substitution are natural 16th-note coordination drills — RG2
  is the on-ramp into the dedicated 16th-note unit that follows it, not a
  detour from it. (Single Paradiddle already exists as a groove exercise at
  `04.01`; RG2's ladder is the same rudiment at full continuous 16th-note
  density and cross-references `04.01` by name in its cue rather than
  duplicating it.)
- **Rudiment Gym III: Measured Rolls** — after Unit F "Triplets, Jazz &
  Shuffle", before Unit G "New Meters & Capstones". The five/six/seven/
  nine-stroke rolls are the fastest, most demanding material in this wing;
  they're placed last, once 16th-note fluency (Unit E) and a wider musical
  vocabulary (Unit F) are already in hand, immediately before the
  capstone-adjacent Unit G.

All three units use **16th-note (16-step) grid resolution exclusively** —
deliberately, not by accident. An early draft considered packing the
paradiddle family's 6-note groupings (double paradiddle, paradiddle-diddle)
into 12-step/triplet-resolution bars, which would have made those two
rudiments the first thing in the curriculum to demand triplet reading,
three lessons before Unit F actually teaches it. Instead every 6-note and
8-note rudiment group is notated as plain 16th notes with a trailing rest
where the group doesn't fill the bar evenly (see `SIX_GROUP_BAR` in the
authoring notes) — no triplet subdivision appears anywhere in this wing.

**Rudiment catalog — PAS-40 coverage.**

| Included (13 items, 52 exercises)          | Grid representation                                         |
| ------------------------------------------ | ----------------------------------------------------------- |
| Single stroke roll                         | continuous unaccented 16ths                                 |
| Double stroke roll                         | continuous unaccented 16ths (see notation caveat)           |
| Triple stroke roll                         | continuous unaccented 16ths (see notation caveat)           |
| Single paradiddle                          | accent on notes 1 & 5 of an 8-note group                    |
| Double paradiddle                          | accent on note 1 of two 6-note groups                       |
| Triple paradiddle                          | accent on note 1 of two 8-note groups                       |
| Paradiddle-diddle                          | accent on note 1 of two 6-note groups (see notation caveat) |
| Five stroke roll                           | 4 unaccented + accent on note 5, in an 8-step cell          |
| Six stroke roll                            | accent on notes 1 & 6, doubles between, 8-step cell         |
| Seven stroke roll                          | 6 unaccented + accent on note 7, 8-step cell                |
| Nine stroke roll                           | 8 unaccented + accent on note 9, 16-step cell               |
| Accent studies (every-4th, every-3rd note) | rotating accent over a continuous 16th stream               |
| Hand-to-foot combinations                  | every Nth stroke of a stream substituted onto the kick      |

| Excluded                                                                                                                                                                                  | Why                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All 11 flam rudiments (flam, flam accent, flam tap, flamacue, flam paradiddle, single flammed mill, flam paradiddle-diddle, pataflafla, swiss army triplet, inverted flam tap, flam drag) | a flam's grace note lands under ~30ms before its primary note; the grid has no sub-step timing offset (same gap the README already documents for flams generally)                                                 |
| All 10 drag/ratamacue rudiments (drag, single/double drag tap, Lesson 25, single dragadiddle, drag paradiddle #1/#2, single/double/triple ratamacue)                                      | drags are grace-note ornaments — same sub-step timing gap as flams                                                                                                                                                |
| Multiple bounce roll (buzz roll)                                                                                                                                                          | a sustained, uncontrolled-bounce roll has no discrete-hit representation in a grid where every step is one fixed-duration attack — the same category of gap as the README's existing fermata caveat               |
| Ten/eleven/thirteen/fifteen/seventeen-stroke rolls                                                                                                                                        | same measured-roll technique as the five/six/seven/nine-stroke rolls that _are_ included; left out only to keep this wing's exercise count inside the requested +40–60 budget, not for any notation-format reason |

**Structured sticking**: every generated folder now carries `sticking.json`.
Its bar records align exact `right-hand`, `left-hand`, and `right-foot`
assignments to each authored step and lane. Explicit R/L strings cover the
book-facing sticking drills; standard rudiment tags resolve the known PAS
patterns; ordinary kit notes receive deterministic orchestration defaults.
`countInBars` and `repeatCount` make the authored bars align with the complete
generated MIDI timeline without inference.
The duplicate audit fingerprints notes and limbs together, so single, double,
and triple strokes and the paradiddle variants are distinct lesson data even
when the snare MIDI and audio timbre match. Staff R/L glyphs remain an additive
renderer consumer of this file; phase 1 does not alter chart parsing or staff
layout.

Generated MIDI also carries `ENABLE_CHART_DYNAMICS`: `X` uses velocity 127
and `g` uses velocity 1, while demo-audio gain remains tied to the authored
dynamic level. The current parser therefore exposes accents and ghost notes as
chart flags instead of reducing them to ordinary hits.

**Bridges to real music.** Where a bridge is defensibly true it names a
specific, well-known reference (single-stroke tom rolls → "Wipe Out";
single-stroke accent fills → "In the Air Tonight"; the paradiddle-as-groove
voicing → Steve Gadd's "50 Ways to Leave Your Lover"); everywhere else it
names a genre/technique vocabulary rather than inventing a specific bar
number in a specific recording (gospel-chops fills, drumline cadence
vocabulary, blues-rock turnaround fills, modern "chops"-style ostinatos).

**Skills tags.** Every exercise (all 170, not just the new 52) now carries
a `skills` list — see "Gamification data" below.

### What got consolidated

The book repeats the same drill many times over with only the sticking
order changed (e.g. 24 near-identical R/L permutation exercises in Lesson
1, or ~19 minor variations of an 8th-note groove in Lesson 4). Where a
family of book exercises taught one concept through many mechanically
similar drills, this curriculum keeps a handful of representative
exercises instead of every permutation:

- Lesson 1 sticking drills: 24 R/L permutations → 2 representative patterns.
- Lesson 4 paradiddle family (single/double/triple/diddle): kept single
  paradiddle only; double/triple are a natural Method-2-level follow-up.
- Lesson 4 8th-note groove variations: ~19 → 7.
- Lesson 5 toms sticking-permutation/quarter-note-beat/beats-with-toms
  exercises plus 3 named songs: ~20 book pieces → 8 exercises (05.01–05.08).
- Lesson 6 ties/rests + basic-beat variations: ~20 → 6.
- Lesson 8 accent-shifting drill (8 positions, one per eighth-note
  position in the bar) → 3 exercises (08.01–08.03); the "Fills Exercise"
  vocabulary block (10 numbered fill lines, several both-sticks/unison) →
  1 dedicated time-keeping exercise (08.07), with the fill-vocabulary
  variety itself spread across 08.04–08.08 as separately named exercises.
  The book also teaches open hi-hat as its own Lesson-8 topic (a groove
  built on alternating open/closed hi-hat); that's now its own dedicated
  exercise, 08.10 "Open Hi-Hat Backbeat Splash" — the hi-hat opens on the
  "and" right before each backbeat and clamps shut exactly on beats 2
  and 4.
- Lesson 9 two-bar beats/fills/backbeat-shift variations: ~28 → 8.
- Lesson 10: the book's four progressive versions of one song ("Version
  1/2/3/Full") → one capstone "Full-Form Etude" that already contains the
  full intro/verse/chorus/fill/outro arc. The book also pairs a 4/4 and a
  3/4 demonstration of the same "crash marks a new phrase" idea; only the
  4/4 case (10.01) is kept here since the 3/4 case is already covered by
  06.06 "Accented Crash Downbeat in 3".
- Lesson 11 16th-note groove options and variations: ~24 → 10.
- Lesson 12 new-rhythm patterns and grooves: ~32 → 5.
- Lesson 14 triplet/jazz-ride/comping family: ~40 → 9.
- Lesson 15 triplet accent-shift and jazz-fill variations: ~28 → 7.
- Lesson 16 shuffle/hi-hat-shuffle/jazz-waltz family: ~20 → 12 (kept more
  of these since each shuffle variant — rock 1, rock 2, Texas, straight,
  hi-hat shuffle, jazz waltz in one/in three — is a genuinely distinct,
  named piece of vocabulary, not a permutation). The book's "Jazz
  Shuffle" variant (a 5th named shuffle) was not carried over separately.
- Lesson 17 12/8, 6/8, and cut-time beat variations: ~11 → 8.
- Lesson 18 (Encore charts): the book's song-form navigation reading
  (repeat-to-sign, first/second endings, coda jumps) has no representation
  in the flat, linear `mode: loop` chart format used here — that's a
  format limitation, not a content cut, and is out of scope until a
  future chart format supports section jumps. Lesson 07's former isolated
  tom examples were subsequently replaced by a three-tom progression that
  explicitly identifies T1/T2/T3, teaches both movement directions, then
  transfers those moves into grooves and fills. The checked-in MIDI validator
  above guards that coverage instead of relying on title text alone.

The original book-inspired wing contains 118 exercises — comfortably
inside the initial "expect 50–120" target while still touching every
lesson, every meter (4/4, 3/4, 6/8, 12/8, 2/2 cut time), every subdivision
(8th, 16th, triplet, shuffle), and every technique (dynamics, ghost notes,
cross-stick, tom fills, open hi-hat) the book introduces. The later
Rudiment Gym addition brings the connected curriculum to 170 exercises;
its validation is recorded below. A few notation gaps are worth calling
out explicitly, all format/vocabulary limitations rather than content cuts:

- **Flams** (a grace note landing almost simultaneously with its primary
  note) are not currently representable — the notation grid has no
  sub-step timing offset — so no exercise claims to teach a true flam.
- **Fermata** (a held/paused note) has no representation either — every
  step in the grid is a fixed-duration hit, and there's no sustain/hold
  symbol — so where the book pauses on a held cymbal or fermata-marked
  figure, this curriculum either omits that pause or lets the phrase's
  final crash ring out under `mode: loop`'s natural bar-boundary silence,
  which is not the same thing as a notated fermata.
- **Single ride voice, no bell**: the `R` lane is one ride-cymbal voice
  (the shank/bow strike used for standard ride patterns). There's no
  dedicated ride-bell lane or symbol, so where the book calls for a bell
  accent (a common jazz/rock ride articulation), this curriculum plays it
  as a regular `R` hit (optionally `X`-accented) rather than a distinct
  timbre — a notation-vocabulary gap, not a musical error.
- **Open hi-hat is a MIDI-vocabulary constraint, not just a chart quirk**:
  Clone Hero/Rock Band's pro-drums MIDI vocabulary has no distinct note
  for open vs. closed hi-hat (`H`/`O`/`T1` all share MIDI note 98), so
  `notes.mid` itself is identical either way — a real Clone Hero session
  can't tell the two apart from the chart data. Only `drums.ogg`'s
  audible demo (via the `o` step symbol — see "Notation format" below)
  and the `O` lane's notation-only bookkeeping distinguish open from
  closed hi-hat for a human reading the chart.

## Notation format

`curriculum.yaml` stores each exercise's pattern as a compact per-lane grid
(see `meta.notation_legend` at the top of the file for the canonical
version). Summary:

- **Lanes**: `K` kick, `S` snare, `H` hi-hat closed, `O` hi-hat open, `R`
  ride, `C` crash, `T1`/`T2`/`T3` high/mid/floor tom.
- **Symbols** (one character per step): `.` rest, `x` normal hit, `X`
  accent, `g` ghost note, `o` open-hihat color hit (see below).
- **`o` — open-hihat color within a lane's own pattern**: written inside a
  lane's step string (in this curriculum, always the `H` lane) instead of
  switching to the `O` lane, for exercises where a single pattern mixes
  open and closed hi-hat within the same bar (a shuffle groove where the
  foot opens and closes mid-pattern — see 08.10, 16.07, 16.08). MIDI-wise
  it's identical to a closed hit on the same lane (see "MIDI mapping"
  below), but `generate.py`'s `drums.ogg` renderer swaps in the vendored
  `hihat_open.wav` sample for `o` events specifically, so the demo audio
  is audibly distinct from a closed hit even though the chart data is not.
- **Graded dynamics — `1`–`6`**: a six-step dynamics tier (`1`=pp,
  `2`=p, `3`=mp, `4`=mf, `5`=f, `6`=ff; velocities 30/45/60/80/100/115)
  layered on top of the original binary `x`/`X`/`g` notation. Used only on
  the handful of exercises where the book gives a genuine multi-step
  dynamic arc rather than a binary loud/soft contrast: 07.01, 11.04,
  12.02 (the Lesson 10 capstone), and 25.01/25.02 (the two Encore etudes).
  Every other exercise keeps the original binary
  dynamics. `f`/`ff` (100/115) clear the judge's
  `ACCENT_VALUE_THRESHOLD` (90) the same way `X` (115) always has, and
  `pp`/`p` (30/45) clear `GHOST_VALUE_THRESHOLD` (50) the same way `g`
  (40) always has — see `src/renderer/services/engine/constants.ts`.
- Each lane's string length is that bar's step count (8 for 8th notes, 16
  for 16ths, 12 for 8th-note triplets in 4/4, etc). All lanes in one bar
  share the same step count; different bars in the same exercise may use
  different resolutions (e.g. "3 bars of groove + 1 bar of 16th-note
  fill").
- `H`/`O`/`T1` share MIDI note 98, `R`/`T2` share note 99, `C`/`T3` share
  note 100 — the real Clone Hero/Rock Band "pro drums" pad layout, where a
  long marker note (110/111/112) tags a span of a pad as a tom instead of
  a cymbal. `generate.py` emits a tight marker around every individual
  tom hit, so a cymbal lane and its paired tom lane can coexist anywhere
  in the same exercise (different bars, different steps) — the one thing
  that's never allowed is both hitting the _same step_, since one pad
  can't be two voices at once (`generate.py` raises a clear error if the
  data ever does that).

## Running the generator

```sh
cd resources/lessons
uv run --python 3.12 --with pyyaml python generate.py
```

Useful flags:

- `--out-dir PATH` — write elsewhere (defaults to
  `tmp/lanes/f-staging/library`; no user library is read or changed).
- `--only 03.03,04.04` — regenerate just a few exercises by id.
- `--dry-run` — print what would be written without touching disk.

To stage the complete packaged library and manifest from the repository root:

```sh
node web/scripts/package-lessons.mjs --out-dir tmp/lanes/f-staging/library
```

Custom package outputs are rejected unless they stay under that staging
library subtree. The release pipeline's no-flag invocation remains the only
path that replaces `web/public/library`.

`ffmpeg` must be on `PATH` (used to transcode both the generated click WAV
and the generated drums WAV into compact stereo OGG files). The macOS release
pipeline builds the pinned native-Vorbis runtime with
`scripts/prepare-ffmpeg-runtime.sh`; direct callers may instead provide a
compatible system FFmpeg. The 10 one-shot
drum samples `drums.ogg` is rendered from are already vendored in
`samples/` (see `samples/ATTRIBUTION.md`) — no network access is needed to
run `generate.py` itself, only if you re-run `samples/_vendor_pipeline.py`
to change which source samples are used.

### Why a venv instead of pure stdlib

`generate.py` is otherwise stdlib-only — the MIDI writer is hand-rolled
(no `mido` dependency) — but `curriculum.yaml` is real YAML, so parsing it
needs a YAML library. `pyyaml==6.0.3` is pinned in `requirements.txt` and
installed into a local, gitignored `.venv/`, mirroring how a `mido`
dependency would have been set up if that path had been chosen instead.

## Determinism

`notes.mid` is byte-identical across repeated runs from the same
`curriculum.yaml`: the MIDI writer never touches the clock, a random
source, or any other non-deterministic input, and event ordering is fully
determined by (tick, event kind, note number). Verified by hashing two
independent runs of the same exercise set — identical SHA-1s.

`song.ogg`'s _audio content_ (its exact sample data, hence its duration)
is equally deterministic — the click WAV is synthesized sample-by-sample
from the same tick timeline as the MIDI. The final compressed `.ogg`
container bytes can vary a few bytes run to run because the native Vorbis
encoder embeds a random Ogg stream serial number by default; this has no audible or
functional effect and doesn't change the file's duration.

`drums.ogg` is deterministic the same way: no randomness or dithering
anywhere in the mix path (`audioop.mul`/`audioop.add` are pure functions
of their inputs), so the pre-encode WAV is byte-identical across runs and
the post-encode decoded PCM is identical too (verified by hashing two
independent full-pipeline runs of the same exercise).

## drums.ogg — audible pattern demo

The book ships audio examples of every exercise; this project can't
reproduce those (copyright), so `generate.py` synthesizes an equivalent
directly from the same pattern data that drives `notes.mid` — real drum
one-shot samples (see `samples/ATTRIBUTION.md` — CC0-licensed, vendored
in-repo) placed at each hit's exact tick time:

- **Sample-accurate alignment with `song.ogg`**: `drums.ogg` is built from
  the identical `Timeline` (same ticks, same `bpm_target`, same
  tick→seconds conversion) as the click track, so the two files are
  always the same duration and every drum hit lands exactly where its
  click/beat does. The count-in bar's hi-hat pulses are real hi-hat hits
  here too, not just clicks.
- **Velocity-scaled gain, not different samples per dynamic**: each lane
  has one vendored one-shot (`kick.wav`, `snare.wav`,
  `hihat_closed.wav`/`hihat_open.wav`, `ride.wav`, `crash.wav`,
  `tom_high.wav`/`tom_mid.wav`/`tom_low.wav`), scaled by
  `VELOCITY[sym] / 127` — accent (`X`) hits louder, ghosts (`g`) quiet —
  the same three-level dynamic the MIDI already encodes. One exception:
  accented snare hits (`X`) use a separate `snare_rimshot.wav` one-shot
  instead of a louder copy of the center hit, since accented backbeats are
  authentically rimshots in real drumming.
- **Mixing**: samples are mixed via the stdlib `audioop` module (C-speed
  add/multiply on raw PCM, no numpy dependency) into one mono 44.1kHz
  buffer, then transcoded to a modest-bitrate (64kbps) mono OGG — the same
  ffmpeg step `song.ogg` already uses, just at a different sample
  rate/bitrate suited to real drum timbre vs. a synthesized click.
- **Mutable in the app for free**: the app already treats any audio
  filename containing `"drums"` as a separately mixable/mutable stem
  (`src/renderer/hooks/useSongLoader.ts`), and `scan-chart`'s own stem
  whitelist (`hasAudioName` in `scan-chart/src/utils.ts`) recognizes
  `drums` as a valid Clone-Hero-style stem name — no app code changed for
  this feature; naming the file `drums.ogg` was sufficient.
- **Offline after vendoring**: the 10 one-shot `.wav` files live in
  `samples/` and are read directly by `generate.py` via the stdlib `wave`
  module — no network access, no re-fetching, at generation time. Only
  `samples/_vendor_pipeline.py` (a separate, manually-run one-time script)
  needs network access, and only if you want to re-derive the `.wav`
  files from a different source layer/mic position.

## How exercise length and the count-in work

Every `bars` list in `curriculum.yaml` is one authored "loop unit" (the
book's own convention — its audio tracks literally say "Play 4 times",
"Play 7 times", etc). `generate.py` computes how many times to repeat that
unit so the exercise (excluding count-in) lands in 30–90 seconds:

```
repeats = ceil(30s / loop_unit_duration)      # at least 30s
if repeats > 1 and repeats * loop_unit_duration > 90s: repeats -= 1
```

A single bar of hi-hat clicks (downbeat accented) is prepended before the
loop content — one full bar, in the exercise's own meter and tempo — and
is baked into _both_ `notes.mid` and `song.ogg` identically, so no
`delay`/offset trick is needed to keep notation and audio in sync
(`delay = 0` in every `song.ini`).

## MIDI mapping (expert difficulty only)

| Lane             | Note |     | Lane        | Note                         |
| ---------------- | ---- | --- | ----------- | ---------------------------- |
| Kick (`K`)       | 96   |     | Ride (`R`)  | 99                           |
| Snare (`S`)      | 97   |     | Crash (`C`) | 100                          |
| Hi-hat (`H`/`O`) | 98   |     | Tom markers | `T1`→110, `T2`→111, `T3`→112 |

Velocities: accent (`X`) 115, normal (`x`/`o`) 96, ghost (`g`) 40, and the
graded-dynamics tier `1`–`6` (pp/p/mp/mf/f/ff) 30/45/60/80/100/115 — see
"Notation format" above for where the graded tier applies.
`notes.mid` is SMF format 1, 480 ticks/quarter, 2 tracks (a conductor
track with the tempo/time-signature map, and `PART DRUMS` with the notes).
Open hi-hat (`O` lane, and the `o` step symbol within other lanes) is
tracked separately in the notation for a future UI's benefit but
currently renders to the same MIDI note as closed hi-hat — Clone Hero's
pro-drums format has no distinct open-hat signal to target. The `o`
symbol's audible distinction lives only in `drums.ogg` (a different
sample), not in `notes.mid`.

## Validation history

The 117/118 figures below are retained as evidence from the original
book-inspired curriculum milestones. The current 170-exercise end state is
covered by the Rudiment Gym validation entry later in this section.

- **Independent MIDI re-parse** (hand-written parser, not `generate.py`'s
  own writer) on 5 sample folders: confirms `PART DRUMS` track name,
  note-on count exactly matching the yaml pattern's hit count (including
  tom-marker notes), correct tempo (µs/quarter matches `bpm_target`), and
  a velocity spread of both 96/115 (and 40 where ghosts are used).
- **`scan-chart` (the app's own dependency)**: ran `parseChartFile` with
  `{pro_drums: true}` against every one of the 118 generated
  `notes.mid` files — **118/118 pass**: each has a `drums` track at
  `expert` difficulty and at least one audio file next to it.
- **`ffprobe`** on 3 sample `song.ogg` files: measured duration matched
  the `song.ini` `song_length` field to well under 1ms in every case
  (target was 200ms).
- **`drums.ogg` addition (2026-08-05)**: regenerated all 117 folders after
  adding the drum-sample renderer.
  - `scan-chart`'s real `scanChartFolder` (not a hand-rolled check) ran
    against every one of the 117 folders' full file sets: **117/117**
    come back `playable: true`, with a `drums` instrument track present
    and zero `noAudio`/`invalidAudio`/`multipleAudio` folder issues —
    `drums.ogg`'s stem name is on `scan-chart`'s own recognized-stem
    whitelist, so it's treated as a first-class audio stem, not an
    unrecognized extra file.
  - `ffprobe` duration of `drums.ogg` vs. `song.ogg` on 5 folders spread
    across the curriculum (different meters/tempos/lengths): worst
    observed difference was **0.023ms** (target was 50ms).
  - Determinism: hashed two independent in-process `build_drums_wav_bytes`
    runs of the same exercise (identical SHA-1), and separately hashed the
    ffmpeg-decoded PCM of two independent full-pipeline `drums.ogg`
    outputs for the same exercise (identical SHA-1) — confirms no
    randomness/dithering anywhere in the sample-mixing or encode path.
- **Curriculum-gap closure pass (2026-08-06)**: fixed the `o`-symbol audio
  bug (see "Notation format" — `_sample_key_for` now routes `o` events to
  `hihat_open.wav` instead of silently falling through to the closed-hat
  sample), added graded dynamics, added 08.10, and renumbered the unlock
  chain to 118 exercises. Full battery re-run after regenerating all 118
  folders:
  - `parseChartFile`: **118/118 pass**.
  - `scanChartFolder`: **118/118** `playable: true`, zero
    `noAudio`/`invalidAudio`/`badAudio`/`multipleAudio` folder issues
    (the only folder issue present anywhere is the pre-existing, expected
    `noAlbumArt` — no cover art is authored for this library).
  - `ffprobe` spot-check across 8 folders spread through the curriculum:
    worst `song.ogg`-vs-`song.ini` difference **0.28ms**, worst
    `song.ogg`-vs-`drums.ogg` difference **0.02ms** (targets 200ms/50ms).
  - Determinism: two independent full-pipeline runs of 08.10, 09.04,
    16.07, 16.08, and 18.02 (the exercises this pass touched) produced
    byte-identical `notes.mid` SHA-1s and identical decoded-PCM SHA-1s
    for both `song.ogg` and `drums.ogg`.
  - Chain connectivity: a dedicated script (not hand-verification) walks
    `id → next` from the first exercise and confirms it visits all 118
    ids exactly once, in document order, with `stars_to_unlock` equal to
    each exercise's 0-based position throughout.
  - Audible-difference check for the `o` fix: `hihat_open.wav` (122,268
    frames / 2.77s, a ringing open cymbal) vs. `hihat_closed.wav` (29,318
    frames / 0.66s, a short choked hit) are unambiguously different
    one-shots, and `_sample_key_for("H", "o")` now returns `"hihat_open"`
    (previously `"hihat_closed"`, same as a plain `x`) — verified directly
    against the regenerated 16.07/16.08 `drums.ogg`.
- **Rudiment Gym / Fundamentals wing addition (2026-08-09)**: spliced 3 new
  units (52 exercises) into the curriculum and programmatically renumbered
  the whole sk\_ chain (lesson ids, exercise ids, `stars_to_unlock`, `next`)
  across all 170 exercises. The splice/renumber pass was a full
  `yaml.safe_load` → rebuild → `yaml.safe_dump` round-trip (not a hand
  edit), so it was verified in layers:
  - **Round-trip field preservation at splice time**: every one of the
    pre-existing 118 exercises' unchanged fields (`title`, `cue`,
    `time_signature`, `bpm_slow`, `bpm_target`, `diff_drums`, `mode`,
    `bars`) was deep-compared against the pre-splice file in original
    document order — **118/118 byte-for-byte identical**; only `id`,
    `lesson`, `stars_to_unlock`, `next`, and the new `skills` field changed.
    The later, deliberate E4.04 three-tom repair is documented in the
    Curriculum contract validation section above.
  - Stale exercise-id cross-references embedded in `meta` prose (the
    `graded_dynamics`, `symbols.g`, and `symbols.o` blurbs, which name
    specific exercises like "09.04" or "18.01/18.02" by their old numbers)
    were mechanically remapped to the new ids as part of the same pass, not
    left stale.
  - Every one of the 170 exercises' `bars` was validated through
    `generate.py`'s own `build_timeline()`/`_validate_bar()` (step-count
    parity, valid symbols, same-step pad conflicts) before anything was
    written to disk.
  - `parseChartFile` (independent parser, not `generate.py`'s own writer):
    **170/170 pass**, each with a non-empty `drums`/`expert` track.
  - `scanChartFolder` (the app's own library-scan function): **170/170**
    `playable: true`, zero folder issues besides the pre-existing, expected
    `noAlbumArt`.
  - Determinism: two independent full-pipeline `generate.py` runs of all
    170 exercises produced byte-identical `notes.mid` SHA-1s
    (**170/170**), and identical decoded-PCM SHA-1s for `song.ogg` and
    `drums.ogg` on an 18-folder spread sample (**36/36**, including the
    first exercise, the last exercise, and a Rudiment Gym exercise).
  - `ffprobe` duration spot-check across the same 18-folder sample: worst
    `song.ogg`-vs-`song.ini` difference **0.43ms**, worst `song.ogg`-vs-
    `drums.ogg` difference **0.02ms** (targets 200ms/50ms).
  - Chain connectivity: the dedicated walk-script confirms `id → next`
    visits all 170 ids exactly once, in document order, with
    `stars_to_unlock` equal to each exercise's 0-based position throughout
    — one single connected path, no branches, no orphans.
  - Live-library regeneration: all 118 stale `SightKick Method - Lesson *`
    folders from the pre-splice numbering were removed from
    `~/Music/SightKick` (folders outside that prefix — the user's real
    songs — were left untouched) before regenerating fresh, so the live
    library never carried duplicate/orphaned lesson folders under both the
    old and new numbering at once.

## Gamification data (no UI here — this feeds a future Lessons screen)

Every exercise carries:

- `stars_to_unlock`: recommended minimum total stars (summed across every
  prior exercise) before this one unlocks. It's simply the exercise's
  0-based position in the full curriculum order, so the whole curriculum
  is one linear unlock chain by default — a future UI is free to widen
  that (e.g. unlock a whole lesson at once, or let a player skip ahead
  once they've banked enough stars from _any_ mix of earlier exercises).
- `next`: the id of the next exercise in recommended order (`null` for
  the very last one, `25.02`).
- `skills`: a list of tags from a controlled vocabulary (documented in
  `curriculum.yaml` under `meta.skills_legend` — e.g. `paradiddle`,
  `kick-independence`, `sixteenth-notes`, `dynamics`, `single-stroke-roll`).
  Added across the whole curriculum, not just the new Rudiment Gym
  exercises: the 52 new exercises carry hand-authored tags, and the
  pre-existing 118 carry tags derived mechanically from each exercise's own
  notation (lanes used, step resolution, meter, dynamics/accent/ghost
  symbols present, lesson name) rather than guessed by hand — see
  `derive_skills()` in the authoring notes below. This is for a future
  AI-coach lane to consume for lesson-linking (mapping a song's fills/
  grooves back to the rudiment lessons that teach them); it's not read by
  the Lessons journey UI itself.

These fields are also written into every generated `song.ini` as custom
fields, so a Lessons UI (or the AI-coach lane) can read them without
re-parsing `curriculum.yaml`: `sk_lesson_id`, `sk_stars_to_unlock`,
`sk_next` (empty string for the last exercise), `sk_unit`, `sk_lesson_title`,
and `sk_skills` (comma-joined tag list). `sk_lesson_title` is the unique
exercise title shown on the journey node, not the parent lesson heading;
otherwise sibling exercises would appear with duplicate names. Unknown
`.ini` fields are ignored by the app's own parser, so this is additive and
safe. These six field names are a contract with their respective consumers
— don't rename them without updating all sides.

### Suggested progression UX

- **Unlock chain**: render the 170 exercises as one path (or a
  per-lesson row within a per-unit map). A locked exercise shows the
  `stars_to_unlock` threshold; once the player's total star count meets
  it, unlock and highlight it as "next" using the `next` pointer chain.
- **Daily set**: one _lesson_ (avg. ~6–7 exercises, min 2, max 12) is a
  natural single practice session — it matches one sitting with the
  physical book. A "today" view could default to whichever lesson
  contains the player's next-unlocked exercise, offering all of that
  lesson's remaining exercises as the day's set.
- **Difficulty ramp**: `diff_drums` (0–6) rises roughly monotonically
  with curriculum position, with the two Encore capstones and a handful
  of "song" pieces per lesson sitting a notch above their lesson's
  technical drills — a UI can use this to badge exercises as
  "warm-up" / "core" / "challenge" within a lesson without any new data.
- **Practice-tempo pair**: `bpm_slow` / `bpm_target` are both present on
  every exercise (mirroring the book's own "go slowly first" instruction)
  so a future UI can offer a slow-practice toggle without touching
  `generate.py` — regenerate with a CLI flag that picks `bpm_slow`
  instead, if that becomes a real feature.
