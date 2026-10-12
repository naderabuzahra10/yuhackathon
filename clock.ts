import { useApi } from './api';
import type { Locale } from './i18n';

/** The Riyadh calendar day (`YYYY-MM-DD`) of an instant. */
export function riyadhDay(value: string | Date) {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sunday of the week containing `day`; the teaching week starts on Sunday. */
export function weekStart(day: string) {
  return addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay());
}

export function weekdayOf(day: string) {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export function weekdayName(weekday: number, locale: Locale, width: 'long' | 'short' = 'short') {
  // 2026-09-27 is a Sunday.
  const d = new Date(Date.UTC(2026, 8, 27 + weekday, 12));
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { weekday: width, timeZone: 'UTC' }).format(d);
}

/** "Now" follows the demo clock when the backend runs in demo mode. */
export function useClock() {
  const q = useApi<{ clock: string; demoMode: boolean }>('/demo/status');
  const now = q.data ? new Date(q.data.clock) : new Date();
  return { now, today: riyadhDay(now), ready: !!q.data };
}

export function fmtDuration(minutes: number, locale: Locale) {
  const tag = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const parts: string[] = [];
  if (h) parts.push(new Intl.NumberFormat(tag, { style: 'unit', unit: 'hour', unitDisplay: 'narrow' }).format(h));
  if (m || !h) parts.push(new Intl.NumberFormat(tag, { style: 'unit', unit: 'minute', unitDisplay: h ? 'narrow' : 'short' }).format(m));
  return parts.join(' ');
}
