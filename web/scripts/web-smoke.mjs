import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const shotDir =
  process.env.WEB_SMOKE_SHOT_DIR || path.join(repoRoot, 'scratchpad/web-shots');
const baseUrl = process.argv[2] || 'http://127.0.0.1:8788';
const systemChrome =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const expectedLessonCount = 170;
const expectedPublicRelease =
  'https://github.com/Baltsat/sightkick/releases/download/v1.2.0-kb.2/Drumroll-1.2.0-kb.2-arm64.dmg';

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
  args: ['--autoplay-policy=user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'dark',
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors = [];

page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') {
    errors.push(`${message.text()} @ ${message.location().url}`);
  }
});

try {
  console.log('smoke: landing');

  const response = await page.goto(baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  if (!response?.ok()) {
    throw new Error(`Landing request failed: ${response?.status()}.`);
  }

  await page
    .getByRole('heading', { name: /sit down/i })
    .waitFor({ timeout: 120_000 });
  await page.screenshot({
    path: path.join(shotDir, '01-marketing-landing.png'),
    animations: 'disabled',
    timeout: 120_000,
  });

  const publicReleaseHref = await page
    .locator('#desktop-download')
    .getAttribute('href');

  if (publicReleaseHref !== expectedPublicRelease) {
    throw new Error(
      `Expected public release link ${expectedPublicRelease}, got ${publicReleaseHref}.`,
    );
  }

  const manifestResponse = await page.request.get(
    `${baseUrl}/library/manifest.json`,
    { timeout: 120_000 },
  );
  const manifest = await manifestResponse.json();

  if (
    manifest.lessonCount !== expectedLessonCount ||
    manifest.lessons.length !== expectedLessonCount
  ) {
    throw new Error(
      `Expected ${expectedLessonCount} lessons, got ${manifest.lessonCount}.`,
    );
  }

  console.log('smoke: shared renderer');
  await page.getByTestId('start-drumroll-primary').click();

  try {
    await page.getByTestId('view-lessons').waitFor({ timeout: 120_000 });
  } catch (error) {
    const body = await page.locator('body').innerText();

    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n${errors.join(
        '\n',
      )}\n${body}`,
      { cause: error },
    );
  }

  await page.getByTestId('view-lessons').click();
  await page.getByTestId('lesson-item-01.01').waitFor({ timeout: 120_000 });
  await page.screenshot({
    path: path.join(shotDir, '02-lessons.png'),
    animations: 'disabled',
    timeout: 120_000,
  });

  console.log('smoke: direct app query');

  const directContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const directPage = await directContext.newPage();
  const directErrors = [];

  directPage.on('pageerror', (error) => directErrors.push(error.message));
  directPage.on('console', (message) => {
    if (message.type() === 'error') {
      directErrors.push(`${message.text()} @ ${message.location().url}`);
    }
  });

  try {
    const directResponse = await directPage.goto(`${baseUrl}/?app=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    if (!directResponse?.ok()) {
      throw new Error(
        `Direct app request failed: ${directResponse?.status()}.`,
      );
    }

    await directPage.getByTestId('view-lessons').waitFor({ timeout: 120_000 });

    if (await directPage.getByTestId('start-drumroll-primary').count()) {
      throw new Error('Direct ?app=1 boot left the marketing landing mounted.');
    }

    if (directErrors.length > 0) {
      throw new Error(`Direct app browser errors:\n${directErrors.join('\n')}`);
    }
  } finally {
    await directContext.close();
  }

  console.log('smoke: lesson');
  await page.getByTestId('lesson-item-01.01').click();
  await page.getByTestId('game-mode-practice').waitFor({ timeout: 120_000 });
  await page
    .getByTestId('game-mode-practice')
    .click({ force: true, timeout: 120_000 });
  await page
    .getByTestId('sheet-music-overlay')
    .waitFor({ state: 'attached', timeout: 120_000 });
  await page
    .getByTestId('flow-viewport-hud')
    .getByRole('heading', { name: /Lesson 01\.01/i })
    .waitFor({ timeout: 120_000 });
  await page
    .locator('.ant-spin-spinning')
    .last()
    .waitFor({ state: 'hidden', timeout: 120_000 });

  const svgCount = await page.locator('svg').count();

  if (svgCount < 2) {
    throw new Error('Lesson opened without rendered SVG notation.');
  }

  await page.screenshot({
    path: path.join(shotDir, '03-lesson-notation.png'),
    animations: 'disabled',
    timeout: 120_000,
  });

  if (errors.length > 0) {
    throw new Error(`Browser errors:\n${errors.join('\n')}`);
  }

  console.log(
    JSON.stringify({
      landing: true,
      lessonCount: manifest.lessonCount,
      firstLessonOpened: true,
      directApp: true,
      publicReleaseHref,
      notationSvgCount: svgCount,
      screenshots: shotDir,
    }),
  );
} finally {
  await browser.close();
}
