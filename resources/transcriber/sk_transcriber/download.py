"""Stage 1: download audio (+ metadata + thumbnail) from a YouTube URL."""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from sk_transcriber.audio_utils import to_jpg, to_wav
from sk_transcriber.events import ProgressReporter
from sk_transcriber.naming import parse_artist_title

log = logging.getLogger("sk_transcriber.download")


def _cookies_opts() -> dict[str, str]:
    """yt-dlp options to authenticate past YouTube's bot-check wall.

    Set ``SK_YTDLP_COOKIES`` to the path of a Netscape-format cookies.txt
    (e.g. exported via a browser extension) to let yt-dlp send it as
    ``--cookies``. Unset by default — no cookies are read or sent unless
    the caller opts in explicitly.
    """
    cookies_path = os.environ.get("SK_YTDLP_COOKIES")
    if not cookies_path:
        return {}
    return {"cookiefile": cookies_path}


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


def _retry_opts(
    ydl_opts: dict,
    player_client: str,
    remote_components: list[str] | None = None,
) -> dict:
    options = {
        **ydl_opts,
        "extractor_args": {"youtube": {"player_client": [player_client]}},
    }
    if remote_components:
        options["remote_components"] = remote_components

    return options


def _extract_info(url: str, ydl_opts: dict) -> dict:
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError(f"yt-dlp returned no metadata for {url}")

    return info


def _wav_path(work_dir: Path) -> Path:
    candidates = sorted(
        candidate
        for candidate in work_dir.glob("source.*")
        if candidate.is_file()
        and candidate.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}
    )
    if not candidates:
        raise RuntimeError(f"yt-dlp did not produce audio in {work_dir}")

    audio_path = work_dir / "source.wav"
    to_wav(candidates[0], audio_path)
    return audio_path


def _thumbnail_path(work_dir: Path) -> Path | None:
    for candidate in sorted(work_dir.glob("source*")):
        if candidate.suffix.lower() in {".jpg", ".jpeg"}:
            return candidate
        if candidate.suffix.lower() in {".webp", ".png"}:
            output = work_dir / "source.jpg"
            to_jpg(candidate, output)
            return output

    return None


def download_audio(
    url: str, work_dir: Path, reporter: ProgressReporter, stage: str = "download"
) -> DownloadResult:
    work_dir.mkdir(parents=True, exist_ok=True)
    out_template = str(work_dir / "source.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "writethumbnail": True,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "logger": _YdlLogger(),
        "progress_hooks": [_make_progress_hook(reporter, stage)],
        "retries": 5,
        "fragment_retries": 5,
        **_cookies_opts(),
    }

    reporter.report(stage, 0.0, "Fetching video metadata")
    try:
        info = _extract_info(url, ydl_opts)
    except DownloadError as exc:
        if "HTTP Error 403" not in str(exc):
            raise

        reporter.report(
            stage,
            0.0,
            "Retrying audio download with a compatible YouTube client",
        )
        for candidate in work_dir.glob("source*"):
            if candidate.is_file():
                candidate.unlink()
        try:
            info = _extract_info(url, _retry_opts(ydl_opts, "android_vr"))
        except DownloadError as retry_exc:
            if "HTTP Error 403" not in str(retry_exc):
                raise

            reporter.report(
                stage,
                0.0,
                "Retrying audio download with the embedded YouTube player",
            )
            for candidate in work_dir.glob("source*"):
                if candidate.is_file():
                    candidate.unlink()
            info = _extract_info(
                url,
                _retry_opts(
                    ydl_opts,
                    "web_embedded",
                    remote_components=["ejs:github"],
                ),
            )

    audio_path = _wav_path(work_dir)
    thumbnail_path = _thumbnail_path(work_dir)

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
