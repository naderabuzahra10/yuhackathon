import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowCounterClockwise, CheckCircle, Clock, XCircle } from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { cx, fmtDateTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Avatar, Button, Chip, Field, PageHeader, Segmented, Sheet } from '@/ui/kit';
import { Stop, Stops } from '@/ui/line';
import { Dialog, toast, useAction } from '@/ui/overlay';

// The operator panel is an English-only tool for whoever runs the demo, as in the original build.
const TOUR = [
  { minute: '0:00', persona: 'u_applicant', title: 'Admission → orientation', link: '/journey/admission', steps: ['Open My Journey → Admission: the draft is blocked until the checklist is complete.', 'Attach the missing document, submit, read the demo receipt, then switch to the admissions officer to admit, and back to accept the offer. The same profile becomes a student with an onboarding checklist.'] },
  { minute: '1:00', persona: 'u_student', title: 'Course-registration agent', link: '/academics/register', steps: ['Academics → Register: type “avoid early classes, no Thursday, keep Tuesday 4pm free”, then generate options.', 'Compare the options, approve the exact list and submit. The timetable updates only on the confirmed receipt.'] },
  { minute: '2:15', persona: 'u_student', title: 'Exact-session absence excuse', link: '/academics/attendance', steps: ['Academics → Attendance: select the absent session on 21 Sep (SWE 302).', 'Attach the seeded Sehhaty-style PDF, approve and submit (demo EduGate adapter, request ID).', 'Switch to Dr. Hala (reviewer) and accept. Attendance becomes excused while the original record stays.'] },
  { minute: '3:30', persona: 'u_student', title: 'Event conflict → study repair', link: '/campus/events', steps: ['Campus Life → Events: RSVP to an event that overlaps a class. The conflict panel names the exact sessions.', 'Academics → Study planner: move or add the tasks the event displaced.'] },
  { minute: '4:30', persona: 'u_student', title: 'Lost & found (YU Claimed flow)', link: '/campus/lost-found', steps: ['Campus Life → Lost & found: submit a request and copy the YU-… ID.', 'Switch to Abdullah (security): mark it found with a collection location. Switch back: the collect-from banner and a walking route on the campus map.'] },
  { minute: '5:15', persona: 'u_graduating', title: 'Career tracker + graduation audit', link: '/journey/graduation', steps: ['Career: filter opportunities, save one, track the single linked application and review an ambiguous hiring email.', 'My Journey → Graduation: one unmet requirement blocks the request. Use the labelled demo fixture to fulfil it and submit; the registrar approves.'] },
];

const AREAS = [
  ['Course registration', 'Prerequisite, co-requisite, overlap, capacity, credit and travel checks; options, approvals, idempotent submission; timetable and calendar updates', 'EduGate submission (mock portal with atomic capacity, operation IDs, timeouts)', 'Authorized EduGate connector implementing UniversityPortalAdapter'],
  ['Attendance & excuses', 'Exact-session drafts, evidence ownership, extraction preview, approval, reviewer decisions, attendance treatment', 'EduGate excuse submission and request IDs; the Sehhaty report is a synthetic PDF', 'EduGate excuse API; Sehhaty verification (never claimed here)'],
  ['Study planner', 'Intake parsing, scheduling, instructor announcements, history', 'Optional AI parsing (deterministic rules by default)', 'Model-backed intent parsing with the same interface'],
  ['Clubs & events', 'Membership states, lead approvals, RSVP and waitlist, calendar, conflicts, achievements', 'External hackathon and competition listings are labelled demo data', 'Import from official event calendars'],
  ['Navigation', 'Real OSM footprints and paths (Riyadh), shortest-path routing, step-free mode', 'Khobar layout (approximate centre, synthetic buildings); accessibility attributes unverified', 'Surveyed campus geometry, indoor maps, live occupancy'],
  ['Lost & found', 'Owner-bound requests, opaque IDs, security queue, found matching, handover, notifications', 'Email delivery (rendered to an outbox preview)', 'SMTP or notification provider'],
  ['Career', 'Discovery filters and matching, dedupe, one application per opportunity, history, interviews on the calendar, email review queue', 'Opportunity feed, hiring emails, application autofill draft', 'Authorized job-board APIs, Gmail read-only sync'],
  ['Admission & graduation', 'Checklist completeness, receipts, officer and registrar decisions, same-profile transition, degree audit', 'Decisions by demo personas; criteria are illustrative', 'Official admission system and degree-audit source of truth'],
];

const ATTRIBUTION = [
  'OpenStreetMap data (© OpenStreetMap contributors, ODbL): Riyadh campus footprints, paths and boundary. Map tiles © CARTO; satellite imagery © Esri, Maxar, Earthstar Geographics.',
  'Interface: React (MIT), React Router (MIT), Tailwind CSS (MIT), Leaflet (BSD-2-Clause), Phosphor Icons (MIT).',
  'Typefaces: Mona Sans (SIL Open Font License) and Noto Kufi Arabic (SIL Open Font License).',
  'Study plans: Al Yamamah University official BSE V9.8 and BCNE V.2 (Aug 2026) PDFs, transcribed for the demo curriculum.',
  'Live competition rounds: the public Codeforces API.',
];

type Tab = 'tour' | 'controls' | 'integrations' | 'policies' | 'attribution';

interface Status {
  demoMode: boolean;
  clock: string;
  clockOverride: string | null;
  tz: string;
  adapters: Array<{ name: string; provider: string; real: boolean; note: string }>;
  aiConfigured: boolean;
  googleMapsConfigured: boolean;
  seededAt: string;
}

export default function DemoPanel() {
  const { t, l, locale } = useI18n();
  const { personas, user, switchPersona } = useSession();
  useTitle(t('nav.demo'));
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tour') ? 'tour' : 'tour');
  const status = useApi<Status>('/demo/status');
  const policies = useApi<Record<string, { value: number | string | number[]; provenance: string; label_en: string; label_ar: string }>>('/policies');
  const [token, setToken] = useState('');
  const [when, setWhen] = useState('2026-09-27T09:00');
  const [confirming, setConfirming] = useState(false);
  const { busy, run } = useAction();
  const headers = { 'X-Demo-Control-Token': token };

  const clock = (body: Record<string, unknown>) =>
    void run('clock', async () => {
      await api('/demo/clock', { body, headers });
      refreshAll();
    }, 'Demo clock updated');

  const savePolicy = (key: string, raw: string) => {
    const current = policies.data?.[key].value;
    const value = typeof current === 'number' ? Number(raw) : Array.isArray(current) ? raw.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)) : raw;
    void run(`policy-${key}`, async () => {
      await api(`/policies/${key}`, { method: 'PUT', body: { value }, headers });
      refreshAll();
    }, 'Policy updated (demo)');
  };

  const tokenField = (
    <Field label="Demo operator token" hint="Needed to reset, change the clock or edit policies. It stays on this page until you leave or reload.">
      {(p) => <input {...p} type="password" autoComplete="off" className="input max-w-md" value={token} onChange={(e) => setToken(e.target.value)} />}
    </Field>
  );

  return (
    <div>
      <PageHeader
        title={t('nav.demo')}
        subtitle={t('demo.subtitle')}
        actions={
          <Button variant="danger" disabled={!token} onClick={() => setConfirming(true)}>
            <ArrowCounterClockwise size={16} weight="bold" />
            {t('shell.reset')}
          </Button>
        }
      />
      <div className="scroll-x mb-6">
        <Segmented
          label={t('nav.demo')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tour', label: t('shell.tour') },
            { value: 'controls', label: 'Controls' },
            { value: 'integrations', label: 'Real vs simulated' },
            { value: 'policies', label: 'Policies' },
            { value: 'attribution', label: 'Attribution' },
          ]}
        />
      </div>

      {tab === 'tour' ? (
        <Sheet>
          <Stops tone="purple">
            {TOUR.map((step, i) => {
              const persona = personas.find((p) => p.id === step.persona);
              const active = user?.id === step.persona;
              return (
                <Stop key={step.title} state={active ? 'current' : 'todo'} last={i === TOUR.length - 1} time={step.minute}>
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 max-w-[68ch]">
                      <h2 className="t-lead">{step.title}</h2>
                      <ol className="mt-1.5 list-decimal space-y-1 ps-5 text-ink-2">
                        {step.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      {persona ? (
                        <Button size="sm" variant={active ? 'tone' : 'secondary'} tone="purple" busy={busy === step.persona} onClick={() => void run(step.persona, () => switchPersona(step.persona), 'Persona switched')}>
                          <Avatar name={persona.name_en} color={persona.avatar_color} size={18} />
                          {l(persona.name_en, persona.name_ar)}
                        </Button>
                      ) : null}
                      <Link to={step.link} className="btn btn-primary btn-sm">
                        {t('common.open')}
                      </Link>
                    </div>
                  </div>
                </Stop>
              );
            })}
          </Stops>
        </Sheet>
      ) : null}

      {tab === 'controls' ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Sheet>{tokenField}</Sheet>
            <Sheet title={t('shell.demoClock')}>
              <p className="flex flex-wrap items-center gap-2.5">
                <Clock size={20} className="text-ink-2" />
                <span className="fig text-2xl">{status.data ? fmtDateTime(status.data.clock, locale) : '…'}</span>
                <Chip variant="outline">{status.data?.tz}</Chip>
                <Chip tone={status.data?.clockOverride ? 'blue' : 'neutral'}>{status.data?.clockOverride ? 'frozen' : 'real time'}</Chip>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {([['+1 hour', 60], ['+1 day', 1440], ['+1 week', 10080]] as const).map(([label, minutes]) => (
                  <Button key={label} size="sm" disabled={!token} onClick={() => clock({ advanceMinutes: minutes })}>
                    {label}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" disabled={!token} onClick={() => clock({ iso: '2026-09-27T09:00:00+03:00' })}>
                  Reset to seed clock
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <Field label="Set (Asia/Riyadh)">{(p) => <input {...p} type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
                <Button disabled={!token} busy={busy === 'clock'} onClick={() => clock({ iso: `${when}:00+03:00` })}>
                  {t('common.save')}
                </Button>
              </div>
              <p className="t-meta mt-3">The clock is frozen so demos are deterministic. Every module reads it: deadlines, “yesterday’s absence”, approval expiry.</p>
            </Sheet>
            <Sheet title="Status" flush>
              <ul className="rows">
                {[
                  ['Demo mode', status.data?.demoMode ? <CheckCircle key="i" size={18} weight="fill" className="text-green" /> : <XCircle key="i" size={18} weight="fill" className="text-red" />],
                  ['AI intent adapter', <Chip key="a" tone={status.data?.aiConfigured ? 'green' : 'neutral'}>{status.data?.aiConfigured ? 'configured' : 'deterministic rules'}</Chip>],
                  ['Google Maps tiles', <Chip key="g" tone={status.data?.googleMapsConfigured ? 'green' : 'neutral'}>{status.data?.googleMapsConfigured ? 'configured' : 'OpenStreetMap'}</Chip>],
                  ['Seeded at', status.data?.seededAt ? fmtDateTime(status.data.seededAt, locale) : '—'],
                  ['Signed in as', user ? l(user.name_en, user.name_ar) : '—'],
                ].map(([k, v]) => (
                  <li key={String(k)} className="row min-h-11! justify-between py-2.5!">
                    <span className="text-ink-2">{k}</span>
                    <span className="font-medium">{v}</span>
                  </li>
                ))}
              </ul>
            </Sheet>
          </div>
          <Sheet title={t('shell.switchPersona')} flush>
            <p className="border-b border-rule px-4.5 py-3 text-ink-2">{t('shell.personaHint')}</p>
            <ul className="rows">
              {personas.map((p) => (
                <li key={p.id}>
                  <button type="button" className={cx('row', user?.id === p.id && 'bg-surface-2')} aria-pressed={user?.id === p.id} disabled={!!busy} onClick={() => void run(p.id, () => switchPersona(p.id), 'Persona switched')}>
                    <Avatar name={p.name_en} color={p.avatar_color} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{l(p.name_en, p.name_ar)}</span>
                      <span className="t-meta block truncate">
                        <span dir="ltr">{p.id}</span> · {p.roles.join(', ')} · {p.campus_id}
                      </span>
                    </span>
                    {user?.id === p.id ? <CheckCircle size={18} weight="fill" className="flex-none text-green" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>
      ) : null}

      {tab === 'integrations' ? (
        <div className="space-y-6">
          <Sheet title="Adapters" flush>
            <ul className="rows">
              {status.data?.adapters.map((a) => (
                <li key={a.name} className="grid gap-x-5 gap-y-1 px-4.5 py-3.5 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.6fr)]">
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="t-meta">{a.provider}</p>
                  </div>
                  <div>
                    <Chip tone={a.real ? 'green' : 'yellow'}>{a.real ? 'real' : 'simulated'}</Chip>
                  </div>
                  <p className="text-ink-2">{a.note}</p>
                </li>
              ))}
            </ul>
          </Sheet>
          <Sheet title="Real vs simulated by area" flush>
            <div className="scroll-x">
              <table className="w-full min-w-[46rem] text-start">
                <thead>
                  <tr className="border-b border-rule">
                    {['Area', 'Working locally', 'Simulated', 'Future integration'].map((h) => (
                      <th key={h} scope="col" className="t-label px-4.5 py-2.5 text-start">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-rule">
                  {AREAS.map(([area, working, simulated, future]) => (
                    <tr key={area} className="align-top">
                      <th scope="row" className="px-4.5 py-3 text-start font-semibold">{area}</th>
                      <td className="px-4.5 py-3 text-ink-2">{working}</td>
                      <td className="px-4.5 py-3 text-ink-2">{simulated}</td>
                      <td className="px-4.5 py-3 text-ink-2">{future}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sheet>
        </div>
      ) : null}

      {tab === 'policies' ? (
        <div className="space-y-6">
          <Sheet>{tokenField}</Sheet>
          <Sheet title="Configurable policies (with provenance)" flush>
            <ul className="rows">
              {policies.data
                ? Object.entries(policies.data).map(([key, p]) => {
                    const shown = Array.isArray(p.value) ? p.value.join(',') : String(p.value);
                    return (
                      <li key={key} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4.5 py-3.5">
                        <div className="min-w-0 flex-1 basis-72">
                          <p className="font-semibold">{l(p.label_en, p.label_ar)}</p>
                          <p className="t-meta">{p.provenance}</p>
                        </div>
                        <input
                          className="input w-40! num"
                          disabled={!token}
                          defaultValue={shown}
                          aria-label={p.label_en}
                          onBlur={(e) => {
                            if (e.target.value !== shown) savePolicy(key, e.target.value);
                          }}
                        />
                      </li>
                    );
                  })
                : null}
            </ul>
          </Sheet>
        </div>
      ) : null}

      {tab === 'attribution' ? (
        <Sheet title="Third-party attribution">
          <ul className="max-w-[80ch] space-y-2.5">
            {ATTRIBUTION.map((line) => (
              <li key={line} className="flex gap-2.5 text-ink-2">
                <span className="dot mt-2 size-1.5!" />
                {line}
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('shell.reset')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              busy={busy === 'reset'}
              onClick={() =>
                void run('reset', async () => {
                  await api('/demo/reset', { method: 'POST', headers });
                  setConfirming(false);
                  toast.ok(t('shell.resetDone'));
                  refreshAll();
                })
              }
            >
              {t('shell.reset')}
            </Button>
          </>
        }
      >
        <p className="text-ink-2">{t('shell.resetConfirm')}</p>
      </Dialog>
    </div>
  );
}
