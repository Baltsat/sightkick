#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contract_script="$repo_root/scripts/ffmpeg-runtime-contract.mjs"
verify_script="$repo_root/scripts/verify-ffmpeg-runtime.mjs"
cache_root="$repo_root/node_modules/.cache/drumroll-ffmpeg"
runtime_root="$cache_root/macos-arm64"
archive_path="$cache_root/sources/ffmpeg-8.1.2.tar.xz"
source_url="https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz"
source_sha256="464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c"
build_root=""
previous_runtime=""

cleanup() {
    if [[ -n "$build_root" && -d "$build_root" ]]; then
        case "$build_root" in
        "${TMPDIR:-/tmp}"/drumroll-ffmpeg-build.*)
            rm -rf -- "$build_root"
            ;;
        esac
    fi

    if [[ -n "$previous_runtime" && -d "$previous_runtime" ]]; then
        if [[ ! -e "$runtime_root" ]]; then
            mv "$previous_runtime" "$runtime_root"
        else
            rm -rf -- "$previous_runtime"
        fi
    fi
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    echo "The bundled Drumroll FFmpeg runtime can only be built on Apple Silicon macOS." >&2
    echo "Other platforms must provide an executable with SK_FFMPEG or PATH." >&2
    exit 1
fi

for command in node clang xcrun make curl tar shasum file otool vtool; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "Missing FFmpeg build requirement: $command" >&2
        exit 1
    }
done

if [[ -d "$runtime_root" ]] && node "$verify_script" "$runtime_root" >/dev/null 2>&1; then
    echo "Using verified cached FFmpeg 8.1.2 LGPL runtime at $runtime_root"
    exit 0
fi

mkdir -p "$(dirname "$archive_path")"
if [[ -f "$archive_path" ]]; then
    actual_archive_sha="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
    if [[ "$actual_archive_sha" != "$source_sha256" ]]; then
        mv "$archive_path" "$archive_path.rejected.$$"
    fi
fi

if [[ ! -f "$archive_path" ]]; then
    download_path="$archive_path.download.$$"
    curl \
        --fail \
        --location \
        --proto '=https' \
        --tlsv1.2 \
        --retry 5 \
        --retry-all-errors \
        --output "$download_path" \
        "$source_url"
    actual_archive_sha="$(shasum -a 256 "$download_path" | awk '{print $1}')"
    if [[ "$actual_archive_sha" != "$source_sha256" ]]; then
        echo "FFmpeg source archive SHA-256 mismatch." >&2
        exit 1
    fi
    mv "$download_path" "$archive_path"
fi

actual_archive_sha="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
if [[ "$actual_archive_sha" != "$source_sha256" ]]; then
    echo "Cached FFmpeg source archive SHA-256 mismatch." >&2
    exit 1
fi

build_root="$(mktemp -d "${TMPDIR:-/tmp}/drumroll-ffmpeg-build.XXXXXX")"
tar -xJf "$archive_path" -C "$build_root"
source_root="$build_root/ffmpeg-8.1.2"
stage_root="$build_root/runtime"

if [[ ! -x "$source_root/configure" ]]; then
    echo "The verified FFmpeg archive did not contain ffmpeg-8.1.2/configure." >&2
    exit 1
fi

configure_args=()
while IFS= read -r configure_arg; do
    configure_args+=("$configure_arg")
done < <(node "$contract_script" --configure-args)

export LC_ALL=C
export TZ=UTC
export SOURCE_DATE_EPOCH=1781654400
export ZERO_AR_DATE=1
export MACOSX_DEPLOYMENT_TARGET=12.0
SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
export SDKROOT
export CFLAGS="-O2 -ffile-prefix-map=$source_root=/usr/src/ffmpeg-8.1.2"

(
    cd "$source_root"
    ./configure "${configure_args[@]}"
    jobs="$(sysctl -n hw.logicalcpu 2>/dev/null || echo 4)"
    make -j"$jobs" ffmpeg ffprobe
)

mkdir -p "$stage_root/bin" "$stage_root/licenses"
cp "$source_root/ffmpeg" "$stage_root/bin/ffmpeg"
cp "$source_root/ffprobe" "$stage_root/bin/ffprobe"
cp "$source_root/COPYING.LGPLv2.1" "$stage_root/licenses/COPYING.LGPLv2.1"
cp "$source_root/LICENSE.md" "$stage_root/licenses/LICENSE.md"
chmod 0755 "$stage_root/bin/ffmpeg" "$stage_root/bin/ffprobe"
node "$contract_script" --write-provenance "$stage_root"
node "$verify_script" "$stage_root"

mkdir -p "$cache_root"
if [[ -e "$runtime_root" ]]; then
    if [[ -L "$runtime_root" || ! -d "$runtime_root" ]]; then
        echo "Refusing to replace non-directory FFmpeg cache path: $runtime_root" >&2
        exit 1
    fi
    previous_runtime="$cache_root/macos-arm64.previous.$$"
    mv "$runtime_root" "$previous_runtime"
fi
mv "$stage_root" "$runtime_root"

echo "Prepared verified FFmpeg 8.1.2 LGPL runtime at $runtime_root"
