import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ffmpegRuntimeContract = Object.freeze({
  schemaVersion: 1,
  component: 'FFmpeg',
  version: '8.1.2',
  runtimeId: 'ffmpeg-8.1.2-drumroll-lgpl-macos-arm64',
  source: Object.freeze({
    url: 'https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz',
    sha256: '464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c',
  }),
  sourceDateEpoch: 1781654400,
  license: 'LGPL-2.1-or-later',
  platform: 'darwin',
  architecture: 'arm64',
  minimumMacOSVersion: '12.0',
  externalLibraries: Object.freeze(['zlib']),
  configureArgs: Object.freeze([
    '--prefix=/opt/drumroll-ffmpeg-runtime',
    '--extra-version=drumroll-lgpl',
    '--arch=arm64',
    '--cc=clang',
    '--disable-autodetect',
    '--enable-zlib',
    '--disable-doc',
    '--disable-debug',
    '--disable-network',
    '--disable-indevs',
    '--disable-outdevs',
    '--disable-devices',
    '--disable-ffplay',
    '--disable-sdl2',
    '--disable-shared',
    '--enable-static',
    '--enable-small',
    '--disable-everything',
    '--enable-ffmpeg',
    '--enable-ffprobe',
    '--enable-protocol=file,pipe',
    '--enable-demuxer=aac,flac,image2,image2pipe,image_jpeg_pipe,image_png_pipe,image_webp_pipe,matroska,mjpeg,mov,mp3,ogg,wav',
    '--enable-muxer=image2,image2pipe,mjpeg,null,ogg,wav',
    '--enable-decoder=aac,aac_fixed,alac,flac,mjpeg,mp3,mp3float,opus,pcm_f32be,pcm_f32le,pcm_f64be,pcm_f64le,pcm_s8,pcm_s16be,pcm_s16le,pcm_s24be,pcm_s24le,pcm_s32be,pcm_s32le,pcm_u8,pcm_u16be,pcm_u16le,pcm_u24be,pcm_u24le,pcm_u32be,pcm_u32le,png,vorbis,webp',
    '--enable-encoder=mjpeg,pcm_s16le,vorbis',
    '--enable-parser=aac,flac,mjpeg,mpegaudio,opus,png,vorbis,webp',
    '--enable-filter=abuffer,abuffersink,aformat,amix,anull,aresample,asetrate,atrim,buffer,buffersink,format,null,pan,scale,setpts,trim,volume',
  ]),
  requiredFiles: Object.freeze([
    'bin/ffmpeg',
    'bin/ffprobe',
    'licenses/COPYING.LGPLv2.1',
    'licenses/LICENSE.md',
    'provenance.json',
  ]),
});

export function defaultFfmpegRuntimeRoot(repoRoot) {
  return path.join(
    repoRoot,
    'node_modules',
    '.cache',
    'drumroll-ffmpeg',
    'macos-arm64',
  );
}

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function output(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

export function writeFfmpegProvenance(runtimeRoot) {
  const ffmpegPath = path.join(runtimeRoot, 'bin', 'ffmpeg');
  const ffprobePath = path.join(runtimeRoot, 'bin', 'ffprobe');
  const versionOutput = output(ffmpegPath, ['-version']);
  const versionLines = versionOutput.split(/\r?\n/);
  const clangVersion = output('clang', ['--version']).split(/\r?\n/, 1)[0];
  const sdkVersion = output('xcrun', ['--sdk', 'macosx', '--show-sdk-version']);
  const provenance = {
    schemaVersion: ffmpegRuntimeContract.schemaVersion,
    runtimeId: ffmpegRuntimeContract.runtimeId,
    component: ffmpegRuntimeContract.component,
    version: ffmpegRuntimeContract.version,
    source: ffmpegRuntimeContract.source,
    sourceDateEpoch: ffmpegRuntimeContract.sourceDateEpoch,
    license: ffmpegRuntimeContract.license,
    platform: ffmpegRuntimeContract.platform,
    architecture: ffmpegRuntimeContract.architecture,
    minimumMacOSVersion: ffmpegRuntimeContract.minimumMacOSVersion,
    externalLibraries: ffmpegRuntimeContract.externalLibraries,
    configureArgs: ffmpegRuntimeContract.configureArgs,
    toolchain: {
      clang: clangVersion,
      macOSSDK: sdkVersion,
    },
    binaries: {
      ffmpeg: {
        bytes: fs.statSync(ffmpegPath).size,
        sha256: sha256(ffmpegPath),
      },
      ffprobe: {
        bytes: fs.statSync(ffprobePath).size,
        sha256: sha256(ffprobePath),
      },
    },
    versionLine: versionLines.find((line) => line.startsWith('ffmpeg version')),
    configurationLine: versionLines.find((line) =>
      line.startsWith('configuration:'),
    ),
  };

  if (!provenance.versionLine || !provenance.configurationLine) {
    throw new Error('FFmpeg did not report its version and configuration.');
  }

  fs.writeFileSync(
    path.join(runtimeRoot, 'provenance.json'),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [command, argument] = process.argv.slice(2);

  if (command === '--configure-args') {
    process.stdout.write(`${ffmpegRuntimeContract.configureArgs.join('\n')}\n`);
  } else if (command === '--write-provenance' && argument) {
    writeFfmpegProvenance(path.resolve(argument));
  } else if (command === '--contract-json') {
    process.stdout.write(`${JSON.stringify(ffmpegRuntimeContract, null, 2)}\n`);
  } else {
    throw new Error(
      'Usage: ffmpeg-runtime-contract.mjs --configure-args | --contract-json | --write-provenance RUNTIME_ROOT',
    );
  }
}
