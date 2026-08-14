import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = '/Users/konstantinbaltsat/sightkick';
const outputDir =
  '/private/tmp/claude-501/-Users-konstantinbaltsat/c3fd5be5-cd59-4bce-9705-537b5e097efe/scratchpad';
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const sourceConfig = path.join(root, '.userdata', 'final-qa', 'config.json');
const wideViewport = { width: 1225, height: 768 };
const compactViewport = { width: 1024, height: 700 };

async function shootBoth(page, name) {
  await page.setViewportSize(compactViewport);
  await page.waitForTimeout(150);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(outputDir, `${name}-1024x700.png`),
  });
  await page.setViewportSize(wideViewport);
  await page.waitForTimeout(150);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(outputDir, `${name}-1225x768.png`),
  });
}

async function run() {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-stress-visual-'),
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

    for (const query of ['Lesson 07.07', 'Lesson 09.06', 'Lesson 14.08']) {
      await page.getByTestId('view-songs').click();
      await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
      await page.getByTestId('song-search').fill('');
      await page.getByTestId('song-search').fill(query);
      await page.waitForTimeout(300);

      const rows = page.locator('[data-testid^="song-item-"]');
      const count = await rows.count();

      if (count === 0) {
        console.log(`NO MATCH for ${query}`);

        continue;
      }

      await rows.first().click();

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

      const safeName = query.replace(/[^a-z0-9]+/gi, '-');

      await shootBoth(page, `stress-${safeName}`);

      // Advance a few bars in so a denser/wider-range measure is on screen,
      // then pause and shoot again - the ready-state pickup bar above is
      // never a good stress case for ledger lines/beams.
      await page.getByTestId('play-toggle').click();
      await page.waitForTimeout(6000);
      await page.getByTestId('play-toggle').click();
      await page.waitForTimeout(300);
      await shootBoth(page, `stress-${safeName}-mid`);

      await page.getByTestId('back-button').click();
      await page.getByTestId('view-songs').waitFor({ timeout: 30_000 });
    }
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
