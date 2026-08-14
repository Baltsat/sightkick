import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output_dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output_dir, '../../..');
const main_entry = path.join(root, 'out', 'main', 'index.js');
const source_config = path.join(
  root,
  '.userdata',
  'live-import',
  'config.json',
);
const user_data_dir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'drumroll-one-search-'),
);
const imported_song_id = '7b64e4c0-e66f-4a41-91f8-40777c033f39';
const query = '3 Nights One Search Proof';
const candidate = {
  videoId: 'one-search-proof',
  title: 'Dominic Fike – 3 Nights (One Search Proof)',
  uploader: 'Dominic Fike',
  durationSeconds: 179,
  watchUrl: 'https://www.youtube.com/watch?v=one-search-proof',
};
const notes = {
  mode: 'isolated Electron renderer with deterministic main-process search and import events',
  page_errors: [],
  legacy_surface_counts: {},
  captures: [],
};

function to_song(stored) {
  const rating = Number.parseInt(stored.diff_drums ?? '', 10);

  return {
    id: stored.id,
    dir: stored.dir,
    albumCover: stored.albumCover ?? undefined,
    name: stored.name ?? '',
    artist: stored.artist ?? '',
    album: stored.album ?? '',
    charter: stored.charter ?? '',
    autoChartTool: stored.auto_chart_tool?.trim() || undefined,
    genre: stored.genre ?? '',
    year: stored.year ?? '',
    fiveLaneDrums: stored.five_lane_drums === 'True',
    proDrums: stored.pro_drums === 'True',
    delaySeconds: (Number(stored.delay) || 0) / 1000,
    drumDifficulty: Number.isNaN(rating) || rating < 0 ? 0 : rating,
    format: stored.format,
    audio: stored.audio,
    drumDifficulties: stored.drumDifficulties,
    liked: stored.liked,
    updatedAt: stored.updatedAt,
    scoreData: stored.scoreData,
    playability: stored.playability,
  };
}

async function emit_renderer(app, channel, payload) {
  await app.evaluate(
    ({ BrowserWindow }, { next_channel, next_payload }) => {
      const window = BrowserWindow.getAllWindows()[0];

      if (!window) {
        throw new Error('No Electron window available for renderer event');
      }

      window.webContents.send(next_channel, next_payload);
    },
    { next_channel: channel, next_payload: payload },
  );
}

async function hold_network_handlers(app) {
  const counts = await app.evaluate(({ ipcMain }) => {
    const search_listeners = ipcMain.listeners('search-youtube');
    const import_listeners = ipcMain.listeners('create-auto-chart');

    ipcMain.removeAllListeners('search-youtube');
    ipcMain.removeAllListeners('create-auto-chart');

    return {
      search: search_listeners.length,
      import: import_listeners.length,
    };
  });

  if (counts.search === 0 || counts.import === 0) {
    throw new Error('Expected search and import handlers before capture');
  }
}

async function capture(page, name) {
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output_dir, name),
  });
  notes.captures.push(name);
}

async function record_legacy_surface_counts(page) {
  const selectors = {
    add_music_actions: '[data-testid="add-music-actions"]',
    import_song_trigger: '[data-testid="import-song-trigger"]',
    my_music_trigger: '[data-testid="my-music-trigger"]',
    create_chart_trigger: '[data-testid="create-chart-trigger"]',
    auto_chart_progress: '[data-testid="auto-chart-progress"]',
    local_audio_copy: 'text=Choose a local audio file instead',
    remote_transcriber_endpoint:
      'label:has-text("Remote transcriber endpoint")',
  };

  for (const [name, selector] of Object.entries(selectors)) {
    const count = await page.locator(selector).count();

    notes.legacy_surface_counts[name] = count;

    if (count !== 0) {
      throw new Error(`Legacy surface still visible: ${name}`);
    }
  }
}

async function run() {
  if (!fs.existsSync(main_entry)) {
    throw new Error(`Build output missing at ${main_entry}`);
  }

  const config = JSON.parse(fs.readFileSync(source_config, 'utf8'));
  const stored_song = config.songs?.[imported_song_id];

  if (!stored_song) {
    throw new Error(`Fixture song missing: ${imported_song_id}`);
  }

  const imported_song = to_song(stored_song);

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

    page.on('pageerror', (error) => notes.page_errors.push(String(error)));
    await page.setViewportSize({ width: 1280, height: 800 });
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
    });
    await page.reload();
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await hold_network_handlers(app);
    await page.getByTestId('view-songs').click();
    await page.getByTestId('library-toolbar').waitFor({ timeout: 30_000 });
    await page
      .getByTestId('library-shelf-ready-now')
      .waitFor({ timeout: 30_000 });
    await page
      .getByTestId('library-shelf-favourites')
      .waitFor({ timeout: 30_000 });
    await page
      .getByTestId('library-shelf-recently-imported')
      .waitFor({ timeout: 30_000 });
    await page.getByTestId('browse-all-library').waitFor({ timeout: 30_000 });
    await record_legacy_surface_counts(page);
    await capture(page, '05-one-search-library.png');

    const input = page.getByTestId('song-search');

    await input.fill(query);
    await page.waitForTimeout(400);
    await emit_renderer(app, 'search-youtube', { results: [candidate] });
    await page
      .getByTestId('song-search-result-one-search-proof')
      .waitFor({ timeout: 30_000 });
    await capture(page, '06-one-search-results.png');

    await page.getByTestId('song-search-result-one-search-proof').click();
    await page
      .getByTestId('song-search-import-row')
      .waitFor({ timeout: 30_000 });
    await emit_renderer(app, 'auto-chart-update', {
      id: 'one-search-proof-job',
      attempt: 1,
      stage: 'downloading',
      message: 'Downloading audio from YouTube',
      percent: 42,
      backend: 'sightkick',
      youtubeUrl: candidate.watchUrl,
      autoImport: true,
      jobs: [],
    });
    await page
      .getByTestId('song-search-import-progress')
      .waitFor({ timeout: 30_000 });
    await capture(page, '07-one-search-importing.png');

    await emit_renderer(app, 'auto-chart-update', {
      id: 'one-search-proof-job',
      attempt: 1,
      stage: 'imported',
      message: `Added ${imported_song.name} to your library`,
      backend: 'sightkick',
      youtubeUrl: candidate.watchUrl,
      autoImport: true,
      jobs: [],
      song: imported_song,
    });
    await page.waitForTimeout(1_000);
    await page.getByTestId('flow-notation').waitFor({ timeout: 60_000 });
    notes.imported_song_title_loaded = await page
      .locator('[title]')
      .evaluateAll(
        (elements, song_name) =>
          elements.some(
            (element) => element.getAttribute('title') === song_name,
          ),
        imported_song.name,
      );

    if (!notes.imported_song_title_loaded) {
      throw new Error(`Opened song title missing: ${imported_song.name}`);
    }

    await capture(page, '08-one-search-song-open.png');

    if (notes.page_errors.length > 0) {
      throw new Error(`Renderer errors: ${notes.page_errors.join('; ')}`);
    }
  } finally {
    fs.writeFileSync(
      path.join(output_dir, 'capture-notes.json'),
      `${JSON.stringify(notes, null, 2)}\n`,
    );
    await app.close();
    fs.rmSync(user_data_dir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
