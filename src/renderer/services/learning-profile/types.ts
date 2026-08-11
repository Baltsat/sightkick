export const DRUM_SKILL_AXIS_IDS = [
  'pulse-timing',
  'reading-subdivision',
  'hand-control',
  'foot-control',
  'limb-coordination',
  'dynamics-touch',
  'groove-pocket',
  'fills-kit-navigation',
] as const;

export type DrumSkillAxisId = (typeof DRUM_SKILL_AXIS_IDS)[number];

export interface DrumSkillAxisDefinition {
  id: DrumSkillAxisId;
  label: string;
  description: string;
}

export const DRUM_SKILL_AXES: readonly DrumSkillAxisDefinition[] = [
  {
    id: 'pulse-timing',
    label: 'Pulse & Timing',
    description: 'Centers hits on the beat and keeps timing stable.',
  },
  {
    id: 'reading-subdivision',
    label: 'Reading & Subdivision',
    description:
      'Reads and executes quarters, eighths, sixteenths, tuplets, and rests.',
  },
  {
    id: 'hand-control',
    label: 'Hand Control',
    description: 'Controls hand-led lanes and core sticking vocabulary.',
  },
  {
    id: 'foot-control',
    label: 'Foot Control',
    description: 'Controls kick and pedal-led patterns at the intended tempo.',
  },
  {
    id: 'limb-coordination',
    label: 'Limb Coordination',
    description: 'Combines hands and feet accurately without pad confusion.',
  },
  {
    id: 'dynamics-touch',
    label: 'Dynamics & Touch',
    description: 'Shapes accents, ghost notes, and controlled velocity.',
  },
  {
    id: 'groove-pocket',
    label: 'Groove & Pocket',
    description: 'Sustains a dependable musical groove over time.',
  },
  {
    id: 'fills-kit-navigation',
    label: 'Fills & Kit Navigation',
    description:
      'Moves cleanly across toms and cymbals and returns to the groove.',
  },
] as const;

export type SkillConfidenceLevel = 'low' | 'medium' | 'high';

export interface SkillConfidence {
  level: SkillConfidenceLevel;
  label: 'Low confidence' | 'Medium confidence' | 'High confidence';
  /** Distinct completed runs with usable evidence for this axis. */
  evidenceCount: number;
  /** Bounded aggregate signal strength; useful for deterministic tie-breaking. */
  evidenceWeight: number;
  detail: string;
}

export type SkillTrendDirection =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'unknown';

export interface SkillTrend {
  direction: SkillTrendDirection;
  /** Recent-minus-earlier demonstrated score in percentage points. */
  delta: number;
  detail: string;
}

export interface SkillLimitingFactor {
  key: string;
  label: string;
  detail: string;
  /** Demonstrated score for this factor, before confidence shrinkage. */
  score: number;
}

export interface DrumSkillAxisProfile extends DrumSkillAxisDefinition {
  /** Confidence-adjusted estimate, always 0..100. */
  score: number;
  confidence: SkillConfidence;
  trend: SkillTrend;
  limitingFactor: SkillLimitingFactor;
}

export interface DrumLearningProfile {
  axes: DrumSkillAxisProfile[];
  evidenceRuns: number;
  /** Latest valid completedAt value present in the input, if any. */
  computedThrough?: string;
  strongestAxis: DrumSkillAxisId;
  focusAxis: DrumSkillAxisId;
}
