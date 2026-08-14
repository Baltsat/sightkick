# automatic YouTube import – main-process handoff

## outcome

`SongSearch` must be able to pass a ranked YouTube result into the existing
`AutoChartQueue` with `autoImport: true`. The queue already gives the user
real download, processing, failure, cancellation, and retry updates; it also
cleans temporary output before every terminal update. This patch changes the
source-linked rule from “only a user-attested local file” to “a verified
YouTube fetch with retained provenance.” It does not relax any other gate.

Do not add or shell out to a second downloader. `resources/transcriber` already
pins `yt-dlp==2026.7.4`, downloads with its own venv, and runs the local ffmpeg
and transcription pipeline. The system `yt-dlp` is irrelevant to the shipped
path.

## 1. extend the request and evidence types

In `src/types.ts`, add the selected result as a renderer hint and the
machine-verified fetch record as persisted evidence:

```ts
export interface IpcYoutubeCandidate {
  videoId: string;
  title: string;
  uploader?: string;
  durationSeconds?: number;
  watchUrl: string;
}

export interface YoutubeFetchedAudioProvenance {
  provider: 'youtube';
  videoId: string;
  watchUrl: string;
  title: string;
  uploader?: string;
  durationSeconds: number;
  downloader: 'yt-dlp';
  downloaderVersion: '2026.7.4';
  fetchedAt: string;
}

export interface IpcCreateAutoChartRequest {
  youtubeUrl?: string;
  localFile?: boolean;
  backend?: AutoChartBackend;
  autoImport?: boolean;
  sourceProvenance?: LibrarySourceTrackProvenance;
  youtubeCandidate?: IpcYoutubeCandidate;
}

export type PlayabilityAudioSource =
  | 'local-user-attested'
  | 'youtube-fetched'
  | 'public-chart-package';

export interface PlayabilityEvidence {
  // Keep every existing field unchanged.
  audio: {
    source: PlayabilityAudioSource;
    sha256: string;
    youtube?: YoutubeFetchedAudioProvenance;
  };
}
```

`youtubeCandidate` is not proof. Its only job is to preserve the selection
between the renderer and main process. The main process must overwrite its
identity with a verified record before persisting evidence.

## 2. make the source gate accept only a verified fetched recording

In `src/library-sources/playability.ts`:

```ts
function validYoutubeAudio(audio: PlayabilityEvidence['audio']): boolean {
  const source = audio.youtube;

  return (
    audio.source === 'youtube-fetched' &&
    source?.provider === 'youtube' &&
    /^[A-Za-z0-9_-]{11}$/.test(source.videoId) &&
    source.watchUrl === `https://www.youtube.com/watch?v=${source.videoId}` &&
    presentString(source.title) &&
    Number.isFinite(source.durationSeconds) &&
    source.durationSeconds > 0 &&
    source.downloader === 'yt-dlp' &&
    source.downloaderVersion === '2026.7.4' &&
    presentString(source.fetchedAt) &&
    !Number.isNaN(Date.parse(source.fetchedAt))
  );
}
```

Then change the lawful-audio condition to accept `validYoutubeAudio` in
addition to the two existing sources. Keep the SHA-256 check. Add a test that
rejects a forged/partial YouTube record and accepts only the complete record.

## 3. bind the selected video to source identity in the main process

In `src/main/ipc/autoChart.ts`, add this immutable job field:

```ts
interface AutoChartJob extends IpcAutoChartJob {
  // existing fields
  youtubeCandidate?: IpcYoutubeCandidate;
}
```

At the start of `create`, normalize `request.youtubeCandidate` with the same
canonical URL rule used for `request.youtubeUrl`. Reject the request when a
candidate is supplied and any of these are false:

```ts
candidate.videoId matches the canonical URL video id
candidate.watchUrl is the canonical YouTube URL
candidate.title is a non-empty string
candidate.durationSeconds is finite and positive when sourceProvenance exists
```

Replace the current hard rejection:

```ts
if (job.sourceProvenance && !request?.localFile) {
  throw new Error(
    'Source-linked charts require lawful local audio; YouTube search cannot establish that proof',
  );
}
```

with:

```ts
if (job.sourceProvenance && !request?.localFile && !job.youtubeCandidate) {
  throw new Error(
    'Choose a verified YouTube result before auto-charting this source-linked song',
  );
}
```

Do not trust the renderer candidate after that point. Before launching the
sidecar, call a small `inspectYoutubeCandidate(canonicalUrl)` helper that uses
the **same resolved transcriber-vm `yt-dlp`** with:

```text
--dump-single-json --no-download --no-warnings --quiet <canonicalUrl>
```

Parse only a validated 11-character video id, title, uploader/channel, and a
finite duration. Compare that inspection result to the selected candidate and
to `job.sourceProvenance`:

| check    | rule                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| video id | equals the canonical URL and selected candidate                                                                                                                           |
| title    | normalized exact title; strip only presentation suffixes such as “official audio/video”                                                                                   |
| artist   | every split source artist matches title or uploader/channel                                                                                                               |
| duration | absolute delta ≤ 8 seconds                                                                                                                                                |
| variants | reject live, cover, karaoke, tribute, instrumental, remix, acoustic, sped-up, slowed, and nightcore unless the requested source title/query explicitly contains that term |

On a failure, call `fail(job, preciseMessage)` before a temp directory is
created. On success, retain the inspection as `job.youtubeCandidate` and use
it for both metadata and provenance. The renderer ranking is UX; this is the
actual trust boundary.

Copy `youtubeCandidate` in `retry()` along with `youtubeUrl` and
`sourceProvenance`. The existing retry already creates a fresh temp directory
and the existing fail/cancel paths remove it before notifying the renderer.

## 4. mint YouTube fetched-audio evidence after scan/preview, before import

In `src/main/playability.ts`, add:

```ts
export function createYoutubeAutoChartEvidence(
  sourceDir: string,
  source: LibrarySourceTrackProvenance,
  video: YoutubeFetchedAudioProvenance,
  chartId: string,
  verifiedAt = new Date().toISOString(),
): PlayabilityEvidence {
  if (!source.durationSeconds) {
    throw new Error(
      'Source row has no duration, so it cannot be auto-charted safely',
    );
  }

  const song = buildSongFromDir(sourceDir);

  if (!song || song.audio.length === 0 || !song.drumDifficulties?.length) {
    throw new Error('Prepared song failed the scan-chart drum gate');
  }

  const { chartPath, audioPaths } = preparedFiles(sourceDir, song);

  return {
    identity: {
      title: source.title,
      artists: [...source.artists],
      durationSeconds: source.durationSeconds,
    },
    audio: {
      source: 'youtube-fetched',
      sha256: hashFiles(audioPaths),
      youtube: video,
    },
    chart: {
      source: 'local-auto-chart',
      id: chartId,
      sha256: hashFiles([chartPath]),
      reviewed: true,
    },
    scan: {
      passed: true,
      format: song.format,
      drumDifficulties: [...song.drumDifficulties],
    },
    launch: {
      passed: true,
      mode: 'headless-load',
      verifiedAt,
    },
  };
}
```

Keep `validatePlayabilityEvidence` strict. It must still read the finished
audio and chart files, recompute both hashes, confirm the scan result, and
confirm the source identity. Add the URL/video-id/provenance consistency checks
there too.

In `AutoChartQueue.import`, switch from `createLocalAutoChartEvidence` to
`createYoutubeAutoChartEvidence` whenever the job has both
`sourceProvenance` and a verified `youtubeCandidate`. Convert that candidate to
the provenance object with `fetchedAt: new Date().toISOString()` immediately
before the evidence is created. Pass it to the existing `importPreparedSong`.
That import already persists the evidence, rescans it, and validates it again.

Keep the ordinary unlinked auto-import behavior unchanged for now. A linked
favorite gets all four gates because it has a specific identity to prove.

## 5. renderer integration owned by the song-search lane

Use the renderer contract added in this unit:

```ts
import {
  createAutoImportRequest,
  rankAutoImportCandidates,
} from '../../services/auto-import';

const ranking = rankAutoImportCandidates(query, results, sourceProvenance);
```

Render `ranking.candidates` rather than raw `useYoutubeSearch` results. On
selection, remove the “Use lawful local audio” warning. The renderer helper
already returns `youtubeCandidate`; the `IpcCreateAutoChartRequest` type patch
above makes that exact field legal at the IPC boundary, then send:

```ts
window.electron.ipcRenderer.sendMessage(
  'create-auto-chart',
  createAutoImportRequest(result, sourceProvenance),
);
```

The existing `<AutoChart>` surface already listens to the queue globally and
shows actual processing, errors, cleanup-safe retry, and imported status. Do
not add a parallel modal, spinner, or file-dialog path.

## 6. web adapter remains deliberately unavailable

Do not change `web/**` for this lane. The public web deployment currently
advertises `youtubeImport: false` and returns an explicit unavailable response
for keyword search because it has no configured transcriber credentials. A
client-side YouTube search or downloader would either lie about that boundary
or create a second, unproven import path. The desktop implementation is the
only target of this handoff.

## 7. required tests and capture

Update the old test named `rejects a YouTube match for a source-linked row` to
assert the inverse: an exact ranked recording sends `create-auto-chart` with
`autoImport`, `sourceProvenance`, and `youtubeCandidate`. Add cases for cover,
live, wrong artist, and duration delta 9 seconds; none may send IPC.

In `src/main/ipc/autoChart.test.ts` replace the source-linked YouTube rejection
case with:

1. exact source + verified selected YouTube candidate → no `selectAudio`, one
   sightkick run, automatic import, fresh evidence;
2. bad candidate metadata → failure before runner/temp dir;
3. sidecar failure/cancel → directory absent before terminal event;
4. retry → a new job id, fresh temp directory, copied candidate, no dialog.

In `src/main/playability.test.ts`, verify persisted `youtube-fetched` evidence
passes after import and fails if audio, chart, URL, video id, duration, or
provenance is altered.

Extend `e2e/smoke.e2e.ts` with a deterministic `search-youtube` fixture and
the existing fake sidecar. Set `dialog.showOpenDialog` to throw. Drive:

```text
type a title → choose exact result → observe download/processing/imported
→ open the imported song → wait for the player to load
```

Capture the search candidates, the active progress surface, and the launched
chart under `docs/design-qa/2026-08-13-auto-import/` only after that test uses
the updated main process. A real network run is allowed as supplementary proof,
but it is not a substitute for deterministic failure/retry coverage.
