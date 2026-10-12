import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EARN } from '../../../shared/rewards.mjs';
import {
  ArrowRight, ArrowLeft, CalendarBlank, CalendarCheck, ChatsCircle, CheckCircle, MagnifyingGlass, MapPin, NavigationArrow, QrCode,
  SealCheck, UsersThree, Warning,
} from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { useClock } from '@/lib/clock';
import { useFocus } from '@/lib/focus';
import { cx, fmtDate, fmtDay, fmtRelative, fmtTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { openScanner } from '@/lib/scan';
import { useSession } from '@/lib/session';
import { Avatar, Button, Chip, Empty, Field, Loaded, MoreLink, PageHeader, SectionHead, Segmented, Sheet } from '@/ui/kit';
import { Dialog, toast, useAction } from '@/ui/overlay';
import { Scanner } from '@/ui/Scanner';

export interface Club {
  id: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  category: string;
  color: string;
  my_membership: { status: string; role: string; note?: string | null } | null;
  member_count: number;
  upcoming_events: number;
  tracks: string[];
  profile: { tagline_en: string; tagline_ar: string; tags: Array<{ key: string; en: string; ar: string }>; meets_en: string; meets_ar: string; join_policy: 'open' | 'approval'; join_question_en: string | null; join_question_ar: string | null; founded: string; audience: string };
  officers: Array<{ user_id: string; role: string; title_en: string | null; title_ar: string | null; name_en: string; name_ar: string; avatar_color: string }>;
  following: boolean;
  follower_count: number;
  next_event: { id: string; title_en: string; title_ar: string; start_at: string } | null;
  posts_this_week: number;
  is_lead: boolean;
  for_you?: { score: number; reasons: Array<{ key: string; params: Record<string, string | number> }> } | null;
  events?: CampusEvent[];
}

export interface CampusEvent {
  id: string;
  club_id: string | null;
  kind: 'club' | 'university' | 'external' | 'personal';
  title_en: string;
  title_ar: string;
  description_en: string | null;
  start_at: string;
  end_at: string;
  location_id: string | null;
  capacity: number | null;
  organizer: string | null;
  deadline: string | null;
  eligibility: string | null;
  demo_label: boolean;
  status: string;
  club: { id: string; name_en: string; name_ar: string; color: string } | null;
  venue_label: string | null;
  going_count: number;
  waitlist_count: number;
  remaining: number | null;
  full: boolean;
  my_rsvp: { status: string } | null;
  /** Only present on the event list and detail, not on events embedded in other payloads. */
  /** Calendar entries the event overlaps; the API wraps each one with how long the overlap is. */
  conflicts?: Array<{ entry: { id: string; title: string; start_at: string }; isClass?: boolean; overlapMinutes?: number }>;
  is_past: boolean;
  map_link: string | null;
  checkin?: { open: boolean; opens_at: string; closes_at: string; checked_in: { at: string; method?: string } | string | null; count: number; code: string; is_organiser?: boolean } | null;
}

function ClubMark({ club, size = 40 }: { club: Pick<Club, 'name_en' | 'color'>; size?: number }) {
  return (
    <span aria-hidden className="inline-grid flex-none place-items-center rounded-[10px] font-bold text-white" style={{ width: size, height: size, background: club.color, fontSize: size * 0.4, fontStretch: '85%' }}>
      {club.name_en.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
    </span>
  );
}

/** The date block of an event, set like a platform sign. */
function DateBlock({ at }: { at: string }) {
  const { locale } = useI18n();
  return (
    <span className="grid w-12 flex-none place-items-center rounded-[10px] bg-surface-2 py-1.5 text-center leading-none">
      <span className="t-label text-[0.625rem]!">{fmtDate(at, locale, { weekday: 'short', day: undefined, month: undefined, year: undefined })}</span>
      <span className="fig mt-1 text-xl">{fmtDate(at, locale, { day: 'numeric', month: undefined, year: undefined })}</span>
      <span className="t-label mt-0.5 text-[0.625rem]!">{fmtDate(at, locale, { month: 'short', day: undefined, year: undefined })}</span>
    </span>
  );
}

export function EventRow({ e }: { e: CampusEvent }) {
  const { t, l, locale } = useI18n();
  return (
    <li>
      <Link to={`/campus/events/${e.id}`} className="row items-start! py-3.5!">
        <DateBlock at={e.start_at} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip variant="outline">{t(`campus.events.${e.kind}`)}</Chip>
            {e.my_rsvp?.status === 'going' ? <Chip tone="green">{t('status.going')}</Chip> : null}
            {e.my_rsvp?.status === 'waitlisted' ? <Chip tone="yellow">{t('status.waitlisted')}</Chip> : null}
            {e.conflicts?.length ? (
              <Chip tone="red">
                <Warning size={11} weight="fill" />
                {t('common.conflict')}
              </Chip>
            ) : null}
          </span>
          <span className="mt-1 block font-semibold" dir="auto">
            {l(e.title_en, e.title_ar)}
          </span>
          <span className="t-meta block">
            {fmtTime(e.start_at, locale)} – {fmtTime(e.end_at, locale)}
            {e.venue_label ? ` · ${e.venue_label}` : ''}
            {e.club ? ` · ${l(e.club.name_en, e.club.name_ar)}` : ''}
          </span>
          <span className="t-meta block num">
            {e.going_count ?? 0} {t('campus.events.going')}
            {e.capacity ? ` · ${e.full ? t('campus.events.full') : t('campus.events.seatsLeft', { n: e.remaining ?? 0 })}` : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}

function membershipChip(club: Club, t: (k: string) => string) {
  const s = club.my_membership?.status;
  if (s === 'active') return <Chip tone="green">{t(club.is_lead ? 'campus.clubs.lead' : 'campus.clubs.member')}</Chip>;
  if (s === 'pending') return <Chip tone="yellow">{t('campus.clubs.pending')}</Chip>;
  if (club.following) return <Chip tone="blue">{t('campus.clubs.following')}</Chip>;
  return null;
}

/* ── Campus Life hub ── */

export function HubPage() {
  const { t, l, locale, rtl } = useI18n();
  useTitle(t('campus.hub.title'));
  const { now } = useClock();
  const clubs = useApi<Club[]>('/campus/clubs');
  const events = useApi<CampusEvent[]>('/campus/events');
  const summary = useApi<{ posts_today: number; authors: Array<{ id: string; name_en: string; avatar_color: string }>; latest: { body: string; author: { name_en: string; name_ar: string; avatar_color: string }; created_at: string } | null; unread_messages: number }>('/campus/community/summary');
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const upcoming = (events.data ?? []).filter((e) => !e.is_past && e.kind !== 'personal').sort((a, b) => a.start_at.localeCompare(b.start_at));
  const mine = (clubs.data ?? []).filter((c) => c.my_membership && ['active', 'pending'].includes(c.my_membership.status));
  const suggested = (clubs.data ?? []).filter((c) => !c.my_membership && c.for_you).sort((a, b) => (b.for_you?.score ?? 0) - (a.for_you?.score ?? 0)).slice(0, 3);
  const going = upcoming.filter((e) => e.my_rsvp?.status === 'going').length;
  // Focus can take any block of this page away; what stays takes the room.
  const focus = useFocus();
  const showEvents = focus.shows('campus:events');
  const showClubs = focus.shows('campus:clubs');
  const showDiscover = suggested.length > 0 && focus.shows('campus:discover');
  const showSide = showClubs || showDiscover;

  return (
    <div data-tone="orange">
      <PageHeader
        title={t('campus.hub.title')}
        subtitle={t('campus.hub.subtitle')}
      />
      <p className="mb-5 font-medium">
        {[t('campus.hub.inClubs', { n: mine.filter((c) => c.my_membership?.status === 'active').length }), t('campus.hub.goingTo', { n: going }), t('campus.hub.upcomingN', { n: upcoming.length })].join(' · ')}
      </p>

      {focus.shows('campus:community') ? (
      <section className="plate mb-7 grid gap-x-10 gap-y-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <h2 className="t-page">{t('social.entry.heading')}</h2>
          <p className="mt-2 max-w-[52ch] text-plate-muted">{t('social.entry.body')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link to="/campus/community" className="btn btn-primary">
              {t('social.entry.cta')}
              <Arrow size={15} weight="bold" />
            </Link>
            {summary.data?.unread_messages ? (
              <Link to="/campus/community/messages" className="btn btn-secondary">
                <ChatsCircle size={16} />
                {t('social.entry.unread', { n: summary.data.unread_messages })}
              </Link>
            ) : null}
          </div>
        </div>
        {summary.data?.latest ? (
          <Link to="/campus/community" className="block rounded-xl bg-plate-2 p-4 transition-opacity hover:opacity-90">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-2 rtl:space-x-reverse">
                {summary.data.authors.slice(0, 4).map((a) => (
                  <Avatar key={a.id} name={a.name_en} color={a.avatar_color} size={26} className="ring-2 ring-(--plate-2)" />
                ))}
              </div>
              <span className="t-meta">{t('social.entry.today', { n: summary.data.posts_today })}</span>
            </div>
            <p className="mt-3 line-clamp-3" dir="auto">
              {summary.data.latest.body}
            </p>
            <p className="t-meta mt-2">
              {l(summary.data.latest.author.name_en, summary.data.latest.author.name_ar)} · {fmtRelative(summary.data.latest.created_at, now, locale)}
            </p>
          </Link>
        ) : null}
      </section>
      ) : null}

      <div className={cx('grid items-start gap-6', showEvents && showSide && 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]')}>
        {showEvents ? (
        <Sheet flush title={t('campus.hub.upcoming')} action={<MoreLink to="/campus/events">{t('campus.hub.allEvents')}</MoreLink>}>
          <Loaded q={events} skeleton={<div className="p-4.5"><div className="skeleton h-40" /></div>}>
            {() => (upcoming.length ? <ul className="rows">{upcoming.slice(0, 5).map((e) => <EventRow key={e.id} e={e} />)}</ul> : <Empty icon={<CalendarBlank size={22} />} title={t('campus.events.none')} />)}
          </Loaded>
        </Sheet>
        ) : null}

        {showSide ? (
        <div className="space-y-6">
          {showClubs ? (
          <Sheet flush title={t('campus.hub.myClubs')} action={<MoreLink to="/campus/clubs">{t('campus.hub.browseClubs')}</MoreLink>}>
            {mine.length ? (
              <ul className="rows">
                {mine.map((c) => (
                  <li key={c.id}>
                    <Link to={`/campus/clubs/${c.id}`} className="row">
                      <ClubMark club={c} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{l(c.name_en, c.name_ar)}</span>
                        <span className="t-meta block">
                          {t('campus.clubs.memberCount', { n: c.member_count })} · {t('campus.clubs.upcomingCount', { n: c.upcoming_events })}
                        </span>
                      </span>
                      {membershipChip(c, t)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4.5 py-5 text-ink-2">{t('campus.hub.noClubs')}</p>
            )}
          </Sheet>
          ) : null}
          {showDiscover ? (
            <Sheet flush title={t('campus.hub.discover')}>
              <ul className="rows">
                {suggested.map((c) => (
                  <li key={c.id}>
                    <Link to={`/campus/clubs/${c.id}`} className="row">
                      <ClubMark club={c} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{l(c.name_en, c.name_ar)}</span>
                        <span className="t-meta block truncate">{c.for_you?.reasons[0] ? t(c.for_you.reasons[0].key, { ...c.for_you.reasons[0].params, list: locale === 'ar' ? c.for_you.reasons[0].params.list_ar : c.for_you.reasons[0].params.list_en }) : l(c.profile.tagline_en, c.profile.tagline_ar)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Sheet>
          ) : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Clubs ── */

export function ClubsPage() {
  const { t, l } = useI18n();
  useTitle(t('campus.clubs.title'));
  const q = useApi<Club[]>('/campus/clubs');
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  return (
    <div data-tone="orange">
      <PageHeader crumbs={[{ label: t('campus.hub.title'), to: '/campus' }, { label: t('campus.clubs.title') }]} title={t('campus.clubs.title')} subtitle={t('campus.clubs.subtitle')} />
      <Loaded q={q}>
        {(clubs) => {
          const categories = [...new Set(clubs.map((c) => c.category))];
          const needle = text.trim().toLowerCase();
          const list = clubs.filter((c) => (!category || c.category === category) && (!needle || [c.name_en, c.name_ar, c.description_en, ...c.profile.tags.map((x) => x.en)].join(' ').toLowerCase().includes(needle)));
          return (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="relative min-w-56 flex-1">
                  <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
                  <input className="input ps-9" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('campus.clubs.searchPlaceholder')} aria-label={t('campus.clubs.search')} />
                </div>
                <div className="scroll-x flex gap-1.5" role="group" aria-label={t('campus.clubs.categoriesLabel')}>
                  {['', ...categories].map((c) => (
                    <button key={c || 'all'} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={cx('chip h-8! flex-none px-3!', category === c ? 'chip-solid' : 'chip-outline hover:bg-surface-2')} data-tone={category === c ? 'orange' : undefined}>
                      {c ? t(`campus.clubs.categories.${c}`) : t('campus.clubs.allClubs')}
                    </button>
                  ))}
                </div>
              </div>
              {list.length ? (
                <ul className="sheet rows overflow-hidden">
                  {list.map((c) => (
                    <li key={c.id}>
                      <Link to={`/campus/clubs/${c.id}`} className="row items-start! py-4!">
                        <ClubMark club={c} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="t-lead">{l(c.name_en, c.name_ar)}</span>
                            {membershipChip(c, t)}
                          </span>
                          <span className="mt-0.5 block text-ink-2">{l(c.profile.tagline_en, c.profile.tagline_ar)}</span>
                          <span className="t-meta mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>{t(`campus.clubs.categories.${c.category}`)}</span>
                            <span>{t('campus.clubs.memberCount', { n: c.member_count })}</span>
                            <span>{t('campus.clubs.upcomingCount', { n: c.upcoming_events })}</span>
                            {c.next_event ? <span className="font-medium text-ink">{t('campus.clubs.nextEvent', { title: l(c.next_event.title_en, c.next_event.title_ar) })}</span> : null}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Sheet>
                  <Empty icon={<UsersThree size={22} />} title={t('campus.clubs.noMatch')} body={t('campus.clubs.noMatchBody')} />
                </Sheet>
              )}
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

export function ClubPage() {
  const { id } = useParams();
  const { t, l } = useI18n();
  const q = useApi<Club>(id ? `/campus/clubs/${id}` : null);
  const [joining, setJoining] = useState(false);
  const [answer, setAnswer] = useState('');
  const { busy, run } = useAction();
  useTitle(q.data ? l(q.data.name_en, q.data.name_ar) : t('campus.clubs.title'));
  const act = (key: string, fn: () => Promise<unknown>, ok?: string) =>
    void run(key, async () => {
      await fn();
      refreshAll();
    }, ok);

  return (
    <Loaded q={q}>
      {(c) => {
        const status = c.my_membership?.status;
        const open = c.profile.join_policy === 'open';
        const upcoming = (c.events ?? []).filter((e) => !e.is_past).sort((a, b) => a.start_at.localeCompare(b.start_at));
        const past = (c.events ?? []).filter((e) => e.is_past).sort((a, b) => b.start_at.localeCompare(a.start_at));
        return (
          <div data-tone="orange">
            <PageHeader
              crumbs={[{ label: t('campus.hub.title'), to: '/campus' }, { label: t('campus.clubs.title'), to: '/campus/clubs' }, { label: l(c.name_en, c.name_ar) }]}
              title={
                <span className="flex items-center gap-3.5">
                  <ClubMark club={c} size={52} />
                  {l(c.name_en, c.name_ar)}
                </span>
              }
              subtitle={l(c.profile.tagline_en, c.profile.tagline_ar)}
              actions={
                <>
                  {status === 'active' ? (
                    <Button busy={busy === 'leave'} onClick={() => act('leave', () => api(`/campus/clubs/${c.id}/leave`, { method: 'POST', body: {} }), t('campus.clubs.left'))}>
                      {t('campus.clubs.leave')}
                    </Button>
                  ) : status === 'pending' ? (
                    <Chip tone="yellow">{t('campus.clubs.pending')}</Chip>
                  ) : (
                    <>
                      <Button busy={busy === 'follow'} onClick={() => act('follow', () => api(`/campus/clubs/${c.id}/follow`, c.following ? { method: 'DELETE' } : { method: 'POST', body: {} }), t(c.following ? 'campus.clubs.unfollowed' : 'campus.clubs.followed'))}>
                        {t(c.following ? 'campus.clubs.following' : 'campus.clubs.follow')}
                      </Button>
                      <Button variant="primary" onClick={() => setJoining(true)}>
                        {t(open ? 'campus.clubs.joinOpen' : 'campus.clubs.join')}
                      </Button>
                    </>
                  )}
                </>
              }
            />
            <div className="mb-6 flex flex-wrap gap-1.5">
              {membershipChip(c, t)}
              <Chip variant="outline">{t(`campus.clubs.categories.${c.category}`)}</Chip>
              <Chip variant="outline">{t('campus.clubs.memberCount', { n: c.member_count })}</Chip>
              <Chip variant="outline">{t('campus.clubs.followers', { n: c.follower_count })}</Chip>
              <Chip variant="outline">{t('campus.clubs.activeWeek', { n: c.posts_this_week })}</Chip>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <Sheet flush title={t('campus.clubs.events')}>
                  {upcoming.length ? <ul className="rows">{upcoming.map((e) => <EventRow key={e.id} e={e} />)}</ul> : <p className="px-4.5 py-5 text-ink-2">{t('campus.events.none')}</p>}
                </Sheet>
                {past.length ? (
                  <Sheet flush title={t('campus.clubs.pastEvents')}>
                    <ul className="rows">{past.slice(0, 4).map((e) => <EventRow key={e.id} e={e} />)}</ul>
                  </Sheet>
                ) : null}
              </div>
              <div className="space-y-6">
                <Sheet title={t('campus.clubs.tab.about')}>
                  <p className="text-ink-2">{l(c.description_en, c.description_ar)}</p>
                  <dl className="mt-4 space-y-2.5">
                    {[
                      [t('campus.clubs.meets'), l(c.profile.meets_en, c.profile.meets_ar)],
                      [t('campus.clubs.founded'), c.profile.founded],
                      [t('campus.clubs.audience'), t(`campus.clubs.audience.${c.profile.audience}`)],
                      [t('campus.clubs.join'), t(`campus.clubs.policy.${c.profile.join_policy}`)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <dt className="t-label w-24 flex-none pt-0.5">{k}</dt>
                        <dd className="min-w-0">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {c.tracks.length ? (
                    <div className="mt-4">
                      <p className="t-label mb-1.5">{t('campus.clubs.tracks')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {c.tracks.map((x) => (
                          <Chip key={x} tone="orange">
                            {x}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Sheet>
                <Sheet flush title={t('campus.clubs.officers')}>
                  <ul className="rows">
                    {c.officers.map((o) => (
                      <li key={o.user_id} className="row">
                        <Avatar name={o.name_en} color={o.avatar_color} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{l(o.name_en, o.name_ar)}</span>
                          <span className="t-meta block">{o.title_en ? l(o.title_en, o.title_ar) : t(`campus.clubs.role.${o.role}`)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Sheet>
                {c.is_lead ? (
                  <Link to="/staff/campus/clubs" className="btn btn-secondary w-full">
                    {t('campus.clubs.manage')}
                  </Link>
                ) : null}
              </div>
            </div>

            <Dialog
              open={joining}
              onClose={() => setJoining(false)}
              title={t('campus.clubs.joinTitle', { club: l(c.name_en, c.name_ar) })}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setJoining(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    busy={busy === 'join'}
                    onClick={() =>
                      void run('join', async () => {
                        await api(`/campus/clubs/${c.id}/join`, { method: 'POST', body: answer.trim() ? { answer: answer.trim() } : {} });
                        toast.ok(t(open ? 'campus.clubs.joined' : 'campus.clubs.requestSent'));
                        setJoining(false);
                        setAnswer('');
                        refreshAll();
                      })
                    }
                  >
                    {t(open ? 'campus.clubs.joinOpen' : 'campus.clubs.sendRequest')}
                  </Button>
                </>
              }
            >
              <p className="mb-4 text-ink-2">{t(open ? 'campus.clubs.joinOpenNote' : 'campus.clubs.joinApprovalNote')}</p>
              {c.profile.join_question_en ? (
                <Field label={l(c.profile.join_question_en, c.profile.join_question_ar)} hint={t('campus.clubs.joinAnswer')}>
                  {(p) => <textarea {...p} className="textarea" value={answer} onChange={(e) => setAnswer(e.target.value)} />}
                </Field>
              ) : null}
            </Dialog>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Events ── */

export function EventsPage() {
  const { t } = useI18n();
  useTitle(t('campus.events.title'));
  const q = useApi<CampusEvent[]>('/campus/events');
  const [params, setParams] = useSearchParams();
  const filter = params.get('kind') ?? 'all';
  return (
    <div data-tone="orange">
      <PageHeader crumbs={[{ label: t('campus.hub.title'), to: '/campus' }, { label: t('campus.events.title') }]} title={t('campus.events.title')}
        subtitle={t('campus.events.subtitle')}
        actions={
          <Button variant="primary" onClick={openScanner}>
            <QrCode size={17} />
            {t('scan.earn')}
          </Button>
        }
      />
      <Loaded q={q}>
        {(events) => {
          const upcoming = events.filter((e) => !e.is_past).sort((a, b) => a.start_at.localeCompare(b.start_at));
          const list = upcoming.filter((e) => (filter === 'all' ? true : filter === 'mine' ? !!e.my_rsvp : e.kind === filter));
          return (
            <>
              <div className="scroll-x mb-5">
                <Segmented
                  label={t('common.filter')}
                  value={filter}
                  onChange={(v) => setParams(v === 'all' ? {} : { kind: v }, { replace: true })}
                  options={(['all', 'mine', 'club', 'university', 'external'] as const).map((k) => ({ value: k, label: t(`campus.events.${k}`) }))}
                />
              </div>
              {list.length ? (
                <ul className="sheet rows overflow-hidden">{list.map((e) => <EventRow key={e.id} e={e} />)}</ul>
              ) : (
                <Sheet>
                  <Empty icon={<CalendarBlank size={22} />} title={t('campus.events.none')} />
                </Sheet>
              )}
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

export function EventPage() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const q = useApi<CampusEvent>(id ? `/campus/events/${id}` : null);
  const [code, setCode] = useState('');
  const { busy, run } = useAction();
  useTitle(q.data ? l(q.data.title_en, q.data.title_ar) : t('campus.events.title'));
  const act = (key: string, fn: () => Promise<unknown>) =>
    void run(key, async () => {
      await fn();
      refreshAll();
    });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [scanning, setScanning] = useState(false);

  /** Check in from whatever was read: the poster's link, the older uj:checkin: form, or the bare code. */
  const checkIn = (raw: string, event: CampusEvent) => {
    const text = raw.trim();
    const scheme = /^uj:checkin:([^:]+):([A-Za-z0-9]+)$/.exec(text);
    const link = /\/campus\/events\/([^/?#]+)\?(?:[^#]*&)?checkin=([A-Za-z0-9]+)/.exec(text);
    const eventId = scheme?.[1] ?? link?.[1] ?? event.id;
    const value = (scheme?.[2] ?? link?.[2] ?? text).toUpperCase();
    if (decodeURIComponent(eventId) !== event.id) return navigate(`/campus/events/${eventId}?checkin=${value}`);
    act('checkin', async () => {
      // Scanning at the door counts as coming: book the seat first if the student had not.
      if (!event.my_rsvp) await api(`/campus/events/${event.id}/rsvp`, { method: 'POST', body: {} }).catch(() => undefined);
      await api(`/campus/events/${event.id}/checkin`, { method: 'POST', body: { code: value } });
      toast.ok(t('campus.checkin.doneToast'));
    });
  };

  // A phone camera that scans the poster opens this page with the code in the address.
  const linkCode = params.get('checkin');
  const tried = useRef<string | null>(null);
  useEffect(() => {
    const event = q.data;
    if (!linkCode || !event?.checkin || tried.current === linkCode) return;
    tried.current = linkCode;
    setParams({}, { replace: true });
    if (event.checkin.checked_in) return;
    if (!event.checkin.open) return void toast.info(t('campus.checkin.closed'));
    checkIn(linkCode, event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode, q.data]);

  return (
    <Loaded q={q}>
      {(e) => {
        const rsvp = e.my_rsvp?.status;
        return (
          <div data-tone="orange">
            <Scanner
              open={scanning}
              onClose={() => setScanning(false)}
              title={t('campus.checkin.scan')}
              hint={t('campus.checkin.body')}
              onRead={(text) => {
                setScanning(false);
                checkIn(text, e);
              }}
            />
            <PageHeader
              crumbs={[{ label: t('campus.hub.title'), to: '/campus' }, { label: t('campus.events.title'), to: '/campus/events' }, { label: l(e.title_en, e.title_ar) }]}
              title={l(e.title_en, e.title_ar)}
              subtitle={e.club ? l(e.club.name_en, e.club.name_ar) : e.organizer}
            />
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <section className="plate px-5 py-5">
                  <div className="flex flex-wrap items-end justify-between gap-5">
                    <div>
                      <p className="t-label">{t('campus.events.when')}</p>
                      <p className="mt-1.5 flex items-baseline gap-2.5">
                        <span className="fig text-[2.5rem]">{fmtDate(e.start_at, locale, { day: 'numeric', month: 'short', year: undefined })}</span>
                        <span className="t-title">{fmtDate(e.start_at, locale, { weekday: 'long', day: undefined, month: undefined, year: undefined })}</span>
                      </p>
                      <p className="mt-1 text-plate-muted num">
                        {fmtTime(e.start_at, locale)} – {fmtTime(e.end_at, locale)}
                        {e.venue_label ? ` · ${e.venue_label}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {e.is_past ? (
                        <Chip variant="outline">{t('campus.events.pastEvent')}</Chip>
                      ) : rsvp ? (
                        <Button busy={busy === 'rsvp'} onClick={() => act('rsvp', async () => { await api(`/campus/events/${e.id}/rsvp`, { method: 'DELETE' }); toast.info(t('campus.events.rsvpCancelled')); })}>
                          {t('campus.events.cancelRsvp')}
                        </Button>
                      ) : (
                        <Button variant="primary" busy={busy === 'rsvp'} onClick={() => act('rsvp', async () => { const r = await api<{ rsvp: { status: string } }>(`/campus/events/${e.id}/rsvp`, { method: 'POST', body: {} }); toast.ok(t(r.rsvp.status === 'going' ? 'campus.events.rsvpDone' : 'campus.events.rsvpWaitlisted')); })}>
                          <CalendarCheck size={16} weight="fill" />
                          {t(e.full ? 'campus.events.joinWaitlist' : 'campus.events.rsvp')}
                        </Button>
                      )}
                      {e.map_link ? (
                        <Link to={e.map_link} className="btn btn-secondary">
                          <NavigationArrow size={15} weight="fill" />
                          {t('campus.events.route')}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  {rsvp ? (
                    <p className="mt-4 flex items-center gap-2 border-t border-plate-rule pt-3.5 font-semibold">
                      <CheckCircle size={17} weight="fill" className="text-green" />
                      {t(rsvp === 'going' ? 'campus.events.rsvpDone' : 'campus.events.rsvpWaitlisted')}
                    </p>
                  ) : null}
                </section>

                {e.conflicts?.length ? (
                  <Sheet tone="red" title={t('campus.events.conflict')}>
                    <p className="text-ink-2">{t('campus.events.conflictBody')}</p>
                    <ul className="mt-3 space-y-1.5">
                      {(e.conflicts ?? []).map((c) => (
                        <li key={c.entry.id} className="flex items-center gap-2 font-medium">
                          <span className="dot" />
                          {c.entry.title} · <span className="num text-ink-2">{fmtTime(c.entry.start_at, locale)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="t-meta mt-3">{t('campus.events.attendanceNote')}</p>
                  </Sheet>
                ) : !e.is_past ? (
                  <p className="flex items-center gap-2 text-green-ink">
                    <CheckCircle size={17} weight="fill" />
                    {t('campus.events.noConflict')}
                  </p>
                ) : null}

                {e.description_en ? (
                  <Sheet title={t('campus.events.description')}>
                    <p className="prose-sm">{e.description_en}</p>
                  </Sheet>
                ) : null}
              </div>

              <div className="space-y-6">
                <Sheet title={t('common.details')}>
                  <dl className="space-y-3">
                    {[
                      [t('campus.events.organizer'), e.organizer ?? '—'],
                      [t('campus.events.capacity'), e.capacity ? `${e.going_count} / ${e.capacity}` : t('campus.events.unlimited')],
                      e.deadline ? [t('campus.events.deadline'), fmtDay(e.deadline, locale)] : null,
                      e.eligibility ? [t('campus.events.eligibility'), e.eligibility] : null,
                    ]
                      .filter((x): x is string[] => !!x)
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt className="t-label">{k}</dt>
                          <dd className="mt-0.5">{v}</dd>
                        </div>
                      ))}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Chip variant="outline">{t(`campus.events.${e.kind}`)}</Chip>
                    {e.demo_label ? <Chip tone="yellow">{t('campus.events.demoListing')}</Chip> : null}
                    {e.full ? <Chip tone="red">{t('campus.events.full')}</Chip> : null}
                  </div>
                </Sheet>

                {e.checkin && (e.checkin.open || e.checkin.checked_in || rsvp === 'going') ? (
                  <Sheet
                    title={t('campus.checkin.title')}
                    action={
                      e.checkin.code ? (
                        <Link to={`/campus/events/${e.id}/poster`} className="btn btn-ghost btn-sm">
                          <QrCode size={15} />
                          {t('campus.checkin.poster')}
                        </Link>
                      ) : undefined
                    }
                  >
                    {e.checkin.checked_in ? (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <p className="flex items-center gap-2 font-semibold text-green-ink">
                          <SealCheck size={18} weight="fill" />
                          {t('campus.checkin.done', { time: fmtTime(typeof e.checkin.checked_in === 'string' ? e.checkin.checked_in : e.checkin.checked_in.at, locale) })}
                        </p>
                        <Chip tone="orange">+{EARN.verified} {t('rw.name')}</Chip>
                      </div>
                    ) : e.checkin.open ? (
                      <>
                        <p className="text-ink-2">{t('campus.checkin.body')}</p>
                        <Button variant="primary" size="lg" className="mt-3 w-full" busy={busy === 'checkin'} onClick={() => setScanning(true)}>
                          <QrCode size={18} />
                          {t('campus.checkin.scan')}
                        </Button>
                        <form
                          className="mt-3 flex gap-2"
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            checkIn(code, e);
                          }}
                        >
                          <input className="input t-code" value={code} onChange={(ev) => setCode(ev.target.value.toUpperCase())} placeholder={t('campus.checkin.enterCode')} aria-label={t('campus.checkin.enterCode')} dir="ltr" />
                          <Button type="submit" busy={busy === 'checkin'} disabled={!code.trim()}>
                            {t('campus.checkin.confirm')}
                          </Button>
                        </form>
                      </>
                    ) : (
                      <p className="text-ink-2">{new Date(e.checkin.opens_at) > new Date() || !e.is_past ? t('campus.checkin.opens', { time: `${fmtDay(e.checkin.opens_at, locale)} ${fmtTime(e.checkin.opens_at, locale)}` }) : t('campus.checkin.closed')}</p>
                    )}
                    <p className="t-meta mt-2">{t('campus.checkin.count', { n: e.checkin.count })}</p>
                  </Sheet>
                ) : null}
                {e.location_id ? (
                  <Link to={`/campus/map?to=${e.location_id}`} className="link inline-flex items-center gap-1.5">
                    <MapPin size={15} weight="fill" />
                    {t('common.showOnMap')}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}
