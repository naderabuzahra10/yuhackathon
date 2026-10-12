import { api, errorMessage } from '@/lib/api';
import { lastOutcome } from '@/lib/regplan';
import { OUTLETS } from '@/lib/rewards';
import { type ConfirmRequest, TOOLS, type ToolCtx } from './tools';

/* Two ways to run a request. With a model key on the server, Claude plans the
   steps and calls the tools. Without one, a small built-in planner recognises the
   common requests and calls the same tools, so the assistant still works offline
   from any model. Both paths ask the student before anything is submitted or spent. */

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface Wire {
  role: 'user' | 'assistant';
  content: string | Block[];
}

export interface AgentStatus {
  provider: 'anthropic' | 'builtin';
  model: string | null;
}

export interface StepOutcome {
  state: 'done' | 'error' | 'declined';
  link?: string | null;
  error?: string;
}

export interface Hooks {
  onStep: (step: { id: string; tool: string; input: unknown }) => void;
  onStepDone: (id: string, outcome: StepOutcome) => void;
  onInterim: (text: string) => void;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  signal: AbortSignal;
}

export async function fetchStatus(): Promise<AgentStatus> {
  try {
    const res = await fetch('/agent/status');
    if (!res.ok) throw new Error('unavailable');
    return (await res.json()) as AgentStatus;
  } catch {
    return { provider: 'builtin', model: null };
  }
}

export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let seq = 0;
const uid = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

interface ToolRun {
  result: any;
  failed: boolean;
  declined: boolean;
}

async function callTool(name: string, input: any, ctx: ToolCtx, hooks: Hooks): Promise<ToolRun> {
  const def = TOOLS[name];
  const id = uid();
  hooks.onStep({ id, tool: name, input });
  if (!def) {
    hooks.onStepDone(id, { state: 'error' });
    return { result: { error: 'Unknown tool' }, failed: true, declined: false };
  }
  try {
    if (def.confirm) {
      const request = await def.confirm(input, ctx);
      if (request && !(await hooks.confirm(request))) {
        hooks.onStepDone(id, { state: 'declined' });
        return { result: { declined: true, note: 'The student declined this action. Do not retry it.' }, failed: false, declined: true };
      }
    }
    const result = await def.run(input, ctx);
    const failed = !!result && typeof result === 'object' && result.error != null;
    const link = failed ? null : (def.link?.(input, result) ?? null);
    hooks.onStepDone(id, { state: failed ? 'error' : 'done', link, error: failed ? String(result.error) : undefined });
    if (link && def.show && window.innerWidth >= 1024) ctx.navigate(link);
    return { result, failed, declined: false };
  } catch (e) {
    const message = errorMessage(e);
    hooks.onStepDone(id, { state: 'error', error: message });
    return { result: { error: message }, failed: true, declined: false };
  }
}

/** Keep the conversation short enough to send, starting on a plain user turn so tool pairs stay intact. */
export function trimHistory(history: Wire[], max = 24): Wire[] {
  if (history.length <= max) return history;
  let start = history.length - max;
  while (start < history.length && !(history[start].role === 'user' && typeof history[start].content === 'string')) start++;
  return history.slice(start);
}

export async function runModel(history: Wire[], context: Record<string, unknown>, ctx: ToolCtx, hooks: Hooks): Promise<{ text: string; history: Wire[] }> {
  const messages = [...history];
  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch('/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
      signal: hooks.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.content) throw new AgentError(json?.error?.code ?? 'failed', json?.error?.message ?? `The assistant could not answer (${res.status})`);

    const content = json.content as Block[];
    messages.push({ role: 'assistant', content });
    const text = content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim();
    const uses = content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    if (json.stop_reason !== 'tool_use' || !uses.length) return { text, history: messages };
    if (text) hooks.onInterim(text);

    const results: Block[] = [];
    for (const use of uses) {
      const out = await callTool(use.name, use.input ?? {}, ctx, hooks);
      results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(out.result).slice(0, 14000), ...(out.failed ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: ctx.t('ai.tooLong'), history: messages };
}

/* ── Built-in planner ── */

const COURSE_RE = /\b([A-Za-z]{3})\s?-?(\d{3})\b/;

function courseCode(text: string) {
  const m = COURSE_RE.exec(text);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
}

function findItem(text: string) {
  const lower = text.toLowerCase();
  let best: { id: string; score: number } | null = null;
  for (const outlet of OUTLETS) {
    for (const it of outlet.items) {
      const words = `${it.name_en} ${outlet.name_en}`.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2);
      let score = words.filter((w) => lower.includes(w)).length;
      if (text.includes(it.name_ar)) score += 4;
      if (score > 1 && (!best || score > best.score)) best = { id: it.id, score };
    }
  }
  return best?.id ?? null;
}

const STOP = new Set(['summarise', 'summarize', 'summary', 'the', 'for', 'notes', 'note', 'please', 'best', 'top', 'my', 'me', 'find', 'where', 'is', 'route', 'to', 'show', 'on', 'map', 'of', 'a', 'an', 'in', 'and', 'explain', 'resource', 'resources', 'go', 'take', 'how', 'do', 'get', 'i']);

function keywords(text: string) {
  return text.toLowerCase().replace(COURSE_RE, ' ').split(/[^a-z0-9؀-ۿ]+/).filter((w) => w && !STOP.has(w)).join(' ').trim();
}

export async function runLocal(text: string, ctx: ToolCtx, hooks: Hooks): Promise<string> {
  const { t, locale } = ctx;
  const lower = text.toLowerCase();
  const has = (re: RegExp) => re.test(lower);
  const name = (en?: string | null, ar?: string | null) => (locale === 'ar' && ar ? ar : (en ?? ''));

  // The CV builds itself from the portfolio: asking for one opens it, finished.
  if (has(/\bcv\b|resume|résumé|curriculum vitae|سيرة ذاتية|سيرتي|السيرة الذاتية/)) {
    const out = await callTool('open_page', { path: '/portfolio/cv' }, ctx, hooks);
    return out.failed ? t('ai.local.failed', { why: out.result?.error ?? '' }) : t('ai.local.cv');
  }

  // Rewards: redeem a named item, or show what the balance buys.
  if (has(/redeem|spend|buy|استبد|اصرف|اشتر/)) {
    const itemId = findItem(text);
    if (itemId) {
      const out = await callTool('redeem_reward', { item_id: itemId }, ctx, hooks);
      if (out.declined) return t('ai.local.declined');
      if (out.result?.error === 'not_enough_points') return t('ai.local.notEnough', { need: out.result.needed, have: out.result.balance });
      if (out.failed) return t('ai.local.failed', { why: out.result?.error ?? '' });
      return t('ai.local.redeemed', { item: out.result.item, outlet: out.result.outlet, code: out.result.voucher_code, left: out.result.balance_after });
    }
  }
  if (has(/point|reward|loyal|coffee|voucher|redeem|menu|نقاط|نقاطي|مكاف|قهوة|قسيمة/)) {
    const out = await callTool('get_rewards', {}, ctx, hooks);
    const afford = (out.result.outlets as any[]).flatMap((o) => o.menu.filter((m: any) => m.can_afford).map((m: any) => ({ ...m, outlet: o.name }))).sort((a, b) => b.points - a.points).slice(0, 4);
    const lines = afford.map((m) => `- ${m.name}, ${m.outlet} (${m.points})`).join('\n');
    return `${t('ai.local.balance', { n: out.result.balance })}\n${afford.length ? `${t('ai.local.canRedeem')}\n${lines}\n\n${t('ai.local.redeemHint')}` : t('ai.local.keepEarning')}`;
  }

  // Registration: approve or submit the latest proposal, or draft a new one.
  const aboutRegistration = has(/regist|enrol|proposal|next term|next semester|spring|sections|schedule|timetable|courses|تسجيل|سجل|الفصل القادم|الفصل الثاني|جدول|مواد|شعب/);
  if (aboutRegistration && has(/approve|confirm|submit|send|وافق|اعتمد|أرسل|ارسل|أكد/)) {
    const reg = await callTool('get_registration', {}, ctx, hooks);
    const proposals = reg.result.proposals as any[];
    const submitting = has(/submit|send|أرسل|ارسل/);
    const target = submitting ? proposals.find((p) => p.status === 'approved') : proposals.find((p) => p.can_approve);
    if (!target) return t(submitting ? 'ai.local.nothingToSubmit' : 'ai.local.nothingToApprove');
    const out = await callTool(submitting ? 'submit_registration' : 'approve_registration', { proposal_id: target.id }, ctx, hooks);
    if (out.declined) return t('ai.local.declined');
    if (out.failed) return t('ai.local.failed', { why: out.result?.error ?? '' });
    return submitting ? t('ai.local.submitted', { ref: out.result.receipt?.portal_ref ?? '', n: out.result.credits }) : t('ai.local.approved', { n: out.result.credits });
  }
  // A request that names credits, days or class times is a plan request, on the Register page or with the word "plan".
  const wishes = has(/credit|hours?\b|classes|\bclass\b|courses|ساع|محاضر|مقرر|مواد/) && (/\d/.test(text) || has(/days?\b|morning|afternoon|early|يوم|الخميس|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|صباح|مبكر/));
  const planning = aboutRegistration || (wishes && (ctx.path().startsWith('/academics/register') || has(/\bplan\b|خطط|خطة/)));
  if (planning && !has(/today|اليوم/)) {
    const out = await callTool('plan_registration', { preferences_text: text }, ctx, hooks);
    const set = lastOutcome()?.set;
    if (out.failed || !set) return t('ai.local.failed', { why: out.result?.error ?? '' });
    const ar = locale === 'ar';
    const say = (c: { en: string; ar: string }) => (ar ? c.ar : c.en);
    const dayName = (d: number) => (ar ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'])[d] ?? '';
    const parts: string[] = [];
    if (set.understood.length) parts.push(`${t('ai.local.understood')} ${set.understood.map(say).join('; ')}.`);
    if (set.notUnderstood.length) parts.push(t('ai.local.notUnderstood', { what: set.notUnderstood.join('; ') }));
    if (set.registered.credits) {
      parts.push(t('ai.local.registered', { n: set.registered.credits, term: say(set.termLabel) }));
      parts.push(set.registeredReport.map((r) => `- ${t(r.met ? 'ai.local.met' : 'ai.local.notMet')}: ${say(r)}`).join('\n'));
    }
    if (!set.plans.length) {
      if (set.blocked) parts.push(say(set.blocked));
      const fresh = set.whatIf[0];
      if (fresh) {
        const unmet = fresh.report.filter((r) => !r.met);
        parts.push(t('ai.local.whatIf', { c: fresh.total, d: fresh.days.length }));
        parts.push(fresh.sections.map((x) => `- ${x.course_code} ${ar ? x.title_ar : x.title_en}: ${x.meetings.map((m) => `${dayName(m.day)} ${m.start}`).join(', ')}`).join('\n'));
        parts.push(unmet.length ? unmet.map(say).join('; ') : t('ai.local.meetsAll'));
      }
      if (set.registered.credits) parts.push(t('ai.local.restartHint'));
      return parts.join('\n');
    }
    parts.push(t('ai.local.planned', { n: set.plans.length, term: say(set.termLabel) }));
    parts.push(
      set.plans
        .map((p) => {
          const unmet = p.report.filter((r) => !r.met);
          return `- **${p.id} · ${ar ? p.label_ar : p.label_en}**: ${t('ai.local.planLine', { c: p.total, d: p.days.length })}. ${unmet.length ? unmet.map(say).join('; ') : t('ai.local.meetsAll')}`;
        })
        .join('\n'),
    );
    parts.push(t('ai.local.appliedA'));
    parts.push(set.plans[0].sections.map((x) => `- ${x.course_code} ${ar ? x.title_ar : x.title_en}: ${x.meetings.map((m) => `${dayName(m.day)} ${m.start}`).join(', ')}`).join('\n'));
    parts.push(t('ai.local.planNext'));
    return parts.join('\n');
  }

  // Practice: find the notes and open the coach on them.
  if (has(/quiz me|test me|practi[sc]e|flash ?cards?|اختبرني|بطاقات|تدرب|تدريب/)) {
    const code = courseCode(text);
    const found = await callTool('search_resources', { query: code ? undefined : keywords(text.replace(/quiz me|test me|practi[sc]e|flash ?cards?|on\b|about\b/gi, ' ')) || undefined, course_code: code ?? undefined }, ctx, hooks);
    const first = (found.result.results as any[] | undefined)?.[0];
    if (!first) return t('ai.local.noResource');
    const cards = has(/flash ?cards?|بطاقات/);
    const out = await callTool('start_practice', { resource_id: first.id, mode: cards ? 'cards' : 'quiz' }, ctx, hooks);
    if (out.failed) return t('ai.local.noText', { title: first.title });
    return t(cards ? 'ai.local.cardsOpen' : 'ai.local.quizOpen', { title: first.title });
  }

  // Revision: lay sittings before the coming assessments, and save them when asked.
  if (has(/revision|revise|exam week|exam plan|study plan|prepare for (my )?(exam|midterm|quiz)|مراجعة|خطة مذاكرة|أسبوع الاختبارات/)) {
    if (has(/\b(add|save|yes|do it)\b|أضف|احفظ|نعم/)) {
      const saved = await callTool('add_revision_plan', {}, ctx, hooks);
      if (saved.declined) return t('ai.local.declined');
      if (!saved.failed) return t('ai.local.revisionSaved', { n: saved.result.added });
    }
    const out = await callTool('plan_revision', {}, ctx, hooks);
    const sittings = out.result.sittings as any[];
    if (!sittings.length) return t('ai.local.revisionNone');
    const lines = sittings.slice(0, 8).map((x) => `- ${x.date}, ${x.time}: ${x.for}${x.course ? ` (${x.course})` : ''}`).join('\n');
    return `${t('ai.local.revision', { n: sittings.length, a: (out.result.assessments as any[]).length })}\n${lines}\n\n${t('ai.local.revisionHint')}`;
  }

  // Summaries: find the resource, read it, summarise with paragraph references.
  if (has(/summar|tl;?dr|explain|key points|لخص|ملخص|اشرح|أهم النقاط/)) {
    const code = courseCode(text);
    const found = await callTool('search_resources', { query: code ? undefined : keywords(text) || undefined, course_code: code ?? undefined }, ctx, hooks);
    const first = (found.result.results as any[] | undefined)?.[0];
    if (!first) return t('ai.local.noResource');
    const read = await callTool('read_resource', { resource_id: first.id }, ctx, hooks);
    if (read.failed) return t('ai.local.noText', { title: first.title });
    try {
      const sum = await api<{ points: Array<{ text: string; citation: { paragraph: number } }> }>(`/campus/resources/${first.id}/summary`, { method: 'POST', body: {} });
      return `**${first.title}** (${first.course})\n${sum.points.map((p) => `- ${p.text} [${p.citation.paragraph}]`).join('\n')}\n\n${t('ai.local.summaryNote')}`;
    } catch (e) {
      return t('ai.local.failed', { why: errorMessage(e) });
    }
  }

  if (has(/event|workshop|talk|club|rsvp|فعالي|ورشة|نادي|أندية/)) {
    const out = await callTool('list_events', {}, ctx, hooks);
    const events = out.result.events as any[];
    if (!events.length) return t('ai.local.noEvents');
    if (has(/rsvp|book|reserve|sign me|احجز|سجلني/)) {
      const wanted = events.find((e) => !e.my_rsvp && keywords(text).split(' ').some((w) => w.length > 3 && e.title.toLowerCase().includes(w))) ?? events.find((e) => !e.my_rsvp && !e.full);
      if (wanted) {
        const r = await callTool('rsvp_event', { event_id: wanted.id }, ctx, hooks);
        if (r.declined) return t('ai.local.declined');
        if (r.failed) return t('ai.local.failed', { why: r.result?.error ?? '' });
        return t('ai.local.rsvped', { title: wanted.title, date: wanted.date, time: wanted.start });
      }
    }
    return `${t('ai.local.events')}\n${events.slice(0, 4).map((e) => `- **${e.title}**: ${e.date}, ${e.start}${e.venue ? `, ${e.venue}` : ''}${e.my_rsvp === 'going' ? ` (${t('ai.local.going')})` : ''}`).join('\n')}`;
  }

  if (has(/attend|absen|excuse|غياب|حضور|عذر/)) {
    const out = await callTool('get_attendance', {}, ctx, hooks);
    const courses = [...(out.result.courses as any[])].sort((a, b) => b.absence_percent - a.absence_percent);
    return `${t('ai.local.attendance', { w: out.result.warning_percent, d: out.result.denial_percent })}\n${courses.map((c) => `- **${c.course}**: ${t('ai.local.attendanceLine', { p: c.present, a: c.absent, pct: c.absence_percent })}`).join('\n')}`;
  }

  if (has(/^(add|create|remind)|أضف|ذكرني|ذكّرني/)) {
    const out = await callTool('add_study_task', { text: text.replace(/^(add|create)\s+(a\s+)?(task|reminder)\s*:?\s*/i, '') }, ctx, hooks);
    if (out.failed) return t('ai.local.failed', { why: out.result?.error ?? '' });
    return t('ai.local.taskAdded', { title: out.result.title });
  }
  if (has(/task|study|due|deadline|homework|assignment|quiz|exam|مهام|مهمة|واجب|مذاكرة|اختبار/)) {
    const out = await callTool('get_study_tasks', {}, ctx, hooks);
    const tasks = out.result.tasks as any[];
    if (!tasks.length) return t('ai.local.noTasks');
    return `${t('ai.local.tasks', { n: tasks.length })}\n${tasks.slice(0, 5).map((x) => `- **${x.title}**${x.course ? ` (${x.course})` : ''}: ${x.due ?? ''}${x.overdue ? `, ${t('ai.local.overdue')}` : ''}`).join('\n')}`;
  }

  if (has(/prereq|unlock|require|متطلب|يفتح/)) {
    const code = courseCode(text);
    if (!code) return t('ai.local.whichCourse');
    const out = await callTool('get_prerequisites', { course_code: code }, ctx, hooks);
    if (out.failed) return t('ai.local.failed', { why: out.result?.error ?? '' });
    const needs = (out.result.requires as any[][]).map((g) => g.map((c) => `${c.code} (${c.my_status})`).join(` ${t('ai.local.or')} `)).join('; ');
    const unlocks = (out.result.unlocks as any[]).map((c) => c.code).join(', ');
    return `**${out.result.code} · ${out.result.title}**\n- ${t('x.needs')}: ${needs || t('ai.local.none')}\n- ${t('x.unlocks')}: ${unlocks || t('ai.local.none')}`;
  }

  if (has(/intern|job|co-?op|career|opportunit|تدريب|وظيف|فرص/)) {
    const out = await callTool('get_opportunities', {}, ctx, hooks);
    const list = out.result.opportunities as any[];
    return `${t('ai.local.opps')}\n${list.slice(0, 4).map((o) => `- **${o.title}**, ${o.company}: ${t('ai.local.match', { n: o.match_score ?? 0 })}, ${t('ai.local.deadline', { d: o.deadline ?? '' })}`).join('\n')}`;
  }

  if (has(/where|route|map|direction|how do i get|take me|أين|وين|طريق|خريطة|وصلني/)) {
    if (has(/next class|my class|المحاضرة/) || !keywords(text)) {
      const today = await callTool('get_today', {}, ctx, hooks);
      const next = today.result.next_class;
      if (!next?.location_id) return t('ai.local.noNextClass');
      await callTool('open_page', { path: `/campus/map?to=${next.location_id}` }, ctx, hooks);
      return t('ai.local.routing', { place: next.room ?? '', title: next.title, time: next.start });
    }
    const out = await callTool('find_place', { query: keywords(text) }, ctx, hooks);
    const place = (out.result.places as any[])[0];
    if (!place) return t('ai.local.noPlace');
    await callTool('open_page', { path: place.map_path }, ctx, hooks);
    return t('ai.local.placeOpened', { place: place.name });
  }

  if (has(/today|next|class|now|schedule|اليوم|التالي|محاضر|الآن/)) {
    const out = await callTool('get_today', {}, ctx, hooks);
    const d = out.result;
    const next = d.next_class ? t('ai.local.nextClass', { title: d.next_class.title, time: d.next_class.start, room: d.next_class.room ?? '' }) : t('ai.local.noNextClass');
    return `${next}\n- ${t('ai.local.statClasses', { n: d.stats.classesToday })}\n- ${t('ai.local.statTasks', { n: d.stats.tasksDue, o: d.stats.overdueTasks })}\n- ${t('ai.local.statAbsences', { n: d.stats.unexcusedAbsences })}`;
  }

  void name;
  return t('ai.local.help');
}
