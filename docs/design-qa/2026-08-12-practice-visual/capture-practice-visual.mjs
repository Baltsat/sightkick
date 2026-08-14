import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(outputDir, '../../..');
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const sourceConfig = path.join(root, '.userdata', 'final-qa', 'config.json');
const wideViewport = { width: 1225, height: 768 };
const compactViewport = { width: 1024, height: 700 };

function failuresFor(proof, expected) {
  const failures = [];

  if (proof.phase !== expected.phase) {
    failures.push(`phase ${proof.phase} instead of ${expected.phase}`);
  }

  if (proof.caption.count !== expected.captionCount) {
    failures.push(
      `caption count ${proof.caption.count} instead of ${expected.captionCount}`,
    );
  }

  if (
    expected.caption !== undefined &&
    !proof.caption.kinds.includes(expected.caption)
  ) {
    failures.push(`missing ${expected.caption} caption`);
  }

  if (
    expected.scoreModal !== undefined &&
    proof.scoreModal !== expected.scoreModal
  ) {
    failures.push(
      `score modal ${proof.scoreModal} instead of ${expected.scoreModal}`,
    );
  }

  if (
    proof.outerScroll.document.horizontal ||
    proof.outerScroll.document.vertical
  ) {
    failures.push('document outer scroll');
  }

  if (proof.outerScroll.body.horizontal || proof.outerScroll.body.vertical) {
    failures.push('body outer scroll');
  }

  if (proof.score.opacity !== '1') {
    failures.push(`score opacity ${proof.score.opacity}`);
  }

  if (proof.score.filter !== 'none') {
    failures.push(`score filter ${proof.score.filter}`);
  }

  if (proof.score.ancestorEffects.length > 0) {
    failures.push('score ancestor visual effect');
  }

  if (proof.caption.height !== null && proof.caption.height > 64) {
    failures.push(`caption height ${proof.caption.height}px`);
  }

  return failures;
}

async function proofFor(page, label) {
  return page.evaluate((stateLabel) => {
    const rootElement = document.documentElement;
    const body = document.body;
    const shell = document.querySelector('.drumroll-practice-shell');
    const stage = document.querySelector('.drumroll-notation-stage');
    const scoreSurface = document.querySelector('.drumroll-score-surface');
    const captions = Array.from(
      document.querySelectorAll('[data-edge-caption]'),
    );
    const activeCaption = captions[0];
    const slider = document.querySelector('[role="slider"]');
    const stageStyle = stage ? getComputedStyle(stage) : undefined;
    const captionBox = activeCaption?.getBoundingClientRect();
    const noteBoxes = Array.from(stage?.querySelectorAll('svg') ?? [])
      .map((node) => node.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    const ancestorEffects = [];

    for (
      let element = stage;
      element && element !== document.body.parentElement;
      element = element.parentElement
    ) {
      const style = getComputedStyle(element);

      if (style.opacity !== '1' || style.filter !== 'none') {
        ancestorEffects.push({
          className: element.className,
          filter: style.filter,
          opacity: style.opacity,
          tagName: element.tagName,
        });
      }
    }

    return {
      caption: {
        count: captions.length,
        height: captionBox ? Math.round(captionBox.height) : null,
        kinds: captions.map((caption) =>
          caption.getAttribute('data-edge-caption'),
        ),
        testId: activeCaption?.getAttribute('data-testid') ?? null,
      },
      label: stateLabel,
      outerScroll: {
        body: {
          height: body.scrollHeight,
          horizontal: body.scrollWidth > innerWidth + 1,
          vertical: body.scrollHeight > innerHeight + 1,
          width: body.scrollWidth,
        },
        document: {
          height: rootElement.scrollHeight,
          horizontal: rootElement.scrollWidth > innerWidth + 1,
          vertical: rootElement.scrollHeight > innerHeight + 1,
          width: rootElement.scrollWidth,
        },
      },
      phase: shell?.getAttribute('data-session-phase') ?? null,
      score: {
        ancestorEffects,
        filter: stageStyle?.filter ?? null,
        notationHeight: Math.round(
          scoreSurface?.getBoundingClientRect().height ?? 0,
        ),
        noteheadSurfaceCount: noteBoxes.length,
        opacity: stageStyle?.opacity ?? null,
      },
      scoreModal: Boolean(
        document.querySelector('[data-testid="score-modal"]'),
      ),
      sliderValue: slider?.getAttribute('aria-valuenow') ?? null,
      viewport: { height: innerHeight, width: innerWidth },
    };
  }, label);
}

async function capture(page, name, expected, proofs, failedProofs) {
  await page.screenshot({
    animations: name.includes('counting') ? 'allow' : 'disabled',
    path: path.join(outputDir, `${name}.png`),
  });

  const proof = await proofFor(page, name);
  const failures = failuresFor(proof, expected);

  proofs.push(proof);

  if (failures.length > 0) {
    failedProofs.push({ failures, label: name });
  }
}

async function configure(
  page,
  handsFreeControlsEnabled,
  adaptiveTutorEnabled = true,
) {
  await page.evaluate(
    ([handsFree, tutor]) => {
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
      localStorage.setItem('settings.countIn', 'true');
      localStorage.setItem('settings.practiceNotationLayout', 'flow');
      localStorage.setItem(
        'settings.handsFreeControlsEnabled',
        String(handsFree),
      );
      localStorage.setItem('settings.adaptiveTutorEnabled', String(tutor));
      localStorage.setItem('settings.challengeLivesEnabled', 'false');
    },
    [handsFreeControlsEnabled, adaptiveTutorEnabled],
  );
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function holdSongLoad(app) {
  const listenerCount = await app.evaluate(({ ipcMain }) => {
    const listeners = ipcMain.listeners('load-song');

    globalThis.drumrollPracticeVisualQa = { listeners, pending: [] };
    ipcMain.removeAllListeners('load-song');
    ipcMain.on('load-song', (...args) => {
      globalThis.drumrollPracticeVisualQa.pending.push(args);
    });

    return listeners.length;
  });

  if (listenerCount === 0) {
    throw new Error('No load-song listener available for idle-state capture');
  }
}

async function releaseSongLoad(app) {
  return app.evaluate(({ ipcMain }) => {
    const held = globalThis.drumrollPracticeVisualQa;

    if (!held) {
      return 0;
    }

    ipcMain.removeAllListeners('load-song');

    for (const listener of held.listeners) {
      ipcMain.on('load-song', listener);
    }

    for (const args of held.pending) {
      for (const listener of held.listeners) {
        listener(...args);
      }
    }

    delete globalThis.drumrollPracticeVisualQa;

    return held.pending.length;
  });
}

async function choosePractice(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
  await page.getByTestId('song-search').fill('Lesson 01.01');

  const target = page.getByTestId('song-item-lesson:01.01');

  await target.waitFor({ timeout: 30_000 });
  await target.click();

  const practice = page.getByTestId('game-mode-practice');

  await practice.waitFor({ timeout: 30_000 });

  return practice;
}

async function waitForReadyPractice(page) {
  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
  await page
    .locator('[data-testid="practice-readiness-cue"][data-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function openPractice(page) {
  const practice = await choosePractice(page);

  await practice.click();
  await waitForReadyPractice(page);
}

async function captureIdle(app, page, proofs, failedProofs) {
  const practice = await choosePractice(page);
  const idleCue = page.locator(
    '[data-testid="practice-readiness-cue"][data-phase="idle"]',
  );

  await holdSongLoad(app);

  try {
    await practice.click();
    await idleCue.waitFor({ timeout: 30_000 });
    await capture(
      page,
      '01-idle',
      { caption: 'ready', captionCount: 1, phase: 'ready' },
      proofs,
      failedProofs,
    );
  } finally {
    await releaseSongLoad(app);
  }

  await waitForReadyPractice(page);
}

async function waitForPhase(page, phase) {
  await page
    .locator(`.drumroll-practice-shell[data-session-phase="${phase}"]`)
    .waitFor({ timeout: 30_000 });
}

async function captureRun(app, page, proofs, failedProofs) {
  await captureIdle(app, page, proofs, failedProofs);

  await capture(
    page,
    '02-armed',
    { caption: 'ready', captionCount: 1, phase: 'ready' },
    proofs,
    failedProofs,
  );

  await page.setViewportSize(compactViewport);
  await capture(
    page,
    '03-armed-1024x700',
    { caption: 'ready', captionCount: 1, phase: 'ready' },
    proofs,
    failedProofs,
  );
  await page.setViewportSize(wideViewport);

  await page.getByRole('button', { name: 'Open inspector' }).click();
  await page.getByRole('region', { name: 'Performance controls' }).waitFor();
  await capture(
    page,
    '04-armed-inspector',
    { caption: 'ready', captionCount: 1, phase: 'ready' },
    proofs,
    failedProofs,
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('region', { name: 'Performance controls' })
    .waitFor({ state: 'hidden' });

  await page.getByTestId('play-toggle').click();
  await page.getByTestId('count-in').waitFor({ timeout: 10_000 });
  await capture(
    page,
    '05-counting-in',
    { caption: 'count-in', captionCount: 1, phase: 'counting-in' },
    proofs,
    failedProofs,
  );

  await waitForPhase(page, 'playing');
  await page.waitForTimeout(200);
  await capture(
    page,
    '06-playing',
    { captionCount: 0, phase: 'playing' },
    proofs,
    failedProofs,
  );

  await page.getByTestId('play-toggle').click();
  await waitForPhase(page, 'paused');
  await capture(
    page,
    '07-paused',
    { caption: 'tutor', captionCount: 1, phase: 'paused' },
    proofs,
    failedProofs,
  );

  await page.getByTestId('play-toggle').click();
  await waitForPhase(page, 'playing');
  await waitForPhase(page, 'inactivity-paused');
  await page.getByTestId('inactivity-pause-veil').waitFor({ timeout: 10_000 });
  await capture(
    page,
    '08-recovering',
    {
      caption: 'inactivity-paused',
      captionCount: 1,
      phase: 'inactivity-paused',
    },
    proofs,
    failedProofs,
  );
}

async function captureDone(page, proofs, failedProofs) {
  await configure(page, false, false);
  await openPractice(page);
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('count-in').waitFor({ timeout: 10_000 });
  await waitForPhase(page, 'playing');

  const sliderTrack = page
    .locator('.drumroll-practice-toolbar .ant-slider')
    .first();
  const sliderBox = await sliderTrack.boundingBox();

  if (!sliderBox) {
    throw new Error('Practice scrubber is not measurable');
  }

  await page.mouse.click(
    sliderBox.x + sliderBox.width * 0.98,
    sliderBox.y + sliderBox.height / 2,
  );

  try {
    await page.getByTestId('score-modal').waitFor({ timeout: 15_000 });
  } catch (error) {
    await page.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, '09-done-missing.png'),
    });
    proofs.push(await proofFor(page, '09-done-missing'));

    throw error;
  }

  await capture(
    page,
    '09-done',
    { captionCount: 0, phase: 'result', scoreModal: true },
    proofs,
    failedProofs,
  );
}

async function run() {
  if (!fs.existsSync(mainEntry) || !fs.existsSync(sourceConfig)) {
    throw new Error('Build output or final QA fixture config is missing');
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-practice-visual-'),
  );
  const proofs = [];
  const failedProofs = [];
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
    await page.setViewportSize(wideViewport);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure(page, true);
    await captureRun(app, page, proofs, failedProofs);
    await captureDone(page, proofs, failedProofs);

    if (pageErrors.length > 0 || failedProofs.length > 0) {
      throw new Error(
        `Practice visual QA failed: ${JSON.stringify({
          failedProofs,
          pageErrors,
        })}`,
      );
    }
  } catch (error) {
    failure = String(error);

    throw error;
  } finally {
    fs.writeFileSync(
      path.join(outputDir, 'qa-runtime.json'),
      `${JSON.stringify(
        {
          compactViewport,
          failedProofs,
          failure,
          pageErrors,
          proofs,
          source: 'production Electron build with final QA lesson fixture',
          wideViewport,
        },
        null,
        2,
      )}\n`,
    );
    await app.close();
    fs.rmSync(userDataDir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
