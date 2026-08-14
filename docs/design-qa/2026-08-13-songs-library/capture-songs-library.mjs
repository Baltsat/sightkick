import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(outputDir, '../../..');
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const sourceConfig = path.join(root, '.userdata', 'final-qa', 'config.json');
const viewports = [
  { width: 1225, height: 768 },
  { width: 1024, height: 700 },
];
const notes = [];

async function configure(page) {
  await page.evaluate(() => {
    localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'keyboard',
        name: 'Keyboard',
        sourceId: 'keyboard',
      }),
    );
    localStorage.setItem('settings.inputMappings', '{}');
    localStorage.setItem('settings.controlMappings', '{}');
    localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
    localStorage.setItem('settings.adaptiveTutorEnabled', 'false');
    localStorage.setItem('settings.challengeLivesEnabled', 'false');
  });
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function captureBoth(page, name) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(
        outputDir,
        `${name}-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
}

async function captureOne(page, name) {
  await page.waitForTimeout(150);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(outputDir, `${name}.png`),
  });
}

async function openSongs(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('library-toolbar').waitFor({ timeout: 30_000 });
}

async function captureHoverPreview(page) {
  await page.getByTestId('song-search').fill('Lesson 01.01');

  const row = page.getByTestId('song-item-lesson:01.01');
  const found = await row
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!found) {
    notes.push('hover-preview: no local song matched "Lesson 01.01" — skipped');

    return;
  }

  await row.hover();

  const previewing = await page
    .locator('[data-testid="song-item-lesson:01.01"][data-previewing="true"]')
    .waitFor({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  notes.push({ hoverPreviewStarted: previewing });

  if (previewing) {
    const label = await page
      .getByTestId('song-preview-status')
      .textContent()
      .catch(() => undefined);

    notes.push({ hoverPreviewLabel: label });
  }

  await captureOne(page, '03-hover-preview');
  await page.getByTestId('song-search').fill('');
  await page.mouse.move(0, 0);
}

async function captureSourceRowActions(page) {
  const sourceRow = page.locator('[data-testid^="library-candidate-"]').first();
  const present = await sourceRow
    .waitFor({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!present) {
    notes.push(
      'source-row actions: no unresolved playlist candidate row — skipped',
    );

    return;
  }

  await sourceRow.hover();
  await page.waitForTimeout(150);
  await captureOne(page, '04-source-row-actions');
}

async function run() {
  if (!fs.existsSync(mainEntry)) {
    throw new Error(
      `Build output missing at ${mainEntry}. Run corepack yarn build first.`,
    );
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-songs-library-'),
  );
  const pageErrors = [];
  let failure;

  fs.copyFileSync(sourceConfig, path.join(userDataDir, 'config.json'));

  const app = await electron.launch({
    args: [mainEntry, '--mute-audio'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SK_USER_DATA_DIR: userDataDir,
      START_MINIMIZED: '1',
    },
  });

  try {
    const page = await app.firstWindow();

    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.setViewportSize(viewports[0]);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);
    await openSongs(page);
    await captureBoth(page, '01-songs-default');

    // The Difficulty chip is the default sort — capture its wine-outlined
    // selected state at rest (docs/visual-system-v3.md's chip rule).
    await page.setViewportSize(viewports[0]);
    await captureOne(page, '02-difficulty-chip-selected');

    await captureHoverPreview(page);
    await captureSourceRowActions(page);

    if (pageErrors.length > 0) {
      notes.push({ pageErrors });
    }
  } catch (error) {
    failure = String(error.stack ?? error);

    throw error;
  } finally {
    fs.writeFileSync(
      path.join(outputDir, 'capture-notes.json'),
      `${JSON.stringify({ failure, notes, pageErrors }, null, 2)}\n`,
    );
    await app.close();
    fs.rmSync(userDataDir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
