import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputDevice, RawMidiInputEvent, inputBus } from '../input';
import { useMidiInputTelemetry } from './useMidiInputTelemetry';

const kit: InputDevice = {
  id: 'dtx-402',
  name: 'Yamaha DTX402',
  sourceId: 'midi',
  port: 3,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMidiInputTelemetry', () => {
  it('keeps raw receipt evidence separate from the mapped lane and port epoch', () => {
    let listener: ((event: RawMidiInputEvent) => void) | undefined;

    vi.spyOn(inputBus, 'subscribeRawMidi').mockImplementation((next) => {
      listener = next;

      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ selectedPortEpoch }) =>
        useMidiInputTelemetry({
          sessionId: 'run-a',
          selectedDevice: kit,
          selectedPortEpoch,
          inputMapping: { kick: ['midi:36'] },
        }),
      { initialProps: { selectedPortEpoch: 4 } },
    );

    act(
      () =>
        listener?.({
          controlId: 'midi:36',
          type: 144,
          note: 36,
          velocity: 104,
          receivedAt: 1_725_000_000_000,
        }),
    );

    expect(result.current.telemetry).toEqual({
      rawMessageCount: 1,
      lastMidiTimestamp: 1_725_000_000_000,
      selectedPortEpoch: 4,
      lastMappedLane: 'kick',
    });

    rerender({ selectedPortEpoch: 5 });
    expect(result.current.readTelemetry()).toEqual({
      rawMessageCount: 1,
      lastMidiTimestamp: 1_725_000_000_000,
      selectedPortEpoch: 5,
      lastMappedLane: 'kick',
    });
  });
});
