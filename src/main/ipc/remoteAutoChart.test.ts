import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureRemoteAutoChartStore,
  createRemoteAutoChartRunner,
  extractRemoteAutoChartResult,
  getRemoteAutoChartRuntime,
  getRemoteAutoChartSettings,
  isRemoteAutoChartAvailable,
  saveAndTestRemoteAutoChart,
} from './remoteAutoChart';
import { lastReply, makeEvent } from './test-support';

const runtime = {
  endpoint: 'http://localhost:18010',
  token: 'test-token',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('remote auto-chart runner', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();

    for (const root of cleanup.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('maps a remote status sequence to progress and a contained result', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-chart-'));
    const songDir = path.join(tempDir, 'Artist - Song');
    const events: unknown[] = [];
    const responses = [
      jsonResponse({ jobId: 'job-1' }),
      jsonResponse({
        status: 'running',
        stage: 'separate',
        percent: 37,
        message: 'Separating stems',
      }),
      jsonResponse({ status: 'done' }),
      new Response(new Uint8Array([31, 139]), { status: 200 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const saveResult = vi.fn(
      async (_response: Response, archivePath: string) => {
        fs.writeFileSync(archivePath, 'archive');
      },
    );
    const extractResult = vi.fn(async () => {
      fs.mkdirSync(songDir);

      return songDir;
    });
    const runner = createRemoteAutoChartRunner({
      fetch: fetchImpl,
      wait: async () => {},
      openFile: vi.fn(),
      saveResult,
      extractResult,
    } as never).run(
      {
        tempDir,
        youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        runtime,
      },
      (event) => events.push(event),
    );

    cleanup.push(tempDir);
    await runner.done;

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://localhost:18010/jobs',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      'http://localhost:18010/jobs/job-1/result',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
    expect(saveResult).toHaveBeenCalledOnce();
    expect(extractResult).toHaveBeenCalledOnce();
    expect(events).toEqual([
      {
        kind: 'progress',
        stage: 'separate',
        percent: 37,
        message: 'Separating stems',
      },
      { kind: 'complete', success: true, songDir },
    ]);
  });

  it('surfaces an authentication failure without exposing the token', async () => {
    const events: { kind: string; message?: string }[] = [];
    const runner = createRemoteAutoChartRunner({
      fetch: vi.fn(async () => jsonResponse({}, 401)),
      wait: async () => {},
      openFile: vi.fn(),
      saveResult: vi.fn(),
      extractResult: vi.fn(),
    } as never).run(
      {
        tempDir: '/tmp/unused',
        youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        runtime,
      },
      (event) => events.push(event),
    );

    await runner.done;

    expect(events).toEqual([
      {
        kind: 'error',
        message: 'Remote transcriber rejected its credentials (401)',
      },
    ]);
    expect(events[0].message).not.toContain(runtime.token);
  });

  it('cancels the created remote job with DELETE', async () => {
    let releaseWait = () => {};
    const wait = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseWait = resolve;
        }),
    );
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return jsonResponse({ jobId: 'job-cancel' });
        }

        if (init?.method === 'DELETE') {
          return jsonResponse({ status: 'canceled' });
        }

        return jsonResponse({
          status: 'running',
          stage: 'transcribe',
          percent: 60,
        });
      },
    );
    const events: unknown[] = [];
    const runner = createRemoteAutoChartRunner({
      fetch: fetchImpl,
      wait,
      openFile: vi.fn(),
      saveResult: vi.fn(),
      extractResult: vi.fn(),
    } as never).run(
      {
        tempDir: '/tmp/unused',
        youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        runtime,
      },
      (event) => events.push(event),
    );

    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    runner.kill();
    releaseWait();
    await runner.done;
    await vi.waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        'http://localhost:18010/jobs/job-cancel',
        {
          method: 'DELETE',
          headers: { Authorization: 'Bearer test-token' },
        },
      ),
    );
    expect(events).toEqual([
      {
        kind: 'progress',
        stage: 'transcribe',
        percent: 60,
        message: undefined,
      },
    ]);
  });
});

describe('remote auto-chart settings', () => {
  it('uses deployment credentials before stale manual settings', () => {
    const values = new Map<string, unknown>([
      ['autoChart.remote.endpoint', 'https://stale.example.com'],
      ['autoChart.remote.token', 'stale-token'],
    ]);
    const previousEndpoint = process.env.TRANSCRIBER_URL;
    const previousToken = process.env.TRANSCRIBER_TOKEN;

    configureRemoteAutoChartStore({
      get: (key) => values.get(key),
      set: (key, value) => values.set(key, value),
    });
    process.env.TRANSCRIBER_URL = 'http://localhost:18010/';
    process.env.TRANSCRIBER_TOKEN = 'deployment-token';

    try {
      expect(getRemoteAutoChartRuntime()).toEqual({
        endpoint: 'http://localhost:18010',
        token: 'deployment-token',
      });

      const event = makeEvent();

      getRemoteAutoChartSettings(event as never);

      expect(lastReply(event, 'auto-chart-remote-settings')?.args[0]).toEqual({
        endpoint: 'http://localhost:18010',
        tokenConfigured: true,
      });
    } finally {
      if (previousEndpoint === undefined) {
        delete process.env.TRANSCRIBER_URL;
      } else {
        process.env.TRANSCRIBER_URL = previousEndpoint;
      }

      if (previousToken === undefined) {
        delete process.env.TRANSCRIBER_TOKEN;
      } else {
        process.env.TRANSCRIBER_TOKEN = previousToken;
      }
    }
  });

  it('stores a secret without returning it and requires a healthy endpoint', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn((key: string) => values.get(key)),
      set: vi.fn((key: string, value: unknown) => values.set(key, value)),
      delete: vi.fn((key: string) => values.delete(key)),
    };
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));

    configureRemoteAutoChartStore(store);
    vi.stubGlobal('fetch', fetchImpl);

    const event = makeEvent();

    await saveAndTestRemoteAutoChart(event as never, {
      endpoint: 'http://localhost:18010/',
      token: 'top-secret',
    });

    expect(lastReply(event, 'auto-chart-remote-test')?.args[0]).toEqual({
      ok: true,
      message: 'Remote transcriber is reachable',
    });
    expect(
      lastReply(event, 'auto-chart-remote-test')?.args[0],
    ).not.toHaveProperty('token');
    expect(values.get('autoChart.remote.endpoint')).toBe(
      'http://localhost:18010',
    );
    expect(values.get('autoChart.remote.token')).toBe('top-secret');
    await expect(isRemoteAutoChartAvailable()).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:18010/healthz', {
      signal: expect.any(AbortSignal),
    });

    vi.unstubAllGlobals();
  });
});

describe('remote result extraction', () => {
  it('lists and validates the tarball before extracting its song folder', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-tar-'));
    const archivePath = path.join(tempDir, 'result.tar.gz');
    const commands: string[][] = [];
    const run = vi.fn(async (_command: string, args: string[]) => {
      commands.push(args);

      if (args[0] === '-tzf') {
        return 'Artist - 曲/song.ini\nArtist - 曲/notes.mid\n';
      }

      if (args[0] === '-tvzf') {
        return '-rw-r--r--  0 user group 10 Jan 1 00:00 Artist - 曲/song.ini\n';
      }

      fs.mkdirSync(path.join(tempDir, 'Artist - 曲'));

      return '';
    });
    const songDir = await extractRemoteAutoChartResult(
      archivePath,
      tempDir,
      run,
    );

    expect(songDir).toBe(path.join(tempDir, 'Artist - 曲'));
    expect(commands).toEqual([
      ['-tzf', archivePath],
      ['-tvzf', archivePath],
      ['-xzf', archivePath, '-C', tempDir],
    ]);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects traversal before extraction', async () => {
    const run = vi.fn(async () => '../escape/song.ini\n');

    await expect(
      extractRemoteAutoChartResult('/tmp/result.tar.gz', '/tmp/job', run),
    ).rejects.toThrow('unsafe archive path');
    expect(run).toHaveBeenCalledOnce();
  });
});
