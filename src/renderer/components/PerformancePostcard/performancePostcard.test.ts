import { describe, expect, it } from 'vitest';
import type { Song } from '../../../types';
import { multiLaneRunFixture } from '../PracticeStats/test-fixtures';
import { buildPerformancePostcard } from './performancePostcard';

const song = {
  name: 'Daybreak Anthem',
  artist: 'Drumroll Sessions',
} as Song;

describe('buildPerformancePostcard', () => {
  it('includes only the fields the player selected', () => {
    const summary = {
      ...multiLaneRunFixture(),
      completedAt: '2026-08-12T08:30:00.000Z',
      overallAccuracy: 0.84,
      playbackSpeed: 0.8,
      audition: {
        song_id: 'song:daybreak',
        start_bar: 5,
        end_bar: 8,
        speed: 0.8,
        section_label: 'Bars 5–8',
        test_label: 'Chorus entry',
        required_skill_id: 'pulse.eighth',
      },
    };
    const postcard = buildPerformancePostcard({
      song,
      summary,
      fields: ['milestone', 'performance'],
    });

    expect(postcard.fileName).toBe(
      'daybreak-anthem-performance-2026-08-12.pdf',
    );
    expect(postcard.html).toContain('Daybreak Anthem');
    expect(postcard.html).toContain('Bars 5–8');
    expect(postcard.html).toContain('84% at 0.8×');
    expect(postcard.html).not.toContain('August 12, 2026');
    expect(postcard.html).not.toContain(
      'No earlier comparable saved pass yet.',
    );
  });

  it('does not make a before-after claim across incomparable runs', () => {
    const summary = {
      ...multiLaneRunFixture(),
      overallAccuracy: 0.88,
      playbackSpeed: 1,
      mode: 'perform' as const,
      difficulty: 'expert' as const,
    };
    const previous = {
      ...multiLaneRunFixture(),
      overallAccuracy: 0.7,
      playbackSpeed: 0.7,
      mode: 'practice' as const,
      difficulty: 'expert' as const,
    };
    const postcard = buildPerformancePostcard({
      song,
      summary,
      previous,
      fields: ['comparison'],
    });

    expect(postcard.html).toContain(
      'An earlier saved pass uses a different context, so no before/after claim is made.',
    );
    expect(postcard.html).not.toContain('70% → 88%');
  });
});
