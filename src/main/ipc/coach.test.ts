import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lastReply, makeEvent } from './test-support';
import { buildCoachDigest } from '../../renderer/services/coach';
import {
  configureCoachStore,
  fetchCoachingNotes,
  getCoachingNotes,
  getCoachSettings,
  saveCoachSettings,
} from './coach';

function store(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => values.set(key, value),
    delete: (key: string) => values.delete(key),
  };
}

const digestInput = {
  song: { name: 'Song', artist: 'Artist', difficulty: 'expert' },
  findings: [
    {
      id: 'trouble-3-3',
      kind: 'trouble-bars' as const,
      severity: 'high' as const,
      title: 'Bar 3 needs a loop',
      summary: '50% accuracy',
      skillTag: 'fills' as const,
      evidence: { barStart: 3, barEnd: 3, sampleCount: 8 },
    },
  ],
};

beforeEach(() => {
  configureCoachStore(store());
});

describe('coach settings', () => {
  it('stores the key without returning it to the renderer', () => {
    const event = makeEvent();

    saveCoachSettings(event as never, { apiKey: ' sk-ant-secret ' });
    getCoachSettings(event as never);

    expect(lastReply(event, 'coach-settings-saved')!.args[0]).toEqual({
      ok: true,
      apiKeyConfigured: true,
    });
    expect(lastReply(event, 'coach-settings')!.args[0]).toEqual({
      apiKeyConfigured: true,
    });
    expect(JSON.stringify(event.replies)).not.toContain('sk-ant-secret');
  });

  it('removes the saved key when the field is cleared', () => {
    configureCoachStore(store({ 'coach.anthropicApiKey': 'sk-ant-secret' }));

    const event = makeEvent();

    saveCoachSettings(event as never, { apiKey: '' });
    getCoachSettings(event as never);

    expect(lastReply(event, 'coach-settings')!.args[0]).toEqual({
      apiKeyConfigured: false,
    });
  });
});

describe('Claude coaching notes', () => {
  it('round-trips a compact digest through the Messages API', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));

      expect(body).toMatchObject({
        model: 'claude-sonnet-5',
        max_tokens: 220,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('trouble-bars'),
          },
        ],
      });

      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Loop bar 3 at 0.7x.' }],
        }),
        { status: 200 },
      );
    });

    await expect(
      fetchCoachingNotes(
        'sk-ant-secret',
        buildCoachDigest(digestInput),
        fetchImpl as never,
      ),
    ).resolves.toBe('Loop bar 3 at 0.7x.');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('explains how to enable notes when no key is saved', async () => {
    const event = makeEvent();

    await getCoachingNotes(event as never, digestInput);

    expect(lastReply(event, 'coaching-notes')!.args[0]).toEqual({
      apiKeyMissing: true,
      error: 'Add an Anthropic API key in settings to enable coaching notes.',
    });
  });
});
