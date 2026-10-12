import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, CaretDown, DownloadSimple, GithubLogo, IdentificationCard, LinkedinLogo, PencilSimple, Plus, ReadCvLogo, SealCheck, Trash, Trophy,
} from '@phosphor-icons/react';
import { api, errorMessage, refreshAll, useApi } from '@/lib/api';
import { openStudentCard } from '@/lib/card';
import { cx, fmtDate } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Avatar, Button, Chip, Field, Loaded, MoreLink, Segmented, Sheet, Switch, type Tone } from '@/ui/kit';
import { Bar, type Stage, StageLine } from '@/ui/line';
import { Dialog, toast, useAction } from '@/ui/overlay';

type Kind = 'project' | 'experience' | 'volunteer' | 'certificate' | 'award' | 'language' | 'education';
type Visibility = 'private' | 'staff' | 'employers';

interface Item {
  id: string;
  kind: Kind;
  title: string;
  org: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  url: string | null;
  skills: string[];
  verification: 'university' | 'link' | 'self';
  visibility: Visibility;
  location: string | null;
  outcomes: string[];
  source: string;
  needs_review: boolean;
}

interface Portfolio {
  profile: { headline: string | null; summary: string | null; skills: string[]; availability: string | null };
  items: Item[];
  accounts: Array<{ provider: 'linkedin' | 'github'; url?: string; handle?: string; verified?: boolean; synced_at?: string | null }>;
  consents: { matching: { granted: boolean }; staff_view: { granted: boolean } };
  skills: Array<{ key: string; label_en: string; label_ar: string; strength: number; evidence: Array<{ kind: string; ref: string }> }>;
  education: { program: { name_en: string; name_ar: string; degree: string } | null; level: number; credits: number; gpa: number | null; courses: Array<{ course_code: string; status: string; grade: string | null; title_en: string; title_ar: string }> };
  completeness: { done: number; total: number; checks: Array<{ key: string; done: boolean }> };
}

interface Opportunity {
  id: string;
  title: string;
  company: string;
  type: string;
  location: string;
  deadline: string | null;
  source: string;
  demo_label: boolean;
  expired: boolean;
  applicationId: string | null;
  match: {
    score: number;
    explain: Array<{ key: string; params: Record<string, string | number>; text: string }>;
    missing: string[];
    weak: string[];
    eligible: boolean | null;
    eligibility: { key: string; params: Record<string, string | number>; text: string } | null;
  };
}

const fitOf = (score: number) => (score >= 70 ? 'strong' : score >= 50 ? 'good' : 'partial');
const FIT_TONE: Record<string, Tone> = { strong: 'green', good: 'blue', partial: 'neutral' };

const blankItem = (kind: Kind) => ({ id: '', kind, title: '', org: '', start_date: '', end_date: '', location: '', url: '', description: '', outcomes: '', skills: '', visibility: 'private' as Visibility, locked: false });
type Draft = ReturnType<typeof blankItem>;

const SECTIONS = ['about', 'opps', 'experience', 'projects', 'skills', 'education', 'achievements', 'languages', 'settings'] as const;

function ItemDialog({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Draft | null>(draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm(draft);
    setError(null);
  }, [draft]);
  if (!form) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;
  const set = (patch: Partial<Draft>) => setForm({ ...form, ...patch });
  const kindKey = ['experience', 'volunteer', 'project', 'certificate', 'award', 'education', 'language'].includes(form.kind) ? form.kind : 'other';

  async function save() {
    if (!form) return;
    const dateOk = (d: string) => !d || /^\d{4}(-\d{2})?(-\d{2})?$/.test(d);
    if (form.title.trim().length < 2) return setError(t('portfolio.err.title'));
    if (!dateOk(form.start_date) || !dateOk(form.end_date)) return setError(t('portfolio.err.date'));
    if (form.start_date && form.end_date && form.end_date < form.start_date) return setError(t('portfolio.err.order'));
    if (form.url && !/^https?:\/\//.test(form.url.trim())) return setError(t('portfolio.err.url'));
    const outcomes = form.outcomes.split('\n').map((x) => x.trim()).filter(Boolean);
    if (outcomes.length > 6) return setError(t('portfolio.err.outcomes'));
    const body = {
      kind: form.kind,
      title: form.title.trim(),
      org: form.org.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      outcomes,
      url: form.url.trim() || null,
      skills: form.skills.split(',').map((x) => x.trim()).filter(Boolean),
      visibility: form.visibility,
    };
    setSaving(true);
    setError(null);
    try {
      if (form.id) await api(`/career/portfolio/items/${form.id}`, { method: 'PATCH', body });
      else await api('/career/portfolio/items', { body });
      toast.ok(t('portfolio.saved'));
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
      open
      onClose={onClose}
      title={t(form.id ? 'portfolio.editItem' : 'portfolio.addItem')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" busy={saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {form.locked ? <p className="rounded-lg bg-green-tint px-3 py-2.5 text-green-ink">{t('portfolio.lockedNote')}</p> : null}
        {!form.id ? (
          <Field label={t('portfolio.kind')}>
            {(p) => (
              <select {...p} className="select" value={form.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
                {(['project', 'experience', 'volunteer', 'certificate', 'award', 'language', 'education'] as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {t(`portfolio.kind.${k}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(`portfolio.f.title.${kindKey}`)}>
            {(p) => <input {...p} className="input" disabled={form.locked} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder={t(`portfolio.ex.title.${kindKey === 'other' ? 'project' : kindKey}`)} />}
          </Field>
          <Field label={t(`portfolio.f.org.${kindKey}`)}>
            {(p) => <input {...p} className="input" disabled={form.locked} value={form.org} onChange={(e) => set({ org: e.target.value })} placeholder={t(`portfolio.ex.org.${kindKey === 'other' ? 'project' : kindKey}`)} />}
          </Field>
          <Field label={t('portfolio.start')} hint={t('portfolio.dateHint')}>
            {(p) => <input {...p} className="input num" disabled={form.locked} value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} placeholder="2026-03" inputMode="numeric" />}
          </Field>
          <Field label={t('portfolio.end')} hint={t('portfolio.endHint')}>
            {(p) => <input {...p} className="input num" disabled={form.locked} value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} placeholder="2026-06" inputMode="numeric" />}
          </Field>
        </div>
        <Field label={t('portfolio.f.description')} hint={t('portfolio.f.descriptionHint')}>
          {(p) => <textarea {...p} className="textarea" value={form.description} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        {form.kind !== 'language' ? (
          <>
            <Field label={t('portfolio.f.outcomes')} hint={t('portfolio.f.outcomesHint')} optional>
              {(p) => <textarea {...p} className="textarea" value={form.outcomes} onChange={(e) => set({ outcomes: e.target.value })} placeholder={t('portfolio.ex.outcomes')} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('portfolio.url')} optional>
                {(p) => <input {...p} className="input" dir="ltr" inputMode="url" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />}
              </Field>
              <Field label={t('portfolio.skills')} hint={t('portfolio.skillsHint')} optional>
                {(p) => <input {...p} className="input" disabled={form.locked} value={form.skills} onChange={(e) => set({ skills: e.target.value })} placeholder="React, Node.js" />}
              </Field>
            </div>
          </>
        ) : null}
        <div>
          <p className="label">{t('portfolio.visibility')}</p>
          <Segmented
            label={t('portfolio.visibility')}
            value={form.visibility}
            onChange={(v) => set({ visibility: v })}
            options={(['private', 'staff', 'employers'] as Visibility[]).map((v) => ({ value: v, label: t(`portfolio.visibility.${v}`) }))}
          />
          <p className="help">{t(`portfolio.visibilityHint.${form.visibility}`)}</p>
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

function AboutDialog({ open, profile, onClose }: { open: boolean; profile: Portfolio['profile']; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ headline: '', summary: '', availability: '', skills: [] as string[] });
  const [skill, setSkill] = useState('');
  const { busy, run } = useAction();
  useEffect(() => {
    if (open) setForm({ headline: profile.headline ?? '', summary: profile.summary ?? '', availability: profile.availability ?? '', skills: profile.skills });
  }, [open, profile]);
  const addSkill = () => {
    const s = skill.trim();
    if (s && !form.skills.some((x) => x.toLowerCase() === s.toLowerCase())) setForm({ ...form, skills: [...form.skills, s] });
    setSkill('');
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('portfolio.editAbout')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            busy={busy === 'save'}
            onClick={() =>
              void run('save', async () => {
                await api('/career/profile', { method: 'PUT', body: form });
                toast.ok(t('portfolio.saved'));
                refreshAll();
                onClose();
              })
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('portfolio.check.headline')} hint={t('portfolio.noHeadline')}>
          {(p) => <input {...p} className="input" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={120} />}
        </Field>
        <Field label={t('portfolio.check.summary')}>{(p) => <textarea {...p} className="textarea min-h-28!" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />}</Field>
        <Field label={t('portfolio.selfSkills')} hint={t('portfolio.selfSkillsHint')}>
          {(p) => (
            <div>
              <div className="flex gap-2">
                <input
                  {...p}
                  className="input"
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                />
                <Button onClick={addSkill}>{t('portfolio.add')}</Button>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {form.skills.map((s) => (
                  <button key={s} type="button" className="chip chip-outline h-7! hover:bg-surface-2" onClick={() => setForm({ ...form, skills: form.skills.filter((x) => x !== s) })} title={t('common.remove')}>
                    {s} ×
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function Block({ id, title, hint, action, children }: { id: string; title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="t-title text-[1.1875rem]!">
            {title}
          </h2>
          {hint ? <p className="mt-1 max-w-[70ch] text-ink-2">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function PortfolioPage() {
  const { t, l, locale, has } = useI18n();
  const { user } = useSession();
  useTitle(t('nav.portfolio'));
  const q = useApi<Portfolio>('/career/portfolio');
  const opps = useApi<{ items: Opportunity[] }>('/career/opportunities', { sort: 'match' });
  const comps = useApi<{ items: Array<{ id: string; title_en?: string; title_ar?: string; title?: string; registration_deadline?: string | null; deadline?: string | null }> }>('/career/competitions', { segment: 'open' });
  const card = useApi<{ achievements: Array<{ id: string; title_en: string; title_ar: string; kind: string; club_name_en: string | null; created_at: string; event_start_at: string | null; verified_by_name: string | null }> }>('/campus/me/card');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [about, setAbout] = useState(false);
  const [openOpp, setOpenOpp] = useState<string | null>(null);
  const [allSkills, setAllSkills] = useState(false);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [li, setLi] = useState('');
  const [gh, setGh] = useState('');
  const [erase, setErase] = useState<'linkedin_export' | 'github' | 'all' | null>(null);
  const { busy, run } = useAction();

  const act = (key: string, fn: () => Promise<unknown>, ok?: string) =>
    void run(key, async () => {
      await fn();
      refreshAll();
    }, ok);

  const editItem = (it: Item) =>
    setDraft({
      id: it.id, kind: it.kind, title: it.title, org: it.org ?? '', start_date: it.start_date?.slice(0, 7) ?? '', end_date: it.end_date?.slice(0, 7) ?? '', location: it.location ?? '',
      url: it.url ?? '', description: it.description ?? '', outcomes: (it.outcomes ?? []).join('\n'), skills: it.skills.join(', '), visibility: it.visibility, locked: it.verification === 'university',
    });

  return (
    <Loaded q={q}>
      {(d) => {
        const name = user ? l(user.name_en, user.name_ar) : '';
        const checks: Stage[] = d.completeness.checks.map((c) => ({ key: c.key, label: t(`portfolio.check.${c.key}`), state: c.done ? 'done' : 'todo' }));
        const firstTodo = checks.findIndex((c) => c.state === 'todo');
        if (firstTodo >= 0) checks[firstTodo] = { ...checks[firstTodo], state: 'current' };
        const todo = d.completeness.checks.filter((c) => !c.done).slice(0, 3);
        const byKind = (...kinds: Kind[]) => d.items.filter((it) => kinds.includes(it.kind));
        const shown = d.skills.filter((s) => s.evidence.some((e) => e.kind !== 'self'));
        const selfOnly = d.skills.filter((s) => s.evidence.every((e) => e.kind === 'self'));
        const recs = (opps.data?.items ?? []).filter((o) => o.type !== 'competition' && !o.expired && !o.applicationId && o.match.eligible !== false).slice(0, 5);
        const linkedin = d.accounts.find((a) => a.provider === 'linkedin');
        const github = d.accounts.find((a) => a.provider === 'github');

        const itemList = (items: Item[], emptyKey: string, addKind: Kind) =>
          items.length === 0 ? (
            <p className="sheet px-4.5 py-5 text-ink-2">
              {t(emptyKey)}{' '}
              <button type="button" className="link" onClick={() => setDraft(blankItem(addKind))}>
                {t('portfolio.addOne')}
              </button>
            </p>
          ) : (
            <ul className="sheet rows overflow-hidden">
              {items.map((it, i) => (
                <li key={it.id} className="px-4.5 py-4">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="t-lead" dir="auto">
                        {it.title}
                      </h3>
                      <p className="t-meta mt-0.5">
                        {[it.org, [it.start_date ? fmtDate(it.start_date, locale, { day: undefined }) : '', it.end_date && it.end_date !== it.start_date ? fmtDate(it.end_date, locale, { day: undefined }) : it.start_date && !it.end_date ? t('portfolio.present') : ''].filter(Boolean).join(' – '), it.location].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {it.verification === 'university' ? (
                        <Chip tone="green">
                          <SealCheck size={12} weight="fill" />
                          {t('portfolio.verified.university')}
                        </Chip>
                      ) : (
                        <Chip variant="outline">{t(`portfolio.verified.${it.verification}`)}</Chip>
                      )}
                      {items.length > 1 ? (
                        <>
                          <Button size="sm" variant="ghost" icon disabled={i === 0} aria-label={t('portfolio.moveUp', { title: it.title })} onClick={() => act('order', () => api('/career/portfolio/items/reorder', { body: { ids: swap(items.map((x) => x.id), i, -1) } }))}>
                            <ArrowUp size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" icon disabled={i === items.length - 1} aria-label={t('portfolio.moveDown', { title: it.title })} onClick={() => act('order', () => api('/career/portfolio/items/reorder', { body: { ids: swap(items.map((x) => x.id), i, 1) } }))}>
                            <ArrowDown size={14} />
                          </Button>
                        </>
                      ) : null}
                      <Button size="sm" variant="ghost" icon aria-label={t('common.edit')} onClick={() => editItem(it)}>
                        <PencilSimple size={15} />
                      </Button>
                      {it.verification !== 'university' ? (
                        <Button size="sm" variant="ghost" icon aria-label={t('common.delete')} onClick={() => act(`del-${it.id}`, () => api(`/career/portfolio/items/${it.id}`, { method: 'DELETE' }), t('portfolio.deleted'))}>
                          <Trash size={15} />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {it.needs_review ? <p className="mt-2 rounded-lg bg-yellow-tint px-3 py-2 text-yellow-ink">{t('portfolio.review.note')}</p> : null}
                  {it.description ? (
                    <p className="mt-2 max-w-[72ch] text-ink-2" dir="auto">
                      {it.description}
                    </p>
                  ) : null}
                  {it.outcomes?.length ? (
                    <ul className="mt-2 space-y-1">
                      {it.outcomes.map((o) => (
                        <li key={o} className="flex gap-2">
                          <span className="dot mt-2 size-1.5!" data-tone="purple" />
                          {o}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {it.skills.map((s) => (
                        <Chip key={s} variant="outline">
                          {s}
                        </Chip>
                      ))}
                    </div>
                    <div className="ms-auto">
                      <Segmented
                        label={t('portfolio.visibility')}
                        value={it.visibility}
                        onChange={(v) => act(`vis-${it.id}`, () => api(`/career/portfolio/items/${it.id}`, { method: 'PATCH', body: { visibility: v } }))}
                        options={(['private', 'staff', 'employers'] as Visibility[]).map((v) => ({ value: v, label: t(`portfolio.visibility.${v}`) }))}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          );

        const addButton = (kind: Kind) => (
          <Button size="sm" onClick={() => setDraft(blankItem(kind))}>
            <Plus size={14} weight="bold" />
            {t('portfolio.add')}
          </Button>
        );

        return (
          <div data-tone="purple">
            <header id="about" className="mb-5 scroll-mt-28">
              <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
                <Avatar name={user?.name_en ?? ''} color={user?.avatar_color} size={72} />
                <div className="min-w-0 flex-1 basis-80">
                  <h1 className="t-page">{name}</h1>
                  <p className="mt-1 text-[1.0625rem] font-medium">{d.profile.headline || <span className="text-ink-2">{t('portfolio.noHeadline')}</span>}</p>
                  <p className="t-meta mt-1.5 text-[0.8125rem]!">
                    {[d.education.program ? l(d.education.program.name_en, d.education.program.name_ar) : null, t('portfolio.levelCredits', { level: d.education.level, credits: d.education.credits }), d.education.gpa != null ? t('portfolio.gpa', { gpa: d.education.gpa.toFixed(2) }) : null].filter(Boolean).join(' · ')}
                  </p>
                  {d.profile.summary ? (
                    <p className="mt-3 max-w-[68ch] text-ink-2" dir="auto">
                      {d.profile.summary}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to="/portfolio/cv" className="btn btn-primary">
                    <ReadCvLogo size={17} weight="fill" />
                    {t('cv.create')}
                  </Link>
                  <Button onClick={() => setAbout(true)}>
                    <PencilSimple size={15} />
                    {t('portfolio.editAbout')}
                  </Button>
                  <Button onClick={openStudentCard}>
                    <IdentificationCard size={16} />
                    {t('shell.card')}
                  </Button>
                </div>
              </div>
            </header>

            <Sheet className="mb-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="t-title">{t('portfolio.next.title', { done: d.completeness.done, total: d.completeness.total })}</h2>
                <p className="t-meta">{t('portfolio.pageSubtitle')}</p>
              </div>
              <StageLine stages={checks} tone="purple" label={t('portfolio.completeness')} dense />
              {todo.length ? (
                <ul className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-4">
                  {todo.map((c) => (
                    <li key={c.key}>
                      <a href={['linkedin', 'github'].includes(c.key) ? '#settings' : c.key === 'evidence' ? '#skills' : c.key === 'awards' ? '#achievements' : `#${c.key === 'projects' ? 'projects' : c.key === 'experience' ? 'experience' : 'about'}`} className="btn btn-tone btn-sm" data-tone="purple">
                        {t(`portfolio.next.${c.key}`)}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Sheet>

            <nav aria-label={t('portfolio.nav.label')} className="tabs sticky top-(--topbar-h) z-20 -mx-1 mb-7 bg-bg/90 px-1 backdrop-blur-md">
              {SECTIONS.map((s) => (
                <a key={s} href={`#${s}`} className="tab">
                  {t(`portfolio.nav.${s}`)}
                </a>
              ))}
            </nav>

            <div className="space-y-10">
              <Block id="opps" title={t('portfolio.opp.title')} hint={t('portfolio.opp.body')} action={<MoreLink to="/career">{t('portfolio.opp.prefs')}</MoreLink>}>
                {recs.length ? (
                  <ul className="sheet rows overflow-hidden">
                    {recs.map((o) => {
                      const fit = fitOf(o.match.score);
                      const open = openOpp === o.id;
                      const proven = o.match.explain.find((e) => e.key === 'match.proven');
                      const why = o.match.explain.filter((e) => !['match.proven', 'match.weak'].includes(e.key));
                      return (
                        <li key={o.id}>
                          <button type="button" className="row items-start! py-3.5!" aria-expanded={open} onClick={() => setOpenOpp(open ? null : o.id)}>
                            <span className="min-w-0 flex-1">
                              <span className="t-lead block" dir="auto">
                                {o.title}
                              </span>
                              <span className="t-meta block">
                                {[o.company, t(`career.oppType.${o.type}`), o.location, o.deadline ? t('portfolio.opp.deadline', { date: fmtDate(o.deadline, locale, { year: undefined }) }) : null].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            <Chip tone={FIT_TONE[fit]}>{t(`portfolio.fit.${fit}`)}</Chip>
                            <CaretDown size={14} weight="bold" className={cx('mt-1 flex-none text-ink-3 transition-transform duration-200', open && 'rotate-180')} />
                          </button>
                          {open ? (
                            <div className="border-t border-rule bg-surface-2/50 px-4.5 py-4">
                              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[10rem_1fr]">
                                <dt className="t-label pt-0.5">{t('portfolio.opp.why')}</dt>
                                <dd>{why.length ? why.map((e) => (has(e.key) ? t(e.key, e.params) : e.text)).join(' · ') : t('portfolio.opp.noWhy')}</dd>
                                {proven ? (
                                  <>
                                    <dt className="t-label pt-0.5">{t('portfolio.opp.evidence')}</dt>
                                    <dd>{String(proven.params.skills ?? '')}</dd>
                                  </>
                                ) : null}
                                {o.match.weak.length ? (
                                  <>
                                    <dt className="t-label pt-0.5">{t('portfolio.opp.selfOnly')}</dt>
                                    <dd className="text-yellow-ink">{o.match.weak.join(', ')}</dd>
                                  </>
                                ) : null}
                                {o.match.missing.length ? (
                                  <>
                                    <dt className="t-label pt-0.5">{t('portfolio.opp.missing')}</dt>
                                    <dd className="text-red-ink">{o.match.missing.join(', ')}</dd>
                                  </>
                                ) : null}
                                <dt className="t-label pt-0.5">{t('portfolio.opp.eligibility')}</dt>
                                <dd>{o.match.eligibility ? (has(o.match.eligibility.key) ? t(o.match.eligibility.key, o.match.eligibility.params) : o.match.eligibility.text) : t('portfolio.opp.eligUnknown')}</dd>
                                <dt className="t-label pt-0.5">{t('portfolio.opp.source')}</dt>
                                <dd>
                                  {o.source}
                                  {o.demo_label ? ` · ${t('portfolio.opp.demo')}` : ''}
                                </dd>
                              </dl>
                              <Link to={`/career?opp=${o.id}`} className="btn btn-primary btn-sm mt-4">
                                {t('portfolio.opp.details')}
                              </Link>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="sheet px-4.5 py-5 text-ink-2">
                    <span className="font-semibold text-ink">{t('portfolio.opp.empty')}. </span>
                    {t('portfolio.opp.emptyBody')}
                  </p>
                )}
                {comps.data?.items.length ? (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="t-lead flex items-center gap-2">
                        <Trophy size={17} className="text-purple" />
                        {t('portfolio.suggest.comps')}
                      </h3>
                      <MoreLink to="/competitions">{t('portfolio.suggest.allComps')}</MoreLink>
                    </div>
                    <ul className="sheet rows overflow-hidden">
                      {comps.data.items.slice(0, 3).map((c) => (
                        <li key={c.id}>
                          <Link to={`/competitions?id=${c.id}`} className="row min-h-11! py-2.5!">
                            <span className="min-w-0 flex-1 truncate font-medium">{l(c.title_en ?? c.title ?? '', c.title_ar)}</span>
                            {c.registration_deadline ?? c.deadline ? <span className="t-meta flex-none">{fmtDate((c.registration_deadline ?? c.deadline)!, locale, { year: undefined })}</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Block>

              <Block id="experience" title={t('portfolio.experience')} action={addButton('experience')}>
                {itemList(byKind('experience', 'volunteer'), 'portfolio.empty.experience', 'experience')}
              </Block>

              <Block id="projects" title={t('portfolio.projects')} action={addButton('project')}>
                {itemList(byKind('project'), 'portfolio.empty.projects', 'project')}
              </Block>

              <Block id="skills" title={t('portfolio.skillsEvidence')} hint={t('portfolio.skillsExplain')}>
                <h3 className="t-label mb-2">{t('portfolio.skills.shown')}</h3>
                <ul className="sheet rows overflow-hidden">
                  {(allSkills ? shown : shown.slice(0, 8)).map((s) => (
                    <li key={s.key} className="grid items-center gap-x-5 gap-y-1.5 px-4.5 py-3 sm:grid-cols-[11rem_7rem_1fr]">
                      <span className="font-semibold">{l(s.label_en, s.label_ar)}</span>
                      <Bar value={s.strength * 100} tone={s.strength >= 0.8 ? 'green' : 'blue'} label={t('portfolio.strengthOf', { skill: s.label_en })} />
                      <span className="t-meta flex flex-wrap gap-x-3 gap-y-0.5">
                        {s.evidence
                          .filter((e) => e.kind !== 'self')
                          .map((e, i) => (
                            <span key={i}>
                              {t(`portfolio.evidence.${e.kind}`)}: <span className="font-medium text-ink">{e.ref}</span>
                            </span>
                          ))}
                      </span>
                    </li>
                  ))}
                </ul>
                {shown.length > 8 && !allSkills ? (
                  <button type="button" className="link mt-2.5 text-[0.8125rem]" onClick={() => setAllSkills(true)}>
                    {t('portfolio.skills.showAll', { n: shown.length })}
                  </button>
                ) : null}
                {selfOnly.length ? (
                  <div className="mt-5">
                    <h3 className="t-label mb-2">{t('portfolio.skills.selfOnly')}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selfOnly.map((s) => (
                        <Chip key={s.key} variant="outline">
                          {l(s.label_en, s.label_ar)}
                        </Chip>
                      ))}
                    </div>
                    <p className="t-meta mt-2">{t('portfolio.skills.selfOnlyHint')}</p>
                  </div>
                ) : null}
              </Block>

              <Block id="education" title={t('portfolio.education')}>
                <div className="sheet overflow-hidden">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4.5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="t-lead">{d.education.program ? l(d.education.program.name_en, d.education.program.name_ar) : '—'}</p>
                      <p className="t-meta">
                        {d.education.program?.degree} · {t('card.university')}
                      </p>
                    </div>
                    <Chip tone="green">
                      <SealCheck size={12} weight="fill" />
                      {t('portfolio.verified.university')}
                    </Chip>
                  </div>
                  <button type="button" className="row border-t border-rule" aria-expanded={coursesOpen} onClick={() => setCoursesOpen((o) => !o)}>
                    <span className="flex-1 font-semibold">{t('portfolio.coursesN', { n: d.education.courses.length })}</span>
                    <CaretDown size={14} weight="bold" className={cx('text-ink-3 transition-transform duration-200', coursesOpen && 'rotate-180')} />
                  </button>
                  {coursesOpen ? (
                    <ul className="grid gap-x-8 border-t border-rule px-4.5 py-3 sm:grid-cols-2">
                      {d.education.courses.map((c) => (
                        <li key={c.course_code} className="flex items-baseline gap-2.5 py-1.5">
                          <span className="t-code w-16 flex-none text-[0.8125rem] text-purple-ink">{c.course_code}</span>
                          <span className="min-w-0 flex-1 truncate">{l(c.title_en, c.title_ar)}</span>
                          <span className="t-meta flex-none">{c.grade ?? t(`status.${c.status}`)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </Block>

              <Block id="achievements" title={t('portfolio.awards')} hint={t('portfolio.awardsNote')} action={addButton('certificate')}>
                {itemList(byKind('award', 'certificate'), 'portfolio.empty.awards', 'certificate')}
                {card.data?.achievements.length ? (
                  <div className="mt-5">
                    <h3 className="t-label mb-2">{t('portfolio.campusActivities')}</h3>
                    <ul className="sheet rows overflow-hidden">
                      {card.data.achievements.map((a) => (
                        <li key={a.id} className="row">
                          <SealCheck size={18} weight="fill" className="flex-none text-green" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium" dir="auto">
                              {l(a.title_en, a.title_ar)}
                            </span>
                            <span className="t-meta block">
                              {[a.club_name_en, fmtDate(a.event_start_at ?? a.created_at, locale), a.verified_by_name].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <Chip variant="outline">{t(`achievement.kind.${a.kind}`)}</Chip>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Block>

              <Block id="languages" title={t('portfolio.languages')} action={addButton('language')}>
                {itemList(byKind('language'), 'portfolio.empty.languages', 'language')}
              </Block>

              <Block id="settings" title={t('portfolio.sidebar')}>
                <div className="grid items-start gap-5 lg:grid-cols-2">
                  <Sheet title={t('portfolio.accounts')}>
                    <div className="space-y-5">
                      <div>
                        <p className="mb-2 flex items-center gap-2 font-semibold">
                          <LinkedinLogo size={18} weight="fill" className="text-blue" />
                          LinkedIn
                          {linkedin ? <Chip tone={linkedin.verified ? 'green' : 'neutral'}>{t(linkedin.verified ? 'portfolio.li.verifiedSim' : 'portfolio.li.notVerified')}</Chip> : null}
                        </p>
                        {linkedin ? (
                          <>
                            <p className="truncate text-ink-2" dir="ltr">
                              {linkedin.url}
                            </p>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {!linkedin.verified ? (
                                <Button size="sm" busy={busy === 'liv'} onClick={() => act('liv', () => api('/career/portfolio/accounts/linkedin/verify', { method: 'POST' }), t('portfolio.li.verifiedToast'))}>
                                  {t('portfolio.li.verify')}
                                </Button>
                              ) : null}
                              <Button size="sm" variant="ghost" busy={busy === 'lid'} onClick={() => act('lid', () => api('/career/portfolio/accounts/linkedin', { method: 'DELETE' }))}>
                                {t('portfolio.unlink')}
                              </Button>
                            </div>
                            <p className="t-meta mt-2">{t('portfolio.li.verifyNote')}</p>
                          </>
                        ) : (
                          <form
                            className="flex items-end gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              act('li', () => api('/career/portfolio/accounts/linkedin', { method: 'PUT', body: { url: li } }), t('portfolio.li.linked'));
                            }}
                          >
                            <Field label={t('portfolio.li.url')} className="min-w-0 flex-1">
                              {(p) => <input {...p} className="input" dir="ltr" inputMode="url" value={li} onChange={(e) => setLi(e.target.value)} placeholder="https://www.linkedin.com/in/…" />}
                            </Field>
                            <Button type="submit" busy={busy === 'li'} disabled={li.trim().length < 8}>
                              {t('portfolio.link')}
                            </Button>
                          </form>
                        )}
                      </div>
                      <div className="border-t border-rule pt-5">
                        <p className="mb-2 flex items-center gap-2 font-semibold">
                          <GithubLogo size={18} weight="fill" />
                          GitHub
                        </p>
                        {github ? (
                          <>
                            <p className="text-ink-2" dir="ltr">
                              @{github.handle}
                            </p>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              <Button size="sm" busy={busy === 'ghs'} onClick={() => act('ghs', () => api('/career/portfolio/accounts/github', { method: 'PUT', body: { username: github.handle } }), t('portfolio.gh.syncedToast'))}>
                                {t('portfolio.gh.sync')}
                              </Button>
                              <Button size="sm" variant="ghost" busy={busy === 'ghd'} onClick={() => act('ghd', () => api('/career/portfolio/accounts/github', { method: 'DELETE' }))}>
                                {t('portfolio.unlink')}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <form
                            className="flex items-end gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              act('gh', () => api('/career/portfolio/accounts/github', { method: 'PUT', body: { username: gh } }), t('portfolio.gh.linked'));
                            }}
                          >
                            <Field label={t('portfolio.gh.user')} className="min-w-0 flex-1">
                              {(p) => <input {...p} className="input" dir="ltr" value={gh} onChange={(e) => setGh(e.target.value)} placeholder="octocat" />}
                            </Field>
                            <Button type="submit" busy={busy === 'gh'} disabled={gh.trim().length < 1}>
                              {t('portfolio.link')}
                            </Button>
                          </form>
                        )}
                        <p className="t-meta mt-2">{t('portfolio.gh.note')}</p>
                      </div>
                    </div>
                  </Sheet>

                  <Sheet title={t('portfolio.privacy')}>
                    <div className="space-y-4">
                      <Switch checked={d.consents.matching.granted} onChange={(v) => act('c1', () => api('/career/portfolio/consents', { method: 'PUT', body: { purpose: 'matching', granted: v } }))} label={t('portfolio.consent.matching')} hint={t('portfolio.consent.matchingHint')} />
                      <Switch checked={d.consents.staff_view.granted} onChange={(v) => act('c2', () => api('/career/portfolio/consents', { method: 'PUT', body: { purpose: 'staff_view', granted: v } }))} label={t('portfolio.consent.staff')} hint={t('portfolio.consent.staffHint')} />
                      <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
                        <Button
                          size="sm"
                          onClick={() =>
                            void run('export', async () => {
                              const json = await api('/career/portfolio/resume.json');
                              const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'resume.json';
                              a.click();
                              URL.revokeObjectURL(url);
                            })
                          }
                        >
                          <DownloadSimple size={15} />
                          {t('portfolio.privacy.export')}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setErase('all')}>
                          {t('portfolio.privacy.eraseAll')}
                        </Button>
                      </div>
                      <p className="t-meta">{t('portfolio.privacy.note')}</p>
                    </div>
                  </Sheet>
                </div>
              </Block>
            </div>

            <ItemDialog draft={draft} onClose={() => setDraft(null)} />
            <AboutDialog open={about} profile={d.profile} onClose={() => setAbout(false)} />
            <Dialog
              open={!!erase}
              onClose={() => setErase(null)}
              title={t('portfolio.privacy.confirmTitle')}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setErase(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="danger"
                    busy={busy === 'erase'}
                    onClick={() =>
                      void run('erase', async () => {
                        await api(`/career/portfolio/data?scope=${erase}`, { method: 'DELETE' });
                        toast.ok(t('portfolio.privacy.erased'));
                        setErase(null);
                        refreshAll();
                      })
                    }
                  >
                    {t('common.delete')}
                  </Button>
                </>
              }
            >
              <p className="text-ink-2">{erase ? t(`portfolio.privacy.confirm.${erase}`) : ''}</p>
            </Dialog>
          </div>
        );
      }}
    </Loaded>
  );
}

function swap(ids: string[], index: number, delta: number) {
  const next = [...ids];
  const [moved] = next.splice(index, 1);
  next.splice(index + delta, 0, moved);
  return next;
}
