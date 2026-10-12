import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function queryString(query?: Query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`/api${path}${queryString(opts.query)}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
    signal: opts.signal,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, 'bad_response', `Server returned ${res.status}`);
  }
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
  return json.data as T;
}

export async function upload<T = any>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('file', file);
  const res = await fetch(`/api${path}`, { method: 'POST', body: form, credentials: 'include' });
  const json = await res.json();
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
  return json.data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.details;
    if (Array.isArray(d) && d.length && typeof d[0] === 'object' && d[0] && 'message' in d[0]) {
      return `${e.message}: ${d.map((x: any) => `${x.path ? `${x.path} ` : ''}${x.message}`).join('; ')}`;
    }
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/* ── Refresh bus: a mutation anywhere tells every mounted query to refetch. ── */

const listeners = new Map<string, Set<() => void>>();

export const bus = {
  on(event: string, fn: () => void) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(fn);
    return () => {
      listeners.get(event)?.delete(fn);
    };
  },
  emit(event: string) {
    listeners.get(event)?.forEach((fn) => fn());
  },
};

export function refreshAll() {
  cache.clear();
  bus.emit('refresh');
}

/* ── Queries: stale-while-revalidate so going back never shows a blank page. ── */

const cache = new Map<string, unknown>();

export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  set: (next: T | ((prev: T | undefined) => T | undefined)) => void;
}

export function useApi<T = any>(path: string | null, query?: Query): QueryState<T> {
  const key = path ? `${path}${queryString(query)}` : null;
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!!key && !cache.has(key));
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const next = await api<T>(key);
      cache.set(key, next);
      if (keyRef.current === key) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (keyRef.current === key) setError(e);
    } finally {
      if (keyRef.current === key) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!key) {
      setData(undefined);
      setLoading(false);
      return;
    }
    const cached = cache.get(key) as T | undefined;
    setData(cached);
    setError(null);
    setLoading(cached === undefined);
    void load();
    return bus.on('refresh', () => void load());
  }, [key, load]);

  const set = useCallback(
    (next: T | ((prev: T | undefined) => T | undefined)) => {
      setData((prev) => {
        const value = typeof next === 'function' ? (next as (p: T | undefined) => T | undefined)(prev) : next;
        if (key && value !== undefined) cache.set(key, value);
        return value;
      });
    },
    [key],
  );

  return { data, error, loading, reload: load, set };
}
