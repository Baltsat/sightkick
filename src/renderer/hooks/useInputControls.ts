import { useEffect, useLayoutEffect, useRef } from 'react';
import { ElementMapping, InputElement } from '../../types';
import { inputBus } from '../input';

export type InputControlHandlers = Partial<Record<InputElement, () => void>>;

export function useInputControls(
  mapping: ElementMapping,
  handlers: InputControlHandlers,
  enabled = true,
  blockedControlIds?: Set<string>,
): void {
  const mappingRef = useRef(mapping);
  const handlersRef = useRef(handlers);
  const enabledRef = useRef(enabled);
  const blockedRef = useRef(blockedControlIds);

  // MIDI events can arrive only a few milliseconds apart. A layout effect
  // updates the subscriber before the browser can deliver input for the new
  // committed screen, so a Crash after opening Sort cannot run stale Back.
  useLayoutEffect(() => {
    mappingRef.current = mapping;
    handlersRef.current = handlers;
    enabledRef.current = enabled;
    blockedRef.current = blockedControlIds;
  }, [blockedControlIds, enabled, handlers, mapping]);

  useEffect(() => {
    return inputBus.subscribe(({ controlId, value }) => {
      if (!enabledRef.current || value === 0) {
        return;
      }

      if (blockedRef.current?.has(controlId)) {
        return;
      }

      const map = mappingRef.current;
      const element = (Object.keys(map) as InputElement[]).find(
        (key) => map[key]?.includes(controlId),
      );

      if (element) {
        handlersRef.current[element]?.();
      }
    });
  }, []);
}
