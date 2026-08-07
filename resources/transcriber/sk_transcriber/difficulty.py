"""Stage 5 (part 1b): derive Easy/Medium/Hard drum charts from the Expert
transcription via musical reduction, each gated by an explicit playability
cap.

A chart can be onset-accurate and still be unplayable ("не игрально") — a
1:1 dump of every detected hit onto a lower difficulty is not a real Easy
chart. Each level below Expert is built by literal musical reduction
(dropping lanes, thinning fills, downsampling hi-hats to a steady pulse),
then every level — Expert included — passes through the same explicit caps:
max sustained event-clusters/sec, max simultaneous voices, and a minimum gap
between repeats of the same lane. We would rather drop a genuine note than
emit an unplayable cluster.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from sk_transcriber.tempo import TempoMap
from sk_transcriber.transcribe import DrumHit

# Note-class indices, in Clone Hero lane order (kick, snare, yellow, blue,
# green) — portable across all four difficulty note-offset ranges.
KICK, SNARE, YELLOW, BLUE, GREEN = range(5)
NOTE_CLASS_NAMES = ("kick", "snare", "yellow", "blue", "green")

# MIDI base note for each difficulty's lane 0 (kick); lanes are base+0..base+4.
DIFFICULTY_BASE_NOTE = {"easy": 60, "medium": 72, "hard": 84, "expert": 96}
DIFFICULTIES = ("easy", "medium", "hard", "expert")

# Grid resolution (snaps per beat) used when quantizing each difficulty's
# note times at MIDI-write time — coarser for easier charts.
GRID_SUBDIVISION = {"easy": 1, "medium": 2, "hard": 4, "expert": 4}


@dataclass
class DifficultyCaps:
    max_nps: float  # historical name: max event-clusters/sec; chords count once
    max_simultaneous: int  # max distinct lanes sounding in the same instant
    min_gap_same_lane: float  # seconds; minimum gap between two hits in the same lane


CAPS: dict[str, DifficultyCaps] = {
    "easy": DifficultyCaps(max_nps=2.0, max_simultaneous=2, min_gap_same_lane=0.20),
    "medium": DifficultyCaps(max_nps=4.0, max_simultaneous=2, min_gap_same_lane=0.12),
    "hard": DifficultyCaps(max_nps=7.5, max_simultaneous=3, min_gap_same_lane=0.08),
    "expert": DifficultyCaps(max_nps=14.0, max_simultaneous=4, min_gap_same_lane=0.03),
}


@dataclass
class DiffEvent:
    time: float
    note_class: int  # 0..4 = kick, snare, yellow, blue, green
    is_tom: bool
    velocity: int


def _cluster_events(
    events: list[DiffEvent], window: float = 0.015
) -> list[list[DiffEvent]]:
    events = sorted(events, key=lambda e: e.time)
    clusters: list[list[DiffEvent]] = []
    for e in events:
        if clusters and (e.time - clusters[-1][0].time) <= window:
            clusters[-1].append(e)
        else:
            clusters.append([e])
    return clusters


def _enforce_simultaneous_cap(
    events: list[DiffEvent], max_simultaneous: int
) -> list[DiffEvent]:
    # Backbone (kick, snare) takes priority over cymbals/toms when a chord
    # would otherwise exceed the cap.
    priority = {KICK: 0, SNARE: 1, YELLOW: 2, BLUE: 3, GREEN: 4}
    out: list[DiffEvent] = []
    for cluster in _cluster_events(events):
        by_lane: dict[int, DiffEvent] = {}
        for e in cluster:
            if (
                e.note_class not in by_lane
                or e.velocity > by_lane[e.note_class].velocity
            ):
                by_lane[e.note_class] = e
        kept = sorted(by_lane.values(), key=lambda e: priority[e.note_class])[
            :max_simultaneous
        ]
        out.extend(kept)
    return out


def _enforce_density_cap(events: list[DiffEvent], max_nps: float) -> list[DiffEvent]:
    if max_nps <= 0:
        return events
    min_gap = 1.0 / max_nps
    kept: list[DiffEvent] = []
    last_time = -1e9
    for cluster in _cluster_events(events):
        t = cluster[0].time
        if t - last_time < min_gap:
            continue
        kept.extend(cluster)
        last_time = t
    return sorted(kept, key=lambda e: e.time)


def _enforce_min_gap_same_lane(
    events: list[DiffEvent], min_gap: float
) -> list[DiffEvent]:
    events = sorted(events, key=lambda e: e.time)
    last_by_lane: dict[int, tuple[float, int]] = {}
    kept: list[DiffEvent] = []
    for e in events:
        prior = last_by_lane.get(e.note_class)
        if prior is not None and (e.time - prior[0]) < min_gap:
            if e.velocity > kept[prior[1]].velocity:
                kept[prior[1]] = e
                last_by_lane[e.note_class] = (e.time, prior[1])
            continue
        last_by_lane[e.note_class] = (e.time, len(kept))
        kept.append(e)
    return sorted(kept, key=lambda e: e.time)


def _apply_caps(events: list[DiffEvent], caps: DifficultyCaps) -> list[DiffEvent]:
    events = _enforce_min_gap_same_lane(events, caps.min_gap_same_lane)
    events = _enforce_density_cap(events, caps.max_nps)
    events = _enforce_simultaneous_cap(events, caps.max_simultaneous)
    return sorted(events, key=lambda e: e.time)


def _snap_to_grid(
    events: list[DiffEvent], tempo_map: TempoMap, subdivision: int
) -> list[DiffEvent]:
    """Downsample-by-snapping: hits landing in the same grid slot collapse
    into one (the loudest survives). Used to thin a dense hi-hat pattern
    down to a steady pulse for Medium."""
    slots: dict[tuple[int, int], DiffEvent] = {}
    for e in events:
        beat = tempo_map.time_to_beats(e.time)
        slot = round(beat * subdivision)
        key = (slot, e.note_class)
        if key not in slots or e.velocity > slots[key].velocity:
            slots[key] = DiffEvent(
                tempo_map.beats_to_time(slot / subdivision),
                e.note_class,
                e.is_tom,
                e.velocity,
            )
    return sorted(slots.values(), key=lambda e: e.time)


def _find_fill_bursts(
    events: list[DiffEvent], gap: float = 0.15, min_len: int = 4
) -> list[list[int]]:
    """Index runs (into a time-sorted list) of tight consecutive hits
    across any lane(s) — dense enough to read as a fill rather than groove."""
    bursts: list[list[int]] = []
    cur: list[int] = []
    for i, e in enumerate(events):
        if cur and (e.time - events[cur[-1]].time) > gap:
            if len(cur) >= min_len:
                bursts.append(cur)
            cur = []
        cur.append(i)
    if len(cur) >= min_len:
        bursts.append(cur)
    return bursts


def _thin_fills(
    events: list[DiffEvent], gap: float = 0.15, min_len: int = 4
) -> list[DiffEvent]:
    events = sorted(events, key=lambda e: e.time)
    bursts = _find_fill_bursts(events, gap, min_len)
    drop: set[int] = set()
    for burst in bursts:
        for idx in burst[1:-1]:  # keep first and last, drop the interior
            drop.add(idx)
    return [e for i, e in enumerate(events) if i not in drop]


def _section_start_crashes(
    tempo_map: TempoMap, duration_seconds: float
) -> list[DiffEvent]:
    """We have no real section/structure detection, so we approximate
    "section starts" with the song's start plus every tempo-segment
    boundary (in a human performance, rubato/tempo drift clusters around
    section changes), snapped to the nearest downbeat."""
    candidate_times = [0.0] + [seg_t for seg_t, _bpm in tempo_map.tempo_segments[1:]]
    downbeats = tempo_map.downbeat_times
    out: list[DiffEvent] = []
    seen: set[float] = set()
    for t in candidate_times:
        if len(downbeats):
            idx = int(np.argmin(np.abs(downbeats - t)))
            snapped = float(downbeats[idx])
        else:
            snapped = t
        key = round(snapped, 2)
        if key in seen or snapped >= duration_seconds:
            continue
        seen.add(key)
        out.append(
            DiffEvent(time=snapped, note_class=GREEN, is_tom=False, velocity=110)
        )
    return out


def build_note_class_events(
    hits: list[DrumHit], pitch_map: dict[int, tuple[int, bool]]
) -> list[DiffEvent]:
    """``pitch_map``: hit-index -> (Expert MIDI note 96..100, is_tom), as
    resolved once by ``midi_writer._resolve_cymbal_or_tom_pitch``. Converts
    to portable 0..4 note-class events shared by every difficulty."""
    from sk_transcriber.midi_writer import (
        NOTE_BLUE,
        NOTE_GREEN,
        NOTE_KICK,
        NOTE_SNARE,
        NOTE_YELLOW,
    )

    note_to_class = {
        NOTE_KICK: KICK,
        NOTE_SNARE: SNARE,
        NOTE_YELLOW: YELLOW,
        NOTE_BLUE: BLUE,
        NOTE_GREEN: GREEN,
    }
    out = []
    for i, hit in enumerate(hits):
        note, is_tom = pitch_map[i]
        out.append(
            DiffEvent(
                time=hit.time,
                note_class=note_to_class[note],
                is_tom=is_tom,
                velocity=hit.velocity,
            )
        )
    return out


def reduce_easy(
    events: list[DiffEvent], tempo_map: TempoMap, beat_tolerance: float = 0.12
) -> list[DiffEvent]:
    """Groove backbone only: kick + snare on the main beats, no cymbals,
    no toms, at most a 2-note (kick+one) chord."""
    strong: list[DiffEvent] = []
    weak: list[DiffEvent] = []
    beats_per_bar = max(1, tempo_map.time_signature[0])
    strong_positions = {0, 2} if beats_per_bar >= 3 else {0}
    for e in events:
        if e.note_class not in (KICK, SNARE):
            continue
        beat = tempo_map.time_to_beats(e.time)
        beat_index = round(beat)
        if abs(beat - beat_index) > beat_tolerance:
            continue
        snapped = DiffEvent(
            tempo_map.beats_to_time(beat_index),
            e.note_class,
            False,
            e.velocity,
        )
        target = strong if beat_index % beats_per_bar in strong_positions else weak
        target.append(snapped)

    kept = _apply_caps(strong, CAPS["easy"])
    for e in sorted(weak, key=lambda item: item.time):
        candidate = _apply_caps(kept + [e], CAPS["easy"])
        if e in candidate and all(existing in candidate for existing in kept):
            kept = candidate
    return kept


def reduce_medium(
    events: list[DiffEvent], tempo_map: TempoMap, duration_seconds: float
) -> list[DiffEvent]:
    """Backbone + a steady hi-hat pulse (eighths, not sixteenths) + simple
    crashes on approximate section starts. No toms, no ride/secondary
    cymbals."""
    backbone = [e for e in events if e.note_class in (KICK, SNARE)]
    hats = [e for e in events if e.note_class == YELLOW]
    hats = _snap_to_grid(hats, tempo_map, subdivision=2)
    hats = [DiffEvent(e.time, e.note_class, False, e.velocity) for e in hats]
    has_crash = any(e.note_class == GREEN and not e.is_tom for e in events)
    crashes = _section_start_crashes(tempo_map, duration_seconds) if has_crash else []
    return _apply_caps(backbone + hats + crashes, CAPS["medium"])


def reduce_hard(events: list[DiffEvent]) -> list[DiffEvent]:
    """Full backbone + main cymbal pattern, with dense fills thinned down
    to their first and last hit."""
    thinned = _thin_fills(events)
    return _apply_caps(thinned, CAPS["hard"])


def reduce_expert(events: list[DiffEvent]) -> list[DiffEvent]:
    """The full transcription, still passed through the playability gate
    as a safety net against pathological false-positive bursts."""
    return _apply_caps(events, CAPS["expert"])


def reduce_all(
    hits: list[DrumHit],
    pitch_map: dict[int, tuple[int, bool]],
    tempo_map: TempoMap,
    duration_seconds: float,
) -> dict[str, list[DiffEvent]]:
    events = build_note_class_events(hits, pitch_map)
    return {
        "easy": reduce_easy(events, tempo_map),
        "medium": reduce_medium(events, tempo_map, duration_seconds),
        "hard": reduce_hard(events),
        "expert": reduce_expert(events),
    }
