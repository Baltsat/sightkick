"""ffmpeg/ffprobe wrappers for format conversion, and small audio helpers.

All ffmpeg/ffprobe invocations are silent on their normal stdout/stderr
(captured, only surfaced on failure) — this module never writes to the
process's own stdout, which is reserved for the ``__SK_EVENT__`` protocol.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np


def _find_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"required tool '{name}' not found on PATH")
    return path


def run_ffmpeg(args: list[str], desc: str) -> None:
    cmd = [_find_tool("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error", *args]
    proc = subprocess.run(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({desc}): {proc.stderr.strip()[-4000:]}")


def to_ogg(src: Path, dst: Path, quality: str = "5") -> None:
    """Encode any input audio to Ogg Vorbis."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [
            "-i",
            str(src),
            "-vn",
            "-map_metadata",
            "-1",
            "-c:a",
            "libvorbis",
            "-q:a",
            quality,
            str(dst),
        ],
        f"encode {dst.name}",
    )


def to_wav(src: Path, dst: Path, sr: int | None = None, mono: bool = False) -> None:
    """Decode any input audio to PCM wav (used for analysis intermediates)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    args = ["-i", str(src)]
    if sr:
        args += ["-ar", str(sr)]
    if mono:
        args += ["-ac", "1"]
    args += ["-c:a", "pcm_s16le", str(dst)]
    run_ffmpeg(args, f"decode {src.name}")


def to_jpg(src: Path, dst: Path, max_dim: int = 720) -> None:
    """Convert/resize any input image (e.g. a YouTube webp thumbnail) to jpg."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [
            "-i",
            str(src),
            "-vf",
            f"scale='min({max_dim},iw)':-2",
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(dst),
        ],
        f"thumbnail {dst.name}",
    )


def probe_duration_seconds(path: Path) -> float:
    cmd = [
        _find_tool("ffprobe"),
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        str(path),
    ]
    proc = subprocess.run(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        raise RuntimeError(f"ffprobe failed on {path}: {proc.stderr.strip()}")
    return float(proc.stdout.strip())


def load_mono(path: Path, sr: int) -> tuple[np.ndarray, int]:
    """Load an audio file as float32 mono via librosa (resampling to ``sr``)."""
    import librosa

    y, actual_sr = librosa.load(str(path), sr=sr, mono=True)
    return y.astype(np.float32), actual_sr
