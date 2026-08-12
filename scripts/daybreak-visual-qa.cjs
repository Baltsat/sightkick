/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('@playwright/test');
const REPO_ROOT = path.resolve(__dirname, '..');
const MAIN_ENTRY = path.join(REPO_ROOT, 'out', 'main', 'index.js');
const LIVE_CONFIG = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'sight-kick',
  'config.json',
);

async function waitForCurrentSong(page) {
  await page.waitForFunction(() => {
    const title = document.querySelector('#home-cockpit-title');

    return Boolean(title?.textContent?.trim());
  });
}

async function sampleAnimationFrames(page, durationMs = 2000) {
  return page.evaluate(
    (sampleDuration) =>
      new Promise((resolve) => {
        let frameCount = 0;
        const startedAt = performance.now();

        function nextFrame(timestamp) {
          frameCount += 1;

          if (timestamp - startedAt >= sampleDuration) {
            const duration = timestamp - startedAt;

            resolve({
              durationMs: Math.round(duration),
              frameCount,
              framesPerSecond: Number(
                ((frameCount * 1000) / duration).toFixed(1),
              ),
            });

            return;
          }

          requestAnimationFrame(nextFrame);
        }

        requestAnimationFrame(nextFrame);
      }),
    durationMs,
  );
}

async function seekIntoNoteContent(page, percent = 22) {
  const slider = page.locator('header .ant-slider').first();

  await slider.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('header .ant-slider');

    return Boolean(
      element && !element.classList.contains('ant-slider-disabled'),
    );
  });

  const bounds = await slider.boundingBox();

  if (!bounds) {
    throw new Error('Playback slider has no measurable bounds');
  }

  await page.mouse.click(
    bounds.x + bounds.width * (percent / 100),
    bounds.y + bounds.height / 2,
  );
  await page.waitForFunction(
    (minimumPercent) => {
      const handle = document.querySelector(
        'header .ant-slider-handle[aria-valuenow]',
      );
      const value = Number(handle?.getAttribute('aria-valuenow'));

      return Number.isFinite(value) && value >= minimumPercent;
    },
    Math.max(1, percent - 2),
  );

  return percent;
}

async function readFlowProof(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('.drumroll-flow-viewport');
    const playhead = document.querySelector('[data-testid="playhead-cursor"]');
    const hud = document.querySelector('[data-testid="flow-viewport-hud"]');

    if (!(viewport instanceof HTMLElement)) {
      throw new Error('Flow viewport is missing');
    }

    if (!(playhead instanceof HTMLElement)) {
      throw new Error('Flow playhead is missing');
    }

    if (!(hud instanceof HTMLElement)) {
      throw new Error('Flow viewport HUD is missing');
    }

    const viewportRect = viewport.getBoundingClientRect();
    const playheadRect = playhead.getBoundingClientRect();
    const hudRect = hud.getBoundingClientRect();
    const visibleNonRestNoteheads = Array.from(
      document.querySelectorAll('.vf-notehead:not(.vf-note-rest)'),
    ).filter((notehead) => {
      const rect = notehead.getBoundingClientRect();

      return (
        rect.right > viewportRect.left &&
        rect.left < viewportRect.right &&
        rect.bottom > viewportRect.top &&
        rect.top < viewportRect.bottom
      );
    }).length;
    const playheadCenterX = playheadRect.left + playheadRect.width / 2;
    const normalizedPlayheadX =
      (playheadCenterX - viewportRect.left) / viewportRect.width;
    const playheadVisible =
      getComputedStyle(playhead).display !== 'none' &&
      playheadRect.height > 0 &&
      playheadRect.right > viewportRect.left &&
      playheadRect.left < viewportRect.right;
    const hudVisible =
      hudRect.left >= viewportRect.left - 1 &&
      hudRect.right <= viewportRect.right + 1 &&
      hudRect.bottom > viewportRect.top &&
      hudRect.top < viewportRect.bottom;

    return {
      scrollLeft: Math.round(viewport.scrollLeft),
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth,
      visibleNonRestNoteheads,
      playhead: {
        visible: playheadVisible,
        viewportX: Number(normalizedPlayheadX.toFixed(3)),
      },
      hud: {
        visible: hudVisible,
        text: hud.textContent?.replace(/\s+/g, ' ').trim(),
      },
    };
  });
}

async function run() {
  const outputDir = path.resolve(
    process.argv[2] ??
      path.join(REPO_ROOT, 'docs', 'design-qa', 'daybreak-arena'),
  );
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-daybreak-qa-'),
  );
  const consoleErrors = [];
  const pageErrors = [];

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(LIVE_CONFIG, path.join(userDataDir, 'config.json'));

  const app = await electron.launch({
    args: [MAIN_ENTRY, '--mute-audio'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
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

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });

    // The live library gained the full 170-exercise curriculum after its
    // previous index was saved. Refresh the isolated copy before capture so
    // Journey proves the current on-disk product, not a stale six-item cache.
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('rescan-folder').click();
    await page.getByTestId('scan-progress').waitFor({ timeout: 30_000 });
    await page
      .getByTestId('scan-progress')
      .waitFor({ state: 'detached', timeout: 120_000 });
    await page.keyboard.press('Escape');
    await waitForCurrentSong(page);
    await page.waitForTimeout(1200);

    await page.screenshot({
      path: path.join(outputDir, 'implementation-home.png'),
      animations: 'disabled',
    });

    await page.getByTestId('view-lessons').click();
    await page.getByTestId('lesson-season-stage').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(outputDir, 'implementation-journey.png'),
      animations: 'disabled',
    });

    await page.getByTestId('view-home').click();
    await page.getByTestId('home-open-coach').click();
    await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
    await page.getByTestId('coach-summary-only').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outputDir, 'implementation-coach.png'),
      animations: 'disabled',
    });

    await page.keyboard.press('Escape');
    await page.getByTestId('flow-notation').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outputDir, 'implementation-flow-resting.png'),
      animations: 'disabled',
    });

    const playButton = page.getByTestId('play-toggle');

    await playButton.waitFor({ timeout: 30_000 });

    const seekPercent = await seekIntoNoteContent(page);

    await playButton.click();
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="play-toggle"]');

        return button?.getAttribute('aria-label') === 'Pause';
      },
      null,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(1600);

    const frameSample = await sampleAnimationFrames(page);
    const flowProof = await readFlowProof(page);
    const proofFailures = [
      flowProof.scrollLeft <= 0 && 'Flow camera did not pan',
      !flowProof.playhead.visible && 'Playhead is not visible',
      (flowProof.playhead.viewportX < 0.35 ||
        flowProof.playhead.viewportX > 0.65) &&
        `Playhead is not centered (${flowProof.playhead.viewportX})`,
      flowProof.visibleNonRestNoteheads === 0 &&
        'No real note content is visible',
      !flowProof.hud.visible && 'Flow HUD is not fixed inside the viewport',
    ].filter(Boolean);

    await page.screenshot({
      path: path.join(outputDir, 'implementation-flow-playing.png'),
    });

    fs.writeFileSync(
      path.join(outputDir, 'qa-runtime.json'),
      `${JSON.stringify(
        {
          viewport: { width: 1600, height: 1000 },
          seekPercent,
          frameSample,
          flowProof,
          proofFailures,
          consoleErrors,
          pageErrors,
        },
        null,
        2,
      )}\n`,
    );

    if (proofFailures.length > 0) {
      throw new Error(`Flow proof failed: ${proofFailures.join('; ')}`);
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
