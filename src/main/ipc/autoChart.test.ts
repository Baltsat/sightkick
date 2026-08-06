import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AutoChartQueue,
  AutoChartRunner,
  SightkickRunner,
  SkWorkerEvent,
  WorkerEvent,
  applyOfficialMetadata,
  canonicalizeYoutubeUrl,
  createSkEventReader,
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
  };
}

function writeAudio(root: string, name: string): string {
  const filePath = path.join(root, name);

  fs.writeFileSync(filePath, 'audio');

  return filePath;
}

interface HarnessOptions {
  audioPaths?: string[];
  backends?: { sightkick: boolean; octave: boolean };
  resolveMetadata?: typeof fetchOfficialYoutubeMetadata;
}

function createHarness(options: HarnessOptions = {}) {
  const backends = options.backends ?? { sightkick: false, octave: true };
  const audioPaths = options.audioPaths ?? [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-test-'));
  const octaveRuns: OctaveRun[] = [];
  const skRuns: SkRun[] = [];
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
  const queue = new AutoChartQueue({
    selectAudio: async () => {
      selectAudioCalls += 1;

      return audioPaths[audioIndex++];
    },
    resolveMetadata: options.resolveMetadata ?? (async () => undefined),
    validateAudio: validateLocalAudioFile,
    createTempDir: async (id: string) =>
      fs.promises.mkdtemp(path.join(root, `${id}-`)),
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
          'The bundled SightKick transcriber is missing; reinstall SightKick or switch to the OCTAVE backend',
        );
      }

      return {
        runnerPath: '/transcriber/run.sh',
        ffmpegPath: '/ffmpeg',
        dataDir: '/transcriber-data',
      };
    },
    octaveRunner,
    sightkickRunner,
    preview: async (sourceDir: string) => preview(sourceDir),
    importSong,
    cleanup: async (tempDir?: string) => {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    },
    applyMetadata: async () => {},
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
    queue,
    importSong,
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
    ).toThrow('ffmpeg runtime is missing');
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
