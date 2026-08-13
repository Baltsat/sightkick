import fs from 'fs';
import ini from 'ini';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcYoutubeCandidate } from '../../types';

// None of the existing tests below exercise real app.*/dialog.* (every
// path that would is overridden through the AutoChartQueue's injected
// dependencies); nativeImage is the only part of 'electron' actually
// invoked at runtime here, via applyOfficialMetadata -> ingestSongCover
// for the iTunes-cover integration test below. Mirrors songCover.test.ts's
// mock shape.
vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: vi.fn(() => ({
      isEmpty: () => false,
      toJPEG: () => Buffer.from('jpeg'),
      toDataURL: () => 'data:image/jpeg;base64,cHJldmlldw==',
    })),
  },
}));

import {
  AutoChartQueue,
  AutoChartRunner,
  SightkickRunner,
  SkWorkerEvent,
  WorkerEvent,
  applyOfficialMetadata,
  canonicalizeYoutubeUrl,
  createSkEventReader,
  drumrollFfmpegRuntimeCandidates,
  fetchOfficialYoutubeMetadata,
  parseSkEventLine,
  parseWorkerLine,
  validateSightkickRuntime,
  validateLocalAudioFile,
} from './autoChart';
import { lastReply, makeEvent } from './test-support';

interface OctaveRun {
  // The worker payload always carries the runId the queue assigned it
  // (see autoChart.ts's `runId: job.id`); narrowing it here keeps the
  // emit() call sites below type-checked against the real WorkerEvent.
  payload: Record<string, unknown> & { runId: string };
  emit: (event: WorkerEvent) => void;
  finish: () => void;
  kill: ReturnType<typeof vi.fn>;
}

interface SkRun {
  input: { tempDir: string; youtubeUrl?: string; audioPath?: string };
  emit: (event: SkWorkerEvent) => void;
  finish: () => void;
  kill: ReturnType<typeof vi.fn>;
}

type RemoteRun = SkRun;

function preview(sourceDir: string) {
  return {
    sourceDir,
    name: 'Prepared song',
    artist: 'Artist',
    album: '',
    charter: '',
    chartFormat: 'mid' as const,
    audioCount: 1,
    drumDifficulties: ['expert'] as never[],
    coverSource: 'none' as const,
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function latestJob(event: ReturnType<typeof makeEvent>) {
  return lastReply(event, 'auto-chart-update')!.args[0] as {
    id: string;
    attempt: number;
    stage: string;
    backend?: string;
    percent?: number;
    error?: string;
    preview?: { sourceDir: string };
    youtubeUrl?: string;
    sourceProvenance?: {
      provider: string;
      collectionId: string;
      trackId: string;
    };
    jobs?: { id: string; stage: string; youtubeUrl?: string }[];
  };
}

function writeAudio(root: string, name: string): string {
  const filePath = path.join(root, name);

  fs.writeFileSync(filePath, 'audio');

  return filePath;
}

interface HarnessOptions {
  audioPaths?: string[];
  backends?: { sightkick: boolean; remote?: boolean; octave: boolean };
  resolveMetadata?: typeof fetchOfficialYoutubeMetadata;
  inspectYoutubeCandidate?: (
    canonicalUrl: string,
  ) => Promise<IpcYoutubeCandidate>;
}

function createHarness(options: HarnessOptions = {}) {
  const backends = options.backends ?? { sightkick: false, octave: true };
  const audioPaths = options.audioPaths ?? [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-test-'));
  const octaveRuns: OctaveRun[] = [];
  const skRuns: SkRun[] = [];
  const remoteRuns: RemoteRun[] = [];
  const inspectedUrls: string[] = [];
  const createdTempDirs: string[] = [];
  let audioIndex = 0;
  let jobIndex = 0;
  let selectAudioCalls = 0;
  const importSong = vi.fn(async (sourceDir: string) => ({
    id: 'imported-song',
    dir: sourceDir,
    name: 'Prepared song',
    artist: 'Artist',
    album: '',
    charter: '',
    genre: '',
    year: '',
    fiveLaneDrums: false,
    proDrums: false,
    delaySeconds: 0,
    drumDifficulty: 0,
    format: 'mid' as const,
    audio: [],
  }));
  const octaveRunner: AutoChartRunner = {
    run(payloadPath, emit) {
      const payload = JSON.parse(
        fs.readFileSync(payloadPath, 'utf8'),
      ) as Record<string, unknown> & { runId: string };
      let finish = () => {};
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const run = { payload, emit, finish, kill: vi.fn() };

      octaveRuns.push(run);

      return { kill: run.kill, done };
    },
  };
  const sightkickRunner: SightkickRunner = {
    run(input, emit) {
      let finish = () => {};
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const run = { input, emit, finish, kill: vi.fn() };

      skRuns.push(run);

      return { kill: run.kill, done };
    },
  };
  const remoteRunner: SightkickRunner = {
    run(input, emit) {
      let finish = () => {};
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const run = { input, emit, finish, kill: vi.fn() };

      remoteRuns.push(run);

      return { kill: run.kill, done };
    },
  };
  const applyMetadata = vi.fn(async () => {});
  const queue = new AutoChartQueue({
    selectAudio: async () => {
      selectAudioCalls += 1;

      return audioPaths[audioIndex++];
    },
    resolveMetadata: options.resolveMetadata ?? (async () => undefined),
    validateAudio: validateLocalAudioFile,
    inspectYoutubeCandidate: async (canonicalUrl: string) => {
      inspectedUrls.push(canonicalUrl);

      if (options.inspectYoutubeCandidate) {
        return options.inspectYoutubeCandidate(canonicalUrl);
      }

      const videoId = new URL(canonicalUrl).searchParams.get('v')!;

      return {
        videoId,
        title: 'Artist - Track',
        uploader: 'Artist',
        durationSeconds: 200,
        watchUrl: canonicalUrl,
      };
    },
    createTempDir: async (id: string) => {
      const tempDir = await fs.promises.mkdtemp(path.join(root, `${id}-`));

      createdTempDirs.push(tempDir);

      return tempDir;
    },
    detectBackends: () => backends,
    preflightOctave: () =>
      ({
        cacheDir: root,
        pythonPath: '',
        workerPath: '',
        sourceDir: '',
        ffmpegDir: '',
      }) as never,
    preflightSightkick: () => {
      if (!backends.sightkick) {
        throw new Error(
          'The bundled Drumroll transcriber is missing; reinstall Drumroll or switch to the OCTAVE backend',
        );
      }

      return {
        runnerPath: '/transcriber/run.sh',
        ffmpegPath: '/ffmpeg',
        dataDir: '/transcriber-data',
      };
    },
    preflightRemote: () => ({
      endpoint: 'http://localhost:18010',
      token: 'test-token',
    }),
    octaveRunner,
    sightkickRunner,
    remoteRunner,
    preview: async (sourceDir: string) => preview(sourceDir),
    importSong,
    cleanup: async (tempDir?: string) => {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    },
    applyMetadata,
    makeId: () => `job-${++jobIndex}`,
  } as never);
  const completeOctave = async (run: OctaveRun) => {
    const outputDir = run.payload.outputDir as string;
    const songDir = path.join(outputDir, 'prepared');

    fs.mkdirSync(songDir, { recursive: true });
    run.emit({
      kind: 'complete',
      runId: run.payload.runId,
      success: true,
      outputDir,
      songFolders: [songDir],
      errors: [],
    });
    await nextTurn();
    run.finish();
    await nextTurn();
  };

  return {
    root,
    octaveRuns,
    skRuns,
    remoteRuns,
    inspectedUrls,
    createdTempDirs,
    queue,
    importSong,
    applyMetadata,
    completeOctave,
    get selectAudioCalls() {
      return selectAudioCalls;
    },
  };
}

describe('auto-chart source and worker protocol', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();

    for (const root of cleanup.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('canonicalizes only individual YouTube video identities', () => {
    expect(canonicalizeYoutubeUrl('https://youtu.be/abcdefghijk?t=9')).toBe(
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
    expect(
      canonicalizeYoutubeUrl('https://www.youtube.com/shorts/abcdefghijk'),
    ).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(
      canonicalizeYoutubeUrl(
        'https://music.youtube.com/watch?v=abcdefghijk&list=album',
      ),
    ).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(
      canonicalizeYoutubeUrl(
        'https://www.youtube.com/live/abcdefghijk?feature=share',
      ),
    ).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(
      canonicalizeYoutubeUrl('https://www.youtube.com/embed/abcdefghijk'),
    ).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(
      canonicalizeYoutubeUrl(
        'https://www.youtube-nocookie.com/embed/abcdefghijk?start=4',
      ),
    ).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(
      canonicalizeYoutubeUrl(
        'https://www.youtube.com/watch?feature=share&t=10&v=abcdefghijk',
      ),
    ).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(() =>
      canonicalizeYoutubeUrl('https://example.com/watch?v=abcdefghijk'),
    ).toThrow('single YouTube video');
    expect(() =>
      canonicalizeYoutubeUrl('https://youtube.com/playlist?list=x'),
    ).toThrow('single YouTube video');
  });

  it('uses only official oEmbed metadata and official thumbnails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          title: 'Official title',
          author_name: 'Official channel',
          thumbnail_url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
        }),
      })),
    );

    await expect(
      fetchOfficialYoutubeMetadata(
        'https://www.youtube.com/watch?v=abcdefghijk',
      ),
    ).resolves.toEqual({
      title: 'Official title',
      authorName: 'Official channel',
      songName: 'Official title',
      artistName: 'Official channel',
      thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabcdefghijk&format=json',
      { signal: expect.any(AbortSignal) },
    );
  });

  it('infers a one-click track identity from a conventional official title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          title: 'Kygo - Raging ft. Kodaline (Official Lyric Video)',
          author_name: 'KygoOfficialVEVO',
          thumbnail_url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
        }),
      })),
    );

    await expect(
      fetchOfficialYoutubeMetadata(
        'https://www.youtube.com/watch?v=abcdefghijk',
      ),
    ).resolves.toMatchObject({
      songName: 'Raging',
      artistName: 'Kygo feat. Kodaline',
    });
  });

  it('applies official metadata to a generated chart without ini injection', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-metadata-'));

    cleanup.push(root);
    fs.writeFileSync(
      path.join(root, 'song.ini'),
      '[song]\nname = generated filename\nartist = Unknown Artist\n',
    );

    await applyOfficialMetadata(root, {
      title: 'Raging\nname = injected',
      authorName: 'Kygo\r\nartist = injected',
    });

    expect(fs.readFileSync(path.join(root, 'song.ini'), 'utf8')).toBe(
      '[song]\nname = Raging name = injected\nartist = Kygo artist = injected\n',
    );
  });

  it('persists reviewed source provenance in schema-compatible song metadata', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-source-'));

    cleanup.push(root);
    fs.writeFileSync(
      path.join(root, 'song.ini'),
      '[song]\nname = generated filename\nartist = Unknown Artist\n',
    );

    await applyOfficialMetadata(root, undefined, {
      provider: 'yandex-music',
      collectionId: 'drums-playlist',
      collectionName: 'drums',
      trackId: 'yandex:drums-playlist:2',
      title: 'Natural Villain',
      artists: ['Mokita'],
      sourceUrl: 'https://music.yandex.ru/album/123/track/456',
    });

    const stored = ini.parse(
      fs.readFileSync(path.join(root, 'song.ini'), 'utf8'),
    ).song;

    expect(stored).toMatchObject({
      name: 'generated filename',
      artist: 'Unknown Artist',
      sk_source_provider: 'yandex-music',
      sk_source_collection_id: 'drums-playlist',
      sk_source_collection_name: 'drums',
      sk_source_track_id: 'yandex:drums-playlist:2',
      sk_source_title: 'Natural Villain',
      sk_source_artists: '["Mokita"]',
      sk_source_url: 'https://music.yandex.ru/album/123/track/456',
    });
  });

  it('prefers a confident iTunes album cover over the YouTube thumbnail when importing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-cover-'));

    cleanup.push(root);
    fs.writeFileSync(
      path.join(root, 'song.ini'),
      '[song]\nname = generated filename\nartist = Unknown Artist\n',
    );

    const requestedUrls: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        requestedUrls.push(url);

        if (url.startsWith('https://itunes.apple.com/search')) {
          return {
            ok: true,
            status: 200,
            url,
            json: async () => ({
              results: [
                {
                  artistName: 'Kygo feat. Kodaline',
                  trackName: 'Raging',
                  artworkUrl100:
                    'https://is1-ssl.mzstatic.com/xx/100x100bb.jpg',
                },
              ],
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          url,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          arrayBuffer: async () => Uint8Array.from([9, 9, 9]).buffer,
        };
      }),
    );

    await applyOfficialMetadata(root, {
      title: 'Kygo - Raging ft. Kodaline (Official Lyric Video)',
      authorName: 'KygoOfficialVEVO',
      songName: 'Raging',
      artistName: 'Kygo feat. Kodaline',
      thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
    });

    expect(fs.readFileSync(path.join(root, 'album.jpg'), 'utf-8')).toBe('jpeg');
    expect(
      requestedUrls.some((url) => url.startsWith('https://itunes.apple.com')),
    ).toBe(true);
    expect(requestedUrls.some((url) => url.includes('i.ytimg.com'))).toBe(
      false,
    );
  });

  it('rejects symlinked and unsupported local input', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-input-'));

    cleanup.push(root);

    const audio = writeAudio(root, 'track.mp3');
    const symlink = path.join(root, 'link.mp3');

    fs.symlinkSync(audio, symlink);

    expect(() => validateLocalAudioFile(symlink)).toThrow('Symbolic-link');
    expect(() => validateLocalAudioFile(writeAudio(root, 'track.txt'))).toThrow(
      'WAV, MP3, OGG, OPUS, or FLAC',
    );
  });

  it('reports distinct sidecar preflight failures', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-runtime-'));

    cleanup.push(root);

    const runnerPath = path.join(root, 'run.sh');
    const ffmpegPath = path.join(root, 'ffmpeg');
    const uvPath = path.join(root, 'uv');

    for (const filePath of [runnerPath, ffmpegPath, uvPath]) {
      fs.writeFileSync(filePath, '');
      fs.chmodSync(filePath, 0o700);
    }

    expect(() =>
      validateSightkickRuntime({
        runnerPath: path.join(root, 'missing-run.sh'),
        ffmpegPath,
        uvPath,
        dataDir: root,
      }),
    ).toThrow('transcriber is missing');
    expect(() =>
      validateSightkickRuntime({
        runnerPath,
        ffmpegPath: path.join(root, 'missing-ffmpeg'),
        uvPath,
        dataDir: root,
      }),
    ).toThrow('FFmpeg runtime is unavailable');
    expect(() =>
      validateSightkickRuntime({ runnerPath, ffmpegPath, dataDir: root }),
    ).toThrow('uv or Python 3.12+');
    expect(
      validateSightkickRuntime({
        runnerPath,
        ffmpegPath,
        uvPath,
        dataDir: root,
      }),
    ).toMatchObject({ runnerPath, ffmpegPath, uvPath, dataDir: root });
  });

  it('normalizes executable paths before a worker changes into its temp directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-relative-'));

    cleanup.push(root);

    const runnerPath = path.join(root, 'run.sh');
    const ffmpegPath = path.join(root, 'ffmpeg');
    const uvPath = path.join(root, 'uv');

    for (const filePath of [runnerPath, ffmpegPath, uvPath]) {
      fs.writeFileSync(filePath, '');
      fs.chmodSync(filePath, 0o700);
    }

    const runtime = validateSightkickRuntime({
      runnerPath: path.relative(process.cwd(), runnerPath),
      ffmpegPath: path.relative(process.cwd(), ffmpegPath),
      uvPath: path.relative(process.cwd(), uvPath),
      dataDir: path.relative(process.cwd(), root),
    });

    expect(runtime).toMatchObject({
      runnerPath,
      ffmpegPath,
      uvPath,
      dataDir: root,
    });
  });

  it('resolves only the packaged or cached Apple Silicon LGPL runtime', () => {
    expect(
      drumrollFfmpegRuntimeCandidates({
        isPackaged: true,
        resourcesPath: '/Applications/Drumroll.app/Contents/Resources',
        appPath: '/Applications/Drumroll.app/Contents/Resources/app.asar',
        platform: 'darwin',
        architecture: 'arm64',
      }),
    ).toEqual([
      '/Applications/Drumroll.app/Contents/Resources/ffmpeg-runtime/bin/ffmpeg',
    ]);
    expect(
      drumrollFfmpegRuntimeCandidates({
        isPackaged: false,
        resourcesPath: '/repo/resources',
        appPath: '/repo',
        platform: 'darwin',
        architecture: 'arm64',
      }),
    ).toEqual([
      '/repo/node_modules/.cache/drumroll-ffmpeg/macos-arm64/bin/ffmpeg',
    ]);
    expect(
      drumrollFfmpegRuntimeCandidates({
        isPackaged: true,
        resourcesPath: 'C:\\resources',
        appPath: 'C:\\app',
        platform: 'win32',
        architecture: 'x64',
      }),
    ).toEqual([]);
  });

  it('parses only structured OCTAVE worker events', () => {
    expect(
      parseWorkerLine(
        '__OCTAVE_EVENT__{"kind":"progress","runId":"job-1","percent":55}',
      ),
    ).toMatchObject({ kind: 'progress', runId: 'job-1', percent: 55 });
    expect(parseWorkerLine('regular worker output')).toBeUndefined();
    expect(parseWorkerLine('__OCTAVE_EVENT__{bad')).toBeUndefined();
  });
});

describe('sightkick sidecar __SK_EVENT__ parser', () => {
  it('parses only well-formed, correctly-prefixed events', () => {
    expect(
      parseSkEventLine(
        '__SK_EVENT__ {"kind":"progress","stage":"download","percent":10,"message":"Downloading"}',
      ),
    ).toEqual({
      kind: 'progress',
      stage: 'download',
      percent: 10,
      message: 'Downloading',
    });
    expect(
      parseSkEventLine(
        '__SK_EVENT__ {"kind":"complete","success":true,"songDir":"/tmp/prepared"}',
      ),
    ).toEqual({ kind: 'complete', success: true, songDir: '/tmp/prepared' });
    expect(
      parseSkEventLine('__SK_EVENT__ {"kind":"error","message":"boom"}'),
    ).toEqual({ kind: 'error', message: 'boom' });
    expect(
      parseSkEventLine(
        '__SK_EVENT__ {"kind":"error","message":"No drums detected in this audio","code":"no-drums"}',
      ),
    ).toEqual({
      kind: 'error',
      message: 'No drums detected in this audio',
      code: 'no-drums',
    });
  });

  it('ignores stray sidecar output, missing the required space, malformed JSON, and unknown kinds', () => {
    expect(parseSkEventLine('regular sidecar log output')).toBeUndefined();
    expect(parseSkEventLine('')).toBeUndefined();
    // Missing the mandated trailing space in the prefix.
    expect(parseSkEventLine('__SK_EVENT__{"kind":"progress"}')).toBeUndefined();
    expect(parseSkEventLine('__SK_EVENT__ {not json')).toBeUndefined();
    expect(parseSkEventLine('__SK_EVENT__ null')).toBeUndefined();
    expect(parseSkEventLine('__SK_EVENT__ "a string"')).toBeUndefined();
    expect(parseSkEventLine('__SK_EVENT__ {"kind":"unknown"}')).toBeUndefined();
  });
});

describe('sightkick sidecar chunked stdout reader', () => {
  it('parses well-formed lines and drops malformed ones interleaved between them', () => {
    const events: SkWorkerEvent[] = [];
    const reader = createSkEventReader((event) => events.push(event));

    reader.push('some unrelated log noise\n');
    reader.push(
      '__SK_EVENT__ {"kind":"progress","stage":"separate","percent":30,"message":"Separating"}\n',
    );
    reader.push('__SK_EVENT__ not json\n');
    reader.push('__SK_EVENT__{"kind":"progress","percent":1}\n');
    reader.push('__SK_EVENT__ {"kind":"unknown"}\n');

    expect(events).toEqual([
      {
        kind: 'progress',
        stage: 'separate',
        percent: 30,
        message: 'Separating',
      },
    ]);
  });

  it('reassembles a single event whose JSON body is split across multiple stdout chunks', () => {
    const events: SkWorkerEvent[] = [];
    const reader = createSkEventReader((event) => events.push(event));

    reader.push('__SK_EVENT__ {"kind":"progress",');
    reader.push('"stage":"beats","percent":');
    reader.push('60}\n');

    expect(events).toEqual([{ kind: 'progress', stage: 'beats', percent: 60 }]);
  });

  it('parses multiple events in one chunk and one split across the next chunk without corruption', () => {
    const events: SkWorkerEvent[] = [];
    const reader = createSkEventReader((event) => events.push(event));

    reader.push(
      '__SK_EVENT__ {"kind":"progress","stage":"download","percent":5}\n' +
        '__SK_EVENT__ {"kind":"progress","stage":"transcribe","percent":80}\n' +
        '__SK_EVENT__ {"kind":"comp',
    );
    reader.push('lete","success":true,"songDir":"/tmp/prepared"}\n');

    expect(events).toEqual([
      { kind: 'progress', stage: 'download', percent: 5 },
      { kind: 'progress', stage: 'transcribe', percent: 80 },
      { kind: 'complete', success: true, songDir: '/tmp/prepared' },
    ]);
  });

  it('only emits a final unterminated line once flushed, and never duplicates it', () => {
    const events: SkWorkerEvent[] = [];
    const reader = createSkEventReader((event) => events.push(event));

    reader.push('__SK_EVENT__ {"kind":"error","message":"boom"}');
    expect(events).toEqual([]);

    reader.flush();
    expect(events).toEqual([{ kind: 'error', message: 'boom' }]);

    reader.flush();
    expect(events).toHaveLength(1);
  });
});

describe('auto-chart queue — octave backend (local file only)', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const root of cleanup.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps FIFO work active one at a time and emits a review before import', async () => {
    const sourceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'auto-chart-audio-'),
    );

    cleanup.push(sourceRoot);

    const harness = createHarness({
      audioPaths: [
        writeAudio(sourceRoot, 'one.mp3'),
        writeAudio(sourceRoot, 'two.mp3'),
      ],
    });

    cleanup.push(harness.root);

    const first = makeEvent();
    const second = makeEvent();

    await harness.queue.create(first as never, {});
    await harness.queue.create(second as never, {});
    await vi.waitFor(() => expect(harness.octaveRuns).toHaveLength(1));
    await nextTurn();
    expect(harness.octaveRuns[0].payload.runId).toBe(latestJob(first).id);
    expect(latestJob(first).backend).toBe('octave');
    expect(harness.octaveRuns[0].payload).toMatchObject({
      files: [fs.realpathSync(path.join(sourceRoot, 'one.mp3'))],
      urls: [],
      includeKeys: false,
      enabledTracks: {
        drums: true,
        bass: false,
        guitar: false,
        keys: false,
        vocals: false,
        proKeys: false,
      },
      keepStems: true,
      autoTempo: true,
      autoTempoDrift: true,
      autoTempoSnap: true,
    });
    harness.octaveRuns[0].emit({
      kind: 'progress',
      runId: harness.octaveRuns[0].payload.runId,
      percent: 25,
    });
    await vi.waitFor(() =>
      expect(latestJob(first)).toMatchObject({
        stage: 'processing',
        percent: 25,
      }),
    );

    const outputDir = harness.octaveRuns[0].payload.outputDir as string;
    const songDir = path.join(outputDir, 'prepared');

    fs.mkdirSync(songDir, { recursive: true });
    harness.octaveRuns[0].emit({
      kind: 'complete',
      runId: harness.octaveRuns[0].payload.runId,
      success: true,
      outputDir,
      songFolders: [songDir],
      errors: [],
    });
    await vi.waitFor(() =>
      expect(latestJob(first)).toMatchObject({ stage: 'preview-ready' }),
    );
    harness.octaveRuns[0].finish();
    await vi.waitFor(() => expect(harness.octaveRuns).toHaveLength(2));
    expect(harness.importSong).not.toHaveBeenCalled();

    const previewDir = latestJob(first).preview?.sourceDir;

    await harness.queue.import(latestJob(first).id);

    expect(harness.importSong).toHaveBeenCalledWith(previewDir, undefined);
    expect(latestJob(first)).toMatchObject({ stage: 'imported' });
  });

  it('cancels queued work without starting it and cleans active work after the child exits', async () => {
    const sourceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'auto-chart-audio-'),
    );

    cleanup.push(sourceRoot);

    const harness = createHarness({
      audioPaths: [
        writeAudio(sourceRoot, 'one.mp3'),
        writeAudio(sourceRoot, 'two.mp3'),
      ],
    });

    cleanup.push(harness.root);

    const first = makeEvent();
    const second = makeEvent();

    await harness.queue.create(first as never, {});
    await harness.queue.create(second as never, {});
    await vi.waitFor(() => expect(harness.octaveRuns).toHaveLength(1));
    await nextTurn();

    const activeTempDir = harness.octaveRuns[0].payload.outputDir as string;

    await harness.queue.cancel(latestJob(second).id);
    expect(latestJob(second)).toMatchObject({ stage: 'cancelled' });
    expect(harness.octaveRuns).toHaveLength(1);

    await harness.queue.cancel(latestJob(first).id);
    expect(harness.octaveRuns[0].kill).toHaveBeenCalledOnce();
    harness.octaveRuns[0].finish();
    await vi.waitFor(() =>
      expect(latestJob(first)).toMatchObject({ stage: 'cancelled' }),
    );

    expect(latestJob(first)).toMatchObject({ stage: 'cancelled' });
    expect(fs.existsSync(activeTempDir)).toBe(false);
  });

  it('creates a new attempt on retry and preserves monotonic worker progress', async () => {
    const sourceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'auto-chart-audio-'),
    );

    cleanup.push(sourceRoot);

    const harness = createHarness({
      audioPaths: [writeAudio(sourceRoot, 'one.mp3')],
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {});
    await vi.waitFor(() => expect(harness.octaveRuns).toHaveLength(1));
    await nextTurn();

    const firstRun = harness.octaveRuns[0];
    const firstJob = latestJob(event);

    firstRun.emit({
      kind: 'progress',
      runId: firstRun.payload.runId,
      percent: 70,
    });
    firstRun.emit({
      kind: 'progress',
      runId: firstRun.payload.runId,
      percent: 20,
    });
    await nextTurn();
    expect(latestJob(event)).toMatchObject({
      stage: 'processing',
      percent: 70,
    });

    firstRun.emit({
      kind: 'error',
      runId: firstRun.payload.runId,
      message: 'model failed',
    });
    firstRun.finish();
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({
        stage: 'failed',
        error: 'model failed',
      }),
    );

    await harness.queue.retry(event as never, firstJob.id);
    await vi.waitFor(() => expect(harness.octaveRuns).toHaveLength(2));
    expect(latestJob(event)).toMatchObject({ attempt: 2, stage: 'processing' });
    expect(latestJob(event).id).not.toBe(firstJob.id);
  });
});

describe('auto-chart queue — sightkick backend', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();

    for (const root of cleanup.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('continues to the sidecar when optional oEmbed metadata is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );

    const harness = createHarness({
      backends: { sightkick: true, octave: false },
      resolveMetadata: fetchOfficialYoutubeMetadata,
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));

    expect(harness.skRuns[0].input.youtubeUrl).toBe(
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
    expect(latestJob(event)).toMatchObject({ stage: 'downloading' });
  });

  it('carries reviewed source provenance through the chart preparation boundary', async () => {
    const sourceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'auto-chart-audio-'),
    );
    const audioPath = writeAudio(sourceRoot, 'local.mp3');
    const harness = createHarness({
      audioPaths: [audioPath],
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(sourceRoot, harness.root);

    const event = makeEvent();
    const sourceProvenance = {
      provider: 'yandex-music' as const,
      collectionId: 'drums-playlist',
      collectionName: 'drums',
      trackId: 'yandex:drums-playlist:2',
      title: 'Natural Villain',
      artists: ['Mokita'],
      durationSeconds: 199,
      sourceUrl: 'https://music.yandex.ru/album/123/track/456',
    };

    await harness.queue.create(event as never, {
      localFile: true,
      sourceProvenance,
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));
    expect(harness.skRuns[0].input.audioPath).toBe(fs.realpathSync(audioPath));

    const songDir = path.join(harness.skRuns[0].input.tempDir, 'prepared');

    fs.mkdirSync(songDir, { recursive: true });

    harness.skRuns[0].emit({ kind: 'complete', success: true, songDir });

    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({
        stage: 'preview-ready',
        sourceProvenance,
      }),
    );
    expect(harness.applyMetadata).toHaveBeenCalledOnce();
    expect(harness.applyMetadata).toHaveBeenCalledWith(
      fs.realpathSync(songDir),
      undefined,
      sourceProvenance,
    );

    harness.skRuns[0].finish();
  });

  it('automatically imports a verified source-linked YouTube recording without opening a file dialog', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
      inspectYoutubeCandidate: async (canonicalUrl) => ({
        videoId: 'abcdefghijk',
        title: 'Mokita - Natural Villain (Official Audio)',
        uploader: 'Mokita',
        durationSeconds: 199,
        watchUrl: canonicalUrl,
      }),
    });

    cleanup.push(harness.root);

    const event = makeEvent();
    const sourceProvenance = {
      provider: 'yandex-music' as const,
      collectionId: 'drums-playlist',
      collectionName: 'drums',
      trackId: 'yandex:drums-playlist:2',
      title: 'Natural Villain',
      artists: ['Mokita'],
      durationSeconds: 199,
    };

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      autoImport: true,
      sourceProvenance,
      youtubeCandidate: {
        videoId: 'abcdefghijk',
        title: 'Mokita - Natural Villain (Official Audio)',
        uploader: 'Mokita',
        durationSeconds: 199,
        watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      },
    });

    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));
    expect(harness.selectAudioCalls).toBe(0);
    expect(harness.inspectedUrls).toEqual([
      'https://www.youtube.com/watch?v=abcdefghijk',
    ]);

    const songDir = path.join(harness.skRuns[0].input.tempDir, 'prepared');

    fs.mkdirSync(songDir, { recursive: true });
    fs.writeFileSync(
      path.join(songDir, 'song.ini'),
      `[song]\nname = Natural Villain\nartist = Mokita\nsk_source_provider = yandex-music\nsk_source_collection_id = drums-playlist\nsk_source_collection_name = drums\nsk_source_track_id = yandex:drums-playlist:2\nsk_source_title = Natural Villain\nsk_source_artists = ["Mokita"]\nsk_source_duration = 199\n`,
    );
    fs.writeFileSync(
      path.join(songDir, 'notes.chart'),
      '[Song]\n{\n  Resolution = 192\n}\n[ExpertDrums]\n{\n  0 = N 0 0\n}\n',
    );
    fs.writeFileSync(path.join(songDir, 'song.mp3'), 'fetched audio');

    const preparedRealPath = fs.realpathSync(songDir);

    harness.skRuns[0].emit({ kind: 'complete', success: true, songDir });

    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({ stage: 'imported' }),
    );
    expect(harness.importSong).toHaveBeenCalledWith(
      preparedRealPath,
      undefined,
      expect.objectContaining({
        audio: expect.objectContaining({
          source: 'youtube-fetched',
          youtube: expect.objectContaining({
            videoId: 'abcdefghijk',
            downloader: 'yt-dlp',
            downloaderVersion: '2026.7.4',
          }),
        }),
      }),
    );
    expect(fs.existsSync(harness.createdTempDirs[0])).toBe(false);

    harness.skRuns[0].finish();
  });

  it('rejects a forged source-linked YouTube candidate before creating a temp directory', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      sourceProvenance: {
        provider: 'yandex-music',
        collectionId: 'drums-playlist',
        collectionName: 'drums',
        trackId: 'yandex:drums-playlist:2',
        title: 'Natural Villain',
        artists: ['Mokita'],
        durationSeconds: 199,
      },
      youtubeCandidate: {
        videoId: 'wrong000001',
        title: 'Mokita - Natural Villain',
        durationSeconds: 199,
        watchUrl: 'https://www.youtube.com/watch?v=wrong000001',
      },
    });

    expect(harness.skRuns).toHaveLength(0);
    expect(harness.selectAudioCalls).toBe(0);
    expect(harness.createdTempDirs).toEqual([]);
    expect(latestJob(event)).toMatchObject({
      stage: 'failed',
      error: expect.stringContaining('invalid identity'),
    });
  });

  it('rejects a changed YouTube identity before the sidecar can download it', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
      inspectYoutubeCandidate: async (canonicalUrl) => ({
        videoId: 'abcdefghijk',
        title: 'Mokita - A Different Recording',
        uploader: 'Mokita',
        durationSeconds: 199,
        watchUrl: canonicalUrl,
      }),
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      sourceProvenance: {
        provider: 'yandex-music',
        collectionId: 'drums-playlist',
        collectionName: 'drums',
        trackId: 'yandex:drums-playlist:2',
        title: 'Natural Villain',
        artists: ['Mokita'],
        durationSeconds: 199,
      },
      youtubeCandidate: {
        videoId: 'abcdefghijk',
        title: 'Mokita - Natural Villain (Official Audio)',
        uploader: 'Mokita',
        durationSeconds: 199,
        watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      },
    });

    expect(harness.inspectedUrls).toEqual([
      'https://www.youtube.com/watch?v=abcdefghijk',
    ]);
    expect(harness.skRuns).toHaveLength(0);
    expect(harness.createdTempDirs).toEqual([]);
    expect(latestJob(event)).toMatchObject({
      stage: 'failed',
      error: expect.stringContaining('title changed'),
    });
  });

  it('cleans a failed source-linked fetch and re-verifies the retry in a fresh temp directory', async () => {
    const inspect = vi.fn(async (canonicalUrl: string) => ({
      videoId: 'abcdefghijk',
      title: 'Mokita - Natural Villain (Official Audio)',
      uploader: 'Mokita',
      durationSeconds: 199,
      watchUrl: canonicalUrl,
    }));
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
      inspectYoutubeCandidate: inspect,
    });

    cleanup.push(harness.root);

    const event = makeEvent();
    const request = {
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      sourceProvenance: {
        provider: 'yandex-music' as const,
        collectionId: 'drums-playlist',
        collectionName: 'drums',
        trackId: 'yandex:drums-playlist:2',
        title: 'Natural Villain',
        artists: ['Mokita'],
        durationSeconds: 199,
      },
      youtubeCandidate: {
        videoId: 'abcdefghijk',
        title: 'Mokita - Natural Villain (Official Audio)',
        uploader: 'Mokita',
        durationSeconds: 199,
        watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      },
    };

    await harness.queue.create(event as never, request);
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));

    const firstTempDir = harness.skRuns[0].input.tempDir;
    const failedId = latestJob(event).id;

    harness.skRuns[0].emit({
      kind: 'error',
      message: 'The selected recording could not be fetched',
    });
    harness.skRuns[0].finish();

    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({ stage: 'failed' }),
    );
    expect(fs.existsSync(firstTempDir)).toBe(false);

    await harness.queue.retry(event as never, failedId);
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(2));

    const retryTempDir = harness.skRuns[1].input.tempDir;

    expect(retryTempDir).not.toBe(firstTempDir);
    expect(fs.existsSync(retryTempDir)).toBe(true);
    expect(harness.selectAudioCalls).toBe(0);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(harness.inspectedUrls).toEqual([
      'https://www.youtube.com/watch?v=abcdefghijk',
      'https://www.youtube.com/watch?v=abcdefghijk',
    ]);

    await harness.queue.cancel(latestJob(event).id);
    harness.skRuns[1].finish();
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({ stage: 'cancelled' }),
    );
  });

  it('downloads audio automatically from a pasted YouTube URL without prompting for a local file', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));
    await nextTurn();

    expect(harness.selectAudioCalls).toBe(0);
    expect(harness.skRuns[0].input).toMatchObject({
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      audioPath: undefined,
    });
    expect(latestJob(event)).toMatchObject({
      stage: 'downloading',
      backend: 'sightkick',
    });

    harness.skRuns[0].emit({
      kind: 'progress',
      stage: 'download',
      percent: 40,
      message: 'Downloading from YouTube',
    });
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({
        stage: 'downloading',
        percent: 40,
      }),
    );

    harness.skRuns[0].emit({
      kind: 'progress',
      stage: 'separate',
      percent: 65,
      message: 'Separating stems',
    });
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({
        stage: 'processing',
        percent: 65,
      }),
    );

    const songDir = path.join(harness.skRuns[0].input.tempDir, 'prepared');

    fs.mkdirSync(songDir, { recursive: true });

    const preparedRealPath = fs.realpathSync(songDir);

    harness.skRuns[0].emit({
      kind: 'complete',
      success: true,
      songDir,
    });
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({ stage: 'preview-ready' }),
    );
    expect(latestJob(event).preview?.sourceDir).toBe(preparedRealPath);

    harness.skRuns[0].finish();
    await nextTurn();

    await harness.queue.import(latestJob(event).id);
    expect(harness.importSong).toHaveBeenCalledWith(
      preparedRealPath,
      undefined,
    );
    expect(latestJob(event)).toMatchObject({ stage: 'imported' });
  });

  it('adds a one-click YouTube result only after the chart is prepared', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
      autoImport: true,
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));

    const songDir = path.join(harness.skRuns[0].input.tempDir, 'prepared');

    fs.mkdirSync(songDir, { recursive: true });

    const preparedRealPath = fs.realpathSync(songDir);

    harness.skRuns[0].emit({ kind: 'complete', success: true, songDir });

    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({
        stage: 'imported',
        autoImport: true,
      }),
    );
    expect(harness.importSong).toHaveBeenCalledWith(
      preparedRealPath,
      undefined,
    );

    harness.skRuns[0].finish();
  });

  it('still supports choosing a local audio file with the sightkick backend', async () => {
    const sourceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'auto-chart-audio-'),
    );

    cleanup.push(sourceRoot);

    const harness = createHarness({
      audioPaths: [writeAudio(sourceRoot, 'one.mp3')],
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, { localFile: true });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));
    await nextTurn();

    expect(harness.selectAudioCalls).toBe(1);
    expect(harness.skRuns[0].input.audioPath).toBe(
      fs.realpathSync(path.join(sourceRoot, 'one.mp3')),
    );
    expect(harness.skRuns[0].input.youtubeUrl).toBeUndefined();
    expect(latestJob(event)).toMatchObject({ stage: 'processing' });
  });

  it('cancels a YouTube download mid-flight, kills the sidecar process, and cleans up the temp dir', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));
    await nextTurn();

    const tempDir = harness.skRuns[0].input.tempDir;

    expect(fs.existsSync(tempDir)).toBe(true);
    expect(latestJob(event)).toMatchObject({ stage: 'downloading' });

    await harness.queue.cancel(latestJob(event).id);
    expect(harness.skRuns[0].kill).toHaveBeenCalledOnce();

    harness.skRuns[0].finish();
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({ stage: 'cancelled' }),
    );
    expect(fs.existsSync(tempDir)).toBe(false);
  });

  it('shuts down a half-completed YouTube fetch, removes its work dir, and leaves a fresh attempt unblocked', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const first = makeEvent();

    await harness.queue.create(first as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));

    const firstTempDir = harness.skRuns[0].input.tempDir;

    fs.writeFileSync(path.join(firstTempDir, 'partial-audio.m4a'), 'partial');
    await harness.queue.shutdown();

    expect(harness.skRuns[0].kill).toHaveBeenCalledOnce();
    expect(latestJob(first)).toMatchObject({ stage: 'cancelled' });
    expect(fs.existsSync(firstTempDir)).toBe(false);

    harness.skRuns[0].finish();
    await nextTurn();

    const second = makeEvent();

    await harness.queue.create(second as never, {
      youtubeUrl: 'https://youtu.be/aaaaaaaaaaa',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(2));

    const secondTempDir = harness.skRuns[1].input.tempDir;

    expect(secondTempDir).not.toBe(firstTempDir);
    expect(fs.existsSync(secondTempDir)).toBe(true);

    await harness.queue.cancel(latestJob(second).id);
    harness.skRuns[1].finish();
    await vi.waitFor(() =>
      expect(latestJob(second)).toMatchObject({ stage: 'cancelled' }),
    );
  });

  it('cancels a download queued behind another active job before it ever starts', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const first = makeEvent();
    const second = makeEvent();

    await harness.queue.create(first as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));
    await harness.queue.create(second as never, {
      youtubeUrl: 'https://youtu.be/aaaaaaaaaaa',
    });
    await vi.waitFor(() =>
      expect(latestJob(second)).toMatchObject({ stage: 'queued' }),
    );

    await harness.queue.cancel(latestJob(second).id);
    expect(latestJob(second)).toMatchObject({ stage: 'cancelled' });
    expect(harness.skRuns).toHaveLength(1);
  });

  it('exposes the full queue as a `jobs` snapshot on every update, so a listener can see and cancel a job it did not itself create', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/aaaaaaaaaaa',
    });
    await vi.waitFor(() => {
      const jobs = latestJob(event).jobs ?? [];

      expect(
        jobs.filter((candidate) => candidate.stage === 'queued'),
      ).toHaveLength(1);
    });

    const jobs = latestJob(event).jobs ?? [];
    const activeJob = jobs.find(
      (candidate) => candidate.stage === 'downloading',
    );
    const queuedJob = jobs.find((candidate) => candidate.stage === 'queued');

    expect(activeJob?.youtubeUrl).toBe(
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
    expect(queuedJob?.youtubeUrl).toBe(
      'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    );

    // Cancel the queued job purely by the id surfaced in the snapshot — the
    // queue already supports cancelling any job by id; this confirms that
    // id is actually reachable through 'auto-chart-update' rather than only
    // known to whichever create() call originally produced it.
    await harness.queue.cancel(queuedJob!.id);

    const jobsAfterCancel = latestJob(event).jobs ?? [];

    expect(jobsAfterCancel.map((candidate) => candidate.id)).not.toContain(
      queuedJob!.id,
    );
    expect(jobsAfterCancel.map((candidate) => candidate.id)).toContain(
      activeJob!.id,
    );
  });

  it('surfaces a sidecar error (e.g. an age-restricted or unavailable video) as a failed job with an honest message', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));

    harness.skRuns[0].emit({
      kind: 'error',
      message: 'This video is age-restricted and cannot be downloaded',
    });
    harness.skRuns[0].finish();
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({
        stage: 'failed',
        error: 'This video is age-restricted and cannot be downloaded',
      }),
    );
  });

  it('surfaces the no-drums gate as a distinct honest failure', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));

    harness.skRuns[0].emit({
      kind: 'error',
      message: 'No drums detected in this audio',
      code: 'no-drums',
    });
    harness.skRuns[0].finish();
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({
        stage: 'failed',
        message: 'No drums detected',
        error: 'No drums detected in this audio',
        errorCode: 'no-drums',
      }),
    );
  });
});

describe('auto-chart queue — remote backend', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const root of cleanup.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the remote runner and the same contained preview/import path', async () => {
    const harness = createHarness({
      backends: { sightkick: false, remote: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
      backend: 'remote',
    });
    await vi.waitFor(() => expect(harness.remoteRuns).toHaveLength(1));

    const run = harness.remoteRuns[0];
    const songDir = path.join(run.input.tempDir, 'Artist - Song');

    expect(harness.selectAudioCalls).toBe(0);
    expect(run.input).toMatchObject({
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
    expect(latestJob(event)).toMatchObject({
      stage: 'downloading',
      backend: 'remote',
    });

    run.emit({
      kind: 'progress',
      stage: 'transcribe',
      percent: 75,
      message: 'Transcribing notes remotely',
    });
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({
        stage: 'processing',
        percent: 75,
      }),
    );

    fs.mkdirSync(songDir);

    const preparedRealPath = fs.realpathSync(songDir);

    run.emit({ kind: 'complete', success: true, songDir });
    await vi.waitFor(() =>
      expect(latestJob(event)).toMatchObject({ stage: 'preview-ready' }),
    );
    expect(latestJob(event).preview?.sourceDir).toBe(preparedRealPath);

    run.finish();
    await harness.queue.import(latestJob(event).id);
    expect(harness.importSong).toHaveBeenCalledWith(
      preparedRealPath,
      undefined,
    );
    expect(latestJob(event)).toMatchObject({ stage: 'imported' });
  });
});

describe('auto-chart backend selection and fallback', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const root of cleanup.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('prefers sightkick by default when both backends are available', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: true },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));
    expect(latestJob(event).backend).toBe('sightkick');
    expect(harness.octaveRuns).toHaveLength(0);
  });

  it('falls back to octave when sightkick is unavailable and no backend is explicitly requested', async () => {
    const sourceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'auto-chart-audio-'),
    );

    cleanup.push(sourceRoot);

    const harness = createHarness({
      audioPaths: [writeAudio(sourceRoot, 'one.mp3')],
      backends: { sightkick: false, octave: true },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {});
    await vi.waitFor(() => expect(harness.octaveRuns).toHaveLength(1));
    expect(latestJob(event).backend).toBe('octave');
  });

  it('honors an explicit backend request when that backend is available', async () => {
    const sourceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'auto-chart-audio-'),
    );

    cleanup.push(sourceRoot);

    const harness = createHarness({
      audioPaths: [writeAudio(sourceRoot, 'one.mp3')],
      backends: { sightkick: true, octave: true },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, { backend: 'octave' });
    await vi.waitFor(() => expect(harness.octaveRuns).toHaveLength(1));
    expect(latestJob(event).backend).toBe('octave');
    expect(harness.skRuns).toHaveLength(0);
  });

  it('falls back to the available backend when the explicitly requested one is missing', async () => {
    const harness = createHarness({
      backends: { sightkick: true, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {
      youtubeUrl: 'https://youtu.be/abcdefghijk',
      backend: 'octave',
    });
    await vi.waitFor(() => expect(harness.skRuns).toHaveLength(1));
    expect(latestJob(event).backend).toBe('sightkick');
  });

  it('fails clearly, without ever prompting for a file, when no auto-chart backend is available', async () => {
    const harness = createHarness({
      backends: { sightkick: false, octave: false },
    });

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {});
    expect(latestJob(event)).toMatchObject({
      stage: 'failed',
      error: expect.stringContaining('No auto-chart backend is available'),
    });
    expect(harness.selectAudioCalls).toBe(0);
  });
});
