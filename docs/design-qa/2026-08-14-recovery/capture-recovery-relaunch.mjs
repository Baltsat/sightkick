import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(outputDir, '../../..');
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const songId = 'lesson:01.01';
const configPathFor = (userDataDir) => path.join(userDataDir, 'config.json');

function readConfig(userDataDir) {
  return JSON.parse(fs.readFileSync(configPathFor(userDataDir), 'utf8'));
}

function checkpointsFor(config, id) {
  return config.practiceAttemptCheckpoints?.[id] ?? [];
}

function writeJson(name, value) {
  fs.writeFileSync(
    path.join(outputDir, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

async function launch(userDataDir) {
  const app = await electron.launch({
    args: [mainEntry, '--mute-audio'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SK_USER_DATA_DIR: userDataDir,
      START_MINIMIZED: '1',
    },
  });
  const page = await app.firstWindow();

  await page.setViewportSize({ width: 1225, height: 768 });
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });

  return { app, page };
}

async function configureKeyboard(page) {
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
      JSON.stringify({ snare: ['keyboard:KeyJ'] }),
    );
    localStorage.setItem('settings.controlMappings', '{}');
    localStorage.setItem('settings.countIn', 'false');
    localStorage.setItem('settings.adaptiveTutorEnabled', 'false');
    localStorage.setItem('settings.handsFreeControlsEnabled', 'false');
    localStorage.setItem('settings.challengeLivesEnabled', 'false');
  });
  await page.reload();
  await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
}

async function openLessonPractice(page) {
  await page.getByTestId('view-songs').click();
  await page.getByTestId('song-search').waitFor({ timeout: 30_000 });
  await page.getByTestId('song-search').fill('Lesson 01.01');
  await page.getByTestId('song-item-lesson:01.01').click();
  await page.getByTestId('game-mode-practice').click();
  await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
  await page
    .locator('.drumroll-practice-shell[data-session-phase="ready"]')
    .waitFor({ timeout: 30_000 });
}

async function traceCheckpointLoads(page) {
  await page.evaluate(() => {
    globalThis.__drumrollCheckpointLoads = [];
    window.electron.ipcRenderer.on(
      'load-practice-attempt-checkpoints',
      (response) => {
        globalThis.__drumrollCheckpointLoads.push(response);
      },
    );
  });
}

async function checkpointLoads(page) {
  return page.evaluate(() => globalThis.__drumrollCheckpointLoads ?? []);
}

async function startAndPlay(page) {
  const shell = page.locator('.drumroll-practice-shell');
  const playToggle = page.getByTestId('play-toggle');

  await playToggle.click();

  try {
    await page
      .locator('.drumroll-practice-shell[data-session-phase="playing"]')
      .waitFor({ timeout: 30_000 });
  } catch (error) {
    await page.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, '00-start-failure.png'),
    });

    const phase = await shell.getAttribute('data-session-phase');
    const playState = await playToggle.getAttribute('aria-label');

    throw new Error(
      `Practice did not begin after Play: phase=${phase}, control=${playState}. ${error}`,
      { cause: error },
    );
  }

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(180);
  }
}

async function waitForRecordedCheckpoint(page, userDataDir) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const checkpoints = checkpointsFor(readConfig(userDataDir), songId);
    const checkpoint = checkpoints
      .filter(
        (candidate) =>
          candidate.state === 'in-progress' && candidate.records.length > 0,
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .at(-1);

    if (checkpoint && checkpoint.positionTick > 0) {
      return checkpoint;
    }

    await page.waitForTimeout(250);
  }

  throw new Error('No persisted checkpoint with recorded progress appeared.');
}

async function forceQuit(app) {
  const process = app.process();
  const exited = new Promise((resolve) => process.once('exit', resolve));

  process.kill('SIGKILL');
  await exited;
}

async function run() {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-recovery-proof-'),
  );
  let first;
  let second;

  try {
    first = await launch(userDataDir);
    await configureKeyboard(first.page);
    await openLessonPractice(first.page);
    await startAndPlay(first.page);

    const before = await waitForRecordedCheckpoint(first.page, userDataDir);

    await first.page.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, '01-live-before-force-quit.png'),
    });
    writeJson('checkpoint-before-force-quit.json', before);

    await forceQuit(first.app);
    first = undefined;

    second = await launch(userDataDir);
    await traceCheckpointLoads(second.page);
    await openLessonPractice(second.page);
    await second.page.waitForFunction(
      (id) =>
        globalThis.__drumrollCheckpointLoads.some(
          (response) => response.songId === id,
        ),
      songId,
      { timeout: 30_000 },
    );

    const loadedCheckpoints = await checkpointLoads(second.page);
    const cue = second.page.locator(
      '[data-testid="practice-readiness-cue"][data-phase="ready"]',
    );

    await cue.waitFor({ timeout: 30_000 });
    await second.page.screenshot({
      animations: 'disabled',
      path: path.join(outputDir, '02-relaunched-recovery-ui.png'),
    });

    let resumeCue = '';
    const deadline = Date.now() + 20_000;

    while (Date.now() < deadline) {
      resumeCue = (await cue.innerText()).replace(/\s+/g, ' ').trim();

      if (/^Ready Resume bar \d+ · kick to count in /.test(resumeCue)) {
        break;
      }

      await second.page.waitForTimeout(250);
    }

    const afterCheckpoints = checkpointsFor(readConfig(userDataDir), songId);
    const after = afterCheckpoints.find(
      (checkpoint) => checkpoint.sessionId === before.sessionId,
    );
    const recordsPreserved =
      after !== undefined &&
      JSON.stringify(after.records) === JSON.stringify(before.records);
    const tickPreserved = after?.positionTick === before.positionTick;

    writeJson('checkpoints-after-relaunch.json', afterCheckpoints);
    writeJson('ipc-checkpoint-load.json', loadedCheckpoints);

    if (after) {
      writeJson('checkpoint-after-relaunch.json', after);
    }

    writeJson('recovery-evidence.json', {
      lifecycle:
        'Electron process launched from out/main/index.js, then its main process received SIGKILL and relaunched with the same isolated user-data directory.',
      songId,
      recordedProgress: {
        sessionId: before.sessionId,
        recordCount: before.records.length,
        positionTick: before.positionTick,
        recordsPreserved,
        tickPreserved,
      },
      resumedUi: resumeCue,
      expectedResumeCue: 'Ready Resume bar N · kick to count in',
      loadedCheckpoints,
      passed: /^Ready Resume bar \d+ · kick to count in /.test(resumeCue),
    });

    assert.match(resumeCue, /^Ready Resume bar \d+ · kick to count in /);

    assert.ok(after, 'The interrupted checkpoint was missing after relaunch.');
    assert.equal(recordsPreserved, true);
    assert.equal(tickPreserved, true);

    fs.renameSync(
      path.join(outputDir, '02-relaunched-recovery-ui.png'),
      path.join(outputDir, '02-resumed-after-relaunch.png'),
    );
    fs.writeFileSync(
      path.join(outputDir, 'README.md'),
      `# real Electron recovery proof\n\n- launched the built Electron main process from \`out/main/index.js\` with an isolated temporary profile\n- entered \`Lesson 01.01\` in Practice, played twelve mapped snare strikes, and waited for a non-empty on-disk checkpoint\n- sent \`SIGKILL\` to the Electron main process, then relaunched the same profile\n- verified the original session id, recorded hit journal, and chart tick were byte-for-byte unchanged in the Electron store\n- verified the resumed practice UI says \`${resumeCue}\`\n\nArtifacts:\n\n- \`01-live-before-force-quit.png\`\n- \`02-resumed-after-relaunch.png\`\n- \`checkpoint-before-force-quit.json\`\n- \`checkpoint-after-relaunch.json\`\n- \`recovery-evidence.json\`\n`,
    );
  } finally {
    await second?.app.close().catch(() => undefined);
    await first?.app.close().catch(() => undefined);
    fs.rmSync(userDataDir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
