import path from 'path';
import { existsSync } from 'fs';
import { test, expect, Page } from '@playwright/test';
import { launchApp, Harness } from './support';
import { toAssetUrl } from '../src/main/util';

let harness: Harness;
let page: Page;

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

    await expect(page.getByText('Pick a folder for your songs.')).toBeVisible();
    await expect(page.getByText('Select folder')).toBeVisible();
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

    await page.getByTestId('song-search').fill('STRUM');
    await expect(row).toBeVisible();

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

    await page.getByRole('button', { name: 'Create chart' }).click();
    await expect(
      page.getByText('Create a drum chart from YouTube'),
    ).toBeVisible();

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

    const review = page.getByText('Review generated drum chart');
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

  test('scans the folder, lists the song, and renders real sheet music', async () => {
    harness = await launchApp({ seedLibrary: true });
    page = await harness.app.firstWindow();

    await expect(page.getByText('No songs in this folder.')).toBeVisible();

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
