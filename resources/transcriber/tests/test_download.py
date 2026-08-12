from __future__ import annotations

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
