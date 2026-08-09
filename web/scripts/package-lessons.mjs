import { execFileSync } from 'node:child_process';
import {
  cpSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const generatedRoot = mkdtempSync(path.join(tmpdir(), 'drumroll-lessons-'));
const libraryRoot = path.join(repoRoot, 'web/public/library');
const librarySourcesRoot = path.join(repoRoot, 'web/public/library-sources');
const yandexSourceFiles = [
  'yandex-drums-2026-08-09.json',
  'yandex-favorites-2026-08-10.json',
];
const maxPagesFileBytes = 25 * 1024 * 1024;
const cachedFfmpegDir = path.join(
  repoRoot,
  'node_modules',
  '.cache',
  'drumroll-ffmpeg',
  'macos-arm64',
  'bin',
);
const requestedFfmpegDir = process.env.DRUMROLL_FFMPEG_DIR;
const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffmpegDir = [requestedFfmpegDir, cachedFfmpegDir].find(
  (candidate) =>
    candidate &&
    statSync(path.join(candidate, ffmpegName), {
      throwIfNoEntry: false,
    })?.isFile(),
);
const expectedLessonCount = 170;

function parseIni(raw) {
  const values = {};

  for (const source of raw.split(/\r?\n/)) {
    const line = source.trim();

    if (
      !line ||
      line.startsWith('[') ||
      line.startsWith(';') ||
      line.startsWith('#')
    ) {
      continue;
    }

    const split = line.indexOf('=');

    if (split === -1) {
      continue;
    }

    values[line.slice(0, split).trim()] = line
      .slice(split + 1)
      .trim()
      .replace(/^"|"$/g, '');
  }

  return values;
}

try {
  execFileSync(
    'uv',
    [
      'run',
      '--python',
      '3.12',
      '--with',
      'pyyaml',
      'python',
      'resources/lessons/generate.py',
      '--out-dir',
      generatedRoot,
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: [ffmpegDir, process.env.PATH]
          .filter(Boolean)
          .join(path.delimiter),
      },
    },
  );

  const folders = readdirSync(generatedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (folders.length !== expectedLessonCount) {
    throw new Error(
      `Expected ${expectedLessonCount} generated lessons, got ${folders.length}.`,
    );
  }

  rmSync(libraryRoot, { recursive: true, force: true });
  mkdirSync(libraryRoot, { recursive: true });

  let totalBytes = 0;
  let maxFileBytes = 0;
  const lessons = folders.map((folder) => {
    const source = path.join(generatedRoot, folder);
    const destination = path.join(libraryRoot, folder);
    const files = readdirSync(source).sort();
    const ini = parseIni(readFileSync(path.join(source, 'song.ini'), 'utf8'));
    const base = `/library/${encodeURIComponent(folder)}`;

    cpSync(source, destination, { recursive: true });

    for (const file of files) {
      const bytes = statSync(path.join(source, file)).size;

      totalBytes += bytes;
      maxFileBytes = Math.max(maxFileBytes, bytes);

      if (bytes >= maxPagesFileBytes) {
        throw new Error(
          `${folder}/${file} is ${bytes} bytes; Cloudflare Pages requires files under 25 MiB.`,
        );
      }
    }

    return {
      song: {
        id: `lesson:${ini.sk_lesson_id}`,
        dir: base,
        name: ini.name || folder,
        artist: 'Drumroll Method',
        album: ini.album || '',
        charter: ini.charter || '',
        genre: ini.genre || 'Lesson',
        year: ini.year || '',
        fiveLaneDrums: ini.five_lane_drums === 'True',
        proDrums: ini.pro_drums === 'True',
        delaySeconds: (Number(ini.delay) || 0) / 1000,
        drumDifficulty: Math.max(0, Number(ini.diff_drums) || 0),
        format: 'mid',
        audio: [
          { name: 'drums.ogg', src: `${base}/drums.ogg` },
          { name: 'song.ogg', src: `${base}/song.ogg` },
        ],
        drumDifficulties: ['expert'],
        lesson: {
          id: ini.sk_lesson_id,
          starsToUnlock: Number(ini.sk_stars_to_unlock) || 0,
          next: ini.sk_next || undefined,
          unit: ini.sk_unit || '',
          title: ini.sk_lesson_title || '',
          skills: (ini.sk_skills || '')
            .split(',')
            .map((skill) => skill.trim())
            .filter(Boolean),
          prerequisiteIds: (ini.sk_prerequisite_ids || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
          targetLanes: (ini.sk_target_lanes || '')
            .split(',')
            .flatMap((entry) => {
              const [element, rawWeight] = entry.trim().split(':');
              const weight = Number(rawWeight);

              return element && Number.isFinite(weight) && weight > 0
                ? [{ element, weight }]
                : [];
            }),
          bpmStart: Number(ini.sk_bpm_start) || undefined,
          bpmTarget: Number(ini.sk_bpm_target) || undefined,
          doseRule: ini.sk_dose_rule || undefined,
          masteryRule: ini.sk_mastery_rule || undefined,
          cue: ini.sk_cue || undefined,
          assessmentBoundary: ini.sk_assessment_boundary || undefined,
        },
      },
      chart: `${base}/notes.mid`,
      files,
    };
  });
  const manifest = {
    version: 1,
    lessonCount: lessons.length,
    totalBytes,
    maxFileBytes,
    lessons,
  };

  writeFileSync(
    path.join(libraryRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  mkdirSync(librarySourcesRoot, { recursive: true });
  yandexSourceFiles.forEach((sourceFile) => {
    copyFileSync(
      path.join(repoRoot, 'resources/library-sources', sourceFile),
      path.join(librarySourcesRoot, sourceFile),
    );
  });
  console.log(
    JSON.stringify({
      lessonCount: lessons.length,
      totalBytes,
      maxFileBytes,
      librarySourceFiles: yandexSourceFiles,
    }),
  );
} finally {
  rmSync(generatedRoot, { recursive: true, force: true });
}
