#!/usr/bin/env python3
"""Exercise the release FFmpeg through the transcriber's real wrappers."""

from __future__ import annotations

import base64
import math
import os
import struct
import sys
import tempfile
import wave
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "resources" / "transcriber"))

from sk_transcriber import audio_utils  # noqa: E402


MP3_FIXTURE = base64.b64decode(
    (REPO_ROOT / "scripts" / "fixtures" / "audio-utils-tone.mp3.base64").read_text(
        encoding="ascii"
    )
)
PNG_FIXTURE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YA"
    "AAAASUVORK5CYII="
)


def write_wav(path: Path) -> None:
    sample_rate = 48_000
    samples = [
        round(math.sin(2 * math.pi * 440 * index / sample_rate) * 8_000)
        for index in range(sample_rate // 4)
    ]
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(struct.pack(f"<{len(samples)}h", *samples))


def main() -> int:
    ffmpeg = Path(os.environ.get("SK_FFMPEG", ""))
    ffprobe = Path(os.environ.get("SK_FFPROBE", ""))
    if not ffmpeg.is_file() or not os.access(ffmpeg, os.X_OK):
        raise RuntimeError("SK_FFMPEG must identify the release FFmpeg executable")
    if not ffprobe.is_file() or not os.access(ffprobe, os.X_OK):
        raise RuntimeError("SK_FFPROBE must identify the release ffprobe executable")

    with tempfile.TemporaryDirectory(prefix="drumroll-audio-utils-") as temp:
        root = Path(temp)
        wav = root / "tone.wav"
        mp3 = root / "tone.mp3"
        ogg = root / "tone.ogg"
        decoded_ogg = root / "decoded-ogg.wav"
        decoded_mp3 = root / "decoded-mp3.wav"
        png = root / "pixel.png"
        jpg = root / "pixel.jpg"

        write_wav(wav)
        mp3.write_bytes(MP3_FIXTURE)
        png.write_bytes(PNG_FIXTURE)

        audio_utils.to_ogg(wav, ogg)
        audio_utils.to_wav(ogg, decoded_ogg, sr=44_100, mono=True)
        audio_utils.to_wav(mp3, decoded_mp3, sr=44_100, mono=True)
        audio_utils.to_jpg(png, jpg, max_dim=720)
        ogg_duration = audio_utils.probe_duration_seconds(ogg)
        mp3_duration = audio_utils.probe_duration_seconds(mp3)

        if not (ogg.stat().st_size > 0 and decoded_ogg.stat().st_size > 44):
            raise RuntimeError("Native Vorbis encode/decode wrapper proof failed")
        if decoded_mp3.stat().st_size <= 44:
            raise RuntimeError("MP3 decoder wrapper proof failed")
        if jpg.stat().st_size <= 0:
            raise RuntimeError("Thumbnail wrapper proof failed")
        if ogg_duration <= 0 or mp3_duration <= 0:
            raise RuntimeError("ffprobe duration wrapper proof failed")

    print(
        "Verified audio_utils with the release runtime: native Vorbis to_ogg, "
        "OGG/MP3 to_wav, PNG to_jpg, and ffprobe duration."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
