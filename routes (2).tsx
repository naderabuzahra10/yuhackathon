import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { CheckCircle, Circle, FileArrowUp, GraduationCap, SealCheck, Trash, TreeStructure, WarningCircle } from '@phosphor-icons/react';
import { api, ApiError, errorMessage, refreshAll, upload, useApi } from '@/lib/api';
import { cx, fmtDateTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { NotFoundPage } from '@/pages/System';
import { Button, Chip, Empty, Field, Figure, Loaded, PageHeader, Sheet, Status } from '@/ui/kit';
import { Bar, type Stage, StageLine, Stop, Stops } from '@/ui/line';
import { toast, useAction } from '@/ui/overlay';

interface AdmissionApp {
  id: string;
  status: string;
  campus_id: string;
  personal: Record<string, string | number | null>;
  checklist: Array<{ key: string; required: boolean; label_en: string; label_ar: string; documentId: string | null; status: string }>;
  receipt: { ref: string; submitted_at?: string } | null;
  timeline: Array<{ at: string; status: string; note: string | null }>;
  reviewer_note: string | null;
  program: { id: string; code: string; name_en: string; name_ar: string; college_en: string; college_ar: string };
  documents: Record<string, { id: string; filename: string }>;
  completeness: { complete: boolean; missing: Array<{ key: string; label: string; kind: 'field' | 'document' }>; warnings: string[] };
}

interface Program {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  college_en: string;
  college_ar: string;
  degree: string;
  total_credits: number;
  duration_years: number;
  description_en: string;
  description_ar: string;
  criteria: Array<{ key: string; label_en: string; label_ar: string }>;
  campus_ids: string[];
  has_study_plan: boolean;
}

interface Onboarding {
  exists: boolean;
  steps: Array<{ key: string; label_en: string; label_ar: string; link: string | null; status: string; completed_at: string | null }>;
  done: number;
  total: number;
  complete: boolean;
  adviser: { name_en: string; name_ar: string; email: string; office: string };
}

interface Graduation {
  audit: {
    total_required: number;
    earned: number;
    in_progress: number;
    planned: number;
    remaining: number;
    buckets: Array<{ id: string; label_en: string; label_ar: string; required_credits: number; earned_credits: number; in_progress_credits: number; remaining_credits: number }>;
    unmet: Array<{ bucket: string; remaining_credits: number; suggestions: string[] }>;
    estimate: { terms_remaining: number; earliest_completion_term: string };
  };
  clearances: Array<{ id: string; key: string; label_en: string; label_ar: string; status: string; note: string | null }>;
  coop: { code: string; title_en: string; credits: number; status: string } | null;
  blockers: Array<{ key: string; message: string }>;
  canRequest: boolean;
  request: { status: string; receipt?: { ref: string }; registrar_note?: string | null } | null;
  policy_note: string;
}

const STAGES = ['applicant', 'admitted', 'orientation', 'current', 'graduating', 'alumni'] as const;

/* ── Journey hub: the trunk line from applicant to alumni. ── */

function JourneyHub() {
  const { t, l } = useI18n();
  const { user, can } = useSession();
  useTitle(t('journey.title'));
  const mine = useApi<{ active: AdmissionApp | null }>('/admission/applications/mine');
  const onboarding = useApi<Onboarding>('/admission/onboarding');
  const grad = useApi<Graduation>(can('academics') ? '/graduation/audit' : null);

  const app = mine.data?.active ?? null;
  const here = user?.stage === 'graduating' ? 'graduating' : user?.stage === 'current' ? (onboarding.data?.exists && !onboarding.data.complete ? 'orientation' : 'current') : app?.status === 'admitted' ? 'admitted' : 'applicant';
  const at = STAGES.indexOf(here as (typeof STAGES)[number]);
  const stages: Stage[] = STAGES.map((s, i) => ({ key: s, label: t(`journey.stage.${s}`), meta: i === at ? t('journey.youAreHere') : undefined, state: i < at ? 'done' : i === at ? 'current' : 'todo' }));

  const actions: Array<{ to: string; title: string; body?: string }> = [];
  if (here === 'applicant') actions.push(app ? { to: '/journey/admission', title: t('journey.act.continueApplication'), body: `${t('journey.applicationStatus')}: ${t(`status.${app.status}`)}` } : { to: '/journey/admission', title: t('journey.act.startApplication'), body: t('journey.act.startApplicationBody') });
  if (here === 'admitted') actions.push({ to: '/journey/admission', title: t('journey.act.acceptOffer'), body: t('journey.act.acceptOfferBody') });
  if (here === 'orientation' && onboarding.data) actions.push({ to: '/journey/onboarding', title: t('journey.act.onboarding'), body: `${onboarding.data.done}/${onboarding.data.total} ${t('journey.stepsDone')}` });
  if (can('academics')) actions.push({ to: '/academics', title: t('journey.act.academics'), body: t('journey.act.academicsBody') });
  if (grad.data) actions.push({ to: '/journey/graduation', title: here === 'graduating' ? t('journey.act.graduation') : t('journey.act.audit'), body: here === 'graduating' && grad.data.blockers.length ? t('journey.act.graduationBlocked', { n: grad.data.blockers.length }) : t('journey.act.auditBody', { earned: grad.data.audit.earned, total: grad.data.audit.total_required }) });
  if (can('career')) actions.push({ to: '/career?tab=tracker', title: t('journey.act.career') });

  const modules = [
    { to: '/journey/admission', label: t(user?.stage === 'applicant' ? 'journey.mod.admission' : 'journey.mod.admissionRecord'), show: true },
    { to: '/journey/onboarding', label: t('journey.mod.onboarding'), show: true },
    { to: '/academics', label: t('journey.mod.academics'), show: can('academics') },
    { to: '/campus', label: t('journey.mod.campus'), show: can('campusLife') },
    { to: '/career', label: t('journey.mod.career'), show: can('career') },
    { to: '/journey/graduation', label: t('journey.mod.graduation'), show: can('academics') },
  ].filter((m) => m.show);

  return (
    <div data-tone="purple">
      <PageHeader title={t('journey.title')} subtitle={t('journey.subtitle', { name: user ? l(user.name_en, user.name_ar).split(' ')[0] : '' })} />
      <section className="plate mb-7 px-5 py-6 sm:px-7" aria-label={t('journey.timeline')}>
        <StageLine stages={stages} tone="purple" label={t('journey.timeline')} />
        <p className="mt-5 border-t border-plate-rule pt-4 text-plate-muted">
          <span className="font-semibold text-plate-ink">{t(`journey.stage.${here}`)}: </span>
          {t(`journey.stageBody.${here}`)}
        </p>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Sheet flush title={t('journey.nextActions')}>
          <ul className="rows">
            {actions.map((a) => (
              <li key={a.to + a.title}>
                <Link to={a.to} className="row items-start! py-3.5!">
                  <span className="dot mt-1.5" data-tone="purple" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.title}</span>
                    {a.body ? <span className="block text-ink-2">{a.body}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
        <Sheet flush title={t('journey.modules')}>
          <ul className="rows">
            {modules.map((m) => (
              <li key={m.to}>
                <Link to={m.to} className="row min-h-11! py-2.5! font-medium">
                  {m.label}
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
      </div>
      <p className="t-meta mt-5">{t('journey.demoNote')}</p>
    </div>
  );
}

/* ── Admission ── */

const PERSONAL_FIELDS = [
  ['full_name', 'fullName', 'text'],
  ['national_id_last4', 'nationalIdLast4', 'text'],
  ['date_of_birth', 'dob', 'date'],
  ['phone', 'phone', 'tel'],
  ['high_school_gpa', 'gpa', 'number'],
  ['english_score', 'english', 'number'],
  ['nationality', 'nationality', 'text'],
  ['city', 'city', 'text'],
] as const;

function ApplicationFlow({ app }: { app: AdmissionApp }) {
  const { t, l, locale } = useI18n();
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<string | null>(null);
  const { busy, run } = useAction();
  const editable = app.status === 'draft' || app.status === 'needs_information' || app.status === 'needs_info';

  useEffect(() => {
    setForm(Object.fromEntries(PERSONAL_FIELDS.map(([key]) => [key, app.personal[key] != null ? String(app.personal[key]) : ''])));
  }, [app.id, app.personal]);

  const flow = ['draft', 'submitted', 'under_review', 'admitted', 'enrolled'];
  const at = Math.max(0, flow.indexOf(app.status === 'needs_information' ? 'under_review' : app.status === 'rejected' ? 'under_review' : app.status));
  const stages: Stage[] = flow.map((s, i) => ({ key: s, label: t(`status.${s}`), state: app.status === 'rejected' && i === 3 ? 'failed' : i < at || app.status === 'enrolled' ? 'done' : i === at ? 'current' : 'todo' }));

  const savePersonal = () =>
    void run('personal', async () => {
      setErrors({});
      const body: Record<string, string | number> = {};
      for (const [key, , type] of PERSONAL_FIELDS) if (form[key]) body[key] = type === 'number' ? Number(form[key]) : form[key];
      try {
        await api(`/admission/applications/${app.id}`, { method: 'PUT', body });
        toast.ok(t('common.save'));
        refreshAll();
      } catch (e) {
        if (e instanceof ApiError && Array.isArray(e.details)) setErrors(Object.fromEntries((e.details as Array<{ path: string; message: string }>).map((d) => [d.path, d.message])));
        else throw e;
      }
    });

  const attach = (key: string, file: File) =>
    void run(`doc-${key}`, async () => {
      const doc = await upload<{ id: string; filename: string }>('/documents', file, { kind: 'admission', label: key });
      await api(`/admission/applications/${app.id}/documents`, { body: { checklistKey: key, documentId: doc.id } });
      toast.ok(t('journey.attached'));
      refreshAll();
    });

  const submit = () =>
    void run('submit', async () => {
      setBlocked(null);
      try {
        await api(`/admission/applications/${app.id}/submit`, { body: {} });
        toast.ok(t('journey.submitted'));
        refreshAll();
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) setBlocked(errorMessage(e));
        else throw e;
      }
    });

  return (
    <div className="space-y-6">
      <Sheet>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="t-label">{t('journey.program')}</p>
            <p className="t-title mt-1">
              <span className="t-code text-purple-ink">{app.program.code}</span> {l(app.program.name_en, app.program.name_ar)}
            </p>
            <p className="t-meta">{l(app.program.college_en, app.program.college_ar)}</p>
          </div>
          <Status status={app.status} />
        </div>
        <StageLine stages={stages} tone="purple" label={t('journey.applicationStatus')} />
      </Sheet>

      {app.status === 'admitted' ? (
        <section className="plate flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="max-w-[56ch]">
            <h2 className="t-title flex items-center gap-2">
              <SealCheck size={20} weight="fill" className="text-green" />
              {t('journey.admittedTitle')}
            </h2>
            <p className="mt-1.5 text-plate-muted">{t('journey.acceptOfferNote')}</p>
          </div>
          <Button variant="primary" size="lg" busy={busy === 'accept'} onClick={() => void run('accept', async () => { await api(`/admission/applications/${app.id}/accept-offer`, { body: {} }); toast.ok(t('journey.enrolledToast')); refreshAll(); })}>
            {t('journey.acceptOffer')}
          </Button>
        </section>
      ) : null}
      {app.status === 'enrolled' ? (
        <Sheet tone="green" title={t('journey.enrolledTitle')}>
          <p className="text-ink-2">{t('journey.enrolledBody')}</p>
          <Link to="/journey/onboarding" className="btn btn-primary mt-3">
            {t('journey.onboarding')}
          </Link>
        </Sheet>
      ) : null}
      {app.status === 'rejected' ? <p className="rounded-lg bg-red-tint px-4 py-3 font-semibold text-red-ink">{t('journey.rejectedTitle')}</p> : null}
      {app.status === 'submitted' || app.status === 'under_review' ? <p className="text-ink-2">{t('journey.awaitingReview')}</p> : null}
      {app.reviewer_note ? (
        <p className="rounded-lg bg-yellow-tint px-4 py-3 text-yellow-ink">
          <span className="font-semibold">{t('journey.officerNote')}: </span>
          {app.reviewer_note}
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Sheet title={t('journey.step.personal')}>
          <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
            {PERSONAL_FIELDS.map(([key, label, type]) => (
              <Field key={key} label={t(`journey.f.${label}`)} error={errors[key]} hint={key === 'national_id_last4' ? t('journey.f.nationalIdHint') : key === 'high_school_gpa' ? t('journey.f.gpaHint') : undefined}>
                {(p) => <input {...p} type={type} className="input" value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} maxLength={key === 'national_id_last4' ? 4 : undefined} />}
              </Field>
            ))}
          </fieldset>
          {editable ? (
            <Button variant="primary" className="mt-4" busy={busy === 'personal'} onClick={savePersonal}>
              {t('common.save')}
            </Button>
          ) : null}
          <p className="t-meta mt-3">{t('journey.privacyNote')}</p>
        </Sheet>

        <div className="space-y-6">
          <Sheet flush title={t('journey.step.documents')}>
            <ul className="rows">
              {app.checklist.map((c) => {
                const doc = app.documents[c.key];
                return (
                  <li key={c.key} className="flex flex-wrap items-center gap-3 px-4.5 py-3">
                    {doc ? <CheckCircle size={20} weight="fill" className="flex-none text-green" /> : <Circle size={20} className="flex-none text-ink-3" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{l(c.label_en, c.label_ar)}</span>
                      <span className="t-meta block">{doc ? doc.filename : t(c.required ? 'common.required' : 'common.optional')}</span>
                    </span>
                    {editable ? (
                      doc ? (
                        <Button size="sm" variant="ghost" icon aria-label={t('common.remove')} busy={busy === `doc-${c.key}`} onClick={() => void run(`doc-${c.key}`, async () => { await api(`/admission/applications/${app.id}/documents/${c.key}`, { method: 'DELETE' }); refreshAll(); })}>
                          <Trash size={15} />
                        </Button>
                      ) : (
                        <label className={cx('btn btn-secondary btn-sm cursor-pointer', busy === `doc-${c.key}` && 'pointer-events-none opacity-60')}>
                          <FileArrowUp size={14} />
                          {t('common.upload')}
                          <input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,text/plain" onChange={(e) => e.target.files?.[0] && attach(c.key, e.target.files[0])} />
                        </label>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="t-meta border-t border-rule px-4.5 py-2.5">{t('journey.docsAccepted')}</p>
          </Sheet>

          {editable ? (
            <Sheet title={t('journey.step.review')} tone={app.completeness.complete ? 'green' : 'yellow'}>
              {app.completeness.complete ? (
                <p className="flex items-start gap-2 text-green-ink">
                  <CheckCircle size={18} weight="fill" className="mt-0.5 flex-none" />
                  <span>
                    <span className="font-semibold">{t('journey.complete')}. </span>
                    {t('journey.completeBody')}
                  </span>
                </p>
              ) : (
                <>
                  <p className="font-semibold text-yellow-ink">{t('journey.incomplete', { n: app.completeness.missing.length })}</p>
                  <ul className="mt-2 space-y-1">
                    {app.completeness.missing.map((m) => (
                      <li key={m.key} className="flex items-center gap-2">
                        <WarningCircle size={15} weight="fill" className="text-yellow" />
                        {m.label} <span className="t-meta">({t(`journey.kind.${m.kind}`)})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="t-meta mt-3">{t('journey.demoSubmissionBody')}</p>
              {blocked ? (
                <p role="alert" className="field-error">
                  {blocked}
                </p>
              ) : null}
              <Button variant="primary" className="mt-3" busy={busy === 'submit'} disabled={!app.completeness.complete} onClick={submit}>
                {t('journey.submitApplication')}
              </Button>
            </Sheet>
          ) : null}

          {app.receipt ? (
            <Sheet title={t('journey.receipt')}>
              <p className="fig text-2xl" dir="ltr">
                {app.receipt.ref}
              </p>
              <p className="t-meta mt-2">{t('journey.receiptNote')}</p>
            </Sheet>
          ) : null}

          <Sheet title={t('journey.statusTimeline')}>
            <Stops tone="purple">
              {app.timeline.map((e, i) => (
                <Stop key={i} state={i === app.timeline.length - 1 ? 'current' : 'done'} last={i === app.timeline.length - 1}>
                  <p className="font-semibold">{t(`status.${e.status}`)}</p>
                  {e.note ? <p className="text-ink-2">{e.note}</p> : null}
                  <p className="t-meta">{fmtDateTime(e.at, locale)}</p>
                </Stop>
              ))}
            </Stops>
          </Sheet>
        </div>
      </div>
    </div>
  );
}

function AdmissionPage() {
  const { t, l } = useI18n();
  const { user } = useSession();
  useTitle(t('journey.admission'));
  const mine = useApi<{ items: AdmissionApp[]; active: AdmissionApp | null }>('/admission/applications/mine');
  const programs = useApi<{ items: Program[]; note: string }>('/admission/programs');
  const [open, setOpen] = useState<string | null>(null);
  const { busy, run } = useAction();
  const enrolled = user?.stage === 'current' || user?.stage === 'graduating';

  return (
    <div data-tone="purple">
      <PageHeader crumbs={[{ label: t('nav.journey'), to: '/journey' }, { label: t('journey.admission') }]} title={t(enrolled ? 'journey.record.title' : 'journey.admission')} subtitle={t(enrolled ? 'journey.record.subtitle' : 'journey.admissionSubtitle')} />
      {enrolled && user ? (
        <Sheet tone="green" title={t('journey.record.heading')} className="mb-7">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
            {[
              [t('journey.record.programme'), user.program_id?.toUpperCase() ?? '—'],
              [t('journey.record.studentNo'), user.student_no ?? '—'],
              [t('journey.record.level'), user.level ?? '—'],
              [t('journey.record.campus'), user.campus_id === 'khobar' ? t('shell.khobar') : t('shell.riyadh')],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="t-label">{k}</dt>
                <dd className="fig mt-1 text-2xl">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-rule pt-3.5 text-ink-2">
            <span className="font-semibold text-ink">{t('journey.record.changeTitle')}. </span>
            {t('journey.record.changeBody')}
          </p>
          <Link to="/prereqs" className="btn btn-secondary btn-sm mt-3">
            <TreeStructure size={15} />
            {t('journey.record.explore')}
          </Link>
        </Sheet>
      ) : null}

      <Loaded q={mine}>{(d) => (d.active ? <div className="mb-8"><ApplicationFlow app={d.active} /></div> : null)}</Loaded>

      {!enrolled ? (
        <Loaded q={programs}>
          {(d) => {
            const colleges = [...new Set(d.items.map((p) => p.college_en))];
            return (
              <div className="space-y-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="t-title text-[1.1875rem]!">{t('journey.step.program')}</h2>
                  <Chip tone="yellow">{t('journey.illustrative')}</Chip>
                </div>
                {mine.data?.active ? <p className="text-ink-2">{t('journey.oneActive')}</p> : null}
                {colleges.map((college) => (
                  <section key={college}>
                    <h3 className="t-label mb-2">{l(college, d.items.find((p) => p.college_en === college)?.college_ar)}</h3>
                    <ul className="sheet rows overflow-hidden">
                      {d.items.filter((p) => p.college_en === college).map((p) => (
                        <li key={p.id}>
                          <button type="button" className="row" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                            <span className="t-code w-14 flex-none text-purple-ink">{p.code}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold">{l(p.name_en, p.name_ar)}</span>
                              <span className="t-meta block">
                                {p.degree} · {p.total_credits} {t('common.credits')} · {p.duration_years} {t('journey.years')}
                              </span>
                            </span>
                          </button>
                          {open === p.id ? (
                            <div className="border-t border-rule bg-surface-2/50 px-4.5 py-4">
                              <p className="max-w-[70ch] text-ink-2">{l(p.description_en, p.description_ar)}</p>
                              <p className="t-label mt-4 mb-1.5">{t('journey.criteria')}</p>
                              <ul className="space-y-1">
                                {p.criteria.map((c) => (
                                  <li key={c.key} className="flex gap-2">
                                    <span className="dot mt-2 size-1.5!" data-tone="purple" />
                                    {l(c.label_en, c.label_ar)}
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {!mine.data?.active && user?.stage === 'applicant' ? (
                                  <Button variant="primary" size="sm" busy={busy === p.id} onClick={() => void run(p.id, async () => { await api('/admission/applications', { body: { programId: p.id, campusId: p.campus_ids[0] } }); toast.ok(t('journey.draftCreated')); refreshAll(); })}>
                                    {t('journey.startApplication')}
                                  </Button>
                                ) : null}
                                {p.has_study_plan ? (
                                  <Link to={`/prereqs/${p.id}`} className="btn btn-secondary btn-sm">
                                    <TreeStructure size={15} />
                                    {t('nav.prereqs')}
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                <p className="t-meta">{d.note}</p>
              </div>
            );
          }}
        </Loaded>
      ) : null}
    </div>
  );
}

/* ── Onboarding ── */

function OnboardingPage() {
  const { t, l, locale } = useI18n();
  useTitle(t('journey.onboarding'));
  const q = useApi<Onboarding>('/admission/onboarding');
  const { busy, run } = useAction();
  return (
    <div data-tone="purple">
      <PageHeader crumbs={[{ label: t('nav.journey'), to: '/journey' }, { label: t('journey.onboarding') }]} title={t('journey.onboarding')} subtitle={t('journey.onboardingSubtitle')} />
      <Loaded q={q}>
        {(d) =>
          d.exists ? (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Sheet
                title={
                  <span className="flex items-baseline gap-2.5">
                    <span className="fig text-[2rem]">
                      {d.done}/{d.total}
                    </span>
                    {t('journey.stepsDone')}
                  </span>
                }
              >
                <Stops tone="purple">
                  {d.steps.map((s, i) => {
                    const done = s.status === 'done';
                    const current = !done && d.steps.findIndex((x) => x.status !== 'done') === i;
                    return (
                      <Stop key={s.key} state={done ? 'done' : current ? 'current' : 'todo'} last={i === d.steps.length - 1}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className={cx('font-semibold', done && 'text-ink-2')}>{l(s.label_en, s.label_ar)}</p>
                            {s.completed_at ? <p className="t-meta">{fmtDateTime(s.completed_at, locale)}</p> : null}
                          </div>
                          <div className="flex gap-2">
                            {s.link ? (
                              <Link to={s.link} className="btn btn-ghost btn-sm">
                                {t('common.open')}
                              </Link>
                            ) : null}
                            {!done ? (
                              <Button size="sm" variant="primary" busy={busy === s.key} onClick={() => void run(s.key, async () => { const r = await api<{ complete: boolean }>(`/admission/onboarding/${s.key}/complete`, { body: {} }); toast.ok(t(r.complete ? 'journey.onboardingComplete' : 'journey.stepDone')); refreshAll(); })}>
                                {t('journey.markDone')}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </Stop>
                    );
                  })}
                </Stops>
                {d.complete ? (
                  <p className="mt-4 border-t border-rule pt-3.5 font-semibold text-green-ink">
                    {t('journey.allDone')}. <Link to="/today" className="link">{t('nav.today')}</Link>
                  </p>
                ) : null}
              </Sheet>
              <Sheet title={t('journey.adviser')}>
                <p className="t-lead">{l(d.adviser.name_en, d.adviser.name_ar)}</p>
                <p className="mt-1 text-ink-2" dir="ltr">{d.adviser.email}</p>
                <p className="text-ink-2">{d.adviser.office}</p>
                <p className="t-meta mt-3">{t('journey.adviserNote')}</p>
              </Sheet>
            </div>
          ) : (
            <Sheet>
              <Empty icon={<GraduationCap size={22} />} title={t('journey.noOnboarding')} body={t('journey.noOnboardingBody')} action={<Link to="/journey/admission" className="btn btn-primary">{t('journey.admission')}</Link>} />
            </Sheet>
          )
        }
      </Loaded>
    </div>
  );
}

/* ── Graduation ── */

function GraduationPage() {
  const { t, l } = useI18n();
  useTitle(t('journey.graduation'));
  const q = useApi<Graduation>('/graduation/audit');
  const { busy, run } = useAction();
  const act = (key: string, fn: () => Promise<void>) =>
    void run(key, async () => {
      await fn();
      refreshAll();
    });
  return (
    <div data-tone="purple">
      <Loaded q={q}>
        {(d) => {
          const pct = Math.round((d.audit.earned / d.audit.total_required) * 100);
          const requested = !!d.request && ['submitted', 'under_review', 'approved'].includes(d.request.status);
          return (
            <>
              <PageHeader
                crumbs={[{ label: t('nav.journey'), to: '/journey' }, { label: t('journey.graduation') }]}
                title={t('journey.graduation')}
                subtitle={t('journey.graduationSubtitle')}
                actions={
                  <Button variant="primary" disabled={!d.canRequest || requested} busy={busy === 'request'} onClick={() => act('request', async () => { const r = await api<{ receipt: { ref: string } }>('/graduation/requests', { body: {} }); toast.ok(`${t('journey.requestSubmitted')} · ${r.receipt.ref}`); })}>
                    <GraduationCap size={17} weight="fill" />
                    {t('journey.requestGraduation')}
                  </Button>
                }
              />
              {d.request ? (
                <Sheet className="mb-6" title={t('journey.requestStatus')} action={<Status status={d.request.status} />}>
                  {d.request.receipt ? <p className="fig text-2xl" dir="ltr">{d.request.receipt.ref}</p> : null}
                  {d.request.registrar_note ? <p className="mt-2 text-ink-2">{d.request.registrar_note}</p> : null}
                  <Link to="/career" className="btn btn-secondary btn-sm mt-3">{t('journey.openHandoff')}</Link>
                </Sheet>
              ) : null}

              <Sheet className="mb-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <p className="flex items-baseline gap-3">
                    <span className="fig text-[3.25rem] text-purple-ink">{pct}%</span>
                    <span className="text-ink-2">{t('journey.overall')}</span>
                  </p>
                  <p className="t-meta">{t('journey.estimate', { n: d.audit.estimate.terms_remaining, term: d.audit.estimate.earliest_completion_term })}</p>
                </div>
                <div className="mt-4">
                  <Bar value={d.audit.earned} max={d.audit.total_required} tone="purple" label={t('journey.overall')} />
                </div>
              </Sheet>

              <div className="sheet mb-6 grid divide-rule overflow-hidden max-sm:divide-y sm:grid-cols-4 sm:divide-x rtl:sm:divide-x-reverse">
                <Figure value={d.audit.earned} label={t('journey.stat.earned')} tone="green" />
                <Figure value={d.audit.in_progress} label={t('journey.stat.inProgress')} tone="blue" />
                <Figure value={d.audit.planned} label={t('journey.stat.planned')} />
                <Figure value={d.audit.remaining} label={t('journey.stat.remaining')} tone={d.audit.remaining ? 'yellow' : 'green'} />
              </div>

              {d.blockers.length ? (
                <Sheet tone="red" className="mb-6" title={t('journey.blockers', { n: d.blockers.length })}>
                  <ul className="space-y-1.5">
                    {d.blockers.map((b) => (
                      <li key={b.key} className="flex gap-2">
                        <WarningCircle size={17} weight="fill" className="mt-0.5 flex-none text-red" />
                        {b.message}
                      </li>
                    ))}
                  </ul>
                </Sheet>
              ) : (
                <p className="mb-6 flex items-center gap-2 font-semibold text-green-ink">
                  <CheckCircle size={18} weight="fill" />
                  {t('journey.allMet')}
                </p>
              )}

              <div className="grid items-start gap-6 lg:grid-cols-2">
                <Sheet flush title={t('academics.req.buckets')}>
                  <ul className="rows">
                    {d.audit.buckets.map((b) => (
                      <li key={b.id} className="px-4.5 py-3">
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                          <span className="font-semibold">{l(b.label_en, b.label_ar)}</span>
                          {b.remaining_credits === 0 ? <Chip tone="green">{t('academics.plan.met')}</Chip> : <span className="t-meta">{t('academics.plan.remaining', { n: b.remaining_credits })}</span>}
                        </div>
                        <Bar value={b.earned_credits} max={b.required_credits} tone={b.remaining_credits === 0 ? 'green' : 'purple'} label={l(b.label_en, b.label_ar)} />
                      </li>
                    ))}
                  </ul>
                  <p className="t-meta border-t border-rule px-4.5 py-3">{d.policy_note}</p>
                </Sheet>
                <div className="space-y-6">
                  <Sheet flush title={t('journey.clearances')}>
                    <ul className="rows">
                      {d.clearances.map((c) => (
                        <li key={c.id} className="row">
                          {c.status === 'cleared' ? <CheckCircle size={19} weight="fill" className="flex-none text-green" /> : <Circle size={19} className="flex-none text-ink-3" />}
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{l(c.label_en, c.label_ar)}</span>
                            {c.note ? <span className="t-meta block">{c.note}</span> : null}
                          </span>
                          <Status status={c.status} />
                        </li>
                      ))}
                    </ul>
                  </Sheet>
                  {d.coop ? (
                    <Sheet title={t('journey.coop')} action={<Status status={d.coop.status} />}>
                      <p>
                        <span className="t-code">{d.coop.code}</span> {d.coop.title_en} · {d.coop.credits} {t('common.credits')}
                      </p>
                      <Link to="/career" className="link mt-2 inline-block text-[0.8125rem]">
                        {t('journey.coopLink')}
                      </Link>
                    </Sheet>
                  ) : null}
                  <Sheet title={t('journey.demoFixture')}>
                    <p className="text-ink-2">{t('journey.demoFixtureBody')}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {d.audit.in_progress > 0 ? (
                        <Button size="sm" busy={busy === 'post'} onClick={() => act('post', async () => { const r = await api<{ courses: unknown[] }>('/graduation/demo/post-term-results', { body: {} }); toast.ok(t('journey.postedResults', { n: r.courses.length })); })}>
                          {t('journey.postResults')}
                        </Button>
                      ) : null}
                      {d.audit.remaining > 0 ? (
                        <Button size="sm" busy={busy === 'fulfil'} onClick={() => act('fulfil', async () => { await api('/graduation/demo/fulfil-requirement', { body: {} }); })}>
                          {t('journey.fulfilRequirement')}
                        </Button>
                      ) : null}
                      {d.clearances.some((c) => c.status !== 'cleared') ? (
                        <Button size="sm" busy={busy === 'clear'} onClick={() => act('clear', async () => { await api('/graduation/demo/clear-clearances', { body: {} }); toast.ok(t('journey.clearancesCleared')); })}>
                          {t('journey.clearClearances')}
                        </Button>
                      ) : null}
                    </div>
                  </Sheet>
                </div>
              </div>
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

export default function JourneyRoutes() {
  return (
    <Routes>
      <Route index element={<JourneyHub />} />
      <Route path="admission" element={<AdmissionPage />} />
      <Route path="onboarding" element={<OnboardingPage />} />
      <Route path="graduation" element={<GraduationPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
