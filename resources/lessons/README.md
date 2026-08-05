# SightKick Method — Lesson Library Generator

A deterministic pipeline that turns `curriculum.yaml` (117 drumset exercises,
hand-authored in this repo) into playable SightKick song folders: a chart
(`notes.mid`), a click track (`song.ogg`), an audible drum-pattern demo
rendered from real (CC0) drum samples (`drums.ogg`), and metadata
(`song.ini`).

## Inspiration and copyright

The unit/lesson progression is inspired by the lesson order of a well-known
beginner Hal Leonard drumset method book (grip/stroke basics → reading →
coordination → 8th notes → toms → ties/rests/accents → strokes → fills →
musical form → 16th notes → new rhythms → 16th-note fills → triplets → jazz
→ shuffle → new meters → capstone tunes). Rudiments (single strokes,
paradiddles) and standard beat vocabulary (rock backbeat, shuffle, jazz
ride, waltz, 12/8) are traditional material, not the book's IP.

No prose, engravings, or images from the book are reproduced anywhere in
this directory. Every exercise title, coaching cue, and the specific note
pattern (the exact grid of hits below) is original work written for this
project — none of it is transcribed from the book's pages. Where an
exercise is clearly _inspired by_ a specific book passage (e.g. "the basic
jazz ride pattern" or "the shuffle"), that's because the underlying rhythm
is public-domain musical vocabulary any method book would teach, taught
here in different words with a different note pattern.

## Curriculum shape

7 units → 18 lessons (17 map 1:1 to the book's Lesson 1–17; the 18th,
"Encore Repertoire", stands in for the book's two capstone song charts) →
117 exercises.

| Unit | Name                             | Exercises |
| ---- | -------------------------------- | --------- |
| A    | Foundations                      | 6         |
| B    | First Grooves                    | 12        |
| C    | Toms, Dynamics & Fills I         | 29        |
| D    | Groove Vocabulary & Musical Form | 10        |
| E    | 16th-Note Mastery                | 22        |
| F    | Triplets, Jazz & Shuffle         | 28        |
| G    | New Meters & Capstones           | 10        |

Full lesson-by-lesson breakdown is in `curriculum.yaml` (`units[].lessons[]`).

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
  future chart format supports section jumps.

117 exercises is the result — comfortably inside the "expect 50–120"
target while still touching every lesson, every meter (4/4, 3/4, 6/8,
12/8, 2/2 cut time), every subdivision (8th, 16th, triplet, shuffle), and
every technique (dynamics, ghost notes, cross-stick, tom fills, open
hi-hat) the book introduces. Flams (a grace note landing almost
simultaneously with its primary note) are not currently representable —
the notation grid has no sub-step timing offset — so no exercise claims
to teach a true flam.

## Notation format

`curriculum.yaml` stores each exercise's pattern as a compact per-lane grid
(see `meta.notation_legend` at the top of the file for the canonical
version). Summary:

- **Lanes**: `K` kick, `S` snare, `H` hi-hat closed, `O` hi-hat open, `R`
  ride, `C` crash, `T1`/`T2`/`T3` high/mid/floor tom.
- **Symbols** (one character per step): `.` rest, `x` normal hit, `X`
  accent, `g` ghost note.
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
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt   # pins pyyaml==6.0.3
.venv/bin/python3 generate.py               # writes to ~/Music/SightKick
```

Useful flags:

- `--out-dir PATH` — write elsewhere (defaults to `~/Music/SightKick`,
  SightKick's live library folder).
- `--only 03.03,04.04` — regenerate just a few exercises by id.
- `--dry-run` — print what would be written without touching disk.

`ffmpeg` must be on `PATH` (used to transcode both the generated click WAV
and the generated drums WAV into small mono OGG files). The 10 one-shot
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
container bytes can vary a few bytes run to run because libvorbis embeds
a random Ogg stream serial number by default; this has no audible or
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

Velocities: accent (`X`) 115, normal (`x`/`o`) 96, ghost (`g`) 40.
`notes.mid` is SMF format 1, 480 ticks/quarter, 2 tracks (a conductor
track with the tempo/time-signature map, and `PART DRUMS` with the notes).
Open hi-hat (`O`) is tracked separately in the notation for a future UI's
benefit but currently renders to the same MIDI note as closed hi-hat —
Clone Hero's pro-drums format has no distinct open-hat signal to target.

## Validation performed

- **Independent MIDI re-parse** (hand-written parser, not `generate.py`'s
  own writer) on 5 sample folders: confirms `PART DRUMS` track name,
  note-on count exactly matching the yaml pattern's hit count (including
  tom-marker notes), correct tempo (µs/quarter matches `bpm_target`), and
  a velocity spread of both 96/115 (and 40 where ghosts are used).
- **`scan-chart` (the app's own dependency)**: ran `parseChartFile` with
  `{pro_drums: true}` against every one of the 117 generated
  `notes.mid` files — **117/117 pass**: each has a `drums` track at
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

## Gamification data (no UI here — this feeds a future Lessons screen)

Every exercise carries:

- `stars_to_unlock`: recommended minimum total stars (summed across every
  prior exercise) before this one unlocks. It's simply the exercise's
  0-based position in the full curriculum order, so the whole curriculum
  is one linear unlock chain by default — a future UI is free to widen
  that (e.g. unlock a whole lesson at once, or let a player skip ahead
  once they've banked enough stars from _any_ mix of earlier exercises).
- `next`: the id of the next exercise in recommended order (`null` for
  the very last one, `18.02`).

### Suggested progression UX

- **Unlock chain**: render the 117 exercises as one path (or a
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
