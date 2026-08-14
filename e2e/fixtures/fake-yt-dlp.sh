#!/bin/sh
set -eu

last=''
for arg in "$@"; do
    last="$arg"
done

case "${1:-}" in
--version)
    printf '%s\n' '2026.07.04'
    ;;
--dump-single-json)
    if [ "$last" != 'https://www.youtube.com/watch?v=abcdefghijk' ]; then
        printf '%s\n' 'unexpected inspection URL' >&2
        exit 1
    fi
    printf '%s\n' '{"id":"abcdefghijk","title":"Mokita - Natural Villain (Official Audio)","uploader":"Mokita","duration":199}'
    ;;
ytsearch*)
    printf '%s\n' \
        '{"id":"abcdefghijk","title":"Mokita - Natural Villain (Official Audio)","uploader":"Mokita","duration":199}' \
        '{"id":"live0000001","title":"Mokita - Natural Villain (Live)","uploader":"Mokita","duration":200}' \
        '{"id":"cover000001","title":"Natural Villain cover","uploader":"A different channel","duration":199}'
    ;;
*)
    printf '%s\n' 'unexpected yt-dlp arguments' >&2
    exit 1
    ;;
esac
