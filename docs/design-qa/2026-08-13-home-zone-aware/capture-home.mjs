import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Verification capture for the zone-aware home redesign (2026-08-13). Same
// production build + final-QA fixture + keyboard input device as
// docs/design-qa/2026-08-13-truth/capture-truth.mjs, narrowed to just home
// at both supported viewports.

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(outputDir, '../../..');
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const sourceConfig = path.join(root, '.userdata', 'final-qa', 'config.json');
const wideViewport = { width: 1225, height: 768 };
const compactViewport = { width: 1024, height: 700 };

async function shootBoth(page, name) {
  await page.setViewportSize(wideViewport);
  await page.waitForTimeout(150);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(outputDir, `${name}-1225x768.png`),
  });
  await page.setViewportSize(compactViewport);
  await page.waitForTimeout(150);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(outputDir, `${name}-1024x700.png`),
  });
  await page.setViewportSize(wideViewport);
  await page.waitForTimeout(150);
}

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
  if (!fs.existsSync(mainEntry)) {
    throw new Error(
      `Build output missing at ${mainEntry}; run yarn build first.`,
    );
  }

  if (!fs.existsSync(sourceConfig)) {
    throw new Error(`Final-QA fixture config missing at ${sourceConfig}.`);
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-home-zone-aware-'),
  );

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

    await page.setViewportSize(wideViewport);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);

    await page.getByTestId('view-home').click();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });
    await shootBoth(page, '01-home');

    await page.getByText('Session details').click();
    await page.waitForTimeout(150);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, '02-home-session-details-open-1225x768.png'),
    });
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
