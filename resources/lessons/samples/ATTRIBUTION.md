# Drum sample attribution

10 one-shot drum samples vendored here so `generate.py` can render
`drums.ogg` (the audible drum-pattern demo) offline, without shipping any
audio from the method book.

## Source

**Virtuosity Drums** by Versilian Studios / Studiorack
<https://github.com/studiorack/virtuosity-drums>

> Contemporary Jazz drum kit library, performed with sticks by drummer
> Austin McMahon on the house kit at Virtuosity Musical Instruments,
> Boston, MA. Part of the Versilian Community Sample Library (VCSL)
> family.

Repo commit used: `main` branch, tree `d41b734e9ce5edce1be375c262b2644de4387061`
(fetched 2026-08-05).

## License

**CC0 1.0 Universal** (public domain dedication) — full text at
[`LICENSE`](https://raw.githubusercontent.com/studiorack/virtuosity-drums/main/LICENSE)
in the source repo (Creative Commons' standard CC0 1.0 legal code). No
attribution is legally required; this file exists for traceability, not
because the license demands it.

## What was vendored and how

Raw source files are 48kHz/24-bit stereo FLAC, one file per drum/mic
position/velocity-layer/round-robin combination, using the "mid" mic
position (a single balanced room/overhead blend — the simplest coherent
one-mic-per-hit signal in a 6-mic-position library). For each instrument
the **highest available velocity layer** (loudest recorded hit) was
picked, first round-robin where multiple exist, on the reasoning that
`generate.py` synthesizes dynamics itself via gain scaling (see
`../generate.py`'s `VELOCITY`/`GAIN` tables) rather than by picking a
different recorded layer per MIDI velocity.

Each raw file was then, once, offline:

1. downmixed to mono, resampled to 44.1kHz,
2. trimmed of leading/trailing silence (`silenceremove`, -60dB/-45dB
   thresholds) so file size reflects only the audible transient+decay,
3. peak-normalized to **-12 dBFS** (consistent headroom across all 10
   samples so the generator's per-hit gain scaling — see `VELOCITY` in
   `generate.py` — sums correctly on unison/simultaneous hits without
   clipping),
4. given a 2ms fade-in and 15ms fade-out to avoid a digital click at the
   trim boundaries,
5. encoded 16-bit PCM mono WAV (no lossy compression — `drums.ogg` is
   only lossy-encoded once, at the very end, per exercise).

The one-time vendoring script (not part of the runtime pipeline, kept
here for reproducibility) lives at
[`_vendor_pipeline.py`](./_vendor_pipeline.py) -- see that file for the
exact ffmpeg filter chains and source-file selection. It re-downloads the
raw FLACs from GitHub, so it needs network access; the committed
`*.wav` files here do not.

## Sample → source mapping

| Vendored file       | Source file (`Samples/mid/...`)      | Lane(s) used for              |
| ------------------- | ------------------------------------ | ----------------------------- |
| `kick.wav`          | `kick/mid_kick_snon_vl4_rr1.flac`    | `K`                           |
| `snare.wav`         | `snare/mid_snare_center_vl36.flac`   | `S` (symbols `x`, `g`)        |
| `snare_rimshot.wav` | `snare/mid_snare_rimshot_vl12.flac`  | `S` (symbol `X`, accent only) |
| `hihat_closed.wav`  | `hh/mid_hh_closed_vl4_rr1.flac`      | `H`                           |
| `hihat_open.wav`    | `hh/mid_hh_open_vl4_rr1.flac`        | `O`                           |
| `ride.wav`          | `ride/mid_ride_ride_vl3_rr1.flac`    | `R`                           |
| `crash.wav`         | `crash/mid_crash_crash_vl3_rr1.flac` | `C`                           |
| `tom_high.wav`      | `htom/mid_htom_center_vl16.flac`     | `T1` (high tom)               |
| `tom_mid.wav`       | `ltom/mid_ltom_center_vl16.flac`     | `T2` (mid tom)                |
| `tom_low.wav`       | _derived_ (see below)                | `T3` (floor tom)              |

### Nearest-available-subset notes

- The curriculum's notation calls for kick, snare, closed/open hi-hat,
  ride, crash, and **three** toms (high/mid/floor). Virtuosity Drums is a
  jazz kit recorded with only **two** toms (high, low). `tom_low.wav`
  (floor tom, lane `T3`) is therefore **synthesized, not sourced**: it's
  `tom_mid.wav` pitched down 4 semitones (`asetrate`/`aresample`, ratio
  `2**(-4/12)`) — deterministic, offline, no new license surface, and
  musically sensible (floor toms sit a third or so below the mid tom;
  lowering playback rate also naturally lengthens the decay, which reads
  as "bigger drum").
- Snare **rimshot** was available in the source library and is used for
  accented (`X`) snare hits only, giving accents a distinct, authentically
  louder/brighter color instead of just being a louder copy of the same
  sample — a closer match to how drummers actually play accents.
- A **cross-stick** sample also exists in the source library
  (`snare/mid_snare_crossstick_*`) but was intentionally **not** vendored:
  `curriculum.yaml`'s notation legend states the ghost-note symbol `g` is
  "reused for cross-stick in ballad-style exercises (07.05, 07.06) ...
  distinguishable only via the exercise's coaching cue, not in the
  generated chart." Since the chart data itself cannot tell a true ghost
  note from a cross-stick occurrence, `g` is rendered uniformly as a quiet
  snare-center hit everywhere — matching what the MIDI data actually
  encodes (same note, same pad, only the velocity differs) rather than
  inventing an audio distinction the chart doesn't make.
- Hi-hat open/closed use two physically different recordings (not a
  single sample pitch/time-stretched), since closed vs. open hi-hat is a
  real timbral difference, not just a duration one.
