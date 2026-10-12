import { api } from './api';
import { addDays, riyadhDay } from './clock';
import { riyadhMinutes } from './format';
import { service } from './service';

/* The study coach: practice questions and flashcards made from a student's own notes, and a
   revision plan laid around their classes.

   With a model key on the server, Claude writes the questions from the text of the notes and
   says which paragraph each comes from. Without one, a built-in generator makes fill-in-the-gap
   questions from the same text, so practice still works; the page says which made them. */

export interface Question {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  paragraph: number;
}

export interface Card {
  front: string;
  back: string;
  paragraph: number;
}

export interface Made<T> {
  items: T[];
  source: 'model' | 'builtin';
  model?: string;
}

const STOP = new Set(
  'about above after again against along already also although always among another because become before being below between both cannot could during each either every first from have having however into itself least less many might more most much must never often only other others over rather same several should since some such than that their them then there these they this those through under until upon very were what when where whether which while whose will with within without would your yours'.split(' '),
);

interface Sentence {
  text: string;
  paragraph: number;
}

function sentencesOf(paragraphs: string[]): Sentence[] {
  const out: Sentence[] = [];
  paragraphs.forEach((p, i) => {
    for (const raw of p.split(/(?<=[.!?؟])\s+|\n+/)) {
      const text = raw.trim();
      if (text.length >= 45 && text.length <= 240 && text.split(/\s+/).length >= 7) out.push({ text, paragraph: i + 1 });
    }
  });
  return out;
}

/** Words worth asking about: long enough, not everyday, and used more than once in the notes. */
function keywordsOf(paragraphs: string[]) {
  const counts = new Map<string, { n: number; shown: string }>();
  for (const word of paragraphs.join(' ').match(/[A-Za-z؀-ۿ][A-Za-z؀-ۿ-]{4,}/g) ?? []) {
    const key = word.toLowerCase();
    if (STOP.has(key)) continue;
    const hit = counts.get(key);
    if (hit) hit.n += 1;
    else counts.set(key, { n: 1, shown: word });
  }
  return [...counts.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n * b[0].length - a[1].n * a[0].length).map(([key, v]) => ({ key, shown: v.shown }));
}

/** A repeatable shuffle, so the same notes give the same practice set. */
function shuffled<T>(list: T[], seed: number) {
  const out = [...list];
  let s = seed + 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function builtinQuiz(paragraphs: string[], count: number): Question[] {
  const keywords = keywordsOf(paragraphs);
  const sentences = sentencesOf(paragraphs);
  const used = new Set<string>();
  const out: Question[] = [];
  for (const [i, s] of shuffled(sentences, paragraphs.length).entries()) {
    if (out.length >= count) break;
    const lower = s.text.toLowerCase();
    const target = keywords.find((k) => !used.has(k.key) && new RegExp(`(^|[^A-Za-z؀-ۿ])${k.key}([^A-Za-z؀-ۿ]|$)`).test(lower));
    if (!target) continue;
    const others = shuffled(keywords.filter((k) => k.key !== target.key && !lower.includes(k.key)), i).slice(0, 3);
    if (others.length < 3) continue;
    used.add(target.key);
    const options = shuffled([target.shown.toLowerCase(), ...others.map((o) => o.shown.toLowerCase())], i + 7);
    out.push({
      question: s.text.replace(new RegExp(target.key, 'i'), '_____'),
      options,
      answer: options.indexOf(target.shown.toLowerCase()),
      explanation: s.text,
      paragraph: s.paragraph,
    });
  }
  return out;
}

export function builtinCards(paragraphs: string[], count: number): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const s of sentencesOf(paragraphs)) {
    if (out.length >= count) break;
    // "X is ...", "X means ...", "X puts ...": the subject becomes the prompt.
    const m = /^(?:In\s+|The\s+|An?\s+)?([A-Z؀-ۿ][^,.;:]{2,48}?)\s+(is|are|means|refers to|stacks|puts|defines|describes|separates|keeps|uses|هو|هي|تعني)\s+(.{20,})$/.exec(s.text);
    if (!m || seen.has(m[1].toLowerCase())) continue;
    seen.add(m[1].toLowerCase());
    out.push({ front: m[1].trim(), back: s.text, paragraph: s.paragraph });
  }
  // Not enough definitions in the notes: fall back to gap cards.
  for (const q of builtinQuiz(paragraphs, count)) {
    if (out.length >= count) break;
    out.push({ front: q.question, back: q.options[q.answer], paragraph: q.paragraph });
  }
  return out;
}

let modelReady: Promise<boolean> | null = null;
/** Whether the server has a model to ask; checked once, so practice does not knock on a closed door each time. */
function hasModel() {
  modelReady ??= fetch('/agent/status')
    .then((r) => r.json())
    .then((s: { provider?: string }) => s.provider === 'anthropic')
    .catch(() => false);
  return modelReady;
}

export async function makeQuiz(title: string, paragraphs: string[], locale: string, count = 6): Promise<Made<Question>> {
  try {
    if (!(await hasModel())) throw new Error('no model');
    const res = await service<{ questions: Question[]; model?: string }>('/agent/study', { body: { kind: 'quiz', title, paragraphs, count, locale } });
    if (res.questions?.length) return { items: res.questions, source: 'model', model: res.model };
  } catch {
    /* no key, no server, or the model failed: the built-in generator takes over */
  }
  return { items: builtinQuiz(paragraphs, count), source: 'builtin' };
}

export async function makeCards(title: string, paragraphs: string[], locale: string, count = 8): Promise<Made<Card>> {
  try {
    if (!(await hasModel())) throw new Error('no model');
    const res = await service<{ cards: Card[]; model?: string }>('/agent/study', { body: { kind: 'cards', title, paragraphs, count, locale } });
    if (res.cards?.length) return { items: res.cards, source: 'model', model: res.model };
  } catch {
    /* as above */
  }
  return { items: builtinCards(paragraphs, count), source: 'builtin' };
}

/* ── Revision plan ── */

interface PlannerItem {
  id: string;
  title: string;
  course_code: string | null;
  kind: string;
  assessment_kind: string | null;
  date: string | null;
  start_at: string | null;
  due_at: string | null;
  done: boolean;
  cancelled?: boolean;
}

interface Busy {
  start_at: string;
  end_at: string;
}

interface Planner {
  today: string;
  now: string;
  items: PlannerItem[];
  busy: Busy[];
}

export interface Block {
  key: string;
  for: string;
  forTitle: string;
  course_code: string | null;
  title: string;
  date: string;
  time: string;
  duration_min: number;
}

export interface RevisionPlan {
  blocks: Block[];
  assessments: Array<{ id: string; title: string; course_code: string | null; kind: string; date: string; sessions: number }>;
}

/** How many sittings an assessment deserves, and how long each is. */
const EFFORT: Record<string, { sessions: number; minutes: number }> = {
  final: { sessions: 5, minutes: 90 },
  midterm: { sessions: 4, minutes: 90 },
  project: { sessions: 3, minutes: 90 },
  quiz: { sessions: 2, minutes: 60 },
  assignment: { sessions: 2, minutes: 60 },
  lab: { sessions: 2, minutes: 60 },
};

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Lay revision sittings in the free hours before each coming assessment: one a day, nearest days first, never over a class. */
export function planRevision(planner: Planner, horizonDays = 21): RevisionPlan {
  const today = planner.today;
  const nowMin = riyadhMinutes(new Date(planner.now));
  const last = addDays(today, horizonDays);
  const taken = new Map<string, Array<[number, number]>>();
  const hold = (day: string, from: number, to: number) => taken.set(day, [...(taken.get(day) ?? []), [from, to]]);

  for (const b of planner.busy) {
    const start = new Date(b.start_at);
    hold(riyadhDay(start), riyadhMinutes(start) - 15, riyadhMinutes(new Date(b.end_at)) + 15);
  }
  // Revision already in the planner counts as taken time, so asking twice does not double-book.
  for (const it of planner.items) {
    if (it.kind === 'task' && it.start_at && !it.done) {
      const start = new Date(it.start_at);
      hold(riyadhDay(start), riyadhMinutes(start), riyadhMinutes(start) + 90);
    }
  }

  const coming = planner.items
    .filter((it) => it.kind === 'assessment' && !it.done && !it.cancelled && it.date && it.date >= today && it.date <= last)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  const perDay = new Map<string, number>();
  const blocks: Block[] = [];
  const assessments: RevisionPlan['assessments'] = [];

  for (const a of coming) {
    const effort = EFFORT[a.assessment_kind ?? ''] ?? { sessions: 2, minutes: 60 };
    const already = planner.items.filter((it) => it.kind === 'task' && !it.done && it.title.includes(a.title)).length;
    const want = Math.max(0, effort.sessions - already);
    const sitsAt = a.start_at ? riyadhMinutes(new Date(a.start_at)) : a.due_at ? riyadhMinutes(new Date(a.due_at)) : 24 * 60;
    let placed = 0;
    // Walk back from the day itself, then allow a second sitting per day if the days run out.
    for (let cap = 1; cap <= 2 && placed < want; cap++) {
      // A second sitting in a day is for the days before, not the day of the assessment itself.
      for (let day = cap === 1 ? a.date! : addDays(a.date!, -1); day >= today && placed < want; day = addDays(day, -1)) {
        if ((perDay.get(day) ?? 0) >= cap) continue;
        const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
        const opens = Math.max(weekday === 5 ? 14 * 60 : 9 * 60, day === today ? Math.ceil((nowMin + 60) / 30) * 30 : 0);
        const closes = Math.min(21 * 60, day === a.date ? sitsAt - 30 : 24 * 60);
        // Late afternoon first, then outwards: after classes is when revision actually happens.
        const starts: number[] = [];
        for (let start = opens; start + effort.minutes <= closes; start += 30) starts.push(start);
        starts.sort((x, y) => Math.abs(x - 17 * 60) - Math.abs(y - 17 * 60));
        for (const start of starts) {
          const end = start + effort.minutes;
          if ((taken.get(day) ?? []).some(([f, t]) => start < t && f < end)) continue;
          hold(day, start - 30, end + 30);
          perDay.set(day, (perDay.get(day) ?? 0) + 1);
          blocks.push({ key: `${a.id}:${day}:${start}`, for: a.id, forTitle: a.title, course_code: a.course_code, title: `Revise: ${a.title}`, date: day, time: hhmm(start), duration_min: effort.minutes });
          placed += 1;
          break;
        }
      }
    }
    assessments.push({ id: a.id, title: a.title, course_code: a.course_code, kind: a.assessment_kind ?? 'assessment', date: a.date!, sessions: placed });
  }
  blocks.sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`));
  return { blocks, assessments };
}

export async function loadRevisionPlan(): Promise<RevisionPlan> {
  return planRevision(await api<Planner>('/academics/planner'));
}

/** Put the sittings in the study planner. Resolves to how many were added. */
export async function addRevisionBlocks(blocks: Block[]): Promise<number> {
  let added = 0;
  for (const b of blocks) {
    await api('/academics/planner/items', {
      body: { title: b.title, course_code: b.course_code ?? undefined, kind: 'task', date: b.date, time: b.time, duration_min: b.duration_min, urgency: 'medium', remind: 'none', description: 'Planned by the study coach' },
    });
    added += 1;
  }
  return added;
}
