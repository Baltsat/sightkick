import { describe, expect, it } from 'vitest';
import { buildCoachDigest } from './narrative';

describe('buildCoachDigest', () => {
  it('sends only compact song metadata and ranked findings', () => {
    const digest = buildCoachDigest({
      song: {
        name: 'The Song',
        artist: 'The Artist',
        difficulty: 'expert',
      },
      findings: [
        {
          id: 'trouble-4-5',
          kind: 'trouble-bars',
          severity: 'high',
          title: 'Bars 4–5 need a loop',
          summary: 'ignored prose',
          skillTag: 'fills',
          evidence: { barStart: 4, barEnd: 5, sampleCount: 12 },
        },
      ],
    });

    expect(JSON.parse(digest)).toEqual({
      song: {
        name: 'The Song',
        artist: 'The Artist',
        difficulty: 'expert',
      },
      findings: [
        {
          kind: 'trouble-bars',
          severity: 'high',
          title: 'Bars 4–5 need a loop',
          skillTag: 'fills',
          evidence: { barStart: 4, barEnd: 5, sampleCount: 12 },
        },
      ],
    });
    expect(digest).not.toContain('rawAudio');
    expect(digest).not.toContain('ignored prose');
  });
});
