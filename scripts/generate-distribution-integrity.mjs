import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultFfmpegRuntimeRoot,
  ffmpegRuntimeContract,
} from './ffmpeg-runtime-contract.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputPath = path.join(repoRoot, 'distribution-integrity.json');
const lessonRoot = path.join(repoRoot, 'web/public/library');
const sourceRoot = path.join(repoRoot, 'resources/library-sources');
const ffmpegRoot = defaultFfmpegRuntimeRoot(repoRoot);
const ffmpegBinaryPath = path.join(ffmpegRoot, 'bin', 'ffmpeg');
const ffprobeBinaryPath = path.join(ffmpegRoot, 'bin', 'ffprobe');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
);

function sha256(filePath) {
  const hash = crypto.createHash('sha256');

  hash.update(fs.readFileSync(filePath));

  return hash.digest('hex');
}

function record(filePath) {
  const stats = fs.statSync(filePath);

  if (!stats.isFile()) {
    throw new Error(`Expected a regular file: ${filePath}`);
  }

  return { bytes: stats.size, sha256: sha256(filePath) };
}

function walkFiles(root, relative = '') {
  const directory = path.join(root, relative);

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((entry) => {
      const child = path.join(relative, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(`Distribution input must not be a symlink: ${child}`);
      }

      if (entry.isDirectory()) {
        return walkFiles(root, child);
      }

      if (!entry.isFile()) {
        throw new Error(`Unsupported distribution input: ${child}`);
      }

      return [child.split(path.sep).join('/')];
    });
}

function manifestRecord(fileName, expectedTrackCount) {
  const sourcePath = path.join(sourceRoot, fileName);
  const manifest = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

  if (
    manifest.tracks?.length !== expectedTrackCount ||
    manifest.completeness?.declaredTrackCount !== expectedTrackCount
  ) {
    throw new Error(
      `${fileName} does not contain ${expectedTrackCount} tracks.`,
    );
  }

  return {
    ...record(sourcePath),
    trackCount: expectedTrackCount,
    canonicalSha256: manifest.integrity?.canonicalSha256,
  };
}

const lessonManifest = JSON.parse(
  fs.readFileSync(path.join(lessonRoot, 'manifest.json'), 'utf8'),
);

if (
  lessonManifest.lessonCount !== 170 ||
  lessonManifest.lessons?.length !== 170
) {
  throw new Error(
    'The packaged lesson source must contain exactly 170 lessons.',
  );
}

const lessonFiles = walkFiles(lessonRoot).map((relativePath) => ({
  path: relativePath,
  ...record(path.join(lessonRoot, relativePath)),
}));

execFileSync(
  process.execPath,
  [path.join(repoRoot, 'scripts', 'verify-ffmpeg-runtime.mjs'), ffmpegRoot],
  { stdio: 'inherit' },
);

const ffmpegOutput = execFileSync(ffmpegBinaryPath, ['-version'], {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
});
const ffmpegLines = ffmpegOutput.split(/\r?\n/);
const ffmpegProvenance = JSON.parse(
  fs.readFileSync(path.join(ffmpegRoot, 'provenance.json'), 'utf8'),
);
const ffmpegFiles = walkFiles(ffmpegRoot).map((relativePath) => ({
  path: relativePath,
  ...record(path.join(ffmpegRoot, relativePath)),
}));

function linkedLibraries(binaryPath) {
  return execFileSync('otool', ['-L', binaryPath], { encoding: 'utf8' })
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(' (compatibility version', 1)[0])
    .filter(Boolean);
}

const integrity = {
  schemaVersion: 2,
  application: {
    productName: packageJson.build.productName,
    releaseVersion: packageJson.version,
    shortVersion: packageJson.build.mac.bundleShortVersion,
    buildVersion: packageJson.build.mac.bundleVersion,
  },
  lessonLibrary: {
    lessonCount: 170,
    files: lessonFiles,
  },
  librarySources: {
    'yandex-drums-2026-08-09.json': manifestRecord(
      'yandex-drums-2026-08-09.json',
      13,
    ),
    'yandex-favorites-2026-08-10.json': manifestRecord(
      'yandex-favorites-2026-08-10.json',
      230,
    ),
  },
  notices: {
    'Drumroll-MIT.txt': record(path.join(repoRoot, 'LICENSE')),
    'THIRD_PARTY_NOTICES.md': record(
      path.join(repoRoot, 'THIRD_PARTY_NOTICES.md'),
    ),
  },
  ffmpeg: {
    runtimeId: ffmpegRuntimeContract.runtimeId,
    version: ffmpegRuntimeContract.version,
    license: ffmpegRuntimeContract.license,
    source: ffmpegRuntimeContract.source,
    architecture: ffmpegRuntimeContract.architecture,
    minimumMacOSVersion: ffmpegRuntimeContract.minimumMacOSVersion,
    externalLibraries: ffmpegRuntimeContract.externalLibraries,
    files: ffmpegFiles,
    versionLine: ffmpegLines.find((line) => line.startsWith('ffmpeg version')),
    configurationLine: ffmpegLines.find((line) =>
      line.startsWith('configuration:'),
    ),
    provenance: ffmpegProvenance,
    linkedLibraries: {
      ffmpeg: linkedLibraries(ffmpegBinaryPath),
      ffprobe: linkedLibraries(ffprobeBinaryPath),
    },
  },
};

if (!integrity.ffmpeg.versionLine || !integrity.ffmpeg.configurationLine) {
  throw new Error('The packaged FFmpeg binary did not report its provenance.');
}

fs.writeFileSync(outputPath, `${JSON.stringify(integrity, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(repoRoot, outputPath)} with ${
    lessonFiles.length
  } lesson-library file hashes.`,
);
