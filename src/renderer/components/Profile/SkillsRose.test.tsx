import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PatternPlayerProfile } from '../../services/pattern-model';
import { SkillsRose } from './SkillsRose';

const profile: PatternPlayerProfile = {
  families: [
    {
      family: {
        family_id: 'pattern:eighth',
        label: 'Eighth-note backbeat',
        subdivision: 'eighth',
        groove: 'rock-backbeat',
        contains_rests: false,
        rest_ratio: 0,
        limb_combinations: ['kick+hihat', 'hihat', 'snare+hihat'],
        rhythmic_signature: 'eighth',
        skill_weights: [{ skill_id: 'pulse.eighth', weight: 1 }],
        lesson_ids: ['01.01'],
        occurrence_count: 8,
        source_item_ids: ['song:one'],
        exemplar: {
          dsl: `res=480 ts=4/4
0 kick yellow
240 yellow
480 snare yellow
720 yellow
960 kick yellow
1200 yellow
1440 snare yellow
1680 yellow`,
          rhythmic_signature: 'eighth',
        },
      },
      coverage: 'played',
      strength: 82,
      trend: 'improving',
      trend_delta: 7,
      evidence_event_count: 8,
      played_run_count: 4,
      last_played_at: '2026-08-14T09:30:00.000Z',
    },
    {
      family: {
        family_id: 'pattern:rest',
        label: 'Quarter-note pulse with rests',
        subdivision: 'quarter',
        groove: 'quarter-pulse',
        contains_rests: true,
        rest_ratio: 0.25,
        limb_combinations: ['kick', 'snare'],
        rhythmic_signature: 'rest',
        skill_weights: [{ skill_id: 'reading.rests', weight: 1 }],
        lesson_ids: ['01.01'],
        occurrence_count: 2,
        source_item_ids: ['lesson:one'],
        exemplar: {
          dsl: `res=480 ts=4/4
0 kick
960 snare
1440 kick`,
          rhythmic_signature: 'rest',
        },
      },
      coverage: 'never_played',
      strength: 0,
      trend: 'unknown',
      trend_delta: 0,
      evidence_event_count: 0,
      played_run_count: 0,
    },
  ],
  played_family_count: 1,
  total_family_count: 2,
  evidence_event_count: 8,
};

describe('SkillsRose', () => {
  it('renders notation on every spoke and opens linked lessons in one press', async () => {
    const onOpenLesson = vi.fn();

    render(<SkillsRose profile={profile} onOpenLesson={onOpenLesson} />);

    expect(screen.getByTestId('skills-rose-chart')).toBeInTheDocument();
    expect(screen.getByTestId('skills-rose-list')).toHaveTextContent(
      'Eighth-note backbeat',
    );
    expect(screen.getByTestId('skills-rose-list')).toHaveTextContent(
      'Not played',
    );
    expect(screen.getAllByTestId('pattern-notation-snippet')).toHaveLength(4);
    await waitFor(() => {
      expect(
        screen
          .getAllByTestId('pattern-notation-snippet')[0]
          .querySelector('svg'),
      ).not.toBeNull();
    });

    fireEvent.click(
      screen.getAllByRole('button', {
        name: /01\.01 · Hand Blocks Warm-Up/i,
      })[0],
    );

    expect(onOpenLesson).toHaveBeenCalledWith('01.01');
  });
});
