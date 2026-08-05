# Remote Transcriber API

The SightKick Transcriber (`resources/transcriber/`, package `sk_transcriber`)
also runs as a remote HTTP service, deployed separately from this repo, for
offloading heavy audio processing (demucs, Beat This!, DrumSep — all
CPU-bound) off the user's Mac.

- **Repo**: [`Baltsat/sightkick-transcriber-service`](https://github.com/Baltsat/sightkick-transcriber-service)
  (private, detached from this repo — its own deploy lifecycle/secrets).
  Vendors `resources/transcriber/sk_transcriber/` as of commit `7b0b165`
  (see that repo's README "Upstream sync" for how to check for drift and
  re-sync).
- **Deploy target**: a Debian aarch64 server, Docker Compose, no GPU
  (`torch`/`torchaudio` run CPU-only there). `restart: unless-stopped` +
  named volumes — survives host reboot.
- **This file** is the wire contract only, so an app-side integration can
  be built against it without needing to read the service repo. It mirrors
  that repo's own README 1:1; if the two ever disagree, the service repo
  is the source of truth (it's the thing actually running).

## Auth

Every `/jobs*` endpoint requires `Authorization: Bearer <token>`. The
token is a server-side secret (generated with `openssl rand -hex 32`,
stored in an env file outside the service repo, injected via
`compose.yaml`'s `env_file`) — it is not in this repo, not in the service
repo, and not reproduced here. Get it from whoever deployed the service.
`GET /healthz` is the only unauthenticated endpoint.

## Endpoints

### `POST /jobs` → `201`-ish `{"jobId": "<uuid>"}`

Two ways to submit, distinguished by `Content-Type`:

- `application/json`: `{"url": "<youtube url>"}`
- `multipart/form-data`: a `file` field carrying the audio file

```
POST /jobs
Authorization: Bearer <token>
Content-Type: application/json

{"url": "https://www.youtube.com/watch?v=XXXXXXXXXXX"}
```

```
POST /jobs
Authorization: Bearer <token>
Content-Type: multipart/form-data; boundary=...

--...
Content-Disposition: form-data; name="file"; filename="song.wav"
Content-Type: audio/wav

<bytes>
--...--
```

### `GET /jobs/<id>` → job status, polled

```json
{
  "jobId": "c1c9c9c2-....-....",
  "status": "running",
  "stage": "separate",
  "percent": 23.4,
  "message": "Running stem separation (demucs, local venv fallback, device=cpu)",
  "createdAt": "2026-08-05T12:00:00+00:00",
  "updatedAt": "2026-08-05T12:00:14+00:00",
  "error": null
}
```

- `status`: `queued | running | done | error | canceled`
- `stage`: `download | separate | beats | transcribe | write` (a
  `--audio`/upload-sourced job skips `download`); `null` while `queued`
- `percent`: 0-100 for the whole job (fixed stage-to-percent allocation,
  same as the underlying `sk_transcriber` CLI's own `__SK_EVENT__`
  protocol — see `resources/transcriber/README.md` "Progress protocol")
- `error`: human-readable failure reason once `status` is `error`,
  otherwise `null`

A sane poll interval is 2-3s; jobs on this hardware run for minutes (see
"Timing" below), not seconds.

### `GET /jobs/<id>/result` → `200` `application/gzip` (only once `status: "done"`)

A tarball of the produced Clone Hero song folder —
`<Artist> - <Title>/{notes.mid,song.ini,song.ogg,drums.ogg,bass.ogg,vocals.ogg,other.ogg,album.jpg}`
— `arcname` is the song folder itself, so extracting the tarball drops
that folder directly into the current directory. `404` if the job doesn't
exist, `409` if it exists but isn't done yet.

### `DELETE /jobs/<id>` → cancel, returns the job's status dict

SIGTERMs the whole process tree (the transcriber process and any
subprocess it shelled out to) if running; marks it `canceled` immediately
if it hadn't started yet.

## Timing on the deploy hardware (measured)

CPU-only, 4 cores, aarch64, no GPU. See the deploy report for the exact
run this was measured against; the honest headline is that this path is
**meaningfully slower than the local M1 (MPS)** path — a short/medium song
end-to-end is on the order of tens of minutes here, not the under-90s warm
numbers `resources/transcriber/README.md` reports on Apple Silicon.
**Practical verdict: keep the local M1 pipeline as the primary/interactive
path; treat this remote service as the offload option** — free up the Mac,
accept the wall-clock hit, or batch overnight.

## Wiring notes for the app's remote backend

- One job at a time server-side (single-worker FIFO queue) — the app
  should not assume submitting N jobs gets N-way parallelism; they queue.
- Job state is disk-backed and survives a service restart for anything
  that had already finished; a job that was mid-run when the service
  restarted comes back as `status: "error"` with
  `error: "interrupted by service restart"` — there is no resume, the app
  should treat that the same as any other failure (offer retry).
- No job-listing endpoint — the app must remember `jobId`s it created; a
  job past the service's retention window (default: 20 most-recent
  finished jobs) will 404.
