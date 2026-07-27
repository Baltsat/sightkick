import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeStore, lastReply, makeEvent, makeStore } from './test-support';

const storeHolder = vi.hoisted(() => ({
  current: undefined as FakeStore | undefined,
}));
const dialogHolder = vi.hoisted(() => ({
  sourceDir: '',
  canceled: false,
}));
const coverHolder = vi.hoisted(() => ({
  preview: {
    dataUrl: 'data:image/jpeg;base64,cHJldmlldw==',
    source: 'embedded' as const,
  },
}));

vi.mock('../AppState', () => ({
  appState: {
    store: {
      get: (key: string) => storeHolder.current!.get(key),
      set: (key: string, value: unknown) =>
        storeHolder.current!.set(key, value),
    },
  },
}));

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(async () => ({
      canceled: dialogHolder.canceled,
      filePaths: dialogHolder.canceled ? [] : [dialogHolder.sourceDir],
    })),
  },
}));

vi.mock('../songCover', () => ({
  previewSongCover: vi.fn(async () => coverHolder.preview),
  ingestSongCover: vi.fn(async () => coverHolder.preview.source),
}));

const { importSong, selectImportSong } = await import('./importSong');
const CHART = `[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = TS 4
  0 = B 120000
}
[ExpertDrums]
{
  0 = N 0 0
}
`;

describe('local song import', () => {
  let root: string;
  let library: string;
  let sourceDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-song-'));
    library = path.join(root, 'library');
    sourceDir = path.join(root, 'source');
    fs.mkdirSync(library);
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(
      path.join(sourceDir, 'song.ini'),
      [
        '[song]',
        'name = Raging',
        'artist = Kygo feat. Kodaline',
        'album = Cloud Nine',
        'auto_chart = True',
        'auto_chart_tool = STRUM (OCTAVE AI auto-charter)',
        'charter = STRUM',
        'diff_drums = 2',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(sourceDir, 'notes.chart'), CHART);
    fs.writeFileSync(path.join(sourceDir, 'song.mp3'), 'audio');
    storeHolder.current = makeStore({ lastOpenedPath: library, songs: {} });
    dialogHolder.sourceDir = sourceDir;
    dialogHolder.canceled = false;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('validates a selected chart folder and returns a metadata preview', async () => {
    const event = makeEvent();

    await selectImportSong(event as never);

    expect(lastReply(event, 'select-import-song')!.args[0]).toMatchObject({
      preview: {
        sourceDir,
        name: 'Raging',
        artist: 'Kygo feat. Kodaline',
        album: 'Cloud Nine',
        charter: '',
        autoChartTool: 'STRUM (OCTAVE AI auto-charter)',
        chartFormat: 'chart',
        audioCount: 1,
        coverSource: 'embedded',
      },
    });
  });

  it('copies the confirmed folder, ingests its cover and persists the song', async () => {
    const event = makeEvent();

    await importSong(event as never, {
      sourceDir,
      artworkUrl: 'https://example.com/permitted-cover.jpg',
    });

    const reply = lastReply(event, 'import-song')!.args[0] as {
      success: boolean;
      song: { id: string; dir: string; charter: string };
    };

    expect(reply.success).toBe(true);
    expect(reply.song.charter).toBe('');
    expect(reply.song.dir.startsWith(library)).toBe(true);
    expect(fs.existsSync(path.join(reply.song.dir, 'song.ini'))).toBe(true);
    expect(fs.existsSync(path.join(reply.song.dir, '.sightkick'))).toBe(true);
    expect(
      fs.readFileSync(path.join(reply.song.dir, 'song.ini'), 'utf-8'),
    ).toMatch(/^charter\s*=\s*$/m);
    expect(storeHolder.current.get(`songs.${reply.song.id}`)).toMatchObject({
      charter: '',
      auto_chart_tool: 'STRUM (OCTAVE AI auto-charter)',
    });
  });

  it('rejects a folder that has no playable audio', async () => {
    fs.rmSync(path.join(sourceDir, 'song.mp3'));

    const event = makeEvent();

    await selectImportSong(event as never);

    expect(lastReply(event, 'select-import-song')!.args[0]).toMatchObject({
      error: 'This folder has no playable audio file',
    });
  });

  it('never deletes an existing library folder when the name collides', async () => {
    const existing = path.join(library, 'Kygo feat. Kodaline - Raging');
    const sentinel = path.join(existing, 'keep.txt');

    fs.mkdirSync(existing);
    fs.writeFileSync(sentinel, 'manual library data');

    const event = makeEvent();

    await importSong(event as never, { sourceDir });

    expect(lastReply(event, 'import-song')!.args[0]).toMatchObject({
      success: false,
      error:
        'A library folder named "Kygo feat. Kodaline - Raging" already exists',
    });
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('manual library data');
  });

  it('rejects a source folder that contains the selected library', async () => {
    sourceDir = root;
    fs.renameSync(
      path.join(root, 'source', 'song.ini'),
      path.join(root, 'song.ini'),
    );
    fs.renameSync(
      path.join(root, 'source', 'notes.chart'),
      path.join(root, 'notes.chart'),
    );
    fs.renameSync(
      path.join(root, 'source', 'song.mp3'),
      path.join(root, 'song.mp3'),
    );

    const event = makeEvent();

    await importSong(event as never, { sourceDir });

    expect(lastReply(event, 'import-song')!.args[0]).toMatchObject({
      success: false,
      error: 'The selected song folder cannot contain the library',
    });
    expect(fs.existsSync(library)).toBe(true);
  });
});
