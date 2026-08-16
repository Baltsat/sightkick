import path from 'path';
import {
  expect,
  test,
  _electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { launchApp, type Harness } from '../support';

test.setTimeout(180_000);

// Deep journey checks: green on real hardware, timing-brittle on slow CI
// runners. Run locally or scheduled with QA_DEEP=1.
test.skip(
  process.platform !== 'darwin' || process.env.QA_DEEP !== '1',
  'deep journey suites run on macOS with QA_DEEP=1',
);

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

async function openInputConfig(page: Page) {
  await page.getByTestId('settings-trigger').click();
  await page.getByTestId('setup-input').click();
  await expect(
    page.getByRole('dialog', { name: 'Configure input' }),
  ).toBeVisible();
}

async function rejectFileDialogs(harness: Harness) {
  await harness.app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => {
      throw new Error('automatic YouTube import opened a file dialog');
    };
  });
}

async function openImportedSong(page: Page) {
  await page.getByTestId('song-search').fill('Natural Villain Mokita');
  await page.getByTestId('song-search-result-abcdefghijk').click();
  await expect(page.getByTestId('play-toggle')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page
      .locator(
        '[data-testid="flow-notation"], [data-testid="classic-notation"]',
      )
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

test('closing input configuration closes its library settings parent and keeps keyboard changes', async () => {
  let harness: Harness | undefined;
  let reopened: ElectronApplication | undefined;

  try {
    harness = await launchApp({ seedLibrary: true });

    const page = await harness.app.firstWindow();

    await waitForLibrary(page);
    await openInputConfig(page);

    await page.locator('.ant-select').first().click();
    await page.getByText('Keyboard', { exact: true }).last().click();
    await page.getByTestId('learn-snare').click();
    await page.keyboard.press('KeyQ');
    await expect(page.getByTestId('input-row-snare')).toContainText('KeyQ');

    const latency = page.getByLabel('Input latency in milliseconds');

    await latency.fill('37');
    await latency.press('Enter');
    await expect(latency).toHaveValue('37');

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Configure input' }),
    ).toBeHidden();
    await expect(page.getByTestId('rescan-folder')).toBeHidden();

    await page.getByLabel('Open settings').click();
    await expect(page.getByTestId('setup-input')).toContainText('Keyboard');
    await page.getByTestId('setup-input').click();
    await expect(page.getByTestId('input-row-snare')).toContainText('KeyQ');
    await expect(latency).toHaveValue('37');
    await page.getByRole('button', { name: 'Done' }).click();

    await harness.app.close();
    reopened = await _electron.launch({
      args: [
        path.join(process.cwd(), 'out', 'main', 'index.js'),
        `--user-data-dir=${harness.userDataDir}`,
        '--mute-audio',
      ],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        START_MINIMIZED: '1',
      },
    });

    const relaunchedPage = await reopened.firstWindow();

    await waitForLibrary(relaunchedPage);
    await openInputConfig(relaunchedPage);
    await expect(relaunchedPage.getByTestId('input-row-snare')).toContainText(
      'KeyQ',
    );
    await expect(
      relaunchedPage.getByLabel('Input latency in milliseconds'),
    ).toHaveValue('37');
    await relaunchedPage.getByRole('button', { name: 'Done' }).click();
  } finally {
    await reopened?.close();
    await harness?.app.close();
  }
});

test('song-view settings and input configuration stay interactive through an imported practice screen', async () => {
  let harness: Harness | undefined;

  try {
    const transcriberPath = path.join(
      __dirname,
      '..',
      'fixtures',
      'fake-transcriber.sh',
    );
    const ytDlpPath = path.join(__dirname, '..', 'fixtures', 'fake-yt-dlp.sh');

    harness = await launchApp({
      seedLibrary: true,
      ytDlpFixturePath: ytDlpPath,
      env: {
        SIGHTKICK_TRANSCRIBER_PATH: transcriberPath,
        SIGHTKICK_DISABLE_YOUTUBE_METADATA: '1',
        SK_FFMPEG: transcriberPath,
      },
    });

    const page = await harness.app.firstWindow();

    await waitForLibrary(page);
    await rejectFileDialogs(harness);
    await openImportedSong(page);

    await page.getByLabel('Open inspector').click();
    await expect(page.getByTestId('more-settings')).toBeVisible();
    await page.getByTestId('more-settings').click();

    const colors = page.getByTestId('setting-colors');
    const before = await colors.getAttribute('aria-checked');

    await colors.click();
    await expect(colors).not.toHaveAttribute('aria-checked', before ?? '');

    await page.getByTestId('setup-input').click();
    await expect(
      page.getByRole('dialog', { name: 'Configure input' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Configure input' }),
    ).toBeHidden();

    await page.getByLabel('Open inspector').click();
    await expect(page.getByTestId('more-settings')).toBeVisible();
    await page.getByTestId('more-settings').click();
    await expect(page.getByTestId('setting-colors')).not.toHaveAttribute(
      'aria-checked',
      before ?? '',
    );
    await page.getByLabel('Open inspector').click();
    await expect(page.getByTestId('more-settings')).toBeHidden();
  } finally {
    await harness?.app.close();
  }
});
