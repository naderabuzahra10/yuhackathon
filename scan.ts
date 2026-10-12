import { useSyncExternalStore } from 'react';
import { readVoucherCode } from '../../shared/rewards.mjs';
import { api } from './api';

/* One scanner for the whole app, opened from the top bar or any page. Whatever it reads is
   sorted here: an event poster checks the student in, a voucher goes to the cashier desk, and a
   link back into the app opens that page. Anything else is refused; a QR code never takes the
   app to another site. */

let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

export function openScanner() {
  open = true;
  emit();
}

export function closeScanner() {
  open = false;
  emit();
}

export function useScannerOpen() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => open,
  );
}

export type Scan =
  | { kind: 'checkin'; eventId: string; code: string }
  | { kind: 'voucher'; code: string }
  /** A check-in code on its own, typed or read without its event. */
  | { kind: 'code'; code: string }
  | { kind: 'page'; path: string }
  | { kind: 'unknown' };

export function readScan(raw: string, origin = window.location.origin): Scan {
  const text = raw.trim();
  const scheme = /^uj:checkin:([^:]+):([A-Za-z0-9]+)$/.exec(text);
  if (scheme) return { kind: 'checkin', eventId: scheme[1], code: scheme[2].toUpperCase() };

  if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
    let url: URL;
    try {
      url = new URL(text, origin);
    } catch {
      return { kind: 'unknown' };
    }
    // A poster or voucher shown from another address of the same app (a laptop on the network)
    // still counts: only the event and the code are taken from it.
    const event = /^\/campus\/events\/([^/]+)\/?$/.exec(url.pathname);
    const code = url.searchParams.get('checkin');
    if (event && code && /^[A-Za-z0-9]+$/.test(code)) return { kind: 'checkin', eventId: decodeURIComponent(event[1]), code: code.toUpperCase() };
    const voucher = url.pathname === '/cashier' ? readVoucherCode(text) : null;
    if (voucher) return { kind: 'voucher', code: voucher };
    return url.origin === origin ? { kind: 'page', path: url.pathname + url.search } : { kind: 'unknown' };
  }

  const voucher = readVoucherCode(text);
  if (voucher) return { kind: 'voucher', code: voucher };
  if (/^[A-Za-z0-9]{4,10}$/.test(text)) return { kind: 'code', code: text.toUpperCase() };
  return { kind: 'unknown' };
}

interface EventRow {
  id: string;
  start_at: string;
  is_past: boolean;
}

interface EventDetail {
  id: string;
  checkin?: { open: boolean; checked_in: unknown } | null;
}

/** The events whose doors are open now and that the student has not checked in to. */
export async function openCheckins(): Promise<string[]> {
  const events = await api<EventRow[]>('/campus/events');
  const byStart = (a: EventRow, b: EventRow) => a.start_at.localeCompare(b.start_at);
  // Check-in opens around the event itself, so only what is on now or next can be open.
  const near = [...events.filter((e) => e.is_past).sort(byStart).slice(-2), ...events.filter((e) => !e.is_past).sort(byStart).slice(0, 6)];
  const details = await Promise.all(near.map((e) => api<EventDetail>(`/campus/events/${e.id}`).catch(() => null)));
  return details.filter((d): d is EventDetail => !!d?.checkin?.open && !d.checkin.checked_in).map((d) => d.id);
}
