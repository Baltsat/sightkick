import { UseGamificationResult } from '../hooks/useGamification';
import { PracticeHistoryEntry } from '../services/next-practice';
import { RankedPracticeCandidate } from '../services/next-practice';

/**
 * The library owns recommendation state because it can see every playable
 * song, lesson unlock, and saved run. SongView receives only the narrow
 * actions/evidence it needs through the existing route outlet.
 */
export interface PracticeOutletContext {
  gamification: UseGamificationResult;
  recommendation?: RankedPracticeCandidate;
  continuePractice: (completedRun?: PracticeHistoryEntry) => void;
}
