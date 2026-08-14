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
  { width: 1225, height: 768 },
  { width: 1024, height: 700 },
];
const notes = [];

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
      JSON.stringify({
        keyboard: {
          kick: ['keyboard:KeyK'],
          snare: ['keyboard:KeyJ'],
        },
      }),
    );
    localStorage.setItem('settings.controlMappings', '{}');
    localStorage.setItem(
      'settings.practiceNotationLayout',
      JSON.stringify('flow'),
    );
    localStorage.setItem('settings.countIn', 'false');
    localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
    localStorage.setItem('settings.adaptiveTutorEnabled', 'true');
    localStorage.setItem('settings.tutorAutoRewind', 'false');
    localStorage.setItem('settings.challengeLivesEnabled', 'false');
  });
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function openPractice(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
  await page.getByTestId('song-search').fill('Lesson 01.01');
  await page.getByTestId('song-item-lesson:01.01').click();
  await page.getByTestId('game-mode-practice').waitFor({ timeout: 30_000 });
  await page.getByTestId('game-mode-practice').click();
  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function inspectSharedField(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(180);

  const state = await page
    .locator('.drumroll-practice-shell')
    .evaluate((practice) => {
      const shell = document.querySelector('.arena-shell');
      const rail = document.querySelector('.arena-shell__rail');
      const stage = document.querySelector('.drumroll-notation-stage');
      const key = document.querySelector('[data-testid="notation-kit-key"]');
      const practiceBox = practice.getBoundingClientRect();
      const railBox = rail?.getBoundingClientRect();
      const keyBox = key?.getBoundingClientRect();

      return {
        practiceBox: {
          left: practiceBox.left,
          right: practiceBox.right,
          width: practiceBox.width,
        },
        railBox: railBox
          ? { left: railBox.left, right: railBox.right, width: railBox.width }
          : undefined,
        keyBox: keyBox
          ? {
              left: keyBox.left,
              right: keyBox.right,
              top: keyBox.top,
              bottom: keyBox.bottom,
              width: keyBox.width,
              height: keyBox.height,
            }
          : undefined,
        practiceBackground: getComputedStyle(practice).backgroundColor,
        stageBackground: stage
          ? getComputedStyle(stage).backgroundColor
          : undefined,
        fieldBackground: shell
          ? getComputedStyle(shell, '::before').backgroundImage
          : undefined,
        keyText: key?.textContent?.replace(/\s+/g, ' ').trim(),
      };
    });
  const expectedRailWidth = viewport.width <= 1120 ? 64 : 208;

  if (
    !state.railBox ||
    !state.keyBox ||
    Math.abs(state.railBox.width - expectedRailWidth) > 1 ||
    Math.abs(state.practiceBox.left - expectedRailWidth) > 1 ||
    state.practiceBackground !== 'rgba(0, 0, 0, 0)' ||
    !state.fieldBackground ||
    !state.keyText?.includes('kit key') ||
    state.keyBox.left < state.practiceBox.left ||
    state.keyBox.right > viewport.width ||
    state.keyBox.top < 0 ||
    state.keyBox.bottom > viewport.height
  ) {
    throw new Error(
      `Shared field or notation key failed at ${viewport.width}x${
        viewport.height
      }: ${JSON.stringify(state)}`,
    );
  }

  notes.push({ viewport, sharedField: state });
}

async function captureSurface(page) {
  for (const viewport of viewports) {
    await inspectSharedField(page, viewport);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(
        outputDir,
        `01-practice-shared-field-${viewport.width}x${viewport.height}.png`,
      ),
    });
    await page.getByTestId('notation-kit-key').screenshot({
      animations: 'disabled',
      path: path.join(
        outputDir,
        `02-notation-kit-key-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
}

async function captureWrongExplanation(page) {
  await page.setViewportSize(viewports[0]);
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('play-toggle').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(420);
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(120);
  await page.getByTestId('play-toggle').click();

  const why = page.getByTestId('tutor-mistake');

  await why.waitFor({ timeout: 15_000 });
  await why.locator('summary').click();
  await page.waitForTimeout(120);

  const state = await why.evaluate((element) => {
    const swatches = [...element.querySelectorAll('[data-kit-element]')].map(
      (chip) => ({
        element: chip.getAttribute('data-kit-element'),
        color: getComputedStyle(
          chip.querySelector('.drumroll-tutor-hud__mistake-swatch'),
        ).backgroundColor,
      }),
    );

    return {
      text: element.textContent?.replace(/\s+/g, ' ').trim(),
      swatches,
    };
  });
  const keyBox = await page.getByTestId('notation-kit-key').boundingBox();

  if (
    state.swatches.length === 0 ||
    !state.text?.includes('You hit') ||
    !state.text.includes('Kick') ||
    !keyBox ||
    keyBox.x < 0 ||
    keyBox.y < 0 ||
    keyBox.x + keyBox.width > viewports[0].width ||
    keyBox.y + keyBox.height > viewports[0].height
  ) {
    throw new Error(
      `Wrong-note explanation was incomplete: ${JSON.stringify({
        state,
        keyBox,
      })}`,
    );
  }

  notes.push({ wrongNoteExplanation: { ...state, keyBox } });
  await page.screenshot({
    animations: 'disabled',
    path: path.join(outputDir, '03-wrong-note-explained-in-colour.png'),
  });
  await why.screenshot({
    animations: 'disabled',
    path: path.join(outputDir, '04-wrong-note-colour-detail.png'),
  });
}

async function run() {
  if (!fs.existsSync(mainEntry) || !fs.existsSync(sourceConfig)) {
    throw new Error('Production build or final-qa seed is missing');
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drumroll-teach-'));
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
    await page.setViewportSize(viewports[0]);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);
    await openPractice(page);
    await captureSurface(page);
    await captureWrongExplanation(page);

    if (pageErrors.length > 0) {
      throw new Error(`Renderer page errors: ${JSON.stringify(pageErrors)}`);
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
