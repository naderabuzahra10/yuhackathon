import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Bell, Briefcase, CalendarCheck, CalendarPlus, CaretLeft, CaretRight, CarProfile, ChartLineUp, CheckCircle, ClipboardText,
  Coins, EnvelopeSimple, ListChecks, MapPin, MapTrifold, NavigationArrow, Notebook, Package, Path, QrCode, Stamp, TreeStructure, type Icon,
} from '@phosphor-icons/react';
import { AskBar, suggestionsFor } from '@/agent/Agent';
import { useApi } from '@/lib/api';
import { fmtDuration, riyadhDay } from '@/lib/clock';
import { useFocus } from '@/lib/focus';
import { cx, fmtDate, fmtHijri, fmtNumber, fmtTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { nextReward, topAffordable, useRewards } from '@/lib/rewards';
import { openScanner } from '@/lib/scan';
import { useSession } from '@/lib/session';
import { Empty, Loaded, MoreLink, Sheet, Status, type Tone } from '@/ui/kit';
import { CountUp, Pass, PassField } from '@/ui/pass';

export interface CalEntry {
  id: string;
  title: string;
  kind: 'class' | 'exam' | 'event' | 'interview' | 'task' | 'personal' | 'deadline' | 'external';
  start_at: string;
  end_at: string;
  location_id: string | null;
  location_text: string | null;
  location_name_en?: string | null;
  location_name_ar?: string | null;
  immovable: boolean;
  link: string | null;
  meta?: { course_code?: string } | null;
}

interface TodayData {
  today: string;
  now: string;
  local: { weekday: number; hour: number };
  term: { label: { en: string; ar: string } };
  stats: { unexcusedAbsences: number; unread: number; overdueTasks: number };
  classes: CalEntry[];
  nextClass: CalEntry | null;
  upcoming: CalEntry[];
  pending: Array<{ kind: string; id: string; title: string; status: string; link: string; params?: Record<string, unknown> }>;
  tasks: Array<{ id: string; title: string; course_code: string | null; deadline: string | null; status: string }>;
  attendance: Array<{ course_code: string; percent: number; level: 'ok' | 'warning' | 'danger' }>;
  lostFound: Array<{ id: string; item: string; status: string; collection_location_en: string | null; collection_location_ar: string | null }>;
  applications: Array<{ id: string; company: string; title: string; status: string; deadline: string | null }>;
  queues: Array<{ key: string; title: string; count: number; link: string }>;
}

export const KIND_TONES: Record<CalEntry['kind'], Tone> = {
  class: 'blue', exam: 'red', event: 'orange', interview: 'purple', task: 'green', personal: 'neutral', deadline: 'yellow', external: 'neutral',
};

interface RowItem {
  key: string;
  to: string;
  icon: Icon;
  title: string;
  meta?: string | null;
  tone?: Tone;
  trailing?: ReactNode;
}

function ItemRow({ item }: { item: RowItem }) {
  const { rtl } = useI18n();
  const Caret = rtl ? CaretLeft : CaretRight;
  const IconC = item.icon;
  return (
    <li>
      <Link to={item.to} className="row">
        <span className="glyph" data-tone={item.tone ?? 'neutral'}>
          <IconC size={19} weight={item.tone === 'red' ? 'fill' : 'regular'} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold" dir="auto" title={item.title}>
            {item.title}
          </span>
          {item.meta ? (
            <span className="t-meta block truncate" title={item.meta}>
              {item.meta}
            </span>
          ) : null}
        </span>
        {item.trailing}
        <Caret size={13} weight="bold" className="flex-none text-ink-3" />
      </Link>
    </li>
  );
}

/* The next class as a boarding pass: where to be and when on the body, the rest of the day on the stub. */
function NextClassPass({ d, items }: { d: TodayData; items: CalEntry[] }) {
  const { t, l, locale, rtl } = useI18n();
  const next = d.nextClass;
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const weekend = d.local.weekday === 5 || d.local.weekday === 6;

  if (!items.length || !next) {
    return (
      <section className="plate flex h-full flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
        <div>
          <h2 className="t-page text-[1.5rem]!">{t(items.length ? 'today.caughtUp' : 'today.noClasses')}</h2>
          {weekend ? <p className="mt-1.5 text-plate-muted">{t('today.weekend')}</p> : null}
        </div>
        <Link to="/academics/timetable" className="btn btn-secondary">
          {t('today.timetable')}
          <Arrow size={15} weight="bold" />
        </Link>
      </section>
    );
  }

  const onNow = next.start_at <= d.now && next.end_at > d.now;
  const minutes = Math.round((new Date(next.start_at).getTime() - new Date(d.now).getTime()) / 60000);
  const [code, ...rest] = next.title.split(' · ');
  const stops = items.slice(0, 4);

  return (
    <Pass
      side
      className="h-full"
      stackStub={`${4.5 + stops.length * (rtl ? 2.7 : 2.2)}rem`}
      label={`${t('today.next')}: ${next.title}`}
      stub={
        <div className="flex h-full flex-col p-5 sm:p-6">
          <p className="t-cap">{t('today.schedule')}</p>
          <ol className="mt-3 space-y-2.5">
            {stops.map((c) => {
              const done = c.end_at <= d.now;
              const current = c.id === next.id;
              return (
                <li key={c.id} className={cx('flex items-center gap-2.5', done && 'opacity-55')}>
                  <span className={cx('relative size-2.5 flex-none rounded-full', current ? 'now-pulse bg-accent' : 'bg-(--plate-muted)')} />
                  <span className="t-code w-[3.25rem] flex-none text-[0.8125rem]">{fmtTime(c.start_at, locale)}</span>
                  <span className={cx('min-w-0 flex-1 truncate text-[0.875rem]', current ? 'font-bold' : 'font-medium')} dir="auto">
                    {c.meta?.course_code ?? c.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      }
    >
      <div className="flex h-full flex-col p-5 sm:p-7">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="t-cap">{t('today.next')}</span>
          <span className="chip chip-solid">{onNow ? t('today.onNow') : minutes > 0 ? t('today.startsInLabel', { t: fmtDuration(minutes, locale) }) : fmtTime(next.start_at, locale)}</span>
        </p>
        <h2 className="mt-4">
          <span className="fig block text-[clamp(2.75rem,2rem+3.4vw,4.25rem)]" dir="ltr">
            {code}
          </span>
          <span className="t-title mt-2 block text-[1.25rem]!" dir="auto">
            {rest.join(' · ')}
          </span>
        </h2>
        <div className="mt-6 grid gap-x-6 gap-y-3.5 min-[440px]:grid-cols-2 sm:flex sm:flex-wrap sm:gap-x-10">
          <PassField label={t('common.location')}>{l(next.location_name_en ?? next.location_text ?? '', next.location_name_ar)}</PassField>
          <PassField label={t('common.time')}>
            <span className="num">
              {fmtTime(next.start_at, locale)} - {fmtTime(next.end_at, locale)}
            </span>
          </PassField>
          <PassField label={t('common.date')} className="max-sm:hidden">
            {fmtDate(d.today, locale, { weekday: 'short', year: undefined })}
          </PassField>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
          {next.location_id ? (
            <Link to={`/campus/map?to=${next.location_id}`} className="btn btn-primary">
              <NavigationArrow size={16} weight="fill" />
              {t('common.route')}
            </Link>
          ) : null}
          <Link to="/academics/timetable" className="btn btn-secondary">
            {t('today.timetable')}
          </Link>
        </div>
      </div>
    </Pass>
  );
}

/* The balance and the nearest thing it buys. */
function PointsTile() {
  const { t, l, locale, rtl } = useI18n();
  const r = useRewards();
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const best = topAffordable(r.balance);
  const next = nextReward(r.balance);
  const recent = r.earnedEntries.filter((e) => e.kind === 'verified' || e.kind === 'attended' || e.kind === 'result').slice(0, 1)[0];
  return (
    <section className="plate pass-orange flex h-full flex-col p-5 sm:p-6" aria-label={t('rw.name')}>
      <p className="flex items-center gap-2 font-bold">
        <Coins size={19} weight="fill" />
        {t('rw.name')}
      </p>
      <p className="fig mt-4 text-[clamp(2.75rem,2rem+2.6vw,3.75rem)]">{r.ready ? <CountUp value={r.balance} format={(n) => fmtNumber(n, locale)} /> : '…'}</p>
      <p className="mt-1 font-semibold text-(--plate-muted)">{t('rw.pointsToSpend')}</p>
      <p className="mt-4 text-[0.875rem] font-medium text-(--plate-muted)">
        {best
          ? t('rw.enoughFor', { item: l(best.item.name_en, best.item.name_ar), outlet: l(best.outlet.name_en, best.outlet.name_ar) })
          : next
            ? t('rw.toNext', { n: fmtNumber(next.item.points - r.balance, locale), item: l(next.item.name_en, next.item.name_ar) })
            : ''}
      </p>
      {recent ? <p className="mt-1 truncate text-[0.8125rem] text-(--plate-muted)">+{recent.points} · {l(recent.title_en, recent.title_ar)}</p> : null}
      <div className="mt-auto pt-5">
        <Link to="/campus/rewards" className="btn btn-primary">
          {t('rw.redeem')}
          <Arrow size={15} weight="bold" />
        </Link>
      </div>
    </section>
  );
}

function pendingTitle(p: TodayData['pending'][number], t: (k: string, v?: Record<string, string | number>) => string) {
  const params = p.params ?? {};
  switch (p.kind) {
    case 'enrollment':
      return typeof params.credits === 'number' ? t('today.pending.enrollment', { n: params.credits }) : p.title;
    case 'excuse':
      return params.type ? t('today.pending.excuse', { type: t(`academics.excuses.type.${String(params.type)}`) }) : p.title;
    case 'study':
      return t('today.pending.study');
    case 'admission':
      return p.status === 'admitted' ? t('today.pending.admissionOffer') : t('today.pending.admission');
    case 'graduation':
      return t('today.pending.graduation');
    case 'email':
      return params.subject ? String(params.subject) : p.title;
    default:
      return p.title;
  }
}

const SHORTCUTS: Array<{ to: string; key: string; icon: Icon; tone: Tone }> = [
  { to: '/academics/register', key: 'today.action.register', icon: CalendarPlus, tone: 'blue' },
  { to: '/academics/study', key: 'today.action.study', icon: Notebook, tone: 'blue' },
  { to: '/campus/map', key: 'today.action.map', icon: MapPin, tone: 'orange' },
  { to: '/academics/attendance', key: 'today.action.excuse', icon: CalendarCheck, tone: 'red' },
  { to: '/career', key: 'today.action.career', icon: Briefcase, tone: 'purple' },
];

export default function TodayPage() {
  const { t, l, locale, has } = useI18n();
  const { user, hasRole, can } = useSession();
  const focus = useFocus();
  useTitle(t('nav.today'));
  const q = useApi<TodayData>('/today');

  const isStudent = hasRole('student');
  const isStaff = !!user && !hasRole('student', 'applicant');
  const firstName = user ? l(user.name_en, user.name_ar).replace(/^(Dr\.|د\.)\s*/, '').split(' ')[0] : '';

  return (
    <Loaded q={q}>
      {(d) => {
        const hour = d.local.hour;
        const greet = hour < 12 ? t('today.morning') : hour < 17 ? t('today.afternoon') : t('today.evening');
        const schedule = [...d.classes, ...d.upcoming.filter((e) => riyadhDay(e.start_at) === d.today && e.kind !== 'class')].sort((a, b) => a.start_at.localeCompare(b.start_at));

        const inbox: RowItem[] = [];
        if (isStaff) {
          for (const queue of d.queues) {
            const key = `today.queue.${queue.key}`;
            inbox.push({ key: `q-${queue.key}`, to: queue.link, icon: Stamp, title: has(key) ? t(key) : queue.title, tone: queue.count ? 'yellow' : undefined, trailing: <span className="fig text-xl">{queue.count}</span> });
          }
        }
        if (isStudent && d.stats.unexcusedAbsences > 0) {
          inbox.push({ key: 'abs', to: '/academics/attendance', icon: CalendarCheck, title: t('today.inboxUnexcused', { n: d.stats.unexcusedAbsences }), meta: t('today.inboxUnexcusedMeta'), tone: 'red' });
        }
        for (const p of d.pending) {
          inbox.push({ key: p.id, to: p.link, icon: p.kind === 'email' ? EnvelopeSimple : ClipboardText, title: pendingTitle(p, t), meta: p.kind === 'email' ? t('today.pending.emailMeta') : null, tone: p.kind === 'email' ? 'purple' : 'blue', trailing: <Status status={p.status} /> });
        }
        if (d.stats.unread > 0) inbox.push({ key: 'unread', to: '/notifications', icon: Bell, title: t('today.unreadN', { n: d.stats.unread }) });

        const forYou: RowItem[] = [];
        if (isStudent) {
          const task = d.tasks.find((x) => x.status !== 'done' && x.deadline) ?? d.tasks.find((x) => x.status !== 'done');
          if (d.stats.overdueTasks > 0) forYou.push({ key: 'overdue', to: '/academics/study?repair=missed', icon: ListChecks, title: t('today.fy.overdue', { n: d.stats.overdueTasks }), tone: 'red' });
          else if (task) forYou.push({ key: task.id, to: '/academics/study', icon: ListChecks, title: task.title, tone: 'blue', meta: [task.course_code, task.deadline ? t('today.due', { date: fmtDate(task.deadline, locale, { weekday: 'short', year: undefined }) }) : null].filter(Boolean).join(' · ') });
          const worst = d.attendance.filter((a) => a.level !== 'ok').sort((a, b) => b.percent - a.percent)[0];
          if (worst) forYou.push({ key: 'att', to: '/academics/attendance', icon: ChartLineUp, title: t('today.fy.attendance', { course: worst.course_code, p: String(worst.percent) }), tone: worst.level === 'danger' ? 'red' : 'yellow' });
          const found = d.lostFound.find((x) => x.status === 'found' || x.collection_location_en);
          if (found) forYou.push({ key: found.id, to: `/campus/lost-found/${found.id}`, icon: Package, title: t('today.fy.collect', { item: found.item }), meta: found.collection_location_en ? `${t('today.collectFrom')} ${l(found.collection_location_en, found.collection_location_ar)}` : null, tone: 'green' });
          const event = d.upcoming.find((e) => e.kind === 'event' && riyadhDay(e.start_at) > d.today);
          if (event) forYou.push({ key: event.id, to: event.link ?? '/campus/events', icon: CalendarCheck, title: event.title, meta: `${t('today.fy.going')} · ${fmtDate(event.start_at, locale, { weekday: 'short', year: undefined })} ${fmtTime(event.start_at, locale)}`, tone: 'orange' });
          const app = d.applications.find((a) => a.status === 'interview' || a.deadline);
          if (app) forYou.push({ key: app.id, to: '/career?tab=tracker', icon: Briefcase, title: `${app.company} · ${app.title}`, meta: t(`status.${app.status}`), tone: 'purple' });
        }

        const tools: RowItem[] = [];
        if (!isStudent) {
          if (hasRole('security')) tools.push({ key: 'lf', to: '/staff/campus/lost-found', icon: Package, title: t('today.tool.lostFound'), meta: t('today.tool.lostFoundMeta'), tone: 'orange' });
          if (can('staff')) tools.push({ key: 'desk', to: '/staff', icon: Stamp, title: t('today.tool.desk'), meta: t('today.tool.deskMeta'), tone: 'yellow' });
          if (can('journey')) tools.push({ key: 'journey', to: '/journey', icon: Path, title: t('today.tool.journey'), meta: t('today.tool.journeyMeta'), tone: 'purple' });
          if (can('map')) tools.push({ key: 'map', to: '/campus/map', icon: MapTrifold, title: t('today.tool.map'), meta: t('today.tool.mapMeta'), tone: 'orange' });
          if (hasRole('security')) tools.push({ key: 'parking', to: '/campus/map?view=parking', icon: CarProfile, title: t('today.tool.parking'), meta: t('today.tool.parkingMeta'), tone: 'blue' });
          if (can('prereqs') && !can('staff')) tools.push({ key: 'programs', to: '/prereqs', icon: TreeStructure, title: t('today.tool.programs'), meta: t('today.tool.programsMeta'), tone: 'blue' });
        }

        const shown = inbox.slice(0, 5);
        const side = isStudent ? forYou.slice(0, 5) : tools;
        // Focus can take any of these blocks away; what stays takes the room.
        const showNext = can('academics') && focus.shows('today:next');
        const showPoints = can('academics') && focus.shows('today:points');
        const showInbox = focus.shows('today:inbox');
        const showSide = side.length > 0 && focus.shows('today:forYou');

        return (
          <div className="space-y-6">
            <header className="rise">
              <h1 className="t-page">{t('today.greeting', { greet, name: firstName })}</h1>
              <p className="mt-2 flex flex-wrap gap-x-2 text-ink-2">
                <span className="font-semibold text-ink">{fmtDate(d.today, locale, { weekday: 'long', year: undefined, month: 'long' })}</span>
                <span aria-hidden>·</span>
                <span>{fmtHijri(d.today, locale)}</span>
                <span aria-hidden>·</span>
                <span>{l(d.term.label.en, d.term.label.ar)}</span>
              </p>
            </header>

            {can('assistant') && focus.shows('today:ask') ? <AskBar className="rise" suggestions={suggestionsFor('/today', t)} /> : null}

            {showNext || showPoints ? (
              <div className="grid gap-5 xl:grid-cols-12">
                {showNext ? (
                  <div className={cx('rise', showPoints ? 'xl:col-span-8' : 'xl:col-span-12')} style={{ ['--i' as string]: 1 }}>
                    <NextClassPass d={d} items={schedule} />
                  </div>
                ) : null}
                {showPoints ? (
                  <div className={cx('rise', showNext ? 'xl:col-span-4' : 'xl:col-span-12')} style={{ ['--i' as string]: 2 }}>
                    <PointsTile />
                  </div>
                ) : null}
              </div>
            ) : null}

            {isStudent && focus.shows('today:shortcuts') ? (
              <nav aria-label={t('today.quick')} className="rise scroll-x -mx-1 flex gap-2.5 px-1" style={{ ['--i' as string]: 3 }}>
                {can('campusLife') ? (
                  <button type="button" onClick={openScanner} data-tone="orange" className="lift flex flex-none items-center gap-2.5 rounded-full border border-rule bg-surface py-1.5 ps-1.5 pe-4 font-semibold">
                    <span className="glyph size-8! rounded-full!">
                      <QrCode size={17} weight="fill" />
                    </span>
                    {t('scan.open')}
                  </button>
                ) : null}
                {SHORTCUTS.map((s) => (
                  <Link key={s.to} to={s.to} data-tone={s.tone} className="lift flex flex-none items-center gap-2.5 rounded-full border border-rule bg-surface py-1.5 ps-1.5 pe-4 font-semibold">
                    <span className="glyph size-8! rounded-full!">
                      <s.icon size={17} weight="fill" />
                    </span>
                    {t(s.key)}
                  </Link>
                ))}
              </nav>
            ) : null}

            <div className="grid items-start gap-5 lg:grid-cols-12">
              {showInbox ? (
              <div className={cx('rise', showSide ? 'lg:col-span-7' : 'lg:col-span-12')} style={{ ['--i' as string]: 4 }}>
                <Sheet
                  flush
                  title={
                    <span className="flex items-center gap-2">
                      {t(isStaff ? 'today.queues' : 'today.inbox')}
                      {inbox.length ? (
                        <span className="chip chip-solid num" data-tone="red">
                          {inbox.length}
                        </span>
                      ) : null}
                    </span>
                  }
                  action={inbox.length > shown.length ? <MoreLink to="/approvals">{t('today.seeAll', { n: inbox.length })}</MoreLink> : undefined}
                >
                  {shown.length ? (
                    <ul className="rows">
                      {shown.map((item) => (
                        <ItemRow key={item.key} item={item} />
                      ))}
                    </ul>
                  ) : (
                    <Empty icon={<CheckCircle size={24} weight="fill" />} title={t('today.caughtUp')} />
                  )}
                </Sheet>
              </div>
              ) : null}

              {showSide ? (
                <div className={cx('rise', showInbox ? 'lg:col-span-5' : 'lg:col-span-12')} style={{ ['--i' as string]: 5 }}>
                  <Sheet flush title={t(isStudent ? 'today.forYou' : 'today.tools')}>
                    <ul className="rows">
                      {side.map((item) => (
                        <ItemRow key={item.key} item={item} />
                      ))}
                    </ul>
                  </Sheet>
                </div>
              ) : null}
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}
