# Drumroll web architecture

## boundary

The web target loads the existing renderer after installing a browser implementation of the preload IPC contract. The Electron preload, Electron Vite config, renderer entry, React components, chart parser, VexFlow notation, audio engine, judge, and gamification code are unchanged.

```
Electron preload -> window.electron -> shared renderer
web bootstrap    -> WebPlatform     -> shared renderer
```

The public build contains only files generated from `resources/lessons/curriculum.yaml` and the repository's CC0 one-shots. It never reads `~/Music/SightKick`, `~/Music/Drumroll`, or any other user library. Imported charts and audio stay in the browser's IndexedDB.

## platform contract

`src/platform/types.ts` defines the capability map and the IPC-shaped adapter contract. `src/platform/electron/index.ts` is a thin reference to the existing preload bridge. `src/platform/web/` implements the channels used by the renderer.

| capability                                    | Electron                    | web                                      |
| --------------------------------------------- | --------------------------- | ---------------------------------------- |
| generated lesson list and chart/audio loading | local filesystem            | static manifest and HTTP assets          |
| user chart storage                            | local filesystem            | IndexedDB                                |
| scores, practice runs, streaks, XP            | electron-store              | localStorage                             |
| MIDI drums                                    | native MIDI module          | Web MIDI API on a secure Chrome origin   |
| keyboard input                                | shared renderer             | shared renderer                          |
| YouTube URL auto-chart                        | local or remote backend     | same-origin Cloudflare proxy             |
| local prepared-folder import                  | yes                         | unavailable; desktop control hidden      |
| local audio-file auto-chart                   | yes                         | unavailable; desktop control hidden      |
| stem split and OCTAVE                         | yes when installed          | unavailable; controls report unsupported |
| YouTube Music likes                           | desktop browser-cookie flow | unavailable; control hidden              |
| PDF export                                    | native save dialog          | browser print dialog                     |
| sleep prevention                              | Electron power blocker      | Screen Wake Lock when available          |
| app updater and file-manager actions          | yes                         | unavailable                              |

The shared hooks already probe auto-chart and stem-tool availability. Web replies advertise only the managed remote auto-chart backend and `unsupported` stem tools. Web-only CSS removes controls whose desktop interaction cannot be completed in a browser, including local-folder import, local-file auto-chart, My Music, remote-secret configuration, and commercial chart browsing/download. The adapter also rejects those channels if invoked programmatically.

## lessons pipeline

`web/scripts/package-lessons.mjs` creates an isolated temporary directory, runs the canonical lesson generator with Python 3.12 through `uv`, validates that exactly 118 folders were produced, and copies only those generated folders into `web/public/library`. It writes `manifest.json` with the parsed `song.ini` lesson chain, playable asset URLs, file lists, byte totals, and maximum-file size. The script fails if any file reaches Cloudflare Pages' 25 MiB per-file limit.

The generated library and `web/dist` are build artifacts and are ignored by git. A production build is:

```sh
yarn node web/scripts/package-lessons.mjs
yarn vite build --config web/vite.config.ts
```

## import proxy

The Pages Function at `web/functions/api/import/[[path]].ts` is the only component that can read `TRANSCRIBER_TOKEN`. The browser submits a YouTube URL to `/api/import`; the function validates the host, applies a best-effort three-jobs-per-hour/IP limit, and forwards create, status, result, and cancel requests to the transcriber service configured by `TRANSCRIBER_URL`.

The browser polls status, downloads the completed gzip tar, extracts the song folder using `DecompressionStream`, shows the existing shared import review, and writes confirmed files to IndexedDB. No bearer token or imported song is sent to Cloudflare static storage.

The rate limiter is isolate-local and therefore deliberately best-effort. A production abuse boundary should replace it with a Workers KV or Durable Object counter if the public URL attracts traffic.

## service reachability and secrets

The transcriber URL must be reachable from Cloudflare's network. The preferred server-side path is a `cloudflared` tunnel bound to the service's loopback port; set `TRANSCRIBER_URL` to that tunnel hostname and keep the GCP service port closed. A firewall rule that admits a changing Cloudflare egress range is harder to maintain and is not required by this implementation.

The server currently has no `cloudflared` binary. After choosing a hostname in a domain already managed by Cloudflare, run the following one-time setup. Replace the two angle-bracket values with the tunnel UUID printed by `tunnel create` and the chosen hostname:

```sh
ssh google
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update
sudo apt-get install cloudflared
cloudflared tunnel login
cloudflared tunnel create drumroll-transcriber
cloudflared tunnel route dns drumroll-transcriber <transcriber-hostname>
```

Create `~/.cloudflared/config.yml` on that server:

```yaml
url: http://127.0.0.1:8010
tunnel: <tunnel-uuid>
credentials-file: /home/konstantinbaltsat/.cloudflared/<tunnel-uuid>.json
```

Install and verify the boot-persistent service:

```sh
sudo cloudflared --config /home/konstantinbaltsat/.cloudflared/config.yml service install
sudo systemctl start cloudflared
sudo systemctl status cloudflared
curl https://<transcriber-hostname>/healthz
```

These commands follow Cloudflare's [locally managed tunnel](https://developers.cloudflare.com/tunnel/advanced/local-management/create-local-tunnel/) and [Linux service](https://developers.cloudflare.com/tunnel/advanced/local-management/as-a-service/linux/) procedures.

Set production secrets without exposing their values:

```sh
cd web
wrangler pages secret put TRANSCRIBER_URL --project-name drumroll
wrangler pages secret put TRANSCRIBER_TOKEN --project-name drumroll
```

For local proxy proof, create `web/.dev.vars` with the same two names; the file is ignored. Serve the built app and Pages Functions with:

```sh
cd web
wrangler pages dev dist
```

## deployment

After the library build and browser smoke test:

```sh
cd web
wrangler pages deploy dist --project-name drumroll
```

Cloudflare Pages serves static lessons from `dist/library` and routes `/api/import*` through the Function. The GitHub releases link is client-side copy only and does not couple the web deploy to the desktop release pipeline.
