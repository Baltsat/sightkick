import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
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
const iconPath = path.join(repoRoot, 'assets', 'icon.icns');
const iconSetPath = path.join(repoRoot, 'assets', 'icon.iconset');
const baselineDir = path.join(
  repoRoot,
  'docs',
  'design-qa',
  '2026-08-11-kb8-final',
);
const viewports = {
  wide: { width: 1224, height: 768 },
  compact: { width: 1024, height: 700 },
};
const baselineFiles = [
  '01-installed-home.png',
  '02-installed-journey.png',
  '03-installed-flow-idle-cue.png',
  '04-installed-flow-ready.png',
  '05-installed-flow-playing.png',
  '06-installed-profile-radar.png',
  '07-installed-app-icon-context.png',
];

function ensureInputs() {
  if (
    !fs.existsSync(mainEntry) ||
    !fs.existsSync(fixtureConfig) ||
    !fs.existsSync(iconPath) ||
    !fs.existsSync(iconSetPath)
  ) {
    throw new Error('Build output or final QA fixture config is missing');
  }

  const missing = baselineFiles.filter(
    (file) => !fs.existsSync(path.join(baselineDir, file)),
  );

  if (missing.length > 0) {
    throw new Error(`KB8 baseline captures are missing: ${missing.join(', ')}`);
  }
}

function copyBaseline() {
  const destination = path.join(outputDir, 'baseline');

  fs.mkdirSync(destination, { recursive: true });
  baselineFiles.forEach((file) =>
    fs.copyFileSync(path.join(baselineDir, file), path.join(destination, file)),
  );
}

function relativeCurrent(name) {
  return path.join('current', `${name}.png`);
}

function currentPath(name) {
  return path.join(outputDir, relativeCurrent(name));
}

function captureNativeIconContext() {
  const iconQaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drumroll-icon-qa-'));
  const roundTripDir = path.join(iconQaDir, 'roundtrip.iconset');
  const finderContext = currentPath('app-icon-finder-context');
  const scaleMatrix = currentPath('app-icon-scale-matrix');

  try {
    execFileSync('iconutil', ['-c', 'iconset', iconPath, '-o', roundTripDir], {
      stdio: 'pipe',
    });
    execFileSync('qlmanage', ['-t', '-s', '1024', '-o', iconQaDir, iconPath], {
      stdio: 'pipe',
      timeout: 20_000,
    });

    const thumbnail = fs
      .readdirSync(iconQaDir)
      .find((entry) => entry.endsWith('.png'));

    if (!thumbnail) {
      throw new Error('Finder Quick Look did not produce an icon thumbnail');
    }

    fs.copyFileSync(path.join(iconQaDir, thumbnail), finderContext);

    const iconFrames = [
      'icon_16x16.png',
      'icon_16x16@2x.png',
      'icon_32x32@2x.png',
      'icon_128x128.png',
      'icon_128x128@2x.png',
      'icon_256x256@2x.png',
      'icon_512x512@2x.png',
    ].map((file) => path.join(iconSetPath, file));

    execFileSync(
      'magick',
      [
        ...iconFrames.flatMap((frame) => [
          '(',
          frame,
          '-filter',
          'point',
          '-resize',
          '128x128',
          ')',
        ]),
        '+append',
        scaleMatrix,
      ],
      { stdio: 'pipe' },
    );

    return {
      context: 'native Finder Quick Look thumbnail of the shipped ICNS asset',
      finderContext: relativeCurrent('app-icon-finder-context'),
      scaleMatrix: relativeCurrent('app-icon-scale-matrix'),
      sizes: [16, 32, 64, 128, 256, 512, 1024],
      icnsRoundTripFiles: fs.readdirSync(roundTripDir).sort(),
    };
  } finally {
    fs.rmSync(iconQaDir, { recursive: true, force: true });
  }
}

function writeBoard() {
  const image = (src, alt) => `<img src="${src}" alt="${alt}">`;
  const comparison = (title, baseline, wide, compact) => `
    <section>
      <h2>${title}</h2>
      <div class="comparison">
        <figure><figcaption>KB8 baseline</figcaption>${image(
          `baseline/${baseline}`,
          `${title} KB8 baseline`,
        )}</figure>
        <figure><figcaption>KB9 current · 1224 × 768</figcaption>${image(
          relativeCurrent(wide),
          `${title} current wide`,
        )}</figure>
        <figure><figcaption>KB9 current · 1024 × 700</figcaption>${image(
          relativeCurrent(compact),
          `${title} current compact`,
        )}</figure>
      </div>
    </section>`;
  const iconComparison = `
    <section>
      <h2>app icon</h2>
      <div class="comparison">
        <figure><figcaption>KB8 Finder baseline</figcaption>${image(
          'baseline/07-installed-app-icon-context.png',
          'app icon KB8 Finder baseline',
        )}</figure>
        <figure><figcaption>KB9 Finder / Quick Look</figcaption>${image(
          relativeCurrent('app-icon-finder-context'),
          'app icon Finder Quick Look context',
        )}</figure>
        <figure><figcaption>KB9 16 → 1024 px</figcaption>${image(
          relativeCurrent('app-icon-scale-matrix'),
          'app icon scale matrix from 16 to 1024 pixels',
        )}</figure>
      </div>
    </section>`;
  const body = [
    iconComparison,
    comparison(
      'home',
      '01-installed-home.png',
      'home-1224x768',
      'home-1024x700',
    ),
    comparison(
      'journey',
      '02-installed-journey.png',
      'journey-1224x768',
      'journey-1024x700',
    ),
    comparison(
      'practice ready',
      '04-installed-flow-ready.png',
      'practice-ready-1224x768',
      'practice-ready-1024x700',
    ),
    comparison(
      'practice playing',
      '05-installed-flow-playing.png',
      'practice-playing-1224x768',
      'practice-playing-1024x700',
    ),
    comparison(
      'judged hit feedback',
      '05-installed-flow-playing.png',
      'practice-hit-1224x768',
      'practice-hit-1024x700',
    ),
    comparison(
      'profile',
      '06-installed-profile-radar.png',
      'profile-1224x768',
      'profile-1024x700',
    ),
  ].join('\n');

  fs.writeFileSync(
    path.join(outputDir, 'before-after-board.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Drumroll KB9 visual dossier</title>
    <style>
      :root { color: #171722; background: #f3eee4; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      body { margin: 0; padding: 36px; }
      h1 { margin: 0; font: 700 32px/1.1 Georgia, serif; }
      p { max-width: 78ch; color: #534d46; line-height: 1.5; }
      section { margin-top: 34px; }
      h2 { margin: 0 0 12px; font-size: 16px; letter-spacing: 0.08em; text-transform: uppercase; }
      .comparison { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      figure { min-width: 0; margin: 0; padding: 10px; border: 1px solid #d8d0c4; border-radius: 12px; background: #fffdf8; box-shadow: 0 12px 24px rgb(23 23 34 / 8%); }
      figcaption { margin: 0 0 8px; color: #6b6258; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      img { display: block; width: 100%; height: auto; border-radius: 6px; background: #e8e0d5; }
      @media (max-width: 1100px) { .comparison { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <h1>Drumroll KB9 visual dossier</h1>
    <p>KB8 source captures are preserved as received. KB9 runs the current production Electron build at both supported desktop viewports. The KB8 archive contains only 1225 × 768 app captures, so the compact column is a current-tree regression check rather than a fabricated compact baseline.</p>
    ${body}
  </body>
</html>
`,
  );
}

function inspect(page, label, surface) {
  return page.evaluate(
    ({ currentLabel, expectedSurface }) => {
      const root = document.documentElement;
      const body = document.body;
      const practice = document.querySelector('.drumroll-practice-shell');
      const appShell = document.querySelector('.arena-shell');
      const drawer = document.querySelector('.ant-drawer');
      const frame = practice ?? appShell ?? drawer;
      const frameRect = frame?.getBoundingClientRect();
      const active = document.querySelector('.vf-note-active');
      const hit = document.querySelector('.vf-note-pop');
      const wrong = document.querySelector('.vf-wronghit-marker');
      const core = document.querySelector(expectedSurface);
      const coreStyle = core ? getComputedStyle(core) : undefined;
      const flowHud = document.querySelector('.drumroll-flow-hud');
      const flowStage = document.querySelector('.drumroll-flow-stage');
      const fixedPlayhead = document.querySelector(
        '[data-testid="flow-fixed-playhead"]',
      );
      const playheadLabel = document.querySelector(
        '.drumroll-flow-fixed-playhead__label',
      );
      const rect = (element) => {
        if (!element) {
          return null;
        }

        const bounds = element.getBoundingClientRect();

        return {
          left: Math.round(bounds.left),
          top: Math.round(bounds.top),
          right: Math.round(bounds.right),
          bottom: Math.round(bounds.bottom),
        };
      };
      const flowHudRect = rect(flowHud);
      const playheadLabelRect = rect(playheadLabel);
      const playheadOverlapsHud = Boolean(
        flowHudRect &&
          playheadLabelRect &&
          playheadLabelRect.left < flowHudRect.right &&
          playheadLabelRect.right > flowHudRect.left &&
          playheadLabelRect.top < flowHudRect.bottom &&
          playheadLabelRect.bottom > flowHudRect.top,
      );

      return {
        label: currentLabel,
        viewport: { width: innerWidth, height: innerHeight },
        phase: practice?.getAttribute('data-session-phase') ?? null,
        outerScroll: {
          document: {
            width: root.scrollWidth,
            height: root.scrollHeight,
            horizontal: root.scrollWidth > innerWidth + 1,
            vertical: root.scrollHeight > innerHeight + 1,
          },
          body: {
            width: body.scrollWidth,
            height: body.scrollHeight,
            horizontal: body.scrollWidth > innerWidth + 1,
            vertical: body.scrollHeight > innerHeight + 1,
          },
        },
        frame: frameRect
          ? {
              left: Math.round(frameRect.left),
              top: Math.round(frameRect.top),
              right: Math.round(frameRect.right),
              bottom: Math.round(frameRect.bottom),
              fitsViewport:
                frameRect.left >= -1 &&
                frameRect.top >= -1 &&
                frameRect.right <= innerWidth + 1 &&
                frameRect.bottom <= innerHeight + 1,
            }
          : null,
        surface: {
          present: Boolean(core),
          display: coreStyle?.display ?? null,
          visibility: coreStyle?.visibility ?? null,
          opacity: coreStyle?.opacity ?? null,
        },
        motion: {
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          activeAnimation: active
            ? getComputedStyle(active).animationName
            : null,
          judgedHit: Boolean(hit),
          wrongHit: Boolean(wrong),
        },
        layout: {
          flowHud: flowHudRect,
          playheadLabel: playheadLabelRect,
          playheadOverlapsHud,
          camera: {
            flowStage: rect(flowStage),
            fixedSurface: rect(fixedPlayhead?.parentElement),
            fixedPlayheadTop: fixedPlayhead
              ? getComputedStyle(fixedPlayhead).top
              : null,
          },
        },
      };
    },
    { currentLabel: label, expectedSurface: surface },
  );
}

async function capture(page, name, viewport, surface, options = {}) {
  if (!options.keepViewport) {
    await page.setViewportSize(viewport);
  }

  if (options.waitFor) {
    await page.locator(options.waitFor).waitFor({ timeout: 60_000 });
  }

  if (options.settleMs !== 0) {
    await page.waitForTimeout(options.settleMs ?? 300);
  }

  const proof = await inspect(page, name, surface);

  await page.screenshot({
    path: currentPath(name),
    animations: options.animations ?? 'disabled',
  });

  return proof;
}

async function waitForPracticePhase(page, phase) {
  await page
    .locator(`.drumroll-practice-shell[data-session-phase="${phase}"]`)
    .waitFor({ timeout: 60_000 });
}

async function openPractice(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 60_000 });
  await page.getByTestId('song-search').fill('Lesson 01.01');

  const target = page.getByTestId('song-item-lesson:01.01');

  await target.waitFor({ timeout: 60_000 });
  await target.click();

  const practice = page.getByTestId('game-mode-practice');

  if (await practice.isVisible().catch(() => false)) {
    await practice.click();
  }

  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await waitForPracticePhase(page, 'ready');
}

async function startPlaying(page) {
  await page.getByTestId('play-toggle').click();
  await waitForPracticePhase(page, 'playing');
}

async function returnToLibrary(page) {
  await page.getByTestId('back-button').click();
  await page.getByTestId('song-search').waitFor({ timeout: 60_000 });
}

async function captureHit(page, name, viewport, surface) {
  const hit = page.locator('.vf-note-pop');
  const key = await page.evaluate(() => {
    const laneToKey = {
      hihat: 'KeyH',
      ride: 'KeyR',
      crash: 'KeyC',
      snare: 'KeyJ',
      tom1: 'KeyT',
      tom2: 'KeyY',
      tom3: 'KeyU',
      kick: 'KeyK',
    };
    const active = document.querySelector('.vf-note-active');
    const lane = Object.keys(laneToKey).find((entry) =>
      active?.classList.contains(`vf-note-${entry}`),
    );

    return lane ? laneToKey[lane] : undefined;
  });

  if (!key) {
    throw new Error(
      'No mapped active note was available for judged-hit capture',
    );
  }

  await page.keyboard.press(key);
  await hit.waitFor({ state: 'attached', timeout: 1_000 });

  return capture(page, name, viewport, surface, {
    animations: 'allow',
    settleMs: 0,
  });
}

async function setReducedMotion(page, enabled) {
  const session = await page.context().newCDPSession(page);

  await session.send('Emulation.setEmulatedMedia', {
    features: [
      {
        name: 'prefers-reduced-motion',
        value: enabled ? 'reduce' : 'no-preference',
      },
    ],
  });
}

function assertProofs(proofs) {
  const failures = proofs.filter(
    (proof) =>
      proof.outerScroll.document.horizontal ||
      proof.outerScroll.document.vertical ||
      proof.outerScroll.body.horizontal ||
      proof.outerScroll.body.vertical ||
      !proof.frame?.fitsViewport ||
      !proof.surface.present ||
      proof.surface.display === 'none' ||
      proof.surface.visibility === 'hidden' ||
      proof.surface.opacity === '0' ||
      proof.layout.playheadOverlapsHud,
  );

  if (failures.length > 0) {
    throw new Error(
      `Visual geometry failed: ${failures
        .map((proof) => proof.label)
        .join(', ')}`,
    );
  }

  const requiredMotion = [
    ['practice-playing-1224x768', 'drumroll-flow-current-note'],
    ['practice-playing-1024x700', 'drumroll-flow-current-note'],
    ['practice-hit-1224x768', 'true'],
    ['practice-hit-1024x700', 'true'],
    ['practice-playing-reduced-1224x768', 'none'],
  ];

  requiredMotion.forEach(([label, expected]) => {
    const proof = proofs.find((entry) => entry.label === label);
    const actual =
      expected === 'true'
        ? String(proof?.motion.judgedHit)
        : proof?.motion.activeAnimation;

    if (actual !== expected) {
      throw new Error(
        `Motion proof failed for ${label}: expected ${expected}, received ${actual}`,
      );
    }
  });

  if (
    !proofs.find((proof) => proof.label === 'practice-playing-reduced-1224x768')
      ?.motion.reducedMotion
  ) {
    throw new Error('Reduced-motion media query was not active during capture');
  }
}

async function run() {
  ensureInputs();
  fs.mkdirSync(path.join(outputDir, 'current'), { recursive: true });
  copyBaseline();
  writeBoard();

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-kb9-dossier-'),
  );
  const proofs = [];
  const consoleErrors = [];
  const pageErrors = [];
  let iconProof;
  let failure;
  let app;

  fs.copyFileSync(fixtureConfig, path.join(userDataDir, 'config.json'));

  try {
    iconProof = captureNativeIconContext();
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

    await page.setViewportSize(viewports.wide);
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
      localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
      localStorage.setItem('settings.adaptiveTutorEnabled', 'true');
      localStorage.setItem('settings.challengeLivesEnabled', 'false');
    });
    await page.reload();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });

    proofs.push(
      await capture(
        page,
        'home-1224x768',
        viewports.wide,
        '[data-testid="home-cockpit"]',
      ),
    );
    proofs.push(
      await capture(
        page,
        'home-1024x700',
        viewports.compact,
        '[data-testid="home-cockpit"]',
      ),
    );

    await page.getByTestId('view-lessons').click();
    await page.getByTestId('lesson-season-stage').waitFor({ timeout: 60_000 });
    proofs.push(
      await capture(
        page,
        'journey-1224x768',
        viewports.wide,
        '[data-testid="lesson-season-stage"]',
      ),
    );
    proofs.push(
      await capture(
        page,
        'journey-1024x700',
        viewports.compact,
        '[data-testid="lesson-season-stage"]',
      ),
    );

    await openPractice(page);
    proofs.push(
      await capture(
        page,
        'practice-ready-1224x768',
        viewports.wide,
        '[data-testid="flow-notation"]',
        { waitFor: '.drumroll-practice-shell[data-session-phase="ready"]' },
      ),
    );
    await startPlaying(page);
    proofs.push(
      await capture(
        page,
        'practice-playing-1224x768',
        viewports.wide,
        '[data-testid="flow-notation"]',
        { waitFor: '.drumroll-practice-shell[data-session-phase="playing"]' },
      ),
    );

    await returnToLibrary(page);
    await openPractice(page);
    await startPlaying(page);
    proofs.push(
      await captureHit(
        page,
        'practice-hit-1224x768',
        viewports.wide,
        '[data-testid="flow-notation"]',
      ),
    );

    await returnToLibrary(page);
    await openPractice(page);
    proofs.push(
      await capture(
        page,
        'practice-ready-1024x700',
        viewports.compact,
        '[data-testid="flow-notation"]',
        { waitFor: '.drumroll-practice-shell[data-session-phase="ready"]' },
      ),
    );
    await startPlaying(page);
    proofs.push(
      await capture(
        page,
        'practice-playing-1024x700',
        viewports.compact,
        '[data-testid="flow-notation"]',
        { waitFor: '.drumroll-practice-shell[data-session-phase="playing"]' },
      ),
    );

    await returnToLibrary(page);
    await openPractice(page);
    await startPlaying(page);
    proofs.push(
      await captureHit(
        page,
        'practice-hit-1024x700',
        viewports.compact,
        '[data-testid="flow-notation"]',
      ),
    );

    await page.setViewportSize(viewports.wide);
    await setReducedMotion(page, true);
    proofs.push(
      await capture(
        page,
        'practice-playing-reduced-1224x768',
        viewports.wide,
        '[data-testid="flow-notation"]',
        {
          animations: 'allow',
          keepViewport: true,
          settleMs: 0,
          waitFor: '.drumroll-practice-shell[data-session-phase="playing"]',
        },
      ),
    );
    await setReducedMotion(page, false);

    await returnToLibrary(page);
    await page.getByTestId('view-home').click();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await page.getByTestId('open-profile-button').click();
    await page.getByTestId('profile-view').waitFor({ timeout: 60_000 });
    proofs.push(
      await capture(page, 'profile-1224x768', viewports.wide, '.ant-drawer'),
    );
    proofs.push(
      await capture(page, 'profile-1024x700', viewports.compact, '.ant-drawer'),
    );

    assertProofs(proofs);

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        `Runtime errors: ${JSON.stringify({ consoleErrors, pageErrors })}`,
      );
    }

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(new URL('before-after-board.html', import.meta.url).href);
    await page.screenshot({
      path: path.join(outputDir, 'before-after-board.png'),
      fullPage: true,
      timeout: 120_000,
    });
  } catch (error) {
    failure = String(error.stack ?? error);

    throw error;
  } finally {
    fs.writeFileSync(
      path.join(outputDir, 'proof.json'),
      `${JSON.stringify(
        {
          source: 'current production Electron build with final QA fixture',
          baseline: {
            directory: 'docs/design-qa/2026-08-11-kb8-final',
            files: baselineFiles,
            capturedViewport: { width: 1225, height: 768 },
            compactBaseline:
              'not supplied by KB8; current compact captures are direct regression evidence',
          },
          supportedViewports: viewports,
          iconProof,
          proofs,
          consoleErrors,
          pageErrors,
          failure,
        },
        null,
        2,
      )}\n`,
    );

    if (app) {
      await app.close();
    }

    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
