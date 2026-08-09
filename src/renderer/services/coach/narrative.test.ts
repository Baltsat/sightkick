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
      authority: {
        source: 'deterministic practice evidence',
        requirements: [
          'Treat supplied bars, counts, reason, and remediation as authoritative.',
          'Do not invent bars, note events, pad transitions, or any evidence not supplied here.',
          'Do not diagnose grip, rebound, posture, sticking, dynamics, or reading unless supplied evidence explicitly supports it.',
        ],
      },
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
          reason: {
            code: 'reported-deterministic-evidence',
            counts: { samples: 12 },
          },
          remediation: {
            status: 'available',
            lessonId: '18.03',
            lessonTitle: 'One-Bar 16th Fill A',
          },
        },
      ],
    });
    expect(digest).not.toContain('rawAudio');
    expect(digest).not.toContain('ignored prose');
  });

  it('carries structured wrong-pad remediation and forbids invented bars', () => {
    const digest = JSON.parse(
      buildCoachDigest({
        song: { name: 'The Song', artist: 'The Artist', difficulty: 'expert' },
        findings: [
          {
            id: 'confusion-snare-tom1',
            kind: 'pad-confusion',
            severity: 'medium',
            title: 'snare is replacing tom1',
            summary: 'ignored prose',
            skillTag: 'pad-accuracy',
            evidence: {
              actualElement: 'snare',
              expectedElement: 'tom1',
              sampleCount: 2,
              matchedWrongPadPairs: 2,
              wrongHitCount: 2,
              missCount: 2,
            },
            reason: {
              code: 'repeated-unambiguous-wrong-pad-pairs',
              counts: {
                samples: 2,
                wrongHits: 2,
                misses: 2,
                matchedWrongPadPairs: 2,
              },
            },
          },
        ],
      }),
    );

    expect(digest.findings[0]).toMatchObject({
      reason: {
        code: 'repeated-unambiguous-wrong-pad-pairs',
        counts: { matchedWrongPadPairs: 2 },
      },
      remediation: {
        status: 'unsupported',
        detail: expect.stringContaining('No supported targeted route'),
      },
    });
    expect(digest.authority.requirements).toContain(
      'Do not invent bars, note events, pad transitions, or any evidence not supplied here.',
    );
    expect(JSON.stringify(digest)).not.toContain('ignored prose');
  });
});
