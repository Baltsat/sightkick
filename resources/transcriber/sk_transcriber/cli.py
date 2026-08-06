"""Command-line entry point — implements the SightKick Transcriber contract.

    run.sh --url <youtube-url> --out <dir> [--stems-bin <path>] [--keep-stems] [--difficulty expert]
    run.sh --audio <path>      --out <dir> [--stems-bin <path>] [--keep-stems] [--difficulty expert]

Progress is reported on stdout as ``__SK_EVENT__ {json}`` lines (see
events.py). All logging/diagnostics go to stderr. Exit code 0 on success,
non-zero on failure.
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
import tempfile
import traceback
from pathlib import Path

from sk_transcriber import events
from sk_transcriber.audio_utils import (
    probe_duration_seconds,
    probe_tags,
    to_jpg,
    to_ogg,
    to_wav,
)
from sk_transcriber.beats import estimate_tempo_map
from sk_transcriber.download import download_audio
from sk_transcriber.events import ProgressReporter
from sk_transcriber.logging_setup import configure_logging
from sk_transcriber.midi_writer import write_notes_mid
from sk_transcriber.naming import parse_artist_title, sanitize_folder_name
from sk_transcriber.separate import separate_stems
from sk_transcriber.songini import estimate_diff_drums, write_song_ini
from sk_transcriber.transcribe import ANALYSIS_SR, transcribe_drums

log = logging.getLogger("sk_transcriber.cli")


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="sk-transcriber", description="YouTube/audio to Clone Hero drum chart."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", help="YouTube URL to download and transcribe")
    source.add_argument("--audio", help="Path to a local audio file to transcribe")
    parser.add_argument(
        "--out",
        required=True,
        help="Parent output directory (a song subfolder is created inside it)",
    )
    parser.add_argument(
        "--stems-bin", default=None, help="Path to the SightKick demucs-split binary"
    )
    parser.add_argument(
        "--keep-stems",
        action="store_true",
        help="Keep raw separated stem files alongside the song folder",
    )
    parser.add_argument(
        "--difficulty",
        default="expert",
        help="Chart difficulty to generate (only 'expert' is currently supported)",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Verbose logging to stderr"
    )
    return parser.parse_args(argv)


def _derive_local_metadata(path: Path) -> tuple[str, str, str, str, str]:
    """(artist, title, album, year, genre) for a local audio file, from tags
    when present, else parsed from the filename."""
    tags = probe_tags(path)
    raw_artist = tags.get("artist")
    raw_title = tags.get("title") or path.stem
    raw_album = tags.get("album") or "Unknown Album"
    raw_date = tags.get("date") or tags.get("year") or ""
    raw_genre = tags.get("genre") or "Unknown"

    if raw_artist and raw_artist.strip():
        artist, title = raw_artist.strip(), raw_title.strip()
    else:
        artist, title = parse_artist_title(raw_title, None)

    year = (raw_date or "").strip()[:4] or "Unknown"
    return (
        artist or "Unknown Artist",
        title or "Unknown Title",
        raw_album,
        year,
        raw_genre or "Unknown",
    )


def _run(args: argparse.Namespace) -> str:
    if args.difficulty != "expert":
        log.info(
            "--difficulty %r is accepted for compatibility but has no effect: "
            "every run now writes all four difficulties (Easy/Medium/Hard/Expert) "
            "into notes.mid",
            args.difficulty,
        )

    stage_ranges = events.URL_STAGE_RANGES if args.url else events.AUDIO_STAGE_RANGES
    reporter = ProgressReporter(stage_ranges)

    out_parent = Path(args.out).expanduser().resolve()
    out_parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="sk_transcriber_") as tmp:
        work_dir = Path(tmp)

        thumbnail_src: Path | None = None

        if args.url:
            dl = download_audio(args.url, work_dir, reporter)
            mix_wav = dl.audio_path
            artist, title = dl.artist, dl.title
            album = "YouTube"
            year = (dl.upload_date or "").strip()[:4] or "Unknown"
            genre = "Unknown"
            thumbnail_src = dl.thumbnail_path
            duration_seconds = dl.duration_seconds or probe_duration_seconds(mix_wav)
            log.info(
                "resolved artist=%r title=%r from title=%r uploader=%r",
                artist,
                title,
                dl.raw_title,
                dl.uploader,
            )
        else:
            src_path = Path(args.audio).expanduser().resolve()
            if not src_path.exists():
                raise RuntimeError(f"audio file not found: {src_path}")
            duration_seconds = probe_duration_seconds(src_path)
            mix_wav = work_dir / "source.wav"
            to_wav(src_path, mix_wav)
            artist, title, album, year, genre = _derive_local_metadata(src_path)
            log.info(
                "resolved artist=%r title=%r from file=%s", artist, title, src_path.name
            )

        song_name = sanitize_folder_name(artist, title)
        song_dir = out_parent / song_name
        song_dir.mkdir(parents=True, exist_ok=True)
        log.info("song folder: %s", song_dir)

        separation = separate_stems(mix_wav, work_dir, args.stems_bin, reporter)
        log.info(
            "separation engine: %s, stems: %s",
            separation.engine,
            sorted(separation.stems),
        )

        tempo_map = estimate_tempo_map(str(mix_wav), duration_seconds, reporter)
        log.info(
            "tempo map: source=%s beats=%d downbeats=%d median_bpm=%.1f time_sig=%s",
            tempo_map.source,
            len(tempo_map.beat_times),
            len(tempo_map.downbeat_times),
            tempo_map.median_bpm(),
            tempo_map.time_signature,
        )

        drums_wav = work_dir / "drums_analysis.wav"
        to_wav(separation.stems["drums"], drums_wav, sr=ANALYSIS_SR, mono=True)
        hits, transcribe_engine = transcribe_drums(str(drums_wav), reporter)
        log.info("transcribe engine: %s, hits: %d", transcribe_engine, len(hits))

        reporter.report("write", 0.05, "Encoding audio outputs")
        to_ogg(mix_wav, song_dir / "song.ogg")
        to_ogg(separation.stems["drums"], song_dir / "drums.ogg")
        for name in ("bass", "vocals", "other"):
            if name in separation.stems:
                to_ogg(separation.stems[name], song_dir / f"{name}.ogg")
        reporter.report("write", 0.55, "Writing album art")

        if thumbnail_src and thumbnail_src.exists():
            try:
                to_jpg(thumbnail_src, song_dir / "album.jpg")
            except Exception as exc:  # noqa: BLE001 — album art is not fatal
                log.warning("failed to write album.jpg: %s", exc)

        reporter.report("write", 0.7, "Writing notes.mid")
        note_counts = write_notes_mid(
            hits,
            tempo_map,
            song_dir / "notes.mid",
            duration_seconds,
            song_title=title,
            song_artist=artist,
        )
        log.info(
            "notes/min by difficulty: easy=%.1f medium=%.1f hard=%.1f expert=%.1f",
            *(
                60.0 * note_counts[d] / duration_seconds if duration_seconds else 0.0
                for d in ("easy", "medium", "hard", "expert")
            ),
        )

        reporter.report("write", 0.9, "Writing song.ini")
        diff_drums = estimate_diff_drums(note_counts["expert"], duration_seconds)
        write_song_ini(
            song_dir / "song.ini",
            name=title,
            artist=artist,
            album=album,
            year=year,
            genre=genre,
            diff_drums=diff_drums,
            song_length_ms=int(round(duration_seconds * 1000)),
            charter="",
        )

        if args.keep_stems:
            raw_dir = song_dir / "raw_stems"
            raw_dir.mkdir(parents=True, exist_ok=True)
            for _name, p in separation.stems.items():
                shutil.copy2(p, raw_dir / p.name)
            log.info("kept raw stems at %s", raw_dir)

        reporter.stage_done("write", "Done")

    return str(song_dir)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    configure_logging(verbose=args.verbose)
    try:
        song_dir = _run(args)
    except KeyboardInterrupt:
        events.error("Interrupted by user")
        sys.exit(130)
    except Exception as exc:  # noqa: BLE001 — top-level boundary: always emit an error event
        log.error("fatal: %s", exc)
        log.debug("%s", traceback.format_exc())
        events.error(str(exc))
        sys.exit(1)
    else:
        events.complete(song_dir)
        sys.exit(0)


if __name__ == "__main__":
    main()
