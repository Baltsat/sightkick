from __future__ import annotations

from types import SimpleNamespace

from sk_transcriber import audio_utils


def test_explicit_ffmpeg_binary_overrides_path(tmp_path, monkeypatch):
    ffmpeg = tmp_path / "ffmpeg"
    ffmpeg.write_text("")
    ffmpeg.chmod(0o700)
    monkeypatch.setenv("SK_FFMPEG", str(ffmpeg))
    monkeypatch.setattr(audio_utils.shutil, "which", lambda _name: None)

    assert audio_utils._find_tool("ffmpeg") == str(ffmpeg)


def test_duration_falls_back_to_explicit_ffmpeg_when_ffprobe_is_absent(
    tmp_path, monkeypatch
):
    ffmpeg = tmp_path / "ffmpeg"
    ffmpeg.write_text("")
    ffmpeg.chmod(0o700)
    audio = tmp_path / "audio.wav"
    audio.write_bytes(b"audio")
    monkeypatch.setenv("SK_FFMPEG", str(ffmpeg))
    monkeypatch.delenv("SK_FFPROBE", raising=False)
    monkeypatch.setattr(audio_utils.shutil, "which", lambda _name: None)
    monkeypatch.setattr(
        audio_utils.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="Duration: 00:01:02.50, start: 0.000000, bitrate: 1 kb/s",
        ),
    )

    assert audio_utils.probe_duration_seconds(audio) == 62.5


def test_ogg_encoding_uses_native_vorbis_when_libvorbis_is_missing(
    tmp_path, monkeypatch
):
    calls = []

    def run(args, desc):
        calls.append((args, desc))
        if "libvorbis" in args:
            raise RuntimeError("Unknown encoder 'libvorbis'")

    monkeypatch.setattr(audio_utils, "run_ffmpeg", run)

    audio_utils.to_ogg(tmp_path / "source.wav", tmp_path / "output.ogg")

    assert "libvorbis" in calls[0][0]
    assert "vorbis" in calls[1][0]
    assert "experimental" in calls[1][0]
