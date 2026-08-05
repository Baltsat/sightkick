#!/usr/bin/env python3
"""SightKick Method lesson generator.

Deterministically turns resources/lessons/curriculum.yaml into playable
SightKick song folders: notes.mid (PART DRUMS, expert difficulty),
song.ogg (a synthesized click/metronome track), drums.ogg (a rendering of
the exercise's own pattern using real drum one-shot samples, sample-
accurately aligned with song.ogg), and song.ini.

Usage:
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python3 generate.py
    .venv/bin/python3 generate.py --out-dir /some/other/dir --only 03.03,04.04
    .venv/bin/python3 generate.py --dry-run

Requires: Python 3.12, PyYAML (see requirements.txt), ffmpeg on PATH (used
to transcode both the click WAV and the drums WAV into small mono OGG
files), and the vendored one-shot samples in resources/lessons/samples/
(see samples/ATTRIBUTION.md -- CC0-licensed, fetched once, committed to
git; no network access needed at generation time).

See README.md for the full design writeup (MIDI note map, notation
legend, gamification fields, duration/loop math, and what was merged from
the source method book).
"""

from __future__ import annotations

import argparse
import math
import shutil
import struct
import subprocess
import sys
import warnings
import wave
from pathlib import Path

with warnings.catch_warnings():
    # audioop is stdlib in Python 3.12 (this project's pinned version) and
    # gives C-speed PCM mixing/gain with no extra dependency; it's slated
    # for removal in 3.13, which is a future-portability note, not a
    # problem for this pinned interpreter -- silence the noise, don't
    # paper over a real issue.
    warnings.simplefilter("ignore", DeprecationWarning)
    import audioop

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit(
        "PyYAML is required. Set up the pinned local venv first:\n"
        "  python3 -m venv resources/lessons/.venv\n"
        "  resources/lessons/.venv/bin/pip install -r resources/lessons/requirements.txt\n"
        "then re-run with resources/lessons/.venv/bin/python3 generate.py"
    )

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# constants (must match curriculum.yaml's meta block -- see notation legend)
# ---------------------------------------------------------------------------

TICKS_PER_QUARTER = 480
DRUM_CHANNEL = 9  # 0-indexed -> General MIDI percussion channel 10

# expert-difficulty PART DRUMS note numbers, per lane
LANE_NOTE = {
    "K": 96,
    "S": 97,
    "H": 98,
    "O": 98,
    "T1": 98,
    "R": 99,
    "T2": 99,
    "C": 100,
    "T3": 100,
}
# tom-marker note numbers -- a long note here means "the 98/99/100 hits
# under this span are a tom, not a cymbal"
TOM_MARKER_NOTE = {"T1": 110, "T2": 111, "T3": 112}
TOM_LANES = set(TOM_MARKER_NOTE)
CYMBAL_LANES = {"H", "O", "R", "C"}
# which cymbal lane(s) share a pad with which tom lane
PAD_CONFLICT_PAIRS = [("H", "T1"), ("O", "T1"), ("R", "T2"), ("C", "T3")]

VELOCITY = {"X": 115, "x": 96, "o": 96, "g": 40}
HIT_LENGTH_TICKS = 10  # short, percussive note-on/off length for actual hits

CLICK_SAMPLE_RATE = 22050
CLICK_NORMAL_HZ = 1500.0
CLICK_ACCENT_HZ = 2200.0
CLICK_DURATION_S = 0.015
CLICK_NORMAL_AMP = 0.55
CLICK_ACCENT_AMP = 0.85

MIN_EXERCISE_SECONDS = 30.0
MAX_EXERCISE_SECONDS = 90.0

# ---------------------------------------------------------------------------
# drums.ogg: real drum one-shots (see samples/ATTRIBUTION.md -- CC0) placed
# at each pattern hit's exact tick time with velocity-scaled gain, mixed at
# C speed via the stdlib `audioop` module (no numpy dependency).
# ---------------------------------------------------------------------------

DRUM_SAMPLE_RATE = 44100
DRUM_OGG_BITRATE = "64k"
SAMPLES_DIR = HERE / "samples"

# one vendored one-shot per lane, except the snare which has a dedicated
# rimshot sample used only for accented hits (see _sample_key_for)
SAMPLE_FILES = {
    "kick": "kick.wav",
    "snare": "snare.wav",
    "snare_rimshot": "snare_rimshot.wav",
    "hihat_closed": "hihat_closed.wav",
    "hihat_open": "hihat_open.wav",
    "ride": "ride.wav",
    "crash": "crash.wav",
    "tom_high": "tom_high.wav",
    "tom_mid": "tom_mid.wav",
    "tom_low": "tom_low.wav",
}

LANE_SAMPLE = {
    "K": "kick",
    "S": "snare",
    "H": "hihat_closed",
    "O": "hihat_open",
    "R": "ride",
    "C": "crash",
    "T1": "tom_high",
    "T2": "tom_mid",
    "T3": "tom_low",
}

# linear gain per notation symbol, derived from the same VELOCITY table
# that drives notes.mid (0-127 MIDI velocity -> 0.0-1.0 amplitude scale)
GAIN = {sym: vel / 127.0 for sym, vel in VELOCITY.items()}

DEFAULT_OUT_DIR = Path.home() / "Music" / "SightKick"
FOLDER_PREFIX = "SightKick Method - Lesson"


# ---------------------------------------------------------------------------
# curriculum loading
# ---------------------------------------------------------------------------


def load_curriculum(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def iter_exercises(curriculum: dict):
    """Yields (unit, lesson, exercise) dict triples in curriculum order."""
    for unit in curriculum["units"]:
        for lesson in unit["lessons"]:
            for exercise in lesson["exercises"]:
                yield unit, lesson, exercise


# ---------------------------------------------------------------------------
# meter helpers
# ---------------------------------------------------------------------------


def bar_ticks_for(time_signature: list[int]) -> int:
    num, den = time_signature
    quarters_per_bar = num * 4 / den
    ticks = quarters_per_bar * TICKS_PER_QUARTER
    if abs(ticks - round(ticks)) > 1e-6:
        raise ValueError(
            f"time signature {time_signature} does not divide evenly into ticks"
        )
    return round(ticks)


def beat_pulses_for(time_signature: list[int]) -> int:
    """Number of metronome pulses per bar (the *felt* beat, not the notated
    subdivision) -- e.g. 4 for 4/4, 3 for 3/4, 4 for 12/8 (compound meter:
    one pulse per dotted quarter), 2 for 6/8, 2 for 2/2 (cut time)."""
    num, den = time_signature
    if den == 8 and num % 3 == 0:
        return num // 3
    return num


# ---------------------------------------------------------------------------
# timeline construction: turns an exercise's yaml bars into an absolute
# list of (tick, lane, symbol) hits, including a prepended count-in bar and
# enough repeats of the authored block to land in [30, 90] seconds.
# ---------------------------------------------------------------------------


class Timeline:
    def __init__(self):
        self.hits: list[tuple[int, str, str]] = []  # (tick, lane, symbol)
        self.pulse_ticks: list[tuple[int, bool]] = []  # (tick, is_downbeat)
        self.total_ticks: int = 0
        self.repeats: int = 0


def build_timeline(exercise: dict) -> Timeline:
    ts = exercise["time_signature"]
    bpm = exercise["bpm_target"]
    bar_ticks = bar_ticks_for(ts)
    pulses = beat_pulses_for(ts)
    pulse_step_ticks = bar_ticks / pulses
    if abs(pulse_step_ticks - round(pulse_step_ticks)) > 1e-6:
        raise ValueError(
            f"{exercise['id']}: pulses {pulses} do not divide bar_ticks {bar_ticks} evenly"
        )
    pulse_step_ticks = round(pulse_step_ticks)

    tl = Timeline()
    cursor = 0

    # -- count-in: one bar of hi-hat pulses, downbeat accented --
    for p in range(pulses):
        tl.pulse_ticks.append((cursor + p * pulse_step_ticks, p == 0))
        tl.hits.append((cursor + p * pulse_step_ticks, "H", "X" if p == 0 else "x"))
    cursor += bar_ticks

    # -- figure out how many times to repeat the authored block so the
    #    exercise (excluding count-in) lands in [30, 90] seconds --
    block_bars = exercise["bars"]
    block_ticks = sum(_bar_ticks_from_content(b, ts) for b in block_bars)
    block_seconds = block_ticks / TICKS_PER_QUARTER * 60 / bpm
    repeats = max(1, math.ceil(MIN_EXERCISE_SECONDS / block_seconds))
    if repeats > 1 and repeats * block_seconds > MAX_EXERCISE_SECONDS:
        repeats -= 1
    tl.repeats = repeats

    for _ in range(repeats):
        for bar in block_bars:
            bar_len = _bar_ticks_from_content(bar, ts)
            _validate_bar(exercise["id"], bar)
            step_count = len(next(iter(bar.values())))
            step_ticks = bar_len / step_count
            if abs(step_ticks - round(step_ticks)) > 1e-6:
                raise ValueError(
                    f"{exercise['id']}: {step_count} steps do not divide bar evenly"
                )
            step_ticks = round(step_ticks)

            for p in range(pulses):
                tl.pulse_ticks.append((cursor + p * pulse_step_ticks, p == 0))

            for lane, pattern in bar.items():
                for i, sym in enumerate(pattern):
                    if sym == ".":
                        continue
                    tl.hits.append((cursor + i * step_ticks, lane, sym))
            cursor += bar_len

    tl.total_ticks = cursor
    return tl


def _bar_ticks_from_content(bar: dict, ts: list[int]) -> int:
    """A bar's tick length is derived from the time signature -- every bar
    in a block is a full bar of that meter, regardless of its own step
    resolution (which only controls how finely that bar subdivides it)."""
    return bar_ticks_for(ts)


def _validate_bar(exercise_id: str, bar: dict) -> None:
    lengths = {len(v) for v in bar.values()}
    if len(lengths) != 1:
        raise ValueError(f"{exercise_id}: bar lanes have mismatched step counts: {bar}")
    for lane, pattern in bar.items():
        for ch in pattern:
            if ch not in ".xXog":
                raise ValueError(
                    f"{exercise_id}: lane {lane} has invalid symbol {ch!r} in {pattern!r}"
                )
    # same-tick pad conflicts: a cymbal lane and its paired tom lane can
    # never both hit at the same step, since they share one MIDI pad.
    for cymbal_lane, tom_lane in PAD_CONFLICT_PAIRS:
        if cymbal_lane in bar and tom_lane in bar:
            for i, (c1, c2) in enumerate(zip(bar[cymbal_lane], bar[tom_lane])):
                if c1 != "." and c2 != ".":
                    raise ValueError(
                        f"{exercise_id}: {cymbal_lane} and {tom_lane} both hit at step {i} "
                        "-- they share one MIDI pad and can't sound at the same instant"
                    )


# ---------------------------------------------------------------------------
# MIDI (SMF) writer -- pure stdlib, deterministic, no external dependency
# ---------------------------------------------------------------------------


def _write_varlen(value: int) -> bytes:
    chunks = [value & 0x7F]
    value >>= 7
    while value:
        chunks.insert(0, (value & 0x7F) | 0x80)
        value >>= 7
    return bytes(chunks)


def _track_chunk(events: list[tuple[int, bytes]]) -> bytes:
    """events: list of (absolute_tick, raw_event_bytes), already sorted."""
    out = bytearray()
    prev_tick = 0
    for tick, raw in events:
        delta = tick - prev_tick
        out += _write_varlen(delta)
        out += raw
        prev_tick = tick
    body = bytes(out)
    return b"MTrk" + struct.pack(">I", len(body)) + body


def _meta(kind: int, data: bytes) -> bytes:
    return bytes([0xFF, kind]) + _write_varlen(len(data)) + data


def build_conductor_track(
    bpm: int, time_signature: list[int], total_ticks: int
) -> bytes:
    num, den = time_signature
    dd = int(round(math.log2(den)))
    time_sig = _meta(0x58, bytes([num, dd, 24, 8]))
    micros_per_quarter = round(60_000_000 / bpm)
    tempo = _meta(0x51, struct.pack(">I", micros_per_quarter)[1:])  # 3-byte big-endian
    end_of_track = _meta(0x2F, b"")
    events = [
        (0, time_sig),
        (0, tempo),
        (total_ticks, end_of_track),
    ]
    return _track_chunk(events)


def build_drums_track(timeline: Timeline) -> bytes:
    events: list[tuple[int, int, int, bytes]] = []  # (tick, order, note, raw)
    # order: note-offs (0) sort before note-ons (1) at an identical tick

    def note_on(tick, note, vel):
        events.append((tick, 1, note, bytes([0x90 | DRUM_CHANNEL, note, vel])))

    def note_off(tick, note):
        events.append((tick, 0, note, bytes([0x80 | DRUM_CHANNEL, note, 0])))

    for tick, lane, sym in timeline.hits:
        note = LANE_NOTE[lane]
        vel = VELOCITY[sym]
        note_on(tick, note, vel)
        note_off(tick + HIT_LENGTH_TICKS, note)

        if lane in TOM_LANES:
            marker_note = TOM_MARKER_NOTE[lane]
            # span the marker for a full step so consecutive tom hits on
            # the same lane produce one continuous covered region
            note_on(tick, marker_note, 100)
            note_off(tick + _marker_span_ticks(timeline, tick), marker_note)

    name_event = (0, -1, -1, _meta(0x03, b"PART DRUMS"))
    end_event = (timeline.total_ticks, 2, 999, _meta(0x2F, b""))

    ordered = sorted(events, key=lambda e: (e[0], e[1], e[2]))
    all_events = [name_event] + ordered + [end_event]
    return _track_chunk([(e[0], e[3]) for e in all_events])


def _marker_span_ticks(timeline: Timeline, tick: int) -> int:
    # a tom marker should cover the note's own short duration at minimum;
    # HIT_LENGTH_TICKS is already tiny and never collides with the next
    # step at the resolutions used in this curriculum (min step = 120
    # ticks for 16th notes at 480 ticks/quarter), so reuse it directly.
    return HIT_LENGTH_TICKS


def build_notes_mid(exercise: dict, timeline: Timeline) -> bytes:
    header = b"MThd" + struct.pack(">IHHH", 6, 1, 2, TICKS_PER_QUARTER)
    conductor = build_conductor_track(
        exercise["bpm_target"], exercise["time_signature"], timeline.total_ticks
    )
    drums = build_drums_track(timeline)
    return header + conductor + drums


# ---------------------------------------------------------------------------
# click track (WAV synthesis, then ffmpeg transcode to small mono OGG)
# ---------------------------------------------------------------------------


def _click_burst(amplitude: float, freq_hz: float, n_samples: int) -> list[int]:
    samples = []
    for i in range(n_samples):
        t = i / CLICK_SAMPLE_RATE
        # quick linear fade-out avoids a pop at the end of the burst
        fade = 1.0 - (i / n_samples)
        v = amplitude * fade * math.sin(2 * math.pi * freq_hz * t)
        samples.append(int(max(-1.0, min(1.0, v)) * 32767))
    return samples


def build_click_wav_bytes(timeline: Timeline, bpm: int, out_path: Path) -> None:
    # buffer length matches song_length (== notes.mid's duration) exactly,
    # so ffprobe's audio duration and song.ini's song_length stay in sync;
    # a click burst landing right at the end is simply truncated by the
    # bounds check below (its burst is only ~15ms, well inside tolerance).
    total_seconds = timeline.total_ticks / TICKS_PER_QUARTER * 60 / bpm
    total_samples = int(round(total_seconds * CLICK_SAMPLE_RATE))
    buffer = [0] * total_samples
    burst_len = int(CLICK_DURATION_S * CLICK_SAMPLE_RATE)

    for tick, is_downbeat in timeline.pulse_ticks:
        t_seconds = tick / TICKS_PER_QUARTER * 60 / bpm
        start = int(round(t_seconds * CLICK_SAMPLE_RATE))
        freq = CLICK_ACCENT_HZ if is_downbeat else CLICK_NORMAL_HZ
        amp = CLICK_ACCENT_AMP if is_downbeat else CLICK_NORMAL_AMP
        burst = _click_burst(amp, freq, burst_len)
        for i, s in enumerate(burst):
            idx = start + i
            if idx >= len(buffer):
                break
            mixed = buffer[idx] + s
            buffer[idx] = max(-32767, min(32767, mixed))

    with wave.open(str(out_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(CLICK_SAMPLE_RATE)
        w.writeframes(struct.pack(f"<{len(buffer)}h", *buffer))


def wav_to_ogg(
    wav_path: Path, ogg_path: Path, sample_rate: int, bitrate: str = "48k"
) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-c:a",
            "libvorbis",
            "-b:a",
            bitrate,
            str(ogg_path),
        ],
        check=True,
    )


# ---------------------------------------------------------------------------
# drums.ogg: real one-shot samples placed at each hit's exact tick time
# ---------------------------------------------------------------------------

_sample_pcm_cache: dict[str, bytes] = {}
_scaled_sample_cache: dict[tuple[str, str], bytes] = {}


def _load_sample_pcm(key: str) -> bytes:
    """Reads a vendored one-shot as raw 16-bit mono PCM, once, cached for
    the life of the process. Fails loudly (not silently) if a sample is
    missing or isn't the mono/16-bit/44.1kHz format the mixer assumes --
    every vendored file must be pre-converted to exactly that format by
    samples/_vendor_pipeline.py, so a mismatch means the samples/ dir was
    tampered with, not something to paper over here."""
    if key not in _sample_pcm_cache:
        path = SAMPLES_DIR / SAMPLE_FILES[key]
        if not path.exists():
            sys.exit(
                f"missing drum sample: {path}\n"
                "Run resources/lessons/samples/_vendor_pipeline.py once, or "
                "restore samples/*.wav from git."
            )
        with wave.open(str(path), "rb") as w:
            if (w.getnchannels(), w.getsampwidth(), w.getframerate()) != (
                1,
                2,
                DRUM_SAMPLE_RATE,
            ):
                sys.exit(
                    f"{path} is not mono/16-bit/{DRUM_SAMPLE_RATE}Hz PCM "
                    f"(got {w.getnchannels()}ch/{w.getsampwidth() * 8}bit/{w.getframerate()}Hz) "
                    "-- re-run samples/_vendor_pipeline.py"
                )
            _sample_pcm_cache[key] = w.readframes(w.getnframes())
    return _sample_pcm_cache[key]


def _scaled_sample(key: str, sym: str) -> bytes:
    """Gain-scaled copy of a one-shot for one notation symbol's velocity,
    computed once via audioop's C-level multiply (fixed, non-random
    rounding -- deterministic across runs) and cached."""
    cache_key = (key, sym)
    if cache_key not in _scaled_sample_cache:
        pcm = _load_sample_pcm(key)
        _scaled_sample_cache[cache_key] = audioop.mul(pcm, 2, GAIN[sym])
    return _scaled_sample_cache[cache_key]


def _sample_key_for(lane: str, sym: str) -> str:
    # accented snare hits get the rimshot one-shot instead of a louder
    # copy of the center hit -- a real timbral change, not just gain
    # (see samples/ATTRIBUTION.md). Every other lane/symbol combination
    # uses its single vendored one-shot, scaled by GAIN[sym] only.
    if lane == "S" and sym == "X":
        return "snare_rimshot"
    return LANE_SAMPLE[lane]


def build_drums_wav_bytes(timeline: Timeline, bpm: int, out_path: Path) -> None:
    """Mixes every hit in the timeline (including the count-in hi-hat
    pulses -- they're already in timeline.hits) into one mono PCM buffer,
    sample-accurately aligned to the same tick->seconds conversion
    build_click_wav_bytes uses, so drums.ogg and song.ogg always end up
    the same duration. Mixing is done with audioop.add, which saturates
    (clamps) on overflow instead of wrapping -- deterministic, no
    dithering, no random source anywhere in the path."""
    total_seconds = timeline.total_ticks / TICKS_PER_QUARTER * 60 / bpm
    total_samples = int(round(total_seconds * DRUM_SAMPLE_RATE))
    buffer = bytearray(total_samples * 2)  # silence (zero bytes)

    for tick, lane, sym in timeline.hits:
        frag = _scaled_sample(_sample_key_for(lane, sym), sym)
        t_seconds = tick / TICKS_PER_QUARTER * 60 / bpm
        start = int(round(t_seconds * DRUM_SAMPLE_RATE))
        offset = start * 2
        if offset >= len(buffer):
            continue
        end = min(offset + len(frag), len(buffer))
        if end <= offset:
            continue
        frag = frag[: end - offset]
        mixed = audioop.add(bytes(buffer[offset:end]), frag, 2)
        buffer[offset:end] = mixed

    with wave.open(str(out_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(DRUM_SAMPLE_RATE)
        w.writeframes(bytes(buffer))


# ---------------------------------------------------------------------------
# song.ini
# ---------------------------------------------------------------------------


def build_song_name(exercise: dict, title: str) -> str:
    lesson_num = exercise["lesson"]
    ex_num = int(exercise["id"].split(".")[1])
    return f"Lesson {lesson_num:02d}.{ex_num:02d} — {title}"


def build_ini_text(exercise: dict, unit_name: str, song_length_ms: int) -> str:
    name = build_song_name(exercise, exercise["title"])
    lines = [
        "[song]",
        f'name = "{name}"',
        'artist = "SightKick Method"',
        f'album = "{unit_name}"',
        "genre = Lesson",
        "charter = ",
        "auto_chart = False",
        f"diff_drums = {exercise['diff_drums']}",
        "pro_drums = True",
        f"song_length = {song_length_ms}",
        "preview_start_time = 0",
        "delay = 0",
        "",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# folder orchestration
# ---------------------------------------------------------------------------


def sanitize_for_path(text: str) -> str:
    """Titles are free text (e.g. "6/8 Groove") but folder names can't
    contain a path separator, or pathlib silently turns it into nested
    directories. Replace any '/' with a visually similar safe character."""
    return text.replace("/", "-")


def folder_name_for(exercise: dict, unit_id: str) -> str:
    lesson_num = exercise["lesson"]
    ex_num = int(exercise["id"].split(".")[1])
    title = sanitize_for_path(exercise["title"])
    return f"{FOLDER_PREFIX} {lesson_num:02d}.{ex_num:02d} - {title}"


def generate_one(
    unit: dict, lesson: dict, exercise: dict, out_dir: Path, dry_run: bool
) -> Path:
    timeline = build_timeline(exercise)
    mid_bytes = build_notes_mid(exercise, timeline)
    song_length_ms = round(
        timeline.total_ticks / TICKS_PER_QUARTER * 60 / exercise["bpm_target"] * 1000
    )
    ini_text = build_ini_text(exercise, unit["name"], song_length_ms)

    folder = out_dir / folder_name_for(exercise, unit["id"])
    if dry_run:
        return folder

    folder.mkdir(parents=True, exist_ok=True)
    (folder / "notes.mid").write_bytes(mid_bytes)
    (folder / "song.ini").write_text(ini_text, encoding="utf-8")

    wav_path = folder / "_click_tmp.wav"
    ogg_path = folder / "song.ogg"
    build_click_wav_bytes(timeline, exercise["bpm_target"], wav_path)
    wav_to_ogg(wav_path, ogg_path, CLICK_SAMPLE_RATE, bitrate="48k")
    wav_path.unlink(missing_ok=True)

    drums_wav_path = folder / "_drums_tmp.wav"
    drums_ogg_path = folder / "drums.ogg"
    build_drums_wav_bytes(timeline, exercise["bpm_target"], drums_wav_path)
    wav_to_ogg(
        drums_wav_path, drums_ogg_path, DRUM_SAMPLE_RATE, bitrate=DRUM_OGG_BITRATE
    )
    drums_wav_path.unlink(missing_ok=True)

    return folder


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--curriculum", type=Path, default=HERE / "curriculum.yaml")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument(
        "--only",
        type=str,
        default=None,
        help="comma-separated exercise ids, e.g. 03.03,04.04",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if shutil.which("ffmpeg") is None and not args.dry_run:
        sys.exit("ffmpeg not found on PATH -- required to encode song.ogg/drums.ogg")

    curriculum = load_curriculum(args.curriculum)
    only = set(args.only.split(",")) if args.only else None

    n = 0
    for unit, lesson, exercise in iter_exercises(curriculum):
        if only is not None and exercise["id"] not in only:
            continue
        folder = generate_one(unit, lesson, exercise, args.out_dir, args.dry_run)
        n += 1
        print(f"[{n:3d}] {exercise['id']}  {folder.name}")

    print(
        f"done: {n} exercise folder(s) {'would be ' if args.dry_run else ''}written to {args.out_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
