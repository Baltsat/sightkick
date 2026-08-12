import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(outputDir, '../../..');
const baseline = path.join(
  repoRoot,
  'docs/design-qa/2026-08-11-kb8-final/06-installed-profile-radar.png',
);
const storyUrl = new URL(
  'iframe.html?id=insights-profile-view--evidence-backed-route&viewMode=story',
  process.env.PROFILE_STORYBOOK_URL ?? 'http://127.0.0.1:6010/',
).href;
const viewports = [
  { name: '1224x768', width: 1224, height: 768 },
  { name: '1024x700', width: 1024, height: 700 },
];
const chromePath =
  process.env.PROFILE_CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function output(name) {
  return path.join(outputDir, name);
}

function imageDataUrl(name) {
  return `data:image/png;base64,${fs
    .readFileSync(output(name))
    .toString('base64')}`;
}

function writeComparison() {
  fs.writeFileSync(
    output('before-after.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Drumroll insights evidence surface</title>
    <style>
      :root { color: #171722; background: #f3eee4; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      body { margin: 0; padding: 32px; }
      h1 { margin: 0; font: 700 30px/1.1 Georgia, serif; }
      p { max-width: 76ch; color: #534d46; line-height: 1.5; }
      section { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 24px; }
      figure { margin: 0; padding: 10px; border: 1px solid #d8d0c4; background: #fffdf8; }
      figcaption { margin-bottom: 8px; color: #6b6258; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      img { display: block; width: 100%; height: auto; }
    </style>
  </head>
  <body>
    <h1>profile → insights evidence surface</h1>
    <p>the KB8 drawer is retained as the supplied baseline. the current capture renders the full-height insights component with primary action, atomic skill spine, review queue, weekly target, and a closed evidence archive.</p>
    <section>
      <figure><figcaption>KB8 baseline drawer</figcaption><img src="before-kb8-profile-drawer.png" alt="KB8 profile drawer"></figure>
      <figure><figcaption>current insights route fixture</figcaption><img src="insights-primary-1224x768.png" alt="current insights route fixture"></figure>
    </section>
  </body>
</html>
`,
  );
}

function inspect(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const profile = document.querySelector('[data-testid="profile-view"]');
    const hero = document.querySelector(
      '[data-testid="profile-insights-hero"]',
    );
    const archive = document.querySelector(
      '[data-testid="profile-evidence-history"]',
    );
    const radar = document.querySelector(
      '[data-testid="atomic-radar-disclosure"]',
    );

    return {
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
      profile: profile
        ? {
            clientHeight: profile.clientHeight,
            scrollHeight: profile.scrollHeight,
            ownScroll: profile.scrollHeight > profile.clientHeight + 1,
          }
        : null,
      heroVisible: hero instanceof HTMLElement && hero.offsetParent !== null,
      archiveClosed: archive instanceof HTMLDetailsElement && !archive.open,
      radarClosed: radar instanceof HTMLDetailsElement && !radar.open,
    };
  });
}

function assertPrimaryProof(proof) {
  const outer = proof.outerScroll;

  if (
    outer.document.horizontal ||
    outer.document.vertical ||
    outer.body.horizontal ||
    outer.body.vertical ||
    !proof.profile ||
    !proof.profile.ownScroll ||
    !proof.heroVisible ||
    !proof.archiveClosed ||
    !proof.radarClosed
  ) {
    throw new Error(`Profile visual proof failed: ${JSON.stringify(proof)}`);
  }
}

async function capturePrimary(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(storyUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('profile-view').waitFor();
  await page.getByTestId('profile-insights-hero').waitFor();

  const proof = await inspect(page);

  assertPrimaryProof(proof);
  await page.screenshot({
    path: output(`insights-primary-${viewport.width}x${viewport.height}.png`),
    animations: 'disabled',
  });

  return proof;
}

async function captureEvidence(page) {
  await page.setViewportSize(viewports[0]);
  await page.goto(storyUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('profile-view').waitFor();
  await page
    .getByTestId('profile-evidence-history')
    .locator(':scope > summary')
    .click();
  await page.getByTestId('learning-evidence-receipt').waitFor();
  await page.getByTestId('atomic-radar-disclosure').locator('summary').click();
  await page.getByTestId('atomic-skill-radar').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: output('insights-evidence-1224x768.png'),
    animations: 'disabled',
  });

  return page.evaluate(() => {
    const evidence = document.querySelector(
      '[data-testid="learning-evidence-receipt"]',
    );
    const rect = evidence?.getBoundingClientRect();

    return {
      evidenceVisible:
        Boolean(rect) && rect.top < innerHeight && rect.bottom > 0,
      radarOpen:
        document
          .querySelector('[data-testid="atomic-radar-disclosure"]')
          ?.hasAttribute('open') ?? false,
    };
  });
}

const browser = await chromium.launch({
  headless: true,
  ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
});
const page = await browser.newPage();
const consoleErrors = [];
const ignoredConsoleErrors = [];
const pageErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') {
    const issue = { text: message.text(), location: message.location() };

    if (
      issue.location.url.endsWith('/favicon.ico') &&
      issue.text.includes('status of 404')
    ) {
      ignoredConsoleErrors.push(issue);

      return;
    }

    consoleErrors.push(issue);
  }
});
page.on('pageerror', (error) => pageErrors.push(String(error)));

try {
  if (!fs.existsSync(baseline)) {
    throw new Error(`Missing KB8 profile baseline: ${baseline}`);
  }

  fs.copyFileSync(baseline, output('before-kb8-profile-drawer.png'));

  const primary = [];

  for (const viewport of viewports) {
    primary.push(await capturePrimary(page, viewport));
  }

  const evidence = await captureEvidence(page);

  if (!evidence.evidenceVisible || !evidence.radarOpen) {
    throw new Error(`Evidence capture failed: ${JSON.stringify(evidence)}`);
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(
      `Profile story runtime errors: ${JSON.stringify({
        consoleErrors,
        pageErrors,
      })}`,
    );
  }

  writeComparison();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.setContent(
    fs
      .readFileSync(output('before-after.html'), 'utf8')
      .replace(
        'before-kb8-profile-drawer.png',
        imageDataUrl('before-kb8-profile-drawer.png'),
      )
      .replace(
        'insights-primary-1224x768.png',
        imageDataUrl('insights-primary-1224x768.png'),
      ),
  );
  await page.screenshot({
    path: output('before-after.png'),
    fullPage: true,
  });
  fs.writeFileSync(
    output('proof.json'),
    `${JSON.stringify(
      {
        source: storyUrl,
        baseline:
          'docs/design-qa/2026-08-11-kb8-final/06-installed-profile-radar.png',
        primary,
        evidence,
        consoleErrors,
        ignoredConsoleErrors,
        pageErrors,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
}
