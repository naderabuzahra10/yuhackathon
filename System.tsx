import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarBlank, CaretLeft, CaretRight, Compass, EnvelopeSimple, LockSimple, ShieldCheck } from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { addDays, riyadhDay, useClock, weekStart, weekdayName, weekdayOf } from '@/lib/clock';
import { cx, fmtDate, fmtDateTime, fmtTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { featureForPath, homeFor, useSession } from '@/lib/session';
import { Button, Chip, Empty, Loaded, PageHeader, Sheet, Status } from '@/ui/kit';
import { Dialog, toast } from '@/ui/overlay';
import { type CalEntry, KIND_TONES } from './Today';

/* ── Notifications ── */

interface Notice {
  id: string;
  module: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationsPage() {
  const { t, locale } = useI18n();
  useTitle(t('nav.notifications'));
  const notices = useApi<{ items: Notice[]; unread: number }>('/notifications');
  const emails = useApi<Array<{ id: string; subject: string; to_address: string; created_at: string }>>('/emails');
  const [emailId, setEmailId] = useState<string | null>(null);
  const email = useApi<{ subject: string; to_address: string; html: string }>(emailId ? `/emails/${emailId}` : null);

  async function markAll() {
    try {
      await api('/notifications/all/read', { method: 'POST' });
      refreshAll();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <>
      <PageHeader
        title={t('nav.notifications')}
        subtitle={t('notifications.subtitle')}
        actions={notices.data?.unread ? <Button onClick={() => void markAll()}>{t('shell.markAllRead')}</Button> : null}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Loaded q={notices}>
          {(data) => (
            <Sheet flush>
              {data.items.length ? (
                <ul className="rows">
                  {data.items.map((n) => (
                    <li key={n.id}>
                      <Link
                        to={n.link ?? '#'}
                        className="row items-start! py-3.5!"
                        onClick={() => {
                          if (!n.read_at) void api(`/notifications/${n.id}/read`, { method: 'POST' }).then(refreshAll);
                        }}
                      >
                        <span data-tone="red" className={cx('dot mt-1.5', n.read_at && 'opacity-0')} />
                        <span className="min-w-0 flex-1">
                          <span className={cx('block', !n.read_at && 'font-semibold')} dir="auto">
                            {n.title}
                          </span>
                          {n.body ? (
                            <span className="block text-ink-2" dir="auto">
                              {n.body}
                            </span>
                          ) : null}
                          <span className="t-meta mt-1 block">{fmtDateTime(n.created_at, locale)}</span>
                        </span>
                        <Chip variant="outline">{t(`module.${n.module}`)}</Chip>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon={<Bell size={22} />} title={t('shell.noNotifications')} />
              )}
            </Sheet>
          )}
        </Loaded>

        <Sheet
          flush
          title={
            <span className="flex items-center gap-2">
              <EnvelopeSimple size={18} className="text-ink-2" />
              {t('notifications.outbox')}
            </span>
          }
        >
          {emails.data?.length ? (
            <ul className="rows">
              {emails.data.map((e) => (
                <li key={e.id}>
                  <button type="button" className="row" onClick={() => setEmailId(e.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold" dir="auto">
                        {e.subject}
                      </span>
                      <span className="t-meta block truncate">
                        <span dir="ltr">{e.to_address}</span> · {fmtDateTime(e.created_at, locale)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4.5 py-6 text-ink-2">{t('notifications.noEmails')}</p>
          )}
        </Sheet>
      </div>

      <Dialog
        open={!!emailId}
        onClose={() => setEmailId(null)}
        wide
        title={email.data?.subject ?? '…'}
        subtitle={email.data ? `${email.data.to_address} · ${t('common.simulated')}` : undefined}
      >
        {email.data ? <iframe title={email.data.subject} sandbox="" srcDoc={email.data.html} className="h-[60dvh] w-full rounded-lg border border-rule bg-white" /> : null}
      </Dialog>
    </>
  );
}

/* ── Approval centre ── */

interface Approval {
  id: string;
  kind: 'enrollment' | 'excuse' | 'study_plan' | 'graduation' | 'admission';
  entity_id: string;
  revision: number;
  payload_hash: string;
  status: string;
  expires_at: string;
  idempotency_key: string;
  created_at: string;
}

const APPROVAL_LINKS: Record<Approval['kind'], (id: string) => string> = {
  enrollment: (id) => `/academics/register?proposal=${id}`,
  excuse: (id) => `/academics/excuses/${id}`,
  study_plan: () => '/academics/study',
  graduation: () => '/journey/graduation',
  admission: () => '/journey/admission',
};

export function ApprovalsPage() {
  const { t, locale } = useI18n();
  useTitle(t('nav.approvals'));
  const q = useApi<Approval[]>('/approvals');
  return (
    <>
      <PageHeader title={t('nav.approvals')} subtitle={t('approvals.subtitle')} />
      <Loaded q={q}>
        {(list) =>
          list.length ? (
            <div className="space-y-4">
              {list.map((a) => (
                <Sheet
                  key={a.id}
                  title={
                    <Link to={APPROVAL_LINKS[a.kind]?.(a.entity_id) ?? '#'} className="hover:underline">
                      {t(`approval.kind.${a.kind}`)}
                    </Link>
                  }
                  action={<Status status={a.status} />}
                >
                  <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      [t('approvals.revision'), `r${a.revision}`],
                      [t('approvals.hash'), `${a.payload_hash.slice(0, 16)}…`],
                      [t('approvals.key'), a.idempotency_key],
                      [t('approvals.expires'), fmtDateTime(a.expires_at, locale)],
                      [t('approvals.created'), fmtDateTime(a.created_at, locale)],
                    ].map(([k, v], i) => (
                      <div key={k} className="min-w-0">
                        <dt className="t-label">{k}</dt>
                        <dd className={cx('mt-1 truncate', i < 3 && 't-code text-[0.8125rem]')} dir={i < 3 ? 'ltr' : undefined} title={String(v)}>
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Sheet>
              ))}
            </div>
          ) : (
            <Sheet>
              <Empty icon={<ShieldCheck size={22} />} title={t('common.empty')} body={t('approvals.empty')} />
            </Sheet>
          )
        }
      </Loaded>
    </>
  );
}

/* ── Calendar ── */

/** One week as seven day columns; each entry is a stop coloured by its kind. */
export function WeekCalendar({ entries, anchor, onAnchor, compact }: { entries: CalEntry[]; anchor: string; onAnchor?: (day: string) => void; compact?: boolean }) {
  const { t, locale, rtl } = useI18n();
  const { today } = useClock();
  const start = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = useMemo(() => {
    const map = new Map<string, CalEntry[]>();
    for (const e of entries) {
      const day = riyadhDay(e.start_at);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    for (const list of map.values()) list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return map;
  }, [entries]);
  const Prev = rtl ? CaretRight : CaretLeft;
  const Next = rtl ? CaretLeft : CaretRight;

  return (
    <div>
      {onAnchor ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button icon size="sm" onClick={() => onAnchor(addDays(anchor, -7))} aria-label={t('calendar.prevWeek')}>
            <Prev size={15} weight="bold" />
          </Button>
          <Button size="sm" onClick={() => onAnchor(today)}>
            {t('common.today')}
          </Button>
          <Button icon size="sm" onClick={() => onAnchor(addDays(anchor, 7))} aria-label={t('calendar.nextWeek')}>
            <Next size={15} weight="bold" />
          </Button>
          <p className="t-lead ms-2">
            {fmtDate(days[0], locale, { year: undefined })} – {fmtDate(days[6], locale)}
          </p>
        </div>
      ) : null}
      <div className="sheet grid overflow-hidden md:grid-cols-7">
        {days.map((day, i) => {
          const list = byDay.get(day) ?? [];
          const shown = compact ? list.slice(0, 4) : list;
          const isToday = day === today;
          const weekend = weekdayOf(day) >= 5;
          return (
            <section
              key={day}
              aria-label={`${weekdayName(weekdayOf(day), locale, 'long')} ${fmtDate(day, locale)}`}
              className={cx('min-w-0 border-rule max-md:border-t max-md:first:border-t-0 md:border-s md:first:border-s-0', weekend && 'bg-surface-2/60', list.length > 0 && 'md:min-h-44')}
            >
              <header className={cx('flex items-center justify-between gap-2 border-b border-rule px-3 py-2', isToday && 'bg-plate text-plate-ink')}>
                <span className="t-label" style={isToday ? { color: 'var(--plate-ink)' } : undefined}>
                  {weekdayName(weekdayOf(day), locale)}
                </span>
                <span className="fig text-lg">{Number(day.slice(8))}</span>
              </header>
              {list.length === 0 ? (
                <p className="t-meta px-3 py-3 text-ink-3!">{t('calendar.noClasses')}</p>
              ) : (
                <ul className="space-y-px p-1.5">
                  {shown.map((e) => (
                    <li key={e.id}>
                      <Link to={e.link ?? '/calendar'} data-tone={KIND_TONES[e.kind]} className="block rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-2">
                        <span className="flex items-center gap-1.5">
                          <span className="dot size-2!" />
                          <span className="t-code text-xs text-ink-2">{fmtTime(e.start_at, locale)}</span>
                          {e.immovable ? <LockSimple size={11} weight="fill" className="text-ink-3" aria-label={t('calendar.fixed')} /> : null}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug font-semibold" dir="auto">
                          {e.title}
                        </span>
                        {e.location_text ? <span className="t-meta block truncate">{e.location_text}</span> : null}
                      </Link>
                    </li>
                  ))}
                  {compact && list.length > 4 ? (
                    <li>
                      <Link to="/calendar" className="link block px-1.5 py-1 text-xs">
                        {t('calendar.more', { n: list.length - 4 })}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              )}
              {i === 0 ? null : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const { t } = useI18n();
  useTitle(t('nav.calendar'));
  const { today } = useClock();
  const [anchor, setAnchor] = useState<string | null>(null);
  const q = useApi<CalEntry[]>('/calendar');
  const kinds = ['class', 'exam', 'event', 'interview', 'task', 'personal', 'deadline'] as const;
  return (
    <>
      <PageHeader
        title={t('nav.calendar')}
        subtitle={t('calendar.subtitle')}
        actions={
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5" aria-label={t('x.legend')}>
            {kinds.map((k) => (
              <li key={k} data-tone={KIND_TONES[k]} className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink-2">
                <span className="dot size-2!" />
                {t(`kind.${k}`)}
              </li>
            ))}
          </ul>
        }
      />
      <Loaded q={q}>
        {(entries) =>
          entries.length ? (
            <WeekCalendar entries={entries} anchor={anchor ?? today} onAnchor={setAnchor} />
          ) : (
            <Sheet>
              <Empty icon={<CalendarBlank size={22} />} title={t('common.empty')} />
            </Sheet>
          )
        }
      </Loaded>
    </>
  );
}

/* ── Dead ends ── */

export function NotFoundPage() {
  const { t } = useI18n();
  useTitle(t('notFound.title'));
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-surface-2 text-ink-2">
        <Compass size={28} />
      </div>
      <h1 className="t-page">{t('notFound.title')}</h1>
      <p className="mt-2 text-ink-2">{t('notFound.body')}</p>
      <Link to="/today" className="btn btn-primary mt-6">
        {t('notFound.cta')}
      </Link>
    </div>
  );
}

export function AccessDenied({ path }: { path: string }) {
  const { t } = useI18n();
  const { user } = useSession();
  useTitle(t('access.title'));
  const feature = featureForPath(path);
  const studentPage = feature !== 'staff';
  const role = user?.roles[0] ?? 'student';
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-surface-2 text-ink-2">
        <LockSimple size={26} />
      </div>
      <h1 className="t-page">{t('access.title')}</h1>
      <p className="mt-2 text-ink-2">{t('access.body', { who: t(studentPage ? 'access.who.student' : 'access.who.staff'), role: t(`role.${role}`) })}</p>
      <Link to={homeFor(user?.roles)} className="btn btn-primary mt-6">
        {t('access.home')}
      </Link>
    </div>
  );
}
