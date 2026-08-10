import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Difficulty } from 'scan-chart';
import { usePersisted } from '../hooks/usePersisted';

interface AppContextValue {
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  currentPath: string | null;
  setCurrentPath: (p: string | null) => void;
  isDev: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [difficulty, setDifficulty] = usePersisted<Difficulty>(
    'settings.difficulty',
    'expert',
  );
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('check-dev');

    return window.electron.ipcRenderer.once('check-dev', (dev: boolean) => {
      setIsDev(dev);
    });
  }, []);

  const value = useMemo(
    () => ({
      difficulty,
      setDifficulty,
      currentPath,
      setCurrentPath,
      isDev,
    }),
    [difficulty, setDifficulty, currentPath, setCurrentPath, isDev],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);

  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }

  return ctx;
}
