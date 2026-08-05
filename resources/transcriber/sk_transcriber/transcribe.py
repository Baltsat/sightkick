"""Stage 4: onset detection + classification on the isolated drums stem.

Preference order:
1. ADTOF (MZehren/ADTOF) — not available as an installable package (not on
   PyPI; its GitHub repo is research code pinned to an old
   TensorFlow/madmom stack that does not install cleanly under Python 3.12 /
   NumPy 2 / Apple Silicon). We checked and did not force it — see README.
2. A classical fallback: spectral-flux onset detection (librosa) on the
   drums stem, followed by rule-based band-energy/centroid/decay
   classification into kick / snare / hi-hat / tom / cymbal, with per-hit
   velocity recovered from local peak amplitude.

Both paths yield the same 5-class ``DrumHit`` stream so the MIDI writer does
not need to know which engine produced it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from sk_transcriber.events import ProgressReporter

log = logging.getLogger("sk_transcriber.transcribe")

ANALYSIS_SR = 22050
LANES = ("kick", "snare", "hihat", "tom", "cymbal")


@dataclass
class DrumHit:
    time: float  # seconds
    lane: str  # one of LANES
    velocity: int  # 1..127
    centroid: float  # Hz, spectral centroid of the onset window (used for tom/cymbal sub-typing)


def _band_energy(
    spec: np.ndarray, freqs: np.ndarray, lo: float, hi: float, total: float
) -> float:
    mask = (freqs >= lo) & (freqs < hi)
    if not np.any(mask):
        return 0.0
    return float(np.sum(spec[mask]) / total)


def _classify_hit(seg: np.ndarray, decay_seg: np.ndarray, sr: int) -> tuple[str, float]:
    windowed = seg * np.hanning(len(seg))
    spec = np.abs(np.fft.rfft(windowed))
    freqs = np.fft.rfftfreq(len(seg), 1.0 / sr)
    total = float(np.sum(spec)) + 1e-9

    sub = _band_energy(spec, freqs, 0, 120, total)
    low = _band_energy(spec, freqs, 120, 250, total)
    mid = _band_energy(spec, freqs, 250, 1200, total)
    high = _band_energy(spec, freqs, 2000, 6000, total)
    veryhigh = _band_energy(spec, freqs, 6000, sr / 2, total)

    centroid = float(np.sum(freqs * spec) / total)
    zcr = float(np.mean(np.abs(np.diff(np.sign(seg))) > 0))

    half = len(decay_seg) // 2
    if half > 8:
        rms1 = float(np.sqrt(np.mean(decay_seg[:half] ** 2) + 1e-12))
        rms2 = float(np.sqrt(np.mean(decay_seg[half:] ** 2) + 1e-12))
        decay_ratio = rms2 / (rms1 + 1e-9)
    else:
        decay_ratio = 0.0

    # `centroid` (the energy-weighted mean frequency across the WHOLE
    # spectrum) is a poor kick/tom-vs-everything gate on its own: even a
    # sub-bass-dominant kick has enough beater-click energy above it to
    # drag the centroid up into the thousands of Hz. What actually
    # separates a hi-hat/cymbal from a body-having drum (kick/snare/tom) is
    # how PURELY its energy sits above 2kHz with essentially nothing below
    # 1200Hz — real kicks/snares/toms always have some low/mid body.
    bass = sub + low
    body = sub + low + mid
    highband = high + veryhigh
    purity_high = highband / (body + highband + 1e-9)

    if purity_high > 0.88:
        # Almost all energy is above 2kHz with no real body: hi-hat or
        # cymbal. A cymbal rings out; a closed/pedal hi-hat decays fast.
        lane = "cymbal" if decay_ratio > 0.28 else "hihat"
    elif zcr < 0.18 and bass > 0.12:
        # Has real low-frequency body and a clean (non-noisy) attack:
        # kick or tom. A kick's energy concentrates below 120Hz; a tom's
        # fundamental (even a low floor tom) sits noticeably higher, in
        # the 120-250Hz band, so sub-vs-low tells them apart.
        lane = "kick" if sub >= low else "tom"
    else:
        # Broadband + noisy attack with real body: snare.
        lane = "snare"

    return lane, centroid


def _amp_to_velocity(amp: float, lo: float, hi: float) -> int:
    if hi <= lo:
        return 100
    frac = (amp - lo) / (hi - lo)
    frac = max(0.0, min(1.0, frac))
    vel = int(round(30 + frac * 97))
    return max(1, min(127, vel))


def _dedupe_same_lane(hits: list[DrumHit], min_gap: float = 0.03) -> list[DrumHit]:
    hits_sorted = sorted(hits, key=lambda h: h.time)
    kept: list[DrumHit] = []
    last_time_by_lane: dict[str, float] = {}
    for h in hits_sorted:
        lt = last_time_by_lane.get(h.lane)
        if lt is not None and (h.time - lt) < min_gap:
            # Keep the louder of the two near-simultaneous same-lane hits.
            if kept and kept[-1].lane == h.lane and h.velocity > kept[-1].velocity:
                kept[-1] = h
                last_time_by_lane[h.lane] = h.time
            continue
        last_time_by_lane[h.lane] = h.time
        kept.append(h)
    return kept


def _transcribe_with_adtof(
    drums_wav_path: str, reporter: ProgressReporter, stage: str
) -> list[DrumHit]:
    # ADTOF (https://github.com/MZehren/ADTOF) is not published on PyPI and
    # its reference implementation pins an old TensorFlow + madmom stack
    # that conflicts with this project's Python 3.12 / NumPy 2 / Apple
    # Silicon environment. We deliberately do not vendor/clone it at build
    # time; this hook exists so a future contributor with a working ADTOF
    # environment can wire it in without changing the pipeline shape.
    raise RuntimeError(
        "ADTOF is not installed in this environment (see README: Models & Licenses)"
    )


def _transcribe_classical(
    drums_wav_path: str, reporter: ProgressReporter, stage: str
) -> list[DrumHit]:
    import librosa

    reporter.report(stage, 0.05, "Loading drums stem")
    y, sr = librosa.load(drums_wav_path, sr=ANALYSIS_SR, mono=True)

    reporter.report(stage, 0.15, "Detecting onsets (spectral flux)")
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, aggregate=np.median)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env,
        sr=sr,
        backtrack=True,
        pre_max=3,
        post_max=3,
        pre_avg=10,
        post_avg=10,
        delta=0.07,
        wait=4,
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    if len(onset_times) == 0:
        reporter.stage_done(stage, "No onsets detected")
        return []

    reporter.report(stage, 0.3, f"Classifying {len(onset_times)} onsets")

    win = int(0.05 * sr)  # 50ms analysis window for spectral classification
    decay_win = int(0.15 * sr)  # 150ms window for decay-time estimate

    peak_amps = np.zeros(len(onset_times), dtype=np.float64)
    for idx, t in enumerate(onset_times):
        i0 = int(t * sr)
        seg = y[i0 : i0 + win]
        peak_amps[idx] = float(np.max(np.abs(seg))) if len(seg) else 0.0

    lo = float(np.percentile(peak_amps, 5))
    hi = float(np.percentile(peak_amps, 95))

    hits: list[DrumHit] = []
    n = len(onset_times)
    for idx, t in enumerate(onset_times):
        i0 = int(t * sr)
        seg = y[i0 : i0 + win]
        if len(seg) < 32:
            continue
        decay_seg = y[i0 : i0 + decay_win]
        lane, centroid = _classify_hit(seg, decay_seg, sr)
        vel = _amp_to_velocity(peak_amps[idx], lo, hi)
        hits.append(DrumHit(time=float(t), lane=lane, velocity=vel, centroid=centroid))
        if idx % 25 == 0:
            reporter.report(stage, 0.3 + 0.6 * (idx / max(1, n)), "Classifying onsets")

    hits = _dedupe_same_lane(hits, min_gap=0.03)
    reporter.stage_done(stage, f"Detected {len(hits)} drum hits (classical fallback)")
    return hits


def transcribe_drums(
    drums_wav_path: str, reporter: ProgressReporter, stage: str = "transcribe"
) -> tuple[list[DrumHit], str]:
    """Returns (hits, engine_name)."""
    try:
        hits = _transcribe_with_adtof(drums_wav_path, reporter, stage)
        return hits, "adtof"
    except Exception as exc:  # noqa: BLE001 — deliberate: any failure falls back
        log.warning(
            "ADTOF unavailable/failed (%s); using classical onset+spectral classifier fallback",
            exc,
        )
        hits = _transcribe_classical(drums_wav_path, reporter, stage)
        return hits, "classical-fallback"
