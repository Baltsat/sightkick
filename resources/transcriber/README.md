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

| Stage                     | Engine actually used                                                                                      | Version                                                               | License      |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------ |
| Download                  | `yt-dlp`                                                                                                  | 2026.7.4                                                              | Unlicense    |
| Separation (preferred)    | SightKick `demucs-split` binary (`--stems-bin`)                                                           | pre-installed, htdemucs weights                                       | MIT (demucs) |
| Separation (fallback)     | `demucs` (htdemucs), this tool's venv                                                                     | 4.1.0, `torch` 2.13.0 (MPS)                                           | MIT          |
| Beats/tempo (preferred)   | **Beat This!** (CP-JKU, ISMIR 2024)                                                                       | `beat-this` 1.1.0                                                     | **MIT**      |
| Beats/tempo (fallback)    | `librosa.beat.beat_track`                                                                                 | librosa 0.11.0                                                        | ISC          |
| Transcription (preferred) | **DrumSep** (inagoy/drumsep, Hybrid-Demucs) + trivial per-substem onset detection — see "Why DrumSep"     | `49469ca8.th`, HF revision `18ebf41e59553e82e42cd92be2643671109c1e13` | **MIT**      |
| Transcription (fallback)  | classical (spectral-flux onsets + rule-based band-energy/centroid/decay classifier) — see "Why not ADTOF" | this repo, `librosa`/`numpy`/`scipy`                                  | —            |
| MIDI writing              | `mido`                                                                                                    | 1.3.3                                                                 | MIT          |

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
fallback clause, we did not force this. The hook (`_transcribe_with_adtof`)
is left in place for a future contributor with a working ADTOF environment
to wire in without changing the pipeline shape — swapping engines does not
change the 5-class `DrumHit` interface the MIDI writer consumes.

### Why DrumSep, not the model named in the brief

The brief asked for `MDX23C-DrumSep-aufr33-jarredou` via the
[`audio-separator`](https://pypi.org/project/audio-separator/) package (a
6-stem kick/snare/toms/hh/ride/crash separator). `audio-separator`
installs cleanly on this machine with CoreML/MPS acceleration — that part
worked. The checkpoint download did not: its upstream host,
`github.com/jarredou/models`, returns `404 Not Found` on both the direct
asset URL and the GitHub API for the repo itself — the repository is gone,
not a transient network blip. `audio-separator`'s bundled manifest still
points at it, so this fails for anyone until that manifest is updated
upstream.

Rather than stop at "the SOTA route failed" (the brief's own permitted
fallback), we found a live, MIT-licensed substitute: **DrumSep**
(`github.com/inagoy/drumsep`, MIT — a Hybrid-Demucs model trained
specifically to split an isolated drums stem into kick / snare / cymbals /
toms). It's a 4-stem model, not 6 — no separate ride/crash — but it is
real, it downloads, and it turns "classify this onset" into "which
sub-stem did this onset come from," which is a much stronger signal than
any hand-tuned spectral heuristic. We use a HuggingFace community mirror
of the checkpoint (`huggingface.co/vincewin/drumsep`, `49469ca8.th`,
167MB) since the original Colab/GDrive distribution isn't a stable direct
URL; the model itself and its weights are unchanged, only the hosting
differs. It is downloaded once, on first use, to
`~/.cache/sk_transcriber/drumsep_49469ca8.th`
(`sk_transcriber/transcribe.py::_get_drumsep_checkpoint`), the same
lazy-download pattern Beat This! already uses for its own weights.
The download URL is pinned to immutable HuggingFace revision
`18ebf41e59553e82e42cd92be2643671109c1e13`; every cached or newly downloaded
checkpoint must match SHA-256
`aefaa8543c9b9c75e22f5f32b53ab86dfe416457849af1383ff1aef83401423f`.
A mismatch deletes the suspect file and stops that run instead of loading it.

With DrumSep active, classification is nearly free: each sub-stem is
already single-instrument, so onset detection can run with a much more
sensitive threshold than the classical path safely allows (no
cross-instrument bleed left to false-positive on) and the resulting onset
_is_ the class. The only heuristic left is splitting the catch-all
"cymbals" sub-stem into hi-hat vs. ride/crash by decay ratio — the same
idea as the classical path's high-purity branch, just applied to a signal
that's already cymbal-only instead of a full drum mix.

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

| Difficulty | Lanes                               | Quantize grid | How it's built                                                                                                                                                                                                                              |
| ---------- | ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Easy       | kick, snare only                    | 1/4 note      | Beat-aware backbone: only kick/snare hits within 0.12 beat of an integer beat survive and are snapped to that beat. At dense tempos the 2-cluster/sec cap naturally keeps beats 1/3 before 2/4; slower passages can retain all four beats.  |
| Medium     | kick, snare, yellow (hi-hat), crash | 1/8 note      | Backbone kept; hi-hat downsampled and moved onto a steady 1/8-note pulse. Approximate section-start crashes are added only after the Expert transcription contains a real crash; an empty or crash-free transcription never fabricates one. |
| Hard       | all 5 lanes                         | 1/16 note     | Full Expert lane set, with dense fill bursts (4+ hits, <150ms apart, any lane) thinned to their first and last hit only — "keep first/last fill notes, drop inner sixteenths."                                                              |
| Expert     | all 5 lanes                         | 1/16 note     | The full detected transcription.                                                                                                                                                                                                            |

Every difficulty — Expert included — is then passed through an explicit
**playability gate** (`difficulty.CAPS`): a max sustained event-cluster rate
(the historical `max_nps` field counts a simultaneous chord once), a max number of
simultaneous lanes (kick/snare prioritized over cymbals/toms when a chord
would exceed it), and a minimum gap between two hits in the _same_ lane.
We would rather drop a genuine note than emit an unplayable cluster:

| Difficulty | max event-clusters/sec | max simultaneous lanes | min same-lane gap |
| ---------- | ---------------------- | ---------------------- | ----------------- |
| Easy       | 2.0                    | 2                      | 200ms             |
| Medium     | 4.0                    | 2                      | 120ms             |
| Hard       | 7.5                    | 3                      | 80ms              |
| Expert     | 14.0                   | 4                      | 30ms              |

Tom markers (110/111/112) are emitted once, driven by the Expert-level
kick/tom classification — they are difficulty-independent, since a
physical tom hit is the same performance no matter which difficulty's
note range is reading it.

## Venv bootstrap

`run.sh` keeps the source directory read-only and creates its environment at
`${SK_TRANSCRIBER_DATA:-$HOME/Library/Application Support/sight-kick/transcriber}/.venv`.
With `uv`, `UV_PROJECT_ENVIRONMENT` points there while `--project` reads the
bundled `pyproject.toml` and `uv.lock`. Without `uv`, Python 3.12+ creates the
same external venv and pip installs the pinned project dependencies. The
Electron caller supplies `SK_FFMPEG` for its packaged ffmpeg binary; direct
CLI callers may instead put ffmpeg on `PATH`. ffprobe is optional: the Python
wrapper uses a sibling/system ffprobe when present and otherwise reads duration
and best-effort local tags from `ffmpeg -i` output.

### YouTube auth wall (`SK_YTDLP_COOKIES`)

YouTube's bot-check ("Sign in to confirm you're not a bot") can block the
`--url` download stage entirely, independent of which video or player
client yt-dlp uses — this has been observed to affect _every_ video from
a given network/IP uniformly, not specific videos. There is no cookie-free
workaround; yt-dlp itself asks for `--cookies`/`--cookies-from-browser`.

Set `SK_YTDLP_COOKIES` to the path of a Netscape-format `cookies.txt` (e.g.
exported from a logged-in browser session via a cookies-export extension)
and the download stage will pass it to yt-dlp as `--cookies`. Unset by
default — no cookies are read or sent unless you opt in explicitly. This
is the caller's responsibility to supply; the transcriber never sources
cookies from a browser or app profile on its own.

## Measured accuracy (step 4 of VERIFY, extended in an accuracy sprint)

### The benchmark was wrong at first -- root-caused, then fixed

The first pass of this benchmark fed `song.opus` alone into the pipeline as
"the full mix" and got a dismal any-lane F1 of 0.184 against Yellow's
ground truth. Root-causing that (three independent methods: `ffmpeg
silencedetect`, cross-correlation, and calling demucs's Python API
directly, bypassing this tool's own code) found the real problem:
**`song.opus` in these Harmonix/SightKick library folders is not the full
mix.** It's a backing/crowd layer; the actual instruments ship as separate
stems (`drums_1/2/3.opus`, `guitar.opus`, `vocals.opus`, `rhythm.opus`,
`keys.opus`). Feeding `song.opus` alone starved demucs of ~98% of the
song's actual energy -- a benchmark-construction bug, not a transcriber
bug. Confirmed once fixed: separating a proper reconstruction (`ffmpeg
amix` of every instrument stem in the folder) behaves completely normally
(drums stem captures real energy, comparable magnitude to the mix), and F1
jumps from 0.184 to the 0.6-0.75 range on the same song with the same code.

**Methodology below, applied to 4 library songs with their own
`notes.mid`:**

- **Full mix** = `ffmpeg amix` of every instrument stem in the folder
  (`song`/`song.ogg` + `guitar` + `vocals` + `drums_*` + `rhythm` + `keys`,
  whichever exist), fed into the _unmodified shipped_ `run.sh --audio` --
  this is "end-to-end" (e2e): separate -> beats -> transcribe -> write.
- **Transcription-only** = the folder's own drums stem(s) (`drums_1`+
  `drums_2`[+`drums_3`], or a single `drums.opus`/`drums.ogg`) fed
  directly into the transcribe stage in-process, skipping demucs
  separation entirely -- isolates the classifier/DrumSep from separation
  quality. Beats/tempo still come from the reconstructed full mix (a
  drums-only stem has no reliable tempo information beyond the drum
  pattern itself).
- Both are compared to each song's own `notes.mid` at +/-50ms, same greedy
  onset matching as before.
- Benchmark harness: a standalone script (not shipped, not committed --
  test tooling against a personal music library, not part of the
  product); its methodology is documented here so the numbers are
  reproducible in spirit even without the script itself.

**Songs**: Coldplay - Yellow (Harmonix, human-charted); Queen - Another
One Bites the Dust (Harmonix, human-charted); Queen - Bohemian Rhapsody
(Harmonix, human-charted, 6 minutes, complex tempo/section changes); Kygo
& OneRepublic - Lose Somebody (**chart is itself AI-generated** -- its
`song.ini` says `auto_chart_tool = STRUM (OCTAVE AI auto-charter)`, and
its tempo map has 435 segments for a single song, an unusually jittery
result -- treat this one as agreement-with-another-AI, not
agreement-with-a-human, and weight it accordingly).

### Before (classical fallback) vs. after (DrumSep) -- any-lane F1

| Song                       | Classical e2e | Classical transcr.-only | DrumSep e2e | DrumSep transcr.-only |
| -------------------------- | ------------- | ----------------------- | ----------- | --------------------- |
| Yellow                     | 0.620         | 0.620                   | **0.731**   | **0.754**             |
| Another One Bites the Dust | 0.594         | 0.706                   | **0.701**   | **0.795**             |
| Bohemian Rhapsody          | 0.570         | 0.587                   | **0.644**   | **0.671**             |
| Lose Somebody (AI chart)   | 0.393         | 0.414                   | **0.481**   | **0.499**             |
| **average**                | **0.544**     | **0.582**               | **0.639**   | **0.680**             |

DrumSep improves every single cell: e2e by +9.5pp average, transcription-only
by +9.8pp average. Per-lane breakdown, DrumSep e2e (the number that
matters -- what a real `--url`/`--audio` run actually produces):

| Song                       | kick F1 | snare F1 | hi-hat F1 | blue(ride) F1 | green(crash) F1 |
| -------------------------- | ------- | -------- | --------- | ------------- | --------------- |
| Yellow                     | 0.928   | 0.728    | 0.088     | 0.173         | 0.027           |
| Another One Bites the Dust | 0.397   | 0.471    | 0.499     | 0.000         | 0.000           |
| Bohemian Rhapsody          | 0.801   | 0.438    | 0.228     | 0.226         | 0.217           |
| Lose Somebody              | 0.280   | 0.304    | 0.306     | 0.037         | 0.022           |

**Honest pattern, not a flattering one**: kick and snare are the strong
lanes (kick F1 up to 0.93; the exception, Another One Bites the Dust at
0.397 kick, is a _separation_-stage loss -- its transcription-only kick F1
is 0.642, so the isolated substem finds the kicks fine, but demucs's first
pass on that particular mix loses some of them before DrumSep ever sees
them). **Hi-hat, ride, and crash remain the weak lanes** -- see "Known
limitations" for why (a sensitivity trade-off we made and didn't have time
to fully resolve). Lose Somebody's numbers are also depressed by its own
ground truth being another AI's imperfect auto-chart (435 tempo segments)
and by DrumSep -- trained on acoustic kits -- generalizing worse to Kygo's
electronic/programmed drum production.

BPM: Beat This! tracks tempo correctly (<2% off) on 3 of 4 songs. On
Bohemian Rhapsody it locks to exactly 2x the reference tempo (142.86 vs.
71.38 BPM) -- a classic beat-tracker octave error, unsurprising on a song
with extreme, deliberate tempo/meter changes (ballad -> opera -> hard rock
-> outro). This is a beats-stage limitation, unrelated to the
transcription upgrade below.

### DrumSep sensitivity tuning (see "Why DrumSep" above for the model choice itself)

The brief named `MDX23C-DrumSep-aufr33-jarredou` via `audio-separator`.
That checkpoint's host repo (`github.com/jarredou/models`) is gone -- 404
on the direct asset URL and on the GitHub API for the repo itself, not a
timeout. We substituted **DrumSep** (`github.com/inagoy/drumsep`,
Hybrid-Demucs, **MIT**), a 4-stem (kick/snare/cymbals/toms) version of the
same idea, via a HuggingFace community mirror of its checkpoint. Full
reasoning in "Why DrumSep, not the model named in the brief" above.

Kick/snare substems from this model are clean; run at a sensitive onset
threshold (delta=0.035) they're the strongest lanes in the whole table.
The toms/cymbals substems are noisier -- a first pass at the same
sensitivity produced enormous tom/cymbal over-triggering (e.g. Another One
Bites the Dust: 155 generated "blue" notes against a reference of 10; 195
generated "green" against a reference of 0). Dropping _only_ those two
substems to the classical fallback's threshold (delta=0.07) cut the
false-positive rate substantially (measured on that song: 638->149 raw tom
onsets) and is what the numbers above reflect. This is an incomplete fix,
not a solved problem -- see "Known limitations".

### Wall-clock timing

| Run                                  | Song                               | Path                                                                                                        | Wall time                                                                       |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--audio`, warm cache, DrumSep       | Yellow, 273.5s                     | demucs (MPS) -> Beat This! -> DrumSep                                                                       | 63.8s                                                                           |
| `--audio`, warm cache, DrumSep       | Another One Bites the Dust, 222.6s | same                                                                                                        | 56.3s                                                                           |
| `--audio`, warm cache, DrumSep       | Lose Somebody, 200.7s              | same                                                                                                        | 46.5s                                                                           |
| `--audio`, warm cache, DrumSep       | Bohemian Rhapsody, 360.0s (6 min)  | same                                                                                                        | 78.1s                                                                           |
| `--url`, cold cache (first ever run) | Rick Astley, 213.0s                | `--stems-bin`, incl. one-time model downloads (beat_this + demucs + DrumSep, ~400MB total) + video download | ~290s (measured 266.2s pre-DrumSep + DrumSep's own ~25s one-time download/load) |

"Warm cache" = `uv sync`, demucs/Beat This!/DrumSep weights all already on
disk (all one-time costs: `.venv/`, `~/.cache/torch/hub/checkpoints/`,
`~/.cache/sk_transcriber/`). Even the longest song (Bohemian Rhapsody, 6
minutes) transcribes in under 90 seconds warm. A genuinely first-ever
invocation on a clean machine additionally pays for `uv sync` itself (a
few minutes, network-dependent) on top of the cold-cache number above.

## Known limitations

- **Hi-hat, ride, and crash detection is still the weakest part of the
  pipeline even with DrumSep** (measured F1 as low as 0.03-0.23 per song,
  see "Measured accuracy"). Root cause: our own tuning trade-off. DrumSep's
  "cymbals" substem covers hi-hat AND ride AND crash together (this is a
  4-stem model, not the 6-stem one the brief named); hi-hat needs a
  _sensitive_ onset threshold (it fires constantly, every 8th/16th note)
  while ride/crash need a _strict_ one (rare, loud, easily confused with
  bleed) -- but both currently share one threshold setting per substem.
  We lowered that shared threshold to fix tom/cymbal false positives,
  which necessarily also suppressed real hi-hat recall. A real fix needs
  either a genuinely 6-stem separator (ride/crash split from hi-hat, as
  the originally-named-but-unreachable model would have given) or a
  per-lane onset threshold within the cymbals substem instead of one
  shared value.
- Ride-vs-crash sub-typing within DrumSep's "cymbals" substem still uses
  the same decay-ratio heuristic as the classical fallback (see "Drum
  transcription"), just on a cleaner signal -- not a learned classifier.
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
- The `--url` download stage has no built-in retry or bypass for YouTube's
  bot-check wall ("Sign in to confirm you're not a bot"); when a network/IP
  hits it, every video fails identically regardless of player client or
  yt-dlp version. The only way through is `SK_YTDLP_COOKIES` (see "Venv
  bootstrap" above) — there is no cookie-free fix.
