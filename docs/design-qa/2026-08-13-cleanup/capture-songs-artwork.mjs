import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output_dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output_dir, '../../..');
const main_entry = path.join(root, 'out', 'main', 'index.js');
const source_config = path.join(root, '.userdata', 'final-qa', 'config.json');
const user_data_dir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'drumroll-cleanup-'),
);
const notes = { placeholder_sources: [], page_errors: [] };

async function run() {
  if (!fs.existsSync(main_entry)) {
    throw new Error(`Build output missing at ${main_entry}`);
  }

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

    page.on('pageerror', (error) => notes.page_errors.push(String(error)));
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
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
    });
    await page.reload();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await page.getByTestId('view-songs').click();
    await page.getByTestId('library-toolbar').waitFor({ timeout: 30_000 });
    notes.placeholder_sources = await page
      .locator('[data-testid^="library-candidate-"] img')
      .evaluateAll((artwork) =>
        artwork.map((image) => image.getAttribute('src')),
      );
    await page.screenshot({
      animations: 'disabled',
      path: path.join(output_dir, '01-songs-neutral-placeholder-1024x700.png'),
    });
  } finally {
    fs.writeFileSync(
      path.join(output_dir, 'capture-notes.json'),
      `${JSON.stringify(notes, null, 2)}\n`,
    );
    await app.close();
    fs.rmSync(user_data_dir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
