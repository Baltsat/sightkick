import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Harness } from '../support';

type ConsoleRecord = {
  level: string;
  route: string;
  text: string;
  at: number;
};

type Sample = {
  at: number;
  route: string;
  rendererHeapBytes: number;
  rendererTaskDuration: number;
  rendererNodes: number;
  mainWorkingSetKb: number;
  mainPrivateBytesKb: number;
  mainCpuPercent: number;
};

const SESSION_MS = Number(process.env.QA_E_SESSION_MS ?? 600_000);
const SAMPLE_MS = 30_000;
const OUT_DIR = path.join(process.cwd(), 'tmp', 'lanes');
const METRICS_PATH = path.join(OUT_DIR, 'QA-E-watchdog-metrics.json');

test.setTimeout(780_000);

// The ten-minute watchdog is a scheduled/deep check, not a per-push gate:
// it costs half an hour of CI in retries. Run it on macOS with QA_WATCHDOG=1.
test.skip(
  process.platform !== 'darwin' || process.env.QA_WATCHDOG !== '1',
  'watchdog runs on macOS with QA_WATCHDOG=1',
);

async function waitForRoute(page: Page, route: string): Promise<void> {
  const locators: Record<string, () => ReturnType<Page['getByTestId']>> = {
    home: () => page.getByTestId('home-cockpit'),
    songs: () => page.getByRole('heading', { name: 'Your drum library' }),
    journey: () => page.getByTestId('lessons-scroll-root'),
    insights: () => page.getByTestId('profile-view'),
    lesson: () => page.getByTestId('play-toggle'),
  };

  await expect(locators[route]()).toBeVisible({ timeout: 60_000 });
}

async function visit(page: Page, route: string): Promise<void> {
  const controls: Record<string, string> = {
    home: 'view-home',
    songs: 'view-songs',
    journey: 'view-lessons',
    insights: 'open-profile-button',
  };

  if (route === 'lesson') {
    await visit(page, 'journey');
    await expect(page.getByTestId('lessons-header-strip')).toBeVisible({
      timeout: 60_000,
    });
    await page
      .getByTestId('lesson-continue-card')
      .getByRole('button', { name: /^Start / })
      .click();
    await waitForRoute(page, 'lesson');

    return;
  }

  await page.getByTestId(controls[route]).click();
  await waitForRoute(page, route);
}

async function closeSettings(page: Page): Promise<void> {
  const point = await page.evaluate(() => ({
    x: window.innerWidth - 24,
    y: 80,
  }));

  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('rescan-folder')).not.toBeVisible({
    timeout: 5_000,
  });
}

async function churnSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-trigger').click();
  await expect(page.getByTestId('rescan-folder')).toBeVisible();
  await closeSettings(page);
  await page.getByTestId('settings-trigger').click();
  await expect(page.getByTestId('hover-preview-toggle')).toBeVisible();

  for (let index = 0; index < 4; index += 1) {
    await page.getByTestId('hover-preview-toggle').click();
  }

  await closeSettings(page);
}

async function teardownToHome(page: Page): Promise<void> {
  const back = page.getByTestId('back-button');

  if (await back.isVisible()) {
    await back.click({ force: true });
    await waitForRoute(page, 'songs');
  }

  await page.getByTestId('view-home').click();
  await waitForRoute(page, 'home');
}

async function sample(
  harness: Harness,
  page: Page,
  route: string,
  previousCpu: { at: number; cpu: number } | undefined,
): Promise<{ sample: Sample; cpu: { at: number; cpu: number } }> {
  const renderer = await page.context().newCDPSession(page);

  await renderer.send('Performance.enable');
  await renderer.send('HeapProfiler.collectGarbage');

  const [performance, dom, main] = await Promise.all([
    renderer.send('Performance.getMetrics'),
    renderer.send('Memory.getDOMCounters'),
    harness.app.evaluate(({ app }) => {
      const metric = app
        .getAppMetrics()
        .find((candidate) => candidate.type === 'Tab');

      return {
        metric,
        cpu: process.cpuUsage(),
      };
    }),
  ]);

  await renderer.detach();

  const metric = new Map(
    performance.metrics.map(({ name, value }) => [name, value]),
  );
  const cpu = main.cpu.user + main.cpu.system;
  const now = Date.now();
  const elapsedUs = previousCpu ? (now - previousCpu.at) * 1_000 : 0;
  const cpuPercent =
    previousCpu && elapsedUs > 0
      ? ((cpu - previousCpu.cpu) / elapsedUs) * 100
      : 0;

  return {
    sample: {
      at: now,
      route,
      rendererHeapBytes: metric.get('JSHeapUsedSize') ?? 0,
      rendererTaskDuration: metric.get('TaskDuration') ?? 0,
      rendererNodes: dom.nodes,
      mainWorkingSetKb: main.metric?.memory?.workingSetSize ?? 0,
      mainPrivateBytesKb: main.metric?.memory?.privateBytes ?? 0,
      mainCpuPercent: cpuPercent,
    },
    cpu: { at: now, cpu },
  };
}

async function importAndCompleteRun(page: Page): Promise<void> {
  await visit(page, 'songs');
  await page.getByTestId('song-search').fill('Natural Villain Mokita');
  await page.getByTestId('song-search-result-abcdefghijk').click();
  await expect(page.getByTestId('play-toggle')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('play-toggle')).not.toHaveClass(
    /ant-btn-loading/,
    { timeout: 30_000 },
  );
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('score-modal')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByTestId('score-next').first().click();
  await waitForRoute(page, 'songs');
}

test('ten-minute route watchdog stays quiet across reconnect and teardown', async () => {
  let harness: Harness | undefined;
  const consoleRecords: ConsoleRecord[] = [];
  const samples: Sample[] = [];
  let route = 'boot';

  try {
    harness = await launchApp({
      seedLibrary: true,
      ytDlpFixturePath: path.join(
        __dirname,
        '..',
        'fixtures',
        'fake-yt-dlp.sh',
      ),
      env: {
        SIGHTKICK_TRANSCRIBER_PATH: path.join(
          __dirname,
          '..',
          'fixtures',
          'fake-transcriber.sh',
        ),
        SIGHTKICK_DISABLE_YOUTUBE_METADATA: '1',
        SK_FFMPEG: path.join(
          __dirname,
          '..',
          'fixtures',
          'fake-transcriber.sh',
        ),
      },
    });

    const page = await harness.app.firstWindow();

    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleRecords.push({
          level: message.type(),
          route,
          text: message.text(),
          at: Date.now(),
        });
      }
    });
    page.on('pageerror', (error) => {
      consoleRecords.push({
        level: 'pageerror',
        route,
        text: error.message,
        at: Date.now(),
      });
    });

    await page.addInitScript(() => {
      const timers = {
        intervals: new Map<string, number>(),
        timeouts: new Map<string, number>(),
      };
      const audioContext = AudioContext.prototype;
      const createGain = audioContext.createGain;
      const setInterval = window.setInterval.bind(window);
      const clearInterval = window.clearInterval.bind(window);
      const setTimeout = window.setTimeout.bind(window);
      const clearTimeout = window.clearTimeout.bind(window);

      Object.assign(window, { __qa_e_timers: timers });
      Object.assign(window, { __qa_e_closed_audio_stacks: [] as string[] });
      audioContext.createGain = function (...args) {
        if (this.state === 'closed') {
          window.__qa_e_closed_audio_stacks.push(
            new Error().stack ?? 'missing stack',
          );
        }

        return createGain.apply(this, args);
      };
      window.setInterval = ((handler, timeout, ...args) => {
        const id = setInterval(handler, timeout, ...args);

        timers.intervals.set(String(id), Number(timeout) || 0);

        return id;
      }) as typeof window.setInterval;
      window.clearInterval = ((id) => {
        timers.intervals.delete(String(id));
        clearInterval(id);
      }) as typeof window.clearInterval;
      window.setTimeout = ((handler, timeout, ...args) => {
        const id = setTimeout(() => {
          timers.timeouts.delete(String(id));

          if (typeof handler === 'function') {
            handler(...args);
          }
        }, timeout);

        timers.timeouts.set(String(id), Number(timeout) || 0);

        return id;
      }) as typeof window.setTimeout;
      window.clearTimeout = ((id) => {
        timers.timeouts.delete(String(id));
        clearTimeout(id);
      }) as typeof window.clearTimeout;
      window.addEventListener('unhandledrejection', (event) => {
        const records =
          (
            window as typeof window & {
              __qa_e_unhandled?: string[];
            }
          ).__qa_e_unhandled ?? [];

        records.push(String(event.reason));
        Object.assign(window, { __qa_e_unhandled: records });
      });
    });

    await page.reload();
    route = 'home';
    await waitForRoute(page, route);
    await page.evaluate(() => {
      localStorage.setItem(
        'settings.handsFreeControlsEnabled',
        JSON.stringify(false),
      );
    });

    await harness.app.evaluate(({ ipcMain }) => {
      const state = {
        counts: {} as Record<string, number>,
        originalEmit: ipcMain.emit.bind(ipcMain),
      };

      Object.assign(globalThis, { __qa_e_ipc: state });
      ipcMain.emit = ((channel: string, ...args: unknown[]) => {
        if (typeof channel === 'string' && !channel.startsWith('newListener')) {
          state.counts[channel] = (state.counts[channel] ?? 0) + 1;
        }

        return state.originalEmit(channel, ...args);
      }) as typeof ipcMain.emit;
    });

    const startedAt = Date.now();
    let nextSampleAt = startedAt;
    let previousCpu: { at: number; cpu: number } | undefined;

    route = 'full-run';
    await importAndCompleteRun(page);

    const actions = ['songs', 'journey', 'lesson', 'insights', 'home'];
    let actionIndex = 0;

    while (Date.now() - startedAt < SESSION_MS) {
      const target = actions[actionIndex % actions.length];

      actionIndex += 1;

      try {
        route = target;
        await visit(page, target);

        if (target === 'songs') {
          await churnSettings(page);
          await page.getByTestId('song-search').fill('Master');
          await page.getByTestId('song-search').fill('');
        }

        if (target === 'insights') {
          await page.getByRole('tab', { name: 'Last 30 days' }).click();
          await page.getByRole('tab', { name: 'Today' }).click();
        }

        if (target === 'lesson') {
          await page.getByTestId('back-button').click({ force: true });
          await waitForRoute(page, 'journey');
          await visit(page, 'songs');
        }

        if (target === 'home' && actionIndex === actions.length) {
          await page.evaluate(() => {
            localStorage.setItem(
              'settings.selectedDevice',
              JSON.stringify({
                id: 'midi:qa-absent-dtx',
                name: 'QA absent DTX',
                sourceId: 'midi',
                port: 999,
              }),
            );
          });
          await page.reload();
          route = 'home-reconnect';
          await waitForRoute(page, 'home');
          await page.getByTestId('settings-trigger').click();
          await expect(page.getByTestId('setup-input')).toBeVisible();
          await page.getByTestId('setup-input').click();
          await expect(
            page.getByText('Keep your MIDI device connected'),
          ).toBeVisible({
            timeout: 30_000,
          });
          await page.reload();
          route = 'home';
          await waitForRoute(page, route);
        }
      } catch (error) {
        consoleRecords.push({
          level: 'driver',
          route,
          text: error instanceof Error ? error.message : String(error),
          at: Date.now(),
        });
      }

      if (Date.now() >= nextSampleAt) {
        const observation = await sample(harness, page, route, previousCpu);

        samples.push(observation.sample);
        previousCpu = observation.cpu;
        nextSampleAt += SAMPLE_MS;
      }

      await page.waitForTimeout(20_000);
    }

    route = 'teardown';

    try {
      await teardownToHome(page);
    } catch (error) {
      consoleRecords.push({
        level: 'driver',
        route,
        text: error instanceof Error ? error.message : String(error),
        at: Date.now(),
      });
    }

    await page.waitForTimeout(2_000);

    const [ipc, timers, unhandled, closedAudioStacks] = await Promise.all([
      harness.app.evaluate(() => {
        const state = globalThis.__qa_e_ipc as
          | { counts: Record<string, number> }
          | undefined;

        return state?.counts ?? {};
      }),
      page.evaluate(() => {
        const state = (
          window as typeof window & {
            __qa_e_timers?: {
              intervals: Map<string, number>;
              timeouts: Map<string, number>;
            };
          }
        ).__qa_e_timers;

        return {
          intervals: state ? [...state.intervals.values()] : [],
          timeouts: state ? [...state.timeouts.values()] : [],
        };
      }),
      page.evaluate(
        () =>
          (window as typeof window & { __qa_e_unhandled?: string[] })
            .__qa_e_unhandled ?? [],
      ),
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __qa_e_closed_audio_stacks?: string[];
            }
          ).__qa_e_closed_audio_stacks ?? [],
      ),
    ]);
    const durationSeconds = (Date.now() - startedAt) / 1_000;
    const rates = Object.fromEntries(
      Object.entries(ipc).map(([channel, count]) => [
        channel,
        { count, perSecond: count / durationSeconds },
      ]),
    );
    const result = {
      startedAt,
      durationSeconds,
      samples,
      consoleRecords,
      unhandled,
      closedAudioStacks,
      ipc: rates,
      timers,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(METRICS_PATH, JSON.stringify(result, null, 2));

    expect(
      consoleRecords.filter((record) => record.level !== 'warning'),
    ).toEqual([]);
    expect(
      consoleRecords.filter((record) => /context is closed/.test(record.text)),
    ).toEqual([]);
    expect(unhandled).toEqual([]);
    expect(Object.values(rates).every(({ perSecond }) => perSecond < 5)).toBe(
      true,
    );
  } finally {
    await harness?.app.close();
  }
});
