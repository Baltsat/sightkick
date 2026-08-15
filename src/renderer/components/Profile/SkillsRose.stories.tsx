import type { Meta, StoryObj } from '@storybook/react';
import type {
  PatternFamilyProfile,
  PatternGroove,
  PatternPlayerProfile,
  PatternSubdivision,
} from '../../services/pattern-model';
import { SkillsRose } from './SkillsRose';

function entry({
  id,
  label,
  dsl,
  subdivision,
  groove,
  strength,
  trend,
  delta,
  lessonIds,
  coverage = 'played',
}: {
  id: string;
  label: string;
  dsl: string;
  subdivision: PatternSubdivision;
  groove: PatternGroove;
  strength: number;
  trend: PatternFamilyProfile['trend'];
  delta: number;
  lessonIds: readonly string[];
  coverage?: PatternFamilyProfile['coverage'];
}): PatternFamilyProfile {
  return {
    family: {
      family_id: id,
      label,
      subdivision,
      groove,
      dynamics: label.includes('ghost')
        ? 'ghosted'
        : label.includes('accent')
        ? 'accented'
        : 'even',
      independence: groove === 'linear' ? 'linear' : 'three-way',
      contains_rests: label.includes('rests'),
      rest_ratio: label.includes('rests') ? 0.25 : 0,
      limb_combinations: ['kick+hihat', 'hihat', 'snare+hihat'],
      rhythmic_signature: id,
      skill_weights: [{ skill_id: 'pulse.eighth', weight: 1 }],
      lesson_ids: lessonIds,
      occurrence_count: 8,
      source_item_ids: ['song:boulevard', 'lesson:foundation'],
      exemplar: { dsl, rhythmic_signature: id },
    },
    coverage,
    strength,
    trend,
    trend_delta: delta,
    evidence_event_count: coverage === 'played' ? 12 : 0,
    played_run_count: coverage === 'played' ? 6 : 0,
    ...(coverage === 'played'
      ? { last_played_at: '2026-08-14T09:30:00.000Z' }
      : {}),
  };
}

const profile: PatternPlayerProfile = {
  families: [
    entry({
      id: 'pattern:backbeat',
      label: 'Eighth-note backbeat',
      subdivision: 'eighth',
      groove: 'rock-backbeat',
      strength: 84,
      trend: 'improving',
      delta: 9,
      lessonIds: ['01.01'],
      dsl: `res=480 ts=4/4
0 kick yellow
240 yellow
480 snare yellow
720 yellow
960 kick yellow
1200 yellow
1440 snare yellow
1680 yellow`,
    }),
    entry({
      id: 'pattern:sixteenth',
      label: 'Sixteenth-note groove',
      subdivision: 'sixteenth',
      groove: 'sixteenth-groove',
      strength: 68,
      trend: 'improving',
      delta: 6,
      lessonIds: ['16.03'],
      dsl: `res=480 ts=4/4
0 kick yellow
120 yellow
240 yellow
360 yellow
480 snare yellow
600 yellow
720 yellow
840 yellow
960 kick yellow
1080 yellow
1200 yellow
1320 yellow
1440 snare yellow
1560 yellow
1680 yellow
1800 yellow`,
    }),
    entry({
      id: 'pattern:triplet',
      label: 'Triplet groove',
      subdivision: 'triplet',
      groove: 'triplet-groove',
      strength: 53,
      trend: 'stable',
      delta: 1.4,
      lessonIds: ['19.01'],
      dsl: `res=480 ts=4/4
0 kick yellow
160 yellow
320 yellow
480 snare yellow
640 yellow
800 yellow
960 kick yellow
1120 yellow
1280 yellow
1440 snare yellow
1600 yellow
1760 yellow`,
    }),
    entry({
      id: 'pattern:kick',
      label: 'Eighth-note kick variation',
      subdivision: 'eighth',
      groove: 'eighth-groove',
      strength: 41,
      trend: 'declining',
      delta: -5.6,
      lessonIds: ['06.03'],
      dsl: `res=480 ts=4/4
0 kick yellow
240 kick yellow
480 snare yellow
720 yellow
960 yellow
1200 kick yellow
1440 snare yellow
1680 kick yellow`,
    }),
    entry({
      id: 'pattern:fill',
      label: 'Sixteenth-note fill',
      subdivision: 'sixteenth',
      groove: 'fill',
      strength: 72,
      trend: 'stable',
      delta: 2,
      lessonIds: ['07.02', '18.03'],
      dsl: `res=480 ts=4/4
0 snare
120 yellow:tom
240 blue:tom
360 green:tom
480 snare
600 yellow:tom
720 blue:tom
840 green:tom
960 snare
1080 yellow:tom
1200 blue:tom
1320 green:tom
1440 snare
1560 yellow:tom
1680 blue:tom
1800 green:tom`,
    }),
    entry({
      id: 'pattern:rests',
      label: 'Quarter-note pulse with rests',
      subdivision: 'quarter',
      groove: 'quarter-pulse',
      strength: 0,
      trend: 'unknown',
      delta: 0,
      lessonIds: ['01.01'],
      coverage: 'never_played',
      dsl: `res=480 ts=4/4
0 kick
960 snare
1440 kick`,
    }),
  ],
  played_family_count: 5,
  total_family_count: 6,
  evidence_event_count: 60,
  computed_through: '2026-08-14T09:30:00.000Z',
};
const meta: Meta<typeof SkillsRose> = {
  title: 'Insights/Skills rose',
  component: SkillsRose,
  args: {
    profile,
    onOpenLesson: () => {},
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-8">
        <div className="mx-auto max-w-7xl rounded-3xl bg-surface px-8 pb-10">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SkillsRose>;

export const SavedPracticeProfile: Story = {};

export const ExpandedTaxonomy: Story = {
  args: {
    profile: {
      ...profile,
      families: Array.from({ length: 18 }, (_, index) => {
        const source = profile.families[index % profile.families.length];

        return {
          ...source,
          family: {
            ...source.family,
            family_id: `${source.family.family_id}:${index}`,
            label: `${source.family.label} · ${index + 1}`,
          },
        };
      }),
      played_family_count: 15,
      total_family_count: 18,
    },
  },
};
