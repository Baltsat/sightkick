/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('@playwright/test');
const REPO_ROOT = path.resolve(__dirname, '..');
const MAIN_ENTRY = path.join(REPO_ROOT, 'out', 'main', 'index.js');
const LIVE_SNAPSHOT =
  '/tmp/drumroll-live-audit.E5fgbO/config-20260810T225900+0800.json';
const VIEWPORT = { width: 1225, height: 768 };

async function layoutProof(page, label) {
  return page.evaluate((stateLabel) => {
    const root = document.documentElement;
    const body = document.body;
    const phase = document
      .querySelector('.drumroll-practice-shell')
      ?.getAttribute('data-session-phase');

    return {
      label: stateLabel,
      viewport: { width: innerWidth, height: innerHeight },
      phase: phase ?? null,
      documentOverflow: {
        horizontal: root.scrollWidth > innerWidth + 1,
        vertical: root.scrollHeight > innerHeight + 1,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
      },
      bodyOverflow: {
        horizontal: body.scrollWidth > innerWidth + 1,
        vertical: body.scrollHeight > innerHeight + 1,
        scrollWidth: body.scrollWidth,
        scrollHeight: body.scrollHeight,
      },
      visibleKitCommands: Array.from(
        document.querySelectorAll('[data-testid="kit-command-prompt"]'),
      )
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);

          return (
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((element) => element.getAttribute('aria-label')),
    };
  }, label);
}

async function capture(
  page,
  outputDir,
  name,
  proofs,
  { animations = 'disabled' } = {},
) {
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    animations,
  });
  proofs.push(await layoutProof(page, name));
}

async function openPractice(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('library-kit-control-commands').waitFor({
    timeout: 30_000,
  });

  const hardDifficulty = page.getByTestId('difficulty-hard');

  if (await hardDifficulty.isVisible().catch(() => false)) {
    await hardDifficulty.click();
  }

  await page.getByTestId('song-search').fill('Boulevard of Broken Dreams');

  let rows = page.getByTestId(/^song-item-/);

  if ((await rows.count()) === 0) {
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('rescan-folder').click();
    await page.getByTestId('scan-progress').waitFor({ timeout: 30_000 });
    await page
      .getByTestId('scan-progress')
      .waitFor({ state: 'detached', timeout: 120_000 });
    await page.keyboard.press('Escape');
    rows = page.getByTestId(/^song-item-/);
  }

  await rows.first().waitFor({ timeout: 30_000 });

  const boulevard = rows.filter({ hasText: 'Boulevard of Broken Dreams' });
  const targetRow =
    (await boulevard.count()) > 0 ? boulevard.first() : rows.first();

  await targetRow.click();

  const practiceButton = page.getByTestId('game-mode-practice');

  if (await practiceButton.isVisible().catch(() => false)) {
    await practiceButton.click();
  }

  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function run() {
  const outputDir = path.resolve(
    process.argv[2] ??
      path.join(REPO_ROOT, 'docs', 'design-qa', '2026-08-10-kb6'),
  );
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-kb6-visual-qa-'),
  );
  const proofs = [];
  const consoleErrors = [];
  const pageErrors = [];

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(LIVE_SNAPSHOT, path.join(userDataDir, 'config.json'));

  const app = await electron.launch({
    args: [MAIN_ENTRY, '--mute-audio'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      START_MINIMIZED: '1',
      SK_USER_DATA_DIR: userDataDir,
    },
  });

  try {
    const page = await app.firstWindow();

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    await page.setViewportSize(VIEWPORT);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await page.evaluate(() => {
      localStorage.setItem(
        'settings.selectedDevice',
        JSON.stringify({
          id: 'midi:DTX Drums',
          name: 'DTX Drums',
          sourceId: 'midi',
          port: 0,
        }),
      );
      localStorage.setItem('settings.inputMappings', '{}');
      localStorage.setItem('settings.controlMappings', '{}');
      localStorage.setItem('settings.countIn', 'true');
      localStorage.setItem('settings.handsFreeControlsEnabled', 'true');
      localStorage.setItem('settings.challengeLivesEnabled', 'false');
      localStorage.setItem('settings.practiceNotationLayout', 'flow');
    });
    await page.reload();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(600);

    await page.getByTestId('kit-hotspot-snare').click();
    await page.waitForTimeout(130);
    await capture(page, outputDir, '02-home-pointer-strike', proofs, {
      animations: 'allow',
    });

    await page.getByTestId('view-songs').click();
    await page.getByTestId('library-kit-control-commands').waitFor({
      timeout: 30_000,
    });
    await capture(page, outputDir, '03-songs-kit-controls', proofs);

    await page.getByTestId('view-lessons').click();
    await page.getByTestId('lesson-season-stage').waitFor({ timeout: 30_000 });
    await page
      .locator('[data-testid="journey-kit-controls"]:visible')
      .first()
      .waitFor({ timeout: 30_000 });
    await capture(page, outputDir, '04-journey-kit-controls', proofs);

    await openPractice(page);

    const speed = page.getByRole('spinbutton', { name: 'Playback speed' });

    await speed.fill('0.5');
    await speed.press('Enter');

    const transportSlider = page.getByRole('slider').first();

    await transportSlider.press('Home');

    for (let step = 0; step < 24; step += 1) {
      await transportSlider.press('ArrowRight');
    }

    await page.waitForTimeout(250);
    await capture(page, outputDir, '05-practice-ready', proofs);

    await page.getByTestId('play-toggle').click();

    const countIn = page.getByTestId('count-in');

    await countIn.waitFor({ timeout: 10_000 });

    const normalAnimationName = await countIn.evaluate((root) => {
      const activeBeat = root.querySelector(
        '.drumroll-count-in__beat[data-state="active"] > span',
      );

      return activeBeat
        ? getComputedStyle(activeBeat).animationName
        : 'missing';
    });

    if (normalAnimationName === 'missing') {
      throw new Error('Count-in rendered without a visible active beat');
    }

    await capture(page, outputDir, '06-count-in', proofs);
    await page
      .locator('.drumroll-practice-shell[data-session-phase="playing"]')
      .waitFor({ timeout: 15_000 });
    await page.getByTestId('play-toggle').click();
    await page
      .locator('.drumroll-practice-shell[data-session-phase="paused"]')
      .waitFor({ timeout: 10_000 });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('play-toggle').click();
    await countIn.waitFor({ timeout: 10_000 });

    const reducedAnimationName = await countIn.evaluate((root) => {
      const activeBeat = root.querySelector(
        '.drumroll-count-in__beat[data-state="active"] > span',
      );

      return activeBeat
        ? getComputedStyle(activeBeat).animationName
        : 'missing';
    });

    await capture(page, outputDir, '06-count-in-reduced-motion', proofs);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page
      .locator('.drumroll-practice-shell[data-session-phase="playing"]')
      .waitFor({ timeout: 15_000 });
    await page.waitForTimeout(900);
    await capture(page, outputDir, '07-practice-playing-flow', proofs);

    await page.getByTestId('play-toggle').click();
    await page
      .locator('.drumroll-practice-shell[data-session-phase="paused"]')
      .waitFor({ timeout: 10_000 });
    await capture(page, outputDir, '08-practice-paused', proofs);

    await page.getByTestId('notation-classic-toggle').click();
    await page.getByTestId('classic-notation').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    await capture(page, outputDir, '09-practice-paused-classic', proofs);

    const failedLayoutProofs = proofs.filter(
      (proof) =>
        proof.documentOverflow.horizontal ||
        proof.documentOverflow.vertical ||
        proof.bodyOverflow.horizontal ||
        proof.bodyOverflow.vertical,
    );
    const runtime = {
      viewport: VIEWPORT,
      proofs,
      reducedMotion: { normalAnimationName, reducedAnimationName },
      consoleErrors,
      pageErrors,
      failedLayoutProofs: failedLayoutProofs.map((proof) => proof.label),
    };

    fs.writeFileSync(
      path.join(outputDir, 'qa-runtime.json'),
      `${JSON.stringify(runtime, null, 2)}\n`,
    );

    if (
      consoleErrors.length ||
      pageErrors.length ||
      failedLayoutProofs.length
    ) {
      throw new Error(
        `Visual QA failed: ${JSON.stringify({
          consoleErrors,
          pageErrors,
          failedLayoutProofs: failedLayoutProofs.map((proof) => proof.label),
        })}`,
      );
    }

    if (reducedAnimationName !== 'none') {
      throw new Error(
        `Reduced-motion count-in still animates (${reducedAnimationName})`,
      );
    }
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
