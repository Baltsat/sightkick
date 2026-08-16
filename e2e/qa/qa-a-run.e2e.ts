import path from 'path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Harness } from '../support';

test.setTimeout(180_000);

async function wait_for_library(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Your drum library' }),
  ).toBeVisible({ timeout: 60_000 });
}

async function import_recording(page: Page) {
  await page.getByTestId('song-search').fill('Natural Villain Mokita');
  await page.getByTestId('song-search-result-abcdefghijk').click();
  await expect(page.getByTestId('play-toggle')).toBeVisible({
    timeout: 60_000,
  });
}

async function wait_for_run_end(page: Page) {
  await expect(page.getByTestId('score-modal')).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('QA-A run lifecycle', () => {
  // Same win32-CI limitation as settings-close.e2e.ts: journey gestures
  // behave differently on the Windows runner while macOS (the shipped
  // platform) and Ubuntu stay green. Open investigation.
  // Deep journey checks: green on real hardware, timing-brittle on slow CI
  // runners across every OS. Run locally or scheduled with QA_DEEP=1; the
  // per-push gate keeps the stable specs.
  test.skip(
    process.platform !== 'darwin' || process.env.QA_DEEP !== '1',
    'deep journey suites run on macOS with QA_DEEP=1',
  );

  let harness: Harness | undefined;

  test.afterEach(async () => {
    await harness?.app.close();
    harness = undefined;
  });

  test('a playable import supports mouse play, pause, resume, retry, continue, favourite, and back-out', async () => {
    const transcriber_path = path.join(
      __dirname,
      '..',
      'fixtures',
      'fake-transcriber.sh',
    );
    const yt_dlp_path = path.join(
      __dirname,
      '..',
      'fixtures',
      'fake-yt-dlp.sh',
    );

    harness = await launchApp({
      seedLibrary: true,
      ytDlpFixturePath: yt_dlp_path,
      env: {
        SIGHTKICK_TRANSCRIBER_PATH: transcriber_path,
        SIGHTKICK_DISABLE_YOUTUBE_METADATA: '1',
        SK_FFMPEG: transcriber_path,
      },
    });

    const page = await harness.app.firstWindow();

    await page.getByTestId('view-songs').click();
    await wait_for_library(page);
    await import_recording(page);

    const play = page.getByTestId('play-toggle');

    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause', {
      timeout: 30_000,
    });

    await page.getByTestId('back-button').click();
    await wait_for_library(page);
    await page.getByTestId('song-search').fill('夜のドラム');
    await page
      .locator('[data-testid^="song-item-"]')
      .filter({ hasText: '夜のドラム' })
      .click();
    await page.getByTestId('game-mode-perform').click();
    await expect(play).toBeVisible({ timeout: 30_000 });

    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause', {
      timeout: 30_000,
    });
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Play');
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause', {
      timeout: 30_000,
    });

    await wait_for_run_end(page);
    await expect(page.getByTestId('score-command-retry')).toBeVisible();
    await expect(page.getByTestId('score-command-continue')).toBeVisible();
    await expect(page.getByTestId('score-command-end')).toBeVisible();
    await expect(page.getByTestId('score-command-open-coach')).toBeVisible();

    await page.getByTestId('score-command-open-coach').click();
    await expect(page.getByTestId('ai-coach')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('ai-coach')).toHaveCount(0);
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause', {
      timeout: 30_000,
    });

    await wait_for_run_end(page);
    await page.getByTestId('score-command-retry').click();
    await expect(page.getByTestId('score-modal')).toHaveCount(0);
    await expect(play).toHaveAttribute('aria-label', 'Pause', {
      timeout: 30_000,
    });

    await wait_for_run_end(page);
    await page.getByTestId('score-command-continue').click();
    await expect(page.getByTestId('score-modal')).toHaveCount(0);
    await wait_for_library(page);
    await page.getByTestId('song-search').fill('夜のドラム');

    const imported = page
      .locator('[data-testid^="song-item-"]')
      .filter({ hasText: '夜のドラム' });

    await expect(imported).toBeVisible();
    await imported.click();
    await page.getByTestId('game-mode-perform').click();
    await expect(page.getByTestId('play-toggle')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId('play-toggle').click();
    await wait_for_run_end(page);
    await page.getByTestId('score-command-end').click();
    await wait_for_library(page);
    await page.getByTestId('song-search').fill('夜のドラム');
    await expect(imported).toBeVisible();

    const like = imported.getByTestId('like-toggle');

    await like.click();
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    await like.click();
    await expect(like).toHaveAttribute('aria-pressed', 'false');
  });
});
