import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { VOCALIZATION_INVENTORY } from './inventory';
import {
  buildVoiceBankFromDirectory,
  loadBuiltVoiceBank,
  sliceRecordingTakes,
} from './bank-builder.node';
import { encodePcm16Wav } from './wav';

const temporaryDirectories: string[] = [];

function recordedTakes(sampleRate: number) {
  const leadingSilence = Math.round(sampleRate * 1.6);
  const takeLength = Math.round(sampleRate * 0.1);
  const gapLength = Math.round(sampleRate * 0.25);
  const data = new Float32Array(leadingSilence + 8 * (takeLength + gapLength));

  for (let take = 0; take < 8; take += 1) {
    const start = leadingSilence + take * (takeLength + gapLength);

    for (let index = 0; index < takeLength; index += 1) {
      data[start + index] =
        Math.sin((2 * Math.PI * 180 * index) / sampleRate) * 0.35;
    }
  }

  return { sampleRate, data };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('voice bank builder', () => {
  it('finds and normalizes the first eight isolated takes', () => {
    const takes = sliceRecordingTakes(recordedTakes(8000));

    expect(takes).toHaveLength(8);
    expect(takes.every((take) => take.data.length > 700)).toBe(true);
    expect(
      takes.every((take) => take.data.some((value) => Math.abs(value) > 0.1)),
    ).toBe(true);
  });

  it('assembles all named recordings into the engine sample ids', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'drumroll-voice-bank-'));
    const input = path.join(root, 'recordings');
    const output = path.join(root, 'bank');
    const sampleRate = 8000;

    temporaryDirectories.push(root);
    await mkdir(input, { recursive: true });

    await Promise.all(
      VOCALIZATION_INVENTORY.map(({ recordingStem }) =>
        writeFile(
          path.join(input, `${recordingStem}.wav`),
          encodePcm16Wav(recordedTakes(sampleRate)),
        ),
      ),
    );

    const manifest = await buildVoiceBankFromDirectory(input, output, {
      sampleRate,
    });
    const bank = await loadBuiltVoiceBank(output);
    const manifestBytes = await readFile(path.join(output, 'manifest.json'));

    expect(manifest.takesPerSample).toBe(8);
    expect(Object.keys(manifest.samples)).toHaveLength(15);
    expect(
      Object.values(manifest.samples).reduce(
        (total, variants) => total + variants.length,
        0,
      ),
    ).toBe(120);
    expect(bank.snare_accent_bak).toHaveLength(8);
    expect(bank.snare_ghost_ki).toHaveLength(8);
    expect(manifestBytes.byteLength).toBeGreaterThan(1000);

    manifest.samples.kick_bum[0].path = '../outside.wav';
    await writeFile(
      path.join(output, 'manifest.json'),
      JSON.stringify(manifest),
    );
    await expect(loadBuiltVoiceBank(output)).rejects.toThrow(
      'voice bank path leaves its directory',
    );
  });
});
