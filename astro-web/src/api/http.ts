import { API_URL } from './env';

/** The API's error shape: {"error": {"code", "message", "fields"?}}. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export const UNAUTHENTICATED_EVENT = 'astro:unauthenticated';

interface Options extends Omit<RequestInit, 'body'> {
  json?: unknown;
  /** Tell the app the session ended when the API answers 401 (default true). */
  signalSignedOut?: boolean;
}

/** One wrapper for every API call (roadmap §12.1): cookies, JSON, one error type. */
export async function api<T>(path: string, { json, signalSignedOut = true, headers, ...init }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', "Can't reach Astro right now. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const body = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => null) : null;
  if (res.ok) return body as T;

  if (res.status === 401 && signalSignedOut) window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
  const err = body?.error;
  const retry = Number(res.headers.get('retry-after')) || undefined;
  throw new ApiError(
    res.status,
    err?.code ?? 'error',
    err?.message ?? (res.status >= 500 ? 'Astro hit a problem. Try again in a moment.' : `Request failed (${res.status}).`),
    err?.fields ?? {},
    retry,
  );
}
