"""Tempo-map representation shared by the beats stage and the MIDI writer."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class TempoMap:
    beat_times: np.ndarray  # seconds, all beats
    downbeat_times: np.ndarray  # seconds, bar-start beats (subset of beat_times)
    tempo_segments: list[
        tuple[float, float]
    ]  # sorted (start_time_sec, bpm), first at t=0
    time_signature: tuple[int, int]  # (numerator, denominator)
    source: str  # "beat_this" or "librosa"
    duration_seconds: float = 0.0

    def bpm_at(self, t: float) -> float:
        bpm = self.tempo_segments[0][1]
        for seg_t, seg_bpm in self.tempo_segments:
            if seg_t <= t:
                bpm = seg_bpm
            else:
                break
        return bpm

    def median_bpm(self) -> float:
        if not self.tempo_segments:
            return 120.0
        return float(np.median([b for _, b in self.tempo_segments]))

    def time_to_beats(self, t: float) -> float:
        """Convert a wall-clock time (seconds) into a fractional beat count
        since t=0, integrating the piecewise-constant tempo segments."""
        segs = self.tempo_segments
        beats = 0.0
        for i, (seg_t, seg_bpm) in enumerate(segs):
            seg_end = segs[i + 1][0] if i + 1 < len(segs) else float("inf")
            if t <= seg_t:
                break
            dur = min(t, seg_end) - seg_t
            if dur > 0:
                beats += dur * seg_bpm / 60.0
            if t <= seg_end:
                break
        return beats

    def beats_to_time(self, beat: float) -> float:
        """Convert a beat count since t=0 back to wall-clock seconds."""
        beat = max(0.0, beat)
        elapsed_beats = 0.0
        for i, (seg_t, seg_bpm) in enumerate(self.tempo_segments):
            seg_end = (
                self.tempo_segments[i + 1][0]
                if i + 1 < len(self.tempo_segments)
                else float("inf")
            )
            seg_beats = (seg_end - seg_t) * seg_bpm / 60.0
            if beat <= elapsed_beats + seg_beats:
                return seg_t + (beat - elapsed_beats) * 60.0 / seg_bpm
            elapsed_beats += seg_beats
        return 0.0

    def time_to_ticks(self, t: float, ticks_per_beat: int) -> int:
        return int(round(self.time_to_beats(t) * ticks_per_beat))
