"""Stage 3: beat / downbeat / tempo-map estimation from the full mix.

Preference order:
1. Beat This! (CP-JKU, ISMIR 2024, MIT licensed) — a joint beat+downbeat
   tracker, no madmom/DBN required (we use its "minimal" postprocessor).
2. ``librosa.beat.beat_track`` as a classical fallback, with downbeats
   approximated by grouping every 4th detected beat (assumes 4/4).
"""

from __future__ import annotations

import logging

import numpy as np

from sk_transcriber.events import ProgressReporter
from sk_transcriber.tempo import TempoMap

log = logging.getLogger("sk_transcriber.beats")

_TEMPO_CHANGE_TOLERANCE = 0.04  # relative BPM change that starts a new tempo segment


def _segments_from_beats(beat_times: np.ndarray) -> list[tuple[float, float]]:
    if len(beat_times) < 2:
        return [(0.0, 120.0)]
    ibis = np.diff(beat_times)
    ibis = np.clip(ibis, 1e-3, None)
    bpms = 60.0 / ibis
    segments: list[tuple[float, float]] = [(0.0, float(bpms[0]))]
    cur_bpm = bpms[0]
    for i in range(1, len(bpms)):
        if abs(bpms[i] - cur_bpm) / cur_bpm > _TEMPO_CHANGE_TOLERANCE:
            segments.append((float(beat_times[i]), float(bpms[i])))
            cur_bpm = bpms[i]
    return segments


def _time_signature_from_downbeats(
    beat_times: np.ndarray, downbeat_times: np.ndarray
) -> tuple[int, int]:
    if len(downbeat_times) < 2:
        return (4, 4)
    counts = []
    for i in range(len(downbeat_times) - 1):
        n = int(
            np.sum(
                (beat_times >= downbeat_times[i]) & (beat_times < downbeat_times[i + 1])
            )
        )
        if n > 0:
            counts.append(n)
    if not counts:
        return (4, 4)
    val = int(round(float(np.median(counts))))
    val = max(2, min(val, 12))
    return (val, 4)


def _beats_with_beat_this(
    mix_wav_path: str, duration_seconds: float, reporter: ProgressReporter, stage: str
) -> TempoMap:
    import torch
    from beat_this.inference import File2Beats

    device = "cpu"
    if torch.backends.mps.is_available():
        device = "mps"

    reporter.report(stage, 0.1, f"Loading Beat This! model (device={device})")
    model = File2Beats(checkpoint_path="final0", device=device, dbn=False)

    reporter.report(stage, 0.3, "Running beat/downbeat tracking (Beat This!)")
    beats, downbeats = model(mix_wav_path)
    beats = np.asarray(beats, dtype=np.float64)
    downbeats = np.asarray(downbeats, dtype=np.float64)

    if len(beats) < 2:
        raise RuntimeError("Beat This! produced fewer than 2 beats")

    tempo_segments = _segments_from_beats(beats)
    time_sig = _time_signature_from_downbeats(beats, downbeats)

    reporter.stage_done(
        stage, f"Beat tracking complete ({len(beats)} beats, {len(downbeats)} bars)"
    )
    return TempoMap(
        beat_times=beats,
        downbeat_times=downbeats if len(downbeats) > 0 else beats[0::4],
        tempo_segments=tempo_segments,
        time_signature=time_sig,
        source="beat_this",
        duration_seconds=duration_seconds,
    )


def _beats_with_librosa(
    mix_wav_path: str, duration_seconds: float, reporter: ProgressReporter, stage: str
) -> TempoMap:
    import librosa

    reporter.report(stage, 0.2, "Loading audio for classical beat tracking")
    y, sr = librosa.load(mix_wav_path, sr=22050, mono=True)

    reporter.report(stage, 0.4, "Running librosa.beat.beat_track")
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    if len(beat_times) < 2:
        # Degenerate/very short or silent input: synthesize a constant-tempo grid.
        bpm = float(np.atleast_1d(tempo)[0]) if np.size(tempo) else 120.0
        bpm = bpm if bpm > 0 else 120.0
        step = 60.0 / bpm
        n = max(2, int(duration_seconds / step))
        beat_times = np.arange(n) * step

    downbeat_times = beat_times[0::4]  # 4/4 assumption
    tempo_segments = _segments_from_beats(beat_times)

    reporter.stage_done(
        stage, f"Beat tracking complete ({len(beat_times)} beats, librosa fallback)"
    )
    return TempoMap(
        beat_times=beat_times,
        downbeat_times=downbeat_times,
        tempo_segments=tempo_segments,
        time_signature=(4, 4),
        source="librosa",
        duration_seconds=duration_seconds,
    )


def estimate_tempo_map(
    mix_wav_path: str,
    duration_seconds: float,
    reporter: ProgressReporter,
    stage: str = "beats",
) -> TempoMap:
    try:
        return _beats_with_beat_this(mix_wav_path, duration_seconds, reporter, stage)
    except Exception as exc:  # noqa: BLE001 — deliberate: any failure falls back
        log.warning(
            "Beat This! unavailable/failed (%s); falling back to librosa beat tracking",
            exc,
        )
        return _beats_with_librosa(mix_wav_path, duration_seconds, reporter, stage)
