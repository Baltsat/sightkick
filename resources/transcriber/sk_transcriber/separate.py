"""Stage 2: source separation — produce an isolated drums stem (+ bass/vocals/other).

Preference order:
1. The pre-installed SightKick ``demucs-split`` binary, if ``--stems-bin`` was
   given. Its first run downloads model weights and is known to fail with
   ``SSL: CERTIFICATE_VERIFY_FAILED`` unless the process environment points
   at a real CA bundle — we set ``SSL_CERT_FILE``/``REQUESTS_CA_BUNDLE`` to
   the system bundle before invoking it.
2. ``demucs`` (htdemucs) run from this tool's own venv.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from sk_transcriber.events import ProgressReporter

log = logging.getLogger("sk_transcriber.separate")

STEM_NAMES = ("drums", "bass", "vocals", "other")
SYSTEM_CA_BUNDLE = "/etc/ssl/cert.pem"


@dataclass
class SeparationResult:
    stems: dict[str, Path]  # name -> audio file (mp3 or wav, not yet re-encoded)
    engine: str  # "demucs-split-binary" | "demucs-venv"


def _collect_stems(stem_dir: Path) -> dict[str, Path]:
    stems: dict[str, Path] = {}
    for name in STEM_NAMES:
        found = None
        for ext in ("wav", "mp3", "flac"):
            candidate = stem_dir / f"{name}.{ext}"
            if candidate.exists():
                found = candidate
                break
        if found is None:
            raise RuntimeError(f"missing stem '{name}' in {stem_dir}")
        stems[name] = found
    return stems


def _locate_output(out_dir: Path, audio_stem: str) -> Path:
    direct = out_dir / "htdemucs" / audio_stem
    if direct.exists():
        return direct
    candidates = (
        sorted((out_dir / "htdemucs").glob("*"))
        if (out_dir / "htdemucs").exists()
        else []
    )
    if candidates:
        return candidates[0]
    raise RuntimeError(f"demucs output folder not found under {out_dir}/htdemucs")


def _heartbeat_progress(
    reporter: ProgressReporter, stage: str, stop_event: threading.Event, message: str
) -> None:
    """Since demucs/demucs-split don't expose reliable machine-parseable
    progress, asymptotically crawl toward 90% while the subprocess runs, then
    the caller jumps to 100% once it actually finishes."""
    frac = 0.05
    while not stop_event.wait(2.0):
        frac = frac + (0.90 - frac) * 0.08
        reporter.report(stage, frac, message)


def _run_subprocess_with_heartbeat(
    cmd: list[str],
    env: dict | None,
    reporter: ProgressReporter,
    stage: str,
    message: str,
    log_prefix: str,
) -> None:
    stop_event = threading.Event()
    hb_thread = threading.Thread(
        target=_heartbeat_progress,
        args=(reporter, stage, stop_event, message),
        daemon=True,
    )
    hb_thread.start()
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stderr.write(f"[{log_prefix}] {line}")
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"{log_prefix} exited with code {proc.returncode}")
    finally:
        stop_event.set()
        hb_thread.join(timeout=5)


def _separate_with_binary(
    audio_wav: Path,
    work_dir: Path,
    stems_bin: str,
    reporter: ProgressReporter,
    stage: str,
) -> SeparationResult:
    out_dir = work_dir / "demucs_out"
    out_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    if os.path.exists(SYSTEM_CA_BUNDLE):
        env["SSL_CERT_FILE"] = SYSTEM_CA_BUNDLE
        env["REQUESTS_CA_BUNDLE"] = SYSTEM_CA_BUNDLE

    cmd = [stems_bin, "-o", str(out_dir), str(audio_wav)]
    reporter.report(stage, 0.05, "Running stem separation (SightKick demucs-split)")
    _run_subprocess_with_heartbeat(
        cmd, env, reporter, stage, "Separating stems (demucs-split)", "demucs-split"
    )

    stem_dir = _locate_output(out_dir, audio_wav.stem)
    stems = _collect_stems(stem_dir)
    reporter.stage_done(stage, "Stem separation complete")
    return SeparationResult(stems=stems, engine="demucs-split-binary")


def _separate_with_venv_demucs(
    audio_wav: Path, work_dir: Path, reporter: ProgressReporter, stage: str
) -> SeparationResult:
    out_dir = work_dir / "demucs_out"
    out_dir.mkdir(parents=True, exist_ok=True)

    device = "cpu"
    try:
        import torch

        if torch.backends.mps.is_available():
            device = "mps"
    except Exception:
        pass

    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "-n",
        "htdemucs",
        "-d",
        device,
        "-o",
        str(out_dir),
        str(audio_wav),
    ]
    reporter.report(
        stage,
        0.05,
        f"Running stem separation (demucs, local venv fallback, device={device})",
    )
    _run_subprocess_with_heartbeat(
        cmd, None, reporter, stage, "Separating stems (demucs fallback)", "demucs"
    )

    stem_dir = _locate_output(out_dir, audio_wav.stem)
    stems = _collect_stems(stem_dir)
    reporter.stage_done(stage, "Stem separation complete")
    return SeparationResult(stems=stems, engine="demucs-venv")


def separate_stems(
    audio_wav: Path,
    work_dir: Path,
    stems_bin: str | None,
    reporter: ProgressReporter,
    stage: str = "separate",
) -> SeparationResult:
    if stems_bin:
        try:
            return _separate_with_binary(
                audio_wav, work_dir, stems_bin, reporter, stage
            )
        except Exception as exc:  # noqa: BLE001 — deliberately broad: any failure falls back
            log.warning(
                "stems-bin separation failed (%s); falling back to venv demucs", exc
            )
    return _separate_with_venv_demucs(audio_wav, work_dir, reporter, stage)
