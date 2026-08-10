import { GameMode, PlayheadStyle } from './types';

export interface ModePolicy {
  player: 'default' | 'speed';
  /**
   * Perform-only. Gates the star rating / accuracy modal chrome and
   * high-score submission in SongView's onEnded, and picks which control
   * handlers useInputControls wires up (transport-style vs practice
   * navigation). It does NOT gate per-hit analytics capture,
   * save-practice-run, or the practice stats summary shown in
   * ScoreSummary/PracticeStats — those fire in both modes whenever a run
   * actually ends with a real attempt. A practice run with looping/speed
   * is still evidence of progression, so it earns the same analytics as a
   * Perform run. Ordinary song Practice never earns stars; a complete
   * target-speed curriculum lesson is the deliberate exception because
   * lessons launch directly into Practice and need a real progression path.
   */
  scoring: boolean;
  allowScrubbing: boolean;
  looping: boolean;
  speedControl: boolean;
  playheadOverride?: PlayheadStyle;
  parkAtStartOnEnd: boolean;
}

export const MODE_POLICIES: Record<GameMode, ModePolicy> = {
  perform: {
    player: 'default',
    scoring: true,
    allowScrubbing: false,
    looping: false,
    speedControl: false,
    parkAtStartOnEnd: false,
  },
  practice: {
    player: 'speed',
    scoring: false,
    allowScrubbing: true,
    looping: true,
    speedControl: true,
    playheadOverride: 'Cursor',
    parkAtStartOnEnd: true,
  },
};

export function resolveModePolicy(gameMode: GameMode | undefined): ModePolicy {
  return MODE_POLICIES[gameMode ?? 'perform'];
}
