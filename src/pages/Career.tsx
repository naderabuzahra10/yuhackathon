import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowSquareOut, BookmarkSimple, Briefcase, CalendarBlank, CaretDown, EnvelopeSimple, MagnifyingGlass, PaperPlaneTilt, Plus, Tray, VideoCamera,
} from '@phosphor-icons/react';
import { api, errorMessage, refreshAll, useApi } from '@/lib/api';
import { cx, fmtDate, fmtDateTime, fmtTime } from '@/lib/format';
import { useDebounced, useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Button, Chip, Empty, Field, Loaded, PageHeader, Segmented, Sheet, Status, Switch, type Tone } from '@/ui/kit';
import { type Stage, StageLine, Stop, Stops } from '@/ui/line';
import { Dialog, toast, useAction } from '@/ui/overlay';

interface Match {
  score: number;
  explain: Array<{ key: string; params: Record<string, string | number>; text: string }>;
  missing: string[];
  weak: string[];
  eligible: boolean | null;
  eligibility: { key: string; params: Record<string, string | number>; text: string } | null;
}

interface Opportunity {
  id: string;
  title: string;
  company: string;
  type: string;
  location: string;
  remote: string;
  skills: string[];
  eligibility: string | null;
  deadline: string | null;
  posted_at: string | null;
  description: string | null;
  salary: string | null;
  url: string | null;
  source: string;
  status: string;
  demo_label: boolean;
  expired: boolean;
  match: Match;
  saved: boolean;
  applicationId: string | null;
  applicationStatus: string | null;
}

interface Application {
  id: string;
  company: string;
  title: string;
  type: string;
  status: string;
  notes: string | null;
  deadline: string | null;
  applied_at: string | null;
  url: string | null;
  terminal: boolean;
  next_interview: { start_at: string } | null;
  interviews: Array<{ id: string; start_at: string; end_at: string; location: string | null; link: string | null; kind: string; notes: string | null }>;
  events?: Array<{ id: string; from_status: string | null; to_status: string; source: string; note: string | null; created_at: string }>;
  opportunity: Opportunity | null;
}

const PIPELINE = ['saved', 'preparing', 'applied', 'assessment', 'interview', 'offer'];
const RANK: Record<string, number> = { saved: 0, preparing: 1, applied: 2, assessment: 3, interview: 4, offer: 5 };

function pipelineStages(status: string, t: (k: string) => string): Stage[] {
  const closed = !(status in RANK);
  const at = closed ? -1 : RANK[status];
  return PIPELINE.map((s, i) => ({ key: s, label: t(`career.col.${s}`), state: closed ? 'skipped' : i < at ? 'done' : i === at ? (status === 'offer' ? 'done' : 'current') : 'todo' }));
}

const scoreTone = (score: number): Tone => (score >= 70 ? 'green' : score >= 50 ? 'blue' : 'neutral');

/* ── Discover ── */

function Discover() {
  const { t, locale, has } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState('');
  const q = useDebounced(text);
  const [type, setType] = useState('');
  const [sort, setSort] = useState('match');
  const [savedOnly, setSavedOnly] = useState(false);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const list = useApi<{ items: Opportunity[]; facets: { types: string[] }; total: number }>('/career/opportunities', { q, type, sort, saved: savedOnly ? 1 : undefined });
  const open = params.get('opp');
  const { busy, run } = useAction();

  const toggleSave = (o: Opportunity) =>
    void run(`save-${o.id}`, async () => {
      if (o.saved) await api(`/career/opportunities/${o.id}/save`, { method: 'DELETE' });
      else await api(`/career/opportunities/${o.id}/save`, { method: 'POST', body: {} });
      toast.ok(t(o.saved ? 'career.unsaved' : 'career.savedToast'));
      refreshAll();
    });

  const track = (o: Opportunity) =>
    void run(`track-${o.id}`, async () => {
      const res = await api<{ id: string; duplicate?: boolean }>('/career/applications', { body: { opportunityId: o.id } });
      toast.ok(t(res.duplicate ? 'career.alreadyTracked' : 'career.trackedToast'));
      refreshAll();
      navigate(`/career/applications/${res.id}`);
    });

  const items = (list.data?.items ?? []).filter((o) => o.type !== 'competition' && (!eligibleOnly || o.match.eligible === true));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-56 flex-1">
          <MagnifyingGlass size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input h-11! ps-10" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('career.searchPlaceholder')} aria-label={t('common.search')} />
        </div>
        <select className="select w-auto!" value={type} onChange={(e) => setType(e.target.value)} aria-label={t('career.type')}>
          <option value="">
            {t('career.type')}: {t('common.all')}
          </option>
          {(list.data?.facets.types ?? []).filter((x) => x !== 'competition').map((x) => (
            <option key={x} value={x}>
              {t(`career.oppType.${x}`)}
            </option>
          ))}
        </select>
        <select className="select w-auto!" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('career.sortBy')}>
          {(['match', 'deadline', 'posted'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`career.sort.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Switch checked={eligibleOnly} onChange={setEligibleOnly} label={t('career.eligibleNow')} />
        <Switch checked={savedOnly} onChange={setSavedOnly} label={t('career.savedOnly')} />
        <p className="t-meta ms-auto">
          {t('career.results', { n: items.length })} · {t('career.demoFeedLabel')}
        </p>
      </div>

      <Loaded q={list}>
        {() =>
          items.length ? (
            <ul className="sheet rows overflow-hidden">
              {items.map((o) => {
                const isOpen = open === o.id;
                const why = o.match.explain.map((e) => (has(e.key) ? t(e.key, e.params) : e.text));
                return (
                  <li key={o.id} id={`opp-${o.id}`}>
                    <div className="flex items-start gap-4 px-4.5 py-4">
                      <div className="w-12 flex-none text-center" data-tone={scoreTone(o.match.score)} title={t('career.matchScore')}>
                        <p className="fig text-[1.75rem] text-tone-ink">{o.match.score}</p>
                        <p className="t-meta text-[0.6875rem]!">{t('career.match')}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <button type="button" className="text-start" aria-expanded={isOpen} onClick={() => setParams(isOpen ? {} : { opp: o.id }, { replace: true })}>
                          <span className="t-lead flex items-center gap-2" dir="auto">
                            {o.title}
                            <CaretDown size={13} weight="bold" className={cx('flex-none text-ink-3 transition-transform duration-200', isOpen && 'rotate-180')} />
                          </span>
                        </button>
                        <p className="t-meta mt-0.5">
                          {[o.company, t(`career.oppType.${o.type}`), o.location, t(`career.remote.${o.remote}`)].filter(Boolean).join(' · ')}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {o.deadline ? (
                            <Chip tone={o.expired ? 'neutral' : 'yellow'}>
                              <CalendarBlank size={11} weight="bold" />
                              {fmtDate(o.deadline, locale, { year: undefined })}
                            </Chip>
                          ) : null}
                          {o.match.eligible === true ? <Chip tone="green">{t('career.eligible')}</Chip> : o.match.eligible === false ? <Chip tone="red">{t('career.notEligible')}</Chip> : null}
                          {o.demo_label ? <Chip variant="outline">{t('status.demo')}</Chip> : null}
                          {o.skills.slice(0, 4).map((s) => (
                            <Chip key={s} variant="outline" className={o.match.missing.includes(s) ? 'text-red-ink!' : undefined}>
                              {s}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-none flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                        <Button size="sm" variant="ghost" icon aria-pressed={o.saved} busy={busy === `save-${o.id}`} aria-label={t(o.saved ? 'career.unsave' : 'career.save')} title={t(o.saved ? 'career.unsave' : 'career.save')} onClick={() => toggleSave(o)} className={o.saved ? 'text-purple-ink!' : undefined}>
                          <BookmarkSimple size={17} weight={o.saved ? 'fill' : 'regular'} />
                        </Button>
                        {o.applicationId ? (
                          <Link to={`/career/applications/${o.applicationId}`} className="btn btn-secondary btn-sm">
                            {t('career.openTracker')}
                          </Link>
                        ) : (
                          <Button size="sm" variant="primary" busy={busy === `track-${o.id}`} onClick={() => track(o)}>
                            {t('career.track')}
                          </Button>
                        )}
                      </div>
                    </div>
                    {isOpen ? (
                      <div className="border-t border-rule bg-surface-2/50 px-4.5 py-4 sm:ps-[5.125rem]">
                        {o.description ? <p className="max-w-[72ch] text-ink-2">{o.description}</p> : null}
                        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-[10rem_1fr]">
                          <dt className="t-label pt-0.5">{t('career.whyMatch')}</dt>
                          <dd>{why.length ? <ul className="space-y-1">{why.map((w) => <li key={w}>{w}</li>)}</ul> : t('career.noReasons')}</dd>
                          <dt className="t-label pt-0.5">{t('career.missingSkills')}</dt>
                          <dd>{o.match.missing.length ? o.match.missing.join(', ') : t('career.noMissing')}</dd>
                          <dt className="t-label pt-0.5">{t('career.eligibility')}</dt>
                          <dd>{o.match.eligibility ? (has(o.match.eligibility.key) ? t(o.match.eligibility.key, o.match.eligibility.params) : o.match.eligibility.text) : (o.eligibility ?? t('career.eligibilityUnknown'))}</dd>
                          {o.salary ? (
                            <>
                              <dt className="t-label pt-0.5">{t('career.salary')}</dt>
                              <dd>{o.salary}</dd>
                            </>
                          ) : null}
                          <dt className="t-label pt-0.5">{t('career.source')}</dt>
                          <dd>
                            {o.source}
                            {o.posted_at ? ` · ${t('career.posted')} ${fmtDate(o.posted_at, locale)}` : ''}
                          </dd>
                        </dl>
                        <p className="t-meta mt-3 max-w-[72ch]">
                          <span className="font-semibold text-ink">{t('career.recommendationNote')}. </span>
                          {t('career.recommendationBody')}
                        </p>
                        {o.url ? (
                          <a href={o.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-3">
                            <ArrowSquareOut size={14} />
                            {t('career.sourceLink')}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Sheet>
              <Empty icon={<Briefcase size={22} />} title={t('career.noResults')} body={t('career.noResultsBody')} />
            </Sheet>
          )
        }
      </Loaded>
    </div>
  );
}

/* ── Tracker ── */

function Tracker() {
  const { t, locale } = useI18n();
  const q = useApi<{ items: Application[] }>('/career/applications');
  return (
    <Loaded q={q}>
      {(d) => (
        <div className="space-y-4">
          <p className="max-w-[72ch] text-ink-2">{t('career.trackerHint')}</p>
          {d.items.length ? (
            <div className="space-y-4">
              {d.items.map((a) => (
                <Link key={a.id} to={`/career/applications/${a.id}`} className="sheet block p-4.5 transition-colors hover:border-rule-strong">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="t-lead" dir="auto">
                        {a.title}
                      </p>
                      <p className="t-meta">
                        {[a.company, t(`career.oppType.${a.type}`), a.deadline ? `${t('career.deadline')} ${fmtDate(a.deadline, locale, { year: undefined })}` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.next_interview ? (
                        <Chip tone="purple">
                          <VideoCamera size={12} weight="fill" />
                          {fmtDateTime(a.next_interview.start_at, locale)}
                        </Chip>
                      ) : null}
                      <Status status={a.status} />
                    </div>
                  </div>
                  <StageLine stages={pipelineStages(a.status, t)} tone="purple" label={t('career.statusVocabulary')} dense />
                </Link>
              ))}
            </div>
          ) : (
            <Sheet>
              <Empty icon={<Tray size={22} />} title={t('career.noApplications')} body={t('career.noApplicationsBody')} />
            </Sheet>
          )}
        </div>
      )}
    </Loaded>
  );
}

/* ── Inbox ── */

interface HiringEmail {
  id: string;
  from_address: string;
  subject: string;
  snippet: string;
  body: string;
  received_at: string;
  category: string;
  confidence: number;
  suggested_application_id: string | null;
  suggested_status: string | null;
  review_status: string;
  suggested_application: { id: string; company: string; title: string; status: string } | null;
  candidates: Array<{ id: string; company: string; title: string }>;
  ambiguous: boolean;
}

function Inbox() {
  const { t, locale } = useI18n();
  const q = useApi<{ items: HiringEmail[]; mailbox: { note: string }; autoApply: boolean }>('/career/emails');
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const { busy, run } = useAction();
  const act = (key: string, fn: () => Promise<unknown>) =>
    void run(key, async () => {
      await fn();
      refreshAll();
    });
  return (
    <Loaded q={q}>
      {(d) => {
        const pending = d.items.filter((e) => e.review_status === 'pending');
        return (
          <div className="space-y-5">
            <div className="rounded-xl bg-yellow-tint px-4 py-3.5 text-yellow-ink">
              <p className="font-semibold">{t('career.inboxNote')}</p>
              <p className="mt-0.5">{t('career.inboxNoteBody')}</p>
              <p className="mt-0.5">{t('career.inboxUntrusted')}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Switch checked={d.autoApply} onChange={(v) => act('auto', () => api('/career/settings', { method: 'PUT', body: { autoApplyEmails: v } }))} label={t('career.autoApply')} hint={t('career.autoApplyBody')} />
              <div className="flex gap-2">
                <Button busy={busy === 'classify'} onClick={() => act('classify', async () => { const r = await api<{ classified: number; autoApplied: number }>('/career/emails/classify', { body: {} }); toast.ok(t('career.classified', { n: r.classified, auto: r.autoApplied })); })}>
                  {t('career.classify')}
                </Button>
                <Button busy={busy === 'simulate'} onClick={() => act('simulate', async () => { await api('/career/emails/simulate', { body: {} }); toast.ok(t('career.simulatedEmail')); })}>
                  <Plus size={15} weight="bold" />
                  {t('career.simulateEmail')}
                </Button>
              </div>
            </div>
            {d.items.length ? (
              <ul className="sheet rows overflow-hidden">
                {d.items.map((e) => {
                  const isPending = e.review_status === 'pending';
                  const picked = choice[e.id] ?? e.suggested_application_id ?? '';
                  return (
                    <li key={e.id} className="px-4.5 py-4">
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                        <EnvelopeSimple size={20} className="mt-0.5 flex-none text-ink-2" />
                        <div className="min-w-0 flex-1 basis-64">
                          <button type="button" className="text-start font-semibold hover:underline" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)} dir="auto">
                            {e.subject}
                          </button>
                          <p className="t-meta">
                            <span dir="ltr">{e.from_address}</span> · {fmtDateTime(e.received_at, locale)}
                          </p>
                          <p className="mt-1.5 text-ink-2" dir="auto">
                            {open === e.id ? <span className="whitespace-pre-line">{e.body}</span> : e.snippet}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Chip tone="purple">{t(`career.cat.${e.category}`)}</Chip>
                            <Chip variant="outline">
                              {t('career.confidence')} {Math.round(e.confidence * 100)}%
                            </Chip>
                            {e.ambiguous ? <Chip tone="yellow">{t('career.ambiguous')}</Chip> : null}
                            {e.suggested_status ? (
                              <Chip variant="outline">
                                {t('career.suggests')}: {t(`status.${e.suggested_status}`)}
                              </Chip>
                            ) : null}
                          </div>
                        </div>
                        <Status status={e.review_status} />
                      </div>
                      {isPending ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 ps-9">
                          <select className="select max-w-xs" value={picked} onChange={(ev) => setChoice({ ...choice, [e.id]: ev.target.value })} aria-label={t('career.chooseApplication')}>
                            <option value="">{t('career.select')}</option>
                            {e.candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.company} · {c.title}
                              </option>
                            ))}
                          </select>
                          <Button variant="primary" size="sm" busy={busy === `acc-${e.id}`} disabled={!picked} onClick={() => act(`acc-${e.id}`, async () => { const r = await api<{ applied: boolean }>(`/career/emails/${e.id}/accept`, { body: { applicationId: picked || undefined } }); toast.ok(t(r.applied ? 'career.emailApplied' : 'career.emailLinked')); })}>
                            {t('career.accept')}
                          </Button>
                          <Button variant="ghost" size="sm" busy={busy === `dis-${e.id}`} onClick={() => act(`dis-${e.id}`, () => api(`/career/emails/${e.id}/dismiss`, { method: 'POST', body: {} }))}>
                            {t('career.dismiss')}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Sheet>
                <Empty icon={<EnvelopeSimple size={22} />} title={t('career.noEmails')} body={t('career.noEmailsBody')} />
              </Sheet>
            )}
            <p className="t-meta">{pending.length ? `${t('career.pendingReview')}: ${pending.length}` : ''}</p>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Application ── */

function ApplicationPage() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const q = useApi<Application>(id ? `/career/applications/${id}` : null);
  const [changing, setChanging] = useState(false);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [attest, setAttest] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useTitle(q.data?.title ?? t('career.title'));
  useEffect(() => {
    if (changing && q.data) {
      setStatus(q.data.status);
      setNote('');
      setAttest(false);
      setCorrection(false);
      setError(null);
    }
  }, [changing, q.data]);

  return (
    <Loaded q={q}>
      {(a) => {
        const backward = !a.terminal && status in RANK && a.status in RANK && RANK[status] < RANK[a.status];
        async function save() {
          setSaving(true);
          setError(null);
          try {
            await api(`/career/applications/${a.id}/status`, { body: { status, note: note || undefined, attest: status === 'applied' ? attest : undefined, correction: backward ? correction : undefined } });
            toast.ok(t('career.statusUpdated'));
            refreshAll();
            setChanging(false);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setSaving(false);
          }
        }
        return (
          <div data-tone="purple">
            <PageHeader
              crumbs={[{ label: t('career.title'), to: '/career' }, { label: t('career.tab.tracker'), to: '/career?tab=tracker' }, { label: a.company }]}
              title={a.title}
              subtitle={[a.company, t(`career.oppType.${a.type}`), a.deadline ? `${t('career.deadline')} ${fmtDate(a.deadline, locale)}` : t('career.noDeadline')].join(' · ')}
              actions={
                <>
                  <Status status={a.status} />
                  <Button variant="primary" onClick={() => setChanging(true)}>
                    {t('career.changeStatus')}
                  </Button>
                </>
              }
            />
            <Sheet className="mb-6">
              <StageLine stages={pipelineStages(a.status, t)} tone="purple" label={t('career.statusVocabulary')} />
            </Sheet>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Sheet flush title={t('career.interviews')}>
                {a.interviews.length ? (
                  <ul className="rows">
                    {a.interviews.map((i) => (
                      <li key={i.id} className="px-4.5 py-3.5">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          <VideoCamera size={17} weight="fill" className="text-purple" />
                          {t(`career.kind.${i.kind}`)}
                          <Chip tone="green">{t('career.onCalendar')}</Chip>
                        </p>
                        <p className="mt-1 num">
                          {fmtDateTime(i.start_at, locale)} – {fmtTime(i.end_at, locale)}
                        </p>
                        <p className="t-meta">{i.location ?? t('career.online')}</p>
                        {i.notes ? <p className="mt-1 text-ink-2">{i.notes}</p> : null}
                        {i.link ? (
                          <a href={i.link} target="_blank" rel="noreferrer" className="link mt-1.5 inline-flex items-center gap-1 text-[0.8125rem]">
                            <ArrowSquareOut size={13} />
                            {t('career.joinLink')}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4.5 py-5 text-ink-2">{t('career.noInterviews')}</p>
                )}
                <p className="t-meta border-t border-rule px-4.5 py-2.5">{t('career.tzNote')}</p>
              </Sheet>
              <Sheet title={t('career.timeline')}>
                <Stops tone="purple">
                  {(a.events ?? []).map((e, i, arr) => (
                    <Stop key={e.id} state={i === arr.length - 1 ? 'current' : 'done'} last={i === arr.length - 1}>
                      <p className="font-semibold">
                        {e.from_status ? `${t(`status.${e.from_status}`)} → ` : ''}
                        {t(`status.${e.to_status}`)}
                        <Chip variant="outline" className="ms-2">
                          {t(`career.source.${e.source}`)}
                        </Chip>
                      </p>
                      {e.note ? <p className="text-ink-2">{e.note}</p> : null}
                      <p className="t-meta">{fmtDateTime(e.created_at, locale)}</p>
                    </Stop>
                  ))}
                </Stops>
              </Sheet>
            </div>
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="link mt-5 inline-flex items-center gap-1.5">
                <ArrowSquareOut size={14} />
                {t('career.sourceLink')}
              </a>
            ) : null}

            <Dialog
              open={changing}
              onClose={() => setChanging(false)}
              title={t('career.changeStatus')}
              subtitle={`${t('career.currentStatus')}: ${t(`status.${a.status}`)}`}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setChanging(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="primary" busy={saving} disabled={status === a.status || (status === 'applied' && !attest) || (backward && !correction)} onClick={() => void save()}>
                    <PaperPlaneTilt size={15} weight="fill" />
                    {t('common.save')}
                  </Button>
                </>
              }
            >
              <div className="space-y-4">
                <Field label={t('common.status')}>
                  {(p) => (
                    <select {...p} className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                      {[...PIPELINE, 'rejected', 'withdrawn'].map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                          {s === a.status ? ` (${t('career.current')})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                {status === 'applied' && a.status !== 'applied' ? (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface-2 p-3">
                    <input type="checkbox" className="mt-0.5 size-4 accent-(--purple)" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
                    <span>
                      <span className="block font-semibold">{t('career.attestLabel')}</span>
                      <span className="t-meta block">{t('career.attestBody')}</span>
                    </span>
                  </label>
                ) : null}
                {backward ? (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-yellow-tint p-3 text-yellow-ink">
                    <input type="checkbox" className="mt-0.5 size-4" checked={correction} onChange={(e) => setCorrection(e.target.checked)} />
                    <span>
                      <span className="block font-semibold">{t('career.correctionLabel')}</span>
                      <span className="block text-[0.8125rem]">{t('career.correctionBody')}</span>
                    </span>
                  </label>
                ) : null}
                <Field label={t('career.note')} optional>
                  {(p) => <textarea {...p} className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('career.notePlaceholder')} />}
                </Field>
                {error ? (
                  <p role="alert" className="field-error">
                    {error}
                  </p>
                ) : null}
              </div>
            </Dialog>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Frame ── */

function CareerHome() {
  const { t } = useI18n();
  useTitle(t('career.title'));
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'discover' | 'tracker' | 'inbox') ?? 'discover';
  const emails = useApi<{ items: HiringEmail[] }>('/career/emails');
  const pending = emails.data?.items.filter((e) => e.review_status === 'pending').length ?? 0;
  return (
    <div data-tone="purple">
      <PageHeader
        title={t('career.title')}
        subtitle={t('career.subtitle')}
        actions={
          <Link to="/portfolio" className="btn btn-secondary">
            {t('career.portfolio')}
          </Link>
        }
      />
      <div className="mb-6">
        <Segmented
          label={t('career.title')}
          value={tab}
          onChange={(v) => setParams(v === 'discover' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'discover', label: t('career.tab.discover'), icon: <MagnifyingGlass size={15} /> },
            { value: 'tracker', label: t('career.tab.tracker'), icon: <Tray size={15} /> },
            { value: 'inbox', label: `${t('career.tab.inbox')}${pending ? ` · ${pending}` : ''}`, icon: <EnvelopeSimple size={15} /> },
          ]}
        />
      </div>
      {tab === 'tracker' ? <Tracker /> : tab === 'inbox' ? <Inbox /> : <Discover />}
    </div>
  );
}

export default function CareerPage() {
  return (
    <Routes>
      <Route index element={<CareerHome />} />
      <Route path="applications/:id" element={<ApplicationPage />} />
      <Route path="*" element={<CareerHome />} />
    </Routes>
  );
}
