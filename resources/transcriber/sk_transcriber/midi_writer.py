"""Stage 5 (part 1): write ``notes.mid`` — a Clone Hero compatible chart.

One ``PART DRUMS`` track carries all four difficulties, at the standard
Clone Hero note offsets (kick, snare, yellow, blue, green in each range):
    Easy    60-64
    Medium  72-76
    Hard    84-88
    Expert  96-100

This is the Rock Band / Clone Hero "tom marker" convention: 110/111/112 are
sustained marker notes that, when active under a yellow/blue/green note-on
(at ANY difficulty), flip that lane from cymbal to tom for that hit. Tom
markers are difficulty-independent — a physical tom hit is the same
performance regardless of which difficulty's note range is being read.

Our upstream classifier (ADTOF-shaped, whichever engine produced it) only
gives 5 coarse classes (kick, snare, hihat, tom, cymbal) — it does not
itself distinguish crash vs. ride, nor high/mid/low tom. We resolve those
sub-types heuristically from each hit's spectral centroid, adaptively
thresholded per-song, once at Expert. This is the least certain part of the
mapping and is called out in the README.

Easy/Medium/Hard are not a thinned copy of Expert's raw hit list — they are
built by musical reduction (see ``difficulty.py``): dropping lanes,
downsampling hi-hats to a steady pulse, thinning fills to their first/last
hit, and adding heuristic section-start crashes at Medium. Every
difficulty, Expert included, is then passed through an explicit
playability cap (max notes/sec, max simultaneous voices, min same-lane
gap) — accurate but unplayable is not an acceptable chart.
"""

from __future__ import annotations

import logging

import mido
import numpy as np

from sk_transcriber.difficulty import (
    DIFFICULTIES,
    DIFFICULTY_BASE_NOTE,
    GRID_SUBDIVISION,
    reduce_all,
)
from sk_transcriber.tempo import TempoMap
from sk_transcriber.transcribe import DrumHit

log = logging.getLogger("sk_transcriber.midi_writer")

TICKS_PER_BEAT = 480
NOTE_LEN_TICKS = 20
TOM_MARKER_LEN_TICKS = NOTE_LEN_TICKS + 10

NOTE_KICK = 96
NOTE_SNARE = 97
NOTE_YELLOW = 98
NOTE_BLUE = 99
NOTE_GREEN = 100
TOM_MARKER_YELLOW = 110
TOM_MARKER_BLUE = 111
TOM_MARKER_GREEN = 112

QUANTIZE_TOLERANCE_BEATS = 0.06  # ~25ms at 120bpm; never snap further than this


def _quantize_beat(beat_pos: float, subdivision: int) -> float:
    grid = round(beat_pos * subdivision) / subdivision
    if abs(grid - beat_pos) <= QUANTIZE_TOLERANCE_BEATS:
        return grid
    return beat_pos


def _resolve_cymbal_or_tom_pitch(hits: list[DrumHit]) -> dict[int, tuple[int, bool]]:
    """Maps each hit's index (within `hits`) to (midi_note, is_tom)."""
    cymbal_idx = [i for i, h in enumerate(hits) if h.lane == "cymbal"]
    tom_idx = [i for i, h in enumerate(hits) if h.lane == "tom"]

    cymbal_median = (
        float(np.median([hits[i].centroid for i in cymbal_idx]))
        if cymbal_idx
        else 4000.0
    )

    tom_centroids = sorted(hits[i].centroid for i in tom_idx)
    if len(tom_centroids) >= 6:
        lo_thresh = tom_centroids[len(tom_centroids) // 3]
        hi_thresh = tom_centroids[2 * len(tom_centroids) // 3]
    else:
        lo_thresh = hi_thresh = None

    mapping: dict[int, tuple[int, bool]] = {}
    for i, h in enumerate(hits):
        if h.lane == "kick":
            mapping[i] = (NOTE_KICK, False)
        elif h.lane == "snare":
            mapping[i] = (NOTE_SNARE, False)
        elif h.lane == "hihat":
            mapping[i] = (NOTE_YELLOW, False)
        elif h.lane == "cymbal":
            # Higher-centroid cymbal hits => ride (blue); lower => crash (green).
            mapping[i] = (
                (NOTE_BLUE, False)
                if h.centroid >= cymbal_median
                else (NOTE_GREEN, False)
            )
        elif h.lane == "tom":
            if lo_thresh is None:
                mapping[i] = (
                    NOTE_BLUE,
                    True,
                )  # not enough data to bucket: default to mid tom
            elif h.centroid <= lo_thresh:
                mapping[i] = (NOTE_GREEN, True)  # low tom
            elif h.centroid >= hi_thresh:
                mapping[i] = (NOTE_YELLOW, True)  # high tom
            else:
                mapping[i] = (NOTE_BLUE, True)  # mid tom
        else:
            mapping[i] = (NOTE_SNARE, False)
    return mapping


_TOM_MARKER_FOR = {
    NOTE_YELLOW: TOM_MARKER_YELLOW,
    NOTE_BLUE: TOM_MARKER_BLUE,
    NOTE_GREEN: TOM_MARKER_GREEN,
}


def write_notes_mid(
    hits: list[DrumHit],
    tempo_map: TempoMap,
    out_path,
    duration_seconds: float,
    song_title: str = "",
    song_artist: str = "",
) -> dict[str, int]:
    """Writes a single ``PART DRUMS`` track carrying all four difficulties
    (Easy 60-64, Medium 72-76, Hard 84-88, Expert 96-100 — kick, snare,
    yellow, blue, green in each range) plus difficulty-independent tom
    markers (110/111/112). Returns the note count written per difficulty."""
    mid = mido.MidiFile(type=1, ticks_per_beat=TICKS_PER_BEAT)

    # --- Track 0: conductor (tempo map + time signature) ---
    conductor = mido.MidiTrack()
    mid.tracks.append(conductor)
    conductor.append(mido.MetaMessage("track_name", name="", time=0))
    num, den = tempo_map.time_signature
    conductor.append(
        mido.MetaMessage("time_signature", numerator=num, denominator=den, time=0)
    )

    tempo_events: list[tuple[int, mido.MetaMessage]] = []
    for seg_time, seg_bpm in tempo_map.tempo_segments:
        beat_pos = tempo_map.time_to_beats(seg_time)
        tick = int(round(beat_pos * TICKS_PER_BEAT))
        bpm = max(1.0, min(999.0, seg_bpm))
        tempo_events.append(
            (tick, mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
        )
    tempo_events.sort(key=lambda x: x[0])
    if not tempo_events or tempo_events[0][0] != 0:
        tempo_events.insert(
            0,
            (
                0,
                mido.MetaMessage(
                    "set_tempo", tempo=mido.bpm2tempo(tempo_map.median_bpm()), time=0
                ),
            ),
        )

    prev_tick = 0
    for tick, msg in tempo_events:
        msg.time = max(0, tick - prev_tick)
        conductor.append(msg)
        prev_tick = tick
    conductor.append(mido.MetaMessage("end_of_track", time=0))

    # --- Track 1: PART DRUMS (all four difficulties, one track) ---
    drums = mido.MidiTrack()
    mid.tracks.append(drums)
    drums.append(mido.MetaMessage("track_name", name="PART DRUMS", time=0))

    pitch_map = _resolve_cymbal_or_tom_pitch(hits)
    reduced = reduce_all(hits, pitch_map, tempo_map, duration_seconds)

    # (abs_tick, priority, message) — priority 0 = note_off, 1 = note_on, so
    # simultaneous offs are emitted before the next on (avoids illegal
    # overlapping note-on-note-on with no intervening off on the same pitch).
    events: list[tuple[int, int, mido.Message]] = []

    def _emit_note(tick: int, note: int, vel: int, length: int) -> None:
        events.append(
            (tick, 1, mido.Message("note_on", note=note, velocity=vel, time=0))
        )
        events.append(
            (tick + length, 0, mido.Message("note_off", note=note, velocity=0, time=0))
        )

    # Tom markers (110/111/112) are difficulty-independent: they flag a
    # physical tom hit, which is the same performance regardless of which
    # difficulty's note range is looking at it. Driven directly by the
    # Expert-level classification, at Expert's (finest) grid resolution.
    expert_subdivision = GRID_SUBDIVISION["expert"]
    for i, hit in enumerate(hits):
        note, is_tom = pitch_map[i]
        if not is_tom:
            continue
        beat_pos = _quantize_beat(tempo_map.time_to_beats(hit.time), expert_subdivision)
        tick = max(0, int(round(beat_pos * TICKS_PER_BEAT)))
        marker = _TOM_MARKER_FOR[note]
        _emit_note(tick, marker, 100, TOM_MARKER_LEN_TICKS)

    note_counts: dict[str, int] = {}
    for diff in DIFFICULTIES:
        base = DIFFICULTY_BASE_NOTE[diff]
        subdivision = GRID_SUBDIVISION[diff]
        diff_events = reduced[diff]
        note_counts[diff] = len(diff_events)
        for e in diff_events:
            note = base + e.note_class
            beat_pos = _quantize_beat(tempo_map.time_to_beats(e.time), subdivision)
            tick = max(0, int(round(beat_pos * TICKS_PER_BEAT)))
            vel = max(1, min(127, e.velocity))
            _emit_note(tick, note, vel, NOTE_LEN_TICKS)

    events.sort(key=lambda x: (x[0], x[1]))

    prev_tick = 0
    for tick, _priority, msg in events:
        msg.time = max(0, tick - prev_tick)
        drums.append(msg)
        prev_tick = tick
    drums.append(mido.MetaMessage("end_of_track", time=0))

    out_path = str(out_path)
    mid.save(out_path)
    log.info(
        "wrote %s (tempo segments=%d, notes: easy=%d medium=%d hard=%d expert=%d)",
        out_path,
        len(tempo_events),
        note_counts["easy"],
        note_counts["medium"],
        note_counts["hard"],
        note_counts["expert"],
    )
    return note_counts
