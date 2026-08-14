import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output_dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output_dir, '../../..');
const main_entry = path.join(root, 'out', 'main', 'index.js');
const source_config = path.join(root, '.userdata', 'final-qa', 'config.json');
const wide = { width: 1225, height: 768 };
const compact = { width: 1024, height: 700 };
const notes = [];

async function configure(page, mode) {
  await page.evaluate((color_mode) => {
    localStorage.setItem(
      'settings.kitColorOverride',
      JSON.stringify(color_mode),
    );
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
  }, mode);
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function open_journey(page) {
  await page.getByTestId('view-lessons').click();
  await page.getByTestId('lesson-season-stage').waitFor({ timeout: 30_000 });
}

async function select_tom_season(page) {
  await page.getByTestId('season-rail-Toms, Dynamics & Fills I').click();
  await page
    .getByTestId('journey-world-title')
    .filter({ hasText: 'Toms, Dynamics & Fills I' })
    .waitFor({ timeout: 30_000 });
}

async function capture_viewports(page, name) {
  for (const viewport of [wide, compact]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(
        output_dir,
        `${name}-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
}

async function run() {
  if (!fs.existsSync(main_entry)) {
    throw new Error(`Build output missing at ${main_entry}.`);
  }

  if (!fs.existsSync(source_config)) {
    throw new Error(`Final-QA fixture config missing at ${source_config}.`);
  }

  const user_data_dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-journey-lanes-'),
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
    await page.setViewportSize(wide);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });

    await configure(page, 'full-color');
    await open_journey(page);
    await capture_viewports(page, '01-journey-lanes');
    await select_tom_season(page);
    await page.setViewportSize(wide);
    await page.locator('[data-testid="lesson-season-stage"]').screenshot({
      animations: 'disabled',
      path: path.join(output_dir, '02-two-lanes-crop.png'),
    });

    await configure(page, 'near-black');
    await open_journey(page);
    await select_tom_season(page);
    await page.setViewportSize(wide);
    await page.locator('[data-testid="lesson-season-stage"]').screenshot({
      animations: 'disabled',
      path: path.join(output_dir, '03-faded-unproven-node.png'),
    });

    if (page_errors.length > 0) {
      notes.push(`renderer page errors: ${JSON.stringify(page_errors)}`);
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

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
