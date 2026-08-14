import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  LibrarySourceTrackProvenance,
  SongData,
  YoutubeFetchedAudioProvenance,
} from '../types';
import {
  createLocalAutoChartEvidence,
  createYoutubeAutoChartEvidence,
  persistPlayabilityEvidence,
  sourceSongIsPlayable,
  validatePlayabilityEvidence,
} from './playability';
import { buildSongFromDir } from './util';

const source: LibrarySourceTrackProvenance = {
  provider: 'yandex-music',
  collectionId: 'drums',
  collectionName: 'Drums',
  trackId: 'yandex:drums:3',
  title: 'Loyal',
  artists: ['ODESZA'],
  durationSeconds: 208,
};

function youtubeProvenance(): YoutubeFetchedAudioProvenance {
  return {
    provider: 'youtube',
    videoId: 'abcdefghijk',
    watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    title: 'ODESZA - Loyal (Official Audio)',
    uploader: 'ODESZA',
    durationSeconds: 208,
    downloader: 'yt-dlp',
    downloaderVersion: '2026.7.4',
    fetchedAt: '2026-08-13T00:00:00.000Z',
  };
}

function writePreparedSong(root: string): void {
  fs.writeFileSync(
    path.join(root, 'song.ini'),
    `[song]\nname = Loyal\nartist = ODESZA\nsk_source_provider = yandex-music\nsk_source_collection_id = drums\nsk_source_collection_name = Drums\nsk_source_track_id = yandex:drums:3\nsk_source_title = Loyal\nsk_source_artists = ["ODESZA"]\nsk_source_duration = 208\n`,
  );
  fs.writeFileSync(
    path.join(root, 'notes.chart'),
    '[Song]\n{\n  Resolution = 192\n}\n[ExpertDrums]\n{\n  0 = N 0 0\n}\n',
  );
  fs.writeFileSync(path.join(root, 'song.mp3'), 'lawful local audio');
}

describe('source-linked auto-chart evidence', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds the chart, audio, scan, and launch preflight to the source identity', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playability-'));

    roots.push(root);
    writePreparedSong(root);

    const evidence = createLocalAutoChartEvidence(
      root,
      source,
      'job-1',
      '2026-08-11T00:00:00.000Z',
    );

    expect(evidence.scan.drumDifficulties).toEqual(['expert']);
    expect(() => validatePlayabilityEvidence(root, evidence)).not.toThrow();
  });

  it('rejects proof after the prepared audio changes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playability-'));

    roots.push(root);
    writePreparedSong(root);

    const evidence = createLocalAutoChartEvidence(root, source, 'job-1');

    fs.writeFileSync(path.join(root, 'song.mp3'), 'different audio');

    expect(() => validatePlayabilityEvidence(root, evidence)).toThrow(
      'audio hash',
    );
  });

  it('does not allow a malformed source tag to bypass the proof gate', () => {
    expect(
      sourceSongIsPlayable({
        id: 'malformed-source',
        name: 'Track',
        artist: 'Artist',
        sk_source_provider: 'yandex-music',
      } as SongData),
    ).toBe(false);
  });

  it('persists a validated certificate in song.ini for a later rescan', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playability-'));

    roots.push(root);
    writePreparedSong(root);

    const evidence = createLocalAutoChartEvidence(
      root,
      source,
      'job-1',
      '2026-08-11T00:00:00.000Z',
    );

    persistPlayabilityEvidence(root, evidence);

    const rescanned = buildSongFromDir(root);

    expect(rescanned?.playability).toEqual(evidence);
    expect(rescanned && sourceSongIsPlayable(rescanned)).toBe(true);
  });

  it('persists verified YouTube-fetched evidence and rejects altered provenance', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playability-'));

    roots.push(root);
    writePreparedSong(root);

    const evidence = createYoutubeAutoChartEvidence(
      root,
      source,
      youtubeProvenance(),
      'job-1',
      '2026-08-13T00:00:00.000Z',
    );

    expect(() => validatePlayabilityEvidence(root, evidence)).not.toThrow();
    persistPlayabilityEvidence(root, evidence);
    expect(buildSongFromDir(root)?.playability).toEqual(evidence);

    const alteredAudio = structuredClone(evidence);

    alteredAudio.audio.sha256 = 'c'.repeat(64);
    expect(() => validatePlayabilityEvidence(root, alteredAudio)).toThrow(
      'audio hash',
    );

    const alteredChart = structuredClone(evidence);

    alteredChart.chart.sha256 = 'd'.repeat(64);
    expect(() => validatePlayabilityEvidence(root, alteredChart)).toThrow(
      'chart hash',
    );

    const alteredUrl = structuredClone(evidence);

    alteredUrl.audio.youtube!.watchUrl =
      'https://www.youtube.com/watch?v=wrong000001';
    expect(() => validatePlayabilityEvidence(root, alteredUrl)).toThrow(
      'lawful-audio',
    );

    const alteredVideoId = structuredClone(evidence);

    alteredVideoId.audio.youtube!.videoId = 'wrong000001';
    expect(() => validatePlayabilityEvidence(root, alteredVideoId)).toThrow(
      'lawful-audio',
    );

    const alteredDuration = structuredClone(evidence);

    alteredDuration.audio.youtube!.durationSeconds = 217;
    expect(() => validatePlayabilityEvidence(root, alteredDuration)).toThrow(
      'source duration',
    );

    const alteredDownloader = structuredClone(evidence);

    alteredDownloader.audio.youtube!.downloader = 'other' as 'yt-dlp';
    expect(() => validatePlayabilityEvidence(root, alteredDownloader)).toThrow(
      'lawful-audio',
    );
  });
});
