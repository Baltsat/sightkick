#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/drumroll-web-release.XXXXXX")"
preview_log="$temporary_dir/vite-preview.log"
preview_pid=""
preview_url='http://127.0.0.1:8788'

cleanup() {
    if [[ -n "$preview_pid" ]] && kill -0 "$preview_pid" 2>/dev/null; then
        kill "$preview_pid" 2>/dev/null || true
        wait "$preview_pid" 2>/dev/null || true
    fi
    rm -rf -- "$temporary_dir"
}
trap cleanup EXIT

cd "$repo_root"

yarn package:lesson-library
yarn web:functions:check
yarn vite build --config web/vite.config.ts

yarn vite preview \
    --config web/vite.config.ts \
    --host 127.0.0.1 \
    --port 8788 \
    --strictPort >"$preview_log" 2>&1 &
preview_pid="$!"

preview_ready=0
for _ in $(seq 1 60); do
    if curl --fail --silent --show-error "$preview_url/" >/dev/null; then
        preview_ready=1
        break
    fi
    if ! kill -0 "$preview_pid" 2>/dev/null; then
        break
    fi
    sleep 1
done

if [[ "$preview_ready" -ne 1 ]]; then
    echo "The built website did not become ready at $preview_url." >&2
    sed -n '1,240p' "$preview_log" >&2
    exit 1
fi

WEB_SMOKE_SHOT_DIR="$temporary_dir/screenshots" \
    node web/scripts/web-smoke.mjs "$preview_url"

if ! kill -0 "$preview_pid" 2>/dev/null; then
    echo "The Vite preview process exited during the website smoke test." >&2
    sed -n '1,240p' "$preview_log" >&2
    exit 1
fi

echo "Verified the generated website, Pages Function, release link, 170-lesson manifest, and primary browser flows."
