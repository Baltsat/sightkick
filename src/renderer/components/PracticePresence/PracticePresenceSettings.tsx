import { useEffect, useState } from 'react';
import { Collapse, Divider, Input, Switch } from 'antd';
import { SettingLabel } from '../SettingsButton/SettingLabel';

interface PracticePresenceSettingsValue {
  menuBarEnabled: boolean;
  reminderEnabled: boolean;
  reminderTime?: string;
}

interface PracticePresenceSnapshot {
  settings: PracticePresenceSettingsValue;
  state: 'off' | 'ready' | 'played-today';
  label: string;
  nextReminderAt?: string;
}

const initialSnapshot: PracticePresenceSnapshot = {
  settings: {
    menuBarEnabled: false,
    reminderEnabled: false,
  },
  state: 'off',
  label: 'Drumroll · presence off',
};

function isSnapshot(value: unknown): value is PracticePresenceSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'settings' in value &&
    typeof value.settings === 'object' &&
    value.settings !== null
  );
}

function localTime(iso: string | undefined): string | undefined {
  if (!iso) {
    return undefined;
  }

  const date = new Date(iso);

  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : undefined;
}

export function PracticePresenceSettings() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!window.electron) {
      return undefined;
    }

    const off = window.electron.ipcRenderer.once<PracticePresenceSnapshot>(
      'practice-presence-settings',
      (reply) => {
        if (isSnapshot(reply)) {
          setSnapshot(reply);
        }
      },
    );

    window.electron.ipcRenderer.sendMessage('get-practice-presence-settings');

    return off;
  }, []);

  const save = (settings: PracticePresenceSettingsValue) => {
    if (!window.electron) {
      return;
    }

    setError(undefined);
    window.electron.ipcRenderer.once<
      PracticePresenceSnapshot | { error: string }
    >('practice-presence-settings-saved', (reply) => {
      if (isSnapshot(reply)) {
        setSnapshot(reply);
      } else {
        setError(reply.error);
      }
    });
    window.electron.ipcRenderer.sendMessage(
      'save-practice-presence-settings',
      settings,
    );
  };
  const settings = snapshot.settings;
  const nextReminder = localTime(snapshot.nextReminderAt);
  const enableReminder = async (enabled: boolean) => {
    if (!enabled) {
      save({ ...settings, reminderEnabled: false });

      return;
    }

    if (!settings.reminderTime) {
      setError('Choose a time before turning on the reminder.');

      return;
    }

    if (typeof window.Notification === 'undefined') {
      setError(
        'macOS notifications are unavailable here. Menu-bar presence stays on.',
      );

      return;
    }

    const permission = await window.Notification.requestPermission();

    if (permission !== 'granted') {
      setError('macOS notifications are off. Menu-bar presence stays on.');

      return;
    }

    save({ ...settings, reminderEnabled: true });
  };

  return (
    <Collapse
      size="small"
      items={[
        {
          key: 'practice-presence',
          label: (
            <span data-testid="practice-presence-heading">
              Practice presence
            </span>
          ),
          children: (
            <section
              className="flex flex-col gap-3"
              data-testid="practice-presence-settings"
            >
              <div className="flex items-center justify-between gap-3">
                <SettingLabel
                  label="Menu-bar presence"
                  tooltip="A private glance at today’s practice state. It stays off until you turn it on."
                />
                <Switch
                  size="small"
                  data-testid="practice-menu-bar-toggle"
                  checked={settings.menuBarEnabled}
                  onChange={(menuBarEnabled) =>
                    save({
                      ...settings,
                      menuBarEnabled,
                      reminderEnabled:
                        menuBarEnabled && settings.reminderEnabled,
                    })
                  }
                />
              </div>
              <p className="text-xs leading-5 text-text-muted">
                {snapshot.state === 'played-today'
                  ? 'A saved run already covers today. No reminder will fire.'
                  : settings.menuBarEnabled
                  ? 'Practice is ready when you are. Nothing is sent anywhere.'
                  : 'Off by default. It stores only local practice state.'}
              </p>
              <Divider className="my-0" />
              <div className="flex items-center justify-between gap-3">
                <SettingLabel
                  label="Reminder time"
                  tooltip="Choose one time for a single calm macOS reminder."
                />
                <Input
                  aria-label="Reminder time"
                  data-testid="practice-reminder-time"
                  type="time"
                  value={settings.reminderTime ?? ''}
                  disabled={!settings.menuBarEnabled}
                  onChange={(event) =>
                    save({
                      ...settings,
                      reminderTime: event.target.value || undefined,
                      reminderEnabled:
                        settings.reminderEnabled && Boolean(event.target.value),
                    })
                  }
                  className="w-28"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <SettingLabel
                  label="One macOS reminder"
                  tooltip="At most one cue on a planned practice day, never a streak warning."
                />
                <Switch
                  size="small"
                  data-testid="practice-reminder-toggle"
                  checked={settings.reminderEnabled}
                  disabled={!settings.menuBarEnabled}
                  onChange={(enabled) => void enableReminder(enabled)}
                />
              </div>
              {nextReminder ? (
                <p
                  className="text-xs text-text-muted"
                  data-testid="practice-next-reminder"
                >
                  Next calm cue: {nextReminder}
                </p>
              ) : null}
              {error ? (
                <p className="text-xs text-accent-text" role="status">
                  {error}
                </p>
              ) : null}
            </section>
          ),
        },
      ]}
    />
  );
}
