#!/bin/sh
set -eu

out=''
while [ "$#" -gt 0 ]; do
    case "$1" in
    --out)
        out="$2"
        shift 2
        ;;
    *)
        shift
        ;;
    esac
done

song_dir="$out/Тестовый артист - 夜のドラム 🥁"
mkdir -p "$song_dir"
printf '%s\n' \
    '[song]' \
    'name = 夜のドラム 🥁' \
    'artist = Тестовый артист' \
    'album = E2E' \
    'auto_chart = True' \
    'auto_chart_tool = Drumroll Transcriber' \
    'charter = ' \
    'pro_drums = True' \
    'five_lane_drums = False' \
    'diff_drums = 2' \
    >"$song_dir/song.ini"
printf '%s\n' \
    '[Song]' \
    '{' \
    '  Resolution = 480' \
    '}' \
    '[SyncTrack]' \
    '{' \
    '  0 = TS 4' \
    '  0 = B 120000' \
    '}' \
    '[ExpertDrums]' \
    '{' \
    '  0 = N 0 0' \
    '  480 = N 1 0' \
    '}' \
    >"$song_dir/notes.chart"
printf 'fake audio' >"$song_dir/song.mp3"

printf '%s\n' '__SK_EVENT__ {"kind":"progress","stage":"download","percent":10,"message":"Downloading fake audio"}'
sleep 1
printf '%s\n' '__SK_EVENT__ {"kind":"progress","stage":"separate","percent":40,"message":"Separating fake drums"}'
sleep 1
printf '%s\n' '__SK_EVENT__ {"kind":"progress","stage":"beats","percent":60,"message":"Finding fake beats"}'
sleep 1
printf '%s\n' '__SK_EVENT__ {"kind":"progress","stage":"transcribe","percent":80,"message":"Transcribing fake notes"}'
sleep 1
printf '%s\n' '__SK_EVENT__ {"kind":"progress","stage":"write","percent":95,"message":"Writing fake chart"}'
sleep 1
printf '__SK_EVENT__ {"kind":"complete","success":true,"songDir":"%s"}\n' "$song_dir"
