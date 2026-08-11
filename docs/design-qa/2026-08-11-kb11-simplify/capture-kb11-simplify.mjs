import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const storybookRoot =
  process.env.KB11_STORYBOOK_URL ?? 'http://127.0.0.1:6011/';
const chromePath =
  process.env.KB11_CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewport = { width: 1224, height: 768 };
const consoleErrors = [];
const pageErrors = [];

function output(name) {
  return path.join(outputDir, name);
}

function storyUrl(id) {
  return new URL(`iframe.html?id=${id}&viewMode=story`, storybookRoot).href;
}

function verify(condition, message) {
  assert(condition, message);
}

async function captureHome(page) {
  await page.goto(storyUrl('home-cockpit-evidence-cards--p-1-evidence-cards'), {
    waitUntil: 'networkidle',
  });
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
  await page.getByTestId('home-session-summary').waitFor({ timeout: 60_000 });

  const zones = await page
    .locator('[data-testid^="kit-hotspot-"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const head = element.querySelector('.kit-home__pad-head');
        const headStyle = head ? getComputedStyle(head) : undefined;

        return {
          color: element.getAttribute('data-color-lane'),
          label: element.getAttribute('aria-label'),
          opacity: headStyle?.opacity,
          background: headStyle?.backgroundImage,
          border: headStyle?.borderTopColor,
        };
      }),
    );

  verify(
    zones.length === 8,
    `Expected 8 interactive zones, got ${zones.length}`,
  );
  verify(
    new Set(zones.map((zone) => zone.color)).size === 5,
    `Expected the five notation colors, got ${JSON.stringify(zones)}`,
  );
  zones.forEach((zone) => {
    verify(
      Number(zone.opacity) > 0 && zone.background !== 'none',
      `Zone is not visibly colored: ${JSON.stringify(zone)}`,
    );
    verify(
      Boolean(zone.label),
      `Zone has no accessible action: ${JSON.stringify(zone)}`,
    );
  });

  await page.screenshot({
    path: output('01-home-colored-zones.png'),
    animations: 'disabled',
  });

  const snare = page.getByTestId('kit-hotspot-snare');

  await snare.hover();
  await page.waitForTimeout(200);

  const snareHover = await snare
    .locator('.kit-home__pad-head')
    .evaluate((head) => {
      const style = getComputedStyle(head);

      return {
        opacity: style.opacity,
        transform: style.transform,
        boxShadow: style.boxShadow,
      };
    });

  verify(
    Number(snareHover.opacity) === 1 && snareHover.boxShadow !== 'none',
    `Snare hover affordance is absent: ${JSON.stringify(snareHover)}`,
  );
  await page.locator('[data-testid="home-session-summary"]').screenshot({
    path: output('02-home-simplified-shelf.png'),
    animations: 'disabled',
  });

  const homeText = await page.getByTestId('home-cockpit').innerText();

  ['atomic evidence', 'progression is claimed', 'scored phrase'].forEach(
    (forbidden) =>
      verify(
        !homeText.toLowerCase().includes(forbidden),
        `Home still exposes ${forbidden}`,
      ),
  );

  return { zones, snareHover };
}

async function captureProfile(page) {
  await page.goto(storyUrl('insights-profile-view--evidence-backed-route'), {
    waitUntil: 'networkidle',
  });
  await page.getByTestId('profile-view').waitFor({ timeout: 60_000 });
  await page.getByTestId('profile-plan-details').waitFor({ timeout: 60_000 });

  const profilePlan = page.getByTestId('profile-plan-details');
  const planState = await profilePlan.evaluate((details) => ({
    open: details.open,
    summary: details.querySelector('summary')?.textContent?.trim(),
  }));

  verify(
    !planState.open && planState.summary === 'Practice plan',
    `Profile detail is not quietly disclosed: ${JSON.stringify(planState)}`,
  );
  await page.screenshot({
    path: output('03-profile-simplified.png'),
    animations: 'disabled',
  });

  return planState;
}

fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
});
const page = await browser.newPage({ viewport });

page.on('console', (message) => {
  const location = message.location();

  if (message.type() === 'error' && !location.url.endsWith('/favicon.ico')) {
    consoleErrors.push({ text: message.text(), location });
  }
});
page.on('pageerror', (error) => pageErrors.push(String(error)));

let home;
let profile;
let failure;

try {
  home = await captureHome(page);
  profile = await captureProfile(page);
  verify(
    consoleErrors.length === 0 && pageErrors.length === 0,
    `Runtime errors: ${JSON.stringify({ consoleErrors, pageErrors })}`,
  );
} catch (error) {
  failure = String(error.stack ?? error);

  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(
    output('proof.json'),
    `${JSON.stringify(
      {
        source: 'local Storybook component fixtures',
        viewport,
        home,
        profile,
        consoleErrors,
        pageErrors,
        failure,
      },
      null,
      2,
    )}\n`,
  );
}
