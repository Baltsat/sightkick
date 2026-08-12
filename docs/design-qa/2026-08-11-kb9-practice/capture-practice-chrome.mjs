import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(outputDir, '../../..');
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const sourceConfig = path.join(root, '.userdata', 'final-qa', 'config.json');
const wideViewport = { width: 1224, height: 768 };
const compactViewport = { width: 1024, height: 700 };

async function proofFor(page, label) {
  return page.evaluate((stateLabel) => {
    const rootElement = document.documentElement;
    const body = document.body;
    const shell = document.querySelector('.drumroll-practice-shell');
    const stage = document.querySelector('.drumroll-notation-stage');
    const readiness = document.querySelector(
      '[data-testid="practice-readiness-cue"]',
    );
    const countIn = document.querySelector('[data-testid="count-in"]');
    const tutor = document.querySelector('[data-testid="tutor-hud"]');
    const inspectorSection = document.querySelector(
      '[aria-label="Performance controls"]',
    );
    const inspector = inspectorSection?.closest('.ant-popover');
    const inspectorInner = inspector?.querySelector('.ant-popover-content');
    const stageStyle = stage ? getComputedStyle(stage) : undefined;
    const inspectorStyle = inspectorInner
      ? getComputedStyle(inspectorInner)
      : undefined;
    const rail = readiness ?? countIn ?? tutor;
    const railBox = rail?.getBoundingClientRect();
    const inspectorBox = inspectorInner?.getBoundingClientRect();
    const ancestorEffects = [];
    const noteColors = Array.from(
      stage?.querySelectorAll('[class*="vf-note-"] *') ?? [],
    )
      .filter((note) => note instanceof SVGElement)
      .slice(0, 96)
      .map((note) => ({
        className:
          note.closest('[class*="vf-note-"]')?.getAttribute('class') ?? '',
        fill: getComputedStyle(note).fill,
        stroke: getComputedStyle(note).stroke,
      }));
    const readyNotes = stateLabel.includes('ready')
      ? {
          activeFills: [
            ...new Set(
              noteColors
                .filter((note) => note.className.includes('vf-note-active'))
                .map((note) => note.fill),
            ),
          ],
          inactiveFills: [
            ...new Set(
              noteColors
                .filter((note) => !note.className.includes('vf-note-active'))
                .map((note) => note.fill),
            ),
          ],
        }
      : null;

    for (
      let element = stage;
      element && element !== document.body.parentElement;
      element = element.parentElement
    ) {
      const style = getComputedStyle(element);

      if (
        style.opacity !== '1' ||
        style.filter !== 'none' ||
        style.transform !== 'none'
      ) {
        ancestorEffects.push({
          tag: element.tagName,
          className: element.className,
          opacity: style.opacity,
          filter: style.filter,
          transform: style.transform,
        });
      }
    }

    return {
      label: stateLabel,
      phase: shell?.getAttribute('data-session-phase') ?? null,
      viewport: { width: innerWidth, height: innerHeight },
      outerScroll: {
        document: {
          width: rootElement.scrollWidth,
          height: rootElement.scrollHeight,
          horizontal: rootElement.scrollWidth > innerWidth + 1,
          vertical: rootElement.scrollHeight > innerHeight + 1,
        },
        body: {
          width: body.scrollWidth,
          height: body.scrollHeight,
          horizontal: body.scrollWidth > innerWidth + 1,
          vertical: body.scrollHeight > innerHeight + 1,
        },
      },
      score: {
        opacity: stageStyle?.opacity ?? null,
        filter: stageStyle?.filter ?? null,
        transform: stageStyle?.transform ?? null,
        ancestorEffects,
        readyNotes,
      },
      localState: {
        readiness: Boolean(readiness),
        countIn: Boolean(countIn),
        tutor: Boolean(tutor),
        railHeight: railBox ? Math.round(railBox.height) : null,
      },
      inspector: inspectorBox
        ? {
            className: inspector?.className ?? null,
            height: Math.round(inspectorBox.height),
            maxHeight: inspectorStyle?.maxHeight ?? null,
            overflow: inspectorStyle?.overflow ?? null,
          }
        : inspector
        ? { className: inspector.className, height: null }
        : null,
    };
  }, label);
}

async function capture(page, name, proofs) {
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    animations: name.includes('count-in') ? 'allow' : 'disabled',
  });
  proofs.push(await proofFor(page, name));
}

async function openPractice(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
  await page.getByTestId('song-search').fill('Lesson 01.01');

  const target = page.getByTestId('song-item-lesson:01.01');

  await target.waitFor({ timeout: 30_000 });
  await target.click();

  const practice = page.getByTestId('game-mode-practice');

  if (await practice.isVisible().catch(() => false)) {
    await practice.click();
  }

  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
  await page
    .locator('[data-testid="practice-readiness-cue"][data-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function waitForPhase(page, phase) {
  await page
    .locator(`.drumroll-practice-shell[data-session-phase="${phase}"]`)
    .waitFor({ timeout: 30_000 });
}

async function run() {
  if (!fs.existsSync(mainEntry) || !fs.existsSync(sourceConfig)) {
    throw new Error('Build output or final QA fixture config is missing');
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-kb9-practice-'),
  );
  const proofs = [];
  const pageErrors = [];

  fs.copyFileSync(sourceConfig, path.join(userDataDir, 'config.json'));

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

    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.setViewportSize(wideViewport);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });

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
      localStorage.setItem('settings.countIn', 'true');
      localStorage.setItem('settings.practiceNotationLayout', 'flow');
      localStorage.setItem('settings.handsFreeControlsEnabled', 'true');
      localStorage.setItem('settings.adaptiveTutorEnabled', 'true');
      localStorage.setItem('settings.challengeLivesEnabled', 'false');
    });
    await page.reload();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });

    await openPractice(page);
    await capture(page, '01-ready-performance-chrome', proofs);

    await page.getByRole('button', { name: 'Open inspector' }).click();
    await page.getByRole('region', { name: 'Performance controls' }).waitFor();
    await capture(page, '02-ready-inspector', proofs);
    await page.keyboard.press('Escape');
    await page
      .getByRole('region', { name: 'Performance controls' })
      .waitFor({ state: 'hidden' });

    await page.getByTestId('play-toggle').click();
    await page.getByTestId('count-in').waitFor({ timeout: 10_000 });
    await capture(page, '03-count-in', proofs);

    await waitForPhase(page, 'playing');
    await page.waitForTimeout(200);
    await capture(page, '04-playing', proofs);

    await page.getByTestId('play-toggle').click();
    await waitForPhase(page, 'paused');
    await capture(page, '05-paused', proofs);

    await page.getByTestId('play-toggle').click();
    await waitForPhase(page, 'playing');
    await waitForPhase(page, 'inactivity-paused');
    await capture(page, '06-recovery-inactivity', proofs);

    await page.setViewportSize(compactViewport);
    await capture(page, '07-recovery-1024x700', proofs);

    const failedProofs = proofs.filter(
      (proof) =>
        proof.outerScroll.document.horizontal ||
        proof.outerScroll.document.vertical ||
        proof.outerScroll.body.horizontal ||
        proof.outerScroll.body.vertical ||
        proof.score.opacity !== '1' ||
        proof.score.filter !== 'none' ||
        proof.score.transform !== 'none' ||
        proof.score.ancestorEffects.length > 0 ||
        (proof.label === '01-ready-performance-chrome' &&
          (!proof.score.readyNotes ||
            proof.score.readyNotes.activeFills.length !== 1 ||
            proof.score.readyNotes.activeFills[0] !== 'rgb(255, 104, 79)' ||
            proof.score.readyNotes.inactiveFills.length !== 1 ||
            proof.score.readyNotes.inactiveFills[0] !== 'rgb(82, 97, 114)')),
    );
    const result = {
      source: 'production Electron build with final QA lesson fixture',
      wideViewport,
      compactViewport,
      proofs,
      pageErrors,
      failedProofs: failedProofs.map((proof) => proof.label),
    };

    fs.writeFileSync(
      path.join(outputDir, 'qa-runtime.json'),
      `${JSON.stringify(result, null, 2)}\n`,
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(new URL('before-after-board.html', import.meta.url).href);
    await page.screenshot({
      path: path.join(outputDir, 'before-after-board.png'),
      fullPage: true,
    });

    if (pageErrors.length || failedProofs.length) {
      throw new Error(
        `Practice visual QA failed: ${JSON.stringify({
          pageErrors,
          failedProofs: failedProofs.map((proof) => proof.label),
        })}`,
      );
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
