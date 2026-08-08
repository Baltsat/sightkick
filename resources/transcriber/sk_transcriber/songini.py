"""Stage 5 (part 2): write ``song.ini``."""

from __future__ import annotations

from pathlib import Path


def estimate_diff_drums(expert_note_count: int, duration_seconds: float) -> int:
    """Rough 0-6 difficulty estimate (Rock Band/CH convention: this rates
    the hardest chart in the file, i.e. Expert) from its post-playability-cap
    note density."""
    if duration_seconds <= 0 or not expert_note_count:
        return 0
    nps = expert_note_count / duration_seconds
    buckets = [1.5, 2.5, 3.5, 4.5, 6.0, 8.0]
    diff = 0
    for i, thresh in enumerate(buckets):
        if nps >= thresh:
            diff = i + 1
    return max(0, min(6, diff))


def write_song_ini(
    out_path: Path,
    *,
    name: str,
    artist: str,
    album: str,
    year: str,
    genre: str,
    diff_drums: int,
    song_length_ms: int,
    charter: str = "",
) -> None:
    lines = [
        "[song]",
        f"name = {name}",
        f"artist = {artist}",
        f"album = {album}",
        f"year = {year}",
        f"genre = {genre}",
        f"charter = {charter}",
        "auto_chart_tool = Drumroll Transcriber",
        "auto_chart = True",
        f"diff_drums = {diff_drums}",
        "pro_drums = True",
        f"song_length = {song_length_ms}",
        "delay = 0",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")
