import { ReactNode } from 'react';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { App as AntdApp, ConfigProvider } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { antdTheme } from '../../antdTheme';
import { InputProvider, useInput } from '../../context/InputContext';
import { installIpcMock, installLocalStorage } from '../../hooks/test-support';
import { inputBus } from '../../input';
import { useInputConfig } from './useInputConfig';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <InputProvider>{children}</InputProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

beforeEach(() => {
  installLocalStorage();
  installIpcMock();
});

afterEach(() => {
  inputBus.stop();
});

describe('useInputConfig', () => {
  it('keeps scoring input live while configuration is open and captures only an active Learn action', () => {
    const received = vi.fn();
    const unsubscribe = inputBus.subscribe(received);
    const { result } = renderHook(
      () => ({ input: useInput(), config: useInputConfig(true) }),
      { wrapper },
    );

    act(() =>
      result.current.input.setSelectedDevice({
        id: 'keyboard',
        name: 'Keyboard',
        sourceId: 'keyboard',
      }),
    );
    act(() => fireEvent.keyDown(window, { code: 'KeyJ' }));

    expect(received).toHaveBeenLastCalledWith({
      controlId: 'keyboard:KeyJ',
      value: 127,
    });

    received.mockClear();
    act(() => result.current.config.onLearn('snare'));
    act(() => fireEvent.keyDown(window, { code: 'KeyJ' }));

    expect(received).not.toHaveBeenCalled();
    expect(result.current.input.inputMapping.snare).toContain('keyboard:KeyJ');

    unsubscribe();
  });
});
