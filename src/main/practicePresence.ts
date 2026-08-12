import {
  Menu,
  nativeImage,
  Notification,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';

export const PRACTICE_PRESENCE_SETTINGS_KEY = 'practicePresence.settings';

export const PRACTICE_PRESENCE_STATUS_KEY = 'practicePresence.status';

export interface PracticePresenceSettings {
  menuBarEnabled: boolean;
  reminderEnabled: boolean;
  reminderTime?: string;
}

export interface PracticePresenceStatus {
  lastCompletedAt?: string;
  lastReminderDate?: string;
  snoozedUntil?: string;
}

export interface PracticePresenceSnapshot {
  settings: PracticePresenceSettings;
  state: 'off' | 'ready' | 'played-today';
  label: string;
  nextReminderAt?: string;
}

interface StoreLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

interface PracticePresenceOptions {
  store: StoreLike;
  openPractice: () => void;
  now?: () => Date;
}

const defaultSettings: PracticePresenceSettings = {
  menuBarEnabled: false,
  reminderEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReminderTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function atReminderTime(time: string, date: Date): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const scheduled = new Date(date);

  scheduled.setHours(hours, minutes, 0, 0);

  return scheduled;
}

function nextReminderAt(time: string, now: Date): Date {
  const scheduled = atReminderTime(time, now);

  if (scheduled.getTime() > now.getTime()) {
    return scheduled;
  }

  scheduled.setDate(scheduled.getDate() + 1);

  return scheduled;
}

function formatReminderTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);

  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function readSettings(value: unknown): PracticePresenceSettings {
  if (!isRecord(value)) {
    return defaultSettings;
  }

  const reminderTime = isReminderTime(value.reminderTime)
    ? value.reminderTime
    : undefined;
  const menuBarEnabled = value.menuBarEnabled === true;

  return {
    menuBarEnabled,
    reminderEnabled:
      menuBarEnabled &&
      reminderTime !== undefined &&
      value.reminderEnabled === true,
    ...(reminderTime ? { reminderTime } : {}),
  };
}

function readStatus(value: unknown): PracticePresenceStatus {
  if (!isRecord(value)) {
    return {};
  }

  return {
    ...(typeof value.lastCompletedAt === 'string'
      ? { lastCompletedAt: value.lastCompletedAt }
      : {}),
    ...(typeof value.lastReminderDate === 'string'
      ? { lastReminderDate: value.lastReminderDate }
      : {}),
    ...(typeof value.snoozedUntil === 'string'
      ? { snoozedUntil: value.snoozedUntil }
      : {}),
  };
}

function isCompletedToday(status: PracticePresenceStatus, now: Date): boolean {
  if (!status.lastCompletedAt) {
    return false;
  }

  const completedAt = new Date(status.lastCompletedAt);

  return (
    Number.isFinite(completedAt.getTime()) &&
    localDateKey(completedAt) === localDateKey(now)
  );
}

function hasActiveSnooze(status: PracticePresenceStatus, now: Date): boolean {
  if (!status.snoozedUntil) {
    return false;
  }

  const snoozedUntil = new Date(status.snoozedUntil);

  return (
    Number.isFinite(snoozedUntil.getTime()) &&
    snoozedUntil.getTime() > now.getTime()
  );
}

function trayIcon() {
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M2 3h12v2H2zm2 4h8v2H4zm-2 4h12v2H2z"/></svg>',
    )}`,
  );

  image.setTemplateImage(true);

  return image;
}

export class PracticePresenceController {
  private readonly store: StoreLike;
  private readonly openPractice: () => void;
  private readonly now: () => Date;
  private tray: Tray | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor({
    store,
    openPractice,
    now = () => new Date(),
  }: PracticePresenceOptions) {
    this.store = store;
    this.openPractice = openPractice;
    this.now = now;
  }

  initialize(): void {
    this.refresh();
    this.timer = setInterval(() => this.tick(), 60_000);
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.tray?.destroy();
    this.tray = undefined;
  }

  getSnapshot(now = this.now()): PracticePresenceSnapshot {
    const settings = this.getSettings();
    const status = this.getStatus();
    const state = settings.menuBarEnabled
      ? isCompletedToday(status, now)
        ? 'played-today'
        : 'ready'
      : 'off';
    const next =
      settings.reminderEnabled && settings.reminderTime
        ? nextReminderAt(settings.reminderTime, now)
        : undefined;

    return {
      settings,
      state,
      label:
        state === 'played-today'
          ? 'Drumroll · played today'
          : state === 'ready'
          ? 'Drumroll · practice ready'
          : 'Drumroll · presence off',
      ...(next ? { nextReminderAt: next.toISOString() } : {}),
    };
  }

  saveSettings(value: unknown): PracticePresenceSnapshot {
    if (!isRecord(value) || typeof value.menuBarEnabled !== 'boolean') {
      throw new Error('menuBarEnabled must be a boolean');
    }

    if (typeof value.reminderEnabled !== 'boolean') {
      throw new Error('reminderEnabled must be a boolean');
    }

    if (value.reminderEnabled && !isReminderTime(value.reminderTime)) {
      throw new Error('Choose a reminder time before enabling reminders');
    }

    const settings: PracticePresenceSettings = {
      menuBarEnabled: value.menuBarEnabled,
      reminderEnabled: value.menuBarEnabled && value.reminderEnabled,
      ...(isReminderTime(value.reminderTime)
        ? { reminderTime: value.reminderTime }
        : {}),
    };

    this.store.set(PRACTICE_PRESENCE_SETTINGS_KEY, settings);
    this.refresh();

    return this.getSnapshot();
  }

  recordPractice(completedAt: string): PracticePresenceSnapshot {
    const completed = new Date(completedAt);

    if (!Number.isFinite(completed.getTime())) {
      return this.getSnapshot();
    }

    const status = this.getStatus();

    this.store.set(PRACTICE_PRESENCE_STATUS_KEY, {
      ...status,
      lastCompletedAt: completed.toISOString(),
      snoozedUntil: undefined,
    } satisfies PracticePresenceStatus);
    this.refresh();

    return this.getSnapshot();
  }

  snooze(now = this.now()): PracticePresenceSnapshot {
    const settings = this.getSettings();

    if (!settings.reminderEnabled || !settings.reminderTime) {
      return this.getSnapshot(now);
    }

    const status = this.getStatus();

    this.store.set(PRACTICE_PRESENCE_STATUS_KEY, {
      ...status,
      snoozedUntil: nextReminderAt(settings.reminderTime, now).toISOString(),
    } satisfies PracticePresenceStatus);
    this.refresh();

    return this.getSnapshot(now);
  }

  tick(now = this.now()): void {
    const settings = this.getSettings();
    const status = this.getStatus();

    if (
      !settings.reminderEnabled ||
      !settings.reminderTime ||
      isCompletedToday(status, now) ||
      hasActiveSnooze(status, now) ||
      status.lastReminderDate === localDateKey(now) ||
      now.getTime() < atReminderTime(settings.reminderTime, now).getTime() ||
      !Notification.isSupported()
    ) {
      return;
    }

    const notification = new Notification({
      title: 'Drumroll',
      body: 'Your practice set is ready when you are.',
      silent: false,
      groupId: 'drumroll-practice',
    });

    notification.on('click', () => this.openPractice());
    notification.show();
    this.store.set(PRACTICE_PRESENCE_STATUS_KEY, {
      ...status,
      lastReminderDate: localDateKey(now),
    } satisfies PracticePresenceStatus);
    this.refresh();
  }

  startPractice(): void {
    this.openPractice();
  }

  private getSettings(): PracticePresenceSettings {
    return readSettings(this.store.get(PRACTICE_PRESENCE_SETTINGS_KEY));
  }

  private getStatus(): PracticePresenceStatus {
    return readStatus(this.store.get(PRACTICE_PRESENCE_STATUS_KEY));
  }

  private refresh(): void {
    const snapshot = this.getSnapshot();

    if (snapshot.state === 'off') {
      this.tray?.destroy();
      this.tray = undefined;

      return;
    }

    if (!this.tray) {
      this.tray = new Tray(trayIcon());
      this.tray.on('click', () => this.startPractice());
    }

    if (process.platform === 'darwin') {
      this.tray.setTitle(snapshot.label);
    }

    this.tray.setToolTip(snapshot.label);
    this.tray.setContextMenu(this.buildMenu(snapshot));
  }

  private buildMenu(snapshot: PracticePresenceSnapshot) {
    const settings = snapshot.settings;
    const snoozeLabel = settings.reminderTime
      ? `Snooze until ${formatReminderTime(settings.reminderTime)}`
      : 'Snooze until next reminder';
    const template: MenuItemConstructorOptions[] = [
      {
        label:
          snapshot.state === 'played-today' ? 'Played today' : 'Practice ready',
        enabled: false,
      },
      { type: 'separator' },
      { label: 'Start practice', click: () => this.startPractice() },
      {
        label: snoozeLabel,
        enabled: Boolean(
          settings.reminderEnabled && snapshot.state === 'ready',
        ),
        click: () => this.snooze(),
      },
      {
        label: 'Turn off reminders',
        enabled: settings.reminderEnabled,
        click: () =>
          this.saveSettings({
            ...settings,
            reminderEnabled: false,
          }),
      },
      { type: 'separator' },
      {
        label: 'Hide menu-bar presence',
        click: () =>
          this.saveSettings({
            ...settings,
            menuBarEnabled: false,
            reminderEnabled: false,
          }),
      },
    ];

    return Menu.buildFromTemplate(template);
  }
}
