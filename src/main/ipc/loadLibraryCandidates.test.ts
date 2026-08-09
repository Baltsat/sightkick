import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lastReply, makeEvent } from './test-support';
import {
  loadLibraryCandidates,
  loadYandexCandidatesFromFiles,
} from './loadLibraryCandidates';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-candidates-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function copyCapturedSources(): [string, string] {
  const files = [
    'yandex-drums-2026-08-09.json',
    'yandex-favorites-2026-08-10.json',
  ] as const;

  return files.map((file) => {
    const source = path.join(process.cwd(), 'resources/library-sources', file);
    const destination = path.join(root, file);

    fs.copyFileSync(source, destination);

    return destination;
  }) as [string, string];
}

describe('loadLibraryCandidates', () => {
  it('loads both Yandex playlists but never exposes their rows as songs', () => {
    const payload = loadYandexCandidatesFromFiles(...copyCapturedSources());

    expect(payload.yandex.drums.tracks).toHaveLength(13);
    expect(payload.yandex.favorites.tracks).toHaveLength(230);
    expect(payload.yandex.drums.tracks[5]).toMatchObject({
      sourceAvailability: 'unavailable',
      localStatus: 'reference',
      practiceStatus: 'unavailable',
      sourceTrackUrl: null,
    });
    expect(payload.yandex.favorites.tracks[87]).toMatchObject({
      sourceAvailability: 'private',
      sourceTrackUrl: null,
      localStatus: 'reference',
    });
    expect(
      payload.yandex.favorites.tracks.every(
        (track) => !('format' in track) && !('downloadUrl' in track),
      ),
    ).toBe(true);
  });

  it('replies through the IPC channel without changing the library store', () => {
    copyCapturedSources();

    const event = makeEvent();

    loadLibraryCandidates(event as never, root);

    expect(lastReply(event, 'load-library-candidates')?.args[0]).toMatchObject({
      yandex: {
        drums: { source: 'yandex-music', tracks: { length: 13 } },
        favorites: { source: 'yandex-music', tracks: { length: 230 } },
      },
    });
  });
});
