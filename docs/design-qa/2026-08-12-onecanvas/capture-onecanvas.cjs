/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = __dirname;
const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js');
const liveConfig = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'sight-kick',
  'config.json',
);
const beforeCaptures = [
  [
    path.join(
      repoRoot,
      'docs/design-qa/2026-08-11-kb9-home/00-before-home.png',
    ),
    path.join(outputDir, 'before-one-canvas-home.png'),
  ],
  [
    path.join(
      repoRoot,
      'docs/design-qa/2026-08-11-kb9-home/00-before-journey.png',
    ),
    path.join(outputDir, 'before-one-canvas-journey.png'),
  ],
  [
    path.join(
      repoRoot,
      'docs/design-qa/2026-08-11-kb11-simplify/01-home-colored-zones.png',
    ),
    path.join(outputDir, 'before-zone-geometry.png'),
  ],
];
const viewports = [
  { width: 1225, height: 768 },
  { width: 1024, height: 700 },
];

function copyBeforeCaptures() {
  beforeCaptures.forEach(([source, destination]) => {
    assert(fs.existsSync(source), `Missing before capture: ${source}`);
    fs.copyFileSync(source, destination);
  });
}

async function overflowProof(page, label) {
  return page.evaluate((captureLabel) => {
    const root = document.documentElement;
    const body = document.body;

    return {
      label: captureLabel,
      viewport: { width: innerWidth, height: innerHeight },
      root: {
        horizontal: root.scrollWidth > innerWidth + 1,
        vertical: root.scrollHeight > innerHeight + 1,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
      },
      body: {
        horizontal: body.scrollWidth > innerWidth + 1,
        vertical: body.scrollHeight > innerHeight + 1,
        scrollWidth: body.scrollWidth,
        scrollHeight: body.scrollHeight,
      },
    };
  }, label);
}

async function zoneProof(page) {
  return page.locator('[data-testid^="kit-hotspot-"]').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const head = element.querySelector('.kit-home__pad-head');
      const style = getComputedStyle(element);
      const headStyle = head ? getComputedStyle(head) : undefined;

      return {
        id: element.getAttribute('data-testid'),
        left: Number(rect.left.toFixed(1)),
        top: Number(rect.top.toFixed(1)),
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        transform: style.transform,
        color: element.getAttribute('data-color-lane'),
        depth: style.zIndex,
        visible: Number(headStyle?.opacity ?? '0') > 0,
      };
    }),
  );
}

async function captureHome(page, viewport, proof) {
  await page.setViewportSize(viewport);
  await page.getByTestId('view-home').click();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(180);

  const suffix = `${viewport.width}x${viewport.height}`;
  const homeProof = await overflowProof(page, `home-${suffix}`);

  await page.screenshot({
    path: path.join(outputDir, `after-one-canvas-home-${suffix}.png`),
    animations: 'disabled',
  });

  if (viewport.width === 1225) {
    await page.getByTestId('home-kit-stage').screenshot({
      path: path.join(outputDir, 'after-zone-geometry-closeup.png'),
      animations: 'disabled',
    });
  }

  proof.push(homeProof);
}

async function captureJourney(page, viewport, proof) {
  await page.setViewportSize(viewport);
  await page.getByTestId('view-lessons').click();
  await page.getByTestId('lesson-season-stage').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(180);

  const suffix = `${viewport.width}x${viewport.height}`;
  const journeyProof = await overflowProof(page, `journey-${suffix}`);

  await page.screenshot({
    path: path.join(outputDir, `after-one-canvas-journey-${suffix}.png`),
    animations: 'disabled',
  });

  if (viewport.width === 1225) {
    const visibleNodes = page.locator('[data-in-journey-viewport="true"]');
    const nodeCount = await visibleNodes.count();

    assert(nodeCount > 0, 'Journey has no visible lesson node to inspect');

    const targetNode = visibleNodes.first();
    const before = await targetNode.evaluate((node) => ({
      action: node.getAttribute('data-action'),
      transform: getComputedStyle(node).transform,
    }));

    await targetNode.hover();
    await page.waitForTimeout(180);

    const after = await targetNode.evaluate((node) => {
      const status = node.querySelector('.daybreak-node-status');
      const plaque = node.querySelector('.daybreak-lesson-node__plaque');

      return {
        transform: getComputedStyle(node).transform,
        actionHint: status
          ? getComputedStyle(status, '::after').content
          : 'missing',
        actionHintWidth: status
          ? getComputedStyle(status, '::after').width
          : '0px',
        plaqueBorder: plaque ? getComputedStyle(plaque).borderLeftColor : '',
      };
    });

    assert.equal(
      after.transform,
      before.transform,
      'Journey hover moved the node instead of clarifying its action',
    );
    assert.notEqual(
      after.actionHintWidth,
      '0px',
      'Journey hover hid its action',
    );

    await page.screenshot({
      path: path.join(outputDir, 'after-journey-hover.png'),
      animations: 'allow',
    });

    proof.push({ label: 'journey-hover', before, after });
  }

  proof.push(journeyProof);
}

async function refreshJourneyLibrary(page) {
  await page.getByTestId('settings-trigger').click();
  await page.getByTestId('rescan-folder').click();
  await page.getByTestId('scan-progress').waitFor({ timeout: 30_000 });
  await page
    .getByTestId('scan-progress')
    .waitFor({ state: 'detached', timeout: 120_000 });
  await page.keyboard.press('Escape');
  await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  copyBeforeCaptures();

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-onecanvas-'),
  );

  if (fs.existsSync(liveConfig)) {
    fs.copyFileSync(liveConfig, path.join(userDataDir, 'config.json'));
  }

  const consoleErrors = [];
  const pageErrors = [];
  const proof = [];
  const app = await electron.launch({
    args: [mainEntry, '--mute-audio'],
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

    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await refreshJourneyLibrary(page);

    for (const viewport of viewports) {
      await captureHome(page, viewport, proof);
      await captureJourney(page, viewport, proof);
    }

    await page.setViewportSize(viewports[0]);
    await page.getByTestId('view-home').click();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 30_000 });

    const zones = await zoneProof(page);
    const overflowFailures = proof.filter(
      (entry) =>
        entry.root &&
        (entry.root.horizontal ||
          entry.root.vertical ||
          entry.body.horizontal ||
          entry.body.vertical),
    );

    assert.equal(zones.length, 8, 'Expected eight calibrated kit zones');
    assert(
      zones.every((zone) => zone.visible),
      'A calibrated zone is hidden',
    );
    assert.equal(overflowFailures.length, 0, 'Outer-page overflow detected');
    assert.equal(consoleErrors.length, 0, 'Renderer emitted console errors');
    assert.equal(pageErrors.length, 0, 'Renderer emitted page errors');

    fs.writeFileSync(
      path.join(outputDir, 'proof.json'),
      `${JSON.stringify(
        { viewports, zones, proof, consoleErrors, pageErrors },
        null,
        2,
      )}\n`,
    );
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
