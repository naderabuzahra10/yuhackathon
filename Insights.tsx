import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowsClockwise, CalendarCheck, CaretLeft, CaretRight, ChatCircleDots, Coins, Info, Student, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { fmtDate, fmtDateTime, fmtNumber, fmtTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { service, ServiceError } from '@/lib/service';
import { Avatar, Button, Chip, DemoNote, Empty, PageHeader, PageSkeleton, Sheet, type Tone } from '@/ui/kit';
import { Bar } from '@/ui/line';
import { PassField } from '@/ui/pass';

/* What the university gets from the same records the students use: who may need a check-in and
   why, where course feedback points, how campus life and UniPoints are doing, and what is waiting
   at each desk. Every figure here links back to something a person can act on. */

interface Reason {
  key: string;
  tone: 'red' | 'yellow';
  en: string;
  ar: string;
}

interface StudentRow {
  id: string;
  name_en: string;
  name_ar: string;
  avatar_color: string;
  program: { name_en: string; name_ar: string } | null;
  year: number | null;
  courses: Array<{ course_code: string; absence_percent: number }>;
  warning: number;
  denial: number;
  unexcused: number;
  overdue: number;
  gpa: number | null;
  worstAbsence: number;
  score: number;
  risk: 'high' | 'watch' | 'ok';
  reasons: Reason[];
}

interface Overview {
  generatedAt: string;
  people: { available: boolean; students: StudentRow[] };
  campus: {
    events: { total: number; upcoming: number; seats: number; going: number; top: Array<{ id: string; title_en: string; title_ar: string; start_at: string; going: number; capacity: number }> };
    clubs: { total: number; members: number; pending: number; top: Array<{ id: string; name_en: string; name_ar: string; color: string; members: number; events: number; posts: number }> };
  };
  desks: {
    feedback: {
      byCollege: Array<{ key: string; en: string; ar: string; responses: number; response_rate: number; index: number }>;
      courseAlerts: Array<{ code: string; title_en: string; title_ar: string; kpi: string; mean: number; n: number; has_action: boolean }>;
      held: number;
      ticketsOpen: number;
    } | null;
    excuses: { waiting: number } | null;
    admissions: Record<string, number> | null;
    graduation: Record<string, number> | null;
  };
  points: { issued: number; used: number; pointsSpent: number; redeemers: number; byOutlet: Array<{ id: string; name_en: string; name_ar: string; color: string; issued: number; used: number; points: number }> };
}

const RISK_TONE: Record<StudentRow['risk'], Tone> = { high: 'red', watch: 'yellow', ok: 'green' };

/** A share of a whole as a thin bar in any colour, for lists where each row has its own. */
function Share({ value, max, color, label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-1.5 w-full rounded-full bg-surface-3">
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: color ?? 'var(--tone)' }} />
    </div>
  );
}

function StudentRowView({ s }: { s: StudentRow }) {
  const { t, l } = useI18n();
  return (
    <li className="row items-start! py-4!">
      <Avatar name={s.name_en} color={s.avatar_color} size={40} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="t-lead">{l(s.name_en, s.name_ar)}</span>
          <Chip tone={RISK_TONE[s.risk]} variant={s.risk === 'high' ? 'solid' : undefined}>
            {t(`ins.risk.${s.risk}`)}
          </Chip>
        </p>
        <p className="t-meta">
          {s.program ? l(s.program.name_en, s.program.name_ar) : ''}
          {s.year ? ` · ${t('academics.overview.level', { level: s.year })}` : ''}
        </p>
        {s.reasons.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {s.reasons.map((r) => (
              <li key={r.key}>
                <Chip tone={r.tone}>{l(r.en, r.ar)}</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[0.875rem] text-ink-2">{t('ins.onTrack')}</p>
        )}
      </div>
      <dl className="grid w-44 flex-none grid-cols-2 gap-x-4 gap-y-2 max-sm:hidden">
        <div className="col-span-2">
          <dt className="t-label flex justify-between">
            <span>{t('ins.absence')}</span>
            <span className="num text-ink">{s.worstAbsence}%</span>
          </dt>
          <dd className="mt-1.5">
            <Bar value={s.worstAbsence} max={Math.max(s.denial + 5, s.worstAbsence)} tone={s.worstAbsence >= s.warning ? 'red' : s.worstAbsence >= s.warning * 0.6 ? 'yellow' : 'green'} label={t('ins.absence')} marks={[{ at: s.warning, tone: 'yellow' }, { at: s.denial, tone: 'red' }]} />
          </dd>
        </div>
        <div>
          <dt className="t-label">{t('ins.gpa')}</dt>
          <dd className="num font-bold">{s.gpa != null ? s.gpa.toFixed(2) : '-'}</dd>
        </div>
        <div>
          <dt className="t-label">{t('ins.overdue')}</dt>
          <dd className="num font-bold">{s.overdue}</dd>
        </div>
      </dl>
    </li>
  );
}

export default function InsightsPage() {
  const { t, l, locale, rtl } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [problem, setProblem] = useState<{ missing: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const Caret = rtl ? CaretLeft : CaretRight;
  useTitle(t('ins.title'));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await service<Overview>('/insights/overview'));
      setProblem(null);
    } catch (e) {
      setProblem({ missing: e instanceof ServiceError && e.missing, message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data && loading) return <PageSkeleton />;
  if (!data) {
    return (
      <div data-tone="yellow">
        <PageHeader title={t('ins.title')} subtitle={t('ins.subtitle')} />
        <Sheet>
          <Empty icon={<WarningCircle size={24} />} title={t(problem?.missing ? 'till.needsServer' : 'common.error')} body={problem?.missing ? t('till.needsServerBody') : problem?.message} action={<Button onClick={() => void load()}>{t('common.retry')}</Button>} />
        </Sheet>
      </div>
    );
  }

  const students = data.people.students;
  const flagged = students.filter((s) => s.risk !== 'ok');
  const fill = data.campus.events.seats ? Math.round((data.campus.events.going / data.campus.events.seats) * 100) : 0;
  const fb = data.desks.feedback;
  const outletMax = Math.max(1, ...data.points.byOutlet.map((o) => o.points));
  const clubMax = Math.max(1, ...data.campus.clubs.top.map((c) => c.members));
  const queues = [
    data.desks.excuses ? { to: '/staff/academics/excuses', label: t('ins.q.excuses'), n: data.desks.excuses.waiting } : null,
    fb ? { to: '/staff/feedback', label: t('ins.q.held'), n: fb.held } : null,
    fb ? { to: '/staff/feedback', label: t('ins.q.tickets'), n: fb.ticketsOpen } : null,
    data.desks.admissions ? { to: '/staff/journey/admissions', label: t('ins.q.admissions'), n: Object.values(data.desks.admissions).reduce((a, b) => a + b, 0) } : null,
    data.desks.graduation ? { to: '/staff/journey/graduation', label: t('ins.q.graduation'), n: Object.values(data.desks.graduation).reduce((a, b) => a + b, 0) } : null,
    { to: '/staff/campus/clubs', label: t('ins.q.clubRequests'), n: data.campus.clubs.pending },
  ].filter((x): x is { to: string; label: string; n: number } => !!x);

  return (
    <div data-tone="yellow" className="space-y-6">
      <PageHeader
        title={t('ins.title')}
        subtitle={t('ins.subtitle')}
        actions={
          <Button onClick={() => void load()} busy={loading}>
            <ArrowsClockwise size={16} />
            {t('common.refresh')}
          </Button>
        }
      />

      {/* The one thing to act on first. */}
      <section className="plate p-6 sm:p-8">
        <p className="flex items-center gap-2 font-semibold text-plate-muted">
          <Student size={18} weight="fill" />
          {t('ins.watch')}
        </p>
        <h2 className="t-page mt-3 text-[clamp(1.625rem,1.2rem+1.6vw,2.5rem)]!">{data.people.available ? t('ins.headline', { n: flagged.length, total: students.length }) : t('ins.noFeed')}</h2>
        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
          <PassField label={t('ins.highestAbsence')}>
            <span className="num">{Math.max(0, ...students.map((s) => s.worstAbsence))}%</span>
          </PassField>
          <PassField label={t('ins.overdueAll')}>
            <span className="num">{students.reduce((n, s) => n + s.overdue, 0)}</span>
          </PassField>
          <PassField label={t('ins.unexcusedAll')}>
            <span className="num">{students.reduce((n, s) => n + s.unexcused, 0)}</span>
          </PassField>
          <PassField label={t('ins.asOf')}>{fmtDateTime(data.generatedAt, locale)}</PassField>
        </div>
      </section>

      <Sheet flush title={t('ins.students')} action={<span className="t-meta">{t('ins.sorted')}</span>}>
        {students.length ? (
          <ul className="rows">
            {students.map((s) => (
              <StudentRowView key={s.id} s={s} />
            ))}
          </ul>
        ) : (
          <Empty icon={<Student size={24} />} title={t('ins.noFeed')} body={t('ins.noFeedBody')} />
        )}
      </Sheet>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {fb ? (
          <Sheet flush title={<span className="flex items-center gap-2"><ChatCircleDots size={18} weight="fill" className="text-purple" />{t('ins.feedback')}</span>} action={<Link to="/staff/feedback" className="link text-[0.8125rem]">{t('common.open')}</Link>}>
            <ul className="rows">
              {fb.courseAlerts.slice(0, 5).map((c) => (
                <li key={`${c.code}-${c.kpi}`} className="row">
                  <span className="glyph t-code w-auto! px-2.5 text-[0.8125rem]" data-tone="purple">{c.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{l(c.title_en, c.title_ar)}</span>
                    <span className="t-meta block">
                      {t(`ins.kpi.${c.kpi}`)} · {t('ins.responses', { n: c.n })}
                    </span>
                  </span>
                  <span className="text-end">
                    <span className="fig block text-[1.375rem] text-yellow-ink">{c.mean.toFixed(1)}</span>
                    <span className="t-meta">{t('ins.outOf5')}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-3 border-t border-rule px-5 py-4">
              <p className="t-label">{t('ins.responseRate')}</p>
              {fb.byCollege.map((c) => (
                <div key={c.key} data-tone="purple">
                  <p className="mb-1.5 flex justify-between gap-3 text-[0.875rem]">
                    <span className="truncate font-medium">{l(c.en, c.ar)}</span>
                    <span className="num font-bold">{c.response_rate}%</span>
                  </p>
                  <Share value={c.response_rate} max={100} label={l(c.en, c.ar)} />
                </div>
              ))}
            </div>
          </Sheet>
        ) : null}

        <Sheet flush title={<span className="flex items-center gap-2"><CalendarCheck size={18} weight="fill" className="text-orange" />{t('ins.events')}</span>} action={<Chip tone="orange">{t('ins.seatsFilled', { n: fill })}</Chip>}>
          {data.campus.events.top.length ? (
            <ul className="space-y-3.5 px-5 pt-1 pb-5" data-tone="orange">
              {data.campus.events.top.map((e) => (
                <li key={e.id}>
                  <Link to={`/campus/events/${e.id}`} className="group block">
                    <p className="mb-1.5 flex justify-between gap-3 text-[0.875rem]">
                      <span className="truncate font-medium group-hover:underline" dir="auto">{l(e.title_en, e.title_ar)}</span>
                      <span className="num flex-none font-bold">
                        {e.going}/{e.capacity}
                      </span>
                    </p>
                    <Share value={e.going} max={e.capacity} label={l(e.title_en, e.title_ar)} />
                    <p className="t-meta mt-1">
                      {fmtDate(e.start_at, locale, { weekday: 'short', year: undefined })} · {fmtTime(e.start_at, locale)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title={t('ins.noEvents')} />
          )}
        </Sheet>

        <Sheet flush title={<span className="flex items-center gap-2"><UsersThree size={18} weight="fill" className="text-orange" />{t('ins.clubs')}</span>} action={<Chip variant="outline">{t('ins.members', { n: data.campus.clubs.members })}</Chip>}>
          <ul className="space-y-3 px-5 pt-1 pb-5">
            {data.campus.clubs.top.map((c) => (
              <li key={c.id}>
                <p className="mb-1.5 flex justify-between gap-3 text-[0.875rem]">
                  <span className="truncate font-medium">{l(c.name_en, c.name_ar)}</span>
                  <span className="num flex-none font-bold">{c.members}</span>
                </p>
                <Share value={c.members} max={clubMax} color={c.color} label={l(c.name_en, c.name_ar)} />
              </li>
            ))}
          </ul>
        </Sheet>

        <Sheet flush title={<span className="flex items-center gap-2"><Coins size={18} weight="fill" className="text-orange" />{t('rw.name')}</span>} action={<Link to="/cashier" className="link text-[0.8125rem]">{t('till.title')}</Link>}>
          <dl className="grid grid-cols-3 gap-3 px-5 pt-1 pb-4">
            <div>
              <dt className="t-label">{t('ins.pointsSpent')}</dt>
              <dd className="fig mt-1.5 text-[1.625rem]">{fmtNumber(data.points.pointsSpent, locale)}</dd>
            </div>
            <div>
              <dt className="t-label">{t('ins.vouchers')}</dt>
              <dd className="fig mt-1.5 text-[1.625rem]">{data.points.issued}</dd>
            </div>
            <div>
              <dt className="t-label">{t('ins.vouchersUsed')}</dt>
              <dd className="fig mt-1.5 text-[1.625rem]">{data.points.used}</dd>
            </div>
          </dl>
          <ul className="space-y-3 border-t border-rule px-5 py-4">
            {data.points.byOutlet.map((o) => (
              <li key={o.id}>
                <p className="mb-1.5 flex justify-between gap-3 text-[0.875rem]">
                  <span className="truncate font-medium">{l(o.name_en, o.name_ar)}</span>
                  <span className="num flex-none font-bold">{fmtNumber(o.points, locale)}</span>
                </p>
                <Share value={o.points} max={outletMax} color={o.color} label={l(o.name_en, o.name_ar)} />
              </li>
            ))}
          </ul>
        </Sheet>
      </div>

      <Sheet flush title={t('ins.queues')}>
        <ul className="rows">
          {queues.map((q) => (
            <li key={q.label}>
              <Link to={q.to} className="row">
                <span className={`fig w-10 flex-none text-center text-[1.5rem] ${q.n ? 'text-yellow-ink' : 'text-ink-3'}`}>{q.n}</span>
                <span className="min-w-0 flex-1 font-semibold">{q.label}</span>
                <Caret size={13} weight="bold" className="flex-none text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>

      <div className="well p-4">
        <DemoNote>
          <Info size={15} className="mt-0.5 flex-none" />
          <span>{t('ins.demoNote')}</span>
        </DemoNote>
      </div>
    </div>
  );
}
