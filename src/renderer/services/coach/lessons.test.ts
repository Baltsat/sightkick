import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COACH_LESSONS } from './lessons';

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
});
