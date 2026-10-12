import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarBlank, ChatCircle, ChatsCircle, Heart, MagnifyingGlass, PaperPlaneRight, PushPin, UsersThree } from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { addDays, useClock } from '@/lib/clock';
import { cx, fmtDate, fmtRelative, fmtTime } from '@/lib/format';
import { useDebounced, useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Avatar, Button, Chip, Empty, Field, Loaded, PageHeader, Segmented, Sheet, Switch } from '@/ui/kit';
import { toast, useAction } from '@/ui/overlay';
import { type CampusEvent, EventRow } from './Hub';

interface Author {
  id: string;
  name_en: string;
  name_ar: string;
  avatar_color: string;
  role?: string | null;
  title_en?: string | null;
  title_ar?: string | null;
}

interface Post {
  type: 'club' | 'social';
  id: string;
  club_id: string | null;
  kind: string;
  body: string;
  created_at: string;
  pinned: boolean;
  author: Author;
  event: { id: string; title_en: string; title_ar: string; start_at: string } | null;
  club: { id: string; name_en: string; name_ar: string; color: string } | null;
  reactions: number;
  reacted: boolean;
  comments: Array<{ id: string; body: string; created_at: string; author: Author; is_answer: boolean }>;
  poll: { total: number; my_vote: string | null; options: Array<{ id: string; label: string; votes: number | null }> } | null;
  can: { comment: boolean; react: boolean; vote: boolean };
}

const postUrl = (p: Post) => (p.type === 'social' ? `/campus/community/posts/${p.id}` : `/campus/clubs/${p.club_id}/posts/${p.id}`);

function PostCard({ post: initial }: { post: Post }) {
  const { t, l, locale } = useI18n();
  const { now } = useClock();
  const [post, setPost] = useState(initial);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const { busy, run } = useAction();
  useEffect(() => setPost(initial), [initial]);

  const react = () => {
    setPost((p) => ({ ...p, reacted: !p.reacted, reactions: p.reactions + (p.reacted ? -1 : 1) }));
    api<{ reacted: boolean; count: number }>(`${postUrl(post)}/react`, { method: 'POST', body: {} })
      .then((r) => setPost((p) => ({ ...p, reacted: r.reacted, reactions: r.count })))
      .catch((e) => toast.error(e));
  };

  const voted = post.poll?.options.some((o) => o.votes !== null);

  return (
    <article className="px-4.5 py-4">
      <header className="flex items-start gap-3">
        <Link to={`/campus/community/people/${post.author.id}`} className="flex-none">
          <Avatar name={post.author.name_en} color={post.author.avatar_color} size={38} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link to={`/campus/community/people/${post.author.id}`} className="font-semibold hover:underline">
              {l(post.author.name_en, post.author.name_ar)}
            </Link>
            {post.author.title_en ? <Chip tone="orange">{l(post.author.title_en, post.author.title_ar)}</Chip> : null}
            {post.kind !== 'social' && post.kind !== 'discussion' ? <Chip variant="outline">{t(`community.kind.${post.kind}`)}</Chip> : null}
            {post.pinned ? (
              <Chip variant="outline">
                <PushPin size={11} weight="fill" />
                {t('community.pinned')}
              </Chip>
            ) : null}
          </p>
          <p className="t-meta">
            {post.club ? (
              <>
                <Link to={`/campus/clubs/${post.club.id}`} className="font-medium hover:underline">
                  {l(post.club.name_en, post.club.name_ar)}
                </Link>{' '}
                ·{' '}
              </>
            ) : null}
            {fmtRelative(post.created_at, now, locale)}
          </p>
        </div>
      </header>

      {post.poll ? (
        <fieldset className="mt-3">
          <legend className="mb-2.5 max-w-[68ch] leading-relaxed" dir="auto">
            {post.body}
          </legend>
          <div className="space-y-1.5">
            {post.poll.options.map((o) => {
              const pct = voted && post.poll!.total ? Math.round(((o.votes ?? 0) / post.poll!.total) * 100) : 0;
              const mine = post.poll!.my_vote === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={!post.can.vote || busy === 'vote'}
                  onClick={() => void run('vote', async () => setPost(await api<Post>(`/campus/clubs/${post.club_id}/posts/${post.id}/vote`, { method: 'POST', body: { option_id: o.id } })))}
                  className={cx('relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-[9px] border px-3 py-2 text-start transition-colors', mine ? 'border-orange' : 'border-rule-strong enabled:hover:bg-surface-2')}
                >
                  {voted ? <span className="absolute inset-y-0 start-0 bg-orange-tint" style={{ width: `${pct}%` }} /> : null}
                  <span className="relative font-medium">{o.label}</span>
                  {voted ? <span className="relative t-code text-[0.8125rem]">{pct}%</span> : null}
                </button>
              );
            })}
          </div>
          <p className="t-meta mt-2">
            {t('community.pollVotes', { n: post.poll.total })}
            {!voted ? ` · ${t('community.pollVoteToSee')}` : ''}
          </p>
        </fieldset>
      ) : (
        <p className="mt-3 max-w-[68ch] leading-relaxed whitespace-pre-line" dir="auto">
          {post.body}
        </p>
      )}

      {post.event ? (
        <Link to={`/campus/events/${post.event.id}`} className="mt-3 flex items-center gap-3 rounded-[10px] bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface-3">
          <CalendarBlank size={18} className="flex-none text-orange-ink" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{l(post.event.title_en, post.event.title_ar)}</span>
            <span className="t-meta block num">
              {fmtDate(post.event.start_at, locale, { weekday: 'short' })} · {fmtTime(post.event.start_at, locale)}
            </span>
          </span>
          <span className="link flex-none text-[0.8125rem]">{t('community.eventCta')}</span>
        </Link>
      ) : null}

      <div className="mt-3 flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-pressed={post.reacted} disabled={!post.can.react} onClick={react} className={post.reacted ? 'text-red-ink!' : undefined}>
          <Heart size={16} weight={post.reacted ? 'fill' : 'regular'} />
          {t('community.helpfulCount', { n: post.reactions })}
        </Button>
        <Button size="sm" variant="ghost" disabled={!post.can.comment} aria-expanded={replying} onClick={() => setReplying((r) => !r)}>
          <ChatCircle size={16} />
          {t('community.replies', { n: post.comments.length })}
        </Button>
      </div>

      {post.comments.length || replying ? (
        <div className="mt-2 space-y-3 border-s-2 border-rule ps-4">
          {post.comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar name={c.author.name_en} color={c.author.avatar_color} size={26} />
              <div className="min-w-0">
                <p className="text-[0.8125rem]">
                  <span className="font-semibold">{l(c.author.name_en, c.author.name_ar)}</span> <span className="text-ink-2">· {fmtRelative(c.created_at, now, locale)}</span>
                  {c.is_answer ? <Chip tone="green" className="ms-2">{t('community.acceptedAnswer')}</Chip> : null}
                </p>
                <p dir="auto">{c.body}</p>
              </div>
            </div>
          ))}
          {replying ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reply.trim()) return;
                void run('reply', async () => {
                  const next = await api<Post>(`${postUrl(post)}/comments`, { method: 'POST', body: { body: reply.trim() } });
                  setPost((p) => ({ ...p, ...next }));
                  setReply('');
                });
              }}
            >
              <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('community.replyPlaceholder')} aria-label={t('community.reply')} autoFocus />
              <Button type="submit" variant="primary" icon busy={busy === 'reply'} disabled={!reply.trim()} aria-label={t('community.send')}>
                <PaperPlaneRight size={16} weight="fill" className="rtl:-scale-x-100" />
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/* ── Feed ── */

function FeedPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') ?? 'all';
  const campus = params.get('campus') ?? 'all';
  const q = useApi<{ items: Post[]; can_post: boolean }>('/campus/community/home', { scope, campus });
  const events = useApi<CampusEvent[]>('/campus/events');
  const people = useApi<{ items: Person[] }>('/campus/community/people');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'campus'>('all');
  const { busy, run } = useAction();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value === 'all' ? next.delete(key) : next.set(key, value);
    setParams(next, { replace: true });
  };
  const upcoming = (events.data ?? []).filter((e) => !e.is_past && (e.kind === 'club' || e.kind === 'university')).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 3);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Loaded q={q}>
          {(d) => (
            <>
              {d.can_post ? (
                <form
                  className="sheet p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!body.trim()) return;
                    void run('post', async () => {
                      await api('/campus/community/posts', { method: 'POST', body: { body: body.trim(), media_document_id: null, event_id: null, club_id: null, audience } });
                      setBody('');
                      toast.ok(t('social.compose.posted'));
                      refreshAll();
                    });
                  }}
                >
                  <div className="flex gap-3">
                    <Avatar name={user?.name_en ?? ''} color={user?.avatar_color} size={38} />
                    <textarea className="textarea min-h-[4.25rem]! flex-1" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('social.compose.placeholder')} aria-label={t('social.compose.label')} maxLength={1200} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 ps-[3.125rem]">
                    <Segmented label={t('social.compose.audience')} value={audience} onChange={setAudience} options={[{ value: 'all', label: t('social.audience.all') }, { value: 'campus', label: t('social.audience.campus') }]} />
                    <Button type="submit" variant="primary" busy={busy === 'post'} disabled={!body.trim()}>
                      {t('social.compose.post')}
                    </Button>
                  </div>
                  <p className="t-meta mt-2 ps-[3.125rem]">{t('community.guidelines')}</p>
                </form>
              ) : (
                <p className="sheet px-4.5 py-3.5 text-ink-2">{t('social.feed.readOnly')}</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Segmented label={t('social.filter.label')} value={scope} onChange={(v) => set('scope', v)} options={[{ value: 'all', label: t('social.filter.all') }, { value: 'students', label: t('social.filter.students') }, { value: 'clubs', label: t('social.filter.clubs') }]} />
                <Segmented label={t('social.filter.campus')} value={campus} onChange={(v) => set('campus', v)} options={[{ value: 'all', label: t('social.campus.all') }, { value: 'mine', label: t('social.campus.mine') }]} />
              </div>

              {d.items.length ? (
                <div className="sheet rows overflow-hidden">
                  {d.items.map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </div>
              ) : (
                <Sheet>
                  <Empty icon={<ChatsCircle size={22} />} title={t('social.feed.empty')} body={t('social.feed.emptyBody')} />
                </Sheet>
              )}
            </>
          )}
        </Loaded>
      </div>

      <aside aria-label={t('social.rail.label')} className="space-y-6">
        <Sheet flush title={t('social.rail.workshops')}>
          {upcoming.length ? <ul className="rows">{upcoming.map((e) => <EventRow key={e.id} e={e} />)}</ul> : <p className="px-4.5 py-5 text-ink-2">{t('social.events.empty')}</p>}
          <Link to="/campus/community/events" className="link block border-t border-rule px-4.5 py-3 text-[0.8125rem]">
            {t('social.rail.allEvents')}
          </Link>
        </Sheet>
        <Sheet flush title={t('social.rail.people')}>
          <ul className="rows">
            {(people.data?.items ?? []).filter((p) => !p.is_me).slice(0, 4).map((p) => (
              <PersonRow key={p.id} p={p} />
            ))}
          </ul>
          <Link to="/campus/community/people" className="link block border-t border-rule px-4.5 py-3 text-[0.8125rem]">
            {t('social.rail.allPeople')}
          </Link>
        </Sheet>
      </aside>
    </div>
  );
}

/* ── Events ── */

function CommunityEvents() {
  const { t } = useI18n();
  const { today } = useClock();
  const q = useApi<CampusEvent[]>('/campus/events');
  const [filter, setFilter] = useState<'all' | 'week' | 'going'>('all');
  return (
    <Loaded q={q}>
      {(events) => {
        const list = events
          .filter((e) => !e.is_past && e.kind !== 'personal')
          .filter((e) => (filter === 'going' ? e.my_rsvp?.status === 'going' : filter === 'week' ? e.start_at.slice(0, 10) <= addDays(today, 7) : true))
          .sort((a, b) => a.start_at.localeCompare(b.start_at));
        return (
          <div className="space-y-4">
            <p className="max-w-[70ch] text-ink-2">{t('social.events.body')}</p>
            <Segmented label={t('social.events.filter')} value={filter} onChange={setFilter} options={[{ value: 'all', label: t('social.events.all') }, { value: 'week', label: t('social.events.week') }, { value: 'going', label: t('social.events.going') }]} />
            {list.length ? (
              <ul className="sheet rows overflow-hidden">{list.map((e) => <EventRow key={e.id} e={e} />)}</ul>
            ) : (
              <Sheet>
                <Empty icon={<CalendarBlank size={22} />} title={t('social.events.empty')} />
              </Sheet>
            )}
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── People ── */

interface Person {
  id: string;
  name_en: string;
  name_ar: string;
  avatar_color: string;
  bio: string | null;
  interests: Array<{ key: string; en: string; ar: string }>;
  is_me: boolean;
  shared_clubs: boolean;
}

function PersonRow({ p }: { p: Person }) {
  const { t, l } = useI18n();
  return (
    <li>
      <Link to={`/campus/community/people/${p.id}`} className="row">
        <Avatar name={p.name_en} color={p.avatar_color} size={38} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{l(p.name_en, p.name_ar)}</span>
            {p.is_me ? <Chip variant="outline">{t('social.people.you')}</Chip> : null}
          </span>
          <span className="t-meta block truncate">{p.shared_clubs ? t('social.people.sharedClub') : p.bio}</span>
        </span>
      </Link>
    </li>
  );
}

function PeoplePage() {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const q = useApi<{ items: Person[]; total: number }>('/campus/community/people');
  return (
    <Loaded q={q}>
      {(d) => {
        const needle = text.trim().toLowerCase();
        const list = d.items.filter((p) => !needle || [p.name_en, p.name_ar, p.bio ?? '', ...p.interests.map((i) => i.en)].join(' ').toLowerCase().includes(needle));
        return (
          <div className="space-y-4">
            <p className="max-w-[70ch] text-ink-2">{t('social.people.body')}</p>
            <div className="relative max-w-md">
              <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input className="input ps-9" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('social.people.search')} aria-label={t('social.people.search')} />
            </div>
            <p className="t-meta">{t('social.people.count', { n: list.length })}</p>
            {list.length ? (
              <ul className="sheet grid overflow-hidden sm:grid-cols-2 [&>li]:border-b [&>li]:border-rule sm:[&>li:nth-child(odd)]:border-e">{list.map((p) => <PersonRow key={p.id} p={p} />)}</ul>
            ) : (
              <Sheet>
                <Empty icon={<UsersThree size={22} />} title={t('social.people.empty')} />
              </Sheet>
            )}
          </div>
        );
      }}
    </Loaded>
  );
}

function PersonPage() {
  const { id } = useParams();
  const { t, l } = useI18n();
  const navigate = useNavigate();
  const { user } = useSession();
  const q = useApi<Person & { level: number | null; program: { name_en: string; name_ar: string } | null; clubs: Array<{ id: string; name_en: string; name_ar: string; color: string; title_en: string | null; title_ar: string | null }> | null; posts: Post[]; can_message?: boolean; message_reason?: string | null; blocked_by_me?: boolean }>(id ? `/campus/community/people/${id}` : null);
  const { busy, run } = useAction();
  return (
    <Loaded q={q}>
      {(p) => (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
          <Sheet>
            <Avatar name={p.name_en} color={p.avatar_color} size={72} />
            <h2 className="t-page mt-3.5">{l(p.name_en, p.name_ar)}</h2>
            <p className="t-meta mt-1">{[p.program ? l(p.program.name_en, p.program.name_ar) : null, p.level ? t('social.profile.level', { n: p.level }) : null].filter(Boolean).join(' · ')}</p>
            {p.bio ? <p className="mt-3 text-ink-2" dir="auto">{p.bio}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {p.id === user?.id ? (
                <Link to="/campus/community/me" className="btn btn-secondary">
                  {t('social.profile.edit')}
                </Link>
              ) : (
                <Button
                  variant="primary"
                  busy={busy === 'dm'}
                  disabled={p.can_message === false}
                  onClick={() =>
                    void run('dm', async () => {
                      const c = await api<{ id: string }>('/campus/community/messages/start', { method: 'POST', body: { user_id: p.id } });
                      navigate(`/campus/community/messages/${c.id}`);
                    })
                  }
                >
                  <ChatCircle size={16} weight="fill" />
                  {t('social.profile.message')}
                </Button>
              )}
            </div>
            {p.can_message === false && p.message_reason ? <p className="t-meta mt-2">{t(`social.reason.${p.message_reason}`)}</p> : null}
            {p.interests.length ? (
              <div className="mt-5">
                <p className="t-label mb-1.5">{t('social.profile.interests')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.interests.map((i) => (
                    <Chip key={i.key} variant="outline">
                      {l(i.en, i.ar)}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-5">
              <p className="t-label mb-1.5">{t('social.profile.clubs')}</p>
              {p.clubs ? (
                <ul className="space-y-1.5">
                  {p.clubs.map((c) => (
                    <li key={c.id}>
                      <Link to={`/campus/clubs/${c.id}`} className="flex items-center gap-2 hover:underline">
                        <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} />
                        <span className="font-medium">{l(c.name_en, c.name_ar)}</span>
                        {c.title_en ? <span className="t-meta">{l(c.title_en, c.title_ar)}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-2">{t('social.profile.clubsHidden')}</p>
              )}
            </div>
            <p className="t-meta mt-5 border-t border-rule pt-3">{t('social.profile.privateNote')}</p>
          </Sheet>
          <div>
            <h2 className="t-title mb-2.5 px-0.5">{t('social.profile.posts')}</h2>
            {p.posts.length ? (
              <div className="sheet rows overflow-hidden">
                {p.posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <p className="sheet px-4.5 py-5 text-ink-2">{t('social.profile.noPosts')}</p>
            )}
          </div>
        </div>
      )}
    </Loaded>
  );
}

/* ── Messages ── */

interface Conversation {
  id: string;
  other: Author;
  last: { body: string; mine: boolean; created_at: string } | null;
  unread: number;
  can_send: boolean;
}

interface Thread {
  conversation: Conversation;
  messages: Array<{ id: string; seq: number; mine: boolean; body: string; removed: boolean; created_at: string }>;
  their_read_seq: number;
}

function MessagesPage() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const { now } = useClock();
  const list = useApi<{ items: Conversation[] }>('/campus/community/messages');
  const thread = useApi<Thread>(id ? `/campus/community/messages/${id}` : null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [thread.data?.messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || !id) return;
    setSending(true);
    try {
      const msg = await api<Thread['messages'][number]>(`/campus/community/messages/${id}`, { method: 'POST', body: { body } });
      thread.set((prev) => prev && { ...prev, messages: [...prev.messages, msg] });
      setText('');
      void list.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sheet grid min-h-[30rem] overflow-hidden md:h-[calc(100dvh-17rem)] md:grid-cols-[19rem_minmax(0,1fr)]">
      <div className={cx('min-h-0 overflow-y-auto border-rule md:border-e', id && 'max-md:hidden')}>
        <p className="t-label border-b border-rule px-4.5 py-3">{t('social.msg.list')}</p>
        <Loaded q={list} skeleton={<div className="p-4.5"><div className="skeleton h-24" /></div>}>
          {(d) =>
            d.items.length ? (
              <ul className="rows">
                {d.items.map((c) => (
                  <li key={c.id}>
                    <Link to={`/campus/community/messages/${c.id}`} aria-current={c.id === id ? 'page' : undefined} className={cx('row', c.id === id && 'bg-surface-2')}>
                      <Avatar name={c.other.name_en} color={c.other.avatar_color} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cx('truncate', c.unread ? 'font-bold' : 'font-semibold')}>{l(c.other.name_en, c.other.name_ar)}</span>
                          {c.unread ? <span className="chip chip-solid num h-4.5! px-1.5!" data-tone="red">{c.unread}</span> : null}
                        </span>
                        <span className="t-meta block truncate" dir="auto">
                          {c.last ? `${c.last.mine ? `${t('social.msg.you')}: ` : ''}${c.last.body}` : t('social.msg.noMessages')}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={<ChatsCircle size={22} />} title={t('social.msg.empty')} body={t('social.msg.emptyBody')} action={<Link to="/campus/community/people" className="btn btn-secondary btn-sm">{t('social.msg.findPeople')}</Link>} />
            )
          }
        </Loaded>
      </div>

      <div className={cx('flex min-h-0 flex-col', !id && 'max-md:hidden')}>
        {id && thread.data ? (
          <>
            <div className="flex items-center gap-3 border-b border-rule px-4.5 py-2.5">
              <Link to="/campus/community/messages" className="link text-[0.8125rem] md:hidden">
                {t('social.msg.back')}
              </Link>
              <Avatar name={thread.data.conversation.other.name_en} color={thread.data.conversation.other.avatar_color} size={30} />
              <Link to={`/campus/community/people/${thread.data.conversation.other.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                {l(thread.data.conversation.other.name_en, thread.data.conversation.other.name_ar)}
              </Link>
            </div>
            <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto bg-surface-2/40 px-4.5 py-4">
              {thread.data.messages.map((m) => (
                <div key={m.id} className={cx('flex', m.mine ? 'justify-end' : 'justify-start')}>
                  <div className={cx('max-w-[78%] rounded-2xl px-3.5 py-2', m.mine ? 'rounded-ee-md bg-ink text-surface' : 'rounded-es-md bg-surface shadow-[0_1px_2px_oklch(0.2_0.03_262/0.08)]')}>
                    <p dir="auto" className={m.removed ? 'italic opacity-70' : undefined}>
                      {m.removed ? t('social.msg.removed') : m.body}
                    </p>
                    <p className={cx('mt-0.5 text-[0.6875rem] num', m.mine ? 'text-surface/70' : 'text-ink-3')}>
                      {fmtRelative(m.created_at, now, locale)}
                      {m.mine && m.seq <= thread.data!.their_read_seq ? ` · ${t('social.msg.seen')}` : ''}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={end} />
            </div>
            {thread.data.conversation.can_send ? (
              <form
                className="flex gap-2 border-t border-rule p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('social.msg.placeholder')} aria-label={t('social.msg.placeholder')} maxLength={2000} />
                <Button type="submit" variant="primary" icon busy={sending} disabled={!text.trim()} aria-label={t('social.msg.send')}>
                  <PaperPlaneRight size={16} weight="fill" className="rtl:-scale-x-100" />
                </Button>
              </form>
            ) : (
              <p className="border-t border-rule px-4.5 py-3 text-ink-2">{t('social.msg.unavailable')}</p>
            )}
          </>
        ) : (
          <Empty icon={<ChatsCircle size={22} />} title={t('social.msg.pick')} body={t('social.msg.pickBody')} />
        )}
      </div>
    </div>
  );
}

/* ── My profile ── */

interface MyProfile {
  record_name_en: string;
  display_name: string | null;
  bio: string | null;
  interests: string[];
  show_program: boolean;
  show_campus: boolean;
  show_clubs: boolean;
  dm_policy: 'everyone' | 'club_mates' | 'nobody';
  suggested_interests: Array<{ key: string; en: string; ar: string }>;
}

function MyProfilePage() {
  const { t, l } = useI18n();
  const q = useApi<MyProfile>('/campus/community/profile/me');
  const [form, setForm] = useState<MyProfile | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (q.data && !form) setForm(q.data);
  }, [q.data, form]);
  return (
    <Loaded q={q}>
      {(d) => {
        const f = form ?? d;
        const set = (patch: Partial<MyProfile>) => setForm({ ...f, ...patch });
        return (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Sheet title={t('social.edit.title')}>
              <p className="mb-4 text-ink-2">{t('social.edit.subtitle')}</p>
              <div className="space-y-4">
                <Field label={t('social.edit.displayName')} hint={t('social.edit.displayNameHint')}>
                  {(p) => <input {...p} className="input" value={f.display_name ?? ''} onChange={(e) => set({ display_name: e.target.value })} placeholder={d.record_name_en} maxLength={60} />}
                </Field>
                <Field label={t('social.edit.bio')} hint={t('social.edit.bioHint', { n: (f.bio ?? '').length })}>
                  {(p) => <textarea {...p} className="textarea" value={f.bio ?? ''} onChange={(e) => set({ bio: e.target.value.slice(0, 280) })} />}
                </Field>
                <div>
                  <p className="label">{t('social.edit.interests')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.suggested_interests.map((i) => {
                      const on = f.interests.includes(i.key);
                      return (
                        <button key={i.key} type="button" aria-pressed={on} disabled={!on && f.interests.length >= 8} onClick={() => set({ interests: on ? f.interests.filter((x) => x !== i.key) : [...f.interests, i.key] })} className={cx('chip h-7!', on ? 'chip-solid' : 'chip-outline hover:bg-surface-2 disabled:opacity-40')} data-tone={on ? 'orange' : undefined}>
                          {l(i.en, i.ar)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="help">{t('social.edit.interestsHint')}</p>
                </div>
              </div>
            </Sheet>
            <Sheet title={t('social.edit.privacy')}>
              <div className="space-y-4">
                <Switch checked={f.show_program} onChange={(v) => set({ show_program: v })} label={t('social.edit.showProgram')} />
                <Switch checked={f.show_campus} onChange={(v) => set({ show_campus: v })} label={t('social.edit.showCampus')} />
                <Switch checked={f.show_clubs} onChange={(v) => set({ show_clubs: v })} label={t('social.edit.showClubs')} />
                <Field label={t('social.edit.dm')}>
                  {(p) => (
                    <select {...p} className="select" value={f.dm_policy} onChange={(e) => set({ dm_policy: e.target.value as MyProfile['dm_policy'] })}>
                      {(['everyone', 'club_mates', 'nobody'] as const).map((k) => (
                        <option key={k} value={k}>
                          {t(`social.dm.${k}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <p className="t-meta">{t('social.edit.private')}</p>
                <Button
                  variant="primary"
                  busy={busy === 'save'}
                  onClick={() =>
                    void run('save', async () => {
                      await api('/campus/community/profile/me', { method: 'PUT', body: { display_name: f.display_name || null, bio: f.bio ?? '', interests: f.interests, show_program: f.show_program, show_campus: f.show_campus, show_clubs: f.show_clubs, dm_policy: f.dm_policy } });
                      toast.ok(t('social.edit.saved'));
                      refreshAll();
                    })
                  }
                >
                  {t('social.edit.save')}
                </Button>
              </div>
            </Sheet>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Search ── */

function SearchPage() {
  const { t, l } = useI18n();
  const [params] = useSearchParams();
  const term = params.get('q') ?? '';
  const q = useApi<{ posts: Post[]; clubs: Array<{ id: string; name_en: string; name_ar: string }>; events: CampusEvent[]; people: Person[] }>(term.length >= 2 ? '/campus/community/search' : null, { q: term });
  if (term.length < 2) return <p className="text-ink-2">{t('social.search.hint')}</p>;
  return (
    <Loaded q={q}>
      {(d) => {
        const nothing = !d.posts?.length && !d.clubs?.length && !d.events?.length && !d.people?.length;
        return (
          <div className="space-y-6">
            <h2 className="t-title">{t('social.search.results', { q: term })}</h2>
            {nothing ? <p className="text-ink-2">{t('social.search.none')}</p> : null}
            {d.people?.length ? (
              <Sheet flush title={t('social.search.people')}>
                <ul className="rows">{d.people.map((p) => <PersonRow key={p.id} p={p} />)}</ul>
              </Sheet>
            ) : null}
            {d.clubs?.length ? (
              <Sheet flush title={t('social.search.clubs')}>
                <ul className="rows">
                  {d.clubs.map((c) => (
                    <li key={c.id}>
                      <Link to={`/campus/clubs/${c.id}`} className="row font-semibold">
                        {l(c.name_en, c.name_ar)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Sheet>
            ) : null}
            {d.events?.length ? (
              <Sheet flush title={t('social.search.events')}>
                <ul className="rows">{d.events.map((e) => <EventRow key={e.id} e={e} />)}</ul>
              </Sheet>
            ) : null}
            {d.posts?.length ? (
              <Sheet flush title={t('social.search.posts')}>
                <div className="rows">{d.posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
              </Sheet>
            ) : null}
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Frame ── */

function CommunityLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useTitle(t('social.title'));
  const unread = useApi<{ unread: number }>('/campus/community/messages/unread');
  const [text, setText] = useState(params.get('q') ?? '');
  const term = useDebounced(text, 350);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (term.trim().length >= 2) navigate(`/campus/community/search?q=${encodeURIComponent(term.trim())}`, { replace: true });
  }, [term, navigate]);
  const tabs = [
    { to: '/campus/community', label: t('social.nav.feed'), end: true },
    { to: '/campus/community/events', label: t('social.nav.events') },
    { to: '/campus/community/people', label: t('social.nav.people') },
    { to: '/campus/community/messages', label: t('social.nav.messages'), badge: unread.data?.unread },
    { to: '/campus/community/me', label: t('social.nav.me') },
  ];
  return (
    <div data-tone="orange">
      <PageHeader
        crumbs={[{ label: t('campus.hub.title'), to: '/campus' }, { label: t('social.title') }]}
        title={t('social.title')}
        subtitle={t('social.subtitle')}
        actions={
          <div className="relative w-72 max-w-full">
            <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input className="input ps-9" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('social.searchPlaceholder')} aria-label={t('social.search')} />
          </div>
        }
      />
      <nav aria-label={t('social.nav.label')} className="tabs mb-6" data-tone="orange">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
            {tab.label}
            {tab.badge ? <span className="chip chip-solid num h-4.5! px-1.5! text-[0.6875rem]!" data-tone="red">{tab.badge}</span> : null}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

export default function CommunityRoutes() {
  return (
    <Routes>
      <Route element={<CommunityLayout />}>
        <Route index element={<FeedPage />} />
        <Route path="events" element={<CommunityEvents />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/:id" element={<PersonPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:id" element={<MessagesPage />} />
        <Route path="me" element={<MyProfilePage />} />
        <Route path="search" element={<SearchPage />} />
      </Route>
    </Routes>
  );
}
