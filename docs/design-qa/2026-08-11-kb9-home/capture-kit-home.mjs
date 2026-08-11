import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(outputDir, '../../..');
const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js');
const composerCapture = process.argv.includes('--composer');
const liveConfig = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'sight-kick',
  'config.json',
);
const beforeSources = {
  home: path.join(
    repoRoot,
    'docs',
    'design-qa',
    '2026-08-11-kb8-final',
    '01-installed-home.png',
  ),
  journey: path.join(
    repoRoot,
    'docs',
    'design-qa',
    '2026-08-11-kb8-final',
    '02-installed-journey.png',
  ),
};

function layoutProof(label) {
  return (page) =>
    page.evaluate((stateLabel) => {
      const root = document.documentElement;
      const body = document.body;
      const content = document.querySelector('.arena-shell__content');
      const home = document.querySelector('[data-testid="home-cockpit"]');
      const journey = document.querySelector(
        '[data-testid="lesson-season-stage"]',
      );
      const manifest = document.querySelector('.journey-manifest');
      const rail = document.querySelector('[data-testid="lesson-season-rail"]');
      const nextAction = document.querySelector(
        '[data-testid="lesson-continue-card"] .ant-btn',
      );
      const controls = document.querySelector(
        '[data-testid="journey-kit-controls"]',
      );
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const fitsContent = (element) => {
        if (
          !(element instanceof HTMLElement) ||
          !(content instanceof HTMLElement)
        ) {
          return false;
        }

        const elementRect = element.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();

        return (
          elementRect.left >= contentRect.left - 1 &&
          elementRect.right <= contentRect.right + 1 &&
          elementRect.top >= contentRect.top - 1 &&
          elementRect.bottom <= contentRect.bottom + 1
        );
      };

      return {
        label: stateLabel,
        viewport: { width: innerWidth, height: innerHeight },
        document: {
          width: root.scrollWidth,
          height: root.scrollHeight,
          horizontalOverflow: root.scrollWidth > innerWidth + 1,
          verticalOverflow: root.scrollHeight > innerHeight + 1,
        },
        body: {
          width: body.scrollWidth,
          height: body.scrollHeight,
          horizontalOverflow: body.scrollWidth > innerWidth + 1,
          verticalOverflow: body.scrollHeight > innerHeight + 1,
        },
        home: home
          ? {
              visible: visible(home),
              fitsContent: fitsContent(home),
              text: (home.textContent ?? '').replace(/\s+/g, ' ').trim(),
            }
          : null,
        journey: journey
          ? {
              visible: visible(journey),
              manifestFitsContent: fitsContent(manifest),
              railFitsContent: fitsContent(rail),
              stageFitsContent: fitsContent(journey),
              controlsVisible: visible(controls),
              nextActionVisible: visible(nextAction),
            }
          : null,
      };
    }, label);
}

async function capture(page, name, viewport, readyTestId) {
  await page.setViewportSize(viewport);
  await page.getByTestId(readyTestId).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(
      outputDir,
      `${name}${composerCapture ? '-composer' : ''}.png`,
    ),
    animations: 'disabled',
  });

  return layoutProof(`${name}${composerCapture ? '-composer' : ''}`)(page);
}

function assertNoOuterScroll(proofs) {
  const failing = proofs.filter(
    (proof) =>
      proof.document.horizontalOverflow ||
      proof.document.verticalOverflow ||
      proof.body.horizontalOverflow ||
      proof.body.verticalOverflow ||
      (proof.home && !proof.home.fitsContent) ||
      (proof.journey &&
        (!proof.journey.manifestFitsContent ||
          !proof.journey.railFitsContent ||
          !proof.journey.stageFitsContent ||
          !proof.journey.nextActionVisible)),
  );

  if (failing.length > 0) {
    throw new Error(
      `Outer page scroll: ${failing.map((proof) => proof.label).join(', ')}`,
    );
  }
}

async function run() {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-kb9-home-'),
  );
  const consoleErrors = [];
  const pageErrors = [];
  const proofs = [];

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(
    beforeSources.home,
    path.join(outputDir, '00-before-home.png'),
  );
  fs.copyFileSync(
    beforeSources.journey,
    path.join(outputDir, '00-before-journey.png'),
  );
  fs.copyFileSync(liveConfig, path.join(userDataDir, 'config.json'));

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

    proofs.push(
      await capture(
        page,
        '01-after-home-1225x768',
        { width: 1225, height: 768 },
        'home-cockpit',
      ),
    );

    if (composerCapture) {
      await page.getByTestId('home-intent-songs').click();
      proofs.push(
        await capture(
          page,
          '02-after-home-songs-1225x768',
          { width: 1225, height: 768 },
          'home-cockpit',
        ),
      );
      proofs.push(
        await capture(
          page,
          '03-after-home-songs-1024x700',
          { width: 1024, height: 700 },
          'home-cockpit',
        ),
      );

      assertNoOuterScroll(proofs);
      fs.writeFileSync(
        path.join(outputDir, 'proof-composer.json'),
        `${JSON.stringify(
          {
            beforeSources,
            proofs,
            consoleErrors,
            pageErrors,
          },
          null,
          2,
        )}\n`,
      );

      return;
    }

    await page.getByTestId('view-lessons').click();
    proofs.push(
      await capture(
        page,
        '02-after-journey-1225x768',
        { width: 1225, height: 768 },
        'lesson-season-stage',
      ),
    );

    await page
      .locator('[data-testid="journey-controls-toggle"]:visible')
      .click();
    proofs.push(
      await capture(
        page,
        '03-after-journey-controls-1225x768',
        { width: 1225, height: 768 },
        'lesson-season-stage',
      ),
    );

    await page.getByTestId('view-home').click();
    proofs.push(
      await capture(
        page,
        '04-after-home-1024x700',
        { width: 1024, height: 700 },
        'home-cockpit',
      ),
    );

    await page.getByTestId('view-lessons').click();
    proofs.push(
      await capture(
        page,
        '05-after-journey-1024x700',
        { width: 1024, height: 700 },
        'lesson-season-stage',
      ),
    );

    assertNoOuterScroll(proofs);
    fs.writeFileSync(
      path.join(outputDir, 'proof.json'),
      `${JSON.stringify(
        {
          beforeSources,
          proofs,
          consoleErrors,
          pageErrors,
        },
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
