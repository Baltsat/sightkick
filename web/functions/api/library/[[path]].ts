interface KvNamespace {
  get: (key: string, type: 'text') => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  list: (options: {
    prefix: string;
    cursor?: string;
    limit: number;
  }) => Promise<{
    keys: { name: string }[];
    cursor?: string;
    list_complete: boolean;
  }>;
}

interface Env {
  DRUMROLL_LIBRARY?: KvNamespace;
  LIBRARY_MIRROR_TOKEN?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
}

const MAX_ENTRY_BYTES = 24 * 1024 * 1024;
const entryIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function pathParts(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? value.split('/').filter(Boolean) : [];
}

function authorized(request: Request, token: string | undefined): boolean {
  return (
    Boolean(token) && request.headers.get('authorization') === `Bearer ${token}`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validEntry(id: string, value: unknown): boolean {
  if (!isRecord(value) || value.version !== 1 || value.id !== id) {
    return false;
  }

  const song = value.song;
  const chart = value.chart;
  const audio = value.audio;

  if (
    !isRecord(song) ||
    song.id !== id ||
    Object.hasOwn(song, 'audio') ||
    !isRecord(chart) ||
    !['notes.mid', 'notes.chart'].includes(String(chart.file)) ||
    typeof chart.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(chart.sha256) ||
    typeof chart.base64 !== 'string' ||
    !isRecord(audio) ||
    audio.state !== 'local-only' ||
    !Array.isArray(audio.names) ||
    !audio.names.every((name) => typeof name === 'string')
  ) {
    return false;
  }

  try {
    return atob(chart.base64).length > 0;
  } catch {
    return false;
  }
}

function entryKey(id: string): string {
  return `song:${id}`;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  if (!env.DRUMROLL_LIBRARY || !env.LIBRARY_MIRROR_TOKEN) {
    return json(
      { error: 'The Drumroll library mirror is not configured.' },
      503,
    );
  }

  if (!authorized(request, env.LIBRARY_MIRROR_TOKEN)) {
    return json({ error: 'Library mirror authorization is required.' }, 401);
  }

  const parts = pathParts(context.params.path);

  if (parts.length === 0 && request.method === 'GET') {
    const cursor = new URL(request.url).searchParams.get('cursor') || undefined;
    const result = await env.DRUMROLL_LIBRARY.list({
      prefix: 'song:',
      ...(cursor ? { cursor } : {}),
      limit: 100,
    });

    return json({
      ids: result.keys.map(({ name }) => name.slice('song:'.length)),
      ...(result.list_complete ? {} : { cursor: result.cursor }),
    });
  }

  if (parts.length !== 1 || !entryIdPattern.test(parts[0])) {
    return json({ error: 'Unknown library mirror route.' }, 404);
  }

  const id = parts[0];
  const key = entryKey(id);

  if (request.method === 'GET') {
    const entry = await env.DRUMROLL_LIBRARY.get(key, 'text');

    if (!entry) {
      return json({ error: 'Library entry not found.' }, 404);
    }

    return new Response(entry, {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  }

  if (request.method !== 'PUT') {
    return json({ error: 'Use GET or PUT for library mirror entries.' }, 405);
  }

  const body = await request.text();

  if (new TextEncoder().encode(body).byteLength > MAX_ENTRY_BYTES) {
    return json({ error: 'Library chart exceeds the mirror size limit.' }, 413);
  }

  let entry: unknown;

  try {
    entry = JSON.parse(body);
  } catch {
    return json({ error: 'Expected a valid library mirror JSON entry.' }, 400);
  }

  if (!validEntry(id, entry)) {
    return json(
      { error: 'Entry must contain chart metadata and local-only audio.' },
      400,
    );
  }

  await env.DRUMROLL_LIBRARY.put(key, body);

  return json({ id, stored: true });
}
