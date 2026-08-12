import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(outputDir, '../../..');
const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js');
const fixtureConfig = path.join(
  repoRoot,
  '.userdata',
  'final-qa',
  'config.json',
);
const proofSongId = 'song:kb9-songs-mode-proof';
const proofSongName = 'Songs Intent – Composed Launch';
const viewport = { width: 1224, height: 768 };

function output(name) {
  return path.join(outputDir, name);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function addSongsIntentFixture(userDataDir) {
  const config = JSON.parse(fs.readFileSync(fixtureConfig, 'utf8'));
  const source = Object.values(config.songs)[0];

  assert(source, 'The final QA fixture has no playable source song');

  const proofSong = {
    ...source,
    id: proofSongId,
    name: proofSongName,
    artist: 'Drumroll QA',
    album: 'KB9 integration proof',
    genre: 'Practice song',
    charter: 'Drumroll QA',
    auto_chart: 'False',
  };

  Object.keys(proofSong)
    .filter((key) => key.startsWith('sk_'))
    .forEach((key) => delete proofSong[key]);

  config.songs[proofSongId] = proofSong;
  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

async function clickTestId(page, testId) {
  const locator = page.getByTestId(testId);

  await locator.waitFor({ timeout: 60_000 });
  assert(
    (await locator.count()) === 1,
    `Expected one ${testId} control before click`,
  );
  await locator.click();
}

async function setKeyboardFixture(page) {
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
          hihat: ['keyboard:KeyH'],
          ride: ['keyboard:KeyR'],
          crash: ['keyboard:KeyC'],
          snare: ['keyboard:KeyJ'],
          tom1: ['keyboard:KeyT'],
          tom2: ['keyboard:KeyY'],
          tom3: ['keyboard:KeyU'],
          kick: ['keyboard:KeyK'],
        },
      }),
    );
    localStorage.setItem('settings.controlMappings', '{}');
    localStorage.setItem('settings.countIn', 'false');
    localStorage.setItem('settings.practiceNotationLayout', 'flow');
  });
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function captureInsights(page) {
  await clickTestId(page, 'open-profile-button');
  await page.getByTestId('profile-view').waitFor({ timeout: 60_000 });
  await page.getByTestId('profile-insights-hero').waitFor({ timeout: 60_000 });

  const proof = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const profile = document.querySelector('[data-testid="profile-view"]');
    const hero = document.querySelector(
      '[data-testid="profile-insights-hero"]',
    );

    return {
      profileRoute: Boolean(profile),
      heroVisible: hero instanceof HTMLElement && hero.offsetParent !== null,
      drawerPresent: Boolean(document.querySelector('.ant-drawer')),
      outerScroll: {
        document: root.scrollHeight > innerHeight + 1,
        body: body.scrollHeight > innerHeight + 1,
      },
      profileOwnScroll:
        profile instanceof HTMLElement &&
        profile.scrollHeight > profile.clientHeight + 1,
      activeView: document.querySelector('.arena-shell__eyebrow span')
        ?.textContent,
    };
  });

  assert(
    proof.profileRoute,
    'The profile control did not mount the insights route',
  );
  assert(proof.heroVisible, 'The insights hero was not visible');
  assert(!proof.drawerPresent, 'The retired profile drawer is still mounted');
  assert(!proof.outerScroll.document, 'Insights introduced document scrolling');
  assert(!proof.outerScroll.body, 'Insights introduced body scrolling');
  assert(proof.activeView === 'Insights', 'The shell did not enter Insights');
  await page.screenshot({
    path: output('01-insights-from-shell.png'),
    animations: 'disabled',
  });

  return proof;
}

async function captureSongsModePadLaunch(page) {
  await clickTestId(page, 'view-home');
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
  await clickTestId(page, 'home-intent-songs');

  const prepared = await page.evaluate(() => {
    const manifest = document.querySelector(
      '[data-testid="home-session-manifest"]',
    );
    const target = document.getElementById('home-cockpit-title')?.textContent;
    const kick = document.querySelector('[data-testid="kit-hotspot-kick"]');

    return {
      intent: manifest?.getAttribute('data-intent'),
      target: target?.trim(),
      targetMeta: document
        .querySelector('.kit-home__target-meta')
        ?.textContent?.trim(),
      kickLabel: kick?.getAttribute('aria-label'),
    };
  });

  assert(
    prepared.intent === 'songs',
    'Songs intent did not arm the home session',
  );
  assert(
    prepared.target === proofSongName,
    `Songs intent armed ${
      prepared.target ?? 'no target'
    } instead of ${proofSongName}`,
  );
  assert(
    prepared.kickLabel?.includes(proofSongName),
    'The armed pad did not name the composed songs target',
  );

  const expectedSpeed = prepared.targetMeta?.match(/· ([0-9.]+)×/)?.[1];

  assert(expectedSpeed, 'The composed session did not expose a launch speed');
  await clickTestId(page, 'kit-hotspot-kick');
  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page.locator('.drumroll-practice-shell').waitFor({ timeout: 60_000 });

  const launched = await page.evaluate(() => {
    const hud = document.querySelector('[data-testid="flow-viewport-hud"]');
    const indicator = document.querySelector(
      '[data-testid="practice-mode-indicator"]',
    );

    return {
      practiceMode: hud?.getAttribute('data-mode'),
      speed: indicator?.getAttribute('data-speed'),
      title: document
        .querySelector('.drumroll-flow-hud__title')
        ?.textContent?.trim(),
      phase: document
        .querySelector('.drumroll-practice-shell')
        ?.getAttribute('data-session-phase'),
    };
  });

  assert(
    launched.practiceMode === 'practice',
    'Pad launch did not enter Practice',
  );
  assert(
    launched.speed === expectedSpeed,
    `Pad launch ran at ${
      launched.speed ?? 'no speed'
    } instead of ${expectedSpeed}`,
  );
  assert(
    launched.title === proofSongName,
    `Practice surface opened ${
      launched.title ?? 'no title'
    } instead of ${proofSongName}`,
  );
  await page.screenshot({
    path: output('02-songs-mode-pad-launch.png'),
    animations: 'disabled',
  });

  return { prepared, launched };
}

async function run() {
  assert(fs.existsSync(mainEntry), 'Production build output is missing');
  assert(fs.existsSync(fixtureConfig), 'The final QA fixture is missing');
  fs.mkdirSync(outputDir, { recursive: true });

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-kb9-integration-'),
  );
  const consoleErrors = [];
  const pageErrors = [];
  let app;

  try {
    addSongsIntentFixture(userDataDir);
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

    await page.setViewportSize(viewport);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await setKeyboardFixture(page);

    const insights = await captureInsights(page);
    const songsModePadLaunch = await captureSongsModePadLaunch(page);

    assert(
      consoleErrors.length === 0,
      `Renderer console errors: ${JSON.stringify(consoleErrors)}`,
    );
    assert(
      pageErrors.length === 0,
      `Renderer page errors: ${JSON.stringify(pageErrors)}`,
    );
    fs.writeFileSync(
      output('proof.json'),
      `${JSON.stringify(
        {
          source: 'current production Electron build',
          viewport,
          fixture: {
            base: '.userdata/final-qa/config.json',
            addedSongsIntentCandidate: {
              id: proofSongId,
              name: proofSongName,
              source:
                'copy of the local Lesson 01.01 chart and audio with lesson metadata removed',
            },
          },
          insights,
          songsModePadLaunch,
          consoleErrors,
          pageErrors,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await app?.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

await run();
