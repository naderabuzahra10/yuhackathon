/* Calls to this app's own server (/rewards, /insights, /agent), as opposed to the UniJourney API under /api.
   On plain static hosting these paths answer with the app's HTML; that is reported as "missing",
   so a page can say the server is needed instead of failing oddly. */

export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** True when there is no server behind this path at all. */
    public missing = false,
  ) {
    super(message);
  }
}

export async function service<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      credentials: 'include',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ServiceError(0, 'network', 'The server cannot be reached', true);
  }
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new ServiceError(res.status, 'missing', 'This needs the app’s own server', true);
  const json = await res.json();
  if (!res.ok) throw new ServiceError(res.status, json?.error?.code ?? 'failed', json?.error?.message ?? 'Request failed');
  return json as T;
}
