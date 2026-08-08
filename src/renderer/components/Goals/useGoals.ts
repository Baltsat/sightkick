import { useCallback, useEffect, useRef, useState } from 'react';
import { Difficulty } from 'scan-chart';

/**
 * Renderer-side mirror of `src/main/ipc/goals.ts`'s `Goal` shape. Kept as
 * its own local type (not imported from the main-process file — renderer
 * code never imports from `src/main/**`) the same way every other IPC
 * response shape in this codebase is re-declared renderer-side.
 */
export interface Goal {
  id: string;
  songId: string;
  difficulty: Difficulty;
  targetDate?: string;
  createdAt: string;
  isPrimary: boolean;
}

export interface SaveGoalInput {
  id?: string;
  songId: string;
  difficulty: Difficulty;
  targetDate?: string;
  isPrimary?: boolean;
}

export interface UseGoalsResult {
  isLoaded: boolean;
  goals: Goal[];
  primaryGoal: Goal | undefined;
  saveGoal: (input: SaveGoalInput, onSaved?: (goals: Goal[]) => void) => void;
  deleteGoal: (id: string) => void;
  setPrimaryGoal: (id: string) => void;
}

interface GoalsReply {
  goals: Goal[];
}

function isErrorReply(reply: object): reply is { error: string } {
  return 'error' in reply;
}

/**
 * Owns the whole app's goal list: load-on-mount, plus create/update/
 * delete/set-primary, each round-tripping through `src/main/ipc/goals.ts`
 * and updating from the full replied list (same "reply with everything,
 * consumers just re-render" pattern `useGamification` uses for
 * `practiceDays`).
 */
export function useGoals(): UseGoalsResult {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadOffRef = useRef<(() => void) | undefined>(undefined);
  const saveOffRef = useRef<(() => void) | undefined>(undefined);
  const deleteOffRef = useRef<(() => void) | undefined>(undefined);
  const primaryOffRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('load-goals');
    loadOffRef.current = window.electron.ipcRenderer.once<
      GoalsReply | { error: string }
    >('load-goals', (reply) => {
      loadOffRef.current = undefined;

      if (!isErrorReply(reply)) {
        setGoals(reply.goals);
      }

      setIsLoaded(true);
    });

    return () => {
      loadOffRef.current?.();
      saveOffRef.current?.();
      deleteOffRef.current?.();
      primaryOffRef.current?.();
    };
  }, []);

  const saveGoal = useCallback(
    (input: SaveGoalInput, onSaved?: (goals: Goal[]) => void) => {
      saveOffRef.current?.();
      saveOffRef.current = window.electron.ipcRenderer.once<
        GoalsReply | { error: string }
      >('save-goal', (reply) => {
        saveOffRef.current = undefined;

        if (!isErrorReply(reply)) {
          setGoals(reply.goals);
          onSaved?.(reply.goals);
        }
      });
      window.electron.ipcRenderer.sendMessage('save-goal', input);
    },
    [],
  );
  const deleteGoal = useCallback((id: string) => {
    deleteOffRef.current?.();
    deleteOffRef.current = window.electron.ipcRenderer.once<
      GoalsReply | { error: string }
    >('delete-goal', (reply) => {
      deleteOffRef.current = undefined;

      if (!isErrorReply(reply)) {
        setGoals(reply.goals);
      }
    });
    window.electron.ipcRenderer.sendMessage('delete-goal', id);
  }, []);
  const setPrimaryGoal = useCallback((id: string) => {
    primaryOffRef.current?.();
    primaryOffRef.current = window.electron.ipcRenderer.once<
      GoalsReply | { error: string }
    >('set-primary-goal', (reply) => {
      primaryOffRef.current = undefined;

      if (!isErrorReply(reply)) {
        setGoals(reply.goals);
      }
    });
    window.electron.ipcRenderer.sendMessage('set-primary-goal', id);
  }, []);

  return {
    isLoaded,
    goals,
    primaryGoal: goals.find((goal) => goal.isPrimary),
    saveGoal,
    deleteGoal,
    setPrimaryGoal,
  };
}
