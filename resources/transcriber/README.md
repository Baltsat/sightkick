# SightKick Transcriber

Turns a YouTube URL or a local audio file into a complete Clone Hero style
drum-chart song folder: `notes.mid`, `song.ini`, `song.ogg`, `drums.ogg` (+
`bass.ogg`/`vocals.ogg`/`other.ogg`), and `album.jpg`.

This is a self-contained tool that owns everything under
`resources/transcriber/`. It does not touch `src/`, `package.json`, or
`docs/research/` — those belong to the Electron app being built against this
tool's contract.

## Contract

```
run.sh --url <youtube-url> --out <dir> [--stems-bin <path>] [--keep-stems] [--difficulty expert]
run.sh --audio <path>      --out <dir> [--stems-bin <path>] [--keep-stems] [--difficulty expert]
```

- `--out` is the **parent** directory. A subfolder named `<Artist> - <Title>`
  (sanitized of `\/:*?"<>|`, max 180 chars) is created inside it.
- `--stems-bin <path>`: path to a pre-installed demucs-split binary (see
  "Stem separation" below). If omitted, falls back to `demucs` from this
  tool's own venv.
- `--keep-stems`: also copy the raw separated stem files (pre-ogg-encoding)
  into `<song folder>/raw_stems/` for debugging/reuse. `drums.ogg` /
  `bass.ogg` / `vocals.ogg` / `other.ogg` in the song folder itself are
  always written regardless of this flag — separation is not optional, it
  materially improves transcription accuracy.
- `--difficulty expert`: **accepted for backward compatibility but has no
  effect.** Every run writes all four Clone Hero difficulties (Easy,
  Medium, Hard, Expert) into the single `PART DRUMS` track — see
  "Difficulty levels" below. The flag is kept so existing callers don't
  break; a future version may use it to select a subset.

### Progress protocol

Every progress/result line is written to **stdout**, one JSON object per
line, prefixed exactly `__SK_EVENT__ `. All logs/diagnostics go to
**stderr** — stdout carries nothing else, ever.

```
__SK_EVENT__ {"kind":"progress","stage":"download","percent":12.5,"message":"Downloading audio"}
__SK_EVENT__ {"kind":"complete","success":true,"songDir":"/abs/path/to/song folder"}
__SK_EVENT__ {"kind":"error","message":"human readable reason"}
```

`stage` is one of `download`, `separate`, `beats`, `transcribe`, `write`, in
that order (`--audio` runs skip `download`). `percent` is 0-100 for the
_whole run_, not per-stage — see the fixed stage-to-percent allocation in
`sk_transcriber/events.py` (`URL_STAGE_RANGES` / `AUDIO_STAGE_RANGES`).

Exit code 0 on success, non-zero on failure (a `kind:"error"` event is
always emitted first).

### Output folder contents

| File                                    | Notes                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes.mid`                             | Single `PART DRUMS` track, type-1 MIDI, PPQ 480, real tempo map (`set_tempo` events) + `time_signature` event. Carries all four difficulties (Easy 60-64, Medium 72-76, Hard 84-88, Expert 96-100, each kick/snare/yellow/blue/green); tom-vs-cymbal via Rock Band tom markers 110/111/112 (difficulty-independent). Per-hit velocity encoded on note-on. |
| `song.ini`                              | `[song]` with `name`, `artist`, `album`, `year`, `genre`, `charter` (empty), `auto_chart_tool = SightKick Transcriber`, `auto_chart = True`, `diff_drums` (0-6 estimate), `pro_drums = True`, `song_length` (ms), `delay = 0`.                                                                                                                            |
| `song.ogg`                              | Full mix, Ogg Vorbis.                                                                                                                                                                                                                                                                                                                                     |
| `drums.ogg`                             | Isolated drums stem, Ogg Vorbis.                                                                                                                                                                                                                                                                                                                          |
| `bass.ogg` / `vocals.ogg` / `other.ogg` | The remaining demucs stems, Ogg Vorbis.                                                                                                                                                                                                                                                                                                                   |
| `album.jpg`                             | YouTube thumbnail, only written for `--url` runs (no source image exists for `--audio`).                                                                                                                                                                                                                                                                  |
| `raw_stems/`                            | Only with `--keep-stems`: the pre-encoding stem files as produced by demucs.                                                                                                                                                                                                                                                                              |

## Pipeline

1. **download** (`--url` only) — `yt-dlp` (pinned, from this tool's own
   venv — **not** the system `yt-dlp`, which is known to 403 on some
   YouTube audio downloads) extracts best audio to wav and captures
   title/uploader/thumbnail/duration. Artist/Title are parsed from the
   video title (`Artist - Title` pattern, junk like `(Official Video)`
   stripped), falling back to the channel name as artist.
   For `--audio`, metadata comes from the file's own tags (via `ffprobe`)
   if present, else the filename.
2. **separate** — isolates a drums stem (+ bass/vocals/other) via demucs
   (see "Stem separation").
3. **beats** — beat/downbeat/tempo-map estimation on the full mix (see
   "Beat tracking").
4. **transcribe** — onset detection + 5-class classification on the
   isolated drums stem, with per-hit velocity recovered from local peak
   amplitude (see "Drum transcription").
5. **write** — gently quantizes onsets to the tempo grid (snaps only within
   a small tolerance so genuine swing/feel survives), maps classes to
   lanes, deduplicates same-lane onsets within 30ms, and writes all output
   files.

## Models, versions, and licenses

All dependencies are pinned in `pyproject.toml` / `uv.lock` (Python 3.12,
Apple Silicon macOS only — see `[tool.uv].environments`).

| Stage                   | Engine actually used                                                                                               | Version                              | License      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------ |
| Download                | `yt-dlp`                                                                                                           | 2026.7.4                             | Unlicense    |
| Separation (preferred)  | SightKick `demucs-split` binary (`--stems-bin`)                                                                    | pre-installed, htdemucs weights      | MIT (demucs) |
| Separation (fallback)   | `demucs` (htdemucs), this tool's venv                                                                              | 4.1.0, `torch` 2.13.0 (MPS)          | MIT          |
| Beats/tempo (preferred) | **Beat This!** (CP-JKU, ISMIR 2024)                                                                                | `beat-this` 1.1.0                    | **MIT**      |
| Beats/tempo (fallback)  | `librosa.beat.beat_track`                                                                                          | librosa 0.11.0                       | ISC          |
| Transcription           | classical fallback (spectral-flux onsets + rule-based band-energy/centroid/decay classifier) — see "Why not ADTOF" | this repo, `librosa`/`numpy`/`scipy` | —            |
| MIDI writing            | `mido`                                                                                                             | 1.3.3                                | MIT          |

**No non-commercial-licensed model is actually shipped or invoked by this
tool as built.** ADTOF's pretrained weights are CC BY-NC-SA 4.0, but ADTOF
was never installed (see below) — the transcription stage runs the
classical fallback instead, which has no such restriction. If a future
contributor wires ADTOF in, its CC BY-NC-SA 4.0 obligation must be
re-flagged here and the non-commercial restriction respected.

### Why not ADTOF

ADTOF (`https://github.com/MZehren/ADTOF`) is not published on PyPI (`pip
install adtof` / `ADTOF` both 404). Its reference implementation is
research code pinned to an older TensorFlow + madmom stack; installing it
would mean fighting Python-version and NumPy-2 incompatibilities on Apple
Silicon with no upstream wheels to fall back on. Per the task's own
fallback clause, we did not force this and implemented the classical
onset+classifier fallback instead (see `sk_transcriber/transcribe.py`). The
hook (`_transcribe_with_adtof`) is left in place for a future contributor
with a working ADTOF environment to wire in without changing the pipeline
shape — swapping engines does not change the 5-class `DrumHit` interface
the MIDI writer consumes.

### Stem separation — the SSL bug

The pre-installed `demucs-split` binary downloads model weights on first
run and dies with `SSL: CERTIFICATE_VERIFY_FAILED` unless
`SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE` point at a real CA bundle. We set both
to `/etc/ssl/cert.pem` in the subprocess environment before invoking it
(`sk_transcriber/separate.py`). If `--stems-bin` is absent (or the binary
fails for any reason), we fall back to `demucs` from this tool's own venv,
using MPS (Apple Silicon GPU) when available.

### Beat tracking

Beat This! is a joint beat+downbeat tracker (no madmom, no DBN needed — we
use its "minimal" postprocessor). We derive a piecewise-constant tempo map
from consecutive beat spacing (a new segment starts wherever BPM drifts
more than 4% from the current segment) and infer the time signature's
numerator from the median beat-count between consecutive downbeats. The
librosa fallback (used only if Beat This!/torch is unavailable) assumes
4/4 and approximates downbeats as every 4th detected beat.

### Drum transcription — classical fallback details

- **Onsets**: `librosa.onset.onset_detect` (spectral-flux envelope,
  backtracked to the true attack).
- **Classification**: a rule-based decision tree on each onset's 50ms
  window. The key move is computing a "high-frequency purity" ratio —
  energy above 2kHz vs. everything below 1200Hz — first: a hit that is
  almost purely high-frequency with no real body is a hi-hat/cymbal
  (split by decay ratio: fast decay = hi-hat, long ring = cymbal); a hit
  with real low/mid body is a kick, snare, or tom, split by zero-crossing
  rate (clean attack vs. noisy) and by the sub-bass-vs-120-250Hz energy
  ratio (kick's fundamental sits below 120Hz; a tom's, even a low floor
  tom, sits noticeably higher). Note: **spectral centroid alone is a poor
  gate for this** — a first version of this classifier gated kick on
  `centroid < 250Hz`, which is wrong (a kick's beater-click energy drags
  its energy-weighted centroid into the thousands of Hz even though most
  of its _energy_ is sub-bass) and misrouted nearly every real onset into
  "cymbal". Caught by validating on synthetic kick/snare/hihat/cymbal/tom
  signals with known ground truth before trusting the classifier on real
  audio — see the "Root-cause bug" note under Measured accuracy. Yields
  the same 5 classes ADTOF would (kick, snare, hi-hat, tom, cymbal).
- **Velocity**: per-hit peak amplitude in a 50ms window, normalized via the
  song's 5th/95th percentile amplitudes onto a 30-127 MIDI velocity range.
- **Lane sub-typing** (done once, in `midi_writer.py`, independent of which
  transcription engine ran): "cymbal" hits are split into ride (blue) vs.
  crash (green) by comparing each hit's spectral centroid to the song's
  median cymbal centroid; "tom" hits are bucketed into high/mid/low
  (yellow/blue/green, tom-marked) by centroid tertile. **This sub-typing
  step is the weakest link in the whole pipeline** — ride-vs-crash and
  tom-pitch are genuinely ambiguous from a single spectral-centroid
  heuristic, and it is not blind-tested below (only the coarser
  kick/snare/yellow/blue/green _lane_ placement is).
- **Dedup**: same-lane onsets within 30ms are merged (keeping the louder
  hit) — a real kit cannot retrigger the same pad that fast.
- **Quantization**: onset times are converted to a fractional beat position
  via the tempo map, then snapped to the nearest grid point (resolution
  depends on difficulty — see below) only if within ~0.06 beat (~25ms at
  120bpm); anything further from the grid is left at its true detected
  time so genuine swing/feel is not erased.

## Difficulty levels

`notes.mid` carries all four Clone Hero difficulties in one `PART DRUMS`
track. Easy/Medium/Hard are not the Expert transcription copy-pasted at a
lower note offset — each is a musical reduction (`sk_transcriber/difficulty.py`),
because an accurate chart that nobody can physically play ("не игрально")
is not a usable chart:

| Difficulty | Lanes                               | Quantize grid | How it's built                                                                                                                                                                                                                                                                                                               |
| ---------- | ----------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Easy       | kick, snare only                    | 1/4 note      | Backbone only: kick+snare filtered from the Expert transcription, heavily thinned.                                                                                                                                                                                                                                           |
| Medium     | kick, snare, yellow (hi-hat), crash | 1/8 note      | Backbone kept; hi-hat downsampled to a steady 1/8-note pulse (grid-snap-and-collapse, not random dropping); simple crash hits synthesized at approximate section starts (song start + each tempo-segment boundary, snapped to the nearest downbeat — a stand-in for real structure detection, which this tool doesn't have). |
| Hard       | all 5 lanes                         | 1/16 note     | Full Expert lane set, with dense fill bursts (4+ hits, <150ms apart, any lane) thinned to their first and last hit only — "keep first/last fill notes, drop inner sixteenths."                                                                                                                                               |
| Expert     | all 5 lanes                         | 1/16 note     | The full detected transcription.                                                                                                                                                                                                                                                                                             |

Every difficulty — Expert included — is then passed through an explicit
**playability gate** (`difficulty.CAPS`): a max sustained notes/sec (as a
minimum time gap between kept event-clusters), a max number of
simultaneous lanes (kick/snare prioritized over cymbals/toms when a chord
would exceed it), and a minimum gap between two hits in the _same_ lane.
We would rather drop a genuine note than emit an unplayable cluster:

| Difficulty | max notes/sec | max simultaneous lanes | min same-lane gap |
| ---------- | ------------- | ---------------------- | ----------------- |
| Easy       | 2.0           | 2                      | 200ms             |
| Medium     | 4.0           | 2                      | 120ms             |
| Hard       | 7.5           | 3                      | 80ms              |
| Expert     | 14.0          | 4                      | 30ms              |

Tom markers (110/111/112) are emitted once, driven by the Expert-level
kick/tom classification — they are difficulty-independent, since a
physical tom hit is the same performance no matter which difficulty's
note range is reading it.

## Venv bootstrap

`run.sh` execs `uv run --directory <this dir> python -m sk_transcriber
"$@"`. `uv run` creates/reuses `.venv/` next to `pyproject.toml`/`uv.lock`
and syncs it automatically — idempotent, and near-instant once already in
sync (`Resolved N packages ... Audited N packages`, no re-download). No
Python knowledge is required from the caller: `run.sh` only assumes `uv`
(checked first at `/Users/konstantinbaltsat/.local/bin/uv`, then `PATH`)
and `ffmpeg`/`ffprobe` on `PATH`. `.venv/` is gitignored — never commit it;
`uv.lock` **is** committed for reproducibility.

`run.sh` also sets `NUMBA_DISABLE_JIT=1`: librosa's numba-JIT peak-picking
path throws (and noisily retries) a `TypingError` against this
numba/NumPy-2 combination on Apple Silicon; the pure-Python fallback it
lands on either way is correct and plenty fast for onset arrays this
small, so we skip the noisy JIT attempt entirely rather than spam stderr
with ~130 tracebacks per run.

## Measured accuracy (step 4 of VERIFY)

Cross-validated `notes.mid` (Expert lanes) generated from
`/Users/konstantinbaltsat/Music/SightKick/Coldplay - Yellow (Harmonix)/song.opus`
against that folder's human-authored `notes.mid`, greedy-matched onsets at
±50ms:

| Lane (any = union) | precision | recall | F1        | ref count | generated count | matched |
| ------------------ | --------- | ------ | --------- | --------- | --------------- | ------- |
| any-lane           | 0.492     | 0.113  | **0.184** | 1112      | 256             | 126     |
| kick               | 0.000     | 0.000  | 0.000     | 289       | 0               | 0       |
| snare              | 0.431     | 0.323  | 0.369     | 164       | 123             | 53      |
| yellow (hi-hat)    | 0.014     | 0.002  | 0.003     | 528       | 73              | 1       |
| blue (ride)        | 0.367     | 0.108  | 0.167     | 102       | 30              | 11      |
| green (crash)      | 0.033     | 0.034  | 0.034     | 29        | 30              | 1       |

BPM: generated median 85.71 vs. reference median 86.73 (1.2% off) — tempo
tracking (Beat This!) is solid on this file even though transcription is
not (see below).

Per-difficulty note counts, generated vs. reference (reference counts are
each difficulty's _own_ full note range, not a subset of Expert):

| Difficulty | reference notes | generated notes | generated notes/min |
| ---------- | --------------- | --------------- | ------------------- |
| Easy       | 595             | 122             | 28.7                |
| Medium     | 964             | 197             | 46.4                |
| Hard       | 1046            | 256             | 60.3                |
| Expert     | 1112            | 256             | 60.3                |

**This F-measure is honest but not a clean read on the transcriber's real
capability — the specific `song.opus` file has a data-quality problem,
found and root-caused during this work, not caused by this tool:**

- Independently confirmed with `ffmpeg -af silencedetect`: this exact file
  has three unnaturally long silent gaps (5.5–16.6s, 40.9–55.2s,
  262.4–273.5s, ~36s total) that do not exist in the real Coldplay
  recording — almost certainly an artifact of however this specific
  Rock Band/Harmonix asset was ripped/exported.
- More importantly: **demucs fails to separate this file at all.** Tested
  three ways — the SightKick `demucs-split` binary, this tool's own venv
  fallback on MPS, and calling demucs's Python API directly on CPU,
  bypassing every line of this tool's own code — all three route ~98% of
  the signal energy into the catch-all `other` stem (verified by
  time-aligned cross-correlation, r≈0.98 between `other` and the original
  mix), leaving `drums`/`bass`/`vocals` at roughly -60dB, i.e. noise
  floor. A synthetic kick+hi-hat test signal run through the exact same
  code separates correctly (drums stem captures 99.9% of the input
  energy), which rules out a demucs-install or MPS-numerics bug on this
  machine. Whatever is atypical about this specific `.opus` encoding
  defeats htdemucs specifically for this file.
- Given a near-silent, effectively noise-floor "drums" stem, both onset
  detection (256 onsets found vs. ~1112 expected — even excluding the
  silent 36s, a clean 17-40s window shows 19 detected vs. 109 expected)
  and classification downstream of it are working on garbage input. This
  explains the near-zero kick recall and poor hi-hat recall above far
  better than "the classifier is bad" does.
- **Sanity check that the pipeline itself is healthy**: `--url
https://www.youtube.com/watch?v=dQw4w9WgXcQ` (a normal, freshly
  downloaded YouTube video, no known anomaly) separates completely
  normally — `drums.ogg` peak 0.676 vs. `song.ogg` peak 0.832, same order
  of magnitude, not -60dB down — and yields 1021 Expert-lane onsets over
  213s (4.79 notes/sec), a musically plausible density for a pop/rock
  drum part, versus Yellow's 0.94 notes/sec on the broken source.

**Root-cause bug found and fixed during this work** (documented for
transparency, not to pad the numbers): the first version of the classical
classifier gated "kick" on `spectral_centroid < 250Hz`, which is wrong —
even a kick's beater-click energy drags its energy-weighted centroid into
four figures, so that gate almost never fired. On a first pass, that bug
routed ~95% of all real onsets into "cymbal" regardless of their true
class. Caught by validating the classifier against five synthetic
kick/snare/hihat/cymbal/tom test signals with known ground truth (all 5
misclassified before the fix, all 5 correct after) before trusting it on
real audio — see "Drum transcription" above for the corrected decision
tree. The numbers in this section are from the fixed classifier.

### Wall-clock timing

| Run                                  | Song                           | Path                                                                                                     | Wall time |
| ------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------- | --------- |
| `--audio`, warm cache                | Yellow, 273.5s                 | venv-fallback demucs (MPS)                                                                               | 75.6s     |
| `--url`, warm cache                  | Rick Astley, 213.0s (~3.5 min) | venv-fallback demucs (MPS), yt-dlp download                                                              | 77.9s     |
| `--url`, cold cache (first ever run) | Rick Astley, 213.0s            | `--stems-bin`, incl. one-time model-weight downloads (~230MB total: beat_this + demucs) + video download | 266.2s    |

"Warm cache" = `uv sync` already done and model weights already downloaded
from a prior run (both are one-time costs — `.venv/` and
`~/.cache/torch/hub/checkpoints/` persist). A genuinely first-ever
invocation on a clean machine additionally pays for `uv sync` itself
(installing torch/demucs/librosa/etc., a few minutes depending on network)
on top of the cold-cache number above.

## Known limitations

- Onset-detection recall on real audio is unproven above ~5 notes/sec of
  true density — both verification songs happened to land below that (see
  "Measured accuracy"). The any-lane F1 of 0.184 measured against Yellow's
  ground truth is depressed by that file's separation failure (see above)
  and should not be read as "this tool's accuracy" in general; treat it as
  a floor, not a representative number, until re-measured against a
  healthy-separation ground-truth pair.
- Ride-vs-crash and tom-pitch sub-typing (98/99/100 sub-classification) is
  a heuristic on spectral centroid, not a learned classifier — see
  "Drum transcription" above.
- Easy/Medium/Hard are reduced from the Expert transcription by rule-based
  musical heuristics (see "Difficulty levels"), not independently
  transcribed or validated against human-authored lower difficulties
  beyond the note-count sanity check above.
- Medium's crash placement ("section starts") has no real song-structure
  detection behind it — it's tempo-segment boundaries snapped to the
  nearest downbeat, which correlates with but is not the same as chorus/
  verse boundaries.
- The classical fallback's time-signature detection defaults to 4/4 when
  Beat This! is unavailable; only the Beat This! path infers a numerator
  from downbeat spacing.
- `--audio` runs never write `album.jpg` (no source thumbnail exists).
- `--difficulty` is accepted but ignored (all four difficulties are always
  written) — see "Contract" above.
