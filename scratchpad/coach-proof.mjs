import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const SONG_ID = 'coach-proof-song';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const chart = [
  '[Song]',
  '{',
  '  Resolution = 480',
  '}',
  '[SyncTrack]',
  '{',
  '  0 = TS 4',
  '  0 = B 120000',
  '}',
  '[ExpertDrums]',
  '{',
  ...Array.from({ length: 16 }, (_, index) => {
    const tick = index * 240;
    const notes = [`  ${tick} = N 2 0`, `  ${tick} = N 66 0`];

    if (index % 4 === 0) {
      notes.push(`  ${tick} = N 0 0`);
    }

    if (index % 4 === 2) {
      notes.push(`  ${tick} = N 1 0`);
    }

    return notes.join('\n');
  }),
  ...Array.from({ length: 8 }, (_, index) => {
    const tick = 3840 + index * 240;
    const lane = 2 + (index % 3);

    return [`  ${tick} = N ${lane} 0`, `  ${tick} = N 0 0`].join('\n');
  }),
  ...Array.from({ length: 16 }, (_, index) => {
    const tick = 5760 + index * 240;
    const notes = [`  ${tick} = N 2 0`, `  ${tick} = N 66 0`];

    if (index % 4 === 0) {
      notes.push(`  ${tick} = N 0 0`);
    }

    if (index % 4 === 2) {
      notes.push(`  ${tick} = N 1 0`);
    }

    return notes.join('\n');
  }),
  '}',
  '',
].join('\n');

function record(tick, element, verdict, deltaMs = 0, velocity = 96) {
  return { tick, deltaMs, element, verdict, velocity };
}

function run(completedAt, playbackSpeed, overallAccuracy, fast) {
  const records = [
    record(0, 'kick', 'hit', fast ? 54 : 34),
    record(240, 'hihat', 'hit', fast ? -32 : -12),
    record(480, 'snare', 'hit', 5),
    record(720, 'hihat', 'hit', fast ? -36 : -8),
    record(960, 'kick', 'hit', fast ? 58 : 32),
    record(1200, 'hihat', 'hit', fast ? -31 : -9),
    record(1440, 'snare', 'hit', 4),
    record(1680, 'hihat', 'hit', fast ? -35 : -11),
    record(1920, 'kick', 'hit', fast ? 62 : 36),
    record(2160, 'tom1', 'miss'),
    record(2160, 'snare', 'wrong'),
    record(2400, 'tom2', fast ? 'miss' : 'hit', fast ? 0 : 12),
    record(2640, 'tom3', 'miss'),
    record(2880, 'kick', fast ? 'miss' : 'hit', fast ? 0 : 38),
    record(3120, 'tom1', fast ? 'miss' : 'hit', fast ? 0 : 18),
    record(3360, 'tom2', 'miss'),
    record(3600, 'tom3', fast ? 'miss' : 'hit', fast ? 0 : 20),
    record(3840, 'kick', 'hit', fast ? 65 : 40),
    record(4080, 'tom2', 'miss'),
    record(4320, 'tom3', fast ? 'miss' : 'hit', fast ? 0 : 16),
    record(4560, 'tom1', 'miss'),
    record(4800, 'kick', fast ? 'miss' : 'hit', fast ? 0 : 42),
    record(5040, 'tom3', 'miss'),
    record(5280, 'tom1', fast ? 'miss' : 'hit', fast ? 0 : 15),
    record(5520, 'tom2', 'miss'),
  ];
  const hits = records.filter(({ verdict }) => verdict === 'hit').length;
  const misses = records.filter(({ verdict }) => verdict === 'miss').length;
  const totalWrong = records.filter(
    ({ verdict }) => verdict === 'wrong',
  ).length;
  const summary = {
    completedAt,
    totalHits: hits,
    totalMisses: misses,
    totalWrong,
    overallAccuracy,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: fast ? 28 : 17,
      medianMs: fast ? 31 : 16,
      spreadMs: fast ? 38 : 21,
      earlyCount: 4,
      lateCount: 8,
      onTimeCount: 2,
      sampleCount: hits,
    },
    wrongHitCounts: [{ element: 'snare', count: 1 }],
    mode: 'practice',
    playbackSpeed,
    difficulty: 'expert',
  };

  return { summary, records };
}

async function main() {
  const outputDir = process.argv[2] ?? path.join(currentDir, 'coach-shots');
  const libraryDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-coach-library-'),
  );
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-coach-userdata-'),
  );
  const songDir = path.join(libraryDir, 'coach-proof');

  fs.mkdirSync(songDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(songDir, '.sightkick'),
    JSON.stringify({ id: SONG_ID }),
  );
  fs.writeFileSync(
    path.join(songDir, 'song.ini'),
    [
      '[song]',
      'name = Pressure Test',
      'artist = Drumroll Lab',
      'charter = Coach proof',
      'pro_drums = True',
      'five_lane_drums = False',
      'diff_drums = 4',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(songDir, 'notes.chart'), chart);
  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ lastOpenedPath: libraryDir }),
  );

  const app = await electron.launch({
    args: [
      path.join(currentDir, '..', 'out', 'main', 'index.js'),
      '--mute-audio',
    ],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      START_MINIMIZED: '1',
      SK_USER_DATA_DIR: userDataDir,
    },
  });

  try {
    const page = await app.firstWindow();

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('heading', { name: 'Your drum library' }).waitFor();
    await page.getByTestId('settings-trigger').click();
    await page.getByTestId('rescan-folder').click();
    await page.getByTestId(`song-item-${SONG_ID}`).waitFor({ timeout: 60_000 });
    await page.evaluate(
      ({ songId, runs }) => {
        runs.forEach((payload) => {
          window.electron.ipcRenderer.sendMessage('save-practice-run', {
            songId,
            ...payload,
          });
        });
      },
      {
        songId: SONG_ID,
        runs: [
          run('2026-08-09T03:00:00.000Z', 0.7, 0.94, false),
          run('2026-08-09T03:08:00.000Z', 1, 0.52, true),
        ],
      },
    );
    await page.getByRole('heading', { name: 'Your drum library' }).click();
    await page.getByTestId(`song-item-${SONG_ID}`).click();
    await page.getByTestId('game-mode-practice').click();
    await page.getByTestId('ai-coach-button').waitFor({ timeout: 30_000 });
    await page.getByTestId('ai-coach-button').click();
    await page
      .getByTestId('coach-finding-trouble-bars')
      .waitFor({ timeout: 30_000 });
    await page.getByTestId('coach-notation').first().waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}',
    });
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(outputDir, 'coach-panel.png') });

    const cardBox = await page
      .getByTestId('coach-finding-trouble-bars')
      .first()
      .boundingBox();

    if (!cardBox) {
      throw new Error('Trouble-bar card has no visible bounds');
    }

    await page.screenshot({
      path: path.join(outputDir, 'trouble-bars-card.png'),
      clip: cardBox,
    });

    const evidence = await page.evaluate(() => ({
      findings: document.querySelectorAll('[data-testid^="coach-finding-"]')
        .length,
      notationSnippets: document.querySelectorAll(
        '[data-testid="coach-notation"] svg',
      ).length,
      practiceActions: document.querySelectorAll(
        '[data-testid="coach-practice-bars"]',
      ).length,
      lessonActions: document.querySelectorAll(
        '[data-testid="coach-train-skill"]',
      ).length,
    }));

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    const closed = new Promise((resolve) => app.once('close', resolve));

    void app
      .evaluate(({ app: electronApp }) => electronApp.exit(0))
      .catch(() => undefined);
    await closed;
    fs.rmSync(libraryDir, { recursive: true, force: true });
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
