import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AutoChartQueue,
  AutoChartRunner,
  applyOfficialMetadata,
  canonicalizeYoutubeUrl,
  fetchOfficialYoutubeMetadata,
  parseWorkerLine,
  validateLocalAudioFile,
} from './autoChart';
import { lastReply, makeEvent } from './test-support';

interface Run {
  payload: Record<string, unknown>;
  emit: (event: Record<string, unknown>) => void;
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
    percent?: number;
    preview?: { sourceDir: string };
  };
}

function createHarness(audioPaths: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-chart-test-'));
  const runs: Run[] = [];
  let index = 0;
  let jobIndex = 0;
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
  const runner: AutoChartRunner = {
    run(payloadPath, emit) {
      const payload = JSON.parse(
        fs.readFileSync(payloadPath, 'utf8'),
      ) as Record<string, unknown>;
      let finish = () => {};
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const run = { payload, emit, finish, kill: vi.fn() };

      runs.push(run);

      return { kill: run.kill, done };
    },
  };
  const queue = new AutoChartQueue({
    selectAudio: async () => audioPaths[index++],
    resolveMetadata: async () => undefined,
    validateAudio: validateLocalAudioFile,
    createTempDir: async (id: string) =>
      fs.promises.mkdtemp(path.join(root, `${id}-`)),
    preflight: () =>
      ({
        cacheDir: root,
        pythonPath: '',
        workerPath: '',
        sourceDir: '',
        ffmpegDir: '',
      }) as never,
    runner,
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
  const complete = async (run: Run) => {
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

  return { root, runs, queue, importSong, complete };
}

function writeAudio(root: string, name: string): string {
  const filePath = path.join(root, name);

  fs.writeFileSync(filePath, 'audio');

  return filePath;
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

describe('auto-chart queue', () => {
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

    const harness = createHarness([
      writeAudio(sourceRoot, 'one.mp3'),
      writeAudio(sourceRoot, 'two.mp3'),
    ]);

    cleanup.push(harness.root);

    const first = makeEvent();
    const second = makeEvent();

    await harness.queue.create(first as never, {});
    await harness.queue.create(second as never, {});
    await vi.waitFor(() => expect(harness.runs).toHaveLength(1));
    await nextTurn();
    expect(harness.runs[0].payload.runId).toBe(latestJob(first).id);
    expect(harness.runs[0].payload).toMatchObject({
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
    harness.runs[0].emit({
      kind: 'progress',
      runId: harness.runs[0].payload.runId,
      percent: 25,
    });
    await vi.waitFor(() =>
      expect(latestJob(first)).toMatchObject({
        stage: 'processing',
        percent: 25,
      }),
    );

    const outputDir = harness.runs[0].payload.outputDir as string;
    const songDir = path.join(outputDir, 'prepared');

    fs.mkdirSync(songDir, { recursive: true });
    harness.runs[0].emit({
      kind: 'complete',
      runId: harness.runs[0].payload.runId,
      success: true,
      outputDir,
      songFolders: [songDir],
      errors: [],
    });
    await vi.waitFor(() =>
      expect(latestJob(first)).toMatchObject({ stage: 'preview-ready' }),
    );
    harness.runs[0].finish();
    await vi.waitFor(() => expect(harness.runs).toHaveLength(2));
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

    const harness = createHarness([
      writeAudio(sourceRoot, 'one.mp3'),
      writeAudio(sourceRoot, 'two.mp3'),
    ]);

    cleanup.push(harness.root);

    const first = makeEvent();
    const second = makeEvent();

    await harness.queue.create(first as never, {});
    await harness.queue.create(second as never, {});
    await vi.waitFor(() => expect(harness.runs).toHaveLength(1));
    await nextTurn();

    const activeTempDir = harness.runs[0].payload.outputDir as string;

    await harness.queue.cancel(latestJob(second).id);
    expect(latestJob(second)).toMatchObject({ stage: 'cancelled' });
    expect(harness.runs).toHaveLength(1);

    await harness.queue.cancel(latestJob(first).id);
    expect(harness.runs[0].kill).toHaveBeenCalledOnce();
    harness.runs[0].finish();
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

    const harness = createHarness([writeAudio(sourceRoot, 'one.mp3')]);

    cleanup.push(harness.root);

    const event = makeEvent();

    await harness.queue.create(event as never, {});
    await vi.waitFor(() => expect(harness.runs).toHaveLength(1));
    await nextTurn();

    const firstRun = harness.runs[0];
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
    await vi.waitFor(() => expect(harness.runs).toHaveLength(2));
    expect(latestJob(event)).toMatchObject({ attempt: 2, stage: 'processing' });
    expect(latestJob(event).id).not.toBe(firstJob.id);
  });
});
