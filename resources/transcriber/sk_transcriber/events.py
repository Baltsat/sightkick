"""Progress-protocol event emission.

Every line the caller (the SightKick Electron app) understands as machine
output MUST go to stdout, prefixed exactly with ``__SK_EVENT__ `` followed by
one JSON object. All logging/diagnostics go to stderr instead (see
``logging_setup.py``) so stdout stays clean for the protocol.
"""

from __future__ import annotations

import json
import sys
from typing import Any

_PREFIX = "__SK_EVENT__ "

# Valid stage values, in pipeline order.
STAGES = ("download", "separate", "beats", "transcribe", "write")


def _emit(payload: dict[str, Any]) -> None:
    line = _PREFIX + json.dumps(payload, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def progress(stage: str, percent: float, message: str) -> None:
    if stage not in STAGES:
        raise ValueError(f"invalid stage {stage!r}, must be one of {STAGES}")
    _emit(
        {
            "kind": "progress",
            "stage": stage,
            "percent": round(max(0.0, min(100.0, percent)), 2),
            "message": message,
        }
    )


def complete(song_dir: str) -> None:
    _emit({"kind": "complete", "success": True, "songDir": song_dir})


def error(message: str) -> None:
    _emit({"kind": "error", "message": message})


class ProgressReporter:
    """Maps a stage-local fraction (0..1) onto the overall 0..100 percent scale.

    ``stage_ranges`` is an ordered list of ``(stage_name, lo, hi)`` tuples
    that must together be monotonically non-decreasing and span the portion
    of the 0..100 scale used by this run (a ``--audio`` run has no
    ``download`` stage, so it gets a different, wider allocation than a
    ``--url`` run).
    """

    def __init__(self, stage_ranges: list[tuple[str, float, float]]):
        self._ranges = {name: (lo, hi) for name, lo, hi in stage_ranges}
        self._last_pct = 0.0

    def report(self, stage: str, frac: float, message: str) -> None:
        lo, hi = self._ranges[stage]
        frac = max(0.0, min(1.0, frac))
        pct = lo + (hi - lo) * frac
        # Never let displayed progress go backwards.
        pct = max(pct, self._last_pct)
        self._last_pct = pct
        progress(stage, pct, message)

    def stage_done(self, stage: str, message: str) -> None:
        self.report(stage, 1.0, message)


# Two fixed allocations, chosen so the whole run adds up to 0..100.
URL_STAGE_RANGES = [
    ("download", 0.0, 10.0),
    ("separate", 10.0, 45.0),
    ("beats", 45.0, 58.0),
    ("transcribe", 58.0, 88.0),
    ("write", 88.0, 100.0),
]

AUDIO_STAGE_RANGES = [
    ("separate", 0.0, 40.0),
    ("beats", 40.0, 55.0),
    ("transcribe", 55.0, 85.0),
    ("write", 85.0, 100.0),
]
