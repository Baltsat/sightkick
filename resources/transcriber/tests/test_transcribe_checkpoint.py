from __future__ import annotations

import hashlib

import pytest
from sk_transcriber import transcribe


class Reporter:
    def report(self, *_args):
        pass


def test_cached_checkpoint_is_verified_before_use(tmp_path, monkeypatch):
    checkpoint = tmp_path / "checkpoint.th"
    checkpoint.write_bytes(b"pinned checkpoint")
    monkeypatch.setattr(transcribe, "DRUMSEP_CACHE", checkpoint)
    monkeypatch.setattr(transcribe, "DRUMSEP_MIN_BYTES", 1)
    monkeypatch.setattr(
        transcribe,
        "DRUMSEP_SHA256",
        hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
    )

    assert transcribe._get_drumsep_checkpoint(Reporter(), "transcribe") == checkpoint


def test_corrupt_cached_checkpoint_is_deleted_and_rejected(tmp_path, monkeypatch):
    checkpoint = tmp_path / "checkpoint.th"
    checkpoint.write_bytes(b"corrupt")
    monkeypatch.setattr(transcribe, "DRUMSEP_CACHE", checkpoint)
    monkeypatch.setattr(transcribe, "DRUMSEP_MIN_BYTES", 1)
    monkeypatch.setattr(transcribe, "DRUMSEP_SHA256", "0" * 64)

    with pytest.raises(RuntimeError, match="SHA-256"):
        transcribe._get_drumsep_checkpoint(Reporter(), "transcribe")

    assert not checkpoint.exists()
