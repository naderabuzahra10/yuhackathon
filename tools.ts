import type { NavigateFunction } from 'react-router-dom';
import { api, refreshAll } from '@/lib/api';
import { addRevisionBlocks, loadRevisionPlan, type RevisionPlan } from '@/lib/coach';
import { type Constraints, minutes, planRegistration, type PlanSet, readPlanSet, switchPlan } from '@/lib/regplan';
import { type Entry, type MenuItem, OUTLETS, type Outlet, type Voucher } from '@/lib/rewards';

/* What the assistant can do. Each tool runs in the browser with the student's own
   session, returns a compact record for the model, and names the page that shows
   the result. Tools that submit, reserve or spend ask the student first. */

type Translate = (key: string, vars?: Record<string, string | number | null | undefined>) => string;

export interface RewardsHandle {
  balance: number;
  earned: number;
  spent: number;
  entries: Entry[];
  vouchers: Voucher[];
  redeem: (outlet: Outlet, item: MenuItem, now: Date) => Promise<Voucher>;
}

export interface ToolCtx {
  navigate: NavigateFunction;
  locale: 'en' | 'ar';
  t: Translate;
  now: () => Date;
  /** The page the student is on. */
  path: () => string;
  rewards: () => RewardsHandle;
}

export interface ConfirmRequest {
  title: string;
  lines: string[];
  action: string;
}

export interface ToolDef {
  /** Asked before a tool that submits, reserves or spends. Null means nothing to confirm. */
  confirm?: (input: any, ctx: ToolCtx) => Promise<ConfirmRequest | null>;
  run: (input: any, ctx: ToolCtx) => Promise<any>;
  /** The page that shows this result. */
  link?: (input: any, result: any) => string | null;
  /** Open that page as soon as the tool succeeds (wide screens only). */
  show?: boolean;
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clock = (iso: string) => iso.slice(11, 16);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

function calBrief(c: any) {
  return { title: c.title, date: c.start_at.slice(0, 10), start: clock(c.start_at), end: clock(c.end_at), room: c.location_name_en ?? c.location_text ?? null, location_id: c.location_id ?? null, kind: c.kind, link: c.link ?? null };
}

function meetings(list: any[] = []) {
  return list.map((m) => `${DAY[m.day]} ${m.start}-${m.end}`).join(', ');
}

const when = (list: Array<{ day: number; start: string; end: string }>) => list.map((m) => `${DAY[m.day]} ${m.start}-${m.end}`).join(', ');

/** A planning result in the words the model needs: what was understood, each plan, and every rule as met or not. */
export function planBrief(set: PlanSet, proposalId: string | null) {
  return {
    proposal_id: proposalId,
    term: set.term,
    understood: set.understood.map((c) => c.en),
    not_understood: set.notUnderstood,
    credit_limit: set.limit,
    open_credits: set.openCredits,
    already_registered: set.registered.credits
      ? {
          credits: set.registered.credits,
          courses: set.registered.sections.map((x) => `${x.course_code} (${when(x.meetings)})`),
          against_the_request: set.registeredReport.map((r) => `${r.met ? 'MET' : 'NOT MET'}: ${r.en}`),
        }
      : null,
    no_plan: set.plans.length ? undefined : true,
    no_plan_reason: set.plans.length ? undefined : (set.blocked?.en ?? 'Nothing fits.'),
    from_scratch: set.whatIf.length
      ? {
          note: 'For comparison only: the term as it would be planned from scratch. It cannot be applied while the existing registration stands.',
          plans: set.whatIf.map((p) => ({
            label: p.label_en,
            credits: p.total,
            days_on_campus: p.days.map((d) => DAY[d]),
            courses: p.sections.map((x) => `${x.course_code} ${x.title_en}, section ${x.section_no}, ${when(x.meetings)}`),
            rules: p.report.map((r) => `${r.met ? 'MET' : 'NOT MET'}: ${r.en}`),
          })),
        }
      : undefined,
    applied_plan: set.plans[0]?.id ?? null,
    plans: set.plans.map((p) => ({
      id: p.id,
      label: p.label_en,
      adds_credits: p.credits,
      term_total_credits: p.total,
      days_on_campus: p.days.map((d) => DAY[d]),
      courses: p.sections.map((x) => `${x.course_code} ${x.title_en}, section ${x.section_no}, ${x.credits} cr, ${when(x.meetings)}`),
      rules: p.report.map((r) => `${r.met ? 'MET' : 'NOT MET'}: ${r.en}`),
    })),
  };
}

export function proposalBrief(p: any) {
  const failed = (checks: any[] = []) => checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.explanation}`);
  const warned = (checks: any[] = []) => checks.filter((c) => c.status === 'warn').map((c) => c.label);
  return {
    id: p.id,
    status: p.status,
    revision: p.revision,
    term: p.term_label?.en ?? p.term,
    credits: p.credits,
    understood: p.preferences?.understood ?? [],
    not_understood: p.preferences?.unparsed ?? [],
    can_approve: !!p.can_approve,
    approval: p.approval?.status ?? null,
    chosen: (p.sections ?? []).map((s: any) => ({ code: s.course_code ?? s.code, title: s.title_en, credits: s.credits, instructor: s.instructor, when: meetings(s.meetings), seats_left: s.seats_left })),
    options: (p.options ?? []).map((o: any) => ({
      id: o.id,
      label: o.label_en,
      credits: o.credits,
      feasible: o.feasible,
      days_on_campus: (o.days ?? []).map((d: number) => DAY[d]),
      courses: (o.courses ?? []).map((c: any) => `${c.code} ${c.title_en} (${c.credits} cr; ${meetings(c.meetings)}${c.seats_left <= 3 ? `; ${c.seats_left} seats left` : ''})`),
      tradeoffs: o.tradeoffs ?? [],
      failed_checks: failed(o.checks),
      warnings: warned(o.checks),
      is_current: (o.section_ids ?? []).join() === (p.section_ids ?? []).join(),
    })),
    failed_checks: failed(p.checks),
    receipt: p.receipt ? { portal_ref: p.receipt.portalRef ?? null, status: p.receipt.status ?? null } : null,
    error: p.error ?? null,
  };
}

async function proposal(id: string) {
  const res = await api<{ proposal: any }>(`/academics/proposals/${encodeURIComponent(id)}`);
  return res.proposal;
}

/** The revision plan last worked out, waiting for the student to say "add it". */
let pendingRevision: RevisionPlan | null = null;

const OPENABLE = ['/today', '/academics', '/prereqs', '/campus', '/portfolio', '/career', '/competitions', '/journey', '/feedback', '/calendar', '/notifications', '/approvals'];

export function findMenuItem(itemId: string) {
  for (const outlet of OUTLETS) {
    const hit = outlet.items.find((i) => i.id === itemId);
    if (hit) return { outlet, item: hit };
  }
  return null;
}

export const TOOLS: Record<string, ToolDef> = {
  get_today: {
    async run() {
      const d = await api('/today');
      return {
        date: d.local.date,
        time: d.local.time,
        weekday: DAY[d.local.weekday],
        term: d.term.label.en,
        next_term: d.term.nextLabel?.en ?? null,
        next_class: d.nextClass ? calBrief(d.nextClass) : null,
        classes_today: (d.classes ?? []).map(calBrief),
        upcoming: (d.upcoming ?? []).map(calBrief),
        stats: d.stats,
      };
    },
  },

  get_registration: {
    async run() {
      const list = await api<any[]>('/academics/proposals');
      return { proposals: list.slice(0, 3).map(proposalBrief) };
    },
    link: () => '/academics/register',
  },

  plan_registration: {
    async run(input) {
      const overrides: Partial<Constraints> = {};
      const codes = (list: unknown) => (Array.isArray(list) ? list.map((x) => String(x).toUpperCase().replace(/^([A-Z]{3})\s*-?\s*(\d{3})$/, '$1 $2')) : []);
      const time = (value: unknown) => (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value) ? minutes(value) : undefined);
      if (Array.isArray(input.avoid_days) && input.avoid_days.length) overrides.avoidDays = input.avoid_days.map(Number).filter((d: number) => d >= 0 && d <= 4);
      if (input.min_credits) overrides.minCredits = Number(input.min_credits);
      if (input.max_credits) overrides.maxCredits = Number(input.max_credits);
      const start = time(input.earliest_start);
      if (start != null) {
        overrides.earliestStart = start;
        overrides.earliestStrict = !!input.earliest_start_strict;
      }
      const end = time(input.latest_end);
      if (end != null) {
        overrides.latestEnd = end;
        overrides.latestStrict = !!input.latest_end_strict;
      }
      if (input.compact) overrides.compact = true;
      if (codes(input.include_courses).length) overrides.include = codes(input.include_courses);
      if (codes(input.exclude_courses).length) overrides.exclude = codes(input.exclude_courses);
      const { set, proposalId } = await planRegistration({ text: String(input.preferences_text ?? ''), overrides, friend: typeof input.with_friend === 'string' ? input.with_friend : null });
      const brief = planBrief(set, proposalId);
      if (!proposalId) return brief;
      const p = await proposal(proposalId);
      return { ...brief, failed_checks: proposalBrief(p).failed_checks, can_approve: !!p.can_approve };
    },
    link: (_input, result) => (result?.proposal_id ? `/academics/register?proposal=${result.proposal_id}` : '/academics/register'),
    show: true,
  },

  choose_registration_option: {
    async run(input) {
      const id = String(input.proposal_id ?? '');
      // Plans made by the planner are applied section by section; the backend's own options by their letter.
      if (!(await switchPlan(id, String(input.option_id)))) {
        await api(`/academics/proposals/${encodeURIComponent(id)}`, { method: 'PUT', body: { optionId: input.option_id } });
        refreshAll();
      }
      const set = readPlanSet(id);
      const brief = proposalBrief(await proposal(id));
      const plan = set?.plans.find((x) => x.id === input.option_id);
      return plan ? { ...brief, options: undefined, applied_plan: plan.id, rules: plan.report.map((r) => `${r.met ? 'MET' : 'NOT MET'}: ${r.en}`) } : brief;
    },
    link: (input) => `/academics/register?proposal=${input.proposal_id}`,
    show: true,
  },

  get_classmates: {
    async run() {
      const d = await api('/academics/peers');
      return {
        classmates: (d.links ?? []).map((x: any) => ({
          name: x.peer.first_en,
          shares: (x.theirs ?? []).map((s: any) => (s.section ? `${s.course_code} section ${s.section.section_no} (${meetings(s.section.meetings)})` : `${s.course_code} (not in their plan now)`)),
          same_section_as_me: (x.overlaps ?? []).filter((o: any) => o.same).map((o: any) => o.course_code),
          different_section: (x.overlaps ?? []).filter((o: any) => !o.same).map((o: any) => o.course_code),
        })),
        suggestions_for_me: (d.incoming ?? []).map((s: any) => `${s.peer?.first_en} suggests ${s.course_code} section ${s.section?.section_no ?? '?'}`),
        how_to_connect: 'Create or enter an invite code under "Plan with a classmate" on the Register page.',
      };
    },
    link: () => '/academics/register',
  },

  approve_registration: {
    async confirm(input, { t }) {
      const p = await proposal(input.proposal_id);
      return {
        title: t('ai.confirm.approve.title'),
        lines: [...(p.sections ?? []).map((s: any) => `${s.course_code ?? s.code} · ${s.title_en}`), t('ai.confirm.credits', { n: p.credits })],
        action: t('ai.confirm.approve.action'),
      };
    },
    async run(input) {
      await api(`/academics/proposals/${encodeURIComponent(input.proposal_id)}/approve`, { method: 'POST' });
      refreshAll();
      return proposalBrief(await proposal(input.proposal_id));
    },
    link: (input) => `/academics/register?proposal=${input.proposal_id}`,
    show: true,
  },

  submit_registration: {
    async confirm(input, { t }) {
      const p = await proposal(input.proposal_id);
      return {
        title: t('ai.confirm.submit.title'),
        lines: [t('ai.confirm.submit.body', { n: (p.sections ?? []).length, c: p.credits }), t('ai.confirm.submit.demo')],
        action: t('ai.confirm.submit.action'),
      };
    },
    async run(input) {
      const p = await proposal(input.proposal_id);
      if (!p.approval_id) return { error: 'This proposal has not been approved yet. Approve it first.' };
      await api(`/academics/proposals/${encodeURIComponent(input.proposal_id)}/submit`, { body: { approvalId: p.approval_id } });
      refreshAll();
      return proposalBrief(await proposal(input.proposal_id));
    },
    link: (input) => `/academics/register?proposal=${input.proposal_id}`,
    show: true,
  },

  search_resources: {
    async run(input) {
      const res = await api('/campus/resources', { query: { q: input.query, course: input.course_code, sort: 'helpful' } });
      return {
        results: (res.items ?? []).slice(0, 8).map((r: any) => ({ id: r.id, title: r.title, course: r.course_code, course_title: r.course_title_en, type: r.type, helpful_votes: r.helpful_count, pages: r.pages, by: r.author?.name_en ?? null })),
      };
    },
    link: (input) => `/campus/resources${input.course_code ? `?course=${encodeURIComponent(input.course_code)}` : input.query ? `?q=${encodeURIComponent(input.query)}` : ''}`,
  },

  read_resource: {
    async run(input) {
      const p = await api(`/campus/resources/${encodeURIComponent(input.resource_id)}/preview`);
      const paragraphs: string[] = p.paragraphs ?? [];
      if (!paragraphs.length) return { title: p.title, error: 'This resource has no text to read; it is only available as a file.' };
      let budget = 9000;
      const numbered: string[] = [];
      for (let i = 0; i < paragraphs.length && budget > 0; i++) {
        const text = paragraphs[i].slice(0, budget);
        numbered.push(`[${i + 1}] ${text}`);
        budget -= text.length;
      }
      return { title: p.title, paragraphs: numbered, truncated: numbered.length < paragraphs.length };
    },
    link: () => '/campus/resources',
  },

  start_practice: {
    async run(input, ctx) {
      const id = String(input.resource_id ?? '');
      const p = await api(`/campus/resources/${encodeURIComponent(id)}/preview`);
      if (!(p.paragraphs ?? []).length) return { error: 'This resource has no text to practise from; it is only available as a file.' };
      const path = `/academics/coach/${id}${input.mode === 'cards' ? '?mode=cards' : ''}`;
      ctx.navigate(path);
      return { opened: path, title: p.title, mode: input.mode === 'cards' ? 'flashcards' : 'quiz', note: 'The practice is open on the page. Finishing a quiz with 60% or more earns 15 UniPoints, once per resource.' };
    },
  },

  plan_revision: {
    async run() {
      const plan = await loadRevisionPlan();
      pendingRevision = plan;
      return {
        assessments: plan.assessments.map((a) => ({ title: a.title, course: a.course_code, kind: a.kind, date: a.date, sittings_planned: a.sessions })),
        sittings: plan.blocks.map((b) => ({ date: b.date, time: b.time, minutes: b.duration_min, for: b.forTitle, course: b.course_code })),
        saved: false,
        note: plan.blocks.length ? 'Not saved yet. Call add_revision_plan if the student wants it in their planner.' : 'Nothing to plan: no assessments in the next three weeks, or no free time found.',
      };
    },
    link: () => '/academics/study',
  },

  add_revision_plan: {
    async confirm(_input, { t }) {
      if (!pendingRevision?.blocks.length) return null;
      const days = new Set(pendingRevision.blocks.map((b) => b.date)).size;
      return { title: t('ai.confirm.revision.title'), lines: [t('ai.confirm.revision.body', { n: pendingRevision.blocks.length, d: days })], action: t('ai.confirm.revision.action') };
    },
    async run() {
      if (!pendingRevision?.blocks.length) return { error: 'There is no revision plan to save. Call plan_revision first.' };
      const added = await addRevisionBlocks(pendingRevision.blocks);
      pendingRevision = null;
      refreshAll();
      return { added, where: 'Study planner' };
    },
    link: () => '/academics/study',
    show: true,
  },

  list_events: {
    async run() {
      const list = await api<any[]>('/campus/events');
      return {
        events: list
          .filter((e) => !e.is_past)
          .sort((a, b) => a.start_at.localeCompare(b.start_at))
          .slice(0, 10)
          .map((e) => ({ id: e.id, title: e.title_en, date: e.start_at.slice(0, 10), start: clock(e.start_at), venue: e.venue_label, club: e.club?.name_en ?? null, seats_left: e.remaining, full: e.full, my_rsvp: e.my_rsvp?.status ?? null, timetable_conflicts: (e.conflicts ?? []).length })),
      };
    },
    link: () => '/campus/events',
  },

  rsvp_event: {
    async confirm(input, { t }) {
      const list = await api<any[]>('/campus/events');
      const e = list.find((x) => x.id === input.event_id);
      if (!e) return null;
      return { title: t('ai.confirm.rsvp.title'), lines: [e.title_en, `${e.start_at.slice(0, 10)} · ${clock(e.start_at)}${e.venue_label ? ` · ${e.venue_label}` : ''}`], action: t('ai.confirm.rsvp.action') };
    },
    async run(input) {
      const res = await api(`/campus/events/${encodeURIComponent(input.event_id)}/rsvp`, { method: 'POST', body: {} });
      refreshAll();
      return { rsvp: res.rsvp?.status ?? 'going', points_note: 'Booking earns 10 UniPoints; verified attendance earns 100.' };
    },
    link: (input) => `/campus/events/${input.event_id}`,
  },

  get_attendance: {
    async run() {
      const d = await api('/academics/attendance');
      return {
        warning_percent: d.policy?.warning?.value,
        denial_percent: d.policy?.denial?.value,
        excuse_deadline_days: d.policy?.excuseDeadlineDays?.value,
        courses: (d.courses ?? []).map((c: any) => ({ course: c.course_code, title: c.title_en, ...c.counts, absence_percent: c.absence_percent, level: c.level })),
      };
    },
    link: () => '/academics/attendance',
  },

  get_study_tasks: {
    async run() {
      const d = await api('/academics/planner');
      const open = (d.items ?? []).filter((i: any) => !i.done && !i.cancelled);
      open.sort((a: any, b: any) => String(a.deadline ?? a.date ?? '9').localeCompare(String(b.deadline ?? b.date ?? '9')));
      return { today: d.today, tasks: open.slice(0, 15).map((i: any) => ({ id: i.id, title: i.title, course: i.course_code, kind: i.assessment_kind ?? i.kind, due: i.deadline ?? i.date, overdue: i.overdue, urgency: i.urgency })) };
    },
    link: () => '/academics/study',
  },

  add_study_task: {
    async run(input) {
      const res = await api('/academics/planner/quick', { body: { text: String(input.text ?? '') } });
      refreshAll();
      const it = res?.item ?? res ?? {};
      return { added: true, title: it.title ?? input.text, course: it.course_code ?? null, date: it.date ?? it.deadline ?? null };
    },
    link: () => '/academics/study',
  },

  get_rewards: {
    async run(_input, ctx) {
      const r = ctx.rewards();
      return {
        balance: r.balance,
        earned_total: r.earned,
        spent: r.spent,
        recent_activity: r.entries.slice(0, 8).map((e) => ({ what: e.title_en, kind: e.kind, points: e.points, date: e.at?.slice(0, 10) ?? null })),
        active_vouchers: r.vouchers.filter((v) => v.status === 'active').map((v) => ({ code: v.code, item: findMenuItem(v.itemId)?.item.name_en, outlet: findMenuItem(v.itemId)?.outlet.name_en })),
        outlets: OUTLETS.map((o) => ({ name: o.name_en, kind: o.kind_en, menu: o.items.map((i) => ({ id: i.id, name: i.name_en, points: i.points, can_afford: i.points <= r.balance })) })),
      };
    },
    link: () => '/campus/rewards',
  },

  redeem_reward: {
    async confirm(input, ctx) {
      const hit = findMenuItem(input.item_id);
      const r = ctx.rewards();
      if (!hit || hit.item.points > r.balance) return null;
      const name = ctx.locale === 'ar' ? hit.item.name_ar : hit.item.name_en;
      const outlet = ctx.locale === 'ar' ? hit.outlet.name_ar : hit.outlet.name_en;
      return { title: ctx.t('ai.confirm.redeem.title'), lines: [`${name} · ${outlet}`, ctx.t('ai.confirm.redeem.body', { n: hit.item.points, left: r.balance - hit.item.points })], action: ctx.t('ai.confirm.redeem.action') };
    },
    async run(input, ctx) {
      const hit = findMenuItem(input.item_id);
      const r = ctx.rewards();
      if (!hit) return { error: 'No menu item has that id. Call get_rewards for the list.' };
      if (hit.item.points > r.balance) return { error: 'not_enough_points', balance: r.balance, needed: hit.item.points };
      let voucher: Voucher;
      try {
        voucher = await r.redeem(hit.outlet, hit.item, ctx.now());
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'The voucher could not be issued.' };
      }
      return { voucher_id: voucher.id, voucher_code: voucher.code, item: hit.item.name_en, outlet: hit.outlet.name_en, points_spent: hit.item.points, balance_after: r.balance - hit.item.points, how_to_use: 'Show the code or its QR at the counter; the till scans it.' };
    },
    link: (_input, result) => (result?.voucher_id ? `/campus/rewards?voucher=${result.voucher_id}` : '/campus/rewards'),
    show: true,
  },

  find_place: {
    async run(input) {
      const q = norm(String(input.query ?? ''));
      const list = await api<any[]>('/campus/map/locations');
      const hits = list.filter((p) => p.searchable !== false && (norm(p.name_en ?? '').includes(q) || (p.name_ar ?? '').includes(String(input.query ?? '')) || (p.tags ?? []).some((tag: string) => norm(tag).includes(q))));
      return { places: hits.slice(0, 6).map((p) => ({ id: p.id, name: p.name_en, kind: p.kind, building: p.building_name_en, floor: p.floor, campus: p.campus_id, map_path: `/campus/map?to=${p.id}` })) };
    },
    link: (_input, result) => result?.places?.[0]?.map_path ?? '/campus/map',
  },

  get_prerequisites: {
    async run(input) {
      const catalog = await api('/academics/prereqs/catalog');
      if (!catalog.mine) return { error: 'No programme is linked to this account.' };
      const chain = await api(`/academics/prereqs/${catalog.mine}`);
      const all: any[] = [...(chain.terms ?? []).flatMap((term: any) => term.slots ?? []), ...(chain.pool ?? [])];
      const want = norm(String(input.course_code ?? ''));
      const course = all.find((c) => norm(c.code) === want);
      if (!course) return { error: `${input.course_code} is not in the ${chain.program?.code ?? ''} plan.` };
      const title = (code: string) => all.find((c) => c.code === code)?.title_en ?? null;
      const mine = (code: string) => chain.my?.[code]?.status ?? 'not_taken';
      return {
        code: course.code,
        title: course.title_en,
        credits: course.credits,
        my_status: mine(course.code),
        requires: (course.prereqs ?? []).map((group: string[]) => group.map((code) => ({ code, title: title(code), my_status: mine(code) }))),
        requires_note: 'Each inner list is a set of alternatives; one from each list is needed.',
        unlocks: (course.unlocks ?? []).map((code: string) => ({ code, title: title(code), my_status: mine(code) })),
      };
    },
    link: (input) => `/prereqs?focus=${encodeURIComponent(String(input.course_code ?? ''))}`,
  },

  get_opportunities: {
    async run() {
      const d = await api('/career/opportunities');
      const items = [...(d.items ?? [])].sort((a: any, b: any) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
      return { today: d.today, opportunities: items.slice(0, 6).map((o: any) => ({ id: o.id, title: o.title, company: o.company, type: o.type, city: o.city, deadline: o.deadline, match_score: o.match?.score ?? null, why: (o.match?.reasons ?? []).slice(0, 2), saved: !!o.saved })) };
    },
    link: () => '/career',
  },

  open_page: {
    async run(input, ctx) {
      const path = String(input.path ?? '');
      if (!path.startsWith('/') || path.startsWith('//') || !OPENABLE.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) return { error: 'That page cannot be opened from here.' };
      ctx.navigate(path);
      return { opened: path };
    },
  },
};
