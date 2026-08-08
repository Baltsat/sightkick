import { describe, expect, it, vi } from 'vitest';
import { FakeStore, lastReply, makeEvent, makeStore } from './test-support';

const storeHolder = vi.hoisted(() => ({
  current: undefined as FakeStore | undefined,
}));

vi.mock('../AppState', () => ({
  appState: {
    store: {
      get: (key: string) => storeHolder.current!.get(key),
      set: (key: string, value: unknown) =>
        storeHolder.current!.set(key, value),
    },
  },
}));

const { deleteGoal, loadGoalsIpc, MAX_STORED_GOALS, saveGoal, setPrimaryGoal } =
  await import('./goals');

describe('saveGoal', () => {
  it('creates a new goal, defaulting the very first goal ever to primary', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    saveGoal(event as never, { songId: 'song-1', difficulty: 'expert' });

    const reply = lastReply(event, 'save-goal')!.args[0] as {
      goals: { id: string; songId: string; isPrimary: boolean }[];
    };

    expect(reply.goals).toHaveLength(1);
    expect(reply.goals[0]).toMatchObject({
      songId: 'song-1',
      difficulty: 'expert',
      isPrimary: true,
    });
    expect(reply.goals[0].id).toBeTruthy();
  });

  it('does not default a second goal to primary', () => {
    storeHolder.current = makeStore({
      goals: [
        {
          id: 'g1',
          songId: 'song-1',
          difficulty: 'expert',
          createdAt: '2026-01-01T00:00:00.000Z',
          isPrimary: true,
        },
      ],
    });

    const event = makeEvent();

    saveGoal(event as never, { songId: 'song-2', difficulty: 'hard' });

    const reply = lastReply(event, 'save-goal')!.args[0] as {
      goals: { id: string; songId: string; isPrimary: boolean }[];
    };

    expect(reply.goals).toHaveLength(2);
    expect(reply.goals.find((g) => g.id === 'g1')!.isPrimary).toBe(true);
    expect(reply.goals.find((g) => g.songId === 'song-2')!.isPrimary).toBe(
      false,
    );
  });

  it('setting isPrimary:true on a new goal demotes every other goal', () => {
    storeHolder.current = makeStore({
      goals: [
        {
          id: 'g1',
          songId: 'song-1',
          difficulty: 'expert',
          createdAt: '2026-01-01T00:00:00.000Z',
          isPrimary: true,
        },
      ],
    });

    const event = makeEvent();

    saveGoal(event as never, {
      songId: 'song-2',
      difficulty: 'hard',
      isPrimary: true,
    });

    const reply = lastReply(event, 'save-goal')!.args[0] as {
      goals: { id: string; songId: string; isPrimary: boolean }[];
    };
    const primaryGoals = reply.goals.filter((g) => g.isPrimary);

    expect(primaryGoals).toHaveLength(1);
    expect(primaryGoals[0].songId).toBe('song-2');
  });

  it('updates an existing goal in place by id, preserving its createdAt/isPrimary', () => {
    storeHolder.current = makeStore({
      goals: [
        {
          id: 'g1',
          songId: 'song-1',
          difficulty: 'expert',
          createdAt: '2026-01-01T00:00:00.000Z',
          isPrimary: true,
        },
      ],
    });

    const event = makeEvent();

    saveGoal(event as never, {
      id: 'g1',
      songId: 'song-1',
      difficulty: 'expert',
      targetDate: '2026-12-25',
    });

    const reply = lastReply(event, 'save-goal')!.args[0] as {
      goals: {
        id: string;
        targetDate?: string;
        createdAt: string;
        isPrimary: boolean;
      }[];
    };

    expect(reply.goals).toHaveLength(1);
    expect(reply.goals[0]).toMatchObject({
      id: 'g1',
      targetDate: '2026-12-25',
      createdAt: '2026-01-01T00:00:00.000Z',
      isPrimary: true,
    });
  });

  it('replies with an error when songId is missing', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    saveGoal(event as never, { songId: '', difficulty: 'expert' });

    expect(lastReply(event, 'save-goal')!.args[0]).toEqual({
      error: 'songId is required',
    });
  });

  it('caps stored goals at MAX_STORED_GOALS', () => {
    const existing = Array.from({ length: MAX_STORED_GOALS }, (_, i) => ({
      id: `g${i}`,
      songId: `song-${i}`,
      difficulty: 'expert' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      isPrimary: false,
    }));

    storeHolder.current = makeStore({ goals: existing });

    const event = makeEvent();

    saveGoal(event as never, { songId: 'song-new', difficulty: 'expert' });

    const reply = lastReply(event, 'save-goal')!.args[0] as {
      goals: unknown[];
    };

    expect(reply.goals.length).toBeLessThanOrEqual(MAX_STORED_GOALS);
  });
});

describe('loadGoalsIpc', () => {
  it('replies with [] when nothing is stored yet', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    loadGoalsIpc(event as never);

    expect(lastReply(event, 'load-goals')!.args[0]).toEqual({ goals: [] });
  });

  it('replies with the stored goals', () => {
    const goals = [
      {
        id: 'g1',
        songId: 'song-1',
        difficulty: 'expert' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        isPrimary: true,
      },
    ];

    storeHolder.current = makeStore({ goals });

    const event = makeEvent();

    loadGoalsIpc(event as never);

    expect(lastReply(event, 'load-goals')!.args[0]).toEqual({ goals });
  });
});

describe('deleteGoal', () => {
  it('removes the matching goal and replies with the rest', () => {
    storeHolder.current = makeStore({
      goals: [
        {
          id: 'g1',
          songId: 'song-1',
          difficulty: 'expert',
          createdAt: '2026-01-01T00:00:00.000Z',
          isPrimary: true,
        },
        {
          id: 'g2',
          songId: 'song-2',
          difficulty: 'hard',
          createdAt: '2026-01-02T00:00:00.000Z',
          isPrimary: false,
        },
      ],
    });

    const event = makeEvent();

    deleteGoal(event as never, 'g1');

    const reply = lastReply(event, 'delete-goal')!.args[0] as {
      goals: { id: string }[];
    };

    expect(reply.goals.map((g) => g.id)).toEqual(['g2']);
  });

  it('replies with an error when id is missing', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    deleteGoal(event as never, '');

    expect(lastReply(event, 'delete-goal')!.args[0]).toEqual({
      error: 'id is required',
    });
  });
});

describe('setPrimaryGoal', () => {
  it('marks the target goal primary and demotes the rest', () => {
    storeHolder.current = makeStore({
      goals: [
        {
          id: 'g1',
          songId: 'song-1',
          difficulty: 'expert',
          createdAt: '2026-01-01T00:00:00.000Z',
          isPrimary: true,
        },
        {
          id: 'g2',
          songId: 'song-2',
          difficulty: 'hard',
          createdAt: '2026-01-02T00:00:00.000Z',
          isPrimary: false,
        },
      ],
    });

    const event = makeEvent();

    setPrimaryGoal(event as never, 'g2');

    const reply = lastReply(event, 'set-primary-goal')!.args[0] as {
      goals: { id: string; isPrimary: boolean }[];
    };

    expect(reply.goals.find((g) => g.id === 'g1')!.isPrimary).toBe(false);
    expect(reply.goals.find((g) => g.id === 'g2')!.isPrimary).toBe(true);
  });

  it('errors on an unknown id rather than silently no-op-ing', () => {
    storeHolder.current = makeStore({ goals: [] });

    const event = makeEvent();

    setPrimaryGoal(event as never, 'does-not-exist');

    expect(lastReply(event, 'set-primary-goal')!.args[0]).toEqual({
      error: 'no stored goal with id does-not-exist',
    });
  });
});

describe('round trip', () => {
  it('save then load returns the same goal', () => {
    storeHolder.current = makeStore({});

    const saveEvent = makeEvent();

    saveGoal(saveEvent as never, {
      songId: 'song-1',
      difficulty: 'expert',
      targetDate: '2026-12-25',
    });

    const loadEvent = makeEvent();

    loadGoalsIpc(loadEvent as never);

    expect(lastReply(loadEvent, 'load-goals')!.args[0]).toEqual(
      lastReply(saveEvent, 'save-goal')!.args[0],
    );
  });
});
