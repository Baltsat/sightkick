# SightKick Method — Lesson Library Generator

A deterministic pipeline that turns `curriculum.yaml` (117 drumset exercises,
hand-authored in this repo) into playable SightKick song folders: a chart
(`notes.mid`), a click track (`song.ogg`), and metadata (`song.ini`).

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
- Lesson 6 ties/rests + basic-beat variations: ~20 → 6.
- Lesson 9 two-bar beats/fills/backbeat-shift variations: ~28 → 8.
- Lesson 10: the book's four progressive versions of one song ("Version
  1/2/3/Full") → one capstone "Full-Form Etude" that already contains the
  full intro/verse/chorus/bridge/outro arc.
- Lesson 11 16th-note groove options and variations: ~24 → 10.
- Lesson 12 new-rhythm patterns and grooves: ~32 → 5.
- Lesson 14 triplet/jazz-ride/comping family: ~40 → 9.
- Lesson 15 triplet accent-shift and jazz-fill variations: ~28 → 7.
- Lesson 16 shuffle/hi-hat-shuffle/jazz-waltz family: ~20 → 12 (kept more
  of these since each shuffle variant — rock 1, rock 2, Texas, straight,
  hi-hat shuffle, jazz waltz in one/in three — is a genuinely distinct,
  named piece of vocabulary, not a permutation).
- Lesson 17 12/8, 6/8, and cut-time beat variations: ~11 → 8.

117 exercises is the result — comfortably inside the "expect 50–120"
target while still touching every lesson, every meter (4/4, 3/4, 6/8,
12/8, 2/2 cut time), every subdivision (8th, 16th, triplet, shuffle), and
every technique (dynamics, ghost notes, cross-stick, flams, tom fills,
open hi-hat) the book introduces.

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

`ffmpeg` must be on `PATH` (used only to transcode the generated click WAV
into a small mono OGG — no drum sounds are ever synthesized or shipped;
the drummer supplies those on their own kit).

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
