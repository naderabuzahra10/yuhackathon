import { useEffect, useState } from 'react';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { CaretDown, ChatCenteredText, MagnifyingGlass, ShieldCheck } from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { cx, fmtDate, fmtDateTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Chip, Empty, Field, Loaded, PageHeader, Sheet, type Tone } from '@/ui/kit';
import { Bar } from '@/ui/line';
import { Dialog, toast, useAction } from '@/ui/overlay';

const KPIS = ['clarity', 'grading', 'support', 'organisation', 'workload', 'value'] as const;
type Kpi = (typeof KPIS)[number];
type Band = 'strong' | 'on_track' | 'focus';
const BAND_TONE: Record<Band, Tone> = { strong: 'green', on_track: 'blue', focus: 'red' };

interface KpiSet {
  [key: string]: { mean: number | null; band: Band | null; favourable?: number };
}

interface RateItem {
  course_code: string;
  title_en: string;
  title_ar: string;
  term: string;
  term_label_en: string;
  term_label_ar: string;
  instructor: { name_en: string; name_ar: string } | null;
  phase: 'end_of_term' | 'mid_term';
  status: string;
  response_id: string | null;
  closes_on: string;
}

interface Response {
  id: string;
  course_code: string;
  ratings: Record<Kpi, number>;
  recommend: number | null;
  hours_per_week: number | null;
  comment: string | null;
  editable: boolean;
}

function KpiBars({ kpis }: { kpis: KpiSet }) {
  const { t } = useI18n();
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {Object.entries(kpis).map(([key, k]) => (
        <div key={key}>
          <dt className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="font-medium">{t(`fb.kpi.${key}`)}</span>
            <span className="num text-ink-2">{k.mean != null ? `${k.mean.toFixed(1)} / 5` : '—'}</span>
          </dt>
          <dd>
            <Bar value={k.mean ?? 0} max={5} tone={k.band ? BAND_TONE[k.band] : 'neutral'} label={t(`fb.kpi.${key}`)} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RateDialog({ item, existing, onClose }: { item: RateItem | null; existing: Response | null; onClose: () => void }) {
  const { t, l } = useI18n();
  const [ratings, setRatings] = useState<Partial<Record<Kpi, number>>>({});
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [hours, setHours] = useState('');
  const [comment, setComment] = useState('');
  const { busy, run } = useAction();
  useEffect(() => {
    setRatings(existing?.ratings ?? {});
    setRecommend(existing ? (existing.recommend === null ? null : existing.recommend === 1) : null);
    setHours(existing?.hours_per_week != null ? String(existing.hours_per_week) : '');
    setComment(existing?.comment ?? '');
  }, [item, existing]);
  const complete = KPIS.every((k) => ratings[k]);

  const submit = () =>
    void run('rate', async () => {
      const body = { ratings, recommend, hours_per_week: hours === '' ? null : Math.max(0, Math.min(40, Number(hours))), comment: comment.trim() };
      const res = existing
        ? await api<{ status: string }>(`/feedback/responses/${existing.id}`, { method: 'PUT', body })
        : await api<{ status: string }>('/feedback/responses', { method: 'POST', body: { ...body, course_code: item!.course_code, term: item!.term } });
      toast.ok(t(res.status === 'held' ? 'fb.heldToast' : existing ? 'fb.saved' : 'fb.submitted'));
      refreshAll();
      onClose();
    });

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      wide
      title={item ? t('fb.form.title', { code: item.course_code }) : ''}
      subtitle={item ? `${l(item.title_en, item.title_ar)}${item.instructor ? ` · ${l(item.instructor.name_en, item.instructor.name_ar)}` : ''}` : undefined}
      footer={
        <>
          {!complete ? <p className="t-meta me-auto">{t('fb.form.rateAll')}</p> : null}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" busy={busy === 'rate'} disabled={!complete} onClick={submit}>
            <ShieldCheck size={16} weight="fill" />
            {t(existing ? 'fb.form.save' : 'fb.form.submit')}
          </Button>
        </>
      }
    >
      <p className="t-meta mb-4">{t('fb.form.scale')}</p>
      <div className="space-y-5">
        {KPIS.map((k) => (
          <fieldset key={k}>
            <legend className="mb-2 font-medium">{t(`fb.q.${k}`)}</legend>
            <div className="seg" role="radiogroup" aria-label={t(`fb.kpi.${k}`)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={ratings[k] === n} aria-pressed={ratings[k] === n} title={t(`fb.scale.${n}`)} onClick={() => setRatings({ ...ratings, [k]: n })} className="t-code w-11 justify-center">
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset>
          <legend className="mb-2 font-medium">{t('fb.form.recommend')}</legend>
          <div className="seg">
            {([[true, 'yes'], [false, 'no'], [null, 'skip']] as const).map(([value, key]) => (
              <button key={key} type="button" aria-pressed={recommend === value} onClick={() => setRecommend(value)}>
                {t(`fb.form.${key}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label={t('fb.form.hours')} hint={t('fb.form.hoursHint')}>
            {(p) => <input {...p} type="number" min={0} max={40} className="input num" value={hours} onChange={(e) => setHours(e.target.value)} />}
          </Field>
          <Field label={t('fb.form.comment')} hint={t('fb.form.commentHint')}>
            {(p) => <textarea {...p} className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('fb.form.commentPlaceholder')} maxLength={1000} />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function GivePage() {
  const { t, l, locale } = useI18n();
  const q = useApi<{ items: RateItem[]; responses: Response[]; min_responses: number }>('/feedback/mine');
  const overview = useApi<{ actions: Array<{ id: string; course_code: string; kpi: string; body_en: string; body_ar: string; created_at: string }>; totals: { responses: number; courses: number; instructors: number } }>('/feedback/overview');
  const [rating, setRating] = useState<RateItem | null>(null);
  const { busy, run } = useAction();
  return (
    <Loaded q={q}>
      {(d) => {
        const pending = d.items.filter((i) => i.status === 'pending');
        const existing = rating ? (d.responses.find((r) => r.id === rating.response_id) ?? null) : null;
        return (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <section className="plate flex flex-wrap items-center justify-between gap-4 px-5 py-5">
                <div>
                  <p className="fig text-[2.75rem]">{pending.length}</p>
                  <p className="mt-1.5 text-plate-muted">{t('fb.pending', { n: pending.length })}</p>
                </div>
                {pending[0] ? (
                  <Button variant="primary" onClick={() => setRating(pending[0])}>
                    {t('fb.startNow', { code: pending[0].course_code })}
                  </Button>
                ) : null}
              </section>
              {(['end_of_term', 'mid_term'] as const).map((phase) => {
                const items = d.items.filter((i) => i.phase === phase);
                if (!items.length) return null;
                const term = l(items[0].term_label_en, items[0].term_label_ar);
                return (
                  <Sheet key={phase} flush title={t(phase === 'end_of_term' ? 'fb.give.endTitle' : 'fb.give.midTitle', { term })}>
                    <p className="border-b border-rule px-4.5 py-3 text-ink-2">{t(phase === 'end_of_term' ? 'fb.give.endBody' : 'fb.give.midBody')}</p>
                    <ul className="rows">
                      {items.map((i) => {
                        const res = d.responses.find((r) => r.id === i.response_id);
                        return (
                          <li key={`${i.course_code}-${i.term}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4.5 py-3">
                            <div className="min-w-0 flex-1 basis-56">
                              <p className="flex items-baseline gap-2">
                                <span className="t-code">{i.course_code}</span>
                                <span className="truncate font-semibold">{l(i.title_en, i.title_ar)}</span>
                              </p>
                              <p className="t-meta">
                                {i.instructor ? l(i.instructor.name_en, i.instructor.name_ar) : ''} · {t('fb.window.closes', { date: fmtDate(i.closes_on, locale, { year: undefined }) })}
                              </p>
                            </div>
                            <Chip tone={i.status === 'pending' ? 'yellow' : i.status === 'held' ? 'blue' : 'green'}>{t(`fb.status.${i.status === 'published' ? 'submitted' : i.status}`)}</Chip>
                            {i.status === 'pending' ? (
                              <Button size="sm" variant="primary" onClick={() => setRating(i)}>
                                {t('fb.rate')}
                              </Button>
                            ) : res?.editable ? (
                              <>
                                <Button size="sm" onClick={() => setRating(i)}>
                                  {t('fb.edit')}
                                </Button>
                                <Button size="sm" variant="ghost" busy={busy === res.id} onClick={() => void run(res.id, async () => { await api(`/feedback/responses/${res.id}`, { method: 'DELETE' }); toast.ok(t('fb.withdrawn')); refreshAll(); })}>
                                  {t('fb.withdraw')}
                                </Button>
                              </>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </Sheet>
                );
              })}
              {!d.items.length ? <p className="sheet px-4.5 py-5 text-ink-2">{t('fb.give.none')}</p> : null}
            </div>
            <div className="space-y-6">
              <Sheet title={t('fb.privacy.title')}>
                <ul className="space-y-2.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <li key={n} className="flex gap-2.5 text-ink-2">
                      <ShieldCheck size={17} weight="fill" className="mt-0.5 flex-none text-green" />
                      {t(`fb.privacy.${n}`, { n: d.min_responses })}
                    </li>
                  ))}
                </ul>
              </Sheet>
              {overview.data?.actions.length ? (
                <Sheet flush title={t('fb.actions')}>
                  <p className="border-b border-rule px-4.5 py-3 text-ink-2">{t('fb.actionsBody')}</p>
                  <ul className="rows">
                    {overview.data.actions.map((a) => (
                      <li key={a.id} className="px-4.5 py-3">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="t-code">{a.course_code}</span>
                          <Chip variant="outline">{t(`fb.kpi.${a.kpi}`)}</Chip>
                        </p>
                        <p className="mt-1.5">{l(a.body_en, a.body_ar)}</p>
                        <p className="t-meta mt-1">{fmtDate(a.created_at, locale)}</p>
                      </li>
                    ))}
                  </ul>
                </Sheet>
              ) : null}
            </div>
            <RateDialog item={rating} existing={existing} onClose={() => setRating(null)} />
          </div>
        );
      }}
    </Loaded>
  );
}

interface KpiRow {
  key: string;
  title: string;
  meta: string;
  n: number;
  enough: boolean;
  index: number | null;
  recommend: number | null;
  kpis: KpiSet;
  college: string;
}

function KpiList({ kind }: { kind: 'courses' | 'instructors' }) {
  const { t, l } = useI18n();
  const q = useApi<{ items: Array<Record<string, any>>; min_responses: number }>(`/feedback/${kind}`);
  const [text, setText] = useState('');
  const [college, setCollege] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Loaded q={q}>
      {(d) => {
        const rows: KpiRow[] = d.items.map((x) =>
          kind === 'courses'
            ? { key: x.code, title: `${x.code} · ${l(x.title_en, x.title_ar)}`, meta: (x.instructors ?? []).map((i: { name_en: string; name_ar: string }) => l(i.name_en, i.name_ar)).join(', '), n: x.n, enough: x.enough, index: x.index, recommend: x.recommend, kpis: x.kpis, college: x.college }
            : { key: x.slug, title: l(x.name_en, x.name_ar), meta: (x.courses ?? []).join(' · '), n: x.n, enough: x.enough, index: x.index, recommend: x.recommend, kpis: x.kpis, college: x.college },
        );
        const colleges = [...new Set(rows.map((r) => r.college))];
        const needle = text.trim().toLowerCase();
        const list = rows.filter((r) => (!college || r.college === college) && (!needle || `${r.title} ${r.meta}`.toLowerCase().includes(needle))).sort((a, b) => (b.index ?? -1) - (a.index ?? -1));
        return (
          <div className="space-y-4">
            <p className="max-w-[72ch] text-ink-2">{t('fb.kpisBody')}</p>
            <div className="flex flex-wrap gap-2.5">
              <div className="relative min-w-56 flex-1">
                <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
                <input className="input ps-9" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t(`fb.search.${kind}`)} aria-label={t('fb.search.label')} />
              </div>
              <select className="select w-auto!" value={college} onChange={(e) => setCollege(e.target.value)} aria-label={t('fb.colleges')}>
                <option value="">{t('fb.college.all')}</option>
                {colleges.map((c) => (
                  <option key={c} value={c}>
                    {t(`fb.collegeName.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            {list.length ? (
              <ul className="sheet rows overflow-hidden">
                {list.map((r) => {
                  const isOpen = open === r.key;
                  const band: Band | null = r.index == null ? null : r.index >= 84 ? 'strong' : r.index >= 72 ? 'on_track' : 'focus';
                  return (
                    <li key={r.key}>
                      <button type="button" className="row" aria-expanded={isOpen} disabled={!r.enough} onClick={() => setOpen(isOpen ? null : r.key)}>
                        <span className="w-12 flex-none text-center" data-tone={band ? BAND_TONE[band] : 'neutral'}>
                          <span className="fig block text-[1.625rem] text-tone-ink">{r.index ?? '—'}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.title}</span>
                          <span className="t-meta block truncate">{r.enough ? `${r.meta} · ${t('fb.responses', { n: r.n })}` : t('fb.notEnough')}</span>
                        </span>
                        {r.recommend != null ? <span className="t-meta flex-none max-sm:hidden">{t('fb.recommend', { n: r.recommend })}</span> : null}
                        {band ? <Chip tone={BAND_TONE[band]}>{t(`fb.band.${band}`)}</Chip> : null}
                        {r.enough ? <CaretDown size={14} weight="bold" className={cx('flex-none text-ink-3 transition-transform duration-200', isOpen && 'rotate-180')} /> : null}
                      </button>
                      {isOpen ? (
                        <div className="border-t border-rule bg-surface-2/50 px-4.5 py-4">
                          <KpiBars kpis={r.kpis} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Sheet>
                <Empty icon={<MagnifyingGlass size={22} />} title={t('fb.emptySearch')} body={t('fb.emptySearchBody')} />
              </Sheet>
            )}
            <p className="t-meta">
              {t('fb.bands')} {t('fb.notEnoughBody', { min: d.min_responses })} {t('fb.demoNote')}
            </p>
          </div>
        );
      }}
    </Loaded>
  );
}

function HelpPage() {
  const { t, locale } = useI18n();
  const q = useApi<Array<{ id: string; public_id: string; category: string; subject: string; body: string; status: string; reply: string | null; replied_at: string | null; created_at: string }>>('/feedback/help/tickets');
  const [form, setForm] = useState({ category: 'question', subject: '', body: '', page: '' });
  const { busy, run } = useAction();
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Sheet flush title={t('fb.help.faq')}>
          <ul className="rows">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <li key={n}>
                <details className="group px-4.5 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
                    {t(`fb.help.q${n}`)}
                    <CaretDown size={14} weight="bold" className="flex-none text-ink-3 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 max-w-[68ch] text-ink-2">{t(`fb.help.a${n}`)}</p>
                </details>
              </li>
            ))}
          </ul>
        </Sheet>
        <Sheet flush title={t('fb.help.mine')}>
          {q.data?.length ? (
            <ul className="rows">
              {q.data.map((tk) => (
                <li key={tk.id} className="px-4.5 py-3.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="t-code text-ink-2" dir="ltr">{tk.public_id}</span>
                    <span className="min-w-0 flex-1 font-semibold">{tk.subject}</span>
                    <Chip tone={tk.status === 'open' ? 'yellow' : tk.status === 'answered' ? 'green' : 'neutral'}>{t(`fb.help.status.${tk.status}`)}</Chip>
                  </p>
                  <p className="mt-1 text-ink-2">{tk.body}</p>
                  {tk.reply ? (
                    <p className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2.5">
                      <span className="t-label block">{t('fb.help.reply')}</span>
                      {tk.reply}
                    </p>
                  ) : null}
                  <p className="t-meta mt-1.5">{fmtDateTime(tk.created_at, locale)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4.5 py-5 text-ink-2">{t('fb.help.none')}</p>
          )}
        </Sheet>
      </div>
      <Sheet title={t('fb.help.contact')}>
        <p className="mb-4 text-ink-2">{t('fb.help.contactBody')}</p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run('send', async () => {
              const res = await api<{ public_id: string }>('/feedback/help/tickets', { method: 'POST', body: { category: form.category, subject: form.subject.trim(), body: form.body.trim(), page: form.page.trim() || undefined } });
              toast.ok(t('fb.help.sent', { id: res.public_id }));
              setForm({ category: 'question', subject: '', body: '', page: '' });
              refreshAll();
            });
          }}
        >
          <Field label={t('fb.help.category')}>
            {(p) => (
              <select {...p} className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['question', 'bug', 'suggestion', 'account', 'other'].map((c) => (
                  <option key={c} value={c}>
                    {t(`fb.help.cat.${c}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('fb.help.subject')}>{(p) => <input {...p} required className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={120} />}</Field>
          <Field label={t('fb.help.message')} hint={t('fb.help.messageHint')}>
            {(p) => <textarea {...p} required className="textarea min-h-32!" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}
          </Field>
          <Field label={t('fb.help.page')}>{(p) => <input {...p} className="input" dir="ltr" value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} placeholder="/campus/map" />}</Field>
          <Button type="submit" variant="primary" busy={busy === 'send'} disabled={form.subject.trim().length < 3 || form.body.trim().length < 10}>
            <ChatCenteredText size={16} weight="fill" />
            {t('fb.help.send')}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

function FeedbackLayout() {
  const { t } = useI18n();
  const { can } = useSession();
  useTitle(t('fb.title'));
  const tabs = [
    { to: '/feedback', label: t('fb.tab.give'), end: true, show: can('feedback') && can('academics') },
    { to: '/feedback/courses', label: t('fb.tab.courses'), show: can('feedbackKpis') },
    { to: '/feedback/instructors', label: t('fb.tab.instructors'), show: can('feedbackKpis') },
    { to: '/feedback/help', label: t('fb.tab.help'), show: can('feedback') },
  ].filter((x) => x.show);
  return (
    <div>
      <PageHeader title={t('fb.title')} subtitle={t('fb.subtitle')} />
      <nav aria-label={t('fb.tabs')} className="tabs mb-6">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

function Index() {
  const { can } = useSession();
  return can('academics') ? <GivePage /> : <HelpPage />;
}

export default function FeedbackRoutes() {
  return (
    <Routes>
      <Route element={<FeedbackLayout />}>
        <Route index element={<Index />} />
        <Route path="courses/*" element={<KpiList kind="courses" />} />
        <Route path="instructors/*" element={<KpiList kind="instructors" />} />
        <Route path="help" element={<HelpPage />} />
      </Route>
    </Routes>
  );
}
