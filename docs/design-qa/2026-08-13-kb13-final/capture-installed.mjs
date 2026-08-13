import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output_dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output_dir, '../../..');
const installed_executable =
  '/Applications/Drumroll.app/Contents/MacOS/Drumroll';
const source_config = path.join(root, '.userdata', 'final-qa', 'config.json');
const wide_viewport = { width: 1225, height: 768 };
const compact_viewport = { width: 1024, height: 700 };
const notes = [];

async function shoot_both(page, name) {
  await page.setViewportSize(wide_viewport);
  await page.waitForTimeout(150);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output_dir, `${name}-1225x768.png`),
  });
  await page.setViewportSize(compact_viewport);
  await page.waitForTimeout(150);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output_dir, `${name}-1024x700.png`),
  });
  await page.setViewportSize(wide_viewport);
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

async function capture_home(page) {
  await page.getByTestId('view-home').click();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });
  await shoot_both(page, '01-home');
}

async function capture_library(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('library-toolbar').waitFor({ timeout: 30_000 });
  await shoot_both(page, '02-library');
}

async function capture_journey(page) {
  await page.getByTestId('view-lessons').click();
  await page.getByTestId('lessons-header-strip').waitFor({ timeout: 30_000 });
  await shoot_both(page, '03-journey');
}

async function open_practice_ready(page) {
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

async function capture_practice(page) {
  await open_practice_ready(page);
  await shoot_both(page, '04-practice');
}

async function capture_result(page) {
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('count-in').waitFor({ timeout: 10_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="playing"]')
    .waitFor({ timeout: 30_000 });

  const slider_track = page
    .locator('.drumroll-practice-toolbar .ant-slider')
    .first();
  const slider_box = await slider_track.boundingBox();

  if (!slider_box) {
    throw new Error('Practice scrubber is not measurable');
  }

  await page.mouse.click(
    slider_box.x + slider_box.width * 0.98,
    slider_box.y + slider_box.height / 2,
  );
  await page.getByTestId('score-modal').waitFor({ timeout: 15_000 });
  await shoot_both(page, '05-result');
}

async function run() {
  if (!fs.existsSync(installed_executable)) {
    throw new Error(`Installed app missing at ${installed_executable}.`);
  }

  if (!fs.existsSync(source_config)) {
    throw new Error(`Final-QA fixture config missing at ${source_config}.`);
  }

  const user_data_dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-kb13-installed-'),
  );
  const page_errors = [];
  let failure;

  fs.copyFileSync(source_config, path.join(user_data_dir, 'config.json'));

  const app = await electron.launch({
    executablePath: installed_executable,
    args: ['--mute-audio'],
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
    await page.setViewportSize(wide_viewport);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);
    await capture_home(page);
    await capture_library(page);
    await capture_journey(page);
    await capture_practice(page);
    await capture_result(page);

    if (page_errors.length > 0) {
      notes.push(`renderer page errors: ${JSON.stringify(page_errors)}`);
    }
  } catch (error) {
    failure = String(error.stack ?? error);

    throw error;
  } finally {
    fs.writeFileSync(
      path.join(output_dir, 'capture-notes.json'),
      `${JSON.stringify(
        {
          failure,
          notes,
          page_errors,
          installed_executable,
        },
        null,
        2,
      )}\n`,
    );
    await app.close();
    fs.rmSync(user_data_dir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
