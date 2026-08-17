import { describe, expect, it } from 'vitest';
import { externalCorpusItemManifest } from './external-corpus-manifest';

const manifest = {
  item_id: 'local:groove-midi:gmd-drummer1-session1-1',
  source: 'chart_analysis' as const,
  source_revision: 'gmd-v1.0.0:drummer1/session1/1:converted-v1',
  demands: [
    {
      skill_id: 'music.groove_8th',
      weight: 1,
      target_bpm: 100,
      context:
        'meter=4/4;subdivision=eighth;lanes=K,S,H;limbs=joint;phrase=beat',
    },
  ],
  context_signature: 'meter=4/4;style=funk;lanes=K,S,H;phrase=beat',
  assessment_confidence: 0.72,
};

describe('external corpus item manifests', () => {
  it('accepts a valid local catalogue manifest bound to its song id', () => {
    const encoded = Buffer.from(JSON.stringify(manifest)).toString('base64url');

    expect(externalCorpusItemManifest(manifest.item_id, encoded)).toEqual(
      manifest,
    );
  });

  it('rejects a catalogue manifest that could be replayed against another song', () => {
    const encoded = Buffer.from(JSON.stringify(manifest)).toString('base64url');

    expect(externalCorpusItemManifest('another-song', encoded)).toBeUndefined();
  });
});
