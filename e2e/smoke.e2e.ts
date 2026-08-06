import path from 'path';
import { existsSync } from 'fs';
import { test, expect, Page } from '@playwright/test';
import { launchApp, Harness } from './support';
import { toAssetUrl } from '../src/main/util';

let harness: Harness;
let page: Page;

test.setTimeout(180_000);

async function waitForAppReady(currentPage: Page) {
  await expect(
    currentPage.getByRole('heading', { name: 'Your drum library' }),
  ).toBeVisible({ timeout: 60_000 });
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
  test('guides the user to select a library folder', async () => {
    harness = await launchApp({ seedLibrary: false });
    page = await harness.app.firstWindow();
    await waitForAppReady(page);

    await expect(page.getByText('Choose your library folder')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open settings' }),
    ).toBeVisible();
  });
});

test.describe('seeded library', () => {
  test('previews and imports a prepared local auto-chart', async () => {
    harness = await launchApp({ seedLibrary: true });
    await harness.app.evaluate(({ dialog }, importDir) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [importDir],
      });
    }, harness.importDir);
    page = await harness.app.firstWindow();
    await waitForAppReady(page);

    await page.getByRole('button', { name: 'Import song' }).click();
    await expect(page.getByText('Review song import')).toBeVisible();
    await expect(page.getByText('Auto-charted with STRUM')).toBeVisible();
    await expect(
      page.getByText('Existing album artwork will be preserved.'),
    ).toBeVisible();

    if (process.env.SIGHTKICK_IMPORT_PREVIEW_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_IMPORT_PREVIEW_PROOF,
      });
    }

    await page.getByRole('button', { name: 'Add to library' }).click();

    const row = page.getByTestId(/song-item-/).filter({ hasText: 'Raging' });

    await expect(row).toBeVisible();
    await expect(row.getByText('Auto-charted with STRUM')).toBeVisible();
    await expect(row.getByText('play once to earn stars')).toBeVisible();
    await expect(page.getByText('Review song import')).toBeHidden({
      timeout: 60_000,
    });

    const importedDir = path.join(
      harness.libraryDir,
      'Kygo feat. Kodaline - Raging',
    );

    expect(existsSync(path.join(importedDir, 'album.png'))).toBe(true);
    expect(existsSync(path.join(importedDir, '.sightkick'))).toBe(true);

    if (process.env.SIGHTKICK_IMPORT_AFTER_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_IMPORT_AFTER_PROOF,
      });
    }
  });

  test('creates and reviews a real local OCTAVE chart when requested', async () => {
    test.skip(
      !process.env.SIGHTKICK_AUTO_CHART_AUDIO,
      'set SIGHTKICK_AUTO_CHART_AUDIO for the live OCTAVE proof',
    );
    test.setTimeout(180_000);

    harness = await launchApp({ seedLibrary: true });
    await harness.app.evaluate(({ dialog }, audioPath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [audioPath],
      });
    }, process.env.SIGHTKICK_AUTO_CHART_AUDIO!);
    page = await harness.app.firstWindow();
    await waitForAppReady(page);

    await page.getByRole('button', { name: 'Create chart' }).click();
    await expect(page.getByText('Create a drum chart')).toBeVisible();

    if (process.env.SIGHTKICK_AUTO_CHART_YOUTUBE_URL) {
      await page
        .getByTestId('auto-chart-youtube-url')
        .fill(process.env.SIGHTKICK_AUTO_CHART_YOUTUBE_URL);
    }

    if (process.env.SIGHTKICK_AUTO_CHART_START_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_AUTO_CHART_START_PROOF,
      });
    }

    // This proof is specifically for the local OCTAVE runtime; force it
    // when the bundled SightKick transcriber is also available and the
    // backend picker is showing.
    const octaveOption = page.getByRole('radio', { name: 'OCTAVE' });

    if (await octaveOption.isVisible()) {
      await octaveOption.click();
    }

    await page.getByTestId('auto-chart-local-file').click();
    await expect(page.getByTestId('auto-chart-progress')).toBeVisible();

    const review = page.getByText('Add this song to your library');
    const failed = page.getByText('failed', { exact: true });

    await expect(review.or(failed)).toBeVisible({ timeout: 150_000 });

    if (await failed.isVisible()) {
      throw new Error(
        await page.getByTestId('auto-chart-progress').innerText(),
      );
    }

    await expect(page.getByText('Auto-charted with STRUM')).toBeVisible();

    if (process.env.SIGHTKICK_AUTO_CHART_PREVIEW_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_AUTO_CHART_PREVIEW_PROOF,
      });
    }

    await page.getByRole('button', { name: 'Add to library' }).click();

    const generated = page.getByTestId(/song-item-/).filter({
      hasText:
        process.env.SIGHTKICK_AUTO_CHART_EXPECTED_NAME ?? 'raging-drop-25s',
    });

    await expect(generated).toBeVisible({ timeout: 30_000 });
    await expect(generated.getByText('Auto-charted with STRUM')).toBeVisible();
    await expect(review).toBeHidden();

    if (process.env.SIGHTKICK_AUTO_CHART_AFTER_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_AUTO_CHART_AFTER_PROOF,
      });
    }

    await generated.click();
    await page.getByRole('button', { name: 'perform' }).click();

    const generatedSheet = page.locator('svg').first();

    await expect(generatedSheet).toBeVisible();
    await expect
      .poll(async () => page.locator('svg path').count(), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await expect(page.getByTestId('play-toggle')).not.toHaveClass(
      /ant-btn-loading/,
      { timeout: 30_000 },
    );

    if (process.env.SIGHTKICK_AUTO_CHART_SHEET_PROOF) {
      await page.screenshot({
        path: process.env.SIGHTKICK_AUTO_CHART_SHEET_PROOF,
      });
    }
  });

  test('creates a URL-only chart through the SightKick sidecar protocol', async () => {
    test.setTimeout(180_000);

    const transcriberPath = path.join(
      __dirname,
      'fixtures',
      'fake-transcriber.sh',
    );

    harness = await launchApp({
      seedLibrary: true,
      env: {
        SIGHTKICK_TRANSCRIBER_PATH: transcriberPath,
        SIGHTKICK_DISABLE_YOUTUBE_METADATA: '1',
      },
    });
    await harness.app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => {
        throw new Error('URL-only flow opened a file dialog');
      };
    });
    page = await harness.app.firstWindow();
    await waitForAppReady(page);

    await page.getByRole('button', { name: 'Create chart' }).click();
    await page
      .getByTestId('auto-chart-youtube-url')
      .fill('https://youtu.be/abcdefghijk');

    const sightkickOption = page.getByRole('radio', { name: 'SightKick' });

    if (await sightkickOption.isVisible()) {
      await sightkickOption.click();
    }

    await page.getByTestId('auto-chart-from-youtube').click();
    await expect(page.getByTestId('auto-chart-steps')).toBeVisible();
    await expect(page.getByTestId('auto-chart-progress')).toContainText(
      /Separating fake drums|Finding fake beats|Transcribing fake notes|Writing fake chart/,
    );
    await expect(page.getByText('Add this song to your library')).toBeVisible();
    await expect(page.getByText('夜のドラム 🥁')).toBeVisible();
    await expect(page.getByText('Тестовый артист')).toBeVisible();

    if (process.env.SIGHTKICK_SIDECAR_E2E_PROOF) {
      await page.screenshot({ path: process.env.SIGHTKICK_SIDECAR_E2E_PROOF });
    }

    await page.getByRole('button', { name: 'Add to library' }).click();

    const imported = page
      .getByTestId(/song-item-/)
      .filter({ hasText: '夜のドラム 🥁' });

    await expect(imported).toBeVisible();
    await expect(imported).toContainText('Тестовый артист');
    expect(
      existsSync(
        path.join(harness.libraryDir, 'Тестовый артист - 夜のドラム 🥁'),
      ),
    ).toBe(true);
  });

  test('scans the folder, lists the song, and renders real sheet music', async () => {
    harness = await launchApp({ seedLibrary: true });
    page = await harness.app.firstWindow();
    await waitForAppReady(page);

    await expect(page.getByText('Build your practice library')).toBeVisible();

    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('rescan-folder').click();

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

    await song.click();

    await page.getByRole('button', { name: 'perform' }).click();

    const sheet = page.locator('svg').first();

    await expect(sheet).toBeVisible();
    await expect
      .poll(async () => page.locator('svg path').count(), { timeout: 30_000 })
      .toBeGreaterThan(0);
  });
});
