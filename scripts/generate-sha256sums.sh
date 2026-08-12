#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-release/build}"

if [[ ! -d "$output_dir" ]]; then
    echo "Missing artifact directory: $output_dir" >&2
    exit 1
fi

output_dir="$(cd "$output_dir" && pwd)"
checksum_path="$output_dir/SHA256SUMS.txt"
release_version="$(node -e \
    'process.stdout.write(require(process.argv[1]).version)' \
    "$repo_root/package.json")"
artifact_prefix="Drumroll-$release_version-arm64"
expected_artifact_names=(
    "$artifact_prefix.dmg"
    "$artifact_prefix.dmg.blockmap"
    "$artifact_prefix.zip"
    "$artifact_prefix.zip.blockmap"
    'latest-mac.yml'
    'ffmpeg-8.1.2.tar.xz'
)
artifacts=()

for artifact_name in "${expected_artifact_names[@]}"; do
    artifact="$output_dir/$artifact_name"
    if [[ ! -f "$artifact" ]]; then
        echo "Missing required macOS distribution artifact: $artifact_name" >&2
        exit 1
    fi
    artifacts+=("$artifact")
done

while IFS= read -r artifact; do
    artifact_name="${artifact##*/}"
    is_expected=0
    for expected_name in "${expected_artifact_names[@]}"; do
        if [[ "$artifact_name" == "$expected_name" ]]; then
            is_expected=1
            break
        fi
    done
    if [[ "$is_expected" -ne 1 ]]; then
        echo "Unexpected macOS distribution artifact: $artifact_name" >&2
        exit 1
    fi
done < <(
    find "$output_dir" -maxdepth 1 -type f \
        \( \
        -name '*.dmg' -o \
        -name '*.dmg.blockmap' -o \
        -name '*.zip' -o \
        -name '*.zip.blockmap' -o \
        -name '*-mac.yml' -o \
        -name 'ffmpeg-8.1.2.tar.xz' \
        \) \
        -print | LC_ALL=C sort
)

for artifact in "${artifacts[@]}"; do
    if [[ ! -s "$artifact" ]]; then
        echo "Empty distribution artifact: $artifact" >&2
        exit 1
    fi
done

node "$repo_root/scripts/finalize-macos-release-metadata.mjs" \
    "$output_dir" \
    --verify

(
    cd "$output_dir"
    relative_artifacts=()
    for artifact in "${artifacts[@]}"; do
        relative_artifacts+=("${artifact##*/}")
    done
    shasum -a 256 "${relative_artifacts[@]}" >"$checksum_path"
    if [[ "$(wc -l <"$checksum_path" | tr -d ' ')" -ne "${#relative_artifacts[@]}" ]]; then
        echo "Checksum manifest row count does not match the artifact set." >&2
        exit 1
    fi
    for artifact in "${relative_artifacts[@]}"; do
        # Match the filename field exactly. A plain fixed-string grep also
        # matches `foo.dmg.blockmap` when checking `foo.dmg`.
        match_count="$(awk -v expected="$artifact" '$2 == expected { count += 1 } END { print count + 0 }' "$checksum_path")"
        if [[ "$match_count" -ne 1 ]]; then
            echo "Checksum manifest does not contain exactly one row for $artifact" >&2
            exit 1
        fi
    done
    shasum -a 256 -c "${checksum_path##*/}"
)

echo "Wrote and verified $checksum_path"
