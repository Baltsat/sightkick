#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-$repo_root/release/build}"
source_archive="$repo_root/node_modules/.cache/drumroll-ffmpeg/sources/ffmpeg-8.1.2.tar.xz"
staged_archive="$output_dir/ffmpeg-8.1.2.tar.xz"
expected_sha256="464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c"

if [[ ! -f "$source_archive" ]]; then
    echo "Missing verified FFmpeg corresponding source archive: $source_archive" >&2
    exit 1
fi

source_sha256="$(shasum -a 256 "$source_archive" | awk '{print $1}')"
if [[ "$source_sha256" != "$expected_sha256" ]]; then
    echo "FFmpeg corresponding source SHA-256 mismatch." >&2
    exit 1
fi

mkdir -p "$output_dir"
cp "$source_archive" "$staged_archive"
staged_sha256="$(shasum -a 256 "$staged_archive" | awk '{print $1}')"
if [[ "$staged_sha256" != "$expected_sha256" ]]; then
    echo "Staged FFmpeg corresponding source SHA-256 mismatch." >&2
    exit 1
fi

echo "Staged verified FFmpeg corresponding source at $staged_archive"
