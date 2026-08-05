#!/usr/bin/env bash
# SightKick Transcriber entry point.
#
#   run.sh --url <youtube-url> --out <dir> [--stems-bin <path>] [--keep-stems] [--difficulty expert]
#   run.sh --audio <path>      --out <dir> [--stems-bin <path>] [--keep-stems] [--difficulty expert]
#
# Bootstraps (or reuses) its own Python venv via `uv` and execs the CLI —
# the caller needs no Python knowledge or pre-installed dependencies beyond
# `uv`, `ffmpeg`/`ffprobe`, and (for --url) network access.
#
# Progress/result are reported on stdout as `__SK_EVENT__ {json}` lines.
# All logs/diagnostics go to stderr. Exit code 0 on success, non-zero on
# failure — see README.md for the full contract.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve uv: prefer the known install location, then PATH.
if [ -x "/Users/konstantinbaltsat/.local/bin/uv" ]; then
    UV_BIN="/Users/konstantinbaltsat/.local/bin/uv"
elif command -v uv >/dev/null 2>&1; then
    UV_BIN="$(command -v uv)"
else
    echo "sk-transcriber: 'uv' is required but was not found (checked /Users/konstantinbaltsat/.local/bin/uv and PATH)" >&2
    exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "sk-transcriber: 'ffmpeg' is required but was not found on PATH" >&2
    exit 1
fi

# librosa's numba-JIT peak-picking path throws (and internally retries/
# logs) a TypingError against this numba/numpy combination on Apple
# Silicon; the pure-Python fallback it lands on is correct and plenty fast
# for onset arrays of this size, so we skip the noisy JIT attempt entirely.
export NUMBA_DISABLE_JIT=1

# `uv run` creates/reuses $DIR/.venv and syncs it against pyproject.toml /
# uv.lock automatically — idempotent and fast when already in sync. All of
# uv's own setup chatter goes to stderr (via 2>&1 redirection below is NOT
# used — uv already writes its progress to stderr by default), keeping
# stdout clean for the __SK_EVENT__ protocol.
exec "$UV_BIN" run --directory "$DIR" python -m sk_transcriber "$@"
