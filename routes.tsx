import { type ReactNode, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CaretLeft, CaretRight, FileText, Stamp } from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { cx, fmtDate, fmtDateTime, fmtRange } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { type Role, useSession } from '@/lib/session';
import { NotFoundPage } from '@/pages/System';
import { Checks } from '@/pages/academics/Core';
import { Avatar, Button, Chip, Empty, Field, Loaded, PageHeader, Segmented, Sheet, Status } from '@/ui/kit';
import { toast, useAction } from '@/ui/overlay';

function useDeskAction() {
  const { busy, run } = useAction();
  const act = (key: string, fn: () => Promise<unknown>, ok?: string) =>
    void run(key, async () => {
      await fn();
      refreshAll();
    }, ok);
  return { busy, act };
}

function Desk({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useI18n();
  useTitle(title);
  return (
    <div data-tone="yellow">
      <PageHeader crumbs={[{ label: t('nav.staff'), to: '/staff' }, { label: title }]} title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}

function EmptySheet({ title, body }: { title: string; body?: string }) {
  return (
    <Sheet>
      <Empty icon={<Stamp size={22} />} title={title} body={body} />
    </Sheet>
  );
}

/* ── Desk hub ── */

function Hub() {
  const { t, has } = useI18n();
  const { hasRole } = useSession();
  useTitle(t('nav.staff'));
  const today = useApi<{ queues: Array<{ key: string; title: string; count: number; link: string }> }>('/today');
  const { rtl } = useI18n();
  const Caret = rtl ? CaretLeft : CaretRight;
  const all: Array<{ to: string; title: string; body: string; roles: Role[] }> = [
    { to: '/staff/academics/excuses', title: t('academics.staff.title'), body: t('academics.staff.subtitle'), roles: ['reviewer'] },
    { to: '/staff/campus/resources', title: t('campus.staff.res.title'), body: t('campus.staff.res.subtitle'), roles: ['reviewer', 'registrar'] },
    { to: '/staff/campus/community', title: t('social.staff.title'), body: t('social.staff.body'), roles: ['reviewer', 'student_affairs'] },
    { to: '/staff/feedback', title: t('fb.staff.title'), body: t('fb.staff.subtitle'), roles: ['reviewer', 'registrar'] },
    { to: '/staff/journey/admissions', title: t('journey.staff.admissions'), body: t('journey.staff.admissionsSubtitle'), roles: ['admission_officer'] },
    { to: '/staff/journey/graduation', title: t('journey.staff.graduation'), body: t('journey.staff.graduationSubtitle'), roles: ['registrar'] },
    { to: '/staff/campus/lost-found', title: t('campus.staff.lf.title'), body: t('campus.staff.lf.subtitle'), roles: ['security'] },
    { to: '/staff/campus/clubs', title: t('campus.staff.clubs.title'), body: t('campus.staff.clubs.subtitle'), roles: ['club_lead'] },
  ];
  const desks = all.filter((d) => hasRole(...d.roles));
  const countFor = (to: string) => today.data?.queues.find((q) => q.link === to)?.count;
  return (
    <div data-tone="yellow">
      <PageHeader title={t('nav.staff')} subtitle={t('journey.staffBody')} />
      {desks.length ? (
        <ul className="sheet rows overflow-hidden">
          {desks.map((d) => {
            const n = countFor(d.to);
            return (
              <li key={d.to}>
                <Link to={d.to} className="row items-start! py-4!">
                  <span className="w-12 flex-none text-center">
                    <span className={cx('fig block text-[1.875rem]', n ? 'text-yellow-ink' : 'text-ink-3')}>{n ?? 0}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-lead block">{d.title}</span>
                    <span className="block text-ink-2">{d.body}</span>
                  </span>
                  <Caret size={14} weight="bold" className="mt-1.5 flex-none text-ink-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptySheet title={t('academics.staff.forbidden')} body={t('academics.staff.forbiddenBody')} />
      )}
      {today.data?.queues.filter((q) => !desks.some((d) => d.to === q.link)).map((q) => (
        <Link key={q.key} to={q.link} className="link mt-4 block">
          {has(`today.queue.${q.key}`) ? t(`today.queue.${q.key}`) : q.title} · {q.count}
        </Link>
      ))}
    </div>
  );
}

/* ── Excuse review ── */

interface ReviewExcuse {
  id: string;
  student_name_en: string;
  student_name_ar: string;
  sessions: Array<{ id: string; course_code: string; title_en: string; title_ar: string; session_date: string; start_time: string }>;
  type: string;
  reason: string;
  from_date: string | null;
  to_date: string | null;
  reference: string | null;
  portal_request_id: string | null;
  documents: Array<{ id: string; filename: string }>;
  extracted: Record<string, { value: string } | null> | null;
  status: string;
  reviewer_note: string | null;
  checks: Array<{ id: string; label: string; status: 'pass' | 'warn' | 'fail'; explanation: string }>;
}

function ExcuseQueue() {
  const { t, l, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const q = useApi<ReviewExcuse[]>('/academics/review/excuses', { status: status === 'open' ? undefined : status });
  return (
    <Desk title={t('academics.staff.title')} subtitle={t('academics.staff.subtitle')}>
      <div className="scroll-x mb-5">
        <Segmented label={t('common.status')} value={status} onChange={(v) => setParams(v === 'open' ? {} : { status: v }, { replace: true })} options={['open', 'accepted', 'rejected', 'needs_information'].map((s) => ({ value: s, label: s === 'open' ? t('academics.staff.open') : t(`status.${s}`) }))} />
      </div>
      <Loaded q={q}>
        {(all) => {
          const list = all.filter((e) => status !== 'open' || ['submitted', 'under_review', 'needs_information'].includes(e.status));
          return list.length ? (
            <ul className="sheet rows overflow-hidden">
              {list.map((e) => (
                <li key={e.id}>
                  <Link to={`/staff/academics/excuses/${e.id}`} className="row items-start! py-3.5!">
                    <Avatar name={e.student_name_en} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{l(e.student_name_en, e.student_name_ar)}</span>
                      <span className="block num">{e.sessions.map((s) => `${s.course_code} · ${fmtDate(s.session_date, locale, { year: undefined })} ${s.start_time}`).join(' + ')}</span>
                      <span className="t-meta block">
                        {t(`academics.excuses.type.${e.type}`)} · {e.from_date ? fmtRange(e.from_date, e.to_date, locale) : ''} · {t('academics.staff.files', { n: e.documents.length })}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.checks.filter((c) => c.status !== 'pass').map((c) => (
                          <Chip key={c.id} tone={c.status === 'fail' ? 'red' : 'yellow'}>
                            {c.label}
                          </Chip>
                        ))}
                      </span>
                    </span>
                    <Status status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptySheet title={t('academics.staff.empty')} />
          );
        }}
      </Loaded>
    </Desk>
  );
}

function ExcuseReview() {
  const { id } = useParams();
  const { t, l, locale } = useI18n();
  const navigate = useNavigate();
  const q = useApi<ReviewExcuse>(id ? `/academics/review/excuses/${id}` : null);
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  const decide = (decision: string) =>
    void run(decision, async () => {
      await api(`/academics/review/excuses/${id}/decision`, { body: { decision, note } });
      toast.ok(t(`status.${decision}`));
      refreshAll();
      navigate('/staff/academics/excuses');
    });
  return (
    <Loaded q={q}>
      {(e) => {
        const open = ['submitted', 'under_review', 'needs_information'].includes(e.status);
        return (
          <div data-tone="yellow">
            <PageHeader
              crumbs={[{ label: t('nav.staff'), to: '/staff' }, { label: t('academics.staff.title'), to: '/staff/academics/excuses' }, { label: l(e.student_name_en, e.student_name_ar) }]}
              title={l(e.student_name_en, e.student_name_ar)}
              subtitle={e.sessions.map((s) => `${s.course_code} · ${fmtDate(s.session_date, locale)} ${s.start_time}`).join(' + ')}
              actions={<Status status={e.status} />}
            />
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <Sheet title={t('academics.staff.request')}>
                  <dl className="space-y-3">
                    {[
                      [t('academics.excuses.typeLabel'), t(`academics.excuses.type.${e.type}`)],
                      [t('academics.excuses.reason'), e.reason || '—'],
                      [t('academics.excuses.dates'), e.from_date ? fmtRange(e.from_date, e.to_date, locale) : '—'],
                      [t('academics.excuses.reference'), e.reference ?? '—'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="t-label">{k}</dt>
                        <dd className="mt-0.5">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="t-meta mt-3 border-t border-rule pt-3">{t('academics.staff.readOnly')}</p>
                </Sheet>
                <Sheet title={t('academics.excuses.files')}>
                  {e.documents.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {e.documents.map((d) => (
                        <li key={d.id}>
                          <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="chip chip-outline h-8! px-3! hover:bg-surface-2">
                            <FileText size={14} />
                            {d.filename}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-ink-2">{t('academics.staff.noEvidence')}</p>
                  )}
                  <p className="t-meta mt-3">
                    {t('academics.staff.extracted')}: {t('academics.staff.extractionNote')}
                  </p>
                </Sheet>
              </div>
              <div className="space-y-6">
                <Sheet flush title={t('academics.register.checks')}>
                  <Checks checks={e.checks} />
                </Sheet>
                <Sheet title={t('academics.staff.decision')}>
                  {open ? (
                    <>
                      <Field label={t('academics.staff.notePlaceholder')}>{(p) => <textarea {...p} className="textarea" value={note} onChange={(ev) => setNote(ev.target.value)} />}</Field>
                      <div className="mt-3.5 flex flex-wrap gap-2">
                        <Button variant="primary" busy={busy === 'accepted'} disabled={!note.trim()} onClick={() => decide('accepted')}>
                          {t('academics.staff.accept')}
                        </Button>
                        <Button busy={busy === 'needs_information'} disabled={!note.trim()} onClick={() => decide('needs_information')}>
                          {t('academics.staff.needsInfo')}
                        </Button>
                        <Button variant="danger" busy={busy === 'rejected'} disabled={!note.trim()} onClick={() => decide('rejected')}>
                          {t('academics.staff.reject')}
                        </Button>
                      </div>
                      <p className="t-meta mt-3">{t('academics.staff.treatmentNote')}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">{t('academics.staff.decided', { status: t(`status.${e.status}`) })}</p>
                      {e.reviewer_note ? <p className="mt-1 text-ink-2">{e.reviewer_note}</p> : null}
                    </>
                  )}
                </Sheet>
              </div>
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── Admissions and graduation ── */

interface ReviewApplication {
  id: string;
  status: string;
  submitted_at: string | null;
  personal: Record<string, string | number | null>;
  program: { code: string; name_en: string; name_ar: string };
  applicant: { name_en: string; name_ar: string; email: string };
  completeness: { complete: boolean; missing: Array<{ label: string }> };
  documents: Record<string, { id: string; filename: string }>;
}

function DecisionForm({ options, placeholder, onDecide, busy }: { options: string[]; placeholder: string; onDecide: (decision: string, note: string) => void; busy: boolean }) {
  const { t } = useI18n();
  const [decision, setDecision] = useState(options[0]);
  const [note, setNote] = useState('');
  return (
    <div className="space-y-3 border-t border-rule px-4.5 py-4">
      <Segmented label={t('journey.staff.decision')} value={decision} onChange={setDecision} options={options.map((o) => ({ value: o, label: t(`status.${o}`) }))} />
      <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <Button variant="primary" busy={busy} disabled={note.trim().length < 3} onClick={() => onDecide(decision, note)}>
        {t('journey.staff.recordDecision')}
      </Button>
    </div>
  );
}

function AdmissionsDesk() {
  const { t, l, locale } = useI18n();
  const q = useApi<{ items: ReviewApplication[] }>('/admission/review/applications');
  const { busy, act } = useDeskAction();
  return (
    <Desk title={t('journey.staff.admissions')} subtitle={t('journey.staff.admissionsSubtitle')}>
      <Loaded q={q}>
        {(d) =>
          d.items.length ? (
            <div className="space-y-4">
              {d.items.map((a) => {
                const open = ['submitted', 'under_review'].includes(a.status);
                return (
                  <div key={a.id} className="sheet overflow-hidden">
                    <div className="flex flex-wrap items-start gap-x-5 gap-y-2 px-4.5 py-4">
                      <Avatar name={a.applicant.name_en} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="t-lead">{l(a.applicant.name_en, a.applicant.name_ar)}</p>
                        <p className="t-meta">
                          <span className="t-code">{a.program.code}</span> {l(a.program.name_en, a.program.name_ar)} · {a.submitted_at ? fmtDateTime(a.submitted_at, locale) : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Chip tone={a.completeness.complete ? 'green' : 'yellow'}>{a.completeness.complete ? t('journey.complete') : t('journey.incomplete', { n: a.completeness.missing.length })}</Chip>
                          {a.personal.high_school_gpa != null ? <Chip variant="outline">{t('journey.f.gpa')}: {a.personal.high_school_gpa}</Chip> : null}
                          {Object.values(a.documents).map((doc) => (
                            <a key={doc.id} href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="chip chip-outline hover:bg-surface-2">
                              <FileText size={12} />
                              {doc.filename}
                            </a>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Status status={a.status} />
                        {a.status === 'submitted' ? (
                          <Button size="sm" busy={busy === `start-${a.id}`} onClick={() => act(`start-${a.id}`, () => api(`/admission/review/applications/${a.id}/start-review`, { body: {} }))}>
                            {t('journey.staff.startReview')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {open ? (
                      <DecisionForm options={['admitted', 'needs_information', 'rejected']} placeholder={t('journey.staff.notePlaceholder')} busy={busy === `dec-${a.id}`} onDecide={(decision, note) => act(`dec-${a.id}`, () => api(`/admission/review/applications/${a.id}/decision`, { body: { decision, note } }), t('journey.decisionRecorded'))} />
                    ) : null}
                  </div>
                );
              })}
              <p className="t-meta">{t('journey.staff.decisionNote')}</p>
            </div>
          ) : (
            <EmptySheet title={t('journey.staff.emptyQueue')} body={t('journey.staff.emptyQueueBody')} />
          )
        }
      </Loaded>
    </Desk>
  );
}

interface GradRequest {
  id: string;
  student_id: string;
  status: string;
  created_at: string;
  student?: { name_en: string; name_ar: string };
  student_name_en?: string;
  student_name_ar?: string;
  clearances?: Array<{ key: string; label_en: string; label_ar: string; status: string }>;
  audit?: { earned: number; total_required: number; remaining: number };
}

function GraduationDesk() {
  const { t, l, locale } = useI18n();
  const q = useApi<{ items: GradRequest[] }>('/graduation/review/requests');
  const { busy, act } = useDeskAction();
  return (
    <Desk title={t('journey.staff.graduation')} subtitle={t('journey.staff.graduationSubtitle')}>
      <Loaded q={q}>
        {(d) =>
          d.items.length ? (
            <div className="space-y-4">
              {d.items.map((r) => {
                const name = l(r.student?.name_en ?? r.student_name_en ?? r.student_id, r.student?.name_ar ?? r.student_name_ar);
                const open = ['submitted', 'under_review'].includes(r.status);
                return (
                  <div key={r.id} className="sheet overflow-hidden">
                    <div className="flex flex-wrap items-start gap-x-5 gap-y-2 px-4.5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="t-lead">{name}</p>
                        <p className="t-meta">{fmtDateTime(r.created_at, locale)}</p>
                        {r.audit ? (
                          <p className="mt-1.5 num">
                            {t('journey.staff.snapshot')}: {r.audit.earned} / {r.audit.total_required}
                          </p>
                        ) : null}
                      </div>
                      <Status status={r.status} />
                    </div>
                    {r.clearances?.length ? (
                      <ul className="rows border-t border-rule">
                        {r.clearances.map((c) => (
                          <li key={c.key} className="row min-h-11! py-2.5!">
                            <span className="min-w-0 flex-1">{l(c.label_en, c.label_ar)}</span>
                            <Status status={c.status} />
                            {c.status !== 'cleared' ? (
                              <Button size="sm" busy={busy === `${r.id}-${c.key}`} onClick={() => act(`${r.id}-${c.key}`, () => api(`/graduation/clearances/${c.key}/clear`, { body: { studentId: r.student_id, note: 'Cleared by registrar (demo)' } }))}>
                                {t('journey.staff.clear')}
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {open ? (
                      <DecisionForm options={['approved', 'needs_information', 'rejected']} placeholder={t('journey.staff.gradNotePlaceholder')} busy={busy === `dec-${r.id}`} onDecide={(decision, note) => act(`dec-${r.id}`, () => api(`/graduation/review/requests/${r.id}/decision`, { body: { decision, note } }), t('journey.decisionRecorded'))} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptySheet title={t('journey.staff.emptyQueue')} body={t('journey.staff.emptyGradBody')} />
          )
        }
      </Loaded>
    </Desk>
  );
}

/* ── Security desk ── */

interface LostRequest {
  id: string;
  public_id: string;
  item: string;
  category: string;
  lost_date: string;
  description: string | null;
  status: string;
  campus_id: string;
  owner: { name_en: string; name_ar: string };
  last_location: { name_en: string; name_ar: string } | null;
  last_location_text: string | null;
}

interface FoundItem {
  id: string;
  item: string;
  found_date: string;
  status: string;
  matched_request_id: string | null;
  found_location: { name_en: string; name_ar: string } | null;
}

function SecurityDesk() {
  const { t, l, locale } = useI18n();
  const q = useApi<{ items: LostRequest[] }>('/campus/security/lost-found');
  const found = useApi<FoundItem[]>('/campus/security/found-items');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const { busy, act } = useDeskAction();
  return (
    <Desk title={t('campus.staff.lf.title')} subtitle={t('campus.staff.lf.subtitle')}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Sheet flush title={t('campus.staff.lf.recent')}>
          <Loaded q={q} skeleton={<div className="p-4.5"><div className="skeleton h-32" /></div>}>
            {(d) =>
              d.items.length ? (
                <ul className="rows">
                  {d.items.map((r) => {
                    const on = selected === r.id;
                    const place = r.last_location ? l(r.last_location.name_en, r.last_location.name_ar) : r.last_location_text;
                    return (
                      <li key={r.id}>
                        <button type="button" className={cx('row items-start! py-3.5!', on && 'bg-surface-2')} aria-expanded={on} onClick={() => { setSelected(on ? null : r.id); setNote(''); setConfirmed(false); }}>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{r.item}</span>
                            <span className="t-meta block">
                              <span className="t-code" dir="ltr">{r.public_id}</span> · {l(r.owner.name_en, r.owner.name_ar)} · {fmtDate(r.lost_date, locale, { year: undefined })}
                              {place ? ` · ${place}` : ''}
                            </span>
                          </span>
                          <Status status={r.status} />
                        </button>
                        {on ? (
                          <div className="space-y-3 border-t border-rule bg-surface-2/50 px-4.5 py-4">
                            {r.description ? <p className="text-ink-2">{r.description}</p> : null}
                            {['reported', 'searching'].includes(r.status) ? (
                              <>
                                <Field label={t('campus.staff.lf.note')}>{(p) => <input {...p} className="input" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
                                <div className="flex flex-wrap gap-2">
                                  <Button variant="primary" busy={busy === 'found'} onClick={() => act('found', () => api(`/campus/security/lost-found/${r.id}/found`, { body: { collection_location_id: r.campus_id === 'khobar' ? 'khb_security' : 'ryd_security', note: note || undefined } }), t('campus.staff.lf.foundDone'))}>
                                    {t('campus.staff.lf.markFound')}
                                  </Button>
                                  {r.status === 'reported' ? (
                                    <Button busy={busy === 'searching'} onClick={() => act('searching', () => api(`/campus/security/lost-found/${r.id}/searching`, { body: {} }))}>
                                      {t('campus.staff.lf.markSearching')}
                                    </Button>
                                  ) : null}
                                </div>
                                <p className="t-meta">{t('campus.staff.lf.collectionLocationHint')}</p>
                              </>
                            ) : null}
                            {['found', 'ready_for_collection'].includes(r.status) ? (
                              <>
                                <label className="flex cursor-pointer items-start gap-2.5">
                                  <input type="checkbox" className="mt-0.5 size-4" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                                  <span>{t('campus.staff.lf.receiverConfirmed')}</span>
                                </label>
                                <Button variant="primary" disabled={!confirmed} busy={busy === 'handover'} onClick={() => act('handover', () => api(`/campus/security/lost-found/${r.id}/handover`, { body: { verified_by: 'student_id_card', receiver_name_confirmed: confirmed } }), t('campus.staff.lf.handoverDone'))}>
                                  {t('campus.staff.lf.verifyHandover')}
                                </Button>
                              </>
                            ) : null}
                            {!['collected', 'closed'].includes(r.status) ? (
                              <Button variant="ghost" size="sm" busy={busy === 'close'} onClick={() => act('close', () => api(`/campus/security/lost-found/${r.id}/close`, { body: {} }), t('campus.staff.lf.closedDone'))}>
                                {t('campus.staff.lf.closeRequest')}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4.5 py-5 text-ink-2">{t('campus.staff.lf.noRequests')}</p>
              )
            }
          </Loaded>
        </Sheet>
        <Sheet flush title={t('campus.staff.lf.foundItems')}>
          {found.data?.length ? (
            <ul className="rows">
              {found.data.map((f) => (
                <li key={f.id} className="px-4.5 py-3.5">
                  <p className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{f.item}</span>
                    <Status status={f.status} />
                  </p>
                  <p className="t-meta">
                    {t('campus.staff.lf.foundWhere')}: {f.found_location ? l(f.found_location.name_en, f.found_location.name_ar) : '—'} · {fmtDate(f.found_date, locale, { year: undefined })}
                  </p>
                  {!f.matched_request_id && selected ? (
                    <Button size="sm" className="mt-2" busy={busy === `link-${f.id}`} onClick={() => act(`link-${f.id}`, () => api(`/campus/security/found-items/${f.id}/link`, { body: { requestId: selected } }), t('campus.staff.lf.linked'))}>
                      {t('campus.staff.lf.link')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4.5 py-5 text-ink-2">{t('campus.staff.lf.noMatches')}</p>
          )}
          <p className="t-meta border-t border-rule px-4.5 py-3">{t('campus.staff.lf.selectRequest')}</p>
        </Sheet>
      </div>
    </Desk>
  );
}

/* ── Moderation ── */

function ResourceDesk() {
  const { t, l, locale } = useI18n();
  const q = useApi<{ items: Array<{ id: string; course_code: string; title: string; description: string; author: { name_en: string; name_ar: string } | null; status: string; created_at: string; document: { id: string; filename: string } | null }>; reports: Array<{ id: string; resource_id: string; reason: string; status: string; resource_title?: string }> }>('/campus/moderation/resources');
  const { busy, act } = useDeskAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <Desk title={t('campus.staff.res.title')} subtitle={t('campus.staff.res.subtitle')}>
      <Loaded q={q}>
        {(d) => {
          const reports = d.reports.filter((r) => r.status === 'open');
          return (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Sheet flush title={t('campus.staff.res.queue')}>
                {d.items.length ? (
                  <ul className="rows">
                    {d.items.map((r) => (
                      <li key={r.id} className="px-4.5 py-4">
                        <p className="flex flex-wrap items-center gap-2">
                          <Chip tone="blue">
                            <span className="t-code">{r.course_code}</span>
                          </Chip>
                          <Status status={r.status} />
                        </p>
                        <p className="t-lead mt-1.5">{r.title}</p>
                        <p className="text-ink-2">{r.description}</p>
                        <p className="t-meta mt-1">
                          {r.author ? l(r.author.name_en, r.author.name_ar) : ''} · {fmtDate(r.created_at, locale)}
                        </p>
                        {r.document ? (
                          <a href={`/api/documents/${r.document.id}/file`} target="_blank" rel="noreferrer" className="link mt-1.5 inline-flex items-center gap-1 text-[0.8125rem]">
                            <FileText size={13} />
                            {t('campus.staff.res.openFile')}
                          </a>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input className="input max-w-xs" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder={t('campus.staff.res.decisionNote')} aria-label={t('campus.staff.res.decisionNote')} />
                          <Button variant="primary" size="sm" busy={busy === `pub-${r.id}`} onClick={() => act(`pub-${r.id}`, () => api(`/campus/moderation/resources/${r.id}`, { body: { decision: 'published', note: notes[r.id] || undefined } }), t('campus.staff.res.done'))}>
                            {t('campus.staff.res.publish')}
                          </Button>
                          <Button variant="danger" size="sm" busy={busy === `rej-${r.id}`} onClick={() => act(`rej-${r.id}`, () => api(`/campus/moderation/resources/${r.id}`, { body: { decision: 'rejected', note: notes[r.id] || undefined } }), t('campus.staff.res.done'))}>
                            {t('campus.staff.res.reject')}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4.5 py-5 text-ink-2">{t('campus.staff.res.empty')}</p>
                )}
              </Sheet>
              <Sheet flush title={t('campus.staff.res.reports')}>
                {reports.length ? (
                  <ul className="rows">
                    {reports.map((r) => (
                      <li key={r.id} className="px-4.5 py-3.5">
                        {r.resource_title ? <p className="font-semibold">{r.resource_title}</p> : null}
                        <p className="text-ink-2">{r.reason}</p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Button size="sm" busy={busy === `dis-${r.id}`} onClick={() => act(`dis-${r.id}`, () => api(`/campus/moderation/reports/${r.id}/resolve`, { body: { action: 'dismiss' } }), t('campus.staff.res.done'))}>
                            {t('campus.staff.res.dismiss')}
                          </Button>
                          <Button size="sm" variant="danger" busy={busy === `unp-${r.id}`} onClick={() => act(`unp-${r.id}`, () => api(`/campus/moderation/reports/${r.id}/resolve`, { body: { action: 'unpublish' } }), t('campus.staff.res.done'))}>
                            {t('campus.staff.res.unpublish')}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4.5 py-5 text-ink-2">{t('campus.staff.res.noReports')}</p>
                )}
              </Sheet>
            </div>
          );
        }}
      </Loaded>
    </Desk>
  );
}

function CommunityDesk() {
  const { t } = useI18n();
  const q = useApi<Array<{ id: string; type: string; reason: string | null; note: string | null; count?: number; excerpt?: string; body?: string }>>('/campus/community/reports');
  const { busy, act } = useDeskAction();
  return (
    <Desk title={t('social.staff.title')} subtitle={t('social.staff.body')}>
      <Loaded q={q}>
        {(list) =>
          list.length ? (
            <ul className="sheet rows overflow-hidden">
              {list.map((r) => (
                <li key={r.id} className="px-4.5 py-4">
                  <p className="flex flex-wrap items-center gap-2">
                    <Chip variant="outline">{t(`social.staff.type.${r.type}`)}</Chip>
                    {r.reason ? <Chip tone="yellow">{t(`community.reason.${r.reason}`)}</Chip> : null}
                  </p>
                  <p className="mt-2" dir="auto">{r.excerpt ?? r.body}</p>
                  {r.note ? <p className="t-meta mt-1">{r.note}</p> : null}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" busy={busy === `d-${r.id}`} onClick={() => act(`d-${r.id}`, () => api(`/campus/community/reports/${r.id}/resolve`, { body: { action: 'dismiss' } }), t('social.staff.dismissed'))}>
                      {t('social.staff.dismiss')}
                    </Button>
                    <Button size="sm" variant="danger" busy={busy === `r-${r.id}`} onClick={() => act(`r-${r.id}`, () => api(`/campus/community/reports/${r.id}/resolve`, { body: { action: 'remove' } }), t('social.staff.removed'))}>
                      {t('social.staff.remove')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptySheet title={t('social.staff.empty')} />
          )
        }
      </Loaded>
    </Desk>
  );
}

/* ── Club desk ── */

function ClubDesk() {
  const { t, l, locale } = useI18n();
  const clubs = useApi<Array<{ id: string; name_en: string; name_ar: string; is_lead: boolean; pending_count: number }>>('/campus/clubs');
  const mine = (clubs.data ?? []).filter((c) => c.is_lead);
  return (
    <Desk title={t('campus.staff.clubs.title')} subtitle={t('campus.staff.clubs.subtitle')}>
      <Loaded q={clubs}>
        {() =>
          mine.length ? (
            <div className="space-y-6">
              {mine.map((c) => (
                <ClubRequests key={c.id} id={c.id} name={l(c.name_en, c.name_ar)} locale={locale} />
              ))}
            </div>
          ) : (
            <EmptySheet title={t('campus.staff.clubs.noClubs')} />
          )
        }
      </Loaded>
    </Desk>
  );
}

function ClubRequests({ id, name, locale }: { id: string; name: string; locale: 'en' | 'ar' }) {
  const { t, l } = useI18n();
  const q = useApi<Array<{ id: string; status: string; requested_at: string; answer: string | null; name_en: string; name_ar: string; avatar_color: string; program_id: string | null; level: number | null }>>(`/campus/clubs/${id}/requests`);
  const { busy, act } = useDeskAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = (q.data ?? []).filter((m) => m.status === 'pending');
  return (
    <Sheet flush title={name} action={<Link to={`/campus/clubs/${id}`} className="link text-[0.8125rem]">{t('common.open')}</Link>}>
      {list.length ? (
        <ul className="rows">
          {list.map((m) => (
            <li key={m.id} className="px-4.5 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={m.name_en} color={m.avatar_color} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{l(m.name_en, m.name_ar)}</p>
                  <p className="t-meta">
                    {[m.program_id?.toUpperCase(), m.level ? t('academics.overview.level', { level: m.level }) : null, fmtDate(m.requested_at, locale)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              {m.answer ? <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-ink-2">{m.answer}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input className="input max-w-xs" value={notes[m.id] ?? ''} onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })} placeholder={t('campus.staff.clubs.decisionNote')} aria-label={t('campus.staff.clubs.decisionNote')} />
                <Button variant="primary" size="sm" busy={busy === `a-${m.id}`} onClick={() => act(`a-${m.id}`, () => api(`/campus/clubs/${id}/requests/${m.id}/decide`, { body: { decision: 'active', note: notes[m.id] || undefined } }), t('campus.staff.clubs.approved'))}>
                  {t('campus.clubs.approve')}
                </Button>
                <Button size="sm" busy={busy === `r-${m.id}`} onClick={() => act(`r-${m.id}`, () => api(`/campus/clubs/${id}/requests/${m.id}/decide`, { body: { decision: 'rejected', note: notes[m.id] || undefined } }), t('campus.staff.clubs.declined'))}>
                  {t('campus.clubs.reject')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4.5 py-5 text-ink-2">{t('campus.staff.clubs.noRequests')}</p>
      )}
    </Sheet>
  );
}

/* ── Quality and help desk ── */

function FeedbackDesk() {
  const { t, l, locale } = useI18n();
  const [tab, setTab] = useState<'overview' | 'held' | 'help'>('overview');
  const overview = useApi<{ alerts: Array<{ slug: string; name_en: string; name_ar: string; kpi: string; mean: number; college_mean: number; n: number; has_action: boolean }>; course_alerts: Array<{ code: string; title_en: string; title_ar: string; kpi: string; mean: number; n: number; has_action: boolean }>; by_college: Array<{ key: string; en: string; ar: string; responses: number; response_rate: number; index: number }>; held: number; tickets_open: number }>('/feedback/staff/overview');
  const held = useApi<Array<{ id: string; course_code: string; title_en: string; title_ar: string; comment: string; flags: string[] }>>(tab === 'held' ? '/feedback/staff/held' : null);
  const tickets = useApi<Array<{ id: string; public_id: string; category: string; subject: string; body: string; status: string; reply: string | null; created_at: string; requester: { name_en: string; name_ar: string } }>>(tab === 'help' ? '/feedback/staff/tickets' : null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [action, setAction] = useState<{ key: string; course_code?: string; instructor_slug?: string; kpi: string } | null>(null);
  const [actionText, setActionText] = useState('');
  const { busy, act } = useDeskAction();
  return (
    <Desk title={t('fb.staff.title')} subtitle={t('fb.staff.subtitle')}>
      <div className="mb-6">
        <Segmented
          label={t('fb.staff.title')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: t('fb.staff.tab.overview') },
            { value: 'held', label: `${t('fb.staff.tab.held')}${overview.data?.held ? ` · ${overview.data.held}` : ''}` },
            { value: 'help', label: `${t('fb.staff.tab.help')}${overview.data?.tickets_open ? ` · ${overview.data.tickets_open}` : ''}` },
          ]}
        />
      </div>
      {tab === 'overview' ? (
        <Loaded q={overview}>
          {(d) => {
            const alerts = [...d.alerts.map((a) => ({ key: a.slug, title: l(a.name_en, a.name_ar), kpi: a.kpi, mean: a.mean, n: a.n, has_action: a.has_action, target: { instructor_slug: a.slug } })), ...d.course_alerts.map((a) => ({ key: a.code, title: `${a.code} · ${l(a.title_en, a.title_ar)}`, kpi: a.kpi, mean: a.mean, n: a.n, has_action: a.has_action, target: { course_code: a.code } }))];
            return (
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <Sheet flush title={t('fb.staff.alerts')}>
                  <p className="border-b border-rule px-4.5 py-3 text-ink-2">{t('fb.staff.alertsBody')}</p>
                  {alerts.length ? (
                    <ul className="rows">
                      {alerts.map((a) => (
                        <li key={`${a.key}-${a.kpi}`} className="px-4.5 py-3.5">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <span className="fig w-12 text-[1.625rem] text-red-ink">{a.mean.toFixed(1)}</span>
                            <span className="min-w-0 flex-1 basis-56">
                              <span className="block font-semibold">{a.title}</span>
                              <span className="t-meta block">
                                {t(`fb.kpi.${a.kpi}`)} · {t('fb.responses', { n: a.n })}
                              </span>
                            </span>
                            {a.has_action ? (
                              <Chip tone="green">{t('fb.staff.hasAction')}</Chip>
                            ) : (
                              <Button size="sm" onClick={() => { setAction({ key: `${a.key}-${a.kpi}`, kpi: a.kpi, ...a.target }); setActionText(''); }}>
                                {t('fb.staff.addAction')}
                              </Button>
                            )}
                          </div>
                          {action?.key === `${a.key}-${a.kpi}` ? (
                            <div className="mt-3 space-y-2.5">
                              <textarea className="textarea" value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder={t('fb.staff.actionText')} aria-label={t('fb.staff.actionText')} />
                              <Button variant="primary" size="sm" busy={busy === 'action'} disabled={actionText.trim().length < 5} onClick={() => act('action', async () => { await api('/feedback/staff/actions', { method: 'POST', body: { course_code: action.course_code, instructor_slug: action.instructor_slug, kpi: action.kpi, body_en: actionText.trim() } }); setAction(null); }, t('fb.staff.actionPosted'))}>
                                {t('common.submit')}
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4.5 py-5 text-ink-2">{t('fb.staff.noAlerts')}</p>
                  )}
                </Sheet>
                <Sheet flush title={t('fb.staff.byCollege')}>
                  <ul className="rows">
                    {d.by_college.map((c) => (
                      <li key={c.key} className="row">
                        <span className="fig w-11 text-[1.5rem]">{c.index}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{l(c.en, c.ar)}</span>
                          <span className="t-meta block">
                            {t('fb.responses', { n: c.responses })} · {t('fb.responseRate', { n: c.response_rate })}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Sheet>
              </div>
            );
          }}
        </Loaded>
      ) : null}
      {tab === 'held' ? (
        <Loaded q={held}>
          {(list) =>
            list.length ? (
              <ul className="sheet rows overflow-hidden">
                {list.map((h) => (
                  <li key={h.id} className="px-4.5 py-4">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="t-code">{h.course_code}</span>
                      <span className="font-semibold">{l(h.title_en, h.title_ar)}</span>
                      {h.flags.map((f) => (
                        <Chip key={f} tone="yellow">
                          {t(`fb.staff.flag.${f}`)}
                        </Chip>
                      ))}
                    </p>
                    <p className="mt-2 text-ink-2" dir="auto">{h.comment}</p>
                    <div className="mt-3 flex gap-2">
                      <Button variant="primary" size="sm" busy={busy === `p-${h.id}`} onClick={() => act(`p-${h.id}`, () => api(`/feedback/staff/held/${h.id}`, { method: 'POST', body: { decision: 'publish' } }), t('fb.staff.published'))}>
                        {t('fb.staff.publish')}
                      </Button>
                      <Button variant="danger" size="sm" busy={busy === `r-${h.id}`} onClick={() => act(`r-${h.id}`, () => api(`/feedback/staff/held/${h.id}`, { method: 'POST', body: { decision: 'reject' } }), t('fb.staff.rejected'))}>
                        {t('fb.staff.reject')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptySheet title={t('fb.staff.noHeld')} body={t('fb.staff.heldBody')} />
            )
          }
        </Loaded>
      ) : null}
      {tab === 'help' ? (
        <Loaded q={tickets}>
          {(list) =>
            list.length ? (
              <ul className="sheet rows overflow-hidden">
                {list.map((tk) => (
                  <li key={tk.id} className="px-4.5 py-4">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="t-code text-ink-2" dir="ltr">{tk.public_id}</span>
                      <span className="min-w-0 flex-1 font-semibold">{tk.subject}</span>
                      <Chip tone={tk.status === 'open' ? 'yellow' : 'green'}>{t(`fb.help.status.${tk.status}`)}</Chip>
                    </p>
                    <p className="t-meta">
                      {t('fb.staff.from', { name: l(tk.requester.name_en, tk.requester.name_ar) })} · {t(`fb.help.cat.${tk.category}`)} · {fmtDateTime(tk.created_at, locale)}
                    </p>
                    <p className="mt-2 text-ink-2">{tk.body}</p>
                    {tk.reply ? (
                      <p className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2.5">{tk.reply}</p>
                    ) : (
                      <div className="mt-3 space-y-2.5">
                        <textarea className="textarea" value={replies[tk.id] ?? ''} onChange={(e) => setReplies({ ...replies, [tk.id]: e.target.value })} placeholder={t('fb.staff.replyPlaceholder')} aria-label={t('fb.staff.replyPlaceholder')} />
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" disabled={!(replies[tk.id] ?? '').trim()} busy={busy === `s-${tk.id}`} onClick={() => act(`s-${tk.id}`, () => api(`/feedback/staff/tickets/${tk.id}/reply`, { method: 'POST', body: { reply: replies[tk.id].trim(), close: false } }), t('fb.staff.replied'))}>
                            {t('fb.staff.sendReply')}
                          </Button>
                          <Button size="sm" disabled={!(replies[tk.id] ?? '').trim()} busy={busy === `c-${tk.id}`} onClick={() => act(`c-${tk.id}`, () => api(`/feedback/staff/tickets/${tk.id}/reply`, { method: 'POST', body: { reply: replies[tk.id].trim(), close: true } }), t('fb.staff.replied'))}>
                            {t('fb.staff.closeTicket')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptySheet title={t('fb.staff.noTickets')} />
            )
          }
        </Loaded>
      ) : null}
    </Desk>
  );
}

export default function StaffRoutes() {
  return (
    <Routes>
      <Route index element={<Hub />} />
      <Route path="academics/excuses" element={<ExcuseQueue />} />
      <Route path="academics/excuses/:id" element={<ExcuseReview />} />
      <Route path="journey/admissions" element={<AdmissionsDesk />} />
      <Route path="journey/graduation" element={<GraduationDesk />} />
      <Route path="campus/lost-found" element={<SecurityDesk />} />
      <Route path="campus/resources" element={<ResourceDesk />} />
      <Route path="campus/community" element={<CommunityDesk />} />
      <Route path="campus/clubs" element={<ClubDesk />} />
      <Route path="feedback" element={<FeedbackDesk />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
