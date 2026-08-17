import { describe, expect, it } from 'vitest';
import { makeLessonSong } from '../../views/test-support';
import { journey_return_target } from './journey-return';

describe('journey_return_target', () => {
  it('keeps a completed non-first season selected and focuses its next unlocked lesson', () => {
    const target = journey_return_target(
      [
        {
          unit: 'Foundations',
          entries: [
            {
              song: makeLessonSong('foundation-1', { unit: 'Foundations' }),
              lesson: {
                id: '01.01',
                starsToUnlock: 0,
                unit: 'Foundations',
                title: 'Foundation',
              },
              bestStars: 5,
              cleared: true,
              unlocked: true,
              clearsNeeded: 0,
            },
          ],
        },
        {
          unit: 'Linear Grooves',
          entries: [
            {
              song: makeLessonSong('groove-1', { unit: 'Linear Grooves' }),
              lesson: {
                id: '04.01',
                starsToUnlock: 0,
                unit: 'Linear Grooves',
                title: 'A',
              },
              bestStars: 5,
              cleared: true,
              unlocked: true,
              clearsNeeded: 0,
            },
            {
              song: makeLessonSong('groove-2', { unit: 'Linear Grooves' }),
              lesson: {
                id: '04.02',
                starsToUnlock: 1,
                unit: 'Linear Grooves',
                title: 'B',
              },
              bestStars: 0,
              cleared: false,
              unlocked: true,
              clearsNeeded: 0,
            },
          ],
        },
      ],
      'Linear Grooves',
      'groove-1',
    );

    expect(target).toEqual({ unit: 'Linear Grooves', lessonId: 'groove-2' });
  });
});
