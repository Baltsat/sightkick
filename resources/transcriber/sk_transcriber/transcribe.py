"""Stage 4: onset detection + classification on the isolated drums stem.

Preference order:
1. ADTOF (MZehren/ADTOF) — not available as an installable package (not on
   PyPI; its GitHub repo is research code pinned to an old
   TensorFlow/madmom stack that does not install cleanly under Python 3.12 /
   NumPy 2 / Apple Silicon). We checked and did not force it — see README.
2. **DrumSep** (inagoy/drumsep, Hybrid-Demucs, MIT) — a second-stage neural
   separator that further splits the isolated drums stem into kick /
   snare / cymbals / toms audio sub-stems. Classification then reduces to
   trivial per-substem onset detection instead of a hand-tuned spectral
   classifier; the only heuristic left is splitting the catch-all
   "cymbals" substem into hi-hat vs. ride/crash by decay time, now on a
   much cleaner signal than the pre-DrumSep classical path had. See
   "Why DrumSep, not the model named in the brief" in README.
3. A classical fallback: spectral-flux onset detection (librosa) on the
   (un-substemmed) drums stem, followed by rule-based band-energy/
   centroid/decay classification into kick / snare / hi-hat / tom /
   cymbal, with per-hit velocity recovered from local peak amplitude.

All three paths yield the same 5-class ``DrumHit`` stream so the MIDI
writer does not need to know which engine produced it.
"""

from __future__ import annotations

import hashlib
import logging
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from sk_transcriber.events import ProgressReporter

log = logging.getLogger("sk_transcriber.transcribe")

ANALYSIS_SR = 22050
LANES = ("kick", "snare", "hihat", "tom", "cymbal")

# DrumSep (inagoy/drumsep, Hybrid-Demucs, MIT license). The model named in
# the original brief (MDX23C-DrumSep-aufr33-jarredou, via the
# `audio-separator` package) turned out to be unreachable: its upstream
# host repo (github.com/jarredou/models) returns 404 / "Not Found" via both
# a direct asset request and the GitHub API (i.e. the repo itself is gone,
# not a transient network issue). This is a community HuggingFace mirror of
# a different, MIT-licensed drum-substem model (4 stems instead of 6: no
# separate ride/crash) that serves the same purpose in this pipeline.
DRUMSEP_REVISION = "18ebf41e59553e82e42cd92be2643671109c1e13"
DRUMSEP_SHA256 = "aefaa8543c9b9c75e22f5f32b53ab86dfe416457849af1383ff1aef83401423f"
DRUMSEP_URL = (
    f"https://huggingface.co/vincewin/drumsep/resolve/{DRUMSEP_REVISION}/49469ca8.th"
)
DRUMSEP_MIN_BYTES = (
    150_000_000  # sanity floor so a truncated download isn't silently used
)
DRUMSEP_SR = 44100
DRUMSEP_CACHE = (
    Path(
        os.environ.get(
            "SK_TRANSCRIBER_CACHE", Path.home() / ".cache" / "sk_transcriber"
        )
    )
    / "drumsep_49469ca8.th"
)


@dataclass
class DrumHit:
    time: float  # seconds
    lane: str  # one of LANES
    velocity: int  # 1..127
    centroid: float  # Hz, spectral centroid of the onset window (used for tom/cymbal sub-typing)
    confidence: float = 1.0


@dataclass(frozen=True)
class DrumPresenceEvidence:
    drum_rms_ratio: float
    onsets_per_minute: float
    mean_confidence: float
    present: bool


class NoDrumsDetectedError(RuntimeError):
    code = "no-drums"

    def __init__(self) -> None:
        super().__init__("No drums detected in this audio")


def _audio_rms(audio_path: str) -> float:
    import soundfile as sf

    square_sum = 0.0
    sample_count = 0
    with sf.SoundFile(audio_path) as audio:
        while True:
            block = audio.read(65_536, dtype="float32", always_2d=True)
            if len(block) == 0:
                break
            square_sum += float(np.sum(np.square(block, dtype=np.float64)))
            sample_count += int(block.size)
    return float(np.sqrt(square_sum / sample_count)) if sample_count else 0.0


def assess_drum_presence(
    mix_audio_path: str,
    drums_audio_path: str,
    hits: list[DrumHit],
    duration_seconds: float,
) -> DrumPresenceEvidence:
    mix_rms = _audio_rms(mix_audio_path)
    drums_rms = _audio_rms(drums_audio_path)
    drum_rms_ratio = drums_rms / mix_rms if mix_rms > 1e-6 else 0.0
    onsets_per_minute = (
        len(hits) * 60.0 / duration_seconds if duration_seconds > 0 else 0.0
    )
    mean_confidence = (
        float(np.mean([max(0.0, min(1.0, hit.confidence)) for hit in hits]))
        if hits
        else 0.0
    )
    present = (
        drum_rms_ratio >= 0.035 and onsets_per_minute >= 8.0 and mean_confidence >= 0.45
    )
    return DrumPresenceEvidence(
        drum_rms_ratio=drum_rms_ratio,
        onsets_per_minute=onsets_per_minute,
        mean_confidence=mean_confidence,
        present=present,
    )


def _band_energy(
    spec: np.ndarray, freqs: np.ndarray, lo: float, hi: float, total: float
) -> float:
    mask = (freqs >= lo) & (freqs < hi)
    if not np.any(mask):
        return 0.0
    return float(np.sum(spec[mask]) / total)


def _classify_hit(
    seg: np.ndarray, decay_seg: np.ndarray, sr: int
) -> tuple[str, float, float]:
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
        confidence = min(1.0, 0.55 + (purity_high - 0.88) * 2.5)
    elif zcr < 0.18 and bass > 0.12:
        # Has real low-frequency body and a clean (non-noisy) attack:
        # kick or tom. A kick's energy concentrates below 120Hz; a tom's
        # fundamental (even a low floor tom) sits noticeably higher, in
        # the 120-250Hz band, so sub-vs-low tells them apart.
        lane = "kick" if sub >= low else "tom"
        confidence = min(1.0, 0.55 + abs(sub - low) * 2.0 + bass * 0.25)
    else:
        # Broadband + noisy attack with real body: snare.
        lane = "snare"
        confidence = min(0.9, max(0.45, 1.0 - purity_high))

    return lane, centroid, confidence


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


def _get_drumsep_checkpoint(reporter: ProgressReporter, stage: str) -> Path:
    def verify(path: Path) -> bool:
        if path.stat().st_size < DRUMSEP_MIN_BYTES:
            return False
        digest = hashlib.sha256()
        with path.open("rb") as checkpoint:
            for chunk in iter(lambda: checkpoint.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest() == DRUMSEP_SHA256

    if DRUMSEP_CACHE.exists():
        if verify(DRUMSEP_CACHE):
            return DRUMSEP_CACHE
        DRUMSEP_CACHE.unlink(missing_ok=True)
        raise RuntimeError("cached DrumSep checkpoint failed SHA-256 verification")
    DRUMSEP_CACHE.parent.mkdir(parents=True, exist_ok=True)
    reporter.report(
        stage, 0.02, "Downloading DrumSep sub-stem model (one-time, ~160MB)"
    )
    tmp = DRUMSEP_CACHE.with_suffix(".tmp")
    urllib.request.urlretrieve(DRUMSEP_URL, tmp)
    size = tmp.stat().st_size
    if size < DRUMSEP_MIN_BYTES or not verify(tmp):
        tmp.unlink(missing_ok=True)
        raise RuntimeError(
            f"DrumSep checkpoint download failed size/SHA-256 verification ({size} bytes)"
        )
    tmp.rename(DRUMSEP_CACHE)
    return DRUMSEP_CACHE


def _onsets_for_substem(
    y: np.ndarray, sr: int, sensitive: bool = True
) -> tuple[np.ndarray, np.ndarray]:
    """Onset times + per-onset peak amplitude for one already-isolated
    instrument sub-stem. More sensitive thresholds than the classical
    multi-instrument path are safe here: there's no cross-instrument bleed
    left to trigger false positives on."""
    import librosa

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, aggregate=np.median)
    delta, wait = (0.035, 2) if sensitive else (0.07, 4)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env,
        sr=sr,
        backtrack=True,
        pre_max=3,
        post_max=3,
        pre_avg=10,
        post_avg=10,
        delta=delta,
        wait=wait,
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    win = int(0.05 * sr)
    amps = np.zeros(len(onset_times), dtype=np.float64)
    for i, t in enumerate(onset_times):
        i0 = int(t * sr)
        seg = y[i0 : i0 + win]
        amps[i] = float(np.max(np.abs(seg))) if len(seg) else 0.0
    return onset_times, amps


def _cymbal_decay_ratio(y: np.ndarray, sr: int, t: float) -> float:
    i0 = int(t * sr)
    decay_seg = y[i0 : i0 + int(0.15 * sr)]
    half = len(decay_seg) // 2
    if half <= 8:
        return 0.0
    rms1 = float(np.sqrt(np.mean(decay_seg[:half] ** 2) + 1e-12))
    rms2 = float(np.sqrt(np.mean(decay_seg[half:] ** 2) + 1e-12))
    return rms2 / (rms1 + 1e-9)


def _spectral_centroid(y: np.ndarray, sr: int, t: float) -> float:
    i0 = int(t * sr)
    seg = y[i0 : i0 + int(0.05 * sr)]
    if len(seg) < 32:
        return 0.0
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    freqs = np.fft.rfftfreq(len(seg), 1.0 / sr)
    total = float(np.sum(spec)) + 1e-9
    return float(np.sum(freqs * spec) / total)


# DrumSep's own stem names, lowercased, mapped to our 5 canonical lanes.
# "cymbals" is a catch-all (no separate ride/crash in a 4-stem model) —
# resolved to hihat vs. cymbal per onset via decay ratio, same as the
# classical path's high-purity branch, just on a much cleaner signal.
_DRUMSEP_NAME_MAP = {
    "kick": "kick",
    "bombo": "kick",
    "snare": "snare",
    "redoblante": "snare",
    "toms": "tom",
    "tom": "tom",
    "cymbals": "cymbal",
    "platillos": "cymbal",
    "hh": "cymbal",
    "hihat": "cymbal",
}


def _transcribe_with_drumsep(
    drums_wav_path: str, reporter: ProgressReporter, stage: str
) -> list[DrumHit]:
    import librosa
    import torch
    from demucs.apply import apply_model
    from demucs.audio import AudioFile
    from demucs.states import load_model

    ckpt = _get_drumsep_checkpoint(reporter, stage)

    reporter.report(stage, 0.15, "Loading DrumSep model")
    model = load_model(str(ckpt))
    model.eval()
    device = "cpu"
    try:
        if torch.backends.mps.is_available():
            device = "mps"
    except Exception:
        pass
    model.to(device)

    resolved = {}
    for src_name in model.sources:
        key = _DRUMSEP_NAME_MAP.get(src_name.strip().lower())
        if key is None:
            raise RuntimeError(
                f"unrecognized DrumSep source name {src_name!r}; expected kick/snare/toms/cymbals"
            )
        resolved[src_name] = key
    if set(resolved.values()) < {"kick", "snare"}:
        raise RuntimeError(
            f"DrumSep model sources {model.sources!r} did not include kick+snare"
        )

    reporter.report(stage, 0.25, "Separating drum sub-stems (kick/snare/toms/cymbals)")
    wav = AudioFile(drums_wav_path).read(streams=0, samplerate=DRUMSEP_SR, channels=2)
    ref = wav.mean(0)
    std = float(ref.std()) or 1.0
    wavn = (wav - ref.mean()) / std
    with torch.no_grad():
        sources = apply_model(
            model, wavn[None].to(device), device=device, progress=False
        )[0]
    sources = sources.cpu() * std + float(ref.mean())

    hits: list[DrumHit] = []
    n_sources = len(model.sources)
    for idx, (src_name, src_wave) in enumerate(zip(model.sources, sources)):
        lane_base = resolved[src_name]
        y_mono = src_wave.mean(0).numpy()
        y = librosa.resample(y_mono, orig_sr=DRUMSEP_SR, target_sr=ANALYSIS_SR)

        # Kick/snare substems from this model are clean enough that a
        # sensitive threshold pays off in recall without hurting precision
        # (measured: F1 0.91-0.93 kick, 0.60-0.78 snare). The toms/cymbals
        # substems are noisier (this is a 4-stem, not 6-stem, model — no
        # dedicated ride/crash head) and a sensitive threshold there mostly
        # adds false positives: on a 4.5-minute benchmark song, dropping to
        # the same threshold the classical fallback uses cut spurious "tom"
        # onsets by ~3.7x while barely moving kick/snare. See README
        # "Measured accuracy" for the before/after numbers.
        sensitive = lane_base in ("kick", "snare")
        onset_times, amps = _onsets_for_substem(y, ANALYSIS_SR, sensitive=sensitive)
        if len(onset_times) == 0:
            reporter.report(
                stage, 0.3 + 0.55 * (idx + 1) / n_sources, f"No onsets in {src_name}"
            )
            continue
        lo = float(np.percentile(amps, 5))
        hi = float(np.percentile(amps, 95))

        for t, amp in zip(onset_times, amps):
            centroid = _spectral_centroid(y, ANALYSIS_SR, float(t))
            if lane_base == "cymbal":
                decay_ratio = _cymbal_decay_ratio(y, ANALYSIS_SR, float(t))
                lane = "cymbal" if decay_ratio > 0.28 else "hihat"
                confidence = 0.75
            else:
                lane = lane_base
                confidence = 0.9
            vel = _amp_to_velocity(float(amp), lo, hi)
            hits.append(
                DrumHit(
                    time=float(t),
                    lane=lane,
                    velocity=vel,
                    centroid=centroid,
                    confidence=confidence,
                )
            )

        reporter.report(
            stage,
            0.3 + 0.55 * (idx + 1) / n_sources,
            f"Classified {src_name} onsets ({len(onset_times)})",
        )

    hits = _dedupe_same_lane(hits, min_gap=0.03)
    reporter.stage_done(stage, f"Detected {len(hits)} drum hits (DrumSep)")
    return hits


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
        lane, centroid, confidence = _classify_hit(seg, decay_seg, sr)
        vel = _amp_to_velocity(peak_amps[idx], lo, hi)
        hits.append(
            DrumHit(
                time=float(t),
                lane=lane,
                velocity=vel,
                centroid=centroid,
                confidence=confidence,
            )
        )
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
        log.info("ADTOF unavailable/failed (%s); trying DrumSep", exc)
    try:
        hits = _transcribe_with_drumsep(drums_wav_path, reporter, stage)
        return hits, "drumsep"
    except Exception as exc:  # noqa: BLE001 — deliberate: any failure falls back
        log.warning(
            "DrumSep unavailable/failed (%s); using classical onset+spectral classifier fallback",
            exc,
        )
        hits = _transcribe_classical(drums_wav_path, reporter, stage)
        return hits, "classical-fallback"
