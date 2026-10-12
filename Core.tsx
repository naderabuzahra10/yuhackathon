import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BookOpenText, CalendarCheck, CaretDown, CheckCircle, ClipboardText, FileArrowUp, ListChecks, MagnifyingGlass, MapPin, Sparkle, TreeStructure,
  WarningCircle, XCircle,
} from '@phosphor-icons/react';
import { api, errorMessage, refreshAll, upload, useApi } from '@/lib/api';
import { weekdayName } from '@/lib/clock';
import { cx, fmtDate, fmtDateTime, fmtTime, minutesOf } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { WeekCalendar } from '@/pages/System';
import type { CalEntry } from '@/pages/Today';
import { Button, Chip, Empty, Field, Figure, Loaded, MoreLink, PageHeader, SectionHead, Segmented, Sheet, Status, statusTone, type Tone } from '@/ui/kit';
import { Bar, type Stage, StageLine, Stop, Stops } from '@/ui/line';
import { toast, useAction } from '@/ui/overlay';

type L10n = { en: string; ar: string };

interface Check {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  explanation: string;
  hard?: boolean;
}

export function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className="rows">
      {checks.map((c) => {
        const tone: Tone = c.status === 'pass' ? 'green' : c.status === 'warn' ? 'yellow' : 'red';
        const Icon = c.status === 'pass' ? CheckCircle : c.status === 'warn' ? WarningCircle : XCircle;
        return (
          <li key={c.id} data-tone={tone} className="flex items-start gap-3 px-4.5 py-3">
            <Icon size={18} weight="fill" className="mt-0.5 flex-none text-tone" />
            <span className="min-w-0">
              <span className="block font-semibold">{c.label}</span>
              <span className="block text-ink-2">{c.explanation}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Overview ── */

interface AttCourse {
  course_code: string;
  title_en: string;
  title_ar: string;
  total: number;
  counts: { present: number; absent: number; late: number; excused: number };
  absence_percent: number;
  level: 'ok' | 'warning' | 'denial' | 'danger';
}

interface Overview {
  student: { program: L10n | null; level: number };
  term: { label: L10n; next: { label: L10n } };
  credits: { earned: number; in_progress: number; required: number; remaining: number; estimate: { terms_remaining: number; assumptions: string } };
  week: { start: string; entries: CalEntry[] };
  attendance: { policy: { warning: { value: number; provenance: string }; denial: { value: number } }; courses: AttCourse[]; unexcused: number };
  proposals: { latest: { id: string; term_label: L10n; credits: number; status: string } | null };
  excuses: { items: Array<{ id: string; sessions: Array<{ course_code: string; session_date: string }>; status: string }> };
  tasks: { due_soon: number; overdue: number };
  nextActions: Array<{ kind: string; title: string; body: string; link: string; tone: string }>;
}

export function OverviewPage() {
  const { t, l, locale } = useI18n();
  const q = useApi<Overview>('/academics/overview');
  return (
    <Loaded q={q}>
      {(d) => {
        const pct = Math.round((d.credits.earned / d.credits.required) * 100);
        const absences = d.attendance.courses.reduce((n, c) => n + c.counts.absent, 0);
        const warn = d.attendance.policy.warning.value;
        const deny = d.attendance.policy.denial.value;
        return (
          <div className="space-y-7">
            <Sheet>
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
                <div>
                  <h2 className="t-label">{t('academics.overview.degreeProgress')}</h2>
                  <p className="mt-2 flex items-baseline gap-3">
                    <span className="fig text-[3.5rem] text-blue-ink">{pct}%</span>
                    <span className="text-ink-2">{t('academics.overview.ofCredits', { earned: d.credits.earned, required: d.credits.required })}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to="/academics/plan" className="btn btn-secondary">
                    {t('academics.nav.plan')}
                  </Link>
                  <Link to="/academics/register" className="btn btn-primary">
                    <Sparkle size={16} weight="fill" />
                    {t('academics.overview.planNext', { term: l(d.term.next.label.en, d.term.next.label.ar) })}
                  </Link>
                </div>
              </div>
              {/* The degree as a line: earned track is solid, this term's credits are the lighter run ahead. */}
              <div className="relative mt-5 h-5" role="img" aria-label={t('academics.overview.ofCredits', { earned: d.credits.earned, required: d.credits.required })}>
                <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-3" />
                <div className="absolute start-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-blue/35" style={{ width: `${((d.credits.earned + d.credits.in_progress) / d.credits.required) * 100}%` }} />
                <div className="track-draw absolute start-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-blue" style={{ width: `${pct}%` }} />
                <span className="absolute top-1/2 size-5 -translate-y-1/2 rounded-full bg-surface" style={{ insetInlineStart: `calc(${pct}% - 10px)`, boxShadow: 'inset 0 0 0 5px var(--blue)' }} />
                <span className="absolute end-0 top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-surface" style={{ boxShadow: 'inset 0 0 0 3px var(--rule-strong)' }} />
              </div>
              <p className="t-meta mt-3">
                <span className="font-semibold text-ink">{t('academics.overview.estimate', { terms: d.credits.estimate.terms_remaining })}</span> · {d.credits.estimate.assumptions}
              </p>
            </Sheet>

            <div className="sheet grid divide-rule overflow-hidden max-sm:divide-y sm:grid-cols-2 sm:[&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(n+3)]:border-rule sm:[&>*:nth-child(even)]:border-s sm:[&>*:nth-child(even)]:border-rule lg:grid-cols-4 lg:[&>*]:border-t-0! lg:[&>*+*]:border-s lg:[&>*+*]:border-rule">
              <Figure value={d.credits.earned} label={t('academics.overview.creditsEarned')} hint={t('academics.overview.creditsRemaining', { n: d.credits.remaining })} to="/academics/plan" />
              <Figure value={d.credits.in_progress} label={t('academics.overview.creditsInProgress')} hint={l(d.term.label.en, d.term.label.ar)} tone="blue" to="/academics/timetable" />
              <Figure
                value={absences}
                label={t('academics.overview.absences')}
                hint={d.attendance.unexcused ? t('academics.overview.unexcused', { n: d.attendance.unexcused }) : t('academics.overview.allExcused')}
                tone={d.attendance.unexcused ? 'red' : 'green'}
                to="/academics/attendance"
              />
              <Figure
                value={d.tasks.due_soon}
                label={t('academics.overview.tasksDue')}
                hint={d.tasks.overdue ? t('academics.overview.overdue', { n: d.tasks.overdue }) : t('academics.overview.onTrack')}
                tone={d.tasks.overdue ? 'yellow' : 'green'}
                to="/academics/study"
              />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Sheet flush title={t('academics.overview.nextActions')}>
                {d.nextActions.length ? (
                  <ul className="rows">
                    {d.nextActions.map((a, i) => (
                      <li key={i}>
                        <Link to={a.link} className="row items-start! py-3.5!" data-tone={a.tone === 'warn' ? 'red' : a.tone === 'success' ? 'green' : 'blue'}>
                          <span className="dot mt-1.5" />
                          <span className="min-w-0 flex-1">
                            <span className="t-label block text-tone-ink!">{t(`academics.action.${a.kind}`)}</span>
                            <span className="mt-0.5 block font-semibold">{a.title}</span>
                            <span className="block text-ink-2">{a.body}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty icon={<CheckCircle size={22} weight="fill" className="text-green" />} title={t('academics.overview.noActions')} />
                )}
              </Sheet>

              <Sheet flush title={t('academics.overview.attendanceByCourse')} action={<MoreLink to="/academics/attendance">{t('academics.nav.attendance')}</MoreLink>}>
                <ul className="rows">
                  {d.attendance.courses.map((c) => (
                    <li key={c.course_code} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3.5 px-4.5 py-3">
                      <span className="t-code">{c.course_code}</span>
                      <Bar value={c.absence_percent} max={Math.max(deny + 5, c.absence_percent)} tone={c.absence_percent >= deny ? 'red' : c.absence_percent >= warn ? 'yellow' : 'blue'} label={t('academics.att.percentAbsent', { n: c.absence_percent })} marks={[{ at: warn, tone: 'yellow' }, { at: deny, tone: 'red' }]} />
                      <span className="t-meta num w-24 text-end">
                        {c.absence_percent}% · {c.counts.absent}/{c.total}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="t-meta border-t border-rule px-4.5 py-3">
                  {t('academics.attendance.policyNote', { warn, deny })}. {d.attendance.policy.warning.provenance}
                </p>
              </Sheet>
            </div>

            <div>
              <SectionHead title={t('academics.overview.thisWeek')} action={<MoreLink to="/academics/timetable">{t('academics.overview.fullTimetable')}</MoreLink>} />
              <WeekCalendar entries={d.week.entries} anchor={d.week.start} compact />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Sheet flush title={t('academics.nav.excuses')} action={<MoreLink to="/academics/excuses">{t('common.view')}</MoreLink>}>
                {d.excuses.items.length ? (
                  <ul className="rows">
                    {d.excuses.items.map((e) => (
                      <li key={e.id}>
                        <Link to={`/academics/excuses/${e.id}`} className="row">
                          <ClipboardText size={19} className="flex-none text-ink-2" />
                          <span className="min-w-0 flex-1 font-semibold">
                            <span className="t-code">{e.sessions[0]?.course_code}</span> · {e.sessions[0] ? fmtDate(e.sessions[0].session_date, locale) : ''}
                          </span>
                          <Status status={e.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4.5 py-5 text-ink-2">{t('academics.excuses.none')}</p>
                )}
              </Sheet>
              {d.proposals.latest ? (
                <Sheet flush title={t('academics.nav.register')}>
                  <Link to={`/academics/register?proposal=${d.proposals.latest.id}`} className="row">
                    <ListChecks size={19} className="flex-none text-ink-2" />
                    <span className="min-w-0 flex-1 font-semibold">
                      {l(d.proposals.latest.term_label.en, d.proposals.latest.term_label.ar)} · {d.proposals.latest.credits} {t('common.credits')}
                    </span>
                    <Status status={d.proposals.latest.status} />
                  </Link>
                </Sheet>
              ) : null}
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Timetable ── */

interface Section {
  id: string;
  course_code: string;
  title_en: string;
  title_ar: string;
  credits: number;
  section_no: string;
  instructor: string;
  seats_left: number;
  capacity: number;
  meetings: Array<{ day: number; start: string; end: string; location_id: string | null; location: { name_en: string; name_ar: string; building_en?: string; building_ar?: string } | null }>;
}

const COURSE_TONES: Tone[] = ['blue', 'orange', 'purple', 'green', 'yellow', 'red'];

/** A week as a time grid; each class is a block on its day's track. */
export function WeekGrid({ sections, today }: { sections: Section[]; today?: number }) {
  const { t, l, locale } = useI18n();
  const meetings = sections.flatMap((s, i) => s.meetings.map((m) => ({ ...m, section: s, tone: COURSE_TONES[i % COURSE_TONES.length] })));
  if (!meetings.length) return null;
  const from = Math.floor(Math.min(...meetings.map((m) => minutesOf(m.start))) / 60) * 60;
  const to = Math.ceil(Math.max(...meetings.map((m) => minutesOf(m.end))) / 60) * 60;
  const hours: number[] = [];
  for (let h = from; h < to; h += 60) hours.push(h);
  const HOUR = 58;
  return (
    <div className="sheet scroll-x" role="img" aria-label={t('academics.weekGrid')}>
      <div className="grid min-w-[44rem] grid-cols-[3.75rem_repeat(5,minmax(0,1fr))]">
        <div className="border-b border-rule" />
        {[0, 1, 2, 3, 4].map((day) => (
          <div key={day} className={cx('border-s border-b border-rule px-3 py-2.5', day === today && 'bg-plate text-plate-ink')}>
            <span className="t-label" style={day === today ? { color: 'var(--plate-ink)' } : undefined}>
              {weekdayName(day, locale, 'long')}
            </span>
          </div>
        ))}
        <div className="relative" style={{ height: hours.length * HOUR }}>
          {hours.map((h, i) => (
            <span key={h} className="t-code absolute end-2 -translate-y-1/2 text-[0.6875rem] text-ink-2" style={{ top: i * HOUR + (i === 0 ? 9 : 0) }}>
              {fmtTime(`${String(h / 60).padStart(2, '0')}:00`, locale)}
            </span>
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((day) => (
          <div key={day} className="relative border-s border-rule" style={{ height: hours.length * HOUR }}>
            {hours.slice(1).map((h, i) => (
              <span key={h} className="absolute inset-x-0 border-t border-rule/70" style={{ top: (i + 1) * HOUR }} />
            ))}
            {meetings
              .filter((m) => m.day === day)
              .map((m) => (
                <div
                  key={`${m.section.id}-${m.start}`}
                  data-tone={m.tone}
                  className="absolute inset-x-1.5 overflow-hidden rounded-lg bg-tone-tint px-2.5 py-1.5 text-tone-ink"
                  style={{ top: ((minutesOf(m.start) - from) / 60) * HOUR + 2, height: ((minutesOf(m.end) - minutesOf(m.start)) / 60) * HOUR - 4 }}
                >
                  <p className="t-code text-[0.8125rem]">{m.section.course_code}</p>
                  <p className="truncate text-xs leading-tight font-medium">{l(m.section.title_en, m.section.title_ar)}</p>
                  <p className="truncate text-xs leading-tight opacity-80">
                    {fmtTime(m.start, locale)} · {m.location ? l(m.location.name_en, m.location.name_ar) : ''}
                  </p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TimetablePage() {
  const { t, l, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const term = params.get('term') ?? undefined;
  const q = useApi<{ term: string; term_label: L10n; weekday: number; sections: Section[]; credits: number; terms: string[] }>('/academics/timetable', { term });
  return (
    <Loaded q={q}>
      {(d) => (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-2">
              <span className="font-semibold text-ink">{l(d.term_label.en, d.term_label.ar)}</span> · {d.sections.length} {t('academics.timetable.sections').toLowerCase()} · {d.credits} {t('common.credits')}
            </p>
            {d.terms.length > 1 ? <Segmented label={t('common.term')} value={d.term} onChange={(v) => setParams({ term: v }, { replace: true })} options={d.terms.map((x) => ({ value: x, label: x }))} /> : null}
          </div>
          {d.sections.length ? (
            <>
              <WeekGrid sections={d.sections} today={d.weekday} />
              <Sheet flush title={t('academics.timetable.sections')}>
                <ul className="rows">
                  {d.sections.map((s, i) => (
                    <li key={s.id} data-tone={COURSE_TONES[i % COURSE_TONES.length]} className="grid items-start gap-x-5 gap-y-1.5 px-4.5 py-3.5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <Link to={`/academics/courses/${encodeURIComponent(s.course_code)}`} className="group flex items-baseline gap-2">
                          <span className="dot translate-y-px" />
                          <span className="t-code">{s.course_code}</span>
                          <span className="truncate font-semibold group-hover:underline">{l(s.title_en, s.title_ar)}</span>
                        </Link>
                        <p className="t-meta ms-[1.125rem]">
                          {s.instructor} · {s.credits} {t('common.credits')} · §{s.section_no}
                        </p>
                      </div>
                      <ul className="space-y-0.5 text-[0.8125rem]">
                        {s.meetings.map((m) => (
                          <li key={`${m.day}-${m.start}`} className="flex flex-wrap items-center gap-x-2">
                            <span className="t-code w-9">{weekdayName(m.day, locale)}</span>
                            <span className="num text-ink-2">
                              {fmtTime(m.start, locale)} – {fmtTime(m.end, locale)}
                            </span>
                            {m.location && m.location_id ? (
                              <Link to={`/campus/map?to=${m.location_id}`} className="link inline-flex items-center gap-1 font-medium!">
                                <MapPin size={12} weight="fill" />
                                {l(m.location.name_en, m.location.name_ar)}
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <Link to={`/campus/resources?course=${encodeURIComponent(s.course_code)}`} className="btn btn-ghost btn-sm">
                        <BookOpenText size={15} />
                        {t('academics.course.resources')}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Sheet>
            </>
          ) : (
            <Sheet>
              <Empty icon={<CalendarCheck size={22} />} title={t('academics.timetable.empty')} body={t('academics.timetable.emptyBody')} />
            </Sheet>
          )}
        </div>
      )}
    </Loaded>
  );
}

/* ── Attendance ── */

interface Session {
  id: string;
  course_code: string;
  title_en: string;
  title_ar: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  excuse_request_id: string | null;
}

interface Attendance {
  today: string;
  policy: { warning: { value: number; provenance: string }; denial: { value: number }; excuseDeadlineDays: { value: number } };
  courses: Array<AttCourse & { instructor: string; sessions: Session[]; warning_percent: number; denial_percent: number }>;
}

const SESSION_TONE: Record<Session['status'], Tone> = { present: 'green', absent: 'red', late: 'yellow', excused: 'blue' };

export function AttendancePage() {
  const { t, l, locale } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = useApi<Attendance>('/academics/attendance');
  const [picked, setPicked] = useState<string[]>([]);
  const [type, setType] = useState<'medical' | 'event' | 'other'>('medical');
  const [text, setText] = useState('');
  const [matches, setMatches] = useState<Session[] | null>(null);
  const { busy, run } = useAction();

  const preselect = params.get('session');
  useEffect(() => {
    if (preselect) setPicked([preselect]);
  }, [preselect]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const createDraft = () =>
    void run('draft', async () => {
      const draft = await api<{ id: string }>('/academics/excuses', { body: { attendanceIds: picked, type } });
      toast.ok(t('academics.excuses.draftCreated'));
      refreshAll();
      navigate(`/academics/excuses/${draft.id}`);
    });

  const resolve = () =>
    void run('resolve', async () => {
      const res = await api<{ matches: Session[] }>('/academics/excuses/resolve', { body: { text } });
      setMatches(res.matches);
      if (res.matches.length === 1) setPicked([res.matches[0].id]);
    });

  return (
    <Loaded q={q}>
      {(d) => {
        const days = d.policy.excuseDeadlineDays.value;
        const open = d.courses.flatMap((c) => c.sessions).filter((s) => s.status === 'absent' && !s.excuse_request_id);
        return (
          <div className="space-y-7">
            <p className="max-w-[70ch] text-ink-2">{t('academics.att.subtitle')}</p>

            <Sheet
              tone={open.length ? 'red' : 'green'}
              title={open.length ? t('academics.att.needsAction', { n: open.length }) : t('academics.att.nothingToDo')}
              action={<MoreLink to="/academics/excuses">{t('academics.att.myRequests')}</MoreLink>}
            >
              {open.length ? (
                <>
                  <ul className="flex flex-wrap gap-2">
                    {open.map((s) => {
                      const on = picked.includes(s.id);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(s.id)}
                            className={cx('flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-start transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]', on ? 'border-red bg-red-tint' : 'border-rule-strong hover:bg-surface-2')}
                          >
                            <span className={cx('grid size-4.5 flex-none place-items-center rounded-[5px] border', on ? 'border-red bg-red text-white' : 'border-rule-strong')}>{on ? <CheckCircle size={12} weight="fill" /> : null}</span>
                            <span>
                              <span className="block font-semibold">
                                <span className="t-code">{s.course_code}</span> · {fmtDate(s.session_date, locale, { weekday: 'short', year: undefined })}
                              </span>
                              <span className="t-meta block num">
                                {fmtTime(s.start_time, locale)} – {fmtTime(s.end_time, locale)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                    <Segmented label={t('academics.excuses.typeLabel')} value={type} onChange={setType} options={(['medical', 'event', 'other'] as const).map((k) => ({ value: k, label: t(`academics.excuses.type.${k}`) }))} />
                    <Button variant="primary" disabled={!picked.length} busy={busy === 'draft'} onClick={createDraft}>
                      {t('academics.attendance.draftFor', { n: picked.length })}
                    </Button>
                    <p className="t-meta">{t('academics.att.windowNote', { days })}</p>
                  </div>
                </>
              ) : (
                <p className="text-ink-2">{t('academics.att.allClear')}</p>
              )}
            </Sheet>

            <Sheet title={t('academics.attendance.resolveTitle')}>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) resolve();
                }}
              >
                <div className="relative min-w-56 flex-1">
                  <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
                  <input className="input ps-9" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('academics.attendance.resolvePlaceholder')} aria-label={t('academics.att.findTitle')} />
                </div>
                <Button type="submit" busy={busy === 'resolve'} disabled={!text.trim()}>
                  {t('academics.attendance.resolve')}
                </Button>
              </form>
              <p className="help">{t('academics.att.findHelp')}</p>
              {matches ? (
                matches.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {matches.map((s) => (
                      <li key={s.id}>
                        <button type="button" aria-pressed={picked.includes(s.id)} onClick={() => toggle(s.id)} className={cx('chip h-8! px-3!', picked.includes(s.id) ? 'chip-solid' : 'chip-outline')} data-tone="red">
                          <span className="t-code">{s.course_code}</span> {fmtDate(s.session_date, locale, { year: undefined })} · {t(`status.${s.status}`)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-ink-2">{t('x.noResults')}</p>
                )
              ) : null}
            </Sheet>

            <div>
              <SectionHead title={t('academics.att.byCourse')} hint={t('academics.att.demoPolicy')} />
              <div className="sheet rows overflow-hidden">
                {d.courses.map((c) => (
                  <div key={c.course_code} className="px-4.5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="flex items-baseline gap-2">
                        <span className="t-code">{c.course_code}</span>
                        <span className="font-semibold">{l(c.title_en, c.title_ar)}</span>
                      </h3>
                      <p className="t-meta num">
                        {t('academics.attendance.counts', { p: c.counts.present, a: c.counts.absent, l: c.counts.late, e: c.counts.excused, total: c.total })}
                        {c.level !== 'ok' ? (
                          <Chip tone={c.level === 'warning' ? 'yellow' : 'red'} className="ms-2">
                            {t(`academics.att.level.${c.level === 'warning' ? 'warning' : 'denial'}`)}
                          </Chip>
                        ) : null}
                      </p>
                    </div>
                    {/* Each session is a station on the course line. */}
                    <ol className="scroll-x mt-3 flex items-start">
                      {c.sessions.map((s, i) => {
                        const selectable = s.status === 'absent' && !s.excuse_request_id;
                        const on = picked.includes(s.id);
                        const label = `${fmtDate(s.session_date, locale, { year: undefined })} · ${t(`status.${s.status}`)}`;
                        const dot = (
                          <span data-tone={SESSION_TONE[s.status]} className={cx('relative z-10 block rounded-full transition-transform duration-150', s.status === 'present' ? 'size-3 bg-tone' : 'size-4 bg-tone', on && 'scale-125 outline-2 outline-offset-2 outline-ink')} />
                        );
                        return (
                          <li key={s.id} className="relative flex min-w-11 flex-1 flex-col items-center">
                            {i > 0 ? <span className="absolute end-1/2 top-[0.6875rem] h-0.5 w-full bg-rule-strong" /> : null}
                            {selectable ? (
                              <button type="button" aria-pressed={on} title={`${label} · ${t('academics.attendance.clickToExcuse')}`} onClick={() => toggle(s.id)} className="grid size-6 place-items-center">
                                {dot}
                              </button>
                            ) : s.excuse_request_id ? (
                              <Link to={`/academics/excuses/${s.excuse_request_id}`} title={`${label} · ${t('academics.attendance.openRequest')}`} className="grid size-6 place-items-center">
                                {dot}
                              </Link>
                            ) : (
                              <span title={label} className="grid size-6 place-items-center">
                                {dot}
                              </span>
                            )}
                            <span className="t-meta mt-1 text-[0.6875rem]! whitespace-nowrap num">{fmtDate(s.session_date, locale, { year: undefined })}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
                <ul className="flex flex-wrap gap-x-5 gap-y-1.5 px-4.5 py-3 text-[0.8125rem] text-ink-2" aria-label={t('x.legend')}>
                  {(['present', 'absent', 'late', 'excused'] as const).map((s) => (
                    <li key={s} data-tone={SESSION_TONE[s]} className="flex items-center gap-1.5">
                      <span className="dot" />
                      {t(`status.${s}`)}
                    </li>
                  ))}
                  <li className="ms-auto">{t('academics.attendance.policyNote', { warn: d.policy.warning.value, deny: d.policy.denial.value })}</li>
                </ul>
              </div>
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Excuses ── */

interface Excuse {
  id: string;
  sessions: Session[];
  type: 'medical' | 'event' | 'other';
  reason: string;
  from_date: string | null;
  to_date: string | null;
  reference: string | null;
  documents: Array<{ id: string; filename: string }>;
  status: string;
  review_department: string | null;
  reviewer_note: string | null;
  approval_id: string | null;
  history: Array<{ at: string; action: string; note: string | null }>;
  checks: Check[];
  can_approve: boolean;
  editable: boolean;
  updated_at: string;
}

const EXCUSE_FLOW = ['draft', 'ready', 'approved', 'submitted', 'under_review', 'accepted'];

function excuseStages(status: string, t: (k: string) => string): Stage[] {
  const terminal = status === 'rejected' || status === 'needs_information' || status === 'failed';
  const reached = terminal ? EXCUSE_FLOW.indexOf('under_review') : Math.max(0, EXCUSE_FLOW.indexOf(status === 'needs_review' ? 'draft' : status));
  return EXCUSE_FLOW.map((s, i) => {
    const last = i === EXCUSE_FLOW.length - 1;
    if (last && terminal) return { key: status, label: t(`status.${status}`), state: status === 'needs_information' ? 'current' : 'failed' };
    return { key: s, label: t(`status.${s}`), state: i < reached || (status === 'accepted' && last) ? 'done' : i === reached && !terminal ? 'current' : terminal && i <= reached ? 'done' : 'todo' };
  });
}

export function ExcusesPage() {
  const { t, locale } = useI18n();
  const q = useApi<Excuse[]>('/academics/excuses');
  return (
    <Loaded q={q}>
      {(list) => (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[70ch] text-ink-2">{t('academics.excuses.subtitle')}</p>
            <Link to="/academics/attendance" className="btn btn-primary">
              {t('academics.excuses.new')}
            </Link>
          </div>
          {list.length ? (
            <div className="space-y-4">
              {list.map((e) => (
                <Link key={e.id} to={`/academics/excuses/${e.id}`} className="sheet block p-4.5 transition-colors hover:border-rule-strong">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="t-lead">
                      {e.sessions.map((s) => `${s.course_code} · ${fmtDate(s.session_date, locale, { year: undefined })}`).join(', ')}
                      <span className="ms-2 font-normal text-ink-2">{t(`academics.excuses.type.${e.type}`)}</span>
                    </p>
                    <Status status={e.status} />
                  </div>
                  <StageLine stages={excuseStages(e.status, t)} tone="blue" label={t('common.status')} dense />
                </Link>
              ))}
            </div>
          ) : (
            <Sheet>
              <Empty icon={<ClipboardText size={22} />} title={t('academics.excuses.none')} body={t('academics.excuses.noneBody')} />
            </Sheet>
          )}
        </div>
      )}
    </Loaded>
  );
}

export function ExcusePage() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const q = useApi<Excuse>(id ? `/academics/excuses/${id}` : null);
  const [form, setForm] = useState({ type: 'medical' as Excuse['type'], reason: '', from_date: '', to_date: '', reference: '' });
  const [dirty, setDirty] = useState(false);
  const { busy, run } = useAction();

  useEffect(() => {
    if (q.data && !dirty) setForm({ type: q.data.type, reason: q.data.reason ?? '', from_date: q.data.from_date ?? '', to_date: q.data.to_date ?? '', reference: q.data.reference ?? '' });
  }, [q.data, dirty]);

  const act = (key: string, fn: () => Promise<unknown>, ok?: string) =>
    run(key, async () => {
      await fn();
      refreshAll();
    }, ok);

  return (
    <Loaded q={q}>
      {(e) => {
        const set = (patch: Partial<typeof form>) => {
          setForm({ ...form, ...patch });
          setDirty(true);
        };
        const save = async () => {
          await act('save', () => api(`/academics/excuses/${e.id}`, { method: 'PUT', body: { type: form.type, reason: form.reason, from_date: form.from_date || null, to_date: form.to_date || null, reference: form.reference || null } }), t('common.save'));
          setDirty(false);
        };
        const attach = (file: File) =>
          act('file', async () => {
            const doc = await upload<{ id: string }>('/documents', file, { kind: form.type === 'medical' ? 'medical' : 'event_evidence', label: file.name });
            await api(`/academics/excuses/${e.id}/evidence`, { body: { documentId: doc.id } });
          }, t('academics.excuses.attached'));
        const failing = e.checks.some((c) => c.status === 'fail');
        return (
          <div className="space-y-6">
            <PageHeader
              crumbs={[{ label: t('nav.academics'), to: '/academics' }, { label: t('academics.nav.excuses'), to: '/academics/excuses' }, { label: e.sessions[0]?.course_code ?? e.id }]}
              title={e.sessions.map((s) => `${s.course_code} · ${fmtDate(s.session_date, locale, { year: undefined })}`).join(', ')}
              subtitle={t('academics.excuses.noChangeNote')}
              actions={<Status status={e.status} />}
            />
            <Sheet>
              <StageLine stages={excuseStages(e.status, t)} tone="blue" label={t('common.status')} />
              {e.status === 'under_review' || e.status === 'submitted' ? <p className="t-meta mt-4 border-t border-rule pt-3">{t('academics.excuses.underReviewNote')}</p> : null}
              {e.status === 'accepted' ? <p className="t-meta mt-4 border-t border-rule pt-3">{t('academics.excuses.acceptedNote')}</p> : null}
              {e.reviewer_note ? (
                <p className="mt-4 rounded-lg bg-surface-2 px-3.5 py-3">
                  <span className="t-label block">{t('academics.excuses.decision')}</span>
                  {e.reviewer_note}
                </p>
              ) : null}
            </Sheet>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <Sheet flush title={t('academics.excuses.step.absences')}>
                  <ul className="rows">
                    {e.sessions.map((s) => (
                      <li key={s.id} className="row">
                        <span data-tone={SESSION_TONE[s.status]} className="dot" />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">
                            <span className="t-code">{s.course_code}</span> · {l(s.title_en, s.title_ar)}
                          </span>
                          <span className="t-meta block num">
                            {fmtDate(s.session_date, locale, { weekday: 'short' })} · {fmtTime(s.start_time, locale)} – {fmtTime(s.end_time, locale)}
                          </span>
                        </span>
                        <Status status={s.status} />
                      </li>
                    ))}
                  </ul>
                  <p className="t-meta border-t border-rule px-4.5 py-2.5">{t('academics.excuses.absencesHint')}</p>
                </Sheet>

                <Sheet title={t('academics.excuses.step.details')}>
                  <fieldset disabled={!e.editable} className="space-y-4">
                    <div>
                      <p className="label">{t('academics.excuses.typeLabel')}</p>
                      <Segmented label={t('academics.excuses.typeLabel')} value={form.type} onChange={(v) => set({ type: v })} options={(['medical', 'event', 'other'] as const).map((k) => ({ value: k, label: t(`academics.excuses.type.${k}`) }))} />
                      <p className="help">{t(`academics.excuses.type.${form.type}Hint`)}</p>
                    </div>
                    <Field label={t('academics.excuses.reason')} hint={t('academics.excuses.reasonHint')}>
                      {(p) => <textarea {...p} className="textarea" value={form.reason} onChange={(ev) => set({ reason: ev.target.value })} />}
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label={t('academics.excuses.from')}>{(p) => <input {...p} type="date" className="input" value={form.from_date} onChange={(ev) => set({ from_date: ev.target.value })} />}</Field>
                      <Field label={t('academics.excuses.to')}>{(p) => <input {...p} type="date" className="input" value={form.to_date} onChange={(ev) => set({ to_date: ev.target.value })} />}</Field>
                      <Field label={t('academics.excuses.reference')} optional>
                        {(p) => <input {...p} className="input" value={form.reference} onChange={(ev) => set({ reference: ev.target.value })} />}
                      </Field>
                    </div>
                    {e.editable ? (
                      <div className="flex items-center gap-3">
                        <Button variant={dirty ? 'primary' : 'secondary'} busy={busy === 'save'} disabled={!dirty} onClick={() => void save()}>
                          {t('common.save')}
                        </Button>
                        {dirty ? <span className="t-meta text-yellow-ink!">{t('academics.excuses.unsaved')}</span> : null}
                      </div>
                    ) : null}
                  </fieldset>
                </Sheet>

                <Sheet title={t('academics.excuses.step.evidence')}>
                  <p className="text-ink-2">{t(form.type === 'medical' ? 'academics.excuses.evidenceMedical' : form.type === 'event' ? 'academics.excuses.evidenceEvent' : 'academics.excuses.evidenceOther')}</p>
                  {e.documents.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {e.documents.map((doc) => (
                        <li key={doc.id}>
                          <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="chip chip-outline h-8! px-3! hover:bg-surface-2">
                            <FileArrowUp size={14} />
                            {doc.filename}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {e.editable ? (
                    <label className={cx('btn btn-secondary mt-3.5 cursor-pointer', busy === 'file' && 'pointer-events-none opacity-60')}>
                      <FileArrowUp size={16} />
                      {t(form.type === 'medical' ? 'academics.excuses.uploadMedical' : 'academics.excuses.uploadEvidence')}
                      <input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,text/plain" onChange={(ev) => ev.target.files?.[0] && void attach(ev.target.files[0])} />
                    </label>
                  ) : null}
                </Sheet>
              </div>

              <div className="space-y-6">
                <Sheet flush title={t('academics.excuses.step.review')}>
                  <Checks checks={e.checks} />
                  <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4.5 py-3.5">
                    {e.status === 'approved' ? (
                      <Button variant="primary" busy={busy === 'submit'} onClick={() => void act('submit', () => api(`/academics/excuses/${e.id}/submit`, { body: { approvalId: e.approval_id } }), t('academics.excuses.submitted'))}>
                        {t('academics.excuses.submit')}
                      </Button>
                    ) : e.editable ? (
                      <Button variant="primary" busy={busy === 'approve'} disabled={failing || dirty || !e.can_approve} onClick={() => void act('approve', () => api(`/academics/excuses/${e.id}/approve`, { method: 'POST' }), t('academics.excuses.approved'))}>
                        {t('academics.excuses.approve')}
                      </Button>
                    ) : null}
                    {e.editable && (failing || !e.can_approve) ? <p className="t-meta">{t('academics.excuses.completeFirst')}</p> : null}
                  </div>
                </Sheet>
                <Sheet title={t('academics.excuses.history')}>
                  <Stops tone="blue">
                    {e.history.map((h, i) => (
                      <Stop key={i} state="done" last={i === e.history.length - 1}>
                        <p className="font-semibold capitalize">{h.action.replace(/_/g, ' ')}</p>
                        {h.note ? <p className="text-ink-2">{h.note}</p> : null}
                        <p className="t-meta">{fmtDateTime(h.at, locale)}</p>
                      </Stop>
                    ))}
                  </Stops>
                </Sheet>
                {e.review_department ? (
                  <p className="t-meta">
                    {t('academics.excuses.department')}: {e.review_department}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Degree plan ── */

interface PlanCourse {
  code: string | null;
  title_en: string;
  title_ar: string;
  credits: number;
  category: string;
  status: string;
  grade: string | null;
}

interface Plan {
  program: { en: string; ar: string };
  terms: Array<{ year: number; sem: number; label_en: string; label_ar: string; courses: PlanCourse[] }>;
  audit: {
    total_required: number;
    earned: number;
    in_progress: number;
    remaining: number;
    buckets: Array<{ id: string; label_en: string; label_ar: string; required_credits: number; earned_credits: number; in_progress_credits: number; remaining_credits: number }>;
    unmet: Array<{ bucket: string; remaining_credits: number; suggestions: string[] }>;
  };
  next_term: { id: string; eligibility: Array<{ code: string; eligible: boolean; reasons: string[]; required: boolean }> };
}

export function PlanPage() {
  const { t, l } = useI18n();
  const q = useApi<Plan>('/academics/plan');
  const [openYears, setOpenYears] = useState<Set<number> | null>(null);
  return (
    <Loaded q={q}>
      {(d) => {
        const years = [...new Set(d.terms.map((x) => x.year))];
        const currentYear = d.terms.find((x) => x.courses.some((c) => c.status === 'enrolled'))?.year ?? years[0];
        const open = openYears ?? new Set(years.filter((y) => y >= currentYear));
        const eligible = d.next_term.eligibility.filter((e) => e.eligible);
        return (
          <div className="space-y-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[70ch] text-ink-2">{t('academics.plan.subtitle')}</p>
              <Link to="/prereqs" className="btn btn-secondary">
                <TreeStructure size={16} />
                {t('academics.plan.showChain')}
              </Link>
            </div>

            <div className="sheet grid divide-rule overflow-hidden max-sm:divide-y sm:grid-cols-4 sm:divide-x rtl:sm:divide-x-reverse">
              <Figure value={d.audit.earned} label={t('academics.req.earned')} tone="green" />
              <Figure value={d.audit.in_progress} label={t('academics.req.inProgress')} tone="blue" />
              <Figure value={d.audit.remaining} label={t('academics.req.remaining')} />
              <Figure value={d.audit.total_required} label={t('prereqs.credit_total')} />
            </div>

            <div>
              <SectionHead title={t('academics.plan.map')} />
              <div className="space-y-3">
                {years.map((year) => {
                  const terms = d.terms.filter((x) => x.year === year);
                  const isOpen = open.has(year);
                  const done = terms.every((x) => x.courses.every((c) => c.status === 'completed' || c.status === 'equivalent'));
                  const credits = terms.flatMap((x) => x.courses).reduce((n, c) => n + c.credits, 0);
                  return (
                    <div key={year} className="sheet overflow-hidden">
                      <button
                        type="button"
                        className="row"
                        aria-expanded={isOpen}
                        onClick={() => {
                          const next = new Set(open);
                          isOpen ? next.delete(year) : next.add(year);
                          setOpenYears(next);
                        }}
                      >
                        <span className="t-title flex-1">
                          {t('academics.plan.year', { n: year })}
                          {year === currentYear ? (
                            <Chip tone="blue" className="ms-2.5">
                              {t('academics.plan.thisYear')}
                            </Chip>
                          ) : null}
                        </span>
                        {done ? <span className="t-meta">{t('academics.plan.yearDone', { n: credits })}</span> : null}
                        <CaretDown size={14} weight="bold" className={cx('text-ink-3 transition-transform duration-200', isOpen && 'rotate-180')} />
                      </button>
                      {isOpen ? (
                        <div className="grid border-t border-rule md:grid-cols-2 md:divide-x md:divide-rule rtl:md:divide-x-reverse">
                          {terms.map((term) => (
                            <div key={term.sem} className="max-md:border-t max-md:border-rule max-md:first:border-t-0">
                              <p className="t-label border-b border-rule px-4.5 py-2">{l(term.label_en, term.label_ar)}</p>
                              <ul className="rows">
                                {term.courses.map((c, i) => {
                                  const code = c.code && !c.code.startsWith('ELECTIVE:') ? c.code : null;
                                  return (
                                    <li key={c.code ?? `slot-${i}`} data-tone={statusTone(c.status)}>
                                      {!code ? (
                                        <div className="flex items-center gap-3 px-4.5 py-2.5 text-ink-2">
                                          <span className="dot dot-ring" />
                                          <span className="min-w-0 flex-1 truncate">{l(c.title_en, c.title_ar)}</span>
                                          <span className="t-meta num">{c.credits}</span>
                                        </div>
                                      ) : (
                                        <Link to={`/academics/courses/${encodeURIComponent(code)}`} className="flex items-center gap-3 px-4.5 py-2.5 transition-colors hover:bg-surface-2">
                                          <span className={cx('dot', !['completed', 'equivalent', 'enrolled'].includes(c.status) && 'dot-ring')} />
                                          <span className="t-code w-[4.25rem] flex-none text-[0.8125rem]">{code}</span>
                                          <span className="min-w-0 flex-1 truncate">{l(c.title_en, c.title_ar)}</span>
                                          <span className="t-meta flex-none num">{c.grade ?? t(`status.${c.status}`)}</span>
                                        </Link>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Sheet flush title={t('academics.plan.audit')}>
                <ul className="rows">
                  {d.audit.buckets.map((b) => (
                    <li key={b.id} className="px-4.5 py-3">
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{l(b.label_en, b.label_ar)}</span>
                        {b.remaining_credits === 0 ? <Chip tone="green">{t('academics.plan.met')}</Chip> : <span className="t-meta">{t('academics.plan.remaining', { n: b.remaining_credits })}</span>}
                      </div>
                      <Bar value={b.earned_credits} max={b.required_credits} tone={b.remaining_credits === 0 ? 'green' : 'blue'} label={l(b.label_en, b.label_ar)} />
                      <p className="t-meta mt-1.5">{t('academics.plan.bucketLine', { earned: b.earned_credits, inProgress: b.in_progress_credits, required: b.required_credits })}</p>
                    </li>
                  ))}
                </ul>
                <p className="t-meta border-t border-rule px-4.5 py-3">{t('academics.plan.neverCounted')}</p>
              </Sheet>
              <Sheet flush title={t('academics.plan.nextTermEligible')} action={<Chip tone="green">{t('academics.plan.candidates', { n: eligible.length })}</Chip>}>
                <ul className="rows">
                  {d.next_term.eligibility.slice(0, 12).map((e) => (
                    <li key={e.code} data-tone={e.eligible ? 'green' : 'neutral'}>
                      <Link to={`/academics/courses/${encodeURIComponent(e.code)}`} className="flex items-start gap-3 px-4.5 py-2.5 transition-colors hover:bg-surface-2">
                        <span className={cx('dot mt-1.5', !e.eligible && 'dot-ring')} />
                        <span className="t-code w-[4.25rem] flex-none text-[0.8125rem]">{e.code}</span>
                        <span className="min-w-0 flex-1 text-ink-2">{e.eligible ? t('status.eligible') : e.reasons[0]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Sheet>
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Course page ── */

interface CourseDetail {
  course: { code: string; title_en: string; title_ar: string; credits: number; level: number; prereqs: string[][]; min_credits: number; description_en: string | null; source: string };
  status: string;
  missing: string[];
  credit_short: number;
  chain: string[][];
  dependents: string[];
  sections: { current: Section[]; next: Section[] };
}

export function CoursePage() {
  const { code } = useParams();
  const { t, l, locale } = useI18n();
  const q = useApi<CourseDetail>(code ? `/academics/courses/${encodeURIComponent(code)}` : null);
  useTitle(code);
  const codeChip = (c: string) => (
    <Link key={c} to={`/academics/courses/${encodeURIComponent(c)}`} className="chip chip-outline t-code hover:bg-surface-2">
      {c}
    </Link>
  );
  return (
    <Loaded q={q}>
      {(d) => {
        const sections = [...d.sections.current, ...d.sections.next];
        return (
          <div className="space-y-6">
            <PageHeader
              crumbs={[{ label: t('nav.academics'), to: '/academics' }, { label: t('academics.nav.plan'), to: '/academics/plan' }, { label: d.course.code }]}
              title={
                <>
                  <span className="t-code text-blue-ink">{d.course.code}</span> {l(d.course.title_en, d.course.title_ar)}
                </>
              }
              subtitle={d.course.description_en}
              actions={
                <>
                  <Link to={`/prereqs?course=${encodeURIComponent(d.course.code)}`} className="btn btn-secondary">
                    <TreeStructure size={16} />
                    {t('academics.plan.showChain')}
                  </Link>
                  <Link to={`/campus/resources?course=${encodeURIComponent(d.course.code)}`} className="btn btn-secondary">
                    <BookOpenText size={16} />
                    {t('academics.course.resources')}
                  </Link>
                </>
              }
            />
            <div className="flex flex-wrap gap-1.5">
              <Status status={d.status} />
              <Chip variant="outline">
                {d.course.credits} {t('common.credits')}
              </Chip>
              <Chip variant="outline">
                {t('academics.course.level')} {d.course.level}
              </Chip>
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Sheet title={t('academics.course.prereqs')} tone="orange">
                {d.course.prereqs.length ? <div className="flex flex-wrap gap-1.5">{d.course.prereqs.flat().map(codeChip)}</div> : <p className="text-ink-2">{t('academics.course.noPrereqs')}</p>}
                {d.course.min_credits ? <p className="t-meta mt-2">{t('academics.course.minCredits', { n: d.course.min_credits })}</p> : null}
                {d.missing.length ? (
                  <p className="mt-3 text-red-ink">
                    {t('academics.course.missing')}: {d.missing.join(', ')}
                  </p>
                ) : null}
                {d.credit_short ? <p className="mt-1 text-red-ink">{t('academics.course.creditShort', { n: d.credit_short })}</p> : null}
              </Sheet>
              <Sheet title={t('academics.course.unlocks')} tone="blue">
                {d.dependents.length ? <div className="flex flex-wrap gap-1.5">{d.dependents.map(codeChip)}</div> : <p className="text-ink-2">{t('prereqs.unlocksNothing')}</p>}
              </Sheet>
            </div>
            <Sheet flush title={t('academics.timetable.sections')}>
              {sections.length ? (
                <ul className="rows">
                  {sections.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4.5 py-3">
                      <span className="t-code w-20">
                        {(s as Section & { term?: string }).term} §{s.section_no}
                      </span>
                      <span className="min-w-40 flex-1 font-medium">{s.instructor}</span>
                      <span className="t-meta num">
                        {s.meetings.map((m) => `${weekdayName(m.day, locale)} ${fmtTime(m.start, locale)}`).join(' · ')}
                      </span>
                      <Chip tone={s.seats_left > 3 ? 'green' : s.seats_left > 0 ? 'yellow' : 'red'}>
                        {s.seats_left}/{s.capacity}
                      </Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4.5 py-5 text-ink-2">{t('academics.course.noSections')}</p>
              )}
            </Sheet>
            <p className="t-meta">
              {t('prereqs.source')}: {d.course.source}
            </p>
          </div>
        );
      }}
    </Loaded>
  );
}

export function useAcademicsTitle(key: string) {
  const { t } = useI18n();
  useTitle(useMemo(() => t(key), [t, key]));
}
