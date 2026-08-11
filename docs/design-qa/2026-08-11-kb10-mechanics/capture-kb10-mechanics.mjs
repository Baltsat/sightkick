import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, chromium } from '@playwright/test';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(outputDir, '../../..');
const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js');
const liveConfig = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'sight-kick',
  'config.json',
);
const storybookRoot =
  process.env.KB10_STORYBOOK_URL ?? 'http://127.0.0.1:6010/';
const chromePath =
  process.env.KB10_CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewports = [
  { name: '1224x768', width: 1224, height: 768 },
  { name: '1024x700', width: 1024, height: 700 },
];

function output(name) {
  return path.join(outputDir, name);
}

function requireTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function storyUrl(id) {
  return new URL(`iframe.html?id=${id}&viewMode=story`, storybookRoot).href;
}

function prepareFixture(userDataDir) {
  requireTrue(fs.existsSync(liveConfig), `Missing live config: ${liveConfig}`);

  const config = JSON.parse(fs.readFileSync(liveConfig, 'utf8'));
  const songs = Object.values(config.songs ?? {});
  const favourite = songs.find(
    (song) =>
      song &&
      typeof song === 'object' &&
      typeof song.id === 'string' &&
      !song.id.startsWith('lesson:'),
  );

  requireTrue(
    favourite,
    'No favourite-song candidate found in the live library',
  );

  config.goals = [
    {
      id: 'kb10-september-goal',
      songId: favourite.id,
      difficulty: 'expert',
      targetDate: '2026-09-10',
      createdAt: '2026-08-11T12:00:00.000Z',
      isPrimary: true,
    },
  ];
  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );

  return { id: favourite.id, name: favourite.name };
}

async function layoutProof(page, label, selector) {
  return page.evaluate(
    ({ currentLabel, targetSelector }) => {
      const root = document.documentElement;
      const body = document.body;
      const target = document.querySelector(targetSelector);
      const rect = target?.getBoundingClientRect();

      return {
        label: currentLabel,
        viewport: { width: innerWidth, height: innerHeight },
        outerScroll: {
          document: {
            horizontal: root.scrollWidth > innerWidth + 1,
            vertical: root.scrollHeight > innerHeight + 1,
          },
          body: {
            horizontal: body.scrollWidth > innerWidth + 1,
            vertical: body.scrollHeight > innerHeight + 1,
          },
        },
        target: target
          ? {
              visible:
                Boolean(rect) && rect.top < innerHeight && rect.bottom > 0,
              clientHeight: target.clientHeight,
              scrollHeight: target.scrollHeight,
              ownScroll: target.scrollHeight > target.clientHeight + 1,
            }
          : null,
      };
    },
    { currentLabel: label, targetSelector: selector },
  );
}

function assertNoOuterScroll(proof) {
  requireTrue(
    !proof.outerScroll.document.horizontal &&
      !proof.outerScroll.document.vertical &&
      !proof.outerScroll.body.horizontal &&
      !proof.outerScroll.body.vertical,
    `Outer scroll detected: ${JSON.stringify(proof)}`,
  );
}

async function screenshot(page, name, viewport, selector) {
  await page.setViewportSize(viewport);
  await page.locator(selector).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: output(`${name}-${viewport.name}.png`),
    animations: 'disabled',
  });

  const proof = await layoutProof(page, `${name}-${viewport.name}`, selector);

  assertNoOuterScroll(proof);

  return proof;
}

async function captureElectron() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drumroll-kb10-'));
  const consoleErrors = [];
  const pageErrors = [];
  const proofs = [];
  let app;

  try {
    const favourite = prepareFixture(userDataDir);

    app = await electron.launch({
      args: [mainEntry, '--mute-audio'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        START_MINIMIZED: '1',
        SK_USER_DATA_DIR: userDataDir,
      },
    });

    const page = await app.firstWindow();

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    await page.setViewportSize(viewports[0]);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await page
      .getByTestId('home-session-contract')
      .waitFor({ timeout: 60_000 });
    await page.getByTestId('home-goal-runway').waitFor({ timeout: 60_000 });

    const contract = await page
      .getByTestId('home-session-contract')
      .innerText();
    const runway = await page.getByTestId('home-goal-runway').innerText();
    const payoff = await page.getByTestId('home-session-payoff').innerText();

    requireTrue(
      /focus/i.test(contract) &&
        /build/i.test(contract) &&
        /payoff/i.test(contract),
      `Session contract is incomplete: ${contract}`,
    );
    requireTrue(
      /september 10 runway/i.test(runway),
      `September runway is missing: ${runway}`,
    );
    requireTrue(
      payoff.includes(favourite.name),
      `Primary goal does not control payoff: ${payoff}`,
    );
    proofs.push(
      await screenshot(
        page,
        'home-full',
        viewports[0],
        '[data-testid="home-cockpit"]',
      ),
    );

    await page.getByTestId('home-session-size-short').click();
    requireTrue(
      (await page
        .getByTestId('home-session-size-short')
        .getAttribute('aria-pressed')) === 'true',
      'Short session selection did not arm',
    );
    proofs.push(
      await screenshot(
        page,
        'home-short',
        viewports[0],
        '[data-testid="home-cockpit"]',
      ),
    );
    proofs.push(
      await screenshot(
        page,
        'home-short',
        viewports[1],
        '[data-testid="home-cockpit"]',
      ),
    );

    await page.getByTestId('open-profile-button').click();
    await page.getByTestId('profile-view').waitFor({ timeout: 60_000 });
    await page
      .getByTestId('profile-deadline-targets')
      .waitFor({ timeout: 60_000 });
    await page.getByTestId('profile-deadline-targets').scrollIntoViewIfNeeded();
    proofs.push(
      await screenshot(
        page,
        'profile-runway',
        viewports[0],
        '[data-testid="profile-view"]',
      ),
    );
    await page.getByTestId('profile-deadline-targets').scrollIntoViewIfNeeded();
    proofs.push(
      await screenshot(
        page,
        'profile-runway',
        viewports[1],
        '[data-testid="profile-view"]',
      ),
    );

    requireTrue(
      consoleErrors.length === 0 && pageErrors.length === 0,
      `Electron runtime errors: ${JSON.stringify({
        consoleErrors,
        pageErrors,
      })}`,
    );

    return { favourite, proofs, consoleErrors, pageErrors };
  } finally {
    if (app) {
      await app.close();
    }

    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function captureStorybook() {
  const consoleErrors = [];
  const pageErrors = [];
  const proofs = [];
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  const page = await browser.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();

      if (
        location.url.endsWith('/favicon.ico') &&
        message.text().includes('status of 404')
      ) {
        return;
      }

      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    const captures = [
      {
        name: 'score-musical-receipt',
        url: storyUrl('song-view-score-summary--musical-receipt'),
        selector: '[data-testid="score-modal"]',
        settle: async () => {
          await page
            .getByTestId('musical-receipt')
            .waitFor({ timeout: 60_000 });
          await page
            .getByTestId('gamification-summary')
            .waitFor({ timeout: 60_000 });
        },
      },
      {
        name: 'score-supporting-proof',
        url: storyUrl('song-view-score-summary--musical-receipt'),
        selector: '[data-testid="score-modal"]',
        settle: async () => {
          await page
            .getByTestId('gamification-summary')
            .scrollIntoViewIfNeeded();
        },
      },
      {
        name: 'profile-story-runway',
        url: storyUrl('insights-profile-view--evidence-backed-route'),
        selector: '[data-testid="profile-view"]',
        settle: async () => {
          await page
            .getByTestId('profile-deadline-targets')
            .scrollIntoViewIfNeeded();
        },
      },
      {
        name: 'achievement-proof-order',
        url: storyUrl(
          'engagement-mechanics-practice-stats--musical-proof-order',
        ),
        selector: '[data-testid="stats-panel"]',
        settle: async () => {
          await page
            .getByTestId('achievement-archive')
            .locator('summary')
            .click();
          await page
            .getByTestId('achievement-archive')
            .scrollIntoViewIfNeeded();
        },
      },
    ];

    for (const capture of captures) {
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto(capture.url, { waitUntil: 'networkidle' });
        await page.locator(capture.selector).waitFor({ timeout: 60_000 });
        await capture.settle();
        proofs.push(
          await screenshot(page, capture.name, viewport, capture.selector),
        );
      }
    }

    requireTrue(
      consoleErrors.length === 0 && pageErrors.length === 0,
      `Storybook runtime errors: ${JSON.stringify({
        consoleErrors,
        pageErrors,
      })}`,
    );

    return { proofs, consoleErrors, pageErrors };
  } finally {
    await browser.close();
  }
}

fs.mkdirSync(outputDir, { recursive: true });

let failure;
let electronProof;
let storybookProof;

try {
  electronProof = await captureElectron();
  storybookProof = await captureStorybook();
} catch (error) {
  failure = String(error.stack ?? error);

  throw error;
} finally {
  fs.writeFileSync(
    output('proof.json'),
    `${JSON.stringify(
      {
        source:
          'current Electron production build plus Storybook component fixtures',
        supportedViewports: viewports,
        electron: electronProof,
        storybook: storybookProof,
        failure,
      },
      null,
      2,
    )}\n`,
  );
}
