#!/usr/bin/env python3
"""Validate the shipped lesson contract and the three-tom curriculum gates.

The normal generator checks that authored bars can be rendered. This validator
adds a separate contract for E4.04 and E4.05 in ``docs/requirement-ledger.md``:
it renders every ``notes.mid`` payload in memory, parses the emitted MIDI track,
and uses the tom marker notes (110/111/112) as the source of truth for lane
coverage and movement. It deliberately does not inspect the YAML lane strings
when deciding whether a tom exists in the generated chart.

Run from the repository root:

    resources/lessons/.venv/bin/python3 resources/lessons/validate_curriculum.py

No user library is read or changed. The validator only uses the committed
curriculum and the deterministic MIDI writer.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import struct
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from generate import (
    ASSESSMENT_BOUNDARY,
    TOM_MARKER_NOTE,
    bar_ticks_for,
    build_notes_mid,
    build_timeline,
    iter_exercises,
    load_curriculum,
)


HERE = Path(__file__).resolve().parent
DEFAULT_CURRICULUM = HERE / "curriculum.yaml"

TOM_FOR_MARKER = {marker: tom for tom, marker in TOM_MARKER_NOTE.items()}
ALL_TOMS = frozenset(TOM_FOR_MARKER.values())
LESSON_SEVEN_EXPECTED_TOMS = {
    "07.02": frozenset({"T1", "T2"}),
    "07.03": frozenset({"T2", "T3"}),
    "07.04": ALL_TOMS,
    "07.05": ALL_TOMS,
    "07.06": ALL_TOMS,
    "07.07": ALL_TOMS,
    "07.08": ALL_TOMS,
}
LESSON_SEVEN_REQUIRED_LANGUAGE = {
    "07.02": ("high tom", "mid tom"),
    "07.03": ("mid tom", "floor tom"),
    "07.04": ("reverse",),
    "07.05": ("random",),
    "07.06": ("groove",),
    "07.07": ("groove", "fill"),
    "07.08": ("fade",),
}
LATER_TOM_REINFORCEMENTS = ("10.05", "18.01", "18.02")
REQUIRED_TRANSITIONS = frozenset(
    {("T1", "T2"), ("T2", "T1"), ("T2", "T3"), ("T3", "T2")}
)
# This locks the 170 stable IDs in their existing document order. Content can
# evolve, but a change to an identifier or its position must be intentional.
EXPECTED_ID_SEQUENCE_SHA256 = (
    "997e405aee18cb65c0e60492282a3e29fb154074b4b6577d53f626f4a2293506"
)
LANE_TARGET_ELEMENT = {
    "K": "kick",
    "S": "snare",
    "H": "hihat",
    "O": "hihat",
    "R": "ride",
    "C": "crash",
    "T1": "tom1",
    "T2": "tom2",
    "T3": "tom3",
}
TEMPO_LADDER_TITLE = re.compile(r"^(?P<name>.+) \((?P<bpm>\d+) BPM\)$")


class ValidationError(ValueError):
    """Raised when a curriculum exit gate is not met."""


@dataclass(frozen=True)
class TomEvidence:
    exercise_id: str
    lesson: int
    title: str
    cue: str
    tom_events: tuple[tuple[int, str], ...]
    authored_tom_events: tuple[tuple[int, str], ...]
    authored_bar_toms: tuple[frozenset[str], ...]

    @property
    def toms(self) -> frozenset[str]:
        return frozenset(tom for _, tom in self.tom_events)

    @property
    def first_block_sequence(self) -> tuple[str, ...]:
        """Tom lanes in the first authored block, with repeated lane hits collapsed."""
        if not self.authored_tom_events:
            return ()

        # ``authored_tom_events`` is already in exact MIDI track order.
        # Keeping only the first authored figure proves the authored movement
        # without counting repeated practice loops as separate exercises.
        sequence: list[str] = []
        previous: str | None = None
        for _, tom in self.authored_tom_events:
            if tom != previous:
                sequence.append(tom)
                previous = tom
        return tuple(sequence)


def _read_varlen(data: bytes, position: int) -> tuple[int, int]:
    value = 0
    for _ in range(4):
        if position >= len(data):
            raise ValidationError("truncated variable-length MIDI value")
        byte = data[position]
        position += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, position
    raise ValidationError("MIDI variable-length value exceeds four bytes")


def _iter_note_ons(midi: bytes) -> Iterable[tuple[int, int, int]]:
    """Yield (tick, note, velocity) from exact generated SMF bytes.

    The generator writes standard status bytes rather than relying on running
    status, but this parser accepts running status too so malformed generated
    output cannot pass through an accidental parser blind spot.
    """
    if len(midi) < 14 or midi[:4] != b"MThd":
        raise ValidationError("generated MIDI has no MThd header")
    header_length = struct.unpack(">I", midi[4:8])[0]
    position = 8 + header_length

    while position < len(midi):
        if midi[position : position + 4] != b"MTrk":
            raise ValidationError("generated MIDI has an invalid track chunk")
        track_length = struct.unpack(">I", midi[position + 4 : position + 8])[0]
        track_end = position + 8 + track_length
        if track_end > len(midi):
            raise ValidationError("generated MIDI track is truncated")

        tick = 0
        cursor = position + 8
        running_status: int | None = None
        while cursor < track_end:
            delta, cursor = _read_varlen(midi, cursor)
            tick += delta
            if cursor >= track_end:
                raise ValidationError("generated MIDI event is truncated")

            first = midi[cursor]
            if first & 0x80:
                status = first
                cursor += 1
                if 0x80 <= status <= 0xEF:
                    running_status = status
            elif running_status is not None:
                status = running_status
            else:
                raise ValidationError(
                    "generated MIDI uses data bytes before a status byte"
                )

            if status == 0xFF:
                if cursor >= track_end:
                    raise ValidationError("generated MIDI meta event is truncated")
                cursor += 1  # meta event type
                event_length, cursor = _read_varlen(midi, cursor)
                cursor += event_length
                if cursor > track_end:
                    raise ValidationError(
                        "generated MIDI meta event extends past its track"
                    )
                continue
            if status in (0xF0, 0xF7):
                event_length, cursor = _read_varlen(midi, cursor)
                cursor += event_length
                if cursor > track_end:
                    raise ValidationError(
                        "generated MIDI sysex event extends past its track"
                    )
                continue
            if not 0x80 <= status <= 0xEF:
                raise ValidationError(
                    f"unsupported generated MIDI status byte 0x{status:02x}"
                )

            kind = status & 0xF0
            data_length = 1 if kind in (0xC0, 0xD0) else 2
            if cursor + data_length > track_end:
                raise ValidationError("generated MIDI channel event is truncated")
            payload = midi[cursor : cursor + data_length]
            cursor += data_length

            if kind == 0x90 and data_length == 2 and payload[1] > 0:
                yield tick, payload[0], payload[1]

        position = track_end


def _tom_events_from_generated_midi(exercise: dict) -> tuple[tuple[int, str], ...]:
    timeline = build_timeline(exercise)
    midi = build_notes_mid(exercise, timeline)
    events = tuple(
        (tick, TOM_FOR_MARKER[note])
        for tick, note, _ in _iter_note_ons(midi)
        if note in TOM_FOR_MARKER
    )
    expected = sum(1 for _, lane, _ in timeline.hits if lane in TOM_MARKER_NOTE)
    if len(events) != expected:
        raise ValidationError(
            f"{exercise['id']}: generated MIDI emitted {len(events)} tom markers; expected {expected}"
        )
    return events


def _authored_bar_toms(
    exercise: dict, tom_events: tuple[tuple[int, str], ...]
) -> tuple[frozenset[str], ...]:
    """Read tom lanes from emitted MIDI in the first authored block only."""
    bar_ticks = bar_ticks_for(exercise["time_signature"])
    count_in_end = bar_ticks
    first_block_end = count_in_end + bar_ticks * len(exercise["bars"])
    toms_by_bar: list[set[str]] = [set() for _ in exercise["bars"]]

    for tick, tom in tom_events:
        if not count_in_end <= tick < first_block_end:
            continue
        bar_index = (tick - count_in_end) // bar_ticks
        toms_by_bar[bar_index].add(tom)
    return tuple(frozenset(toms) for toms in toms_by_bar)


def _first_authored_block_events(
    exercise: dict, tom_events: tuple[tuple[int, str], ...]
) -> tuple[tuple[int, str], ...]:
    bar_ticks = bar_ticks_for(exercise["time_signature"])
    count_in_end = bar_ticks
    first_block_end = count_in_end + bar_ticks * len(exercise["bars"])
    return tuple(
        (tick, tom)
        for tick, tom in tom_events
        if count_in_end <= tick < first_block_end
    )


def _evidence_for(exercise: dict) -> TomEvidence:
    tom_events = _tom_events_from_generated_midi(exercise)
    return TomEvidence(
        exercise_id=exercise["id"],
        lesson=exercise["lesson"],
        title=exercise["title"],
        cue=exercise["cue"],
        tom_events=tom_events,
        authored_tom_events=_first_authored_block_events(exercise, tom_events),
        authored_bar_toms=_authored_bar_toms(exercise, tom_events),
    )


def _contains_sweep(sequence: tuple[str, ...]) -> bool:
    full_paths = (("T1", "T2", "T3"), ("T3", "T2", "T1"))
    return any(_contains_path(sequence, path) for path in full_paths)


def _contains_path(sequence: tuple[str, ...], path: tuple[str, ...]) -> bool:
    return any(
        tuple(sequence[index : index + len(path)]) == path
        for index in range(max(0, len(sequence) - len(path) + 1))
    )


def _transitions(sequence: tuple[str, ...]) -> set[tuple[str, str]]:
    return {
        (left, right) for left, right in zip(sequence, sequence[1:]) if left != right
    }


def _validate_structure(exercises: list[dict]) -> None:
    ids = [exercise["id"] for exercise in exercises]
    if len(exercises) != 170:
        raise ValidationError(f"expected exactly 170 exercises, found {len(exercises)}")
    if len(set(ids)) != len(ids):
        raise ValidationError("exercise IDs are not unique")

    actual_checksum = hashlib.sha256("\n".join(ids).encode()).hexdigest()
    if actual_checksum != EXPECTED_ID_SEQUENCE_SHA256:
        raise ValidationError(
            "exercise IDs or document order changed; update the checked-in ID contract intentionally"
        )

    by_id = {exercise["id"]: exercise for exercise in exercises}
    visited: list[str] = []
    cursor = ids[0]
    while cursor:
        if cursor not in by_id:
            raise ValidationError(f"unlock chain points at missing exercise {cursor}")
        if cursor in visited:
            raise ValidationError(f"unlock chain repeats exercise {cursor}")
        visited.append(cursor)
        cursor = by_id[cursor].get("next") or ""

    if visited != ids:
        raise ValidationError(
            "unlock chain is not one connected path in document order"
        )
    for index, exercise in enumerate(exercises):
        if exercise["stars_to_unlock"] != index:
            raise ValidationError(
                f"{exercise['id']}: stars_to_unlock must be {index}, got {exercise['stars_to_unlock']}"
            )


def _authored_target_lanes(exercise: dict) -> set[str]:
    """The lesson target must be grounded in real authored chart lanes."""
    targets: set[str] = set()
    for bar in exercise["bars"]:
        for lane, pattern in bar.items():
            if LANE_TARGET_ELEMENT.get(lane) and any(
                symbol != "." for symbol in pattern
            ):
                targets.add(LANE_TARGET_ELEMENT[lane])
    return targets


def _validate_learning_model_semantics(
    curriculum: dict, exercises: list[dict]
) -> dict[str, object]:
    """Check the curriculum semantics consumed by lesson recommendations.

    These are deliberately authoring gates, not a proxy count of MIDI tom
    markers: a valid method must also retain safe prerequisites, an honest
    timing/sticking capability boundary, usable tempo/dose metadata, reading,
    and musical transfer contexts.
    """
    meta = curriculum.get("meta", {})
    if meta.get("assessment_boundary") != ASSESSMENT_BOUNDARY:
        raise ValidationError(
            "meta.assessment_boundary must exactly state the MIDI assessment boundary"
        )
    policy = meta.get("lesson_policy")
    if (
        not isinstance(policy, dict)
        or not policy.get("dose_rule")
        or not policy.get("mastery_rule")
    ):
        raise ValidationError(
            "meta.lesson_policy must provide non-empty dose_rule and mastery_rule"
        )

    ids = {exercise["id"] for exercise in exercises}
    prior_id: str | None = None
    target_lane_count = 0
    reading_ids: list[str] = []
    transfer_ids: list[str] = []
    ladder_groups: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for exercise in exercises:
        exercise_id = exercise["id"]
        bpm_slow = exercise.get("bpm_slow")
        bpm_target = exercise.get("bpm_target")
        if not isinstance(bpm_slow, int) or not isinstance(bpm_target, int):
            raise ValidationError(f"{exercise_id}: BPM bounds must be integer values")
        if not 40 <= bpm_slow <= bpm_target <= 260:
            raise ValidationError(
                f"{exercise_id}: BPM bounds must satisfy 40 <= start <= target <= 260"
            )
        if bpm_target - bpm_slow > 100:
            raise ValidationError(
                f"{exercise_id}: tempo ladder span exceeds the 100 BPM dose bound"
            )
        if not isinstance(exercise.get("cue"), str) or not exercise["cue"].strip():
            raise ValidationError(
                f"{exercise_id}: every lesson must carry an authored cue"
            )

        explicit_prerequisites = exercise.get("prerequisite_ids")
        if explicit_prerequisites is not None:
            if not isinstance(explicit_prerequisites, list) or not all(
                prerequisite in ids for prerequisite in explicit_prerequisites
            ):
                raise ValidationError(
                    f"{exercise_id}: prerequisite_ids must name existing lessons"
                )
            if prior_id is not None and explicit_prerequisites != [prior_id]:
                raise ValidationError(
                    f"{exercise_id}: explicit prerequisite_ids must preserve the authored immediate chain"
                )
            if prior_id is None and explicit_prerequisites:
                raise ValidationError(
                    f"{exercise_id}: the first lesson cannot have a prerequisite"
                )

        targets = _authored_target_lanes(exercise)
        if not targets:
            raise ValidationError(f"{exercise_id}: target lanes cannot be empty")
        target_lane_count += len(targets)
        skills = set(exercise.get("skills", []))
        if "toms" in skills and not any(target.startswith("tom") for target in targets):
            raise ValidationError(
                f"{exercise_id}: tom skill must have a tom target lane"
            )
        if "kick-independence" in skills and "kick" not in targets:
            raise ValidationError(f"{exercise_id}: kick-independence must target kick")
        if "reading" in skills:
            reading_ids.append(exercise_id)
        if (
            "rudiment-application" in skills
            or "transfer" in (f"{exercise['title']} {exercise['cue']}").lower()
        ):
            transfer_ids.append(exercise_id)

        title_match = TEMPO_LADDER_TITLE.match(exercise["title"])
        if title_match:
            declared_bpm = int(title_match.group("bpm"))
            if declared_bpm != bpm_target:
                raise ValidationError(
                    f"{exercise_id}: declared title tempo {declared_bpm} must equal bpm_target {bpm_target}"
                )
            ladder_groups[title_match.group("name")].append((exercise_id, bpm_target))
        prior_id = exercise_id

    for name, rungs in ladder_groups.items():
        if len(rungs) < 2:
            continue
        tempos = [tempo for _, tempo in rungs]
        if tempos != sorted(tempos) or len(set(tempos)) != len(tempos):
            raise ValidationError(
                f"{name}: declared identical-pattern tempo ladder must rise strictly, got {tempos}"
            )
    if len(reading_ids) < 3:
        raise ValidationError(
            f"expected at least 3 reading lessons, found {reading_ids}"
        )
    if len(transfer_ids) < 3:
        raise ValidationError(
            f"expected at least 3 musical transfer/application lessons, found {transfer_ids}"
        )

    return {
        "target_lane_count": target_lane_count,
        "reading_ids": reading_ids,
        "transfer_ids": transfer_ids,
        "tempo_ladders": {
            name: [exercise_id for exercise_id, _ in rungs]
            for name, rungs in ladder_groups.items()
            if len(rungs) > 1
        },
    }


def validate(curriculum_path: Path) -> dict[str, object]:
    curriculum = load_curriculum(curriculum_path)
    exercises = [exercise for _, _, exercise in iter_exercises(curriculum)]
    _validate_structure(exercises)
    learning_model = _validate_learning_model_semantics(curriculum, exercises)

    evidence = {exercise["id"]: _evidence_for(exercise) for exercise in exercises}
    missing_lesson_seven_ids = set(LESSON_SEVEN_EXPECTED_TOMS) - set(evidence)
    if missing_lesson_seven_ids:
        raise ValidationError(
            f"missing required Lesson 7 exercises: {sorted(missing_lesson_seven_ids)}"
        )

    for exercise_id, expected_toms in LESSON_SEVEN_EXPECTED_TOMS.items():
        actual_toms = evidence[exercise_id].toms
        if actual_toms != expected_toms:
            raise ValidationError(
                f"{exercise_id}: generated MIDI tom lanes {sorted(actual_toms)} do not match "
                f"the authored contract {sorted(expected_toms)}"
            )
        language = f"{evidence[exercise_id].title} {evidence[exercise_id].cue}".lower()
        missing_words = [
            word
            for word in LESSON_SEVEN_REQUIRED_LANGUAGE[exercise_id]
            if word not in language
        ]
        if missing_words:
            raise ValidationError(
                f"{exercise_id}: missing required instructional language {missing_words}"
            )

    lesson_seven_path = evidence["07.04"].first_block_sequence
    if not _contains_path(lesson_seven_path, ("T1", "T2", "T3")) or not _contains_path(
        lesson_seven_path, ("T3", "T2", "T1")
    ):
        raise ValidationError(
            "07.04 must emit both ordered and reverse three-tom paths"
        )

    t2_exercises = sorted(
        exercise_id for exercise_id, item in evidence.items() if "T2" in item.toms
    )
    if len(t2_exercises) < 8:
        raise ValidationError(
            f"expected at least 8 exercises with generated T2 MIDI, found {len(t2_exercises)}"
        )

    lesson_seven_t2 = [
        item.exercise_id
        for item in evidence.values()
        if item.lesson == 7 and "T2" in item.toms
    ]
    if len(lesson_seven_t2) < 4:
        raise ValidationError(
            f"expected at least 4 Lesson 7 exercises with generated T2 MIDI, found {len(lesson_seven_t2)}"
        )

    actual_reinforcements = [
        exercise_id
        for exercise_id in LATER_TOM_REINFORCEMENTS
        if exercise_id in evidence and "T2" in evidence[exercise_id].toms
    ]
    if len(actual_reinforcements) < 2:
        raise ValidationError(
            "expected T2 reinforcement in at least two later transfer exercises; "
            f"found {actual_reinforcements}"
        )

    isolated_drills: dict[str, set[str]] = defaultdict(set)
    for item in evidence.values():
        for bar_toms in item.authored_bar_toms:
            if len(bar_toms) == 1:
                isolated_drills[next(iter(bar_toms))].add(item.exercise_id)
    for tom in sorted(ALL_TOMS):
        if len(isolated_drills[tom]) < 3:
            raise ValidationError(
                f"expected at least 3 generated isolated-drill exercises for {tom}, "
                f"found {sorted(isolated_drills[tom])}"
            )

    all_transitions: set[tuple[str, str]] = set()
    sweeps: list[str] = []
    for item in evidence.values():
        sequence = item.first_block_sequence
        all_transitions.update(_transitions(sequence))
        if _contains_sweep(sequence):
            sweeps.append(item.exercise_id)
    missing_transitions = REQUIRED_TRANSITIONS - all_transitions
    if missing_transitions:
        formatted = [f"{left}->{right}" for left, right in sorted(missing_transitions)]
        raise ValidationError(
            f"missing required generated tom transitions: {formatted}"
        )
    if len(sweeps) < 2:
        raise ValidationError(
            f"expected at least 2 exercises with a generated full three-tom sweep, found {sweeps}"
        )

    full_tom_contexts = [item for item in evidence.values() if item.toms == ALL_TOMS]
    groove_contexts = [
        item.exercise_id
        for item in full_tom_contexts
        if "groove" in f"{item.title} {item.cue}".lower()
    ]
    fill_contexts = [
        item.exercise_id
        for item in full_tom_contexts
        if "fill" in f"{item.title} {item.cue}".lower()
    ]
    if len(groove_contexts) < 2:
        raise ValidationError(
            f"expected at least 2 all-three-tom groove contexts, found {groove_contexts}"
        )
    if len(fill_contexts) < 2:
        raise ValidationError(
            f"expected at least 2 all-three-tom fill contexts, found {fill_contexts}"
        )

    return {
        "exercise_count": len(exercises),
        "t2_exercises": t2_exercises,
        "lesson_seven_t2": sorted(lesson_seven_t2),
        "later_reinforcements": actual_reinforcements,
        "isolated_drills": {
            tom: sorted(ids) for tom, ids in sorted(isolated_drills.items())
        },
        "transitions": sorted(f"{left}->{right}" for left, right in all_transitions),
        "sweeps": sorted(sweeps),
        "groove_contexts": sorted(groove_contexts),
        "fill_contexts": sorted(fill_contexts),
        "learning_model": learning_model,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--curriculum", type=Path, default=DEFAULT_CURRICULUM)
    args = parser.parse_args()

    try:
        report = validate(args.curriculum)
    except (OSError, ValidationError, ValueError) as error:
        print(f"curriculum validation failed: {error}", file=sys.stderr)
        return 1

    print("curriculum validation passed")
    print(f"  exercises: {report['exercise_count']} (stable 170-ID chain)")
    print(
        f"  generated T2 exercises ({len(report['t2_exercises'])}): {', '.join(report['t2_exercises'])}"
    )
    print(f"  Lesson 7 T2: {', '.join(report['lesson_seven_t2'])}")
    print(f"  later T2 reinforcement: {', '.join(report['later_reinforcements'])}")
    for tom, exercise_ids in report["isolated_drills"].items():
        print(
            f"  isolated {tom} drills ({len(exercise_ids)}): {', '.join(exercise_ids)}"
        )
    print(f"  generated transitions: {', '.join(report['transitions'])}")
    print(f"  full sweeps ({len(report['sweeps'])}): {', '.join(report['sweeps'])}")
    print(f"  all-three-tom groove contexts: {', '.join(report['groove_contexts'])}")
    print(f"  all-three-tom fill contexts: {', '.join(report['fill_contexts'])}")
    print(
        f"  learning metadata: {report['learning_model']['target_lane_count']} authored lane targets; "
        f"{len(report['learning_model']['tempo_ladders'])} rising tempo ladders; "
        f"{len(report['learning_model']['reading_ids'])} reading / "
        f"{len(report['learning_model']['transfer_ids'])} transfer lessons"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
