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
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1024x700', width: 1024, height: 700 },
];

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
    localStorage.setItem('settings.countIn', 'true');
    localStorage.setItem('settings.practiceNotationLayout', 'flow');
    localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
    localStorage.setItem('settings.adaptiveTutorEnabled', 'false');
    localStorage.setItem('settings.challengeLivesEnabled', 'false');
  });
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function run() {
  if (!fs.existsSync(main_entry)) {
    throw new Error(`Build output missing at ${main_entry}.`);
  }

  if (!fs.existsSync(source_config)) {
    throw new Error(`Final-QA fixture config missing at ${source_config}.`);
  }

  const user_data_dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-home-offers-'),
  );

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

    await page.setViewportSize(viewports[0]);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);
    await page.getByTestId('view-home').click();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });

    const offers = page.getByTestId('home-offers');
    const offer_count = await offers.count();
    const offer_text = offer_count ? await offers.innerText() : '';

    fs.writeFileSync(
      path.join(output_dir, 'offer-proof.json'),
      `${JSON.stringify({ offer_count, offer_text }, null, 2)}\n`,
    );

    if (!offer_count) {
      throw new Error(
        'The final-QA fixture did not produce evidence-gated offers.',
      );
    }

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      await page.screenshot({
        animations: 'disabled',
        path: path.join(output_dir, `home-offers-${viewport.name}.png`),
      });
    }
  } finally {
    await app.close();
    fs.rmSync(user_data_dir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
