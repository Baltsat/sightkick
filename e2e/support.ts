import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { _electron as electron, ElectronApplication } from '@playwright/test';

const MAIN_ENTRY = path.join(__dirname, '..', 'out', 'main', 'index.js');

export interface Harness {
  app: ElectronApplication;
  importDir: string;
  libraryDir: string;
}

const ALBUM_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const EXPERT_DRUM_CHART = [
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
  '  0 = N 0 0',
  '  480 = N 1 0',
  '  960 = N 0 0',
  '  1440 = N 1 0',
  '  1920 = N 0 0',
  '  2400 = N 2 0',
  '  2400 = N 66 0',
  '  2880 = N 0 0',
  '  3360 = N 1 0',
  '}',
  '',
].join('\n');

function writeFixtureLibrary(): string {
  const libraryDir = mkdtempSync(path.join(tmpdir(), 'sightkick-library-'));
  const songDir = path.join(libraryDir, 'test-song');

  mkdirSync(songDir, { recursive: true });

  writeFileSync(path.join(songDir, 'album.png'), ALBUM_PNG);

  writeFileSync(
    path.join(songDir, 'song.ini'),
    [
      '[song]',
      'name = Master of Puppets',
      'artist = Metallica',
      'charter = Test Charter',
      'pro_drums = True',
      'five_lane_drums = False',
      'diff_drums = 4',
      '',
    ].join('\n'),
  );

  writeFileSync(path.join(songDir, 'notes.chart'), EXPERT_DRUM_CHART);

  return libraryDir;
}

function writeImportFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'sightkick-import-'));
  const songDir = path.join(root, 'prepared-song');

  mkdirSync(songDir);
  writeFileSync(path.join(songDir, 'album.png'), ALBUM_PNG);
  writeFileSync(path.join(songDir, 'notes.chart'), EXPERT_DRUM_CHART);
  writeFileSync(path.join(songDir, 'song.mp3'), 'test audio');
  writeFileSync(
    path.join(songDir, 'song.ini'),
    [
      '[song]',
      'name = Raging',
      'artist = Kygo feat. Kodaline',
      'album = Cloud Nine',
      'auto_chart = True',
      'auto_chart_tool = STRUM (OCTAVE AI auto-charter)',
      'charter = STRUM',
      'pro_drums = True',
      'five_lane_drums = False',
      'diff_drums = 2',
      '',
    ].join('\n'),
  );

  return songDir;
}

function seedUserData(seed: Record<string, unknown>): string {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'sightkick-userdata-'));

  writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify(seed, undefined, 2),
  );

  return userDataDir;
}

export async function launchApp(
  options: { seedLibrary?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<Harness> {
  const libraryDir = writeFixtureLibrary();
  const importDir = writeImportFixture();
  const userDataDir = seedUserData(
    options.seedLibrary ? { lastOpenedPath: libraryDir } : {},
  );
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, '--mute-audio'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      START_MINIMIZED: '1',
      ...options.env,
    },
  });

  return { app, importDir, libraryDir };
}
