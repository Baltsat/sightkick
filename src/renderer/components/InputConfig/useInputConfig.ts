import { useCallback, useEffect, useState } from 'react';
import { useInput } from '../../context/InputContext';
import { InputElement } from '../../../types';
import {
  controlSource,
  InputDevice,
  inputBus,
  isTypingTarget,
  makeControlId,
} from '../../input';

export function useInputConfig(isOpen: boolean) {
  const {
    setSelectedDevice,
    selectedDevice,
    inputReadiness,
    inputMapping,
    controlMapping,
    assignControl,
    removeControl,
    inputLatencyMs,
    setInputLatencyMs,
  } = useInput();
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [listeningTo, setListeningTo] = useState<InputElement>();
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);

    if (!isOpen) {
      setListeningTo(undefined);
    }
  }

  const refreshDevices = useCallback(() => {
    inputBus.listDevices().then((list) => {
      setDevices(list);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    refreshDevices();
  }, [isOpen, refreshDevices]);

  useEffect(() => {
    if (!isOpen || listeningTo === undefined) {
      return undefined;
    }

    return inputBus.capture(({ controlId }) => {
      if (
        selectedDevice &&
        controlSource(controlId) === selectedDevice.sourceId
      ) {
        assignControl(listeningTo, controlId);
        setListeningTo(undefined);
      }
    });
  }, [assignControl, selectedDevice, isOpen, listeningTo]);

  useEffect(() => {
    if (listeningTo === undefined) {
      return undefined;
    }

    const swallow = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (
        event.type === 'keydown' &&
        !event.repeat &&
        selectedDevice?.sourceId === 'keyboard'
      ) {
        assignControl(listeningTo, makeControlId('keyboard', event.code));
        setListeningTo(undefined);
      }
    };

    window.addEventListener('keydown', swallow, true);
    window.addEventListener('keyup', swallow, true);

    return () => {
      window.removeEventListener('keydown', swallow, true);
      window.removeEventListener('keyup', swallow, true);
    };
  }, [listeningTo, selectedDevice, assignControl]);

  return {
    devices,
    selectedDeviceId: selectedDevice?.id,
    selectedDeviceName: selectedDevice?.name,
    inputReadiness,
    onSelectDevice: (id: string | undefined) => {
      setSelectedDevice(devices.find((device) => device.id === id) ?? null);
    },
    mapping: { ...inputMapping, ...controlMapping },
    listeningTo,
    onLearn: (element: InputElement) => setListeningTo(element),
    onStopLearn: () => setListeningTo(undefined),
    onRemoveControl: removeControl,
    onRefreshDevices: refreshDevices,
    inputLatencyMs,
    onInputLatencyChange: setInputLatencyMs,
  };
}
