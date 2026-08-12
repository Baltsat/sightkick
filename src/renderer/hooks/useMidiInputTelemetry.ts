import { useCallback, useEffect, useReducer, useRef } from 'react';
import { InputMapping } from '../../types';
import type {
  KitElement,
  MidiInputTelemetry,
} from '../services/practice-stats';
import { inputBus, InputDevice } from '../input';

interface UseMidiInputTelemetryOptions {
  sessionId: string;
  selectedDevice: InputDevice | null;
  inputMapping: InputMapping;
  selectedPortEpoch: number;
}

function emptyTelemetry(selectedPortEpoch: number): MidiInputTelemetry {
  return {
    rawMessageCount: 0,
    selectedPortEpoch,
  };
}

function mappedLaneFor(
  controlId: string,
  inputMapping: InputMapping,
): KitElement | undefined {
  return Object.entries(inputMapping).find(
    ([, controls]) => controls?.includes(controlId),
  )?.[0] as KitElement | undefined;
}

export function useMidiInputTelemetry({
  sessionId,
  selectedDevice,
  inputMapping,
  selectedPortEpoch,
}: UseMidiInputTelemetryOptions): {
  telemetry?: MidiInputTelemetry;
  readTelemetry: () => MidiInputTelemetry | undefined;
} {
  const [telemetry, replaceTelemetry] = useReducer(
    (_: MidiInputTelemetry, next: MidiInputTelemetry) => next,
    emptyTelemetry(selectedPortEpoch),
  );
  const telemetryRef = useRef(telemetry);
  const inputMappingRef = useRef(inputMapping);
  const midiSelectedRef = useRef(selectedDevice?.sourceId === 'midi');
  const previousSessionIdRef = useRef(sessionId);
  const commit = useCallback((next: MidiInputTelemetry) => {
    telemetryRef.current = next;
    replaceTelemetry(next);
  }, []);

  useEffect(() => {
    inputMappingRef.current = inputMapping;
  }, [inputMapping]);

  useEffect(() => {
    midiSelectedRef.current = selectedDevice?.sourceId === 'midi';
  }, [selectedDevice]);

  useEffect(() => {
    if (previousSessionIdRef.current === sessionId) {
      return;
    }

    previousSessionIdRef.current = sessionId;
    commit(emptyTelemetry(selectedPortEpoch));
  }, [commit, selectedPortEpoch, sessionId]);

  useEffect(() => {
    const previous = telemetryRef.current;

    if (previous.selectedPortEpoch !== selectedPortEpoch) {
      commit({ ...previous, selectedPortEpoch });
    }
  }, [commit, selectedPortEpoch]);

  useEffect(() => {
    if (selectedDevice?.sourceId !== 'midi') {
      return undefined;
    }

    return inputBus.subscribeRawMidi((event) => {
      const lastMappedLane = mappedLaneFor(
        event.controlId,
        inputMappingRef.current,
      );
      const previous = telemetryRef.current;

      commit({
        ...previous,
        rawMessageCount: previous.rawMessageCount + 1,
        lastMidiTimestamp: event.receivedAt,
        selectedPortEpoch,
        ...(lastMappedLane ? { lastMappedLane } : {}),
      });
    });
  }, [commit, selectedDevice, selectedPortEpoch]);

  const readTelemetry = useCallback(() => {
    if (!midiSelectedRef.current) {
      return undefined;
    }

    return { ...telemetryRef.current };
  }, []);

  return {
    telemetry: selectedDevice?.sourceId === 'midi' ? telemetry : undefined,
    readTelemetry,
  };
}
