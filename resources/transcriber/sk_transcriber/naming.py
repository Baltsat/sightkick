"""Artist/Title parsing from a YouTube video title, and song-folder sanitizing."""

from __future__ import annotations

import re

_JUNK_PATTERNS = [
    r"\(\s*official\s*(music\s*)?video\s*\)",
    r"\[\s*official\s*(music\s*)?video\s*\]",
    r"\(\s*official\s*audio\s*\)",
    r"\[\s*official\s*audio\s*\]",
    r"\(\s*official\s*lyric\s*video\s*\)",
    r"\[\s*official\s*lyric\s*video\s*\]",
    r"\(\s*lyrics?\s*\)",
    r"\[\s*lyrics?\s*\]",
    r"\(\s*lyric\s*video\s*\)",
    r"\[\s*lyric\s*video\s*\]",
    r"\(\s*audio\s*\)",
    r"\[\s*audio\s*\]",
    r"\(\s*hd\s*\)",
    r"\[\s*hd\s*\]",
    r"\(\s*hq\s*\)",
    r"\[\s*hq\s*\]",
    r"\(\s*4k\s*\)",
    r"\[\s*4k\s*\]",
    r"\(\s*remaster(ed)?[^)]*\)",
    r"\[\s*remaster(ed)?[^\]]*\]",
    # Catch-all: any parenthetical/bracketed group that merely *contains*
    # "remaster" or "4k" among other words, e.g. "(4K Remaster)",
    # "(Remastered 2009)" — order-independent, unlike the exact patterns above.
    r"\(\s*[^()]*\bremaster(ed)?\b[^()]*\)",
    r"\[\s*[^\[\]]*\bremaster(ed)?\b[^\[\]]*\]",
    r"\(\s*[^()]*\b4k\b[^()]*\)",
    r"\[\s*[^\[\]]*\b4k\b[^\[\]]*\]",
    r"\bofficial\s*(music\s*)?video\b",
    r"\bofficial\s*audio\b",
]
_JUNK_RE = re.compile("|".join(_JUNK_PATTERNS), re.IGNORECASE)

_DASH_SPLIT = re.compile(r"\s+[-–—]\s+")

_INVALID_CHARS = re.compile(r'[\\/:*?"<>|]')
_MULTI_SPACE = re.compile(r"\s{2,}")


def _strip_junk(title: str) -> str:
    out = _JUNK_RE.sub("", title)
    out = _MULTI_SPACE.sub(" ", out)
    return out.strip(" -_–—\t")


def parse_artist_title(title: str | None, uploader: str | None) -> tuple[str, str]:
    """Best-effort ``Artist - Title`` split of a YouTube video title.

    Falls back to the channel/uploader name as the artist when the title has
    no clean ``A - B`` split.
    """
    raw_title = (title or "").strip()
    cleaned = _strip_junk(raw_title)
    parts = _DASH_SPLIT.split(cleaned, maxsplit=1)
    if len(parts) == 2 and parts[0].strip() and parts[1].strip():
        artist, song = parts[0].strip(), parts[1].strip()
    else:
        artist = (uploader or "").strip() or "Unknown Artist"
        song = cleaned.strip() or raw_title.strip() or "Unknown Title"
    return (artist or "Unknown Artist", song or "Unknown Title")


def sanitize_folder_name(artist: str, title: str, max_len: int = 180) -> str:
    """``<Artist> - <Title>``, stripped of filesystem-hostile characters."""
    raw = f"{artist} - {title}"
    cleaned = _INVALID_CHARS.sub("", raw)
    cleaned = _MULTI_SPACE.sub(" ", cleaned).strip(" .")
    if not cleaned:
        cleaned = "Unknown Artist - Unknown Title"
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip(" .")
    return cleaned
