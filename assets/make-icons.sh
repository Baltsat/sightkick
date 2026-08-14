#!/usr/bin/env bash
# Regenerates every derived Drumroll icon artifact from the two SVG sources.
#
# Sources (hand-authored, checked into this folder):
#   assets/icon.svg        1024px master — used for every slot 64px and up
#   assets/icon-small.svg  hand-simplified 16px/32px variant (see
#                          assets/ICON_PROVENANCE.md for why a separate
#                          small-size drawing exists)
#
# Outputs (all checked in, this script only needs to run again if the SVG
# sources change):
#   assets/icon.png                 1024px master render (in-app brand mark,
#                                    non-mac/win/linux runtime fallback)
#   assets/icon.iconset/*.png       macOS iconset, 10 representations
#   assets/icon.icns                built from icon.iconset via iconutil
#   assets/icon.ico                 16/32/128/256/512px via ImageMagick
#   assets/icons/{16,32,48,64,128,256,512}x*.png   Linux/tray icon set
#
# Requires: rsvg-convert (librsvg), iconutil (macOS), magick (ImageMagick).
# Verified against rsvg-convert 2.62.1 / cairo 1.18, ImageMagick 7.1.2.
#
# Usage: bash assets/make-icons.sh   (run from anywhere; paths are relative
# to this script's own location)

set -euo pipefail

A="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASTER="$A/icon.svg"
SMALL="$A/icon-small.svg"

mkdir -p "$A/icon.iconset"

# --- macOS iconset: small variant for 16/32, master for 64 and up ---
rsvg-convert -w 16 -h 16 "$SMALL" -o "$A/icon.iconset/icon_16x16.png"
rsvg-convert -w 32 -h 32 "$SMALL" -o "$A/icon.iconset/icon_16x16@2x.png"
rsvg-convert -w 32 -h 32 "$SMALL" -o "$A/icon.iconset/icon_32x32.png"
rsvg-convert -w 64 -h 64 "$MASTER" -o "$A/icon.iconset/icon_32x32@2x.png"
rsvg-convert -w 128 -h 128 "$MASTER" -o "$A/icon.iconset/icon_128x128.png"
rsvg-convert -w 256 -h 256 "$MASTER" -o "$A/icon.iconset/icon_128x128@2x.png"
rsvg-convert -w 256 -h 256 "$MASTER" -o "$A/icon.iconset/icon_256x256.png"
rsvg-convert -w 512 -h 512 "$MASTER" -o "$A/icon.iconset/icon_256x256@2x.png"
rsvg-convert -w 512 -h 512 "$MASTER" -o "$A/icon.iconset/icon_512x512.png"
rsvg-convert -w 1024 -h 1024 "$MASTER" -o "$A/icon.iconset/icon_512x512@2x.png"

# --- .icns from the iconset ---
iconutil -c icns "$A/icon.iconset" -o "$A/icon.icns"

# --- 1024px master PNG: in-app brand mark + non-mac/win/linux fallback ---
cp "$A/icon.iconset/icon_512x512@2x.png" "$A/icon.png"

# --- .ico: small variant for 16/32, master for 128/256/512 ---
magick "$A/icon.iconset/icon_16x16.png" "$A/icon.iconset/icon_32x32.png" \
    "$A/icon.iconset/icon_128x128.png" "$A/icon.iconset/icon_256x256.png" \
    "$A/icon.iconset/icon_512x512.png" \
    "$A/icon.ico"

# --- Linux/tray icon set (needs 48px, which the macOS iconset does not) ---
rsvg-convert -w 16 -h 16 "$SMALL" -o "$A/icons/16x16.png"
rsvg-convert -w 32 -h 32 "$SMALL" -o "$A/icons/32x32.png"
rsvg-convert -w 48 -h 48 "$MASTER" -o "$A/icons/48x48.png"
rsvg-convert -w 64 -h 64 "$MASTER" -o "$A/icons/64x64.png"
rsvg-convert -w 128 -h 128 "$MASTER" -o "$A/icons/128x128.png"
rsvg-convert -w 256 -h 256 "$MASTER" -o "$A/icons/256x256.png"
rsvg-convert -w 512 -h 512 "$MASTER" -o "$A/icons/512x512.png"

echo "icons regenerated from $MASTER + $SMALL"
