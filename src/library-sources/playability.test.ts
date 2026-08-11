import { describe, expect, it } from 'vitest';
import type {
  LibrarySourceTrackProvenance,
  PlayabilityEvidence,
  PublicDrumChartCandidate,
} from '../types';
import {
  isPlayableEvidence,
  playabilityBlockers,
  resolvePublicDrumCharts,
} from './playability';

const source: LibrarySourceTrackProvenance = {
  provider: 'yandex-music',
  collectionId: 'drums',
  collectionName: 'Drums',
  trackId: 'yandex:drums:7',
  title: 'What I Like About You',
  artists: ['Jonas Blue', 'Theresa Rex'],
  durationSeconds: 220,
};
const evidence: PlayabilityEvidence = {
  identity: {
    title: source.title,
    artists: source.artists,
    durationSeconds: 220,
  },
  audio: {
    source: 'local-user-attested',
    sha256: 'a'.repeat(64),
  },
  chart: {
    source: 'local-auto-chart',
    id: 'job-1',
    sha256: 'b'.repeat(64),
    reviewed: true,
  },
  scan: {
    passed: true,
    format: 'chart',
    drumDifficulties: ['expert'],
  },
  launch: {
    passed: true,
    mode: 'headless-load',
    verifiedAt: '2026-08-11T00:00:00.000Z',
  },
};

function candidate(
  patch: Partial<PublicDrumChartCandidate> = {},
): PublicDrumChartCandidate {
  return {
    source: 'chorus-encore',
    id: 'chart-1',
    title: source.title,
    artists: ['Jonas Blue', 'Theresa Rex'],
    durationSeconds: 220,
    hasDrums: true,
    reviewed: true,
    sourceUrl: 'https://example.test/chart-1',
    ...patch,
  };
}

describe('playable song contract', () => {
  it('requires all five proof gates', () => {
    expect(playabilityBlockers(undefined)).toEqual([
      'identity',
      'lawful-audio',
      'chart-provenance',
      'scan-chart',
      'launch-proof',
    ]);
  });

  it('accepts a fully evidenced local chart', () => {
    expect(isPlayableEvidence(evidence)).toBe(true);
  });
});

describe('exact public chart resolution', () => {
  it('rejects the Romantics same-title chart for Jonas Blue and Theresa Rex', () => {
    const resolution = resolvePublicDrumCharts(source, [
      candidate({
        id: 'romantics',
        artists: ['The Romantics'],
        durationSeconds: 177,
      }),
    ]);

    expect(resolution.status).toBe('no-exact-reviewed-chart');
    expect(resolution.rejected).toEqual([
      expect.objectContaining({ reason: 'artist' }),
    ]);
  });

  it('requires reviewed authored drums even for an exact identity', () => {
    const resolution = resolvePublicDrumCharts(source, [
      candidate({ reviewed: false }),
      candidate({ id: 'no-drums', hasDrums: false }),
    ]);

    expect(resolution.status).toBe('no-exact-reviewed-chart');
    expect(resolution.rejected.map((entry) => entry.reason)).toEqual([
      'unreviewed',
      'no-drums',
    ]);
  });

  it('returns only a quality-reviewed exact duration match', () => {
    const resolution = resolvePublicDrumCharts(source, [
      candidate({ id: 'bad-duration', durationSeconds: 240 }),
      candidate({ id: 'exact', durationSeconds: 224 }),
    ]);

    expect(resolution).toMatchObject({
      status: 'exact-reviewed-chart',
      match: { id: 'exact' },
    });
  });

  it('refuses exact matching when the source identity lacks duration', () => {
    const resolution = resolvePublicDrumCharts(
      { ...source, durationSeconds: undefined },
      [candidate()],
    );

    expect(resolution.status).toBe('identity-incomplete');
  });
});
