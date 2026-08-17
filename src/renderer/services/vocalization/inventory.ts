import type { VocalizationSampleId } from './types';

export interface VocalizationInventoryEntry {
  sampleId: VocalizationSampleId;
  syllable: string;
  recordingStem: string;
}

export const VOCALIZATION_INVENTORY: VocalizationInventoryEntry[] = [
  { sampleId: 'kick_bum', syllable: 'бум', recordingStem: 'kick_bum' },
  { sampleId: 'snare_tak', syllable: 'так', recordingStem: 'snare_tak' },
  {
    sampleId: 'snare_accent_bak',
    syllable: 'бак',
    recordingStem: 'snare_accent_bak',
  },
  {
    sampleId: 'snare_ghost_ki',
    syllable: 'ки',
    recordingStem: 'snare_ghost_ki',
  },
  {
    sampleId: 'hihat_closed_tyk',
    syllable: 'тык',
    recordingStem: 'hihat_closed_tyk',
  },
  {
    sampleId: 'hihat_open_tsa_short',
    syllable: 'ца',
    recordingStem: 'hihat_open_tsa_short',
  },
  {
    sampleId: 'hihat_open_tsaa_long',
    syllable: 'цаа',
    recordingStem: 'hihat_open_tsaa_long',
  },
  {
    sampleId: 'tom_high_tim',
    syllable: 'тим',
    recordingStem: 'tom_high_tim',
  },
  {
    sampleId: 'tom_mid_tom',
    syllable: 'том',
    recordingStem: 'tom_mid_tom',
  },
  {
    sampleId: 'tom_floor_dum',
    syllable: 'дум',
    recordingStem: 'tom_floor_dum',
  },
  {
    sampleId: 'crash_ksh_short',
    syllable: 'кш',
    recordingStem: 'crash_ksh_short',
  },
  {
    sampleId: 'crash_kshh_long',
    syllable: 'кшш',
    recordingStem: 'crash_kshh_long',
  },
  {
    sampleId: 'ride_din_short',
    syllable: 'дин',
    recordingStem: 'ride_din_short',
  },
  {
    sampleId: 'ride_diin_long',
    syllable: 'диин',
    recordingStem: 'ride_diin_long',
  },
  { sampleId: 'breath_h', syllable: 'х', recordingStem: 'breath_h' },
];

export const SYLLABLE_BY_SAMPLE = Object.fromEntries(
  VOCALIZATION_INVENTORY.map(({ sampleId, syllable }) => [sampleId, syllable]),
) as Record<VocalizationSampleId, string>;
