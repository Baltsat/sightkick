#!/usr/bin/env bash

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SK_TRANSCRIBER_DATA:-${HOME:?}/Library/Application Support/sight-kick/transcriber}"
VENV_DIR="$DATA_DIR/.venv"

mkdir -p "$DATA_DIR"

if [ -n "${SK_FFMPEG:-}" ]; then
    if [ ! -x "$SK_FFMPEG" ]; then
        echo "sk-transcriber: SK_FFMPEG does not point to an executable ffmpeg binary: $SK_FFMPEG" >&2
        exit 1
    fi
elif command -v ffmpeg >/dev/null 2>&1; then
    SK_FFMPEG="$(command -v ffmpeg)"
    export SK_FFMPEG
else
    echo "sk-transcriber: ffmpeg is required; set SK_FFMPEG or add ffmpeg to PATH" >&2
    exit 1
fi

export PYTHONPATH="$DIR${PYTHONPATH:+:$PYTHONPATH}"

if [ -n "${SK_UV:-}" ]; then
    if [ ! -x "$SK_UV" ]; then
        echo "sk-transcriber: SK_UV does not point to an executable uv binary: $SK_UV" >&2
        exit 1
    fi
    UV_BIN="$SK_UV"
elif command -v uv >/dev/null 2>&1; then
    UV_BIN="$(command -v uv)"
else
    UV_BIN=""
fi

if [ -n "$UV_BIN" ]; then
    export UV_PROJECT_ENVIRONMENT="$VENV_DIR"
    exec "$UV_BIN" run --locked --project "$DIR" --directory "$DATA_DIR" python -m sk_transcriber "$@"
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "sk-transcriber: uv or Python 3.12+ is required, but neither was found" >&2
    exit 1
fi

PYTHON_BIN="$(command -v python3)"
if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(sys.version_info < (3, 12))'; then
    echo "sk-transcriber: Python 3.12+ is required by the pinned audio dependencies" >&2
    exit 1
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

VENV_PYTHON="$VENV_DIR/bin/python"
STAMP="$DATA_DIR/pyproject.toml"
if [ ! -f "$STAMP" ] || ! cmp -s "$DIR/pyproject.toml" "$STAMP"; then
    REQUIREMENTS="$DATA_DIR/requirements.txt"
    "$PYTHON_BIN" -c 'import pathlib, sys, tomllib; data = tomllib.loads(pathlib.Path(sys.argv[1]).read_text()); pathlib.Path(sys.argv[2]).write_text("\n".join(data["project"]["dependencies"]) + "\n")' "$DIR/pyproject.toml" "$REQUIREMENTS"
    "$VENV_PYTHON" -m pip install --disable-pip-version-check --requirement "$REQUIREMENTS"
    cp "$DIR/pyproject.toml" "$STAMP"
fi

exec "$VENV_PYTHON" -m sk_transcriber "$@"
