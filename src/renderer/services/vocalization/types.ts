import type { StickingLimb } from '../sticking';

export type VocalizationSampleId =
  | 'kick_bum'
  | 'snare_tak'
  | 'snare_accent_bak'
  | 'snare_ghost_ki'
  | 'hihat_closed_tyk'
  | 'hihat_open_tsa_short'
  | 'hihat_open_tsaa_long'
  | 'tom_high_tim'
  | 'tom_mid_tom'
  | 'tom_floor_dum'
  | 'crash_ksh_short'
  | 'crash_kshh_long'
  | 'ride_din_short'
  | 'ride_diin_long'
  | 'breath_h';

export type VocalizationVoice =
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'tom1'
  | 'tom2'
  | 'tom3'
  | 'crash'
  | 'ride'
  | 'breath';

export type VocalizationArticulation =
  | 'normal'
  | 'accent'
  | 'ghost'
  | 'open'
  | 'staccato'
  | 'sustained'
  | 'breath';

export interface VocalizationEvent {
  tick: number;
  timeSeconds: number;
  voice: VocalizationVoice;
  articulation: VocalizationArticulation;
  dynamic: 'normal' | 'accent' | 'ghost';
  length: 'staccato' | 'sustained';
  sampleId: VocalizationSampleId;
  syllable: string;
  gain: number;
  limb?: StickingLimb;
}

export interface VocalizationTrack {
  events: VocalizationEvent[];
  durationSeconds: number;
}

export interface PcmSample {
  sampleRate: number;
  data: Float32Array;
}

export type VocalizationBank = Record<VocalizationSampleId, PcmSample[]>;

export interface RenderedVocalizationTrack extends PcmSample {
  wavBytes: Uint8Array;
}
