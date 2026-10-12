import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, Copy, MagnifyingGlass, NavigationArrow, Package } from '@phosphor-icons/react';
import { api, errorMessage, refreshAll, upload, useApi } from '@/lib/api';
import { useClock } from '@/lib/clock';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Empty, Field, Loaded, PageHeader, Segmented, Sheet, Status } from '@/ui/kit';
import { type Stage, StageLine, Stop, Stops } from '@/ui/line';
import { toast } from '@/ui/overlay';

interface LostItem {
  id: string;
  public_id: string;
  item: string;
  category: string;
  lost_date: string;
  last_location_text: string | null;
  description: string | null;
  status: string;
  collection_note: string | null;
  timeline: Array<{ at: string; status: string; note: string | null }>;
  created_at: string;
  last_location: { name_en: string; name_ar: string } | null;
  collection_location: { id: string; name_en: string; name_ar: string } | null;
  document: { url: string; filename: string } | null;
  map_link: string | null;
  is_owner?: boolean;
}

const CATEGORIES = ['bags', 'electronics', 'documents', 'keys', 'clothing', 'accessories', 'books', 'other'];
const FLOW = ['reported', 'searching', 'found', 'ready_for_collection', 'collected'];

function stagesOf(status: string, t: (k: string) => string): Stage[] {
  const at = Math.max(0, FLOW.indexOf(status === 'matched' || status === 'held' ? 'found' : status));
  return FLOW.map((s, i) => ({ key: s, label: t(`status.${s}`), state: status === 'collected' || i < at ? 'done' : i === at ? 'current' : 'todo' }));
}

function Request({ r, restricted }: { r: LostItem; restricted?: boolean }) {
  const { t, l, locale } = useI18n();
  const ready = r.status === 'ready_for_collection' || r.status === 'found';
  return (
    <div className="space-y-6">
      <Sheet>
        <StageLine stages={stagesOf(r.status, t)} tone="orange" label={t('common.status')} />
      </Sheet>
      {ready && r.collection_location ? (
        <section className="plate flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <h2 className="t-title flex items-center gap-2">
              <CheckCircle size={20} weight="fill" className="text-green" />
              {t('campus.lf.foundBanner')}
            </h2>
            <p className="mt-1.5 text-plate-muted">
              {t('campus.lf.foundBannerBody')} <span className="font-semibold text-plate-ink">{l(r.collection_location.name_en, r.collection_location.name_ar).replace(/ — /g, ' · ')}</span>
            </p>
            <p className="t-meta mt-1">{t('campus.lf.bring')}</p>
          </div>
          {r.map_link ? (
            <Link to={r.map_link} className="btn btn-primary">
              <NavigationArrow size={15} weight="fill" />
              {t('campus.lf.routeToCollection')}
            </Link>
          ) : null}
        </section>
      ) : null}
      {r.status === 'collected' ? <p className="font-semibold text-green-ink">{t('campus.lf.collected')}</p> : null}
      {r.status === 'reported' || r.status === 'searching' ? <p className="text-ink-2">{t('campus.lf.searchingBody')}</p> : null}
      {restricted ? <p className="rounded-lg bg-yellow-tint px-3.5 py-3 text-yellow-ink">{t('campus.lf.restricted')}</p> : null}

      {!restricted ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Sheet title={t('campus.lf.details')}>
            <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {[
                [t('campus.lf.requestId'), <span key="id" className="t-code" dir="ltr">{r.public_id}</span>],
                [t('campus.lf.item'), r.item],
                [t('campus.lf.category'), t(`campus.lf.categories.${r.category}`)],
                [t('campus.lf.dateLost'), fmtDate(r.lost_date, locale)],
                [t('campus.lf.lastPlace'), r.last_location ? l(r.last_location.name_en, r.last_location.name_ar).replace(/ — /g, ' · ') : (r.last_location_text ?? '—')],
                [t('campus.lf.dateReported'), fmtDate(r.created_at, locale)],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="t-label">{k}</dt>
                  <dd className="mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>
            {r.description ? <p className="mt-4 border-t border-rule pt-3.5 text-ink-2">{r.description}</p> : null}
            {r.collection_note ? (
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5">
                <span className="t-label block">{t('campus.lf.securityNote')}</span>
                {r.collection_note}
              </p>
            ) : null}
            {r.document ? <img src={r.document.url} alt={r.item} className="mt-4 max-h-56 rounded-lg border border-rule object-contain" /> : null}
          </Sheet>
          <Sheet title={t('campus.lf.timeline')}>
            <Stops tone="orange">
              {r.timeline.map((e, i) => (
                <Stop key={i} state={i === r.timeline.length - 1 && r.status !== 'collected' ? 'current' : 'done'} last={i === r.timeline.length - 1}>
                  <p className="font-semibold">{t(`status.${e.status}`)}</p>
                  {e.note ? <p className="text-ink-2">{e.note}</p> : null}
                  <p className="t-meta">{fmtDateTime(e.at, locale)}</p>
                </Stop>
              ))}
            </Stops>
          </Sheet>
        </div>
      ) : null}
    </div>
  );
}

function NewRequest({ onDone }: { onDone: (r: LostItem) => void }) {
  const { t, l } = useI18n();
  const { user } = useSession();
  const { today } = useClock();
  const places = useApi<{ locations: Array<{ id: string; campus_id: string; name_en: string; name_ar: string }> }>('/campus/lost-found/locations');
  const [form, setForm] = useState({ item: '', category: 'other', lost_date: '', last_location_id: '', last_location_text: '', contact_email: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm((f) => ({ ...f, lost_date: f.lost_date || today, contact_email: f.contact_email || user?.email || '' }));
  }, [today, user]);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const documentId = file ? (await upload<{ id: string }>('/documents', file, { kind: 'lost_item', label: form.item })).id : undefined;
      const created = await api<LostItem>('/campus/lost-found', {
        body: { item: form.item, category: form.category, lost_date: form.lost_date, last_location_id: form.last_location_id || null, last_location_text: form.last_location_text || undefined, contact_email: form.contact_email, description: form.description, documentId },
      });
      refreshAll();
      onDone(created);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="sheet max-w-3xl space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('campus.lf.item')}>{(p) => <input {...p} required className="input" value={form.item} onChange={(e) => set({ item: e.target.value })} placeholder="Black backpack" />}</Field>
        <Field label={t('campus.lf.category')}>
          {(p) => (
            <select {...p} className="select" value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`campus.lf.categories.${c}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('campus.lf.dateLost')}>{(p) => <input {...p} required type="date" className="input" value={form.lost_date} max={today} onChange={(e) => set({ lost_date: e.target.value })} />}</Field>
        <Field label={t('campus.lf.lastPlace')}>
          {(p) => (
            <select {...p} className="select" value={form.last_location_id} onChange={(e) => set({ last_location_id: e.target.value })}>
              <option value="">—</option>
              {places.data?.locations
                .filter((x) => !user?.campus_id || x.campus_id === user.campus_id)
                .sort((a, b) => a.name_en.localeCompare(b.name_en))
                .map((x) => (
                <option key={x.id} value={x.id}>
                  {l(x.name_en, x.name_ar).replace(/ — /g, ' · ')}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('campus.lf.lastPlaceOther')} optional>
          {(p) => <input {...p} className="input" value={form.last_location_text} onChange={(e) => set({ last_location_text: e.target.value })} />}
        </Field>
        <Field label={t('campus.lf.email')}>{(p) => <input {...p} required type="email" dir="ltr" className="input" value={form.contact_email} onChange={(e) => set({ contact_email: e.target.value })} />}</Field>
      </div>
      <Field label={t('campus.lf.description')}>{(p) => <textarea {...p} className="textarea" value={form.description} onChange={(e) => set({ description: e.target.value })} />}</Field>
      <Field label={t('campus.lf.photo')}>
        {(p) => <input {...p} type="file" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="input h-auto! py-2 file:me-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:font-semibold file:text-ink" />}
      </Field>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" busy={saving} disabled={form.item.trim().length < 2}>
        {t('campus.lf.submit')}
      </Button>
    </form>
  );
}

function StatusCheck({ initial }: { initial: string }) {
  const { t } = useI18n();
  const [id, setId] = useState(initial);
  const [result, setResult] = useState<(LostItem & { restricted?: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function lookup(value = id) {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api(`/campus/lost-found/status/${encodeURIComponent(value.trim())}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (initial) void lookup(initial);
    // Runs once for a prefilled ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-6">
      <form
        className="flex max-w-xl items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <Field label={t('campus.lf.enterId')} hint={t('campus.lf.idFormat')} error={error} className="min-w-0 flex-1">
          {(p) => (
            <div className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input {...p} className="input t-code ps-9" dir="ltr" value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="YU-XXXX-XXXXX" />
            </div>
          )}
        </Field>
        <Button type="submit" variant="primary" busy={busy} className={error ? 'mb-[1.625rem]' : 'mb-[1.625rem]'}>
          {t('campus.lf.lookup')}
        </Button>
      </form>
      {result ? (
        <>
          <p className="flex flex-wrap items-center gap-2.5">
            <span className="t-lead">{result.item}</span>
            <Status status={result.status} />
          </p>
          <Request r={result} restricted={result.is_owner === false || result.restricted} />
        </>
      ) : null}
    </div>
  );
}

function Home() {
  const { t, locale } = useI18n();
  useTitle(t('campus.lf.title'));
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'new' | 'status' | 'mine') ?? 'new';
  const mine = useApi<LostItem[]>('/campus/lost-found/mine');
  const [created, setCreated] = useState<LostItem | null>(null);
  return (
    <div data-tone="orange">
      <PageHeader title={t('campus.lf.tagline')} subtitle={t('campus.lf.subtitle')} />
      <div className="mb-6">
        <Segmented
          label={t('campus.lf.title')}
          value={tab}
          onChange={(v) => {
            setCreated(null);
            setParams(v === 'new' ? {} : { tab: v }, { replace: true });
          }}
          options={[
            { value: 'new', label: t('campus.lf.tabNew') },
            { value: 'status', label: t('campus.lf.tabStatus') },
            { value: 'mine', label: `${t('campus.lf.tabMine')}${mine.data?.length ? ` · ${mine.data.length}` : ''}` },
          ]}
        />
      </div>

      {tab === 'new' ? (
        created ? (
          <section className="plate max-w-3xl px-5 py-6">
            <h2 className="t-title flex items-center gap-2">
              <CheckCircle size={20} weight="fill" className="text-green" />
              {t('campus.lf.success')}
            </h2>
            <p className="mt-4 text-plate-muted">{t('campus.lf.successBody')}</p>
            <p className="fig mt-1.5 text-[2.25rem]" dir="ltr">
              {created.public_id}
            </p>
            <p className="t-meta mt-2">{t('campus.lf.keepId')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  void navigator.clipboard?.writeText(created.public_id);
                  toast.ok(t('common.copied'));
                }}
              >
                <Copy size={15} />
                {t('campus.lf.copyId')}
              </Button>
              <Link to={`/campus/lost-found/${created.id}`} className="btn btn-secondary">
                {t('campus.lf.checkStatus')}
              </Link>
            </div>
          </section>
        ) : (
          <NewRequest onDone={setCreated} />
        )
      ) : tab === 'status' ? (
        <StatusCheck initial={params.get('id') ?? ''} />
      ) : (
        <Loaded q={mine}>
          {(list) =>
            list.length ? (
              <ul className="sheet rows overflow-hidden">
                {list.map((r) => (
                  <li key={r.id}>
                    <Link to={`/campus/lost-found/${r.id}`} className="row">
                      <Package size={20} className="flex-none text-ink-2" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{r.item}</span>
                        <span className="t-meta block">
                          <span className="t-code" dir="ltr">{r.public_id}</span> · {fmtDate(r.lost_date, locale)}
                        </span>
                      </span>
                      <Status status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Sheet>
                <Empty icon={<Package size={22} />} title={t('campus.lf.noRequests')} action={<Button variant="primary" onClick={() => setParams({}, { replace: true })}>{t('campus.lf.newRequest')}</Button>} />
              </Sheet>
            )
          }
        </Loaded>
      )}
    </div>
  );
}

function Detail() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const q = useApi<LostItem>(id ? `/campus/lost-found/${id}` : null);
  useTitle(q.data?.item ?? t('campus.lf.title'));
  return (
    <div data-tone="orange">
      <Loaded q={q}>
        {(r) => (
          <>
            <PageHeader
              crumbs={[{ label: t('nav.lostFound'), to: '/campus/lost-found' }, { label: t('campus.lf.tabMine'), to: '/campus/lost-found?tab=mine' }, { label: r.public_id }]}
              title={r.item}
              actions={
                <>
                  <Status status={r.status} />
                  <Button onClick={() => navigate('/campus/lost-found')}>{t('campus.lf.newRequest')}</Button>
                </>
              }
            />
            <Request r={r} />
          </>
        )}
      </Loaded>
    </div>
  );
}

export default function LostFoundRoutes() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path=":id" element={<Detail />} />
    </Routes>
  );
}
