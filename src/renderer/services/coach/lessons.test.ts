import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CoachFinding } from './types';
import { COACH_LESSONS, remediationForFinding } from './lessons';

const curriculum = readFileSync('resources/lessons/curriculum.yaml', 'utf8');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('COACH_LESSONS', () => {
  it('links every coaching skill to the current curriculum id and title', () => {
    for (const { id, title } of Object.values(COACH_LESSONS)) {
      expect(curriculum).toMatch(
        new RegExp(
          `- id: '${escapeRegExp(id)}'\\r?\\n` +
            `\\s+lesson: \\d+\\r?\\n` +
            `\\s+title: ${escapeRegExp(title)}(?:\\r?\\n|$)`,
        ),
      );
    }
  });

  it('uses a distinct curriculum exercise for every coaching skill', () => {
    const ids = Object.values(COACH_LESSONS).map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('routes supported tom-pair confusions to their matching exercises', () => {
    const padFinding = (
      actualElement: 'tom1' | 'tom2' | 'tom3',
      expectedElement: 'tom1' | 'tom2' | 'tom3',
    ): CoachFinding => ({
      id: `${actualElement}-${expectedElement}`,
      kind: 'pad-confusion',
      severity: 'medium',
      title: 'Recorded pad transition',
      summary: 'Two unambiguous pairs.',
      skillTag: 'pad-accuracy',
      evidence: {
        actualElement,
        expectedElement,
        sampleCount: 2,
        matchedWrongPadPairs: 2,
      },
    });

    expect(remediationForFinding(padFinding('tom2', 'tom1'))).toMatchObject({
      status: 'available',
      lessonId: '07.02',
    });
    expect(remediationForFinding(padFinding('tom3', 'tom2'))).toMatchObject({
      status: 'available',
      lessonId: '07.03',
    });
    expect(remediationForFinding(padFinding('tom3', 'tom1'))).toMatchObject({
      status: 'available',
      lessonId: '07.04',
    });
  });

  it('does not assign an unrelated generic tom exercise to unsupported pairs', () => {
    const finding: CoachFinding = {
      id: 'snare-tom1',
      kind: 'pad-confusion',
      severity: 'medium',
      title: 'snare is replacing tom1',
      summary: 'Two unambiguous pairs.',
      skillTag: 'pad-accuracy',
      evidence: {
        actualElement: 'snare',
        expectedElement: 'tom1',
        sampleCount: 2,
        matchedWrongPadPairs: 2,
      },
    };

    expect(remediationForFinding(finding)).toMatchObject({
      status: 'unsupported',
      detail: expect.stringContaining('No supported targeted route'),
    });
  });
});
