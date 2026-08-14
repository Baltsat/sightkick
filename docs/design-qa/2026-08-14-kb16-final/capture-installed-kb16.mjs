import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const output_dir = path.dirname(fileURLToPath(import.meta.url));
const installed_executable =
  '/Applications/Drumroll.app/Contents/MacOS/Drumroll';
const viewport = { width: 1225, height: 768 };
const captures = [];
const page_errors = [];

async function capture(page, name, ready) {
  await ready.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(250);

  const screenshot = path.join(output_dir, `${name}.png`);

  await page.screenshot({ animations: 'disabled', path: screenshot });
  captures.push({ name, screenshot: path.basename(screenshot) });
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
    localStorage.setItem(
      'settings.inputMappings',
      JSON.stringify({ snare: ['keyboard:KeyJ'] }),
    );
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

async function open_practice_ready(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
  await page.getByTestId('song-search').fill('Lesson 01.01');
  await page.getByTestId('song-item-lesson:01.01').click();
  await page.getByTestId('game-mode-practice').click();
  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function open_result(page) {
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('count-in').waitFor({ timeout: 10_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="playing"]')
    .waitFor({ timeout: 30_000 });

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(180);
  }

  const slider = page.locator('.drumroll-practice-toolbar .ant-slider').first();
  const box = await slider.boundingBox();

  assert.ok(box, 'practice scrubber is not measurable');
  await page.mouse.click(box.x + box.width * 0.98, box.y + box.height / 2);
  await page.getByTestId('score-modal').waitFor({ timeout: 15_000 });
}

async function open_statistics(page) {
  await page.getByTestId('open-profile-button').waitFor({ timeout: 30_000 });
  await page.getByTestId('open-profile-button').click();
  await page.getByTestId('profile-view').waitFor({ timeout: 30_000 });
}

async function run() {
  if (!fs.existsSync(installed_executable)) {
    throw new Error(`Installed app missing at ${installed_executable}.`);
  }

  const user_data_dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-kb16-installed-'),
  );
  let failure;
  let app;

  try {
    app = await electron.launch({
      executablePath: installed_executable,
      args: ['--mute-audio'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SK_USER_DATA_DIR: user_data_dir,
        START_MINIMIZED: '1',
      },
    });

    const page = await app.firstWindow();

    page.on('pageerror', (error) => page_errors.push(String(error)));
    await page.setViewportSize(viewport);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);

    await page.getByTestId('view-home').click();
    await capture(
      page,
      '01-home-labelled-doors',
      page.getByTestId('home-cockpit'),
    );

    await page.getByTestId('view-songs').click();
    await capture(
      page,
      '02-songs-library',
      page.getByTestId('library-toolbar'),
    );

    await page.getByTestId('view-lessons').click();
    await capture(page, '03-journey', page.getByTestId('lessons-header-strip'));

    await open_practice_ready(page);
    await capture(
      page,
      '04-practice-ready',
      page.locator('.drumroll-practice-shell[data-session-phase="ready"]'),
    );

    await open_result(page);
    await capture(page, '05-result', page.getByTestId('score-modal'));

    await app.close();
    app = await electron.launch({
      executablePath: installed_executable,
      args: ['--mute-audio'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SK_USER_DATA_DIR: user_data_dir,
        START_MINIMIZED: '1',
      },
    });

    const statistics_page = await app.firstWindow();

    statistics_page.on('pageerror', (error) => page_errors.push(String(error)));
    await statistics_page.setViewportSize(viewport);
    await statistics_page
      .getByTestId('home-cockpit')
      .waitFor({ timeout: 60_000 });
    await open_statistics(statistics_page);
    await capture(
      statistics_page,
      '06-statistics',
      statistics_page.getByTestId('profile-view'),
    );
  } catch (error) {
    failure = String(error.stack ?? error);

    throw error;
  } finally {
    fs.writeFileSync(
      path.join(output_dir, 'capture-evidence.json'),
      `${JSON.stringify(
        {
          installed_executable,
          viewport,
          captures,
          page_errors,
          failure,
        },
        null,
        2,
      )}\n`,
    );
    await app?.close();
    fs.rmSync(user_data_dir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
