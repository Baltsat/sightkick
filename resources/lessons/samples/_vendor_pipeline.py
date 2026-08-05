#!/usr/bin/env python3
"""One-time vendoring pipeline for resources/lessons/samples/*.wav.

Downloads the specific raw one-shots this project uses from the
Virtuosity Drums CC0 sample library (see ATTRIBUTION.md), then trims,
normalizes, and re-encodes them into the small mono 16-bit 44.1kHz WAV
files that generate.py actually reads at runtime.

This script is NOT part of the generate.py runtime pipeline and is not
run automatically -- it's kept here so the vendored samples/*.wav files
are reproducible from source. Re-run it only if you want to change which
source hits are used (e.g. a different velocity layer or mic position).

Usage:
    python3 resources/lessons/samples/_vendor_pipeline.py

Requires: ffmpeg/ffprobe on PATH, network access to raw.githubusercontent.com.
"""

from __future__ import annotations

import re
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW_CACHE = HERE / "_vendor_raw_cache"  # gitignored scratch dir, safe to delete

REPO_BASE = (
    "https://raw.githubusercontent.com/studiorack/virtuosity-drums/main/Samples/mid"
)

TARGET_PEAK_DB = -12.0
SR = 44100

TRIM_FILTER = (
    "aformat=channel_layouts=mono,"
    "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-60dB:detection=peak,"
    "silenceremove=stop_periods=1:stop_duration=0.4:stop_threshold=-45dB:detection=peak"
)

# (output filename, source path under Samples/mid/)
MAP = [
    ("kick.wav", "kick/mid_kick_snon_vl4_rr1.flac"),
    ("snare.wav", "snare/mid_snare_center_vl36.flac"),
    ("snare_rimshot.wav", "snare/mid_snare_rimshot_vl12.flac"),
    ("hihat_closed.wav", "hh/mid_hh_closed_vl4_rr1.flac"),
    ("hihat_open.wav", "hh/mid_hh_open_vl4_rr1.flac"),
    ("ride.wav", "ride/mid_ride_ride_vl3_rr1.flac"),
    ("crash.wav", "crash/mid_crash_crash_vl3_rr1.flac"),
    ("tom_high.wav", "htom/mid_htom_center_vl16.flac"),
    ("tom_mid.wav", "ltom/mid_ltom_center_vl16.flac"),
]


def fetch(rel_path: str) -> Path:
    RAW_CACHE.mkdir(exist_ok=True)
    dst = RAW_CACHE / Path(rel_path).name
    if not dst.exists():
        url = f"{REPO_BASE}/{rel_path}"
        print(f"  fetching {url}")
        urllib.request.urlretrieve(url, dst)
    return dst


def ffprobe_duration(path: Path) -> float:
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    return float(out)


def measure_peak_db(path: Path, filt: str) -> float:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(path),
            "-af",
            f"{filt},volumedetect",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    m = re.search(r"max_volume:\s*(-?\d+\.?\d*) dB", proc.stderr)
    if not m:
        raise RuntimeError(f"could not measure peak for {path}:\n{proc.stderr}")
    return float(m.group(1))


def process(out_name: str, rel_path: str) -> None:
    src = fetch(rel_path)
    peak = measure_peak_db(src, TRIM_FILTER)
    gain = TARGET_PEAK_DB - peak

    dst = HERE / out_name
    tmp = dst.with_suffix(".tmp.wav")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(src),
            "-af",
            f"{TRIM_FILTER},volume={gain:.2f}dB,afade=t=in:st=0:d=0.002",
            "-ar",
            str(SR),
            "-sample_fmt",
            "s16",
            str(tmp),
        ],
        check=True,
    )
    tdur = ffprobe_duration(tmp)
    fade_start = max(0.0, tdur - 0.015)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(tmp),
            "-af",
            f"afade=t=out:st={fade_start:.3f}:d=0.015",
            "-ar",
            str(SR),
            "-sample_fmt",
            "s16",
            str(dst),
        ],
        check=True,
    )
    tmp.unlink()
    print(
        f"  {out_name:20s} <- {rel_path:40s} peak {peak:+6.1f}dB -> gain {gain:+5.1f}dB, dur {ffprobe_duration(dst):.3f}s"
    )


def derive_floor_tom() -> None:
    """tom_low.wav (T3, floor tom): the source library only has high/low
    toms. Pitch tom_mid.wav down 4 semitones (asetrate/aresample) to stand
    in for the missing floor tom -- deterministic, offline, no new
    license surface."""
    tom_mid = HERE / "tom_mid.wav"
    tom_low = HERE / "tom_low.wav"
    ratio = 2 ** (-4 / 12)
    new_rate = round(SR * ratio)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(tom_mid),
            "-af",
            f"asetrate={new_rate},aresample={SR}",
            "-ar",
            str(SR),
            "-sample_fmt",
            "s16",
            str(tom_low),
        ],
        check=True,
    )
    print(
        f"  {'tom_low.wav':20s} <- derived from tom_mid.wav (pitched -4 semitones), dur {ffprobe_duration(tom_low):.3f}s"
    )


def main() -> int:
    if subprocess.run(["which", "ffmpeg"], capture_output=True).returncode != 0:
        sys.exit("ffmpeg not found on PATH")
    print("Vendoring drum samples from studiorack/virtuosity-drums (CC0)...")
    for out_name, rel_path in MAP:
        process(out_name, rel_path)
    derive_floor_tom()
    print(f"done. Raw FLAC cache kept at {RAW_CACHE} (safe to delete).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
