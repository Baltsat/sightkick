from __future__ import annotations

import numpy as np
from sk_transcriber.difficulty import (
    BLUE,
    GREEN,
    KICK,
    SNARE,
    YELLOW,
    DiffEvent,
    _enforce_min_gap_same_lane,
    _snap_to_grid,
    reduce_all,
    reduce_easy,
    reduce_medium,
)
from sk_transcriber.tempo import TempoMap


def tempo_map(bpm: float = 120.0) -> TempoMap:
    beat_gap = 60.0 / bpm
    beats = np.arange(0.0, 8 * beat_gap, beat_gap)
    return TempoMap(
        beat_times=beats,
        downbeat_times=beats[::4],
        tempo_segments=[(0.0, bpm)],
        time_signature=(4, 4),
        source="test",
        duration_seconds=float(beats[-1] + beat_gap),
    )


def event(time: float, note_class: int, velocity: int = 90, is_tom: bool = False):
    return DiffEvent(time, note_class, is_tom, velocity)


def test_easy_keeps_only_on_beat_backbone_and_prioritizes_beats_one_and_three():
    tm = tempo_map(150.0)
    events = [
        event(0.02, KICK),
        event(0.21, SNARE),
        event(0.41, SNARE),
        event(0.81, KICK),
        event(1.21, SNARE),
        event(0.8, YELLOW),
    ]

    reduced = reduce_easy(events, tm)

    assert [(e.time, e.note_class) for e in reduced] == [(0.0, KICK), (0.8, KICK)]


def test_easy_keeps_beat_three_over_an_earlier_weak_beat_when_downbeat_is_missing():
    tm = tempo_map(150.0)

    reduced = reduce_easy([event(0.4, SNARE), event(0.8, KICK)], tm)

    assert [(e.time, e.note_class) for e in reduced] == [(0.8, KICK)]


def test_grid_collapse_snaps_the_survivor_to_the_grid_slot_time():
    tm = tempo_map()
    reduced = _snap_to_grid(
        [event(0.23, YELLOW, 70), event(0.27, YELLOW, 110)], tm, subdivision=2
    )

    assert len(reduced) == 1
    assert reduced[0].time == 0.25
    assert reduced[0].velocity == 110


def test_medium_never_fabricates_crashes_without_an_expert_crash():
    tm = tempo_map()
    no_crash = [event(0.0, KICK), event(0.5, SNARE), event(1.0, GREEN, is_tom=True)]

    reduced = reduce_medium(no_crash, tm, tm.duration_seconds)

    assert not any(e.note_class == GREEN and not e.is_tom for e in reduced)


def test_medium_can_mark_sections_after_observing_a_real_expert_crash():
    tm = tempo_map()
    observed_crash = [event(1.0, GREEN)]

    reduced = reduce_medium(observed_crash, tm, tm.duration_seconds)

    assert [(e.time, e.note_class) for e in reduced] == [(0.0, GREEN)]


def test_empty_transcription_stays_empty_at_every_difficulty():
    tm = tempo_map()

    reduced = reduce_all([], {}, tm, tm.duration_seconds)

    assert reduced == {"easy": [], "medium": [], "hard": [], "expert": []}


def test_same_lane_louder_replacement_survives_interleaved_lanes():
    events = [
        event(0.0, KICK, 60),
        event(0.01, SNARE, 100),
        event(0.02, KICK, 110),
        event(0.03, BLUE, 80),
    ]

    reduced = _enforce_min_gap_same_lane(events, min_gap=0.05)

    assert [(e.time, e.note_class, e.velocity) for e in reduced] == [
        (0.01, SNARE, 100),
        (0.02, KICK, 110),
        (0.03, BLUE, 80),
    ]
