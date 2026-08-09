#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_output="$(mktemp -d "${TMPDIR:-/tmp}/drumroll-web-functions.XXXXXX")"

cleanup() {
    rm -rf -- "$temporary_output"
}
trap cleanup EXIT

cd "$repo_root"

yarn tsc \
    --noEmit \
    --ignoreConfig \
    --strict \
    --skipLibCheck \
    --target ES2022 \
    --module ESNext \
    --moduleResolution Bundler \
    --lib DOM,ES2022 \
    'web/functions/api/import/[[path]].ts'

yarn wrangler pages functions build web/functions \
    --outdir "$temporary_output" \
    --project-directory web \
    --compatibility-date 2026-08-08

if ! find "$temporary_output" -type f -size +0c -print -quit | grep -q .; then
    echo "Wrangler did not emit a Pages Functions worker." >&2
    exit 1
fi

echo "Verified the Cloudflare Pages Function with TypeScript and Wrangler."
