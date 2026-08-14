import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const output_dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output_dir, '../../..');
const main_entry = path.join(root, 'out', 'main', 'index.js');
const source_config = path.join(root, '.userdata', 'main', 'config.json');
const capture_kind = process.argv[2];
const target_song = { title: 'Loyal', artist: 'ODESZA' };
const viewports = [
  { width: 1225, height: 768 },
  { width: 1024, height: 700 },
];
const proof = {
  capture_kind,
  song: `${target_song.artist} – ${target_song.title}`,
  viewports: [],
};

assert(
  capture_kind === 'before' || capture_kind === 'after',
  'Pass either "before" or "after".',
);

async function configure_page(page) {
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
    localStorage.setItem(
      'settings.practiceNotationLayout',
      JSON.stringify('classic'),
    );
    localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
    localStorage.setItem('settings.adaptiveTutorEnabled', 'false');
    localStorage.setItem('settings.challengeLivesEnabled', 'false');
  });
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function open_practice(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
  await page.getByTestId('song-search').fill(target_song.title);

  const matchingSong = page
    .locator('[data-testid^="song-item-"]')
    .filter({ hasText: target_song.title })
    .filter({ hasText: target_song.artist });

  assert.equal(
    await matchingSong.count(),
    1,
    `Expected one visible ${target_song.artist} – ${target_song.title} row.`,
  );
  await matchingSong.click();
  await page.getByTestId('game-mode-practice').waitFor({ timeout: 30_000 });
  await page.getByTestId('game-mode-practice').click();
  await page.getByTestId('classic-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
  assert.equal(
    (await page.getByTestId('sheet-score-title').textContent())?.trim(),
    target_song.title,
    'Capture opened the wrong score.',
  );
}

async function collect_proof(page, viewport) {
  return page.evaluate((active_viewport) => {
    const intersects = (a, b) =>
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top;
    const score = document.querySelector('[data-testid="classic-notation"]');
    const credits = document.querySelector(
      '[data-testid="sheet-score-credits"]',
    );
    const bands = Array.from(
      document.querySelectorAll('[data-testid^="notation-pattern-"]'),
    );
    const noteheads = Array.from(
      document.querySelectorAll('[data-notation-kind$="head"]'),
    );
    const notationMarks = Array.from(
      document.querySelectorAll('[data-notation-kinds], .vf-beam'),
    );

    return {
      score: score?.getBoundingClientRect().toJSON(),
      credits: credits?.getBoundingClientRect().toJSON(),
      repeatBands: bands.map((band) => {
        const rect = band.getBoundingClientRect();

        return {
          testId: band.getAttribute('data-testid'),
          rect: rect.toJSON(),
          cssHeight: band.offsetHeight,
          background: getComputedStyle(band).backgroundColor,
          noteheadOverlap: noteheads.some((notehead) =>
            intersects(rect, notehead.getBoundingClientRect()),
          ),
          notationOverlap: notationMarks.some((mark) =>
            intersects(rect, mark.getBoundingClientRect()),
          ),
        };
      }),
      noteheadCount: noteheads.length,
      viewport: active_viewport,
    };
  }, viewport);
}

async function capture_viewports(page) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.locator('.drumroll-classic-viewport').evaluate((element) => {
      element.scrollLeft = 0;
      element.scrollTop = 0;
    });
    await page.waitForTimeout(180);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(
        output_dir,
        `01-score-${capture_kind}-${viewport.width}x${viewport.height}.png`,
      ),
    });

    const view_proof = await collect_proof(page, viewport);

    proof.viewports.push(view_proof);

    if (capture_kind === 'after') {
      assert(view_proof.repeatBands.length > 0, 'Repeat cues are missing.');
      assert(view_proof.noteheadCount > 0, 'Rendered score has no noteheads.');
      assert(
        view_proof.repeatBands.every(
          (band) =>
            band.cssHeight <= 18 &&
            band.background === 'rgba(0, 0, 0, 0)' &&
            !band.noteheadOverlap &&
            !band.notationOverlap,
        ),
        `Repeat cue geometry is unsafe at ${viewport.width}x${viewport.height}.`,
      );
      assert(
        !view_proof.credits || view_proof.credits.right <= viewport.width - 8,
        `Score credit clips at ${viewport.width}x${viewport.height}.`,
      );
    }
  }
}

async function capture_repeat_crop(page) {
  await page.setViewportSize(viewports[0]);

  const labelled = page.locator('[data-repeat-label="true"]');
  const labelled_count = await labelled.count();
  const cues =
    labelled_count > 0
      ? labelled
      : page.locator('[data-testid^="notation-pattern-"]');
  const cue_count = await cues.count();

  assert(cue_count > 0, 'The Loyal score did not expose a repeat cue.');

  const cue = cues.nth(0);

  await cue.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'center' }),
  );
  await page.waitForTimeout(180);

  const box = await cue.boundingBox();

  assert(box, 'Repeat cue is not measurable.');

  const clip_x = Math.max(0, box.x - 40);
  const clip_y = Math.max(0, box.y - 110);

  await page.screenshot({
    animations: 'disabled',
    path: path.join(output_dir, `02-repeated-passage-${capture_kind}.png`),
    clip: {
      x: clip_x,
      y: clip_y,
      width: Math.min(680, viewports[0].width - clip_x),
      height: Math.min(260, viewports[0].height - clip_y),
    },
  });
}

async function run() {
  assert(fs.existsSync(main_entry), `Build output missing at ${main_entry}.`);
  assert(
    fs.existsSync(source_config),
    `Fixture config missing at ${source_config}.`,
  );

  const user_data_dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-repeat-fix-'),
  );
  const page_errors = [];

  fs.copyFileSync(source_config, path.join(user_data_dir, 'config.json'));

  const app = await electron.launch({
    args: [main_entry, '--mute-audio'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SK_USER_DATA_DIR: user_data_dir,
      START_MINIMIZED: '1',
    },
  });

  try {
    const page = await app.firstWindow();

    page.on('pageerror', (error) => page_errors.push(String(error)));
    await page.setViewportSize(viewports[0]);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await configure_page(page);
    await open_practice(page);
    await capture_viewports(page);
    await capture_repeat_crop(page);
    assert.deepEqual(page_errors, [], 'Renderer emitted page errors.');
  } finally {
    proof.pageErrors = page_errors;
    fs.writeFileSync(
      path.join(output_dir, `capture-${capture_kind}.json`),
      `${JSON.stringify(proof, null, 2)}\n`,
    );
    await app.close();
    fs.rmSync(user_data_dir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
