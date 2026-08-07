"""Stage 1: download audio (+ metadata + thumbnail) from a YouTube URL."""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from pathlib import Path

from sk_transcriber.events import ProgressReporter
from sk_transcriber.naming import parse_artist_title

log = logging.getLogger("sk_transcriber.download")


@dataclass
class DownloadResult:
    audio_path: Path  # wav, full mix
    thumbnail_path: Path | None
    artist: str
    title: str
    raw_title: str
    uploader: str | None
    upload_date: str | None  # YYYYMMDD or None
    duration_seconds: float
    webpage_url: str


class _YdlLogger:
    """Routes yt-dlp's own log lines to stderr instead of stdout."""

    def debug(self, msg: str) -> None:
        if msg.startswith("[debug] "):
            return
        sys.stderr.write(f"[yt-dlp] {msg}\n")

    def info(self, msg: str) -> None:
        sys.stderr.write(f"[yt-dlp] {msg}\n")

    def warning(self, msg: str) -> None:
        sys.stderr.write(f"[yt-dlp] WARNING: {msg}\n")

    def error(self, msg: str) -> None:
        sys.stderr.write(f"[yt-dlp] ERROR: {msg}\n")


def _make_progress_hook(reporter: ProgressReporter, stage: str):
    def hook(d: dict) -> None:
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)
            frac = (downloaded / total) if total else 0.0
            pct_str = (d.get("_percent_str") or "").strip()
            reporter.report(stage, frac * 0.85, f"Downloading audio {pct_str}".strip())
        elif status == "finished":
            reporter.report(stage, 0.9, "Download finished, extracting audio")

    return hook


def download_audio(
    url: str, work_dir: Path, reporter: ProgressReporter, stage: str = "download"
) -> DownloadResult:
    import yt_dlp

    work_dir.mkdir(parents=True, exist_ok=True)
    out_template = str(work_dir / "source.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "0",
            },
            {"key": "FFmpegThumbnailsConvertor", "format": "jpg"},
        ],
        "writethumbnail": True,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "logger": _YdlLogger(),
        "progress_hooks": [_make_progress_hook(reporter, stage)],
        "retries": 5,
        "fragment_retries": 5,
    }

    reporter.report(stage, 0.0, "Fetching video metadata")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError(f"yt-dlp returned no metadata for {url}")

    audio_path = work_dir / "source.wav"
    if not audio_path.exists():
        # Extremely rare: extraction produced a differently-named file.
        candidates = sorted(work_dir.glob("source.*"))
        wavs = [p for p in candidates if p.suffix.lower() == ".wav"]
        if not wavs:
            raise RuntimeError(
                f"yt-dlp did not produce a wav file in {work_dir} (found: {candidates})"
            )
        audio_path = wavs[0]

    thumbnail_path: Path | None = None
    jpg_candidates = sorted(work_dir.glob("source*.jpg"))
    if jpg_candidates:
        thumbnail_path = jpg_candidates[0]

    raw_title = info.get("title") or "Unknown Title"
    uploader = info.get("uploader") or info.get("channel")
    artist, title = parse_artist_title(raw_title, uploader)

    reporter.stage_done(stage, "Download complete")

    return DownloadResult(
        audio_path=audio_path,
        thumbnail_path=thumbnail_path,
        artist=artist,
        title=title,
        raw_title=raw_title,
        uploader=uploader,
        upload_date=info.get("upload_date"),
        duration_seconds=float(info.get("duration") or 0.0),
        webpage_url=info.get("webpage_url") or url,
    )
