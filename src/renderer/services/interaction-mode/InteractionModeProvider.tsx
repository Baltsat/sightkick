import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { InteractionMode, InteractionModeArbiter } from './interaction-mode';

const InteractionModeContext = createContext<
  InteractionModeArbiter | undefined
>(undefined);

export function InteractionModeProvider({
  children,
  arbiter,
}: {
  children: ReactNode;
  arbiter?: InteractionModeArbiter;
}) {
  const ownedArbiter = useMemo(
    () => arbiter ?? new InteractionModeArbiter(),
    [arbiter],
  );

  useEffect(() => {
    ownedArbiter.start();

    return ownedArbiter.stop;
  }, [ownedArbiter]);

  return (
    <InteractionModeContext.Provider value={ownedArbiter}>
      {children}
    </InteractionModeContext.Provider>
  );
}

export function useInteractionMode(): InteractionMode {
  const arbiter = useContext(InteractionModeContext);

  return useSyncExternalStore(
    arbiter?.subscribe ?? (() => () => {}),
    arbiter?.getSnapshot ?? (() => 'kit'),
    () => 'kit',
  );
}
