from __future__ import annotations

from pathlib import Path

from yt_dlp.utils import DownloadError

from sk_transcriber import download


def test_cookies_opts_absent_when_env_unset(monkeypatch):
    monkeypatch.delenv("SK_YTDLP_COOKIES", raising=False)

    assert download._cookies_opts() == {}


def test_cookies_opts_present_when_env_set(monkeypatch, tmp_path):
    cookies_file = tmp_path / "cookies.txt"
    monkeypatch.setenv("SK_YTDLP_COOKIES", str(cookies_file))

    assert download._cookies_opts() == {"cookiefile": str(cookies_file)}


def test_cookies_opts_absent_when_env_empty(monkeypatch):
    monkeypatch.setenv("SK_YTDLP_COOKIES", "")

    assert download._cookies_opts() == {}


def test_retries_403_with_android_vr_and_removes_partial_audio(monkeypatch, tmp_path):
    attempts = []

    class Reporter:
        def __init__(self):
            self.messages = []

        def report(self, _stage, _percent, message):
            self.messages.append(message)

        def stage_done(self, _stage, _message):
            pass

    def extract(url, opts):
        attempts.append(opts)

        if len(attempts) == 1:
            (tmp_path / "source.webm.part").write_text("partial")
            raise DownloadError("HTTP Error 403: Forbidden")

        (tmp_path / "source.webm").write_bytes(b"webm")
        return {
            "title": "Artist - Song",
            "uploader": "Artist",
            "duration": 180,
            "webpage_url": url,
        }

    monkeypatch.setattr(download, "_extract_info", extract)
    monkeypatch.setattr(
        download, "to_wav", lambda _source, output: output.write_bytes(b"wav")
    )

    result = download.download_audio(
        "https://www.youtube.com/watch?v=abcdefghijk",
        Path(tmp_path),
        Reporter(),
    )

    assert result.audio_path == tmp_path / "source.wav"
    assert not (tmp_path / "source.webm.part").exists()
    assert attempts[1]["extractor_args"] == {
        "youtube": {"player_client": ["android_vr"]}
    }


def test_retries_android_vr_403_with_embedded_client(monkeypatch, tmp_path):
    attempts = []

    class Reporter:
        def report(self, *_args):
            return None

        def stage_done(self, *_args):
            return None

    class FakeYdl:
        def __init__(self, opts):
            attempts.append(opts)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def extract_info(self, _url, **_kwargs):
            if len(attempts) < 3:
                raise download.DownloadError("HTTP Error 403: Forbidden")
            (tmp_path / "source.webm").write_bytes(b"audio")
            return {"title": "Artist - Song", "uploader": "Artist"}

    monkeypatch.setattr(download, "YoutubeDL", FakeYdl)
    monkeypatch.setattr(
        download, "to_wav", lambda _source, target: target.write_bytes(b"wav")
    )

    result = download.download_audio(
        "https://www.youtube.com/watch?v=test",
        tmp_path,
        Reporter(),
    )

    assert result.audio_path == tmp_path / "source.wav"
    assert attempts[1]["extractor_args"] == {
        "youtube": {"player_client": ["android_vr"]}
    }
    assert attempts[2]["extractor_args"] == {
        "youtube": {"player_client": ["web_embedded"]}
    }
    assert attempts[2]["remote_components"] == ["ejs:github"]


def test_converts_downloaded_audio_with_the_drumroll_ffmpeg_wrapper(
    monkeypatch, tmp_path
):
    source = tmp_path / "source.webm"
    source.write_bytes(b"webm")
    converted = []

    monkeypatch.setattr(
        download,
        "to_wav",
        lambda input_path, output_path: (
            converted.append((input_path, output_path)),
            output_path.write_bytes(b"wav"),
        ),
    )

    result = download._wav_path(tmp_path)

    assert result == tmp_path / "source.wav"
    assert converted == [(source, result)]
