import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { VOCALIZATION_INVENTORY } from './inventory';
import type {
  PcmSample,
  VocalizationBank,
  VocalizationSampleId,
} from './types';
import { decodeWav, encodePcm16Wav } from './wav';

export interface VoiceBankBuildOptions {
  sampleRate?: number;
  takesPerSample?: number;
  ffmpegPath?: string;
}

export interface VoiceBankManifestVariant {
  path: string;
  durationSeconds: number;
  peak: number;
  rms: number;
}

export interface VoiceBankManifest {
  version: 1;
  sampleRate: number;
  takesPerSample: number;
  samples: Record<VocalizationSampleId, VoiceBankManifestVariant[]>;
}

const RECORDING_EXTENSIONS = new Set([
  '.wav',
  '.m4a',
  '.mp3',
  '.aif',
  '.aiff',
  '.caf',
  '.flac',
  '.ogg',
]);

function resample(sample: PcmSample, sampleRate: number): PcmSample {
  if (sample.sampleRate === sampleRate) {
    return sample;
  }

  const data = new Float32Array(
    Math.max(
      1,
      Math.round((sample.data.length * sampleRate) / sample.sampleRate),
    ),
  );

  for (let index = 0; index < data.length; index += 1) {
    const sourcePosition = (index * sample.sampleRate) / sampleRate;
    const before = Math.floor(sourcePosition);
    const after = Math.min(sample.data.length - 1, before + 1);
    const fraction = sourcePosition - before;

    data[index] =
      sample.data[before] * (1 - fraction) + sample.data[after] * fraction;
  }

  return { sampleRate, data };
}

function pcmFromF32le(
  bytes: Uint8Array<ArrayBufferLike>,
  sampleRate: number,
): PcmSample {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const data = new Float32Array(Math.floor(bytes.byteLength / 4));

  for (let index = 0; index < data.length; index += 1) {
    data[index] = view.getFloat32(index * 4, true);
  }

  return { sampleRate, data };
}

function decodeRecording(
  filePath: string,
  sampleRate: number,
  ffmpegPath: string,
): Promise<PcmSample> {
  if (path.extname(filePath).toLowerCase() === '.wav') {
    return readFile(filePath).then((bytes) =>
      resample(decodeWav(Uint8Array.from(bytes)), sampleRate),
    );
  }

  const result = spawnSync(
    ffmpegPath,
    [
      '-v',
      'error',
      '-i',
      filePath,
      '-f',
      'f32le',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      'pipe:1',
    ],
    { maxBuffer: 512 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    const detail = result.stderr.toString().trim();

    throw new Error(`ffmpeg could not decode ${filePath}: ${detail}`);
  }

  return Promise.resolve(
    pcmFromF32le(Uint8Array.from(result.stdout), sampleRate),
  );
}

function frameRms(data: Float32Array, start: number, end: number): number {
  let sum = 0;

  for (let index = start; index < end; index += 1) {
    sum += data[index] * data[index];
  }

  return Math.sqrt(sum / Math.max(1, end - start));
}

function normalizeTake(sample: PcmSample): PcmSample {
  const rms = frameRms(sample.data, 0, sample.data.length);
  const peak = sample.data.reduce(
    (maximum, value) => Math.max(maximum, Math.abs(value)),
    0,
  );
  const rmsGain = rms > 0 ? Math.min(10, 0.16 / rms) : 1;
  const gain = peak > 0 ? Math.min(rmsGain, 0.92 / peak) : 1;
  const fadeLength = Math.min(
    Math.round(sample.sampleRate * 0.006),
    Math.floor(sample.data.length / 2),
  );
  const data = new Float32Array(sample.data.length);

  sample.data.forEach((value, index) => {
    const fadeIn = fadeLength > 0 ? Math.min(1, index / fadeLength) : 1;
    const fadeOut =
      fadeLength > 0
        ? Math.min(1, (sample.data.length - 1 - index) / fadeLength)
        : 1;

    data[index] = value * gain * fadeIn * fadeOut;
  });

  return { sampleRate: sample.sampleRate, data };
}

export function sliceRecordingTakes(
  sample: PcmSample,
  takeCount: number = 8,
): PcmSample[] {
  const frameLength = Math.max(1, Math.round(sample.sampleRate * 0.01));
  const frameCount = Math.ceil(sample.data.length / frameLength);
  const rmsFrames = Array.from({ length: frameCount }, (_, index) =>
    frameRms(
      sample.data,
      index * frameLength,
      Math.min(sample.data.length, (index + 1) * frameLength),
    ),
  );
  const noiseFrames = rmsFrames.slice(0, Math.max(1, Math.round(1.5 / 0.01)));
  const sortedNoise = [...noiseFrames].sort((left, right) => left - right);
  const noiseFloor = sortedNoise[Math.floor(sortedNoise.length * 0.9)] ?? 0;
  const threshold = Math.max(0.012, noiseFloor * 3.5);
  const minimumGapFrames = Math.round(0.16 / 0.01);
  const minimumTakeFrames = Math.round(0.06 / 0.01);
  const ranges: Array<[number, number]> = [];
  let start = -1;
  let lastActive = -1;

  rmsFrames.forEach((rms, frame) => {
    if (rms >= threshold) {
      if (start < 0) {
        start = frame;
      }

      lastActive = frame;
    }

    if (
      start >= 0 &&
      lastActive >= 0 &&
      frame - lastActive >= minimumGapFrames
    ) {
      if (lastActive - start + 1 >= minimumTakeFrames) {
        ranges.push([start, lastActive + 1]);
      }

      start = -1;
      lastActive = -1;
    }
  });

  if (start >= 0 && lastActive - start + 1 >= minimumTakeFrames) {
    ranges.push([start, lastActive + 1]);
  }

  if (ranges.length < takeCount) {
    throw new Error(
      `recording has ${ranges.length} clean takes; expected ${takeCount}`,
    );
  }

  const preRoll = Math.round(sample.sampleRate * 0.02);
  const postRoll = Math.round(sample.sampleRate * 0.06);

  return ranges.slice(0, takeCount).map(([startFrame, endFrame]) => {
    const startSample = Math.max(0, startFrame * frameLength - preRoll);
    const endSample = Math.min(
      sample.data.length,
      endFrame * frameLength + postRoll,
    );

    return normalizeTake({
      sampleRate: sample.sampleRate,
      data: sample.data.slice(startSample, endSample),
    });
  });
}

function metrics(sample: PcmSample) {
  return {
    durationSeconds: sample.data.length / sample.sampleRate,
    peak: sample.data.reduce(
      (maximum, value) => Math.max(maximum, Math.abs(value)),
      0,
    ),
    rms: frameRms(sample.data, 0, sample.data.length),
  };
}

function recordingByStem(names: string[], stem: string) {
  return names.find(
    (name) =>
      path.parse(name).name === stem &&
      RECORDING_EXTENSIONS.has(path.extname(name).toLowerCase()),
  );
}

export async function buildVoiceBankFromDirectory(
  inputDirectory: string,
  outputDirectory: string,
  options: VoiceBankBuildOptions = {},
): Promise<VoiceBankManifest> {
  const sampleRate = options.sampleRate ?? 48000;
  const takesPerSample = options.takesPerSample ?? 8;
  const ffmpegPath = options.ffmpegPath ?? process.env.SK_FFMPEG ?? 'ffmpeg';
  const names = (await readdir(inputDirectory)).sort();
  const missing = VOCALIZATION_INVENTORY.filter(
    ({ recordingStem }) => !recordingByStem(names, recordingStem),
  ).map(({ recordingStem }) => recordingStem);

  if (missing.length > 0) {
    throw new Error(`missing voice recordings: ${missing.join(', ')}`);
  }

  const samples = {} as Record<
    VocalizationSampleId,
    VoiceBankManifestVariant[]
  >;

  await mkdir(outputDirectory, { recursive: true });

  for (const { recordingStem, sampleId } of VOCALIZATION_INVENTORY) {
    const sourceName = recordingByStem(names, recordingStem) as string;
    const decoded = await decodeRecording(
      path.join(inputDirectory, sourceName),
      sampleRate,
      ffmpegPath,
    );
    const takes = sliceRecordingTakes(decoded, takesPerSample);
    const sampleDirectory = path.join(outputDirectory, sampleId);

    await mkdir(sampleDirectory, { recursive: true });

    samples[sampleId] = [];

    for (let index = 0; index < takes.length; index += 1) {
      const filename = `${String(index + 1).padStart(2, '0')}.wav`;
      const relativePath = `${sampleId}/${filename}`;

      await writeFile(
        path.join(sampleDirectory, filename),
        encodePcm16Wav(takes[index]),
      );
      samples[sampleId].push({
        path: relativePath,
        ...metrics(takes[index]),
      });
    }
  }

  const manifest: VoiceBankManifest = {
    version: 1,
    sampleRate,
    takesPerSample,
    samples,
  };

  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return manifest;
}

export async function loadBuiltVoiceBank(
  directory: string,
): Promise<VocalizationBank> {
  const parsed = JSON.parse(
    await readFile(path.join(directory, 'manifest.json'), 'utf8'),
  ) as unknown;
  const root = path.resolve(directory);

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('samples' in parsed) ||
    !parsed.samples ||
    typeof parsed.samples !== 'object'
  ) {
    throw new Error('voice bank manifest is invalid');
  }

  const manifest = parsed as VoiceBankManifest;
  const entries = await Promise.all(
    VOCALIZATION_INVENTORY.map(async ({ sampleId }) => {
      if (!Array.isArray(manifest.samples[sampleId])) {
        throw new Error(`voice bank manifest has no ${sampleId} samples`);
      }

      const variants = await Promise.all(
        manifest.samples[sampleId].map(async (variant) => {
          if (!variant || typeof variant.path !== 'string') {
            throw new Error(`voice bank has an invalid ${sampleId} path`);
          }

          const filePath = path.resolve(root, variant.path);

          if (!filePath.startsWith(`${root}${path.sep}`)) {
            throw new Error(
              `voice bank path leaves its directory: ${variant.path}`,
            );
          }

          return decodeWav(Uint8Array.from(await readFile(filePath)));
        }),
      );

      return [sampleId, variants] as const;
    }),
  );

  return Object.fromEntries(entries) as VocalizationBank;
}
