import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { validateItemSkillManifests } from './item-manifest';
import { rankZpdFrontier } from './zpd-frontier';
import type { AtomicSkillState, ItemSkillManifest } from './types';

const cataloguePath = process.env.GROOVE_MIDI_CATALOGUE;

function state(skill_id: string): AtomicSkillState {
  return {
    skill_id,
    alpha: 12,
    beta: 3,
    effective_trials: 8,
    best_supported_bpm: 100,
    last_retention_at: '2026-08-17T00:00:00.000Z',
    next_review_at: '2026-08-16T00:00:00.000Z',
    stage: 'retained',
    evidence_boundary: 'midi',
  };
}

describe('Groove MIDI Dataset ZPD catalogue', () => {
  it.runIf(Boolean(cataloguePath))(
    'ranks every imported item through the atomic ZPD frontier',
    () => {
      const catalogue = JSON.parse(fs.readFileSync(cataloguePath!, 'utf8')) as {
        items: Array<{ id: string; pedagogy: ItemSkillManifest }>;
      };
      const manifests = catalogue.items.map(({ pedagogy }) => pedagogy);
      const skills = [
        ...new Set(
          manifests.flatMap(({ demands }) =>
            demands.map(({ skill_id }) => skill_id),
          ),
        ),
      ];
      const ranked = rankZpdFrontier({
        now: '2026-08-17T00:00:00.000Z',
        states: skills.map(state),
        candidates: catalogue.items.map(({ id, pedagogy }) => ({
          item_id: id,
          kind: 'song',
          title: id,
          available: true,
          manifest: pedagogy,
        })),
      });

      expect(catalogue.items).toHaveLength(96);
      expect(validateItemSkillManifests(manifests)).toEqual({
        valid: true,
        errors: [],
      });
      expect(ranked).toHaveLength(96);
      expect(ranked[0]?.decision.state).toMatch(/productive|scaffold/);
      expect(new Set(ranked.map(({ candidate }) => candidate.item_id))).toEqual(
        new Set(catalogue.items.map(({ id }) => id)),
      );
    },
  );
});
