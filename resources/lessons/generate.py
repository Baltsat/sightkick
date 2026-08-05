#!/usr/bin/env python3
"""SightKick Method lesson generator.

Deterministically turns resources/lessons/curriculum.yaml into playable
SightKick song folders: notes.mid (PART DRUMS, expert difficulty),
song.ogg (a synthesized click/metronome track), and song.ini.

Usage:
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python3 generate.py
    .venv/bin/python3 generate.py --out-dir /some/other/dir --only 03.03,04.04
    .venv/bin/python3 generate.py --dry-run

Requires: Python 3.12, PyYAML (see requirements.txt), and ffmpeg on PATH
(used only to transcode the generated click WAV into a small mono OGG --
no drum sounds are ever encoded, the drummer supplies those).

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
import wave
from pathlib import Path

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


def wav_to_ogg(wav_path: Path, ogg_path: Path) -> None:
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
            str(CLICK_SAMPLE_RATE),
            "-c:a",
            "libvorbis",
            "-b:a",
            "48k",
            str(ogg_path),
        ],
        check=True,
    )


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
    wav_to_ogg(wav_path, ogg_path)
    wav_path.unlink(missing_ok=True)

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
        sys.exit("ffmpeg not found on PATH -- required to encode song.ogg")

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
