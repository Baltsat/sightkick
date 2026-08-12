#!/usr/bin/env bash

set -euo pipefail

expected_authority='Developer ID Application: Konstantin Baltsat (3BGK34ZGS6)'
expected_team_id='3BGK34ZGS6'
dmg_path="${1:-}"

if [[ -z "$dmg_path" || ! -f "$dmg_path" ]]; then
    echo "Usage: notarize-macos-dmg.sh <signed-dmg>" >&2
    exit 1
fi

dmg_path="$(cd "$(dirname "$dmg_path")" && pwd)/$(basename "$dmg_path")"

codesign --verify --strict --verbose=2 "$dmg_path"
signature_details="$(codesign -dvvv "$dmg_path" 2>&1)"
if ! grep -Fq "Authority=$expected_authority" <<<"$signature_details"; then
    echo "The DMG is not signed by the expected Developer ID authority." >&2
    exit 1
fi
if ! grep -Fq "TeamIdentifier=$expected_team_id" <<<"$signature_details"; then
    echo "The DMG is not signed by the expected Apple Developer team." >&2
    exit 1
fi

api_key_credentials=(
    "${APPLE_API_KEY:-}"
    "${APPLE_API_KEY_ID:-}"
    "${APPLE_API_ISSUER:-}"
)
apple_id_credentials=(
    "${APPLE_ID:-}"
    "${APPLE_APP_SPECIFIC_PASSWORD:-}"
    "${APPLE_TEAM_ID:-}"
)

api_key_complete=1
apple_id_complete=1
for value in "${api_key_credentials[@]}"; do
    [[ -n "$value" ]] || api_key_complete=0
done
for value in "${apple_id_credentials[@]}"; do
    [[ -n "$value" ]] || apple_id_complete=0
done

if [[ "$api_key_complete" -eq 1 ]]; then
    if [[ ! -f "$APPLE_API_KEY" || ! -r "$APPLE_API_KEY" ]]; then
        echo "APPLE_API_KEY must point to a readable App Store Connect private key." >&2
        exit 1
    fi
    xcrun notarytool submit "$dmg_path" \
        --key "$APPLE_API_KEY" \
        --key-id "$APPLE_API_KEY_ID" \
        --issuer "$APPLE_API_ISSUER" \
        --wait \
        --timeout 30m
elif [[ "$apple_id_complete" -eq 1 ]]; then
    if [[ "$APPLE_TEAM_ID" != "$expected_team_id" ]]; then
        echo "APPLE_TEAM_ID does not match the expected Apple Developer team." >&2
        exit 1
    fi
    xcrun notarytool submit "$dmg_path" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_APP_SPECIFIC_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait \
        --timeout 30m
else
    echo "Complete App Store Connect API key or Apple ID notarization credentials are required." >&2
    exit 1
fi

xcrun stapler staple "$dmg_path"
codesign --verify --strict --verbose=2 "$dmg_path"
xcrun stapler validate "$dmg_path"
spctl --assess \
    --type open \
    --context context:primary-signature \
    --verbose=4 \
    "$dmg_path"

echo "Signed DMG notarization, stapling, and Gatekeeper validation succeeded."
