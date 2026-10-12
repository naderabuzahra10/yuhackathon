import type { Locale } from './i18n';

export const TZ = 'Asia/Riyadh';

const tag = (locale: Locale) => (locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');

/** Dates arrive either as `YYYY-MM-DD` (a Riyadh calendar day) or as ISO instants. */
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return value.length === 10 ? new Date(`${value}T00:00:00+03:00`) : new Date(value);
}

export function fmtDate(value: string | Date | null | undefined, locale: Locale, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(tag(locale), { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', ...opts }).format(toDate(value));
}

export function fmtDay(value: string | Date | null | undefined, locale: Locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(tag(locale), { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(value));
}

/** Accepts `HH:mm` wall-clock strings as well as ISO instants. */
export function fmtTime(value: string | Date | null | undefined, locale: Locale) {
  if (!value) return '—';
  const f = new Intl.DateTimeFormat(tag(locale), { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) {
    const [h, m] = value.split(':').map(Number);
    return f.format(new Date(Date.UTC(2026, 0, 1, h - 3, m)));
  }
  return f.format(toDate(value));
}

export function fmtDateTime(value: string | Date | null | undefined, locale: Locale) {
  if (!value) return '—';
  return `${fmtDay(value, locale)} · ${fmtTime(value, locale)}`;
}

export function fmtRange(from: string, to: string | null | undefined, locale: Locale) {
  if (!to || to === from) return fmtDate(from, locale);
  const f = new Intl.DateTimeFormat(tag(locale), { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
  return f.formatRange(toDate(from), toDate(to));
}

export function fmtNumber(n: number, locale: Locale, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', opts).format(n);
}

/** The Hijri date, as printed beside the Gregorian one on Saudi calendars. */
export function fmtHijri(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-GB-u-ca-islamic-umalqura', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(toDate(value));
}

export function fmtRelative(value: string | Date, now: Date, locale: Locale) {
  const diff = (toDate(value).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(value, locale);
}

/** Minutes since midnight for an `HH:mm` string. */
export function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** The Riyadh wall-clock minutes of an instant. */
export function riyadhMinutes(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function initials(name: string) {
  const parts = name.replace(/^(Dr\.|د\.)\s*/, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
