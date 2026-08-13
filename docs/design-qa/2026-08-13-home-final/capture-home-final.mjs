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
  { name: '1225x768', width: 1225, height: 768 },
  { name: '1024x700', width: 1024, height: 700 },
];
const notes = [];

async function assertHeadingFits(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(150);

  const metrics = await page
    .getByTestId('home-session-manifest')
    .evaluate((band) => {
      const heading = band.querySelector('#home-cockpit-title');

      if (!(heading instanceof HTMLElement)) {
        throw new Error('Home heading is missing');
      }

      const range = document.createRange();

      range.selectNodeContents(heading);

      const textBoxes = Array.from(range.getClientRects());
      const headingBox = heading.getBoundingClientRect();
      const left = Math.min(
        headingBox.left,
        ...textBoxes.map((box) => box.left),
      );
      const top = Math.min(headingBox.top, ...textBoxes.map((box) => box.top));
      const right = Math.max(
        headingBox.right,
        ...textBoxes.map((box) => box.right),
      );
      const bottom = Math.max(
        headingBox.bottom,
        ...textBoxes.map((box) => box.bottom),
      );

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        heading: { left, top, right, bottom },
        band: band.getBoundingClientRect().toJSON(),
      };
    });
  const hasBreathingRoom =
    metrics.heading.top >= 12 && metrics.heading.left >= 0;
  const fitsViewport =
    metrics.heading.right <= metrics.viewport.width &&
    metrics.heading.bottom <= metrics.viewport.height;

  if (!hasBreathingRoom || !fitsViewport) {
    throw new Error(
      `Home heading escapes ${viewport.width}x${
        viewport.height
      }: ${JSON.stringify(metrics)}`,
    );
  }

  return metrics;
}

async function captureHome(page) {
  const headingBounds = [];

  for (const viewport of viewports) {
    headingBounds.push(await assertHeadingFits(page, viewport));
    await page.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, `01-home-${viewport.name}.png`),
    });
  }

  await page.setViewportSize(viewports[0]);
  await page.waitForTimeout(150);
  await page.getByTestId('kit-hotspot-hihat').screenshot({
    animations: 'disabled',
    path: path.join(outputDir, '02-label-bright-cymbal.png'),
  });
  await page.getByTestId('kit-hotspot-kick').screenshot({
    animations: 'disabled',
    path: path.join(outputDir, '03-label-dark-shell.png'),
  });

  return headingBounds;
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
    localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
  });
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function run() {
  if (!fs.existsSync(mainEntry)) {
    throw new Error(
      `Build output missing at ${mainEntry}; run corepack yarn build first.`,
    );
  }

  if (!fs.existsSync(sourceConfig)) {
    throw new Error(`Final-QA fixture config missing at ${sourceConfig}.`);
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-home-final-'),
  );
  const pageErrors = [];
  let failure;
  let headingBounds = [];

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
    await page.getByTestId('view-home').click();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });
    headingBounds = await captureHome(page);

    if (pageErrors.length > 0) {
      notes.push(`renderer page errors: ${JSON.stringify(pageErrors)}`);
    }
  } catch (error) {
    failure = String(error.stack ?? error);

    throw error;
  } finally {
    fs.writeFileSync(
      path.join(outputDir, 'capture-notes.json'),
      `${JSON.stringify(
        { failure, notes, pageErrors, headingBounds },
        null,
        2,
      )}\n`,
    );
    await app.close();
    fs.rmSync(userDataDir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
