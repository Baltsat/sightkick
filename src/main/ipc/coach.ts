import { IpcMainEvent } from 'electron';
import {
  IpcCoachSettings,
  IpcCoachSettingsSaved,
  IpcCoachingNotesResponse,
  IpcSaveCoachSettingsRequest,
} from '../../types';
import {
  buildCoachDigest,
  CoachDigestInput,
} from '../../renderer/services/coach';

const API_KEY_STORE_KEY = 'coach.anthropicApiKey';
const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

interface CoachSettingsStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  delete: (key: string) => void;
}

interface ClaudeMessageResponse {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

let settingsStore: CoachSettingsStore | undefined;

export function configureCoachStore(store: CoachSettingsStore): void {
  settingsStore = store;
}

function requireStore(): CoachSettingsStore {
  if (!settingsStore) {
    throw new Error('Coach settings are unavailable');
  }

  return settingsStore;
}

function configuredApiKey(): string | undefined {
  const value = requireStore().get(API_KEY_STORE_KEY);

  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  return value.trim();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'Claude timed out. Try again.';
  }

  return error instanceof Error ? error.message : String(error);
}

export function getCoachSettings(event: IpcMainEvent): void {
  event.reply('coach-settings', {
    apiKeyConfigured: configuredApiKey() !== undefined,
  } satisfies IpcCoachSettings);
}

export function saveCoachSettings(
  event: IpcMainEvent,
  request: IpcSaveCoachSettingsRequest,
): void {
  const store = requireStore();
  const apiKey = request?.apiKey?.trim() ?? '';

  if (apiKey) {
    store.set(API_KEY_STORE_KEY, apiKey);
  } else {
    store.delete(API_KEY_STORE_KEY);
  }

  event.reply('coach-settings-saved', {
    ok: true,
    apiKeyConfigured: apiKey !== '',
  } satisfies IpcCoachSettingsSaved);
}

export async function fetchCoachingNotes(
  apiKey: string,
  digest: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 220,
      system:
        'You are a concise drum practice coach. Use only the supplied evidence. Give two short actionable sentences and no preamble.',
      messages: [{ role: 'user', content: digest }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as ClaudeMessageResponse;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Anthropic rejected the saved API key.');
    }

    throw new Error(
      data.error?.message ?? `Claude request failed (${response.status}).`,
    );
  }

  const notes = data.content
    ?.filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!notes) {
    throw new Error('Claude returned no coaching notes.');
  }

  return notes;
}

export async function getCoachingNotes(
  event: IpcMainEvent,
  input: CoachDigestInput,
): Promise<void> {
  try {
    const apiKey = configuredApiKey();

    if (!apiKey) {
      event.reply('coaching-notes', {
        apiKeyMissing: true,
        error: 'Add an Anthropic API key in settings to enable coaching notes.',
      } satisfies IpcCoachingNotesResponse);

      return;
    }

    const notes = await fetchCoachingNotes(apiKey, buildCoachDigest(input));

    event.reply('coaching-notes', {
      notes,
    } satisfies IpcCoachingNotesResponse);
  } catch (error) {
    event.reply('coaching-notes', {
      error: errorMessage(error),
    } satisfies IpcCoachingNotesResponse);
  }
}
