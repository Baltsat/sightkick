interface Env {
  TRANSCRIBER_URL?: string;
  TRANSCRIBER_TOKEN?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
}

const windows = new Map<string, { startedAt: number; count: number }>();
const maxJobs = 3;
const windowMs = 60 * 60 * 1000;

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

function pathParts(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? value.split('/').filter(Boolean) : [];
}

function validYoutubeUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

function rateLimit(request: Request): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const current = windows.get(ip);
  const entry =
    !current || now - current.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : current;

  if (entry.count >= maxJobs) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  windows.set(ip, entry);

  return { allowed: true, remaining: maxJobs - entry.count };
}

async function forward(
  context: PagesContext,
  upstreamPath: string,
  init?: RequestInit,
): Promise<Response> {
  const base = context.env.TRANSCRIBER_URL?.replace(/\/$/, '');
  const token = context.env.TRANSCRIBER_TOKEN;

  if (!base || !token) {
    return json(
      { error: 'The Drumroll transcriber connection is not configured.' },
      503,
    );
  }

  const headers = new Headers(init?.headers);

  headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${base}${upstreamPath}`, {
    ...init,
    headers,
  });
  const responseHeaders = new Headers();
  const contentType = response.headers.get('content-type');

  if (contentType) {
    responseHeaders.set('content-type', contentType);
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const method = context.request.method.toUpperCase();
  const parts = pathParts(context.params.path);

  if (method === 'POST' && parts.length === 0) {
    let body: { url?: unknown };

    try {
      body = (await context.request.json()) as { url?: unknown };
    } catch {
      return json({ error: 'Expected JSON body with a YouTube URL.' }, 400);
    }

    if (!validYoutubeUrl(body.url)) {
      return json({ error: 'Enter a valid HTTPS YouTube URL.' }, 400);
    }

    const limit = rateLimit(context.request);

    if (!limit.allowed) {
      return json(
        { error: 'Import limit reached: 3 jobs per hour per IP.' },
        429,
        { 'retry-after': '3600', 'x-ratelimit-remaining': '0' },
      );
    }

    const response = await forward(context, '/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: body.url }),
    });

    response.headers.set('x-ratelimit-remaining', String(limit.remaining));

    return response;
  }

  if (parts.length < 1 || !/^[0-9a-f-]{16,}$/i.test(parts[0])) {
    return json({ error: 'Unknown import route.' }, 404);
  }

  const id = encodeURIComponent(parts[0]);

  if (method === 'GET' && parts.length === 1) {
    return forward(context, `/jobs/${id}`);
  }

  if (method === 'GET' && parts[1] === 'result' && parts.length === 2) {
    return forward(context, `/jobs/${id}/result`);
  }

  if (method === 'DELETE' && parts.length === 1) {
    return forward(context, `/jobs/${id}`, { method: 'DELETE' });
  }

  return json({ error: 'Unknown import route.' }, 404);
}
