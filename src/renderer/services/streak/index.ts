export type { StreakStage, StreakState, StreakTransition } from './types';

export { STREAK_RESET_ON_MISS, STREAK_STAGES } from './constants';

export {
  INITIAL_STREAK_STATE,
  registerFailure,
  registerHit,
  resetForSeek,
  stageForCount,
} from './streak-tracker';
