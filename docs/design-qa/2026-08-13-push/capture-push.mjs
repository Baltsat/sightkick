import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Integration capture for the 2026-08-13 five-lane merge (songs shelf,
// journey & results, defects/hardening, one background, kit proof drill).
// Modelled on docs/design-qa/2026-08-13-final/capture-final.mjs — same
// production Electron build (out/main/index.js, so it reflects the current
// working tree) + final-QA fixture + keyboard input device. Adds a
// statistics (profile) route capture on top of the five prior routes.

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(outputDir, '../../..');
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const sourceConfig = path.join(root, '.userdata', 'final-qa', 'config.json');
const wideViewport = { width: 1225, height: 768 };
const compactViewport = { width: 1024, height: 700 };
const notes = [];

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

async function captureHome(page) {
  await page.getByTestId('view-home').click();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });
  await shootBoth(page, '01-home');
}

async function captureLibrary(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('library-toolbar').waitFor({ timeout: 30_000 });
  await shootBoth(page, '02-library');
}

async function assertJourneyWorldTitleFits(page) {
  for (const viewport of [wideViewport, compactViewport]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);

    const metrics = await page
      .getByTestId('journey-world-title')
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        const range = document.createRange();

        range.selectNodeContents(element);

        const text = range.getBoundingClientRect();

        return {
          boxRight: box.right,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: element.textContent,
          textRight: text.right,
        };
      });

    notes.push(
      `journey title fit ${viewport.width}x${viewport.height}: ${JSON.stringify(
        metrics,
      )}`,
    );

    if (
      metrics.scrollWidth > metrics.clientWidth + 1 ||
      metrics.textRight > metrics.boxRight + 1
    ) {
      throw new Error(
        `Journey title clips at ${viewport.width}x${
          viewport.height
        }: ${JSON.stringify(metrics)}`,
      );
    }
  }
}

async function captureJourney(page) {
  await page.getByTestId('view-lessons').click();
  await page.getByTestId('lessons-header-strip').waitFor({ timeout: 30_000 });
  await assertJourneyWorldTitleFits(page);
  await shootBoth(page, '03-journey');
}

async function openPracticeReady(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
  await page.getByTestId('song-search').fill('Lesson 01.01');

  const target = page.getByTestId('song-item-lesson:01.01');

  await target.waitFor({ timeout: 30_000 });
  await target.click();

  const practice = page.getByTestId('game-mode-practice');

  await practice.waitFor({ timeout: 30_000 });
  await practice.click();

  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
  await page
    .locator('[data-testid="practice-readiness-cue"][data-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function capturePractice(page) {
  await openPracticeReady(page);
  await shootBoth(page, '04-practice');
}

async function captureResult(page) {
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('count-in').waitFor({ timeout: 10_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="playing"]')
    .waitFor({ timeout: 30_000 });

  const sliderTrack = page
    .locator('.drumroll-practice-toolbar .ant-slider')
    .first();
  const sliderBox = await sliderTrack.boundingBox();

  if (!sliderBox) {
    throw new Error('Practice scrubber is not measurable');
  }

  await page.mouse.click(
    sliderBox.x + sliderBox.width * 0.98,
    sliderBox.y + sliderBox.height / 2,
  );

  try {
    await page.getByTestId('score-modal').waitFor({ timeout: 15_000 });
  } catch (error) {
    notes.push(`result screen could not be reached: ${error}`);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, '05-result-missing.png'),
    });

    return;
  }

  await shootBoth(page, '05-result');
}

async function captureStatistics(page) {
  // Captured before practice/result: the result receipt portals to
  // document.body and covers the rail, so there is no reliable way back to
  // it from there. The profile route renders inside the shell's own main
  // content, so it is reachable straight from home.
  await page.getByTestId('view-home').click();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });
  await page.getByTestId('open-profile-button').click();
  await page.getByTestId('profile-view').waitFor({ timeout: 30_000 });
  await page.getByTestId('profile-insights-hero').waitFor({ timeout: 30_000 });
  await shootBoth(page, '06-statistics');
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
    path.join(os.tmpdir(), 'drumroll-push-visual-'),
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
    await page.setViewportSize(wideViewport);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);

    await captureHome(page);
    await captureLibrary(page);
    await captureJourney(page);
    await captureStatistics(page);
    await capturePractice(page);
    await captureResult(page);

    if (pageErrors.length > 0) {
      notes.push(`renderer page errors: ${JSON.stringify(pageErrors)}`);
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
