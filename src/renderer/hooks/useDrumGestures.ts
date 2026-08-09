import { useEffect, useRef } from 'react';
import { InputMapping } from '../../types';
import { inputBus } from '../input';
import {
  createDrumGestureState,
  DrumGestureAction,
  DrumGestureSurface,
  recognizeDrumGesture,
} from '../services/gestures';
import { KitElement } from '../services/practice-stats';

interface UseDrumGesturesParams {
  enabled: boolean;
  surface: DrumGestureSurface;
  mapping: InputMapping;
  onAction: (action: DrumGestureAction) => void;
}

function mappedKitElement(
  mapping: InputMapping,
  controlId: string,
): KitElement | undefined {
  return (Object.keys(mapping) as KitElement[]).find(
    (element) => mapping[element]?.includes(controlId),
  );
}

export function useDrumGestures({
  enabled,
  surface,
  mapping,
  onAction,
}: UseDrumGesturesParams): void {
  const enabledRef = useRef(enabled);
  const surfaceRef = useRef(surface);
  const mappingRef = useRef(mapping);
  const actionRef = useRef(onAction);
  const stateRef = useRef(createDrumGestureState());

  useEffect(() => {
    enabledRef.current = enabled;

    if (!enabled) {
      stateRef.current = createDrumGestureState();
    }
  }, [enabled]);

  useEffect(() => {
    surfaceRef.current = surface;
    stateRef.current = createDrumGestureState();
  }, [surface]);

  useEffect(() => {
    mappingRef.current = mapping;
  }, [mapping]);

  useEffect(() => {
    actionRef.current = onAction;
  }, [onAction]);

  useEffect(
    () =>
      inputBus.subscribe(({ controlId, value }) => {
        if (!enabledRef.current || value === 0) {
          return;
        }

        const element = mappedKitElement(mappingRef.current, controlId);

        if (!element) {
          return;
        }

        const transition = recognizeDrumGesture(
          stateRef.current,
          { element, velocity: value, timeMs: performance.now() },
          surfaceRef.current,
        );

        stateRef.current = transition.state;

        if (transition.action) {
          actionRef.current(transition.action);
        }
      }),
    [],
  );
}
