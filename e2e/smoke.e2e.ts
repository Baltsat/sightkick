import path from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { test, expect, Page } from '@playwright/test';
import { launchApp, Harness } from './support';
import { toAssetUrl } from '../src/main/util';

let harness: Harness;
let page: Page;

test.setTimeout(180_000);

async function waitForAppReady(currentPage: Page) {
  const libraryHeading = currentPage.getByRole('heading', {
    name: 'Your drum library',
  });

  if (!(await libraryHeading.isVisible())) {
    await expect(
      currentPage.getByRole('main', { name: 'Home content' }),
    ).toBeVisible({ timeout: 60_000 });
    await currentPage.getByTestId('view-songs').click();
  }

  await expect(libraryHeading).toBeVisible({ timeout: 60_000 });
}

function autoImportFixturePaths() {
  return {
    transcriberPath: path.join(__dirname, 'fixtures', 'fake-transcriber.sh'),
    ytDlpPath: path.join(__dirname, 'fixtures', 'fake-yt-dlp.sh'),
  };
}

async function rejectFileDialogs(currentHarness: Harness) {
  await currentHarness.app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => {
      throw new Error('automatic YouTube import opened a file dialog');
    };
  });
}

async function searchAndChooseRecording(currentPage: Page) {
  await currentPage.getByTestId('song-search').fill('Natural Villain Mokita');

  const exactRecording = currentPage.getByTestId(
    'song-search-result-abcdefghijk',
  );

  await expect(exactRecording).toBeVisible({ timeout: 30_000 });
  await expect(
    currentPage.getByTestId('song-search-result-live0000001'),
  ).toHaveCount(0);
  await exactRecording.click();
}

async function expectSongOpenWithNotation(currentPage: Page) {
  // A finished import navigates to the song and opens its notation screen.
  await expect(currentPage.getByTestId('play-toggle')).toBeVisible({
    timeout: 60_000,
  });

  // Scoped to the notation itself, whichever layout the run opened in. The
  // page's first `svg` is not the score — it is whatever icon happens to be
  // in the DOM first, so this used to pass by accident on a rail icon and
  // then fail the moment the run stopped rendering that rail at all.
  const notation = currentPage
    .locator('[data-testid="flow-notation"], [data-testid="classic-notation"]')
    .first();

  await expect(notation).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => notation.locator('svg path').count(), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
}

// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  if (page && testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('screenshot', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  }

  await harness?.app.close();
});

test.describe('first run', () => {
  test('boots a clean profile into the bundled library with no folder prompt', async () => {
    harness = await launchApp({ seedLibrary: false });
    page = await harness.app.firstWindow();
    await waitForAppReady(page);

    // The bundled 170-lesson library bootstraps on a clean profile; the old
    // choose-a-folder gate must never appear, and the actionable shelves are
    // the first Songs surface.
    await expect(page.getByTestId('actionable-song-shelves')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Choose your library folder')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add music' })).toHaveCount(
      0,
    );
  });
});

test.describe('one search field', () => {
  test('imports a selected YouTube recording from search and opens it without a file dialog', async () => {
    test.skip(process.platform === 'win32', 'POSIX sidecar fixture');

    const { transcriberPath, ytDlpPath } = autoImportFixturePaths();

    harness = await launchApp({
      seedLibrary: true,
      ytDlpFixturePath: ytDlpPath,
      env: {
        SIGHTKICK_TRANSCRIBER_PATH: transcriberPath,
        SIGHTKICK_DISABLE_YOUTUBE_METADATA: '1',
        SK_FFMPEG: transcriberPath,
      },
    });
    page = await harness.app.firstWindow();
    await waitForAppReady(page);
    await rejectFileDialogs(harness);

    await searchAndChooseRecording(page);
    // The inline import row narrates the stage; the progress element carries
    // the percentage.
    await expect(page.getByTestId('song-search-import-row')).toContainText(
      /Verifying selected YouTube recording|Downloading fake audio|Preparing/,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('song-search-import-progress')).toContainText(
      /%/,
      { timeout: 30_000 },
    );

    if (process.env.SIGHTKICK_AUTO_IMPORT_SEARCH_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_AUTO_IMPORT_SEARCH_PROOF,
      });
    }

    await expectSongOpenWithNotation(page);

    const playToggle = page.getByTestId('play-toggle');

    await expect(playToggle).not.toHaveClass(/ant-btn-loading/, {
      timeout: 30_000,
    });
    await playToggle.click();
    await expect(playToggle).toHaveAttribute(
      'aria-label',
      /Cancel count-in|Pause/,
    );

    if (process.env.SIGHTKICK_AUTO_IMPORT_PLAYABLE_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_AUTO_IMPORT_PLAYABLE_PROOF,
      });
    }
  });

  test('shows a forced automatic-import failure and retries with a fresh attempt', async () => {
    test.skip(process.platform === 'win32', 'POSIX sidecar fixture');

    const { transcriberPath, ytDlpPath } = autoImportFixturePaths();
    const failureRoot = mkdtempSync(
      path.join(tmpdir(), 'sightkick-auto-import-'),
    );
    const failOnceFile = path.join(failureRoot, 'failed-once');

    harness = await launchApp({
      seedLibrary: true,
      ytDlpFixturePath: ytDlpPath,
      env: {
        SIGHTKICK_TRANSCRIBER_PATH: transcriberPath,
        SIGHTKICK_DISABLE_YOUTUBE_METADATA: '1',
        SIGHTKICK_FAKE_TRANSCRIBER_FAIL_ONCE_FILE: failOnceFile,
        SK_FFMPEG: transcriberPath,
      },
    });
    page = await harness.app.firstWindow();
    await waitForAppReady(page);
    await rejectFileDialogs(harness);

    await searchAndChooseRecording(page);

    // The failure message renders inside the import row, beside the retry
    // action; the progress element only ever carries a percentage.
    await expect(page.getByTestId('song-search-import-row')).toContainText(
      'Forced sidecar failure for retry proof',
      {
        timeout: 60_000,
      },
    );
    await expect(page.getByTestId('song-search-import-retry')).toBeVisible();

    if (process.env.SIGHTKICK_AUTO_IMPORT_RETRY_FAILURE_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_AUTO_IMPORT_RETRY_FAILURE_PROOF,
      });
    }

    await page.getByTestId('song-search-import-retry').click();
    await expectSongOpenWithNotation(page);

    if (process.env.SIGHTKICK_AUTO_IMPORT_RETRY_PLAYABLE_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_AUTO_IMPORT_RETRY_PLAYABLE_PROOF,
      });
    }
  });
});

test.describe('seeded library', () => {
  test('scans the folder, lists the song, and renders real sheet music', async () => {
    harness = await launchApp({ seedLibrary: true });
    page = await harness.app.firstWindow();
    await waitForAppReady(page);

    await expect(page.getByTestId('actionable-song-shelves')).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('rescan-folder').click();

    // The full library list is virtualized; the one search field is the
    // product's way to reach a scanned song directly.
    await page.getByTestId('song-search').fill('Master of Puppets');

    const song = page.getByText('Master of Puppets').first();

    await expect(song).toBeVisible({ timeout: 30_000 });

    const albumUrl = toAssetUrl(
      path.join(harness.libraryDir, 'test-song', 'album.png'),
    );
    const fetched = await page.evaluate(async (url) => {
      const response = await fetch(url);

      return { ok: response.ok, size: (await response.blob()).size };
    }, albumUrl);

    expect(fetched.ok).toBe(true);
    expect(fetched.size).toBeGreaterThan(0);

    const cover = page.locator('img[src^="sightkick://"]').first();

    await expect(cover).toBeVisible();
    await expect
      .poll(
        async () => cover.evaluate((el: HTMLImageElement) => el.naturalWidth),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);

    // The playable contract is honest: a bare scanned folder gets no invented
    // rating and no false Play action. Opening and playing real notation is
    // proven by the one-search import spec above.
    await expect(
      page.getByText('Needs a playable drum chart').first(),
    ).toBeVisible();
  });
});
