import { installWebPlatform } from '.';
import { webCapabilities } from './capabilities';
import yandexSource from '../../../resources/library-sources/yandex-drums-2026-08-09.json';
import yandexFavoritesSource from '../../../resources/library-sources/yandex-favorites-2026-08-10.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./tar', () => ({
  extractTarGzip: vi.fn(
    async () =>
      new Map([
        [
          'prepared/song.ini',
          new TextEncoder().encode(
            '[Song]\nname = Natural Villain\nartist = Mokita\npro_drums = True\n',
          ),
        ],
        ['prepared/notes.chart', new TextEncoder().encode('[Song]\n{}\n')],
      ]),
  ),
}));

vi.mock('./library', async () => {
  const actual = await vi.importActual<typeof import('./library')>('./library');

  return { ...actual, saveStoredSong: vi.fn(async () => {}) };
});

function reply<T>(request: string, response: string): Promise<T> {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once(response as never, resolve as never);
    window.electron.ipcRenderer.sendMessage(request as never);
  });
}

function replyWithArgs<T>(
  request: string,
  response: string,
  ...args: unknown[]
): Promise<T> {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once(response as never, resolve as never);
    window.electron.ipcRenderer.sendMessage(request as never, ...args);
  });
}

describe('web platform channel mapping', () => {
  beforeEach(() => {
    localStorage.clear();
    installWebPlatform();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('publishes an explicit capability map', () => {
    expect(window.drumrollPlatform).toEqual({
      kind: 'web',
      capabilities: webCapabilities,
    });
    expect(webCapabilities).toMatchObject({
      lessonLibrary: true,
      indexedDbImports: true,
      webMidi: true,
      youtubeImport: false,
      onlineSongDownloads: false,
      localFolderImport: false,
      stemSplit: false,
      octave: false,
      myMusic: false,
      appUpdates: false,
    });
  });

  it('does not advertise a transcriber that production has not configured', async () => {
    await expect(
      reply('check-auto-chart-backends', 'auto-chart-backends'),
    ).resolves.toEqual({
      sightkick: false,
      remote: false,
      octave: false,
      default: 'remote',
    });
  });

  it('reports the browser transcriber settings honestly', async () => {
    await expect(
      reply('get-auto-chart-remote-settings', 'auto-chart-remote-settings'),
    ).resolves.toEqual({ endpoint: '', tokenConfigured: false });

    await expect(
      replyWithArgs(
        'save-test-auto-chart-remote',
        'auto-chart-remote-test',
        {},
      ),
    ).resolves.toEqual({
      ok: false,
      message:
        'Chart creation is available in the desktop app; this browser deployment has no transcriber connection.',
    });
  });

  it('returns an honest unsupported state for desktop stem tools', async () => {
    await expect(
      reply('check-stem-tools', 'check-stem-tools'),
    ).resolves.toEqual({ status: 'unsupported' });
  });

  it('exposes both captured Yandex playlists as metadata-only candidates', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes('yandex-favorites')
                ? yandexFavoritesSource
                : yandexSource,
            ),
            { status: 200 },
          ),
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      reply('load-library-candidates', 'load-library-candidates'),
    ).resolves.toMatchObject({
      yandex: {
        drums: {
          source: 'yandex-music',
          playlist: { name: 'Drums', rightsScope: 'metadata-only' },
          tracks: { length: 13 },
        },
        favorites: {
          source: 'yandex-music',
          playlist: { name: 'Favorites', rightsScope: 'metadata-only' },
          tracks: { length: 230 },
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/library-sources/yandex-drums-2026-08-09.json',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/library-sources/yandex-favorites-2026-08-10.json',
    );
  });

  it('keeps reviewed source provenance through the web import result', async () => {
    const sourceProvenance = {
      provider: 'yandex-music' as const,
      collectionId: 'drums-playlist',
      collectionName: 'drums',
      trackId: 'yandex:drums-playlist:2',
      title: 'Natural Villain',
      artists: ['Mokita'],
      sourceUrl: 'https://music.yandex.ru/album/123/track/456',
    };
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === '/api/import' && init?.method === 'POST') {
        return new Response(JSON.stringify({ jobId: 'source-job' }), {
          status: 200,
        });
      }

      if (url === '/api/import/source-job') {
        return new Response(JSON.stringify({ status: 'done' }), {
          status: 200,
        });
      }

      if (url === '/api/import/source-job/result') {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    const updates: { stage: string; song?: { sourceProvenance?: unknown } }[] =
      [];

    vi.stubGlobal('fetch', fetchMock);
    window.electron.ipcRenderer.on('auto-chart-update', (update) => {
      updates.push(update as (typeof updates)[number]);
    });
    window.electron.ipcRenderer.sendMessage('create-auto-chart', {
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      sourceProvenance,
    });

    await vi.waitFor(() =>
      expect(updates.some(({ stage }) => stage === 'preview-ready')).toBe(true),
    );
    window.electron.ipcRenderer.sendMessage('import-auto-chart', 'source-job');

    await vi.waitFor(() =>
      expect(updates.find(({ stage }) => stage === 'imported')?.song).toEqual(
        expect.objectContaining({ sourceProvenance }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/import',
      expect.objectContaining({
        body: JSON.stringify({
          url: 'https://www.youtube.com/watch?v=abcdefghijk',
        }),
      }),
    );
  });

  it('always resolves an empty web goal load so Profile can leave its spinner', async () => {
    await expect(reply('load-goals', 'load-goals')).resolves.toEqual({
      goals: [],
    });
  });

  it('reports no retired desktop curriculum evidence in a web-only profile', async () => {
    await expect(
      reply('load-retired-lessons', 'load-retired-lessons'),
    ).resolves.toEqual({ lessons: [] });
  });

  it('persists desktop-compatible goals with stable ids and timestamps', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T10:00:00.000Z'));

    const created = await replyWithArgs<{
      goals: Array<{
        id: string;
        songId: string;
        difficulty: string;
        targetDate?: string;
        createdAt: string;
        isPrimary: boolean;
      }>;
    }>('save-goal', 'save-goal', {
      songId: 'song-1',
      difficulty: 'medium',
      targetDate: '2026-09-01',
    });
    const first = created.goals[0];

    expect(created.goals).toEqual([
      {
        id: expect.any(String),
        songId: 'song-1',
        difficulty: 'medium',
        targetDate: '2026-09-01',
        createdAt: '2026-08-09T10:00:00.000Z',
        isPrimary: true,
      },
    ]);
    expect(first.id).not.toHaveLength(0);

    installWebPlatform();
    await expect(reply('load-goals', 'load-goals')).resolves.toEqual(created);

    vi.setSystemTime(new Date('2026-08-10T10:00:00.000Z'));

    const updated = await replyWithArgs<typeof created>(
      'save-goal',
      'save-goal',
      {
        id: first.id,
        songId: 'song-1',
        difficulty: 'hard',
        targetDate: '2026-09-15',
      },
    );

    expect(updated.goals[0]).toEqual({
      ...first,
      difficulty: 'hard',
      targetDate: '2026-09-15',
    });
    expect(updated.goals[0].id).toBe(first.id);
    expect(updated.goals[0].createdAt).toBe(first.createdAt);
  });

  it('keeps one primary goal and supports delete with full-list replies', async () => {
    const firstReply = await replyWithArgs<{
      goals: Array<{ id: string; isPrimary: boolean }>;
    }>('save-goal', 'save-goal', {
      songId: 'song-1',
      difficulty: 'easy',
    });
    const firstId = firstReply.goals[0].id;
    const secondReply = await replyWithArgs<{
      goals: Array<{ id: string; isPrimary: boolean }>;
    }>('save-goal', 'save-goal', {
      songId: 'song-2',
      difficulty: 'expert',
    });
    const secondId = secondReply.goals[1].id;

    expect(secondReply.goals.map(({ isPrimary }) => isPrimary)).toEqual([
      true,
      false,
    ]);

    const primaryReply = await replyWithArgs<typeof secondReply>(
      'set-primary-goal',
      'set-primary-goal',
      secondId,
    );

    expect(
      primaryReply.goals.map(({ id, isPrimary }) => [id, isPrimary]),
    ).toEqual([
      [firstId, false],
      [secondId, true],
    ]);

    await expect(
      replyWithArgs('delete-goal', 'delete-goal', secondId),
    ).resolves.toMatchObject({
      goals: [{ id: firstId, isPrimary: false }],
    });
  });

  it('returns goal mutation errors instead of leaving Profile waiting', async () => {
    await expect(
      replyWithArgs('set-primary-goal', 'set-primary-goal', 'missing'),
    ).resolves.toEqual({ error: 'no stored goal with id missing' });
    await expect(
      replyWithArgs('save-goal', 'save-goal', {
        songId: '',
        difficulty: 'expert',
      }),
    ).resolves.toEqual({ error: 'songId is required' });
  });

  it('persists full hit records for new web runs and returns legacy runs as summary-only', async () => {
    const summary = {
      completedAt: '2026-08-08T14:00:00.000Z',
      totalHits: 8,
      totalMisses: 2,
      totalWrong: 1,
      overallAccuracy: 0.8,
      laneAccuracy: [{ element: 'snare', hits: 6, misses: 2, accuracy: 0.75 }],
      laneBias: [{ element: 'snare', meanMs: -12, sampleCount: 6 }],
      timingBias: {
        meanMs: -12,
        medianMs: -10,
        spreadMs: 8,
        earlyCount: 5,
        lateCount: 1,
        onTimeCount: 0,
        sampleCount: 6,
      },
      wrongHitCounts: [{ element: 'kick', count: 1 }],
      context: {
        sessionId: 'web-v2',
        schemaVersion: 2,
        appVersion: '1.2.0-kb.1',
        scoringPolicyVersion: 'judge-resolved-v2',
        startedAt: '2026-08-08T13:55:00.000Z',
        chartRevision: 'song-1:expert:v1',
        deviceId: 'web-midi:0',
        deviceName: 'Yamaha DTX402',
        inputLatencyMs: 8,
        inputMapping: { snare: ['midi:38'] },
      },
    };

    await expect(
      replyWithArgs('save-practice-run', 'save-practice-run', {
        songId: 'song-1',
        summary,
        records: [
          {
            tick: 192,
            timeSeconds: 0.5,
            deltaMs: -12,
            element: 'snare',
            verdict: 'hit',
            velocity: 100,
          },
        ],
      }),
    ).resolves.toMatchObject({
      songId: 'song-1',
      runs: [summary],
      fullRuns: [
        {
          summary,
          records: [
            {
              tick: 192,
              deltaMs: -12,
              element: 'snare',
              verdict: 'hit',
              velocity: 100,
            },
          ],
        },
      ],
    });

    localStorage.setItem(
      'drumroll.web.practice-runs',
      JSON.stringify({ legacy: [summary] }),
    );

    await expect(
      replyWithArgs('load-practice-runs', 'load-practice-runs', 'legacy'),
    ).resolves.toEqual({
      songId: 'legacy',
      runs: [summary],
      fullRuns: [],
      archive: { schemaVersion: 1, days: {} },
    });
  });

  it('archives evicted web summaries while keeping recent summary and hit-record caps', async () => {
    const summaryAt = (index: number) => ({
      completedAt: `202${index % 2}-01-${String((index % 27) + 1).padStart(
        2,
        '0',
      )}T12:00:00.000Z`,
      totalHits: index + 1,
      totalMisses: 1,
      totalWrong: 0,
      overallAccuracy: (index + 1) / (index + 2),
      laneAccuracy: [
        {
          element: 'snare',
          hits: index + 1,
          misses: 1,
          accuracy: (index + 1) / (index + 2),
        },
      ],
      laneBias: [{ element: 'snare', meanMs: -4, sampleCount: index + 1 }],
      timingBias: {
        meanMs: -4,
        medianMs: -3,
        spreadMs: 2,
        earlyCount: index + 1,
        lateCount: 0,
        onTimeCount: 0,
        sampleCount: index + 1,
      },
      wrongHitCounts: [],
    });
    let latest:
      | {
          runs: unknown[];
          fullRuns: unknown[];
          archive: {
            days: Record<string, { runCount: number; totalHits: number }>;
          };
        }
      | undefined;

    for (let index = 0; index <= 50; index += 1) {
      latest = await replyWithArgs<typeof latest>(
        'save-practice-run',
        'save-practice-run',
        {
          songId: 'song-archive',
          summary: summaryAt(index),
          records: [
            {
              tick: index,
              timeSeconds: index / 100,
              deltaMs: -4,
              element: 'snare',
              verdict: 'hit',
            },
          ],
        },
      );
    }

    expect(latest?.runs).toHaveLength(50);
    expect(latest?.fullRuns).toHaveLength(30);
    expect(latest?.archive.days['2020-01-01']).toMatchObject({
      runCount: 1,
      totalHits: 1,
    });
    await expect(
      reply('load-all-practice-runs', 'load-all-practice-runs'),
    ).resolves.toMatchObject({
      archiveBySong: {
        'song-archive': {
          schemaVersion: 1,
          days: { '2020-01-01': { runCount: 1 } },
        },
      },
    });
  });

  it('reports a quota failure and leaves existing run history unchanged', async () => {
    const originalSetItem = Storage.prototype.setItem;

    localStorage.setItem(
      'drumroll.web.practice-runs',
      JSON.stringify({ existing: [{ completedAt: 'legacy' }] }),
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(
      this: Storage,
      key,
      value,
    ) {
      if (key === 'drumroll.web.practice-runs') {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      }

      return originalSetItem.call(this, key, value);
    });

    await expect(
      replyWithArgs('save-practice-run', 'save-practice-run', {
        songId: 'song-1',
        summary: {
          completedAt: '2026-08-08T14:00:00.000Z',
          totalHits: 0,
          totalMisses: 1,
          totalWrong: 0,
          overallAccuracy: 0,
          laneAccuracy: [],
          laneBias: [],
          timingBias: {
            meanMs: 0,
            medianMs: 0,
            spreadMs: 0,
            earlyCount: 0,
            lateCount: 0,
            onTimeCount: 0,
            sampleCount: 0,
          },
          wrongHitCounts: [],
        },
      }),
    ).resolves.toEqual({
      error: expect.stringContaining('Storage quota exceeded'),
    });

    expect(
      JSON.parse(localStorage.getItem('drumroll.web.practice-runs') ?? '{}'),
    ).toEqual({ existing: [{ completedAt: 'legacy' }] });
  });
});
