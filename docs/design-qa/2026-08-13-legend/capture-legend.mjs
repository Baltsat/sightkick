import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output_dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output_dir, '../../..');
const main_entry = path.join(root, 'out', 'main', 'index.js');
const source_config = path.join(root, '.userdata', 'final-qa', 'config.json');
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
    localStorage.setItem(
      'settings.inputMappings',
      JSON.stringify({
        keyboard: {
          kick: ['keyboard:KeyK'],
          snare: ['keyboard:KeyJ'],
        },
      }),
    );
    localStorage.setItem('settings.controlMappings', '{}');
    localStorage.setItem(
      'settings.practiceNotationLayout',
      JSON.stringify('flow'),
    );
    localStorage.setItem('settings.notationKitKeyVisible', 'false');
    localStorage.setItem('settings.countIn', 'false');
    localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
  });
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function open_practice(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
  await page.getByTestId('song-search').fill('Lesson 01.01');
  await page.getByTestId('song-item-lesson:01.01').click();
  await page.getByTestId('game-mode-practice').waitFor({ timeout: 30_000 });
  await page.getByTestId('game-mode-practice').click();
  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function capture_surface(page, viewport) {
  await page.setViewportSize(viewport);
  await page.getByLabel('Ready to play').waitFor({ timeout: 30_000 });

  const toggle = page.getByTestId('notation-kit-key-toggle');
  const key = page.getByTestId('notation-kit-key');

  await toggle.waitFor({ timeout: 30_000 });

  if (
    (await toggle.getAttribute('aria-expanded')) !== 'false' ||
    (await key.count()) !== 0
  ) {
    throw new Error(
      `Kit key was preloaded at ${viewport.width}x${viewport.height}`,
    );
  }

  await page.screenshot({
    animations: 'disabled',
    path: path.join(
      output_dir,
      `01-score-default-${viewport.width}x${viewport.height}.png`,
    ),
  });

  await toggle.click();
  await key.waitFor({ state: 'visible', timeout: 30_000 });

  const key_box = await key.boundingBox();

  if (
    (await toggle.getAttribute('aria-expanded')) !== 'true' ||
    !key_box ||
    key_box.x < 0 ||
    key_box.y < 0 ||
    key_box.x + key_box.width > viewport.width ||
    key_box.y + key_box.height > viewport.height
  ) {
    throw new Error(
      `Kit key did not open cleanly at ${viewport.width}x${viewport.height}`,
    );
  }

  await page.screenshot({
    animations: 'disabled',
    path: path.join(
      output_dir,
      `02-score-key-open-${viewport.width}x${viewport.height}.png`,
    ),
  });

  notes.push({ viewport, key_box });
  await toggle.click();
}

async function run() {
  if (!fs.existsSync(main_entry) || !fs.existsSync(source_config)) {
    throw new Error('Production build or final-qa seed is missing');
  }

  const user_data_dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-legend-'),
  );
  const page_errors = [];
  let failure;

  fs.copyFileSync(source_config, path.join(user_data_dir, 'config.json'));

  const app = await electron.launch({
    args: [main_entry, '--mute-audio'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SK_USER_DATA_DIR: user_data_dir,
      START_MINIMIZED: '1',
    },
  });

  try {
    const page = await app.firstWindow();

    page.on('pageerror', (error) => page_errors.push(String(error)));
    await page.setViewportSize(viewports[0]);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);
    await open_practice(page);

    for (const viewport of viewports) {
      await capture_surface(page, viewport);
    }

    if (page_errors.length > 0) {
      throw new Error(`Renderer page errors: ${JSON.stringify(page_errors)}`);
    }
  } catch (error) {
    failure = String(error.stack ?? error);

    throw error;
  } finally {
    fs.writeFileSync(
      path.join(output_dir, 'capture-notes.json'),
      `${JSON.stringify({ failure, notes, page_errors }, null, 2)}\n`,
    );
    await app.close();
    fs.rmSync(user_data_dir, { force: true, recursive: true });
  }
}

await run();
