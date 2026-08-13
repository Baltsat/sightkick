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
    localStorage.setItem('settings.inputMappings', '{}');
    localStorage.setItem('settings.controlMappings', '{}');
    localStorage.setItem(
      'settings.practiceNotationLayout',
      JSON.stringify('classic'),
    );
    localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
    localStorage.setItem('settings.adaptiveTutorEnabled', 'false');
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
  await page.getByTestId('classic-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function captureBoth(page, name) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(
        outputDir,
        `${name}-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
}

async function assertHeader(page) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    const metrics = await page
      .getByTestId('sheet-score-title')
      .evaluate((title) => {
        const box = title.getBoundingClientRect();
        const container = title.closest('.drumroll-classic-viewport');

        return {
          left: box.left,
          right: box.right,
          width: box.width,
          scrollLeft: container?.scrollLeft,
          title: title.textContent,
        };
      });

    if (metrics.left < -1 || metrics.right > viewport.width + 1) {
      throw new Error(
        `Classic title clips at ${viewport.width}x${
          viewport.height
        }: ${JSON.stringify(metrics)}`,
      );
    }

    notes.push({ viewport, header: metrics });
  }
}

async function scrollClassicRight(page) {
  await page.locator('.drumroll-classic-viewport').evaluate((viewport) => {
    viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
  });
  await page.waitForTimeout(120);
}

async function rightMostVisibleHead(page) {
  const heads = page.locator('[data-notation-kind="colored-head"]');
  const index = await heads.evaluateAll((elements) => {
    const candidate = elements
      .map((element, headIndex) => ({
        index: headIndex,
        box: element.getBoundingClientRect(),
      }))
      .filter(
        ({ box }) => box.width > 0 && box.right > 0 && box.left < innerWidth,
      )
      .sort((left, right) => right.box.right - left.box.right)[0];

    return candidate?.index;
  });

  if (index === undefined) {
    throw new Error(
      'No visible note head was available for the right-edge inspection',
    );
  }

  return heads.nth(index);
}

async function captureRightEdgeWhy(page) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await scrollClassicRight(page);

    const head = await rightMostVisibleHead(page);

    await head.click({ modifiers: ['Alt'], force: true });

    const card = page.getByTestId('notation-glossary');

    await card.waitFor({ timeout: 10_000 });

    const [cardBox, headBox] = await Promise.all([
      card.boundingBox(),
      head.boundingBox(),
    ]);

    if (!cardBox || !headBox) {
      throw new Error('The right-edge notation card was not measurable');
    }

    const cardState = await card.evaluate((element) => {
      const style = getComputedStyle(element);

      return {
        text: element.textContent?.replace(/\s+/g, ' ').trim(),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
        backgroundColor: style.backgroundColor,
      };
    });

    if (
      cardState.display === 'none' ||
      cardState.visibility !== 'visible' ||
      Number(cardState.opacity) === 0
    ) {
      throw new Error(
        `Right-edge notation card is not visibly rendered: ${JSON.stringify(
          cardState,
        )}`,
      );
    }

    const topmostTestId = await card.evaluate((element) => {
      const previousPointerEvents = element.style.pointerEvents;
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      element.style.pointerEvents = 'auto';

      const top = document
        .elementFromPoint(x, y)
        ?.closest('[data-testid]')
        ?.getAttribute('data-testid');

      element.style.pointerEvents = previousPointerEvents;

      return top;
    });

    if (topmostTestId !== 'notation-glossary') {
      throw new Error(
        `Right-edge notation card is behind the score: ${String(
          topmostTestId,
        )}`,
      );
    }

    const overlap =
      cardBox.x < headBox.x + headBox.width &&
      cardBox.x + cardBox.width > headBox.x &&
      cardBox.y < headBox.y + headBox.height &&
      cardBox.y + cardBox.height > headBox.y;

    if (
      cardBox.x < 15 ||
      cardBox.y < 15 ||
      cardBox.x + cardBox.width > viewport.width - 15 ||
      cardBox.y + cardBox.height > viewport.height - 15 ||
      overlap
    ) {
      throw new Error(
        `Right-edge notation card is unsafe at ${viewport.width}x${
          viewport.height
        }: ${JSON.stringify({ cardBox, headBox, overlap })}`,
      );
    }

    notes.push({
      viewport,
      rightEdgeWhy: { cardBox, headBox, overlap, cardState, topmostTestId },
    });
    await page.screenshot({
      animations: 'disabled',
      path: path.join(
        outputDir,
        `03-why-right-edge-${viewport.width}x${viewport.height}.png`,
      ),
    });
    await card.screenshot({
      animations: 'disabled',
      path: path.join(
        outputDir,
        `04-why-card-detail-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
}

async function run() {
  if (!fs.existsSync(mainEntry)) {
    throw new Error(`Build output missing at ${mainEntry}`);
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-practice-fix-'),
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
    await page.setViewportSize(viewports[0]);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page);
    await openPractice(page);
    await assertHeader(page);
    await captureBoth(page, '01-classic-header');

    const repeats = await page
      .locator('[data-testid^="notation-pattern-"]')
      .count();

    if (repeats === 0) {
      throw new Error(
        'The Lesson 01.01 score did not expose a repeated-figure band',
      );
    }

    notes.push({ repeatedFigureBands: repeats });
    await captureBoth(page, '02-repeated-figure');
    await captureRightEdgeWhy(page);

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
