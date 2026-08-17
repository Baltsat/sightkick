# rhythm voice bank

the vocalization engine uses the same sample ids for the built-in placeholder and a recorded personal voice. chart timing decides when a sample starts; `sticking.json` decides the exact drum, limb, open hi-hat state, and dynamic.

## source folder

put one recording per inventory entry in a folder. the base filename must match `VOCALIZATION_INVENTORY`; the extension may be wav, m4a, mp3, aif, aiff, caf, flac, or ogg.

each recording contains:

1. at least 1.5 seconds of room tone;
2. eight isolated repetitions at 60 bpm;
3. any phrase checks after those repetitions.

the builder ignores everything after the first eight detected takes. wav is decoded directly. other formats use `SK_FFMPEG` when set, then `ffmpeg` on `PATH`.

## assembly

`buildVoiceBankFromDirectory(input, output)` performs this fixed pipeline:

1. require every named source recording;
2. decode to mono at 48 kHz by default;
3. measure room noise from the opening 1.5 seconds;
4. detect utterances separated by at least 160 ms of silence;
5. keep the first eight utterances and add 20 ms pre-roll plus 60 ms post-roll;
6. match each take to 0.16 rms, cap peaks at 0.92, and add 6 ms edge fades;
7. write 16-bit mono wav variants and `manifest.json`.

the output has this shape:

```text
manifest.json
kick_bum/01.wav … 08.wav
snare_tak/01.wav … 08.wav
…
breath_h/01.wav … 08.wav
```

`loadBuiltVoiceBank(output)` loads that manifest into the same `VocalizationBank` accepted by `renderVocalizationTrack`. the renderer chooses variants deterministically, so the same chart produces the same syllable sequence and audio.

## playback

`createVocalizationTrackConfig(rendered)` produces an in-memory `rhythm voice` stem. append it to the song's existing `TrackConfig[]`; transport, seeking, speed control, mute, solo, and mixer volume then use the normal audio-player path. omit the stem to disable vocalization.
