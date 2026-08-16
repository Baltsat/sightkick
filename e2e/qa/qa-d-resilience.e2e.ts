import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { launchApp, type Harness } from '../support';

test.setTimeout(180_000);

const MAIN_ENTRY = path.join(__dirname, '..', '..', 'out', 'main', 'index.js');
const CHART = [
  '[Song]',
  '{',
  '  Resolution = 480',
  '}',
  '[SyncTrack]',
  '{',
  '  0 = TS 4',
  '  0 = B 120000',
  '}',
  '[ExpertDrums]',
  '{',
  '  0 = N 0 0',
  '  480 = N 1 0',
  '}',
  '',
].join('\n');

async function waitForLibrary(page: Page) {
  const heading = page.getByRole('heading', { name: 'Your drum library' });

  if (!(await heading.isVisible())) {
    await expect(page.getByRole('main', { name: 'Home content' })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId('view-songs').click();
  }

  await expect(heading).toBeVisible({ timeout: 60_000 });
}

async function setContentSize(
  app: ElectronApplication,
  width: number,
  height: number,
) {
  await app.evaluate(
    ({ BrowserWindow }, bounds) => {
      BrowserWindow.getAllWindows()[0].setContentSize(
        bounds.width,
        bounds.height,
      );
    },
    { width, height },
  );
}

async function closeSettings(page: Page) {
  await page.mouse.click(
    (await page.evaluate(() => window.innerWidth)) - 24,
    80,
  );
  await expect(page.getByTestId('rescan-folder')).not.toBeVisible({
    timeout: 5_000,
  });
}

function makeEmptyLibraryUserData() {
  const userDataDir = mkdtempSync(
    path.join(tmpdir(), 'drumroll-qa-d-userdata-'),
  );
  const libraryDir = mkdtempSync(path.join(tmpdir(), 'drumroll-qa-d-empty-'));

  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ lastOpenedPath: libraryDir }, undefined, 2),
  );

  return { libraryDir, userDataDir };
}

async function launchWithUserData(userDataDir: string) {
  return electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, '--mute-audio'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      START_MINIMIZED: '1',
    },
  });
}

async function sendIpc<T>(
  page: Page,
  channel: 'save-practice-run' | 'load-all-practice-runs',
  ...args: unknown[]
) {
  return page.evaluate(
    ({ channel: messageChannel, args: messageArgs }) =>
      new Promise<T>((resolve) => {
        const unsubscribe = window.electron.ipcRenderer.once<T>(
          messageChannel,
          (reply) => {
            unsubscribe();
            resolve(reply);
          },
        );

        window.electron.ipcRenderer.sendMessage(messageChannel, ...messageArgs);
      }),
    { channel, args },
  );
}

function addLargeLibrary(libraryDir: string) {
  for (let index = 1; index < 300; index += 1) {
    const songDir = path.join(libraryDir, `qa-d-${index}`);

    mkdirSync(songDir);
    writeFileSync(path.join(songDir, 'song.mp3'), 'test audio');
    writeFileSync(path.join(songDir, 'notes.chart'), CHART);
    writeFileSync(
      path.join(songDir, 'song.ini'),
      [
        '[song]',
        `name = QA D Load Song ${index}`,
        'artist = Drumroll QA',
        'pro_drums = True',
        'diff_drums = 4',
        '',
      ].join('\n'),
    );
  }
}

async function makeSeedSongPlayable(
  page: Page,
  harness: Pick<Harness, 'libraryDir'>,
) {
  writeFileSync(
    path.join(harness.libraryDir, 'test-song', 'song.mp3'),
    Buffer.from(
      readFileSync(
        path.join(__dirname, '..', 'fixtures', 'fake-song.mp3.base64'),
        'utf8',
      ).trim(),
      'base64',
    ),
  );
  await page.getByTestId('settings-trigger').click();
  await page.getByTestId('rescan-folder').click();

  const playSong = page.getByRole('button', { name: 'Play Master of Puppets' });

  await expect(playSong).toBeVisible({ timeout: 5_000 });

  return playSong;
}

async function openPlayableSeedSong(
  page: Page,
  harness: Pick<Harness, 'libraryDir'>,
) {
  const playSong = await makeSeedSongPlayable(page, harness);

  await playSong.click();
  await expect(page.getByTestId('game-mode-practice')).toBeVisible();
  await page.getByTestId('game-mode-perform').click();

  const inspector = page.getByRole('button', { name: 'Open inspector' });

  await expect(inspector).toBeVisible({ timeout: 5_000 });
  await inspector.click();
  await expect(page.getByTestId('notation-classic-toggle')).toBeVisible({
    timeout: 5_000,
  });
}

test('settings stays reachable and closable at the supported window bounds', async () => {
  const harness = await launchApp({ seedLibrary: true });

  try {
    const page = await harness.app.firstWindow();

    await waitForLibrary(page);

    for (const size of [
      { width: 1024, height: 700 },
      { width: 1920, height: 1200 },
    ]) {
      await setContentSize(harness.app, size.width, size.height);
      await expect
        .poll(() => page.evaluate(() => window.innerWidth))
        .toBe(size.width);

      await page.getByTestId('settings-trigger').click();

      const rescan = page.getByTestId('rescan-folder');

      await expect(rescan).toBeVisible();

      const box = await rescan.boundingBox();

      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
      await closeSettings(page);
    }
  } finally {
    await harness.app.close();
  }
});

test('rapid primary navigation and input spam leave the library responsive', async () => {
  const harness = await launchApp({ seedLibrary: true });

  try {
    const page = await harness.app.firstWindow();
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    await waitForLibrary(page);

    for (let pass = 0; pass < 4; pass += 1) {
      await page.getByTestId('view-home').dblclick();
      await expect(
        page.getByRole('main', { name: 'Home content' }),
      ).toBeVisible();
      await page.getByTestId('view-lessons').dblclick();
      await expect(
        page.getByRole('main', { name: 'Journey content' }),
      ).toBeVisible();
      await page.getByTestId('view-songs').dblclick();
      await waitForLibrary(page);
    }

    const search = page.getByTestId('song-search');

    for (const value of [
      'm',
      'ma',
      'mas',
      'master',
      '',
      'puppets',
      '',
      'master',
    ]) {
      await search.fill(value);
    }

    await page.waitForTimeout(10_000);
    await search.fill('Master of Puppets');
    await expect(page.getByText('Master of Puppets').first()).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await harness.app.close();
  }
});

test('an empty on-disk library starts and remains navigable', async () => {
  const { userDataDir } = makeEmptyLibraryUserData();
  const app = await launchWithUserData(userDataDir);

  try {
    const page = await app.firstWindow();

    await waitForLibrary(page);
    await page.getByTestId('view-home').click();
    await expect(
      page.getByRole('main', { name: 'Home content' }),
    ).toBeVisible();
    await page.getByTestId('view-songs').click();
    await expect(
      page.getByRole('heading', { name: 'Your drum library' }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('a 300-song library remains searchable after a rescan', async () => {
  const harness = await launchApp({ seedLibrary: true });

  try {
    const page = await harness.app.firstWindow();

    await waitForLibrary(page);
    addLargeLibrary(harness.libraryDir);
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('rescan-folder').click();

    const search = page.getByTestId('song-search');

    await search.fill('QA D Load Song 299');
    await expect(page.getByText('QA D Load Song 299').first()).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await harness.app.close();
  }
});

test('favourites, settings, notation choice, and a saved run survive relaunch', async () => {
  const harness = await launchApp({ seedLibrary: true });
  let appOpen = true;

  try {
    const page = await harness.app.firstWindow();

    await waitForLibrary(page);
    await makeSeedSongPlayable(page, harness);

    const favourite = page.getByTestId('like-toggle').first();

    await favourite.click();
    await expect(favourite).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('settings-trigger').click();

    const hoverPreview = page.getByTestId('hover-preview-toggle');

    await expect(hoverPreview).toHaveAttribute('aria-checked', 'true');
    await hoverPreview.click();
    await expect(hoverPreview).toHaveAttribute('aria-checked', 'false');
    await closeSettings(page);

    const savedRun = await sendIpc<{
      songId: string;
      runs: Array<{ completedAt: string }>;
    }>(page, 'save-practice-run', {
      songId: 'qa-d-run',
      summary: {
        completedAt: '2026-08-16T00:00:00.000Z',
        totalHits: 1,
        totalMisses: 0,
        totalWrong: 0,
        overallAccuracy: 1,
        laneAccuracy: [],
        laneBias: [],
        wrongHitCounts: [],
        timingBias: {
          meanMs: 0,
          medianMs: 0,
          spreadMs: 0,
          earlyCount: 0,
          lateCount: 0,
          onTimeCount: 0,
          sampleCount: 0,
        },
      },
    });

    expect(savedRun.songId).toBe('qa-d-run');

    await openPlayableSeedSong(page, harness);
    await page.getByTestId('notation-classic-toggle').click();
    await expect(page.getByTestId('notation-classic-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await harness.app.close();
    appOpen = false;

    const userDataDir = mkdtempSync(
      path.join(tmpdir(), 'drumroll-qa-d-relaunch-'),
    );

    copyFileSync(
      path.join(harness.userDataDir, 'config.json'),
      path.join(userDataDir, 'config.json'),
    );

    const localStorage = path.join(harness.userDataDir, 'Local Storage');

    if (existsSync(localStorage)) {
      cpSync(localStorage, path.join(userDataDir, 'Local Storage'), {
        recursive: true,
      });
    }

    const relaunched = await launchWithUserData(userDataDir);

    try {
      const relaunchedPage = await relaunched.firstWindow();

      await waitForLibrary(relaunchedPage);
      await expect(
        relaunchedPage.getByTestId('like-toggle').first(),
      ).toHaveAttribute('aria-pressed', 'true');

      await relaunchedPage.getByTestId('settings-trigger').click();
      await expect(
        relaunchedPage.getByTestId('hover-preview-toggle'),
      ).toHaveAttribute('aria-checked', 'false');
      await closeSettings(relaunchedPage);

      const loadedRuns = await sendIpc<{
        runs: Array<{ completedAt: string }>;
        runsBySong: Record<string, Array<{ completedAt: string }>>;
      }>(relaunchedPage, 'load-all-practice-runs');

      expect(loadedRuns.runsBySong['qa-d-run']).toHaveLength(1);
      expect(loadedRuns.runsBySong['qa-d-run'][0].completedAt).toBe(
        '2026-08-16T00:00:00.000Z',
      );

      await openPlayableSeedSong(relaunchedPage, harness);
      await expect(
        relaunchedPage.getByTestId('notation-classic-toggle'),
      ).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await relaunched.close();
    }
  } finally {
    if (appOpen) {
      await harness.app.close();
    }
  }
});
