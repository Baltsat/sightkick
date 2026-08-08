import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { Goal, useGoals } from './useGoals';

let ipc: IpcMock;

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    songId: 'song-1',
    difficulty: 'expert',
    createdAt: '2026-01-01T00:00:00.000Z',
    isPrimary: true,
    ...overrides,
  };
}

beforeEach(() => {
  ipc = installIpcMock();
});

describe('useGoals', () => {
  it('loads goals on mount', async () => {
    const { result } = renderHook(() => useGoals());

    expect(result.current.isLoaded).toBe(false);
    expect(ipc.sent).toContainEqual({ channel: 'load-goals', args: [] });

    await act(async () => {
      ipc.emit('load-goals', { goals: [goal()] });
    });

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.goals).toEqual([goal()]);
    expect(result.current.primaryGoal).toEqual(goal());
  });

  it('exposes undefined primaryGoal when no goal is primary', async () => {
    const { result } = renderHook(() => useGoals());

    await act(async () => {
      ipc.emit('load-goals', { goals: [goal({ isPrimary: false })] });
    });

    expect(result.current.primaryGoal).toBeUndefined();
  });

  it('saveGoal sends the input and updates state from the reply', async () => {
    const { result } = renderHook(() => useGoals());

    await act(async () => {
      ipc.emit('load-goals', { goals: [] });
    });

    let savedGoals: Goal[] | undefined;

    act(() => {
      result.current.saveGoal(
        { songId: 'song-2', difficulty: 'hard' },
        (goals) => {
          savedGoals = goals;
        },
      );
    });

    expect(ipc.sent).toContainEqual({
      channel: 'save-goal',
      args: [{ songId: 'song-2', difficulty: 'hard' }],
    });

    const newGoal = goal({ id: 'g2', songId: 'song-2', difficulty: 'hard' });

    await act(async () => {
      ipc.emit('save-goal', { goals: [newGoal] });
    });

    expect(result.current.goals).toEqual([newGoal]);
    expect(savedGoals).toEqual([newGoal]);
  });

  it('deleteGoal sends the id and updates state from the reply', async () => {
    const { result } = renderHook(() => useGoals());

    await act(async () => {
      ipc.emit('load-goals', { goals: [goal()] });
    });

    act(() => {
      result.current.deleteGoal('g1');
    });

    expect(ipc.sent).toContainEqual({ channel: 'delete-goal', args: ['g1'] });

    await act(async () => {
      ipc.emit('delete-goal', { goals: [] });
    });

    expect(result.current.goals).toEqual([]);
  });

  it('setPrimaryGoal sends the id and updates state from the reply', async () => {
    const { result } = renderHook(() => useGoals());

    await act(async () => {
      ipc.emit('load-goals', {
        goals: [goal({ id: 'g1' }), goal({ id: 'g2', isPrimary: false })],
      });
    });

    act(() => {
      result.current.setPrimaryGoal('g2');
    });

    expect(ipc.sent).toContainEqual({
      channel: 'set-primary-goal',
      args: ['g2'],
    });

    const updated = [
      goal({ id: 'g1', isPrimary: false }),
      goal({ id: 'g2', isPrimary: true }),
    ];

    await act(async () => {
      ipc.emit('set-primary-goal', { goals: updated });
    });

    expect(result.current.primaryGoal).toEqual(updated[1]);
  });
});
