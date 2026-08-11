from __future__ import annotations

import hashlib
import json
from pathlib import Path

import yaml


TAG_DEMANDS: dict[str, tuple[tuple[str, float], ...]] = {
    "accents": (("hand.accent_control", 0.6), ("dynamics.accent", 0.4)),
    "capstone": (("music.capstone", 1.0),),
    "compound-meter": (("meter.6_8", 0.6), ("pulse.triplet", 0.4)),
    "crash": (("kit.crash_phrase", 1.0),),
    "cross-stick": (("hand.cross_stick", 1.0),),
    "cut-time": (("meter.cut_time", 1.0),),
    "double-paradiddle": (("hand.paradiddle_double", 1.0),),
    "double-stroke-roll": (("hand.doubles", 1.0),),
    "doubles": (("hand.doubles", 1.0),),
    "dynamics": (("dynamics.loud_soft", 1.0),),
    "eighth-notes": (("pulse.eighth", 1.0),),
    "fills": (
        ("kit.fill_entry", 0.35),
        ("kit.fill_return", 0.35),
        ("music.fill_8th", 0.3),
    ),
    "five-stroke-roll": (("hand.doubles", 0.7), ("hand.accent_control", 0.3)),
    "ghost-notes": (("hand.ghost_note", 0.5), ("dynamics.ghost", 0.5)),
    "hand-to-foot": (("coord.hand_to_foot", 1.0),),
    "hemiola": (("reading.syncopation", 0.5), ("pulse.triplet", 0.5)),
    "hihat-timekeeping": (("pulse.eighth", 0.5), ("feel.backbeat", 0.5)),
    "jazz-ride": (("feel.jazz_ride", 0.55), ("coord.ride_ostinato", 0.45)),
    "kick-independence": (("foot.kick_pulse", 0.35), ("coord.rock_three_way", 0.65)),
    "linear-drumming": (("coord.linear", 0.6), ("coord.hand_to_foot", 0.4)),
    "measured-roll": (("hand.doubles", 0.7), ("pulse.sixteenth", 0.3)),
    "musical-form": (("music.song_form", 1.0),),
    "new-meter": (("meter.3_4", 1.0),),
    "nine-stroke-roll": (("hand.doubles", 0.7), ("hand.accent_control", 0.3)),
    "open-hihat": (("foot.hihat_open_close", 1.0),),
    "paradiddle": (("hand.paradiddle_single", 1.0),),
    "paradiddle-diddle": (("hand.paradiddle_diddle", 1.0),),
    "reading": (("reading.staff_map", 0.55), ("reading.rests", 0.45)),
    "ride": (("feel.jazz_ride", 0.55), ("coord.ride_ostinato", 0.45)),
    "rudiment-application": (("music.fill_16th", 1.0),),
    "seven-stroke-roll": (("hand.doubles", 0.7), ("hand.accent_control", 0.3)),
    "shuffle-feel": (("pulse.shuffle", 0.55), ("feel.shuffle", 0.45)),
    "single-paradiddle": (("hand.paradiddle_single", 1.0),),
    "single-stroke-roll": (("hand.singles", 1.0),),
    "singles": (("hand.singles", 1.0),),
    "six-stroke-roll": (("hand.triples", 0.6), ("hand.accent_control", 0.4)),
    "sixteenth-notes": (("pulse.sixteenth", 1.0),),
    "tempo-building": (("pulse.eighth", 0.5), ("feel.pocket", 0.5)),
    "timing": (("pulse.quarter", 0.5), ("feel.pocket", 0.5)),
    "toms": (("kit.tom_t1_t2", 0.3), ("kit.tom_t2_t3", 0.3), ("kit.tom_sweep", 0.4)),
    "triple-paradiddle": (("hand.paradiddle_triple", 1.0),),
    "triple-stroke-roll": (("hand.triples", 1.0),),
    "triples": (("hand.triples", 1.0),),
    "triplet-feel": (("pulse.triplet", 0.5), ("feel.jazz_ride", 0.5)),
    "waltz": (("meter.3_4", 0.5), ("feel.backbeat", 0.5)),
}

EXERCISE_DEMANDS: dict[str, tuple[tuple[str, float], ...]] = {
    "01.01": (("hand.singles", 0.55), ("pulse.sixteenth", 0.45)),
    "05.03": (
        ("pulse.eighth", 0.2),
        ("foot.kick_pulse", 0.2),
        ("coord.rock_three_way", 0.35),
        ("feel.backbeat", 0.25),
    ),
    "07.05": (
        ("kit.tom_t1_t2", 0.25),
        ("kit.tom_t2_t3", 0.3),
        ("kit.tom_t1_t3", 0.25),
        ("kit.tom_sweep", 0.2),
    ),
    "13.04": (
        ("hand.paradiddle_single", 0.4),
        ("coord.linear", 0.25),
        ("coord.hand_to_foot", 0.2),
        ("music.groove_16th", 0.15),
    ),
    "19.06": (
        ("pulse.triplet", 0.35),
        ("feel.jazz_ride", 0.35),
        ("coord.ride_ostinato", 0.3),
    ),
    "24.05": (
        ("meter.6_8", 0.4),
        ("pulse.triplet", 0.2),
        ("coord.rock_three_way", 0.25),
        ("feel.backbeat", 0.15),
    ),
}


def _flatten_exercises(curriculum: dict) -> list[dict]:
    return [
        exercise
        for unit in curriculum["units"]
        for lesson in unit["lessons"]
        for exercise in lesson["exercises"]
    ]


def _meter_demands(exercise: dict) -> tuple[tuple[str, float], ...]:
    signature = tuple(exercise["time_signature"])
    return {
        (3, 4): (("meter.3_4", 1.0),),
        (6, 8): (("meter.6_8", 1.0),),
        (12, 8): (("meter.12_8", 1.0),),
        (2, 2): (("meter.cut_time", 1.0),),
    }.get(signature, ())


def _fallback_demands(exercise: dict) -> tuple[tuple[str, float], ...]:
    lesson = int(exercise["lesson"])
    if lesson <= 2:
        return (("pulse.quarter", 1.0),)
    if lesson <= 4:
        return (("hand.singles", 0.5), ("pulse.sixteenth", 0.5))
    if lesson <= 6:
        return (("coord.rock_three_way", 0.6), ("music.groove_8th", 0.4))
    if lesson <= 10:
        return (("kit.fill_entry", 0.5), ("kit.fill_return", 0.5))
    if lesson <= 12:
        return (("music.song_form", 1.0),)
    if lesson <= 18:
        return (("music.groove_16th", 1.0),)
    if lesson <= 21:
        return (("pulse.triplet", 0.5), ("feel.jazz_ride", 0.5))
    return (("music.capstone", 1.0),)


def _demand_context(exercise: dict) -> str:
    lanes = sorted(
        {
            lane
            for bar in exercise["bars"]
            for lane, pattern in bar.items()
            if any(symbol != "." for symbol in pattern)
        }
    )
    resolution = max(
        len(pattern) for bar in exercise["bars"] for pattern in bar.values()
    )
    signature = exercise["time_signature"]
    subdivision = (
        "triplet"
        if resolution % 3 == 0 and resolution >= 12
        else "sixteenth"
        if resolution >= 16
        else "eighth"
        if resolution >= 8
        else "quarter"
    )
    tags = set(exercise.get("skills", []))
    phrase = "fill" if "fills" in tags else "song" if "capstone" in tags else "groove"
    simultaneous = any(
        sum(pattern[index] != "." for pattern in bar.values()) >= 2
        for bar in exercise["bars"]
        for index in range(len(next(iter(bar.values()))))
    )
    toms = [lane for lane in lanes if lane.startswith("T")]
    transition = "tom" if len(toms) >= 2 else "joint" if simultaneous else "single"
    return (
        f"meter={signature[0]}/{signature[1]};subdivision={subdivision};"
        f"lanes={','.join(lanes)};limbs={'joint' if simultaneous else 'single'};"
        f"transition={transition};phrase={phrase}"
    )


def _assessment_confidence(exercise: dict) -> float:
    tags = set(exercise.get("skills", []))
    if tags & {"cross-stick", "ghost-notes", "dynamics"}:
        return 0.72
    if tags & {"paradiddle", "doubles", "triples", "single-stroke-roll"}:
        return 0.78
    return 0.9


def _demands(exercise: dict) -> list[dict]:
    weighted: dict[str, float] = {}
    overrides = EXERCISE_DEMANDS.get(exercise["id"])
    if overrides:
        for skill_id, weight in overrides:
            weighted[skill_id] = weighted.get(skill_id, 0) + weight
    else:
        for tag in exercise.get("skills", []):
            for skill_id, weight in TAG_DEMANDS.get(tag, ()):
                weighted[skill_id] = weighted.get(skill_id, 0) + weight
        for skill_id, weight in _meter_demands(exercise):
            weighted[skill_id] = weighted.get(skill_id, 0) + weight
    if not weighted:
        for skill_id, weight in _fallback_demands(exercise):
            weighted[skill_id] = weighted.get(skill_id, 0) + weight
    total = sum(weighted.values())
    context = _demand_context(exercise)
    return [
        {
            "skill_id": skill_id,
            "weight": round(weight / total, 6),
            "target_bpm": int(exercise["bpm_target"]),
            "context": context,
        }
        for skill_id, weight in sorted(weighted.items())
    ]


def build_curriculum_manifests(curriculum_path: Path) -> tuple[str, list[dict]]:
    source = curriculum_path.read_bytes()
    revision = f"curriculum:sha256:{hashlib.sha256(source).hexdigest()}"
    curriculum = yaml.safe_load(source)
    manifests = [
        {
            "item_id": exercise["id"],
            "source": "curriculum",
            "source_revision": revision,
            "demands": _demands(exercise),
            "context_signature": _demand_context(exercise),
            "assessment_confidence": _assessment_confidence(exercise),
            "chart_total_notes": sum(
                sum(symbol != "." for pattern in bar.values() for symbol in pattern)
                for bar in exercise["bars"]
            ),
        }
        for exercise in _flatten_exercises(curriculum)
    ]
    return revision, manifests


def write_json_manifest(curriculum_path: Path, output_path: Path) -> None:
    revision, manifests = build_curriculum_manifests(curriculum_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps({"source_revision": revision, "items": manifests}, indent=2) + "\n",
        encoding="utf-8",
    )


def write_typescript_manifest(curriculum_path: Path, output_path: Path) -> None:
    revision, manifests = build_curriculum_manifests(curriculum_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.with_suffix(".json").write_text(
        json.dumps({"source_revision": revision, "items": manifests}, indent=2) + "\n",
        encoding="utf-8",
    )
    output_path.write_text(
        "import generated_manifest from './generated-curriculum-manifest.json';\n"
        "import type { ItemSkillManifest } from './types';\n\n"
        "export const GENERATED_CURRICULUM_MANIFEST_SOURCE_REVISION =\n"
        "  generated_manifest.source_revision;\n\n"
        "export const GENERATED_CURRICULUM_ITEM_MANIFESTS: readonly ItemSkillManifest[] =\n"
        "  generated_manifest.items as readonly ItemSkillManifest[];\n",
        encoding="utf-8",
    )
