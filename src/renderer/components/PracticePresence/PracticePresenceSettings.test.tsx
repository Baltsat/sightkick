import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { installIpcMock } from '../../hooks/test-support';
import { PracticePresenceSettings } from './PracticePresenceSettings';

const readySnapshot = {
  settings: {
    menuBarEnabled: true,
    reminderEnabled: false,
    reminderTime: '18:00',
  },
  state: 'ready' as const,
  label: 'Drumroll · practice ready',
  nextReminderAt: '2026-08-12T10:00:00.000Z',
};

async function renderSettings() {
  const ipc = installIpcMock();

  render(<PracticePresenceSettings />);
  fireEvent.click(screen.getByTestId('practice-presence-heading'));

  return ipc;
}

describe('PracticePresenceSettings', () => {
  it('renders the local-default-off state and asks the desktop process for it', async () => {
    const ipc = await renderSettings();

    expect(screen.getByTestId('practice-menu-bar-toggle')).not.toBeChecked();
    expect(
      screen.getByText('Off by default. It stores only local practice state.'),
    ).toBeInTheDocument();
    expect(ipc.sent).toContainEqual({
      channel: 'get-practice-presence-settings',
      args: [],
    });
  });

  it('saves an explicit menu-bar opt-in', async () => {
    const ipc = await renderSettings();

    fireEvent.click(screen.getByTestId('practice-menu-bar-toggle'));

    expect(ipc.sent).toContainEqual({
      channel: 'save-practice-presence-settings',
      args: [
        {
          menuBarEnabled: true,
          reminderEnabled: false,
        },
      ],
    });
  });

  it('requires a schedule before it can request notification permission', async () => {
    const ipc = await renderSettings();

    await act(async () => {
      ipc.emit('practice-presence-settings', {
        settings: { menuBarEnabled: true, reminderEnabled: false },
        state: 'ready',
        label: 'Drumroll · practice ready',
      });
    });

    const permission = vi.fn();

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: permission },
    });

    fireEvent.click(screen.getByTestId('practice-reminder-toggle'));

    expect(permission).not.toHaveBeenCalled();
    expect(
      screen.getByText('Choose a time before turning on the reminder.'),
    ).toBeInTheDocument();
  });

  it('requests permission only after the player has selected a time', async () => {
    const ipc = await renderSettings();
    const permission = vi.fn(async () => 'granted');

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: permission },
    });

    await act(async () => {
      ipc.emit('practice-presence-settings', readySnapshot);
    });
    fireEvent.click(screen.getByTestId('practice-reminder-toggle'));

    await act(async () => Promise.resolve());

    expect(permission).toHaveBeenCalledOnce();
    expect(ipc.sent).toContainEqual({
      channel: 'save-practice-presence-settings',
      args: [
        {
          menuBarEnabled: true,
          reminderEnabled: true,
          reminderTime: '18:00',
        },
      ],
    });
  });
});
