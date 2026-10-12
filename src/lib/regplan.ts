import { useSyncExternalStore } from 'react';
import { api, refreshAll } from './api';

/* The registration planner.
   The backend's own planner reads a handful of fixed phrases, so a sentence such
   as "minimum 16 hours, thurday no classes, usually after 10am" is not understood
   and it falls back to a default plan. This module reads the request itself
   (days, credit range, start and finish times, courses to include or leave out,
   typos tolerated), searches every combination of open sections the student is
   eligible for, and writes the best fit into a draft proposal through the same
   add, remove and swap calls the page uses. The backend still runs its checks
   (prerequisites, seats, travel time) on the result, and nothing is submitted. */

export interface Meeting {
  day: number;
  start: string;
  end: string;
  location?: { name_en: string; name_ar: string } | null;
}

export interface Section {
  id: string;
  course_code: string;
  title_en: string;
  title_ar: string;
  credits: number;
  section_no: string;
  instructor: string;
  meetings: Meeting[];
  seats_left: number;
  status: string;
}

interface EligibleCourse {
  code: string;
  title_en: string;
  title_ar: string;
  credits: number;
  required: boolean;
  eligible: boolean;
  reasons: string[];
  priority: number;
  sections: Section[];
}

export interface Constraints {
  avoidDays: number[];
  minCredits?: number;
  maxCredits?: number;
  /** Minutes from midnight. */
  earliestStart?: number;
  earliestStrict?: boolean;
  latestEnd?: number;
  latestStrict?: boolean;
  compact?: boolean;
  include: string[];
  exclude: string[];
  /** Stay with connected classmates: the section each of them shares, by course. */
  together?: { names: Chip[]; sections: Record<string, string> };
}

export interface Chip {
  en: string;
  ar: string;
}

export interface ReportLine {
  key: 'days' | 'min' | 'max' | 'start' | 'end' | 'include' | 'limit' | 'friend';
  met: boolean;
  en: string;
  ar: string;
}

export interface Plan {
  id: 'A' | 'B' | 'C';
  label_en: string;
  label_ar: string;
  section_ids: string[];
  sections: Section[];
  /** Credits this plan adds. */
  credits: number;
  /** Credits for the term, counting what is already registered. */
  total: number;
  days: number[];
  report: ReportLine[];
}

export interface PlanSet {
  proposalId: string;
  term: string;
  termLabel: Chip;
  constraints: Constraints;
  understood: Chip[];
  notUnderstood: string[];
  plans: Plan[];
  registered: { credits: number; sections: Section[] };
  limit: number;
  /** Credits of every course still open to the student this term. */
  openCredits: number;
  /** How what is already registered measures against the request. */
  registeredReport: ReportLine[];
  /** Why nothing could be planned, when plans is empty. */
  blocked: Chip | null;
  /** With a registration already in place and nothing to add: the term as it would be planned from scratch. For comparison only; never applied. */
  whatIf: Plan[];
}

const DAYS: Array<{ en: string; ar: string; words: string[] }> = [
  { en: 'Sunday', ar: 'الأحد', words: ['sunday', 'sun', 'الأحد', 'الاحد', 'احد', 'أحد'] },
  { en: 'Monday', ar: 'الاثنين', words: ['monday', 'mon', 'الاثنين', 'الإثنين', 'اثنين', 'إثنين'] },
  { en: 'Tuesday', ar: 'الثلاثاء', words: ['tuesday', 'tue', 'tues', 'الثلاثاء', 'ثلاثاء'] },
  { en: 'Wednesday', ar: 'الأربعاء', words: ['wednesday', 'wed', 'الأربعاء', 'الاربعاء', 'اربعاء', 'أربعاء'] },
  { en: 'Thursday', ar: 'الخميس', words: ['thursday', 'thu', 'thur', 'thurs', 'الخميس', 'خميس'] },
];

export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

/** A weekday from a word, forgiving the usual typos ("thurday", "wensday"). */
function dayOf(token: string): number | null {
  const word = token.toLowerCase();
  const exact = DAYS.findIndex((d) => d.words.includes(word));
  if (exact >= 0) return exact;
  if (!/^[a-z]{5,}$/.test(word) || !word.endsWith('day')) return null;
  const scored = DAYS.map((d, i) => ({ i, score: distance(word, d.words[0]) })).sort((a, b) => a.score - b.score);
  return scored[0].score <= 2 && scored[0].score < scored[1].score ? scored[0].i : null;
}

const NEGATIVE = /\b(no|not|without|avoid|free|off|skip|never|don'?t|none|nothing)\b|بدون|بلا|(^|\s)لا\s|ما\s?[أا]بي|تجنب|فاضي|[إا]جازة/i;
const SOFT = /\b(usually|prefer|preferably|mostly|ideally|generally|normally|try)\b|if possible|when possible|غالب|يفضل|[أا]فضل|لو [أا]مكن|[إا]ن [أا]مكن|عادة/i;
const MIN_CUE = /\bmin(imum)?\b|at least|no less|not less|or more|\d\s*\+|على ال[أا]قل|[أا]دنى|[أا]قل شي/i;
const MAX_CUE = /\bmax(imum)?\b|at most|no more|not more|up to|[أا]قصى|لا تزيد|ما تزيد|لا [أا]كثر/i;
const CREDIT_WORD = /credit|credits|\bcr\b|hours?|hrs?|ساع/i;
const COURSE = /\b([A-Za-z]{3})\s?-?(\d{3})\b/g;

function hourOf(h: number, mm: string | undefined, suffix: string | undefined, forEnd: boolean) {
  const s = (suffix ?? '').toLowerCase();
  let hour = h;
  if (/^p|^م|مساء/.test(s)) hour = h === 12 ? 12 : h + 12;
  else if (/^a|^ص|صباح/.test(s)) hour = h === 12 ? 0 : h;
  // With no am or pm, a small number means the afternoon: "after 2", "done by 3".
  else if (h >= 1 && h <= (forEnd ? 7 : 6)) hour = h + 12;
  return hour * 60 + (mm ? Number(mm) : 0);
}

/** Read a free-text request into constraints, with the phrases that were and were not understood. */
export function parsePreferences(text: string): { constraints: Constraints; leftover: string[] } {
  const c: Constraints = { avoidDays: [], include: [], exclude: [] };
  const leftover: string[] = [];
  const clauses = text
    .split(/[\n,;.،؛]+|\s+(?:and|but|also|و)\s+|\s(?=\d\s*[-).:]\s*[^\d\s])/i)
    .map((s) => s.replace(/^\s*\d\s*[-).:]\s*/, '').trim())
    .filter(Boolean)
    .reduce<string[]>((out, part) => {
      const prev = out[out.length - 1];
      const onlyDays = (s: string) => s.split(/\s+/).every((w) => dayOf(w) !== null);
      if (prev && onlyDays(prev)) out[out.length - 1] = `${prev} ${part}`;
      else out.push(part);
      return out;
    }, []);

  for (const clause of clauses) {
    let hit = false;
    const negative = NEGATIVE.test(clause);
    const soft = SOFT.test(clause);

    const days = [...new Set(clause.split(/[^A-Za-z؀-ۿ]+/).map(dayOf).filter((d): d is number => d !== null))];
    if (days.length && /\bonly\b|فقط/i.test(clause)) {
      for (let d = 0; d < 5; d++) if (!days.includes(d) && !c.avoidDays.includes(d)) c.avoidDays.push(d);
      hit = true;
    } else if (days.length && negative) {
      for (const d of days) if (!c.avoidDays.includes(d)) c.avoidDays.push(d);
      hit = true;
    }

    const oclock = /الساعة\s*\d/.test(clause);
    const time = /(after|before|by|until|till|from|past|than|بعد|قبل|حتى|من)\s+(?:the\s+|الساعة\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|ص|م|صباح\S*|مساء\S*)?/i.exec(clause);
    if (time && !(CREDIT_WORD.test(clause) && !oclock && !time[4] && !/class|start|begin|finish|end|محاضر|تبد[أا]|تنتهي/i.test(clause))) {
      const word = time[1].toLowerCase();
      const isAfter = /after|from|past|بعد|من/.test(word) || (word === 'than' && /later/i.test(clause));
      const negatedBefore = NEGATIVE.test(clause.slice(0, time.index));
      // "after 10" and "nothing before 10" both set the start; "nothing after 3" and "done by 3" set the finish.
      const setsStart = isAfter ? !negatedBefore : negatedBefore;
      const value = hourOf(Number(time[2]), time[3], time[4], !setsStart);
      if (setsStart) {
        c.earliestStart = value;
        c.earliestStrict = !soft;
      } else {
        c.latestEnd = value;
        c.latestStrict = !soft;
      }
      hit = true;
    } else if ((/afternoon|evening|بعد الظهر|العصر|المساء/i.test(clause) && !negative) || (/morning|الصباح|صباح/i.test(clause) && negative)) {
      c.earliestStart = 12 * 60;
      c.earliestStrict = /\bonly\b|فقط/i.test(clause) && !soft;
      hit = true;
    } else if (/morning|الصباح|صباح/i.test(clause) && !negative) {
      c.latestEnd = 13 * 60;
      c.latestStrict = /\bonly\b|فقط/i.test(clause) && !soft;
      hit = true;
    } else if (/early|\b8\s*(am|:00)|مبكر/i.test(clause) && (negative || /late|متأخر/i.test(clause))) {
      c.earliestStart = 9 * 60;
      c.earliestStrict = false;
      hit = true;
    }

    const amountText = clause.replace(/الساعة\s*\d{1,2}(:\d{2})?/g, ' ');
    const withWord = new RegExp(`(\\d{1,2})\\s*(?:${CREDIT_WORD.source})|(?:${CREDIT_WORD.source})\\w*\\s*(?:of|=|:)?\\s*(\\d{1,2})`, 'i').exec(amountText);
    const withCue = /(?:min(?:imum)?|max(?:imum)?|at least|at most|up to|no more than|no less than|[أا]دنى|[أا]قصى|على ال[أا]قل)\D{0,24}?(\d{1,2})(?!\s*(?::|am|pm|ص\b|م\b))/i.exec(amountText);
    const amount = Number(withWord?.[1] ?? withWord?.[2] ?? withCue?.[1]);
    if (amount >= 3 && amount <= 24 && !(time && Number(time[2]) === amount && !withWord)) {
      if (MIN_CUE.test(clause)) c.minCredits = amount;
      else if (MAX_CUE.test(clause)) c.maxCredits = amount;
      else if (withWord) {
        c.minCredits = amount;
        c.maxCredits = amount;
      }
      hit = true;
    }

    if (/compact|fewer days|few days|less days|[أا]قل [أا]يام|مضغوط/i.test(clause)) {
      c.compact = true;
      hit = true;
    }

    for (const m of clause.matchAll(COURSE)) {
      const code = `${m[1].toUpperCase()} ${m[2]}`;
      const list = negative ? c.exclude : c.include;
      if (!list.includes(code)) list.push(code);
      hit = true;
    }

    if (!hit && clause.split(/\s+/).length > 1 && !/^(plan|register|i want|i need|please|make|give|create|build|خطط|سجل|[أا]ريد|[أا]بي)\b/i.test(clause)) leftover.push(clause);
  }
  if (c.minCredits && c.maxCredits && c.minCredits > c.maxCredits) c.maxCredits = c.minCredits;
  c.avoidDays.sort();
  return { constraints: c, leftover };
}

/** The request back in plain words, so the student can see what was understood. */
export function describe(c: Constraints): Chip[] {
  const chips: Chip[] = [];
  for (const d of c.avoidDays) chips.push({ en: `No classes on ${DAYS[d].en}`, ar: `بدون محاضرات يوم ${DAYS[d].ar}` });
  if (c.minCredits && c.maxCredits && c.minCredits === c.maxCredits) chips.push({ en: `${c.minCredits} credits`, ar: `${c.minCredits} ساعة معتمدة` });
  else {
    if (c.minCredits) chips.push({ en: `At least ${c.minCredits} credits`, ar: `${c.minCredits} ساعة على الأقل` });
    if (c.maxCredits) chips.push({ en: `At most ${c.maxCredits} credits`, ar: `${c.maxCredits} ساعة كحد أقصى` });
  }
  if (c.earliestStart != null) chips.push(c.earliestStrict ? { en: `Nothing before ${clock(c.earliestStart)}`, ar: `لا شيء قبل ${clock(c.earliestStart)}` } : { en: `Start after ${clock(c.earliestStart)} when possible`, ar: `البدء بعد ${clock(c.earliestStart)} قدر الإمكان` });
  if (c.latestEnd != null) chips.push(c.latestStrict ? { en: `Finished by ${clock(c.latestEnd)}`, ar: `الانتهاء قبل ${clock(c.latestEnd)}` } : { en: `Finish by ${clock(c.latestEnd)} when possible`, ar: `الانتهاء قبل ${clock(c.latestEnd)} قدر الإمكان` });
  if (c.compact) chips.push({ en: 'Fewer days on campus', ar: 'أيام أقل في الحرم' });
  if (c.together) chips.push({ en: `Same sections as ${c.together.names.map((n) => n.en).join(' and ')}`, ar: `نفس شُعب ${c.together.names.map((n) => n.ar).join(' و')}` });
  for (const code of c.include) chips.push({ en: `Include ${code}`, ar: `تضمين ${code}` });
  for (const code of c.exclude) chips.push({ en: `Leave out ${code}`, ar: `استبعاد ${code}` });
  return chips;
}

/* ── Search ── */

interface Slot {
  day: number;
  from: number;
  to: number;
}

const slotsOf = (s: Section): Slot[] => s.meetings.map((m) => ({ day: m.day, from: minutes(m.start), to: minutes(m.end) }));
const clash = (a: Slot[], b: Slot[]) => a.some((x) => b.some((y) => x.day === y.day && x.from < y.to && y.from < x.to));

interface Scored {
  sections: Section[];
  credits: number;
  score: number[];
  early: Section[];
  late: Section[];
}

function compare(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

interface Problem {
  courses: EligibleCourse[];
  registered: Section[];
  constraints: Constraints;
  limit: number;
}

function search({ courses, registered, constraints: c, limit }: Problem): Scored[] {
  const fixed = registered.flatMap(slotsOf);
  const fixedCredits = registered.reduce((n, s) => n + s.credits, 0);
  const fixedCodes = new Set(registered.map((s) => s.course_code));
  const room = Math.max(0, Math.min(c.maxCredits ?? Infinity, limit) - fixedCredits);
  const target = c.minCredits ?? Math.min(limit, c.maxCredits ?? 15, 15);
  const strictStart = c.earliestStrict ? c.earliestStart : undefined;
  const strictEnd = c.latestStrict ? c.latestEnd : undefined;

  const pool = courses
    .filter((course) => course.eligible && !c.exclude.includes(course.code) && !fixedCodes.has(course.code))
    .map((course) => ({
      course,
      choices: course.sections
        .filter((s) => s.status === 'open' && s.seats_left > 0)
        .map((s) => ({ s, slots: slotsOf(s) }))
        .filter(({ slots }) => slots.every((m) => !c.avoidDays.includes(m.day) && (strictStart == null || m.from >= strictStart) && (strictEnd == null || m.to <= strictEnd)) && !clash(slots, fixed)),
    }))
    .filter((p) => p.choices.length)
    .sort((a, b) => Number(c.include.includes(b.course.code)) - Number(c.include.includes(a.course.code)) || Number(b.course.required) - Number(a.course.required) || a.course.priority - b.course.priority);

  const requiredCount = pool.filter((p) => p.course.required).length;
  // Only courses this student can take count towards staying with a classmate.
  const fixedIds = new Set(registered.map((s) => s.id));
  const shared = Object.entries(c.together?.sections ?? {}).filter(([code, id]) => !fixedIds.has(id) && pool.some((p) => p.course.code === code));
  const best: Scored[] = [];
  const picked: Array<{ s: Section; slots: Slot[]; course: EligibleCourse }> = [];

  const leaf = () => {
    const credits = picked.reduce((n, p) => n + p.s.credits, 0);
    const all = [...fixed, ...picked.flatMap((p) => p.slots)];
    const early = c.earliestStart == null ? [] : picked.filter((p) => p.slots.some((m) => m.from < c.earliestStart!));
    const late = c.latestEnd == null ? [] : picked.filter((p) => p.slots.some((m) => m.to > c.latestEnd!));
    const softMeetings = picked.reduce((n, p) => n + p.slots.filter((m) => (c.earliestStart != null && m.from < c.earliestStart) || (c.latestEnd != null && m.to > c.latestEnd)).length, 0);
    const short = Math.max(0, target - (fixedCredits + credits));
    const missingIncluded = c.include.filter((code) => !fixedCodes.has(code) && !picked.some((p) => p.course.code === code)).length;
    const requiredMissed = requiredCount - picked.filter((p) => p.course.required).length;
    const days = new Set(all.map((m) => m.day));
    let gaps = 0;
    for (const d of days) {
      const day = all.filter((m) => m.day === d).sort((x, y) => x.from - y.from);
      for (let i = 1; i < day.length; i++) gaps += Math.max(0, day[i].from - day[i - 1].to - 15);
    }
    // An explicit minimum outranks a "when possible" time; without one, the times come first.
    const apart = shared.filter(([, id]) => !picked.some((p) => p.s.id === id)).length;
    const head = c.minCredits ? [short, apart, softMeetings] : [apart, softMeetings, short];
    const score = [missingIncluded, ...head, requiredMissed, c.compact ? days.size : 0, days.size, Math.round(gaps / 30), -credits];
    if (best.length < 80 || compare(score, best[best.length - 1].score) < 0) {
      best.push({ sections: picked.map((p) => p.s), credits, score, early: early.map((p) => p.s), late: late.map((p) => p.s) });
      best.sort((x, y) => compare(x.score, y.score));
      if (best.length > 80) best.pop();
    }
  };

  const walk = (i: number, credits: number) => {
    if (i === pool.length) return leaf();
    const { course, choices } = pool[i];
    if (credits + course.credits <= room) {
      for (const choice of choices) {
        if (picked.some((p) => clash(p.slots, choice.slots))) continue;
        picked.push({ ...choice, course });
        walk(i + 1, credits + course.credits);
        picked.pop();
      }
    }
    walk(i + 1, credits);
  };
  walk(0, 0);
  return best;
}

function reportFor(plan: Scored, problem: Problem, ceiling: { days: number; times: number }, openCredits: number): ReportLine[] {
  const { constraints: c, registered, limit } = problem;
  const fixedCredits = registered.reduce((n, s) => n + s.credits, 0);
  const total = fixedCredits + plan.credits;
  const lines: ReportLine[] = [];
  for (const d of c.avoidDays) lines.push({ key: 'days', met: true, en: `No classes on ${DAYS[d].en}`, ar: `بدون محاضرات يوم ${DAYS[d].ar}` });
  if (c.minCredits) {
    if (total >= c.minCredits) lines.push({ key: 'min', met: true, en: `${total} credits (asked for at least ${c.minCredits})`, ar: `${total} ساعة (المطلوب ${c.minCredits} على الأقل)` });
    else {
      const why = openCredits + fixedCredits < c.minCredits
        ? { en: `only ${openCredits} credits of courses are open to you this term`, ar: `المقررات المتاحة لك هذا الفصل ${openCredits} ساعة فقط` }
        : ceiling.days < c.minCredits
          ? { en: `${ceiling.days} is the most that fits around your free days`, ar: `${ceiling.days} هو أقصى ما يناسب أيامك الحرة` }
          : !plan.early.length && !plan.late.length && ceiling.times < c.minCredits
            ? { en: `${ceiling.times} is the most that fits inside your times`, ar: `${ceiling.times} هو أقصى ما يناسب أوقاتك` }
            : { en: 'more would break another rule', ar: 'الزيادة تخالف شرطًا آخر' };
      lines.push({ key: 'min', met: false, en: `${total} of ${c.minCredits} credits: ${why.en}`, ar: `${total} من ${c.minCredits} ساعة: ${why.ar}` });
    }
  }
  if (c.maxCredits && c.maxCredits !== c.minCredits) lines.push({ key: 'max', met: total <= c.maxCredits, en: `${total} credits (limit you set: ${c.maxCredits})`, ar: `${total} ساعة (حدك ${c.maxCredits})` });
  if (c.earliestStart != null) {
    const at = clock(c.earliestStart);
    if (!plan.early.length) lines.push({ key: 'start', met: true, en: `Every class starts at ${at} or later`, ar: `كل المحاضرات تبدأ ${at} أو بعدها` });
    else {
      const list = plan.early.map((s) => `${s.course_code} ${s.meetings[0].start}`).join(', ');
      lines.push({ key: 'start', met: false, en: `${plan.early.length} of ${plan.sections.length} courses start before ${at}: ${list}`, ar: `${plan.early.length} من ${plan.sections.length} مقررات تبدأ قبل ${at}: ${list}` });
    }
  }
  if (c.latestEnd != null) {
    const at = clock(c.latestEnd);
    if (!plan.late.length) lines.push({ key: 'end', met: true, en: `Every class ends by ${at}`, ar: `كل المحاضرات تنتهي قبل ${at}` });
    else lines.push({ key: 'end', met: false, en: `${plan.late.map((s) => s.course_code).join(', ')} run past ${at}`, ar: `${plan.late.map((s) => s.course_code).join('، ')} تتجاوز ${at}` });
  }
  if (c.together) {
    const all = Object.entries(c.together.sections);
    const same = all.filter(([, id]) => plan.sections.some((s) => s.id === id) || registered.some((s) => s.id === id));
    const differs = all.filter((x) => !same.includes(x)).map(([code]) => code);
    const en = c.together.names.map((n) => n.en).join(' and ');
    const ar = c.together.names.map((n) => n.ar).join(' و');
    lines.push(
      differs.length
        ? { key: 'friend', met: false, en: `With ${en} in ${same.length} of ${all.length} shared courses; not ${differs.join(', ')}`, ar: `مع ${ar} في ${same.length} من ${all.length} مقررات مشتركة؛ ما عدا ${differs.join('، ')}` }
        : { key: 'friend', met: true, en: `Same section as ${en} in all ${all.length} shared courses`, ar: `نفس شعبة ${ar} في كل المقررات المشتركة (${all.length})` },
    );
  }
  for (const code of c.include) {
    const placed = plan.sections.some((s) => s.course_code === code) || registered.some((s) => s.course_code === code);
    const course = problem.courses.find((x) => x.code === code);
    const why = !course ? { en: 'not in your plan of study this term', ar: 'ليس ضمن خطتك هذا الفصل' } : !course.eligible ? { en: course.reasons[0] ?? 'not eligible yet', ar: course.reasons[0] ?? 'غير متاح بعد' } : { en: 'no section fits your days and times', ar: 'لا توجد شعبة تناسب أيامك وأوقاتك' };
    lines.push(placed ? { key: 'include', met: true, en: `${code} included`, ar: `تم تضمين ${code}` } : { key: 'include', met: false, en: `${code} left out: ${why.en}`, ar: `لم يُضمَّن ${code}: ${why.ar}` });
  }
  if (total > limit) lines.push({ key: 'limit', met: false, en: `Over the ${limit}-credit limit`, ar: `يتجاوز حد ${limit} ساعة` });
  return lines;
}

function daysOf(sections: Section[]) {
  return [...new Set(sections.flatMap((s) => s.meetings.map((m) => m.day)))].sort();
}

/** Up to three plans that differ in a way worth choosing between. */
export function makePlans(problem: Problem): { plans: Plan[]; openCredits: number; blocked: Chip | null } {
  const { constraints: c, registered } = problem;
  const fixedCredits = registered.reduce((n, s) => n + s.credits, 0);
  const fixedCodes = new Set(registered.map((s) => s.course_code));
  const openCredits = problem.courses.filter((x) => x.eligible && !fixedCodes.has(x.code) && x.sections.some((s) => s.status === 'open' && s.seats_left > 0)).reduce((n, x) => n + x.credits, 0);

  const ranked = search(problem).filter((p) => p.sections.length);
  // The most credits that fit the days alone, to explain a shortfall honestly.
  const most = (constraints: Constraints) => fixedCredits + Math.max(0, ...search({ ...problem, constraints: { ...constraints, minCredits: 99, include: [], compact: false } }).map((p) => p.credits));
  const ceiling = {
    days: most({ ...c, earliestStart: undefined, latestEnd: undefined }),
    times: most({ ...c, earliestStrict: c.earliestStart != null, latestStrict: c.latestEnd != null }),
  };
  const keyOf = (p: Scored) => p.sections.map((s) => s.id).sort().join();
  const coursesOf = (p: Scored) => p.sections.map((s) => s.course_code).sort().join();
  const chosen: Array<{ plan: Scored; en: string; ar: string }> = [];
  if (ranked[0]) chosen.push({ plan: ranked[0], en: 'Best fit', ar: 'الأنسب' });

  // If the best fit bends a time preference, offer the plan that does not.
  const softTimes = (c.earliestStart != null && !c.earliestStrict) || (c.latestEnd != null && !c.latestStrict);
  if (ranked[0] && softTimes && (ranked[0].early.length || ranked[0].late.length)) {
    const strict = search({ ...problem, constraints: { ...c, earliestStrict: c.earliestStart != null, latestStrict: c.latestEnd != null } }).find((p) => p.sections.length);
    if (strict && keyOf(strict) !== keyOf(ranked[0])) chosen.push({ plan: strict, en: 'Strict on times', ar: 'التزام تام بالأوقات' });
  }
  const other = ranked.find((p) => chosen.every((x) => coursesOf(x.plan) !== coursesOf(p)));
  if (other) chosen.push({ plan: other, en: 'Different courses', ar: 'مقررات مختلفة' });
  const lighter = ranked.find((p) => chosen.every((x) => keyOf(x.plan) !== keyOf(p)));
  if (chosen.length < 3 && lighter) chosen.push({ plan: lighter, en: 'Another arrangement', ar: 'ترتيب آخر' });

  const plans = chosen.slice(0, 3).map(({ plan, en, ar }, i): Plan => ({
    id: (['A', 'B', 'C'] as const)[i],
    label_en: en,
    label_ar: ar,
    section_ids: plan.sections.map((s) => s.id),
    sections: plan.sections,
    credits: plan.credits,
    total: fixedCredits + plan.credits,
    days: daysOf([...registered, ...plan.sections]),
    report: reportFor(plan, problem, ceiling, openCredits),
  }));
  let blocked: Chip | null = null;
  if (!plans.length) {
    const room = Math.min(c.maxCredits ?? Infinity, problem.limit) - fixedCredits;
    const open = problem.courses.filter((x) => x.eligible && !fixedCodes.has(x.code));
    const smallest = Math.min(...open.map((x) => x.credits));
    if (!open.length) blocked = { en: 'No more courses are open to you this term.', ar: 'لا توجد مقررات أخرى متاحة لك هذا الفصل.' };
    else if (room < smallest) blocked = { en: `You already have ${fixedCredits} of the ${Math.min(c.maxCredits ?? Infinity, problem.limit)} credits allowed, so no other course fits.`, ar: `لديك ${fixedCredits} من ${Math.min(c.maxCredits ?? Infinity, problem.limit)} ساعة مسموحة، فلا يتسع الجدول لمقرر آخر.` };
    else blocked = { en: 'None of the open sections fit around your free days, your times and the classes you already have.', ar: 'لا توجد شعبة متاحة تناسب أيامك الحرة وأوقاتك ومحاضراتك الحالية.' };
  }
  return { plans, openCredits, blocked };
}

/** How the classes already registered for the term measure against the request. */
export function checkRegistered(registered: Section[], c: Constraints): ReportLine[] {
  if (!registered.length) return [];
  const credits = registered.reduce((n, s) => n + s.credits, 0);
  const lines: ReportLine[] = [];
  for (const d of c.avoidDays) {
    const on = registered.filter((s) => s.meetings.some((m) => m.day === d)).map((s) => s.course_code);
    lines.push(on.length ? { key: 'days', met: false, en: `${on.join(', ')} meet on ${DAYS[d].en}`, ar: `${on.join('، ')} يوم ${DAYS[d].ar}` } : { key: 'days', met: true, en: `No classes on ${DAYS[d].en}`, ar: `بدون محاضرات يوم ${DAYS[d].ar}` });
  }
  if (c.minCredits) lines.push({ key: 'min', met: credits >= c.minCredits, en: `${credits} credits (asked for at least ${c.minCredits})`, ar: `${credits} ساعة (المطلوب ${c.minCredits} على الأقل)` });
  if (c.maxCredits) lines.push({ key: 'max', met: credits <= c.maxCredits, en: `${credits} credits (limit you set: ${c.maxCredits})`, ar: `${credits} ساعة (حدك ${c.maxCredits})` });
  if (c.earliestStart != null) {
    const at = clock(c.earliestStart);
    const early = registered.filter((s) => s.meetings.some((m) => minutes(m.start) < c.earliestStart!));
    lines.push(early.length ? { key: 'start', met: false, en: `${early.length} of ${registered.length} courses start before ${at}: ${early.map((s) => `${s.course_code} ${s.meetings[0].start}`).join(', ')}`, ar: `${early.length} من ${registered.length} مقررات تبدأ قبل ${at}: ${early.map((s) => `${s.course_code} ${s.meetings[0].start}`).join('، ')}` } : { key: 'start', met: true, en: `Every class starts at ${at} or later`, ar: `كل المحاضرات تبدأ ${at} أو بعدها` });
  }
  if (c.latestEnd != null) {
    const at = clock(c.latestEnd);
    const late = registered.filter((s) => s.meetings.some((m) => minutes(m.end) > c.latestEnd!));
    lines.push(late.length ? { key: 'end', met: false, en: `${late.map((s) => s.course_code).join(', ')} run past ${at}`, ar: `${late.map((s) => s.course_code).join('، ')} تتجاوز ${at}` } : { key: 'end', met: true, en: `Every class ends by ${at}`, ar: `كل المحاضرات تنتهي قبل ${at}` });
  }
  return lines;
}

/* ── Plans kept for the page, per proposal ── */

const memory = new Map<string, PlanSet | null>();
const listeners = new Set<() => void>();
const keyFor = (id: string) => `uj.regplan.${id}`;

export function readPlanSet(proposalId: string | null | undefined): PlanSet | null {
  if (!proposalId) return null;
  if (memory.has(proposalId)) return memory.get(proposalId) ?? null;
  let value: PlanSet | null = null;
  try {
    const raw = sessionStorage.getItem(keyFor(proposalId));
    if (raw) value = JSON.parse(raw) as PlanSet;
  } catch {
    /* unavailable storage: plans last for this page only */
  }
  memory.set(proposalId, value);
  return value;
}

function savePlanSet(set: PlanSet) {
  memory.set(set.proposalId, set);
  try {
    sessionStorage.setItem(keyFor(set.proposalId), JSON.stringify(set));
  } catch {
    /* kept in memory */
  }
  listeners.forEach((fn) => fn());
}

export function usePlanSet(proposalId: string | null | undefined) {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => readPlanSet(proposalId),
    () => null,
  );
}

/* ── Talking to the backend ── */

interface ProposalLike {
  id: string;
  term: string;
  sections: Array<{ id: string; course_code?: string; code?: string }>;
}

/** Make the draft hold exactly these sections, using the page's own add, remove and swap calls. */
export async function applySections(proposalId: string, target: Section[]) {
  const detail = await api<{ proposal: ProposalLike }>(`/academics/proposals/${encodeURIComponent(proposalId)}`);
  const current = new Map(detail.proposal.sections.map((s) => [s.course_code ?? s.code ?? s.id, s.id]));
  const wanted = new Map(target.map((s) => [s.course_code, s.id]));
  const put = (body: unknown) => api(`/academics/proposals/${encodeURIComponent(proposalId)}`, { method: 'PUT', body });
  for (const [course, id] of current) {
    const next = wanted.get(course);
    if (!next) await put({ remove: id });
    else if (next !== id) await put({ swap: { from: id, to: next } });
  }
  for (const [course, id] of wanted) {
    if (!current.has(course)) await put({ add: id });
  }
  refreshAll();
}

interface PeerLink {
  id: string;
  peer: { first_en: string; first_ar: string };
  theirs: Array<{ course_code: string; section: { id: string } | null }>;
}

/** Which connected classmates the request means: by first name, or all of them for "my friends". */
function classmatesIn(text: string, friend: string | null | undefined, links: PeerLink[]) {
  const ask = `${text} ${friend ?? ''}`.toLowerCase();
  const named = links.filter((x) => (x.peer.first_en && ask.includes(x.peer.first_en.toLowerCase())) || (x.peer.first_ar && ask.includes(x.peer.first_ar)));
  if (named.length) return named;
  return friend === 'all' || /\b(friends?|classmates?|buddy|buddies)\b|صديق|أصدقائي|اصدقائي|زميل|زملائي/i.test(ask) ? links : [];
}

export interface PlanRequest {
  text?: string;
  /** A connected classmate's first name, or "all". */
  friend?: string | null;
  /** Structured values, when the caller already has them; they win over what the text says. */
  overrides?: Partial<Constraints>;
}

export interface PlanOutcome {
  set: PlanSet;
  /** Null when nothing could be planned and no draft was made. */
  proposalId: string | null;
}

let last: PlanOutcome | null = null;
/** The most recent planning result in this page session. */
export const lastOutcome = () => last;

/** Read the request, search, and write the best plan into a new draft. Nothing is approved or submitted. */
export async function planRegistration({ text = '', overrides = {}, friend }: PlanRequest): Promise<PlanOutcome> {
  const parsed = parsePreferences(text);
  const constraints: Constraints = { ...parsed.constraints };
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null || (Array.isArray(value) && !value.length)) continue;
    (constraints as unknown as Record<string, unknown>)[key] = value;
  }

  const list = await api<Array<{ id: string; term: string; term_label?: Chip; created_at: string }>>('/academics/proposals').catch(() => []);
  const today = list[0] ? null : await api<{ term: { next: string; nextLabel?: Chip } }>('/today');
  const term = list[0]?.term ?? today!.term.next;
  const termLabel: Chip = list[0]?.term_label ?? today?.term.nextLabel ?? { en: term, ar: term };
  const [timetable, policies] = await Promise.all([
    api<{ sections: Section[] }>('/academics/timetable', { query: { term } }).catch(() => ({ sections: [] as Section[] })),
    api<{ creditLimit?: { value: number } }>('/policies').catch(() => ({} as { creditLimit?: { value: number } })),
  ]);
  const registered = timetable.sections ?? [];
  const limit = policies.creditLimit?.value ?? 19;

  const peers = await api<{ links: PeerLink[] }>('/academics/peers').catch(() => ({ links: [] as PeerLink[] }));
  const mates = classmatesIn(text, friend, peers.links ?? []);
  if (mates.length) {
    const sections: Record<string, string> = {};
    for (const mate of mates) for (const share of mate.theirs) if (share.section && !sections[share.course_code]) sections[share.course_code] = share.section.id;
    if (Object.keys(sections).length) constraints.together = { names: mates.map((m) => ({ en: m.peer.first_en, ar: m.peer.first_ar || m.peer.first_en })), sections };
    // What was said about the classmate has been understood; do not list it as unread.
    parsed.leftover = parsed.leftover.filter((clause) => !classmatesIn(clause, null, mates).length);
  }

  // Eligibility comes with any proposal for the term; make the draft now if there is none to read it from.
  const draftBody = { term, preferences: { text: text || undefined, avoidDays: constraints.avoidDays, courses: [], keepWindows: [], ...(constraints.maxCredits ? { maxCredits: constraints.maxCredits } : {}) } };
  let draftId: string | null = null;
  let eligibility: Record<string, EligibleCourse>;
  const newest = list.length ? [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : null;
  if (newest) {
    eligibility = (await api<{ eligibility: Record<string, EligibleCourse> }>(`/academics/proposals/${newest.id}`)).eligibility ?? {};
  } else {
    const made = await api<{ proposal: { id: string }; eligibility: Record<string, EligibleCourse> }>('/academics/proposals', { body: draftBody });
    draftId = made.proposal.id;
    eligibility = made.eligibility ?? {};
  }

  const problem: Problem = { courses: Object.values(eligibility), registered, constraints, limit };
  const { plans, openCredits, blocked } = makePlans(problem);
  const base = {
    term,
    termLabel,
    constraints,
    understood: describe(constraints),
    notUnderstood: parsed.leftover,
    plans,
    registered: { credits: registered.reduce((n, s) => n + s.credits, 0), sections: registered },
    limit,
    openCredits,
    registeredReport: checkRegistered(registered, constraints),
    blocked,
    whatIf: [] as Plan[],
  };
  if (!plans.length && registered.length && newest) {
    // Every section of the courses already registered, so the whole term can be searched again.
    const held = new Set(registered.map((s) => s.id));
    const again = await Promise.all(
      registered.map(async (s): Promise<EligibleCourse> => {
        const cmp = await api<{ options: Array<{ section: Section }> }>(`/academics/proposals/${newest.id}/compare`, { query: { course: s.course_code } }).catch(() => null);
        const sections = (cmp?.options.map((o) => o.section) ?? [s]).map((x) => (held.has(x.id) ? { ...x, status: 'open', seats_left: Math.max(1, x.seats_left) } : x));
        return { code: s.course_code, title_en: s.title_en, title_ar: s.title_ar, credits: s.credits, required: true, eligible: true, reasons: [], priority: 50, sections };
      }),
    );
    base.whatIf = makePlans({ courses: [...again, ...Object.values(eligibility)], registered: [], constraints, limit }).plans.slice(0, 2);
  }
  if (!plans.length) {
    last = { set: { proposalId: draftId ?? '', ...base }, proposalId: null };
    return last;
  }

  if (!draftId) draftId = (await api<{ proposal: { id: string } }>('/academics/proposals', { body: draftBody })).proposal.id;
  await applySections(draftId, plans[0].sections);
  const set: PlanSet = { proposalId: draftId, ...base };
  savePlanSet(set);
  last = { set, proposalId: draftId };
  return last;
}

/** Switch a draft to another of the plans made for it. */
export async function switchPlan(proposalId: string, planId: string) {
  const set = readPlanSet(proposalId);
  const plan = set?.plans.find((p) => p.id === planId);
  if (!plan) return false;
  await applySections(proposalId, plan.sections);
  return true;
}
