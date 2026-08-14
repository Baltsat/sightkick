# live import – final real-network receipt

## result

on 2026-08-14, the desktop Electron app searched YouTube, imported, charted,
scanned, opened, and played a real recording. this was a network run, not an
e2e fixture run.

| field                    | observed value                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| query typed into the app | `Dominic Fike 3 Nights Official Audio`                                                       |
| selected result          | `Dominic Fike "3 Nights" (Official Audio)`                                                   |
| selected recording       | <https://www.youtube.com/watch?v=nb6ou_k4OzM>                                                |
| downloaded audio         | 3.05 MiB WebM audio from YouTube                                                             |
| chart output             | 508 detected drum hits; `notes.mid` with easy, medium, hard, and expert drums                |
| imported song id         | `7b64e4c0-e66f-4a41-91f8-40777c033f39`                                                       |
| app playback readback    | `00:34 / 02:58`, transport button `aria-label="Pause"`, flow score at bar 14 of 113          |
| restart readback         | song remained visible as `1 in your library · 1 ready to play` after a graceful app relaunch |

the final app-created folder was:

`./.userdata/live-import/Drumroll Lessons/Dominic Fike - Dominic Fike 3 Nights (Official Audio)`

its post-import scan-chart readback was:

```json
{
  "format": "mid",
  "drumDifficulties": ["easy", "medium", "hard", "expert"],
  "trackCount": 4,
  "files": [
    ".sightkick",
    "album.jpg",
    "bass.ogg",
    "drums.ogg",
    "notes.mid",
    "other.ogg",
    "song.ini",
    "song.ogg",
    "vocals.ogg"
  ]
}
```

## network and fixture boundary

the desktop app itself performed the search and selection. its default yt-dlp
client returned YouTube's 403 path, so the configured fallback fetched the
selected audio through the real Android VR client. the real transcriber
separated stems with demucs, produced the tempo map, used its explicit
classical fallback when optional models were unavailable, and wrote the MIDI
chart. no fake yt-dlp script, fixture MP3, fixture transcriber, or
`SIGHTKICK_TRANSCRIBER_PATH` override was used for this run.

the fallback chain now also retries the embedded YouTube client with the
yt-dlp EJS component if Android VR gets a 403. the relevant supported yt-dlp
client configuration is documented in the [yt-dlp README](https://github.com/yt-dlp/yt-dlp#extractor-arguments); the reason a client fallback can be necessary is described in the [yt-dlp PO token guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide).

## visual stages

- [21-reimport-youtube-results.png](21-reimport-youtube-results.png) – actual query and YouTube results in the running desktop app.
- [22-reimport-imported.png](22-reimport-imported.png) – the song appears as one ready-to-play library item after chart creation.
- [23-reimport-playback-active.png](23-reimport-playback-active.png) – the imported song is playing in Perform mode.
- [24-reimport-survives-relaunch.png](24-reimport-survives-relaunch.png) – the same imported item is still present after graceful quit and relaunch.

the earlier first real pass selected the official video at
<https://www.youtube.com/watch?v=OWKzRngush4>, generated a playable chart, and
played it. its folder later exposed a restart data-loss defect: the lesson
library bootstrap mistook an extra imported folder for an invalid bundled
library and replaced the library root. that original output was therefore
deleted. [11-chart-result.png](11-chart-result.png) through
[14-playback-active.png](14-playback-active.png) preserve the evidence of that
first run. the final pass above was repeated after the preservation fix and is
the durable proof.

## failure cleanup readback

- cancelling a real import during demucs left no job directory under
  `sightkick-auto-chart` and no `sk_transcriber_ud_*` temporary directory.
- a graceful `Electron` quit while an import was active left no listener on
  port 9222, no queue job directory, and no transcriber temporary directory.
- the half-written audio-file case is covered by the queue test; it creates a
  partial fetch file, calls shutdown, verifies deletion, and then starts a
  fresh job.

the real cancellation occurred after the short audio download had completed,
so it is evidence for cancellation and shutdown cleanup, not a claim that the
network fetch itself was interrupted mid-byte-stream.

## defects fixed in this unit

- a non-zero yt-dlp search exit now fails even when stdout happened to contain
  parseable partial rows. the search panel clears those rows and offers a
  retry.
- free-play and Perform runs now derive chart-based atomic skill evidence, so
  song play feeds mastery evidence as lessons do.
- the default lesson-backed library now accepts imported song folders and
  preserves them during a bundled-library refresh.
- the auto-chart child process resolves its ffmpeg path before changing into a
  temporary work directory; graceful application cleanup awaits queue
  shutdown.
- streamed audio now survives a tempo change arriving during a loop restart;
  a remediation loop can advance from its first clean pass to the faster
  second pass instead of stopping.

## automated checks

| command                                             | result                          |
| --------------------------------------------------- | ------------------------------- |
| `corepack yarn vitest run`                          | passed – 206 files, 2,114 tests |
| `corepack yarn typecheck`                           | passed                          |
| `corepack yarn lint`                                | passed                          |
| `corepack yarn build`                               | passed                          |
| `PYTHONPATH=. uv run pytest tests/test_download.py` | passed – 6 tests                |
| `git diff --check`                                  | passed                          |

after those gates, the imported folder still contained the nine expected
package files, `buildSongFromDir` read it as `mid` with all four drum
difficulties, the queue root had no job directories, no transcriber temporary
directory remained, and port 9222 had no listener.
