from __future__ import annotations

import json

import numpy as np
import pytest
import soundfile as sf

from sk_transcriber import cli
from sk_transcriber.transcribe import (
    DrumHit,
    NoDrumsDetectedError,
    assess_drum_presence,
)


def _write_audio(path, samples, sr=22_050):
    sf.write(path, np.asarray(samples, dtype=np.float32), sr)


def _hits(count: int, confidence: float = 0.9) -> list[DrumHit]:
    return [
        DrumHit(
            time=index * 0.5,
            lane="kick",
            velocity=100,
            centroid=80.0,
            confidence=confidence,
        )
        for index in range(count)
    ]


def test_full_band_song_with_clear_drum_evidence_passes(tmp_path):
    sr = 22_050
    duration = 10.0
    t = np.arange(int(sr * duration)) / sr
    backing = 0.08 * np.sin(2 * np.pi * 220 * t)
    drums = np.zeros_like(backing)
    for onset in np.arange(0.25, duration, 0.5):
        start = int(onset * sr)
        length = min(int(0.08 * sr), len(drums) - start)
        drums[start : start + length] += 0.7 * np.exp(-np.arange(length) / (0.015 * sr))
    mix = backing + drums
    mix_path = tmp_path / "song.wav"
    drums_path = tmp_path / "drums.wav"
    _write_audio(mix_path, mix)
    _write_audio(drums_path, drums)

    evidence = assess_drum_presence(str(mix_path), str(drums_path), _hits(20), duration)

    assert evidence.present
    assert evidence.drum_rms_ratio >= 0.035
    assert evidence.onsets_per_minute == 120.0
    assert evidence.mean_confidence == pytest.approx(0.9)


def test_speechlike_tone_with_tiny_drum_residual_is_rejected(tmp_path):
    sr = 22_050
    duration = 10.0
    t = np.arange(int(sr * duration)) / sr
    mix = 0.2 * np.sin(2 * np.pi * (140 + 30 * np.sin(2 * np.pi * 2 * t)) * t)
    drums = mix * 0.01
    mix_path = tmp_path / "speechlike.wav"
    drums_path = tmp_path / "drums.wav"
    _write_audio(mix_path, mix)
    _write_audio(drums_path, drums)

    evidence = assess_drum_presence(str(mix_path), str(drums_path), _hits(20), duration)

    assert not evidence.present
    assert evidence.drum_rms_ratio < 0.035


def test_sparse_or_low_confidence_onsets_are_rejected(tmp_path):
    sr = 22_050
    mix = np.full(sr * 10, 0.2, dtype=np.float32)
    drums = np.full(sr * 10, 0.1, dtype=np.float32)
    mix_path = tmp_path / "mix.wav"
    drums_path = tmp_path / "drums.wav"
    _write_audio(mix_path, mix)
    _write_audio(drums_path, drums)

    assert not assess_drum_presence(
        str(mix_path), str(drums_path), _hits(1), 10.0
    ).present
    assert not assess_drum_presence(
        str(mix_path), str(drums_path), _hits(20, confidence=0.2), 10.0
    ).present


def test_cli_emits_coded_no_drums_error_and_exits_nonzero(monkeypatch, capsys):
    def reject(_args):
        raise NoDrumsDetectedError()

    monkeypatch.setattr(cli, "_run", reject)

    with pytest.raises(SystemExit) as exit_info:
        cli.main(["--audio", "input.wav", "--out", "out"])

    assert exit_info.value.code == 1
    line = capsys.readouterr().out.strip()
    assert line.startswith("__SK_EVENT__ ")
    assert json.loads(line.removeprefix("__SK_EVENT__ ")) == {
        "kind": "error",
        "message": "No drums detected in this audio",
        "code": "no-drums",
    }
