#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
requested_output="${1:-$repo_root/release/local-api-key-$timestamp}"
output_dir="$(node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "$requested_output")"

# The existing local credential names remain the source of truth. Accepting
# APPLE_* as explicit overrides also keeps this script compatible with the
# exact environment contract consumed by electron-builder 26.
export APPLE_API_KEY="${APPLE_API_KEY:-${ASC_API_KEY_PATH:-}}"
export APPLE_API_KEY_ID="${APPLE_API_KEY_ID:-${ASC_KEY_ID:-}}"
export APPLE_API_ISSUER="${APPLE_API_ISSUER:-${ASC_ISSUER_ID:-}}"

for variable_name in APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER; do
    if [[ -z "${!variable_name:-}" ]]; then
        echo "Missing App Store Connect credential mapping for $variable_name" >&2
        exit 1
    fi
done

if [[ ! -f "$APPLE_API_KEY" || ! -r "$APPLE_API_KEY" ]]; then
    echo "The mapped App Store Connect API key path is not a readable file." >&2
    exit 1
fi

case "$output_dir" in
"$repo_root/release/"*)
    ;;
*)
    echo "Local release output must be a new directory under $repo_root/release." >&2
    exit 1
    ;;
esac

if [[ "$output_dir" == "$repo_root/release/build" ]]; then
    echo "Refusing to reuse release/build; choose a new local release directory." >&2
    exit 1
fi
if [[ -e "$output_dir" ]]; then
    echo "Refusing to overwrite existing local release output: $output_dir" >&2
    exit 1
fi

cd "$repo_root"
corepack yarn package:prepare:mac
corepack yarn verify:ffmpeg:mac
corepack yarn verify:ffmpeg:transcriber
corepack yarn electron-builder build \
    --mac \
    --arm64 \
    --publish never \
    --config.directories.output="$output_dir"
corepack yarn release:stage-ffmpeg-source "$output_dir"

shopt -s nullglob
disk_images=("$output_dir"/*.dmg)
shopt -u nullglob
if [[ "${#disk_images[@]}" -ne 1 ]]; then
    echo "Expected exactly one DMG after the local release build." >&2
    exit 1
fi
expected_disk_image="$output_dir/Drumroll-1.2.0-kb.10-arm64.dmg"
if [[ "${disk_images[0]}" != "$expected_disk_image" ]]; then
    echo "Unexpected DMG name: ${disk_images[0]}" >&2
    echo "Expected: $expected_disk_image" >&2
    exit 1
fi

corepack yarn release:verify:mac "$output_dir/mac-arm64/Drumroll.app"
"$repo_root/scripts/notarize-macos-dmg.sh" "$expected_disk_image"
node "$repo_root/scripts/finalize-macos-release-metadata.mjs" \
    "$output_dir" \
    --write
corepack yarn release:verify:mac "$expected_disk_image"
corepack yarn release:checksums "$output_dir"

echo "Verified local release artifacts are available at $output_dir"
