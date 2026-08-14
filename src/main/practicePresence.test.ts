import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { makeStore } from './ipc/test-support';

const holder = vi.hoisted(() => ({
  trays: [] as Array<{
    title?: string;
    tooltip?: string;
    menu?: unknown;
    destroyed: boolean;
    handlers: Map<string, () => void>;
  }>,
  menus: [] as unknown[],
  notifications: [] as Array<{
    options: Record<string, unknown>;
    handlers: Map<string, () => void>;
    shown: boolean;
  }>,
  notificationSupported: true,
}));

vi.mock('electron', () => {
  class FakeTray {
    title?: string;
    tooltip?: string;
    menu?: unknown;
    destroyed = false;
    handlers = new Map<string, () => void>();

    constructor() {
      holder.trays.push(this);
    }

    on(event: string, handler: () => void) {
      this.handlers.set(event, handler);
    }

    setTitle(title: string) {
      this.title = title;
    }

    setToolTip(tooltip: string) {
      this.tooltip = tooltip;
    }

    setContextMenu(menu: unknown) {
      this.menu = menu;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  class FakeNotification {
    static isSupported = () => holder.notificationSupported;
    options: Record<string, unknown>;
    handlers = new Map<string, () => void>();
    shown = false;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      holder.notifications.push(this);
    }

    on(event: string, handler: () => void) {
      this.handlers.set(event, handler);
    }

    show() {
      this.shown = true;
    }
  }

  return {
    Menu: {
      buildFromTemplate: vi.fn((template) => {
        holder.menus.push(template);

        return { template };
      }),
    },
    nativeImage: {
      createFromDataURL: vi.fn(() => ({ setTemplateImage: vi.fn() })),
    },
    Notification: FakeNotification,
    Tray: FakeTray,
  };
});

const { PRACTICE_PRESENCE_SETTINGS_KEY, PracticePresenceController } =
  await import('./practicePresence');
// The shipped app is macOS-only and the menu-bar title is a darwin Tray
// feature; pin the platform so CI on Linux exercises the contract that ships.
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

beforeAll(() => {
  Object.defineProperty(process, 'platform', {
    value: 'darwin',
    configurable: true,
  });
});

afterAll(() => {
  if (platformDescriptor) {
    Object.defineProperty(process, 'platform', platformDescriptor);
  }
});

afterEach(() => {
  holder.trays.length = 0;
  holder.menus.length = 0;
  holder.notifications.length = 0;
  holder.notificationSupported = true;
});

describe('PracticePresenceController', () => {
  it('starts off and creates no native presence until the player opts in', () => {
    const controller = new PracticePresenceController({
      store: makeStore(),
      openPractice: vi.fn(),
      now: () => new Date('2026-08-12T09:00:00'),
    });

    controller.initialize();

    expect(controller.getSnapshot().state).toBe('off');
    expect(holder.trays).toHaveLength(0);

    controller.dispose();
  });

  it('shows the current local state and a sparse menu once enabled', () => {
    const openPractice = vi.fn();
    const controller = new PracticePresenceController({
      store: makeStore(),
      openPractice,
      now: () => new Date('2026-08-12T09:00:00'),
    });

    controller.saveSettings({
      menuBarEnabled: true,
      reminderEnabled: false,
    });

    expect(holder.trays).toHaveLength(1);
    expect(holder.trays[0]?.title).toBe('Drumroll · practice ready');
    expect(holder.menus.at(-1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Start practice' }),
        expect.objectContaining({
          label: 'Turn off reminders',
          enabled: false,
        }),
      ]),
    );

    controller.startPractice();

    expect(openPractice).toHaveBeenCalledOnce();
  });

  it('switches to played-today and suppresses the same day reminder after a saved run', () => {
    const controller = new PracticePresenceController({
      store: makeStore(),
      openPractice: vi.fn(),
      now: () => new Date('2026-08-12T19:00:00'),
    });

    controller.saveSettings({
      menuBarEnabled: true,
      reminderEnabled: true,
      reminderTime: '18:00',
    });
    controller.recordPractice('2026-08-12T17:45:00');
    controller.tick(new Date('2026-08-12T19:00:00'));

    expect(controller.getSnapshot().state).toBe('played-today');
    expect(holder.trays[0]?.title).toBe('Drumroll · played today');
    expect(holder.notifications).toHaveLength(0);
  });

  it('sends one gentle reminder at the chosen time and never repeats it that day', () => {
    const controller = new PracticePresenceController({
      store: makeStore(),
      openPractice: vi.fn(),
      now: () => new Date('2026-08-12T17:00:00'),
    });

    controller.saveSettings({
      menuBarEnabled: true,
      reminderEnabled: true,
      reminderTime: '18:00',
    });
    controller.tick(new Date('2026-08-12T17:59:00'));
    controller.tick(new Date('2026-08-12T18:01:00'));
    controller.tick(new Date('2026-08-12T18:30:00'));

    expect(holder.notifications).toHaveLength(1);
    expect(holder.notifications[0]).toMatchObject({
      options: {
        title: 'Drumroll',
        body: 'Your practice set is ready when you are.',
        silent: false,
      },
      shown: true,
    });
  });

  it('holds a reminder until the next selected slot after snooze', () => {
    const controller = new PracticePresenceController({
      store: makeStore(),
      openPractice: vi.fn(),
      now: () => new Date('2026-08-12T17:00:00'),
    });

    controller.saveSettings({
      menuBarEnabled: true,
      reminderEnabled: true,
      reminderTime: '18:00',
    });
    controller.snooze(new Date('2026-08-12T17:00:00'));
    controller.tick(new Date('2026-08-12T17:30:00'));

    expect(holder.notifications).toHaveLength(0);

    controller.tick(new Date('2026-08-12T18:01:00'));

    expect(holder.notifications).toHaveLength(1);
  });

  it('rejects a reminder with no player-selected time', () => {
    const controller = new PracticePresenceController({
      store: makeStore(),
      openPractice: vi.fn(),
    });

    expect(() =>
      controller.saveSettings({
        menuBarEnabled: true,
        reminderEnabled: true,
      }),
    ).toThrow('Choose a reminder time');
    expect(controller.getSnapshot().settings).toEqual({
      menuBarEnabled: false,
      reminderEnabled: false,
    });
  });

  it('persists only local settings', () => {
    const store = makeStore();
    const controller = new PracticePresenceController({
      store,
      openPractice: vi.fn(),
    });

    controller.saveSettings({
      menuBarEnabled: true,
      reminderEnabled: false,
      reminderTime: '20:15',
    });

    expect(store.get(PRACTICE_PRESENCE_SETTINGS_KEY)).toEqual({
      menuBarEnabled: true,
      reminderEnabled: false,
      reminderTime: '20:15',
    });
  });
});
