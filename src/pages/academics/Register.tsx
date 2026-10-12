import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CalendarBlank, Check, CheckCircle, Clock, Info, ListChecks, Plus, Receipt, Sparkle, Users, Warning, WarningCircle,
} from '@phosphor-icons/react';
import { useAgent } from '@/agent/Agent';
import { api, refreshAll, useApi } from '@/lib/api';
import { type Plan, planRegistration, type PlanSet, type ReportLine, switchPlan, usePlanSet } from '@/lib/regplan';
import { weekdayName } from '@/lib/clock';
import { cx, fmtDateTime, fmtTime, minutesOf } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { Button, Chip, Empty, Loaded, SectionHead, Sheet, Status, type Tone } from '@/ui/kit';
import { type Stage, StageLine, Stop, Stops } from '@/ui/line';
import { toast, useAction } from '@/ui/overlay';
import { Checks } from './Core';
import { FriendsPanel, usePeers } from './Friends';

type L10n = { en: string; ar: string };

interface Meeting {
  day: number;
  start: string;
  end: string;
  location?: { name_en: string; name_ar: string } | null;
}

interface PlanCourse {
  code?: string;
  course_code?: string;
  title_en: string;
  title_ar: string;
  credits: number;
  section_id?: string;
  id?: string;
  section_no: string;
  instructor: string;
  meetings: Meeting[];
  seats_left: number;
}

interface ProposalCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  explanation: string;
  hard?: boolean;
}

interface Option {
  id: string;
  label_en: string;
  label_ar: string;
  section_ids: string[];
  credits: number;
  courses: PlanCourse[];
  checks: ProposalCheck[];
  tradeoffs: string[];
  days: number[];
  feasible: boolean;
}

interface Proposal {
  id: string;
  term: string;
  term_label: L10n;
  status: string;
  revision: number;
  credits: number;
  checks: ProposalCheck[];
  rationale: string | null;
  preferences: { text?: string; understood?: string[]; unparsed?: string[] };
  options: Option[];
  action_log: Array<{ at: string; step: string; detail: string }>;
  approval_id: string | null;
  approval: { status: string; expires_at: string } | null;
  receipt: { portalRef?: string; committedAt?: string; status?: string; label?: string } | null;
  error: string | null;
  sections: PlanCourse[];
  section_ids: string[];
  can_approve: boolean;
  operation_id: string | null;
  created_at: string;
}

const codeOf = (c: PlanCourse) => c.code ?? c.course_code ?? '';

// Phrases the planner recognises; the chip label is translated, the phrase is what the planner reads.
const PICKS = [
  { key: 'reg.pick.noThu', phrase: 'No Thursday classes' },
  { key: 'reg.pick.max15', phrase: 'Max 15 credits' },
  { key: 'reg.pick.noEarly', phrase: 'Avoid early classes' },
  { key: 'reg.pick.compact', phrase: 'Compact week' },
  { key: 'reg.pick.inProgress', phrase: 'Count in-progress courses' },
];

const COURSE_TONES: Tone[] = ['blue', 'orange', 'purple', 'green', 'yellow', 'brand', 'red'];
const DAYS = [0, 1, 2, 3, 4];
const EDITABLE = ['draft', 'ready', 'needs_review', 'approved'];

function stagesFor(p: Proposal | null, t: (k: string) => string): Stage[] {
  const order = ['generate', 'review', 'approve', 'submit', 'receipt'];
  const at = !p ? 0 : ['submitted', 'accepted', 'partial'].includes(p.status) ? 5 : p.status === 'approved' || p.status === 'submitting' || p.status === 'outcome_unknown' ? 3 : 1;
  return order.map((key, i) => ({ key, label: t(`academics.register.step.${key}`), state: i < at ? 'done' : i === at ? 'current' : 'todo' }));
}

/** One colour per course, the same in every option, so the eye can follow what moves between them. */
function useCourseTones(p: Proposal | null, extra: PlanCourse[]) {
  return useMemo(() => {
    const codes = new Set<string>();
    for (const s of extra) codes.add(codeOf(s));
    for (const o of p?.options ?? []) for (const c of o.courses) codes.add(codeOf(c));
    for (const s of p?.sections ?? []) codes.add(codeOf(s));
    return new Map([...codes].sort().map((code, i) => [code, COURSE_TONES[i % COURSE_TONES.length]]));
  }, [p, extra]);
}

function useSpan(p: Proposal | null, extra: PlanCourse[]) {
  return useMemo(() => {
    let from = 8 * 60;
    let to = 16 * 60;
    const all = [...(p?.options.flatMap((o) => o.courses) ?? []), ...(p?.sections ?? []), ...extra];
    for (const c of all) {
      for (const m of c.meetings) {
        from = Math.min(from, Math.floor(minutesOf(m.start) / 60) * 60);
        to = Math.max(to, Math.ceil(minutesOf(m.end) / 60) * 60);
      }
    }
    return { from, to };
  }, [p, extra]);
}

/* A week at a glance: Sunday to Thursday across, the day down. Small in an option card, full size for the chosen plan. */
function WeekBlocks({ courses, tones, span, detailed }: { courses: PlanCourse[]; tones: Map<string, Tone>; span: { from: number; to: number }; detailed?: boolean }) {
  const { l, locale } = useI18n();
  const total = span.to - span.from;
  const hours: number[] = [];
  for (let h = span.from; h <= span.to; h += 60) hours.push(h);
  return (
    <div className={cx('grid gap-x-1.5', detailed ? 'grid-cols-[2.75rem_repeat(5,minmax(0,1fr))]' : 'grid-cols-5')}>
      {detailed ? <span /> : null}
      {DAYS.map((d) => (
        <p key={d} className={cx('pb-1.5 text-center font-semibold text-ink-2', detailed ? 'text-[0.8125rem]' : 'text-[0.6875rem]')}>
          {weekdayName(d, locale, detailed ? 'short' : 'narrow' as 'short')}
        </p>
      ))}
      {detailed ? (
        <div className="relative" aria-hidden>
          {hours.map((h) => (
            <span key={h} className="t-code absolute end-1.5 -translate-y-1/2 text-[0.6875rem] text-ink-3" style={{ top: `${((h - span.from) / total) * 100}%` }}>
              {fmtTime(`${String(h / 60).padStart(2, '0')}:00`, locale)}
            </span>
          ))}
        </div>
      ) : null}
      {DAYS.map((d) => (
        <div key={d} className={cx('relative rounded-xl bg-surface-2', detailed ? 'h-[26rem]' : 'h-24')}>
          {detailed
            ? hours.slice(1, -1).map((h) => <span key={h} className="absolute inset-x-0 h-px bg-rule" style={{ top: `${((h - span.from) / total) * 100}%` }} aria-hidden />)
            : null}
          {courses.flatMap((c) =>
            c.meetings
              .filter((m) => m.day === d)
              .map((m, i) => {
                const top = ((minutesOf(m.start) - span.from) / total) * 100;
                const height = ((minutesOf(m.end) - minutesOf(m.start)) / total) * 100;
                const code = codeOf(c);
                return detailed ? (
                  <div key={`${code}-${i}`} data-tone={tones.get(code)} className="absolute inset-x-1 overflow-hidden rounded-lg bg-tone-tint px-2 py-1 text-tone-ink shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tone)_35%,transparent)]" style={{ top: `${top}%`, height: `${height}%` }}>
                    <p className="t-code text-[0.8125rem] leading-tight">{code}</p>
                    <p className="num truncate text-[0.6875rem] leading-tight opacity-80">{fmtTime(m.start, locale)}</p>
                    <p className="truncate text-[0.6875rem] leading-tight opacity-80 max-lg:hidden">{m.location ? l(m.location.name_en, m.location.name_ar) : ''}</p>
                  </div>
                ) : (
                  <span key={`${code}-${i}`} data-tone={tones.get(code)} title={`${code} ${m.start}`} className="absolute inset-x-1 rounded-[5px] bg-tone" style={{ top: `${top}%`, height: `max(5px, ${height}%)` }} />
                );
              }),
          )}
        </div>
      ))}
    </div>
  );
}

function earliest(courses: PlanCourse[]) {
  let min = Infinity;
  for (const c of courses) for (const m of c.meetings) min = Math.min(min, minutesOf(m.start));
  return Number.isFinite(min) ? `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` : null;
}

function OptionCard({ option, chosen, editable, busy, onChoose, tones, span, index }: { option: Option; chosen: boolean; editable: boolean; busy: boolean; onChoose: () => void; tones: Map<string, Tone>; span: { from: number; to: number }; index: number }) {
  const { t, l, locale } = useI18n();
  const fails = option.checks.filter((c) => c.status === 'fail').length;
  const warns = option.checks.filter((c) => c.status === 'warn').length;
  const first = earliest(option.courses);
  return (
    <article
      className={cx('rise sheet flex flex-col p-4 transition-[box-shadow,border-color] duration-200', chosen && 'border-brand-ink! shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_55%,transparent)]')}
      style={{ ['--i' as string]: index }}
      aria-current={chosen ? 'true' : undefined}
    >
      <header className="flex items-start gap-3">
        <span className={cx('fig grid size-10 flex-none place-items-center rounded-xl text-[1.25rem]', chosen ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink')}>{option.id}</span>
        <div className="min-w-0 flex-1">
          <h3 className="t-title truncate">{l(option.label_en, option.label_ar)}</h3>
          <p className="t-meta">
            {option.courses.length} {t('reg.courses')} · {t('academics.register.daysN', { n: option.days.length })}
          </p>
        </div>
        <p className="text-end leading-none">
          <span className="fig text-[1.875rem]">{option.credits}</span>
          <span className="t-meta mt-1 block">{t('common.credits')}</span>
        </p>
      </header>

      <div className="mt-4">
        <WeekBlocks courses={option.courses} tones={tones} span={span} />
      </div>

      <ul className="mt-3.5 flex flex-wrap gap-1.5">
        {option.courses.map((c) => (
          <li key={codeOf(c)} data-tone={tones.get(codeOf(c))} className="chip">
            <span className="dot size-1.5!" />
            <span className="t-code">{codeOf(c)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip tone={fails ? 'red' : 'green'}>
          {fails ? <WarningCircle size={13} weight="fill" /> : <Check size={12} weight="bold" />}
          {fails ? t('academics.register.failsN', { n: fails }) : t('academics.register.allHardPass')}
        </Chip>
        {warns ? <Chip tone="yellow">{t('academics.register.warnsN', { n: warns })}</Chip> : null}
        {first ? (
          <Chip variant="outline">
            <Clock size={12} weight="bold" />
            {t('reg.from', { time: fmtTime(first, locale) })}
          </Chip>
        ) : null}
      </div>

      {option.tradeoffs.length ? (
        <ul className="mt-3 space-y-1">
          {option.tradeoffs.map((x) => (
            <li key={x} className="t-meta" dir="auto">
              {x}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto pt-4">
        {chosen ? (
          <p className="flex h-[2.125rem] items-center gap-1.5 font-bold text-brand-ink">
            <CheckCircle size={18} weight="fill" />
            {t('academics.register.chosen')}
          </p>
        ) : editable ? (
          <Button size="sm" busy={busy} onClick={onChoose} className="w-full">
            {t('academics.register.choose')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function tonesOf(sections: PlanCourse[]) {
  const codes = [...new Set(sections.map(codeOf))].sort();
  return new Map(codes.map((code, i) => [code, COURSE_TONES[i % COURSE_TONES.length]]));
}

function spanOf(sections: PlanCourse[]) {
  let from = 8 * 60;
  let to = 16 * 60;
  for (const c of sections) {
    for (const m of c.meetings) {
      from = Math.min(from, Math.floor(minutesOf(m.start) / 60) * 60);
      to = Math.max(to, Math.ceil(minutesOf(m.end) / 60) * 60);
    }
  }
  return { from, to };
}

/** Each thing the student asked for, marked as met or not, with the reason when it is not. */
function RuleList({ lines }: { lines: ReportLine[] }) {
  const { l } = useI18n();
  return (
    <ul className="space-y-1.5">
      {lines.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-[0.875rem]">
          {r.met ? <CheckCircle size={17} weight="fill" className="mt-0.5 flex-none text-green" /> : <WarningCircle size={17} weight="fill" className="mt-0.5 flex-none text-orange" />}
          <span className={r.met ? 'text-ink-2' : 'font-semibold'} dir="auto">
            {l(r.en, r.ar)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Said plainly when the term already has a registration: plans can only add to it. */
function RegisteredNote({ set }: { set: PlanSet }) {
  const { t } = useI18n();
  return (
    <div className="well flex items-start gap-3 p-4">
      <Info size={20} weight="fill" className="mt-0.5 flex-none text-blue" />
      <div className="min-w-0 space-y-2">
        <p className="font-semibold">{t('reg.registeredTitle', { n: set.registered.credits, limit: set.limit })}</p>
        <p className="t-meta t-code whitespace-normal!" dir="ltr">
          {set.registered.sections.map((s) => s.course_code).join(' · ')}
        </p>
        {set.registeredReport.length ? <RuleList lines={set.registeredReport} /> : null}
      </div>
    </div>
  );
}

function PlanCard({ plan, adds, chosen, editable, busy, onChoose, tones, span, index }: { plan: Plan; adds: boolean; chosen: boolean; editable: boolean; busy: boolean; onChoose: () => void; tones: Map<string, Tone>; span: { from: number; to: number }; index: number }) {
  const { t, l } = useI18n();
  const allMet = plan.report.every((r) => r.met);
  return (
    <article
      className={cx('rise sheet flex flex-col p-4 transition-[box-shadow,border-color] duration-200', chosen && 'border-brand-ink! shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_55%,transparent)]')}
      style={{ ['--i' as string]: index }}
      aria-current={chosen ? 'true' : undefined}
    >
      <header className="flex items-start gap-3">
        <span className={cx('fig grid size-10 flex-none place-items-center rounded-xl text-[1.25rem]', chosen ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink')}>{plan.id}</span>
        <div className="min-w-0 flex-1">
          <h3 className="t-title truncate">{l(plan.label_en, plan.label_ar)}</h3>
          <p className="t-meta">
            {plan.sections.length} {t('reg.courses')} · {t('academics.register.daysN', { n: plan.days.length })}
            {adds ? ` · ${t('reg.adds', { n: plan.credits })}` : ''}
          </p>
        </div>
        <p className="text-end leading-none">
          <span className="fig text-[1.875rem]">{plan.total}</span>
          <span className="t-meta mt-1 block">{t('common.credits')}</span>
        </p>
      </header>

      <div className="mt-4">
        <WeekBlocks courses={plan.sections} tones={tones} span={span} />
      </div>

      <ul className="mt-3.5 flex flex-wrap gap-1.5">
        {plan.sections.map((s) => (
          <li key={s.id} data-tone={tones.get(s.course_code)} className="chip">
            <span className="dot size-1.5!" />
            <span className="t-code">{s.course_code}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3.5">
        {plan.report.length ? (
          <RuleList lines={plan.report} />
        ) : (
          <p className="flex items-center gap-2 text-[0.875rem] text-ink-2">
            <CheckCircle size={17} weight="fill" className="flex-none text-green" />
            {t('reg.meetsAll')}
          </p>
        )}
      </div>

      <div className="mt-auto pt-4">
        {chosen ? (
          <p className="flex h-[2.125rem] items-center gap-1.5 font-bold text-brand-ink">
            <CheckCircle size={18} weight="fill" />
            {t('academics.register.chosen')}
            {allMet && plan.report.length ? <span className="font-medium text-ink-2">· {t('reg.meetsAll')}</span> : null}
          </p>
        ) : editable ? (
          <Button size="sm" busy={busy} onClick={onChoose} className="w-full">
            {t('academics.register.choose')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function Composer({ onDone, onCancel }: { onDone: (id: string) => void; onCancel?: () => void }) {
  const { t, l } = useI18n();
  const agent = useAgent();
  const [text, setText] = useState('');
  const { busy, run } = useAction();
  const peers = usePeers();
  const has = (phrase: string) => text.toLowerCase().includes(phrase.toLowerCase());
  const toggle = (phrase: string) =>
    setText((cur) => {
      if (cur.toLowerCase().includes(phrase.toLowerCase())) {
        return cur.replace(new RegExp(`,?\\s*${phrase}`, 'i'), '').replace(/^,\s*/, '').trim();
      }
      return cur.trim() ? `${cur.trim().replace(/[,.]$/, '')}, ${phrase}` : phrase;
    });

  const [stuck, setStuck] = useState<PlanSet | null>(null);
  // The planner reads the sentence itself, so anything typed here counts, not only the quick picks.
  const generate = () =>
    void run('gen', async () => {
      setStuck(null);
      const { set, proposalId } = await planRegistration({ text });
      refreshAll();
      if (proposalId) {
        toast.ok(t('academics.register.generated'));
        onDone(proposalId);
      } else setStuck(set);
    });

  return (
    <div className="space-y-5">
      {stuck ? (
        <Sheet title={t('reg.noPlanTitle')} tone="yellow">
          <div className="space-y-4">
            {stuck.blocked ? <p className="font-semibold">{l(stuck.blocked.en, stuck.blocked.ar)}</p> : null}
            {stuck.understood.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="t-label">{t('reg.understood')}</span>
                {stuck.understood.map((c) => (
                  <Chip key={c.en} tone="green">
                    <Check size={12} weight="bold" />
                    {l(c.en, c.ar)}
                  </Chip>
                ))}
              </div>
            ) : null}
            {stuck.registered.credits ? <RegisteredNote set={stuck} /> : null}
            {stuck.whatIf.length ? (
              <div>
                <h3 className="t-title">{t('reg.whatIfTitle')}</h3>
                <p className="t-meta mt-0.5 mb-3">{t('reg.whatIfHint')}</p>
                <div className="grid items-stretch gap-4 md:grid-cols-2">
                  {stuck.whatIf.map((plan, i) => (
                    <PlanCard key={plan.id} plan={plan} index={i} adds={false} chosen={false} editable={false} busy={false} onChoose={() => undefined} tones={tonesOf(stuck.whatIf.flatMap((x) => x.sections))} span={spanOf(stuck.whatIf.flatMap((x) => x.sections))} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Sheet>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-12">
      <Sheet className="lg:col-span-8">
        <label htmlFor="reg-prefs" className="t-title block">
          {t('academics.register.nlLabel')}
        </label>
        <textarea id="reg-prefs" className="textarea mt-3 min-h-28 text-[1rem]" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('academics.register.promptPlaceholder')} rows={3} dir="auto" />
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('academics.register.preferences')}>
          {PICKS.map((p) => (
            <button key={p.key} type="button" className="pick" aria-pressed={has(p.phrase)} onClick={() => toggle(p.phrase)}>
              {has(p.phrase) ? <Check size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
              {t(p.key)}
            </button>
          ))}
          {/* One tap to plan around a connected classmate's sections. */}
          {peers.data?.links.map((link) => {
            const phrase = `same sections as ${link.peer.first_en}`;
            return (
              <button key={link.id} type="button" className="pick" aria-pressed={has(phrase)} onClick={() => toggle(phrase)}>
                {has(phrase) ? <Check size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
                {t('fr.pick', { name: l(link.peer.first_en, link.peer.first_ar) })}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Button variant="primary" size="lg" busy={busy === 'gen'} onClick={generate}>
            <Sparkle size={18} weight="fill" />
            {t('academics.register.generate')}
          </Button>
          <Button size="lg" onClick={() => agent.ask(text.trim() ? t('reg.askWith', { text: text.trim() }) : t('ai.s.reg1'))}>
            {t('reg.withAssistant')}
          </Button>
          {onCancel ? (
            <Button variant="ghost" size="lg" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          ) : null}
        </div>
        <p className="t-meta mt-3">{t('academics.register.generateHint')}</p>
      </Sheet>
      <Sheet className="lg:col-span-4" title={t('reg.whatItChecks')}>
        <ul className="space-y-2.5">
          {['prereqs', 'clashes', 'seats', 'travel', 'limit'].map((k) => (
            <li key={k} className="flex items-start gap-2.5">
              <CheckCircle size={18} weight="fill" className="mt-0.5 flex-none text-green" />
              <span className="font-medium">{t(`reg.check.${k}`)}</span>
            </li>
          ))}
        </ul>
      </Sheet>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { t, l, locale, rtl } = useI18n();
  const agent = useAgent();
  const [params, setParams] = useSearchParams();
  const list = useApi<Proposal[]>('/academics/proposals');
  const wanted = params.get('proposal');
  const composing = params.get('new') === '1';
  const newest = useMemo(() => [...(list.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)), [list.data]);
  const current = composing ? null : (newest.find((p) => p.id === wanted) ?? newest[0] ?? null);
  const detail = useApi<{ proposal: Proposal }>(current ? `/academics/proposals/${current.id}` : null);
  const p = current ? (detail.data?.proposal ?? current) : null;
  const [logOpen, setLogOpen] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);
  const { busy, run } = useAction();
  const planSet = usePlanSet(p?.id);
  const planned = useMemo(() => planSet?.plans.flatMap((x) => x.sections) ?? [], [planSet]);
  const tones = useCourseTones(p, planned);
  const span = useSpan(p, planned);
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  const act = (key: string, fn: () => Promise<unknown>, ok?: string) =>
    run(key, async () => {
      const result = await fn();
      refreshAll();
      return result;
    }, ok);

  return (
    <Loaded q={list}>
      {(all) => {
        const term = all[0]?.term ?? '2026-2';
        const editable = !!p && EDITABLE.includes(p.status);
        const chosen = p?.options.find((o) => o.section_ids.join() === p.section_ids.join());
        const hardFails = p?.checks.filter((c) => c.status === 'fail' && c.hard !== false).length ?? 0;
        const warns = p?.checks.filter((c) => c.status === 'warn').length ?? 0;
        const passes = p?.checks.filter((c) => c.status === 'pass').length ?? 0;
        const others = newest.filter((x) => x.id !== p?.id).slice(0, 6);
        const understood = planSet ? planSet.understood.map((c) => l(c.en, c.ar)) : (p?.preferences.understood ?? []);
        const unparsed = planSet ? planSet.notUnderstood : (p?.preferences.unparsed ?? []);
        const inDraft = (ids: string[]) => !!p && [...ids].sort().join() === [...p.section_ids].sort().join();

        return (
          <div className="space-y-6">
            {/* Where this registration stands. */}
            <section className="plate p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="t-page text-[1.625rem]!">{t('academics.register.title')}</h2>
                  <p className="mt-1.5 max-w-[60ch] text-plate-muted">
                    {p ? `${l(p.term_label.en, p.term_label.ar)} · ${t('academics.register.revision')} ${p.revision} · ${p.credits} ${t('common.credits')}` : t('reg.intro')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p ? <Status status={p.status} /> : null}
                  {p ? (
                    <Button onClick={() => setParams({ new: '1' }, { replace: true })}>
                      <Plus size={15} weight="bold" />
                      {t('academics.register.newProposal')}
                    </Button>
                  ) : null}
                  <Button variant="primary" onClick={() => agent.show()}>
                    <Sparkle size={16} weight="fill" />
                    {t('ai.ask')}
                  </Button>
                </div>
              </div>
              <div className="mt-6">
                <StageLine stages={stagesFor(p, t)} tone="brand" label={t('common.progress')} />
              </div>
            </section>

            {!p ? (
              <Composer onDone={(id) => setParams({ proposal: id }, { replace: true })} onCancel={composing && all.length ? () => setParams({}, { replace: true }) : undefined} />
            ) : (
              <>
                {understood.length || unparsed.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="t-label">{t('reg.understood')}</span>
                    {understood.map((u) => (
                      <Chip key={u} tone="green">
                        <Check size={12} weight="bold" />
                        {u}
                      </Chip>
                    ))}
                    {unparsed.map((u) => (
                      <Chip key={u} tone="yellow">
                        <Warning size={12} weight="fill" />
                        {u}
                      </Chip>
                    ))}
                  </div>
                ) : null}

                {p.error ? (
                  <p role="alert" className="flex gap-2 rounded-2xl bg-red-tint px-4 py-3 text-red-ink">
                    <Warning size={18} weight="fill" className="mt-0.5 flex-none" />
                    {p.error}
                  </p>
                ) : null}

                {planSet?.registered.credits ? <RegisteredNote set={planSet} /> : null}

                {planSet?.plans.length ? (
                  <section aria-labelledby="plans-h">
                    <SectionHead title={<span id="plans-h">{t('reg.plansTitle')}</span>} hint={t('reg.plansHint')} />
                    <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {planSet.plans.map((plan, i) => (
                        <PlanCard
                          key={plan.id}
                          plan={plan}
                          index={i}
                          tones={tones}
                          span={span}
                          adds={planSet.registered.credits > 0}
                          chosen={inDraft(plan.section_ids)}
                          editable={editable}
                          busy={busy === `plan-${plan.id}`}
                          onChoose={() => void act(`plan-${plan.id}`, () => switchPlan(p.id, plan.id))}
                        />
                      ))}
                    </div>
                  </section>
                ) : (
                <section aria-labelledby="opts-h">
                  <SectionHead title={<span id="opts-h">{t('academics.register.options')}</span>} hint={p.rationale ? <span className="line-clamp-2 max-w-[90ch]" title={p.rationale}>{p.rationale}</span> : undefined} />
                  {p.options.length ? (
                    <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {p.options.map((o, i) => (
                        <OptionCard
                          key={o.id}
                          option={o}
                          index={i}
                          tones={tones}
                          span={span}
                          chosen={chosen?.id === o.id}
                          editable={editable}
                          busy={busy === `opt-${o.id}`}
                          onChoose={() => void act(`opt-${o.id}`, () => api(`/academics/proposals/${p.id}`, { method: 'PUT', body: { optionId: o.id } }))}
                        />
                      ))}
                    </div>
                  ) : (
                    <Sheet>
                      <Empty icon={<ListChecks size={24} />} title={t('academics.register.noOptions')} body={t('academics.register.noOptionsBody')} />
                    </Sheet>
                  )}
                </section>
                )}

                <div className="grid items-start gap-5 xl:grid-cols-12">
                  <div className="space-y-5 xl:col-span-8">
                    <Sheet title={t('reg.yourWeek')} action={<Chip variant="outline"><CalendarBlank size={12} weight="bold" />{l(p.term_label.en, p.term_label.ar)}</Chip>}>
                      <WeekBlocks courses={p.sections} tones={tones} span={span} detailed />
                    </Sheet>

                    <Sheet flush title={t('academics.register.whyCourses')}>
                      <ul className="rows">
                        {p.sections.map((s) => (
                          <li key={s.id ?? s.section_id ?? codeOf(s)} className="row items-start!">
                            <span className="glyph t-code w-auto! px-2.5 text-[0.8125rem]" data-tone={tones.get(codeOf(s))}>
                              {codeOf(s)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold" dir="auto">{l(s.title_en, s.title_ar)}</span>
                              <span className="t-meta block">
                                {s.instructor} · {t('reg.section', { n: s.section_no })} · {s.credits} {t('common.credits')}
                              </span>
                              <span className="t-meta num block">
                                {s.meetings.map((m) => `${weekdayName(m.day, locale)} ${fmtTime(m.start, locale)}${m.location ? `, ${l(m.location.name_en, m.location.name_ar)}` : ''}`).join(' · ')}
                              </span>
                            </span>
                            {s.seats_left <= 5 ? (
                              <Chip tone={s.seats_left <= 2 ? 'red' : 'yellow'}>
                                <Users size={12} weight="fill" />
                                {t('academics.register.seats', { n: s.seats_left })}
                              </Chip>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </Sheet>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2 xl:sticky xl:top-20 xl:col-span-4 xl:grid-cols-1">
                    {p.receipt ? (
                      <Sheet tone="green" title={<span className="flex items-center gap-2"><Receipt size={18} weight="fill" className="text-green" />{t('academics.register.receiptTitle')}</span>}>
                        <dl className="space-y-3">
                          <div>
                            <dt className="t-label">{t('academics.register.portalRef')}</dt>
                            <dd className="t-code mt-0.5 text-[1.0625rem]" dir="ltr">{p.receipt.portalRef ?? '-'}</dd>
                          </div>
                          <div>
                            <dt className="t-label">{t('academics.register.committedAt')}</dt>
                            <dd className="mt-0.5 font-semibold">{p.receipt.committedAt ? fmtDateTime(p.receipt.committedAt, locale) : '-'}</dd>
                          </div>
                        </dl>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link to={`/academics/timetable?term=${p.term}`} className="btn btn-primary btn-sm">
                            {t('academics.register.viewTimetable')}
                            <Arrow size={13} weight="bold" />
                          </Link>
                          <Link to="/academics/study" className="btn btn-secondary btn-sm">
                            {t('academics.register.studySetup')}
                          </Link>
                        </div>
                        <p className="t-meta mt-3">{t('academics.register.demoAdapter')}</p>
                      </Sheet>
                    ) : (
                      <Sheet title={t('academics.register.finalReview')}>
                        <div className="flex items-end justify-between gap-3">
                          <p className="leading-none">
                            <span className="fig text-[3rem]">{p.credits}</span>
                            <span className="ms-2 font-semibold text-ink-2">{t('common.credits')}</span>
                          </p>
                          <p className="t-meta text-end">
                            {p.sections.length} {t('reg.courses')}
                          </p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          <Chip tone="green">
                            <Check size={12} weight="bold" />
                            {t('reg.passN', { n: passes })}
                          </Chip>
                          {warns ? <Chip tone="yellow">{t('academics.register.warnsN', { n: warns })}</Chip> : null}
                          {hardFails ? <Chip tone="red">{t('academics.register.failsN', { n: hardFails })}</Chip> : null}
                        </div>
                        <p className="t-meta mt-3">{t('academics.register.finalReviewHint')}</p>
                        <div className="mt-4">
                          {p.status === 'approved' ? (
                            <Button variant="primary" size="lg" className="w-full" busy={busy === 'submit'} onClick={() => void act('submit', () => api(`/academics/proposals/${p.id}/submit`, { body: { approvalId: p.approval_id } }))}>
                              {t('academics.register.submit')}
                              <Arrow size={16} weight="bold" />
                            </Button>
                          ) : editable ? (
                            <Button variant="primary" size="lg" className="w-full" busy={busy === 'approve'} disabled={hardFails > 0 || !p.can_approve} onClick={() => void act('approve', () => api(`/academics/proposals/${p.id}/approve`, { method: 'POST' }), t('academics.register.approved'))}>
                              <Check size={17} weight="bold" />
                              {t('academics.register.approveExact')}
                            </Button>
                          ) : null}
                          {editable && hardFails > 0 ? <p className="field-error">{t('academics.register.blocked')}</p> : null}
                          {p.approval?.status === 'approved' ? (
                            <p className="t-meta mt-2">
                              {t('academics.register.approval')}: {t('academics.register.expires')} {fmtTime(p.approval.expires_at, locale)}
                            </p>
                          ) : null}
                        </div>
                      </Sheet>
                    )}

                    <Sheet flush title={t('academics.register.checks')} action={<Button size="sm" variant="ghost" onClick={() => setChecksOpen((o) => !o)} aria-expanded={checksOpen}>{t(checksOpen ? 'common.less' : 'common.details')}</Button>}>
                      {checksOpen ? (
                        <Checks checks={p.checks} />
                      ) : (
                        <ul className="flex flex-wrap gap-1.5 px-5 pb-4">
                          {p.checks.map((c) => (
                            <li key={c.id}>
                              <Chip tone={c.status === 'pass' ? 'green' : c.status === 'warn' ? 'yellow' : 'red'}>{c.label}</Chip>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Sheet>

                    <Sheet title={t('academics.register.howChosen')} action={p.action_log.length > 4 ? <Button size="sm" variant="ghost" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen}>{t(logOpen ? 'common.less' : 'common.more')}</Button> : undefined}>
                      <Stops tone="brand">
                        {(logOpen ? p.action_log : p.action_log.slice(0, 4)).map((a, i, arr) => (
                          <Stop key={i} state="done" last={i === arr.length - 1}>
                            <p className="font-semibold capitalize">{a.step.replace(/_/g, ' ')}</p>
                            <p className="text-[0.875rem] text-ink-2" dir="auto">{a.detail}</p>
                          </Stop>
                        ))}
                      </Stops>
                    </Sheet>
                  </div>
                </div>

                {others.length ? (
                  <section aria-labelledby="others-h">
                    <SectionHead title={<span id="others-h">{t('reg.otherPlans')}</span>} />
                    <Sheet flush>
                      <ul className="rows">
                        {others.map((o) => (
                          <li key={o.id}>
                            <button type="button" className="row" onClick={() => setParams({ proposal: o.id }, { replace: true })}>
                              <span className="glyph fig text-[1rem]" data-tone="blue">{o.credits}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold" dir="auto">{o.preferences.text || l(o.term_label.en, o.term_label.ar)}</span>
                                <span className="t-meta block">
                                  {t('academics.register.revision')} {o.revision} · {fmtDateTime(o.created_at, locale)}
                                </span>
                              </span>
                              <Status status={o.status} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </Sheet>
                  </section>
                ) : null}
              </>
            )}

            <FriendsPanel plan={p ? { id: p.id, revision: p.revision, editable, sections: p.sections.map((s) => ({ id: s.id ?? s.section_id ?? '', course_code: codeOf(s), section_no: s.section_no })) } : null} />
          </div>
        );
      }}
    </Loaded>
  );
}
