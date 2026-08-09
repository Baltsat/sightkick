import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultFfmpegRuntimeRoot,
  ffmpegRuntimeContract,
} from './ffmpeg-runtime-contract.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const commandArguments = process.argv.slice(2);
const packagedMode = commandArguments.includes('--packaged');
const runtimeArgument = commandArguments.find(
  (argument) => argument !== '--packaged',
);
const runtimeRoot = path.resolve(
  runtimeArgument ?? defaultFfmpegRuntimeRoot(repoRoot),
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function output(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function tableHas(outputText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`^\\s*[A-Z.]{2,7}\\s+${escaped}(?:\\s|$)`, 'm').test(
    outputText,
  );
}

function writeSmokeWav(filePath) {
  const sampleRate = 48_000;
  const sampleCount = sampleRate / 4;
  const dataBytes = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataBytes);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(
      Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 8_000,
    );

    wav.writeInt16LE(sample, 44 + index * 2);
  }

  fs.writeFileSync(filePath, wav);
}

function verifyMinimumMacOS(binaryPath) {
  const buildInfo = output('vtool', ['-show-build', binaryPath]);

  assert(
    new RegExp(
      `\\bminos\\s+${ffmpegRuntimeContract.minimumMacOSVersion.replace(
        '.',
        '\\.',
      )}\\b`,
    ).test(buildInfo),
    `${path.basename(binaryPath)} does not target macOS ${
      ffmpegRuntimeContract.minimumMacOSVersion
    }`,
  );
}

function verifyLinkedLibraries(binaryPath) {
  const dependencies = output('otool', ['-L', binaryPath])
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(' (compatibility version', 1)[0])
    .filter(Boolean);

  assert(dependencies.length > 0, `${binaryPath} has no reported dependencies`);
  dependencies.forEach((dependency) => {
    assert(
      dependency.startsWith('/usr/lib/') ||
        dependency.startsWith('/System/Library/Frameworks/'),
      `${path.basename(binaryPath)} has a non-system dependency: ${dependency}`,
    );
  });

  return dependencies;
}

const actualFiles = [];

function walk(relative = '') {
  fs.readdirSync(path.join(runtimeRoot, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .forEach((entry) => {
      const child = path.join(relative, entry.name);

      assert(
        !entry.isSymbolicLink(),
        `Runtime file must not be a symlink: ${child}`,
      );

      if (entry.isDirectory()) {
        walk(child);
      } else {
        assert(entry.isFile(), `Unsupported runtime entry: ${child}`);
        actualFiles.push(child.split(path.sep).join('/'));
      }
    });
}

assert(fs.existsSync(runtimeRoot), `Missing FFmpeg runtime: ${runtimeRoot}`);
walk();
assert(
  JSON.stringify(actualFiles) ===
    JSON.stringify([...ffmpegRuntimeContract.requiredFiles].sort()),
  `FFmpeg runtime file set changed: ${actualFiles.join(', ')}`,
);

const ffmpegPath = path.join(runtimeRoot, 'bin', 'ffmpeg');
const ffprobePath = path.join(runtimeRoot, 'bin', 'ffprobe');

[ffmpegPath, ffprobePath].forEach((binaryPath) => {
  fs.accessSync(binaryPath, fs.constants.X_OK);
  assert(
    output('file', [binaryPath]).includes('Mach-O 64-bit executable arm64'),
    `${binaryPath} is not a Mach-O arm64 executable`,
  );
  verifyMinimumMacOS(binaryPath);
  verifyLinkedLibraries(binaryPath);

  if (packagedMode) {
    execFileSync('codesign', ['--verify', '--strict', binaryPath], {
      stdio: 'pipe',
    });

    const signature = spawnSync('codesign', ['-dvvv', binaryPath], {
      encoding: 'utf8',
    });

    assert(signature.status === 0, `${binaryPath} has no valid code signature`);
    assert(
      `${signature.stdout}${signature.stderr}`.includes(
        'Authority=Developer ID Application',
      ),
      `${binaryPath} is not signed with a Developer ID Application identity`,
    );
  }
});

const provenance = JSON.parse(
  fs.readFileSync(path.join(runtimeRoot, 'provenance.json'), 'utf8'),
);
const exactContractFields = [
  'schemaVersion',
  'runtimeId',
  'component',
  'version',
  'sourceDateEpoch',
  'license',
  'platform',
  'architecture',
  'minimumMacOSVersion',
];

exactContractFields.forEach((field) => {
  assert(
    provenance[field] === ffmpegRuntimeContract[field],
    `FFmpeg provenance field changed: ${field}`,
  );
});
assert(
  JSON.stringify(provenance.source) ===
    JSON.stringify(ffmpegRuntimeContract.source),
  'FFmpeg source provenance changed',
);
assert(
  JSON.stringify(provenance.configureArgs) ===
    JSON.stringify(ffmpegRuntimeContract.configureArgs),
  'FFmpeg configure arguments changed',
);
assert(
  JSON.stringify(provenance.externalLibraries) ===
    JSON.stringify(ffmpegRuntimeContract.externalLibraries),
  'FFmpeg external-library contract changed',
);

if (!packagedMode) {
  assert(
    provenance.binaries.ffmpeg.sha256 === sha256(ffmpegPath) &&
      provenance.binaries.ffmpeg.bytes === fs.statSync(ffmpegPath).size,
    'FFmpeg binary does not match provenance',
  );
  assert(
    provenance.binaries.ffprobe.sha256 === sha256(ffprobePath) &&
      provenance.binaries.ffprobe.bytes === fs.statSync(ffprobePath).size,
    'ffprobe binary does not match provenance',
  );
}

const versionOutput = output(ffmpegPath, ['-version']);
const configurationLine = versionOutput
  .split(/\r?\n/)
  .find((line) => line.startsWith('configuration:'));

assert(
  versionOutput.startsWith('ffmpeg version 8.1.2-drumroll-lgpl'),
  'Unexpected FFmpeg version',
);
assert(
  configurationLine === provenance.configurationLine,
  'FFmpeg configuration does not match provenance',
);
[
  '--arch=arm64',
  '--disable-autodetect',
  '--disable-network',
  '--disable-everything',
  '--disable-shared',
  '--enable-static',
  '--enable-zlib',
].forEach((flag) =>
  assert(
    configurationLine.includes(flag),
    `FFmpeg configuration lacks ${flag}`,
  ),
);
['--enable-gpl', '--enable-version3', '--enable-nonfree'].forEach((flag) =>
  assert(!configurationLine.includes(flag), `Forbidden FFmpeg flag: ${flag}`),
);

const licenseOutput = output(ffmpegPath, ['-L']);

assert(
  /GNU Lesser General Public\s+License/.test(licenseOutput),
  'FFmpeg does not report the LGPL',
);
assert(
  /version 2\.1 of the License, or \(at your option\) any later version/.test(
    licenseOutput.replace(/\s+/g, ' '),
  ),
  'FFmpeg does not report LGPL-2.1-or-later',
);

const decoders = output(ffmpegPath, ['-hide_banner', '-decoders']);

[
  'aac',
  'alac',
  'flac',
  'mjpeg',
  'mp3',
  'opus',
  'pcm_s16le',
  'png',
  'vorbis',
  'webp',
].forEach((name) =>
  assert(
    tableHas(decoders, name),
    `Required FFmpeg decoder is missing: ${name}`,
  ),
);

const encoders = output(ffmpegPath, ['-hide_banner', '-encoders']);

['mjpeg', 'pcm_s16le', 'vorbis'].forEach((name) =>
  assert(
    tableHas(encoders, name),
    `Required FFmpeg encoder is missing: ${name}`,
  ),
);

const filters = output(ffmpegPath, ['-hide_banner', '-filters']);

[
  'aformat',
  'amix',
  'aresample',
  'asetrate',
  'atrim',
  'pan',
  'scale',
  'trim',
  'volume',
].forEach((name) =>
  assert(tableHas(filters, name), `Required FFmpeg filter is missing: ${name}`),
);

const protocols = output(ffmpegPath, ['-hide_banner', '-protocols']);

['file', 'pipe'].forEach((name) =>
  assert(
    new RegExp(`^\\s*${name}\\s*$`, 'm').test(protocols),
    `Required FFmpeg protocol is missing: ${name}`,
  ),
);

const smokeRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'drumroll-ffmpeg-smoke-'),
);

try {
  const wavPath = path.join(smokeRoot, 'tone.wav');
  const oggPath = path.join(smokeRoot, 'tone.ogg');
  const repeatedOggPath = path.join(smokeRoot, 'tone-repeated.ogg');
  const decodedPath = path.join(smokeRoot, 'decoded.wav');
  const pngPath = path.join(smokeRoot, 'pixel.png');
  const jpgPath = path.join(smokeRoot, 'pixel.jpg');

  writeSmokeWav(wavPath);
  fs.writeFileSync(
    pngPath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  );

  const encodeVorbis = (destination) =>
    output(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      wavPath,
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-ac',
      '2',
      '-c:a',
      'vorbis',
      '-flags:a',
      '+bitexact',
      '-strict',
      'experimental',
      '-q:a',
      '5',
      destination,
    ]);

  encodeVorbis(oggPath);
  encodeVorbis(repeatedOggPath);
  assert(
    fs.readFileSync(oggPath).equals(fs.readFileSync(repeatedOggPath)),
    'Vorbis encoding is not byte-for-byte reproducible',
  );

  const probe = output(ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_name:format=duration',
    '-of',
    'default=noprint_wrappers=1',
    oggPath,
  ]);

  assert(probe.includes('codec_name=vorbis'), 'Vorbis smoke encode failed');
  assert(/duration=0\.[0-9]+/.test(probe), 'ffprobe duration smoke failed');
  output(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    oggPath,
    '-c:a',
    'pcm_s16le',
    decodedPath,
  ]);
  assert(fs.statSync(decodedPath).size > 44, 'Audio decode smoke failed');

  output(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    pngPath,
    '-vf',
    'scale=2:2',
    '-frames:v',
    '1',
    jpgPath,
  ]);
  assert(fs.statSync(jpgPath).size > 0, 'Thumbnail conversion smoke failed');
} finally {
  fs.rmSync(smokeRoot, { recursive: true, force: true });
}

console.log(
  `Verified ${ffmpegRuntimeContract.runtimeId}${
    packagedMode ? ' (Developer ID signed)' : ''
  }: official-source provenance, LGPL configuration, arm64/macOS 12 portability, system-only dependencies, required capabilities, and runtime smoke tests.`,
);
