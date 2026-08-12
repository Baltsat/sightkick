import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lastReply, makeEvent } from './test-support';
import { buildCoachDigest } from '../../renderer/services/coach';
import { DEFAULT_HUGGING_FACE_MODEL } from '../../types';
import {
  configureCoachStore,
  fetchCoachingNotes,
  fetchHuggingFaceCoachingNotes,
  getCoachingNotes,
  getCoachSettings,
  runCodexCoachingNotes,
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

function makeFakeChild(): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;

  (child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (child as unknown as { kill: ReturnType<typeof vi.fn> }).kill = vi.fn();

  return child;
}

// Simulates a codex CLI invocation that succeeds: writes `note` to the
// `-o <file>` argument it was given and closes with exit code 0.
function fakeCodexSpawn(note: string): typeof spawn {
  return vi.fn((_command: string, args: readonly string[]) => {
    const outIndex = args.indexOf('-o');

    fs.writeFileSync(args[outIndex + 1], note);

    const child = makeFakeChild();

    queueMicrotask(() => child.emit('close', 0));

    return child;
  }) as unknown as typeof spawn;
}

beforeEach(() => {
  configureCoachStore(store());
});

describe('coach settings', () => {
  it('defaults to codex with no credentials configured', () => {
    const event = makeEvent();

    getCoachSettings(event as never);

    expect(lastReply(event, 'coach-settings')!.args[0]).toEqual({
      provider: 'codex',
      apiKeyConfigured: false,
      huggingFaceTokenConfigured: false,
      huggingFaceModel: DEFAULT_HUGGING_FACE_MODEL,
    });
  });

  it('stores the Anthropic key without returning it to the renderer', () => {
    const event = makeEvent();

    saveCoachSettings(event as never, {
      provider: 'anthropic',
      apiKey: ' sk-ant-secret ',
    });
    getCoachSettings(event as never);

    expect(lastReply(event, 'coach-settings-saved')!.args[0]).toEqual({
      ok: true,
      provider: 'anthropic',
      apiKeyConfigured: true,
      huggingFaceTokenConfigured: false,
      huggingFaceModel: DEFAULT_HUGGING_FACE_MODEL,
    });
    expect(lastReply(event, 'coach-settings')!.args[0]).toEqual({
      provider: 'anthropic',
      apiKeyConfigured: true,
      huggingFaceTokenConfigured: false,
      huggingFaceModel: DEFAULT_HUGGING_FACE_MODEL,
    });
    expect(JSON.stringify(event.replies)).not.toContain('sk-ant-secret');
  });

  it('removes the saved key when the field is cleared', () => {
    configureCoachStore(
      store({
        'coach.provider': 'anthropic',
        'coach.anthropicApiKey': 'sk-ant-secret',
      }),
    );

    const event = makeEvent();

    saveCoachSettings(event as never, { apiKey: '' });
    getCoachSettings(event as never);

    expect(lastReply(event, 'coach-settings')!.args[0]).toEqual({
      provider: 'anthropic',
      apiKeyConfigured: false,
      huggingFaceTokenConfigured: false,
      huggingFaceModel: DEFAULT_HUGGING_FACE_MODEL,
    });
  });

  it('stores the Hugging Face token and model without leaking the token', () => {
    const event = makeEvent();

    saveCoachSettings(event as never, {
      provider: 'huggingface',
      huggingFaceToken: ' hf_secret ',
      huggingFaceModel: 'Qwen/Qwen2.5-7B-Instruct',
    });

    expect(lastReply(event, 'coach-settings-saved')!.args[0]).toEqual({
      ok: true,
      provider: 'huggingface',
      apiKeyConfigured: false,
      huggingFaceTokenConfigured: true,
      huggingFaceModel: 'Qwen/Qwen2.5-7B-Instruct',
    });
    expect(JSON.stringify(event.replies)).not.toContain('hf_secret');
  });

  it('switches provider independently of saved credentials', () => {
    configureCoachStore(store({ 'coach.anthropicApiKey': 'sk-ant-secret' }));

    const event = makeEvent();

    saveCoachSettings(event as never, { provider: 'codex' });

    expect(lastReply(event, 'coach-settings-saved')!.args[0]).toMatchObject({
      provider: 'codex',
      apiKeyConfigured: true,
    });
  });
});

describe('Claude coaching notes (anthropic)', () => {
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
    configureCoachStore(store({ 'coach.provider': 'anthropic' }));

    const event = makeEvent();

    await getCoachingNotes(event as never, digestInput);

    expect(lastReply(event, 'coaching-notes')!.args[0]).toEqual({
      apiKeyMissing: true,
      error: 'Add an Anthropic API key in settings to enable coaching notes.',
    });
  });
});

describe('Hugging Face coaching notes', () => {
  it('sends an OpenAI-compatible chat completion payload', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://router.huggingface.co/v1/chat/completions');

      const headers = init?.headers as Record<string, string>;

      expect(headers.authorization).toBe('Bearer hf_secret');

      const body = JSON.parse(String(init?.body));

      expect(body).toMatchObject({
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('drum practice coach'),
          },
          { role: 'user', content: expect.stringContaining('trouble-bars') },
        ],
      });

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Loop bar 3 at 0.7x.' } }],
        }),
        { status: 200 },
      );
    });

    await expect(
      fetchHuggingFaceCoachingNotes(
        'hf_secret',
        'meta-llama/Llama-3.3-70B-Instruct',
        buildCoachDigest(digestInput),
        fetchImpl as never,
      ),
    ).resolves.toBe('Loop bar 3 at 0.7x.');
  });

  it('reports an honest message when the token is rejected (401)', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('Unauthorized', { status: 401 }),
    );

    await expect(
      fetchHuggingFaceCoachingNotes(
        'bad-token',
        'some-model',
        buildCoachDigest(digestInput),
        fetchImpl as never,
      ),
    ).rejects.toThrow('Hugging Face rejected the saved token.');
  });

  it('reports a paywalled-model message (402)', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'payment required' }), {
          status: 402,
        }),
    );

    await expect(
      fetchHuggingFaceCoachingNotes(
        'token',
        'expensive-model',
        buildCoachDigest(digestInput),
        fetchImpl as never,
      ),
    ).rejects.toThrow(
      '"expensive-model" requires payment on Hugging Face. Pick a free model.',
    );
  });
});

describe('Codex-local coaching notes', () => {
  it('spawns codex read-only from a scratch directory and captures the note', async () => {
    let capturedArgs: string[] = [];
    let capturedOptions: SpawnOptions | undefined;
    const spawnImpl = vi.fn(
      (command: string, args: string[], options: SpawnOptions) => {
        capturedArgs = args;
        capturedOptions = options;

        const outIndex = args.indexOf('-o');

        fs.writeFileSync(args[outIndex + 1], 'Loop bar 3 at 0.7x.\n');

        const child = makeFakeChild();

        queueMicrotask(() => child.emit('close', 0));

        return child;
      },
    ) as unknown as typeof spawn;
    const notes = await runCodexCoachingNotes(buildCoachDigest(digestInput), {
      spawnImpl,
      findBinary: () => '/usr/local/bin/codex',
      tmpDir: () => '/tmp',
    });

    expect(notes).toBe('Loop bar 3 at 0.7x.');
    expect(capturedArgs).toEqual([
      'exec',
      '--skip-git-repo-check',
      '-s',
      'read-only',
      '--ephemeral',
      '-o',
      expect.stringContaining('sightkick-coach-'),
      expect.stringContaining('trouble-bars'),
    ]);
    expect(capturedOptions?.cwd).toBe('/tmp');
    // Never pinning -m means we ride whatever model the CLI defaults to.
    expect(capturedArgs).not.toContain('-m');
  });

  it('reports a clear message when the Codex CLI cannot be found', async () => {
    await expect(
      runCodexCoachingNotes(buildCoachDigest(digestInput), {
        findBinary: () => undefined,
      }),
    ).rejects.toThrow('Codex CLI not found. Install it and run `codex login`.');
  });

  it('times out a hung codex process and kills it', async () => {
    const killMock = vi.fn();
    const spawnImpl = vi.fn(() => {
      const child = makeFakeChild();

      (child as unknown as { kill: typeof killMock }).kill = killMock;

      // Never emits 'close' — simulates a hung process.
      return child;
    }) as unknown as typeof spawn;

    await expect(
      runCodexCoachingNotes(buildCoachDigest(digestInput), {
        spawnImpl,
        findBinary: () => '/usr/local/bin/codex',
        timeoutMs: 20,
      }),
    ).rejects.toThrow('Codex timed out. Try again.');
    expect(killMock).toHaveBeenCalledWith('SIGTERM');
  });

  it('reports empty output as an honest error', async () => {
    const spawnImpl = vi.fn(() => {
      const child = makeFakeChild();

      queueMicrotask(() => child.emit('close', 0));

      return child;
    }) as unknown as typeof spawn;

    await expect(
      runCodexCoachingNotes(buildCoachDigest(digestInput), {
        spawnImpl,
        findBinary: () => '/usr/local/bin/codex',
        tmpDir: () => '/tmp',
      }),
    ).rejects.toThrow('Codex returned no coaching notes.');
  });

  it('surfaces a non-zero exit as an honest error', async () => {
    const spawnImpl = vi.fn(() => {
      const child = makeFakeChild();

      queueMicrotask(() => {
        (child.stderr as EventEmitter).emit(
          'data',
          Buffer.from('not logged in'),
        );
        child.emit('close', 1);
      });

      return child;
    }) as unknown as typeof spawn;

    await expect(
      runCodexCoachingNotes(buildCoachDigest(digestInput), {
        spawnImpl,
        findBinary: () => '/usr/local/bin/codex',
        tmpDir: () => '/tmp',
      }),
    ).rejects.toThrow('Codex exited with an error: not logged in');
  });
});

describe('provider dispatch', () => {
  it('defaults to codex when no provider is configured', async () => {
    const event = makeEvent();

    await getCoachingNotes(event as never, digestInput, {
      codex: {
        findBinary: () => '/usr/bin/codex',
        spawnImpl: fakeCodexSpawn('Loop bar 3 at 0.7x.'),
      },
    });

    expect(lastReply(event, 'coaching-notes')!.args[0]).toEqual({
      notes: 'Loop bar 3 at 0.7x.',
    });
  });

  it('reports a codex-unavailable message without a key prompt', async () => {
    const event = makeEvent();

    await getCoachingNotes(event as never, digestInput, {
      codex: { findBinary: () => undefined },
    });

    expect(lastReply(event, 'coaching-notes')!.args[0]).toEqual({
      error: 'Codex CLI not found. Install it and run `codex login`.',
    });
  });

  it('dispatches to Hugging Face and reports a missing-token message', async () => {
    configureCoachStore(store({ 'coach.provider': 'huggingface' }));

    const event = makeEvent();

    await getCoachingNotes(event as never, digestInput);

    expect(lastReply(event, 'coaching-notes')!.args[0]).toEqual({
      apiKeyMissing: true,
      error: 'Add a Hugging Face token in settings to enable coaching notes.',
    });
  });

  it('dispatches to Hugging Face with the configured token and model', async () => {
    configureCoachStore(
      store({
        'coach.provider': 'huggingface',
        'coach.huggingFaceToken': 'hf_secret',
        'coach.huggingFaceModel': 'Qwen/Qwen2.5-7B-Instruct',
      }),
    );

    const event = makeEvent();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));

      expect(body.model).toBe('Qwen/Qwen2.5-7B-Instruct');

      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Note.' } }] }),
        { status: 200 },
      );
    });

    await getCoachingNotes(event as never, digestInput, {
      fetchImpl: fetchImpl as never,
    });

    expect(lastReply(event, 'coaching-notes')!.args[0]).toEqual({
      notes: 'Note.',
    });
  });

  it('dispatches to Anthropic when selected', async () => {
    configureCoachStore(
      store({
        'coach.provider': 'anthropic',
        'coach.anthropicApiKey': 'sk-ant-secret',
      }),
    );

    const event = makeEvent();
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: 'Note.' }] }),
          { status: 200 },
        ),
    );

    await getCoachingNotes(event as never, digestInput, {
      fetchImpl: fetchImpl as never,
    });

    expect(lastReply(event, 'coaching-notes')!.args[0]).toEqual({
      notes: 'Note.',
    });
  });
});
