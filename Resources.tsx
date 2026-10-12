import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowFatUp, BookmarkSimple, Brain, Cards, DownloadSimple, Eye, FilePdf, FileText, Flag, ListPlus, MagnifyingGlass, Sparkle, TextAlignLeft, UploadSimple,
} from '@phosphor-icons/react';
import { api, errorMessage, refreshAll, upload, useApi } from '@/lib/api';
import { cx, fmtDate } from '@/lib/format';
import { useDebounced, useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Avatar, Button, Chip, Empty, ErrorState, Field, PageHeader, Segmented, SkeletonRows, Status } from '@/ui/kit';
import { Dialog, toast, useAction } from '@/ui/overlay';

export interface Resource {
  id: string;
  course_code: string;
  course_title_en: string | null;
  course_title_ar: string | null;
  term: string;
  term_label: string;
  term_label_ar: string;
  type: string;
  title: string;
  description: string;
  author: { id: string; name_en: string; name_ar: string; avatar_color: string } | null;
  status: string;
  helpful_count: number;
  downloads: number;
  pages: number;
  created_at: string;
  moderation_note: string | null;
  bookmarked: boolean;
  voted: boolean;
  is_owner: boolean;
}

interface ResourceList {
  items: Resource[];
  facets: { courses: Array<{ course_code: string; n: number }>; terms: Array<{ term: string; label: string; label_ar: string }>; types: string[] };
}

export const RESOURCE_TYPES = ['notes', 'slides', 'summary', 'past_exam', 'cheatsheet', 'lab'] as const;

function PreviewDialog({ resource, onClose, onTask }: { resource: Resource | null; onClose: () => void; onTask: (r: Resource) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'text' | 'pdf'>('text');
  const [summary, setSummary] = useState<{ label: string; note: string; points: Array<{ text: string; citation: { paragraph: number; page: number } }> } | null>(null);
  const { busy, run } = useAction();
  const q = useApi<{ title: string; paragraphs: string[]; file_url: string | null; content_text: string | null }>(resource ? `/campus/resources/${resource.id}/preview` : null);

  useEffect(() => {
    setSummary(null);
    setTab('text');
  }, [resource?.id]);

  const p = q.data;
  return (
    <Dialog
      open={!!resource}
      onClose={onClose}
      wide
      title={resource?.title ?? ''}
      subtitle={resource ? `${resource.course_code} · ${t(`campus.resources.types.${resource.type}`)}` : undefined}
      footer={
        resource ? (
          <>
            {p?.file_url ? (
              <a href={`/api/campus/resources/${resource.id}/download`} target="_blank" rel="noreferrer" className="btn btn-ghost me-auto">
                <DownloadSimple size={16} />
                {t('campus.resources.download')}
              </a>
            ) : null}
            <Button onClick={() => onTask(resource)}>
              <ListPlus size={16} />
              {t('campus.resources.addTask')}
            </Button>
            {p?.content_text ? (
              <>
                <Link to={`/academics/coach/${resource.id}?mode=cards`} className="btn btn-secondary">
                  <Cards size={16} />
                  {t('coach.cards')}
                </Link>
                <Link to={`/academics/coach/${resource.id}`} className="btn btn-secondary">
                  <Brain size={16} />
                  {t('coach.quizMe')}
                </Link>
              </>
            ) : null}
            <Button
              variant="primary"
              busy={busy === 'sum'}
              disabled={!p?.content_text}
              onClick={() => void run('sum', async () => setSummary(await api(`/campus/resources/${resource.id}/summary`, { method: 'POST', body: {} })))}
            >
              <Sparkle size={16} weight="fill" />
              {t('campus.resources.summary')}
            </Button>
          </>
        ) : null
      }
    >
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : null}
      {!p && !q.error ? <SkeletonRows rows={3} /> : null}
      {p ? (
        <div className="space-y-4">
          <Segmented
            label={t('campus.resources.preview')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'text', label: t('campus.resources.text'), icon: <TextAlignLeft size={15} /> },
              { value: 'pdf', label: t('campus.resources.pdf'), icon: <FilePdf size={15} /> },
            ]}
          />
          {summary ? (
            <div className="rounded-xl bg-blue-tint px-4 py-3.5" data-tone="blue">
              <p className="mb-2 flex items-center gap-2 font-semibold text-blue-ink">
                <Sparkle size={16} weight="fill" />
                {summary.label}
              </p>
              <ul className="space-y-1.5">
                {summary.points.map((pt, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="dot mt-2 size-1.5!" />
                    <span>
                      {pt.text}{' '}
                      <span className="t-code text-xs text-blue-ink">
                        [{t('campus.resources.paragraph')} {pt.citation.paragraph}, p.{pt.citation.page}]
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="t-meta mt-2.5">
                {summary.note} {t('campus.resources.summaryNote')}
              </p>
            </div>
          ) : null}
          {tab === 'text' ? (
            p.paragraphs.length ? (
              <div className="space-y-3.5">
                {p.paragraphs.map((para, i) => (
                  <p key={i} className="flex gap-3 leading-relaxed" dir="auto">
                    <span className="t-code w-7 flex-none pt-0.5 text-xs text-ink-3">P{i + 1}</span>
                    <span className="max-w-[68ch]">{para}</span>
                  </p>
                ))}
              </div>
            ) : (
              <Empty icon={<FileText size={22} />} title={t('common.empty')} />
            )
          ) : p.file_url ? (
            <iframe title={p.title} src={p.file_url} className="h-[62dvh] w-full rounded-lg border border-rule bg-white" />
          ) : (
            <Empty icon={<FilePdf size={22} />} title={t('common.empty')} />
          )}
        </div>
      ) : null}
    </Dialog>
  );
}

function TaskDialog({ resource, onClose }: { resource: Resource | null; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ title: '', effort: 45, deadline: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (resource) setForm({ title: `Study: ${resource.title}`, effort: 45, deadline: '' });
    setError(null);
  }, [resource]);

  async function save() {
    if (!resource) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/campus/resources/${resource.id}/study-task`, { body: { title: form.title, effort_min: Number(form.effort), deadline: form.deadline || null } });
      toast.ok(t('campus.resources.taskCreated'));
      refreshAll();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!resource}
      onClose={onClose}
      title={t('campus.resources.addTask')}
      subtitle={resource?.course_code}
      footer={
        <>
          <Link to="/academics/study" className="btn btn-ghost me-auto">
            {t('campus.resources.openPlanner')}
          </Link>
          <Button variant="primary" busy={saving} disabled={form.title.trim().length < 2} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('campus.resources.taskTitle')}>{(p) => <input {...p} className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('campus.resources.effort')}>
            {(p) => <input {...p} className="input num" type="number" min={5} max={600} value={form.effort} onChange={(e) => setForm({ ...form, effort: Number(e.target.value) })} />}
          </Field>
          <Field label={t('campus.resources.deadline')} optional>
            {(p) => <input {...p} className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />}
          </Field>
        </div>
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function ReportDialog({ resource, onClose }: { resource: Resource | null; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  return (
    <Dialog
      open={!!resource}
      onClose={onClose}
      title={t('campus.resources.report')}
      subtitle={resource?.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            busy={busy === 'report'}
            disabled={reason.trim().length < 5}
            onClick={() =>
              void run('report', async () => {
                await api(`/campus/resources/${resource!.id}/report`, { body: { reason } });
                toast.ok(t('campus.resources.reported'));
                setReason('');
                refreshAll();
                onClose();
              })
            }
          >
            {t('common.submit')}
          </Button>
        </>
      }
    >
      <Field label={t('campus.resources.reportReason')}>{(p) => <textarea {...p} className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
    </Dialog>
  );
}

function UploadDialog({ open, onClose, terms }: { open: boolean; onClose: () => void; terms: string[] }) {
  const { t } = useI18n();
  const blank = { course_code: '', term: terms[0] ?? '2026-1', type: 'notes', title: '', description: '', content_text: '', rights: false };
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!file) return setError(t('campus.resources.chooseFile'));
    setSaving(true);
    setError(null);
    try {
      const doc = await upload<{ id: string }>('/documents', file, { kind: 'resource', label: form.title });
      await api('/campus/resources', {
        body: { course_code: form.course_code, term: form.term, type: form.type, title: form.title, description: form.description, content_text: form.content_text || undefined, documentId: doc.id, rights_confirmed: form.rights },
      });
      toast.ok(t('campus.resources.uploadDone'));
      refreshAll();
      setForm(blank);
      setFile(null);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const ready = form.rights && !!file && form.title.length >= 4 && form.course_code.length >= 5;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('campus.resources.uploadTitle')}
      subtitle={t('campus.resources.uploadHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" busy={saving} disabled={!ready} onClick={() => void submit()}>
            <UploadSimple size={16} />
            {t('common.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('campus.resources.course')} hint="SWE 302">
            {(p) => <input {...p} className="input" value={form.course_code} onChange={(e) => setForm({ ...form, course_code: e.target.value })} placeholder="CIS 321" />}
          </Field>
          <Field label={t('campus.resources.term')}>
            {(p) => (
              <select {...p} className="select" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
                {(terms.length ? terms : ['2026-1']).map((term) => (
                  <option key={term}>{term}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('campus.resources.type')}>
            {(p) => (
              <select {...p} className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {RESOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`campus.resources.types.${type}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label={t('campus.resources.file')}>
          {(p) => (
            <input
              {...p}
              type="file"
              accept="application/pdf,image/png,image/jpeg,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input h-auto! py-2 file:me-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:font-semibold file:text-ink"
            />
          )}
        </Field>
        <Field label={t('campus.resources.title_field')}>{(p) => <input {...p} className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
        <Field label={t('campus.resources.description')} optional>
          {(p) => <textarea {...p} className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
        </Field>
        <Field label={t('campus.resources.contentText')}>
          {(p) => <textarea {...p} className="textarea" value={form.content_text} onChange={(e) => setForm({ ...form, content_text: e.target.value })} />}
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 size-4 accent-(--blue)" checked={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.checked })} />
          <span className="text-ink-2">{t('campus.resources.rights')}</span>
        </label>
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function ResourceRow({ r, onPreview, onTask, onReport, onToggle }: { r: Resource; onPreview: (r: Resource) => void; onTask: (r: Resource) => void; onReport: (r: Resource) => void; onToggle: (r: Resource, what: 'helpful' | 'bookmark') => void }) {
  const { t, l, locale } = useI18n();
  return (
    <li className={cx('flex gap-3.5 px-4 py-4 sm:gap-4.5 sm:px-5', r.status === 'pending' && 'bg-yellow-tint/40')}>
      <button
        type="button"
        aria-pressed={r.voted}
        aria-label={`${t('campus.resources.helpful')} (${r.helpful_count})`}
        onClick={() => onToggle(r, 'helpful')}
        className={cx(
          'flex h-14 w-11 flex-none flex-col items-center justify-center gap-0.5 rounded-[10px] border transition-[background-color,border-color,color,transform] duration-150 active:scale-95',
          r.voted ? 'border-blue bg-blue text-white' : 'border-rule-strong text-ink-2 hover:border-blue hover:text-blue-ink',
        )}
      >
        <ArrowFatUp size={16} weight={r.voted ? 'fill' : 'bold'} />
        <span className="fig text-[0.9375rem]">{r.helpful_count}</span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="blue">
            <span className="t-code">{r.course_code}</span>
          </Chip>
          <Chip variant="outline">{t(`campus.resources.types.${r.type}`)}</Chip>
          <span className="t-meta">{locale === 'ar' ? r.term_label_ar : r.term_label}</span>
          {r.status !== 'published' ? <Status status={r.status} /> : null}
        </div>
        <h3 className="mt-1.5">
          <button type="button" onClick={() => onPreview(r)} className="t-lead text-start underline-offset-2 hover:underline" dir="auto">
            {r.title}
          </button>
        </h3>
        <p className="mt-1 line-clamp-2 max-w-[72ch] text-ink-2" dir="auto">
          {r.description}
        </p>
        {r.status === 'pending' && r.is_owner ? <p className="t-meta mt-1 font-semibold text-yellow-ink!">{t('campus.resources.pendingNote')}</p> : null}
        {r.moderation_note && r.status === 'rejected' ? <p className="t-meta mt-1 text-red-ink!">{r.moderation_note}</p> : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="t-meta flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {r.author ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <Avatar name={r.author.name_en} color={r.author.avatar_color} size={18} />
                {l(r.author.name_en, r.author.name_ar)}
              </span>
            ) : null}
            <span className="num">
              {r.pages} {t('campus.resources.pages')} · {r.downloads} {t('campus.resources.downloads')} · {fmtDate(r.created_at, locale)}
            </span>
          </p>
          <div className="ms-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onPreview(r)}>
              <Eye size={15} />
              {t('campus.resources.preview')}
            </Button>
            <Link to={`/academics/coach/${r.id}`} className="btn btn-tone btn-sm" data-tone="blue">
              <Brain size={15} weight="fill" />
              {t('coach.quizMe')}
            </Link>
            <Button size="sm" variant="ghost" onClick={() => onTask(r)}>
              <ListPlus size={15} />
              <span className="max-sm:hidden">{t('campus.resources.addTask')}</span>
            </Button>
            <Button size="sm" variant="ghost" icon aria-pressed={r.bookmarked} aria-label={t('campus.resources.bookmark')} title={t('campus.resources.bookmark')} onClick={() => onToggle(r, 'bookmark')} className={r.bookmarked ? 'text-orange-ink!' : undefined}>
              <BookmarkSimple size={16} weight={r.bookmarked ? 'fill' : 'regular'} />
            </Button>
            <Button size="sm" variant="ghost" icon aria-label={t('campus.resources.report')} title={t('campus.resources.report')} onClick={() => onReport(r)}>
              <Flag size={15} />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function ResourcesPage() {
  const { t, locale } = useI18n();
  useTitle(t('campus.resources.title'));
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search);
  const scope = params.get('mine') ? 'mine' : params.get('bookmarked') ? 'bookmarked' : 'all';
  const course = params.get('course') ?? '';
  const term = params.get('term') ?? '';
  const type = params.get('type') ?? '';
  const sort = params.get('sort') ?? 'helpful';

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };

  const list = useApi<ResourceList>('/campus/resources', { q, course, term, type, sort, mine: scope === 'mine' ? 1 : undefined, bookmarked: scope === 'bookmarked' ? 1 : undefined });
  const [preview, setPreview] = useState<Resource | null>(null);
  const [task, setTask] = useState<Resource | null>(null);
  const [report, setReport] = useState<Resource | null>(null);
  const [uploading, setUploading] = useState(false);

  // Votes and bookmarks answer at once; the server confirms in the background.
  async function toggle(r: Resource, what: 'helpful' | 'bookmark') {
    list.set((prev) =>
      prev && {
        ...prev,
        items: prev.items.map((x) =>
          x.id !== r.id ? x : what === 'helpful' ? { ...x, voted: !x.voted, helpful_count: x.helpful_count + (x.voted ? -1 : 1) } : { ...x, bookmarked: !x.bookmarked },
        ),
      },
    );
    try {
      await api(`/campus/resources/${r.id}/${what}`, { method: 'POST', body: {} });
    } catch (e) {
      toast.error(e);
    }
    void list.reload();
  }

  const facets = list.data?.facets;
  const items = list.data?.items ?? [];
  const filtered = !!(q || course || term || type || scope !== 'all');

  return (
    <div data-tone="blue">
      <PageHeader
        title={t('campus.resources.title')}
        subtitle={t('campus.resources.subtitle')}
        actions={
          <Button variant="primary" onClick={() => setUploading(true)}>
            <UploadSimple size={16} weight="bold" />
            {t('campus.resources.upload')}
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <MagnifyingGlass size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input className="input h-11! ps-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('campus.resources.searchPlaceholder')} aria-label={t('common.search')} type="search" />
          </div>
          <Segmented
            label={t('common.filter')}
            value={scope}
            onChange={(v) => patch({ mine: v === 'mine' ? '1' : null, bookmarked: v === 'bookmarked' ? '1' : null })}
            options={[
              { value: 'all', label: t('campus.resources.all') },
              { value: 'bookmarked', label: t('campus.resources.bookmarked') },
              { value: 'mine', label: t('campus.resources.mine') },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <select className="select" value={course} onChange={(e) => patch({ course: e.target.value || null })} aria-label={t('campus.resources.course')}>
            <option value="">
              {t('campus.resources.course')}: {t('common.all')}
            </option>
            {facets?.courses.map((c) => (
              <option key={c.course_code} value={c.course_code}>
                {c.course_code} ({c.n})
              </option>
            ))}
          </select>
          <select className="select" value={term} onChange={(e) => patch({ term: e.target.value || null })} aria-label={t('campus.resources.term')}>
            <option value="">
              {t('campus.resources.term')}: {t('common.all')}
            </option>
            {facets?.terms.map((x) => (
              <option key={x.term} value={x.term}>
                {locale === 'ar' ? x.label_ar : x.label}
              </option>
            ))}
          </select>
          <select className="select" value={type} onChange={(e) => patch({ type: e.target.value || null })} aria-label={t('campus.resources.type')}>
            <option value="">
              {t('campus.resources.type')}: {t('common.all')}
            </option>
            {RESOURCE_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`campus.resources.types.${x}`)}
              </option>
            ))}
          </select>
          <select className="select" value={sort} onChange={(e) => patch({ sort: e.target.value })} aria-label={t('campus.resources.sort')}>
            <option value="helpful">{t('campus.resources.sortHelpful')}</option>
            <option value="newest">{t('campus.resources.sortNewest')}</option>
            <option value="downloads">{t('campus.resources.sortDownloads')}</option>
          </select>
        </div>
      </div>

      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {list.data ? (
        <>
          <p className="t-meta mb-2 flex items-center gap-3 px-0.5" aria-live="polite">
            {t('x.results', { n: items.length })}
            {filtered ? (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSearch('');
                  setParams({}, { replace: true });
                }}
              >
                {t('x.clear')}
              </button>
            ) : null}
          </p>
          <div className="sheet overflow-hidden">
            {items.length ? (
              <ul className="rows">
                {items.map((r) => (
                  <ResourceRow key={r.id} r={r} onPreview={setPreview} onTask={setTask} onReport={setReport} onToggle={(x, what) => void toggle(x, what)} />
                ))}
              </ul>
            ) : (
              <Empty icon={<FileText size={22} />} title={t('x.noResults')} body={t('campus.resources.noResults')} />
            )}
          </div>
        </>
      ) : list.error ? null : (
        <div className="sheet">
          <SkeletonRows rows={6} />
        </div>
      )}

      <PreviewDialog
        resource={preview}
        onClose={() => setPreview(null)}
        onTask={(r) => {
          setPreview(null);
          setTask(r);
        }}
      />
      <TaskDialog resource={task} onClose={() => setTask(null)} />
      <ReportDialog resource={report} onClose={() => setReport(null)} />
      <UploadDialog open={uploading} onClose={() => setUploading(false)} terms={facets?.terms.map((x) => x.term) ?? []} />
    </div>
  );
}
