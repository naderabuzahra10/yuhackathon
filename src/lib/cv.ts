import { api } from './api';
import { service } from './service';
import type { User } from './session';

/* The CV: one document assembled from what the student has already recorded.
   The portfolio gives the profile, experience, projects, awards and evidence-backed skills; the
   academic record gives the degree, GPA and strongest courses; the digital card gives clubs,
   volunteering and verified attendance. Nothing is typed twice, and nothing appears on the CV
   that is not in those records. Wording can be polished by the model, which may rephrase but
   is told not to add facts. */

export interface Text2 {
  en: string;
  ar: string;
}

export interface CvEntry {
  id: string;
  title: Text2;
  org?: Text2;
  from?: string | null;
  to?: string | null;
  /** Still going: the date reads "since". */
  ongoing?: boolean;
  bullets: string[];
  verified?: boolean;
}

export interface CvData {
  name: Text2;
  headline: string;
  availability: string | null;
  email: string;
  city: Text2;
  links: Array<{ label: string; href: string }>;
  summary: string;
  education: {
    school: Text2;
    degree: Text2;
    gpa: number | null;
    credits: number;
    total: number | null;
    expected: Text2 | null;
    coursework: Text2[];
  };
  experience: CvEntry[];
  projects: CvEntry[];
  awards: CvEntry[];
  volunteering: CvEntry[];
  certificates: CvEntry[];
  activities: CvEntry[];
  workshops: CvEntry[];
  skills: { core: Text2[]; technical: Text2[]; professional: Text2[]; learning: Text2[] };
  languages: string[];
}

export const CV_SECTIONS = ['summary', 'education', 'experience', 'projects', 'awards', 'volunteering', 'activities', 'workshops', 'certificates', 'skills'] as const;
export type CvSection = (typeof CV_SECTIONS)[number];

export type CvTemplate = 'classic' | 'modern';
export type CvLang = 'en' | 'ar';

export const CV_ACCENTS = { pine: '#0e4a3b', ink: '#1b1e22', cobalt: '#1d3f8f', plum: '#5b2a6e' } as const;
export type CvAccent = keyof typeof CV_ACCENTS;

export interface CvOptions {
  template: CvTemplate;
  accent: CvAccent;
  lang: CvLang;
  hidden: CvSection[];
  showGpa: boolean;
  showVerified: boolean;
  /** Typed by the student for the CV and kept on their device; `email` starts as the account's. */
  contact: { email: string; phone: string; linkedin: string; website: string };
}

export const CV_DEFAULTS: CvOptions = { template: 'classic', accent: 'pine', lang: 'en', hidden: [], showGpa: true, showVerified: true, contact: { email: '', phone: '', linkedin: '', website: '' } };

const storeKey = (userId: string) => `uj.cv.v1.${userId}`;

export function readCvOptions(userId: string): CvOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(userId)) ?? 'null') as Partial<CvOptions> | null;
    if (!saved) return CV_DEFAULTS;
    return {
      ...CV_DEFAULTS,
      ...saved,
      accent: saved.accent && saved.accent in CV_ACCENTS ? saved.accent : CV_DEFAULTS.accent,
      hidden: (saved.hidden ?? []).filter((s) => CV_SECTIONS.includes(s)),
      contact: { ...CV_DEFAULTS.contact, ...saved.contact },
    };
  } catch {
    return CV_DEFAULTS;
  }
}

export function saveCvOptions(userId: string, options: CvOptions) {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(options));
  } catch {
    /* private mode: the choices last for this visit */
  }
}

export const CV_LABELS = {
  summary: { en: 'Profile', ar: 'نبذة' },
  education: { en: 'Education', ar: 'التعليم' },
  experience: { en: 'Experience', ar: 'الخبرات' },
  projects: { en: 'Projects', ar: 'المشاريع' },
  awards: { en: 'Awards', ar: 'الجوائز' },
  volunteering: { en: 'Volunteering', ar: 'العمل التطوعي' },
  certificates: { en: 'Certificates', ar: 'الشهادات' },
  activities: { en: 'Clubs and activities', ar: 'الأندية والأنشطة' },
  workshops: { en: 'Workshops and events', ar: 'ورش العمل والفعاليات' },
  skills: { en: 'Skills', ar: 'المهارات' },
  languages: { en: 'Languages', ar: 'اللغات' },
  contact: { en: 'Contact', ar: 'التواصل' },
  coursework: { en: 'Relevant coursework', ar: 'مقررات ذات صلة' },
  gpa: { en: 'GPA', ar: 'المعدل التراكمي' },
  credits: { en: '{a} of {b} credits completed', ar: '{a} من {b} ساعة معتمدة مكتملة' },
  expected: { en: 'Expected {term}', ar: 'التخرج المتوقع: {term}' },
  since: { en: 'Since {date}', ar: 'منذ {date}' },
  core: { en: 'Core', ar: 'أساسية' },
  technical: { en: 'Technical', ar: 'تقنية' },
  professional: { en: 'Professional', ar: 'مهنية' },
  learning: { en: 'Currently studying', ar: 'أدرسها حاليًا' },
  available: { en: 'Available', ar: 'التوفر' },
  member: { en: 'Member', ar: 'عضو' },
  verified: { en: 'Verified in Al Yamamah University records', ar: 'موثّق في سجلات جامعة اليمامة' },
} satisfies Record<string, Text2>;

interface PortfolioItem {
  id: string;
  kind: string;
  title: string;
  org: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  url: string | null;
  credential_id?: string | null;
  verification: string;
  outcomes?: string[];
}

interface PortfolioSkill {
  key: string;
  label_en: string;
  label_ar: string;
  strength: number;
  evidence: Array<{ kind: string }>;
}

interface Portfolio {
  profile: { headline: string | null; summary: string | null; skills: string[]; links: Record<string, string> | null; availability: string | null };
  items: PortfolioItem[];
  accounts: Array<{ provider?: string; url?: string }>;
  skills: PortfolioSkill[];
  education: { program: { name_en: string; name_ar: string; degree: string; total_credits: number } | null; credits: number; gpa: number | null; courses: Array<{ course_code: string; status: string; grade: string | null; title_en: string; title_ar: string }> };
}

interface Card {
  memberships: Array<{ club_id: string; name_en: string; name_ar: string; role: string; decided_at: string | null }>;
  achievements: Array<{ id: string; title_en: string; title_ar: string; kind: string; club_name_en: string | null; created_at: string; event_start_at: string | null }>;
}

const both = (en: string, ar?: string | null): Text2 => ({ en, ar: ar || en });

/** A paragraph as bullet points: one per sentence, tidied. */
export function bulletsOf(text: string | null | undefined): string[] {
  return String(text ?? '')
    .split(/(?<=[.!?؟])\s+(?=[A-Z؀-ۿ])|\n+/)
    .map((s) => s.trim().replace(/^[-•]\s*/, ''))
    .filter((s) => s.length > 2)
    .map((s) => s[0].toUpperCase() + s.slice(1));
}

const SEASON: Record<string, { en: string; ar: string; shift: number }> = {
  '1': { en: 'Fall', ar: 'خريف', shift: 0 },
  '2': { en: 'Spring', ar: 'ربيع', shift: 1 },
  '3': { en: 'Summer', ar: 'صيف', shift: 1 },
};

function termLabel(term: string | null | undefined): Text2 | null {
  const m = /^(\d{4})-(\d)$/.exec(term ?? '');
  const season = m ? SEASON[m[2]] : null;
  if (!m || !season) return null;
  const year = Number(m[1]) + season.shift;
  return { en: `${season.en} ${year}`, ar: `${season.ar} ${year}` };
}

const GRADE_RANK: Record<string, number> = { 'A+': 0, A: 1, 'B+': 2 };
const SOFT = /team|problem solving|writing|management|communicat|leader|presentation|public speaking|critical thinking|mentor|negotiat/i;

export async function loadCv(user: User): Promise<CvData> {
  const [portfolio, card, overview, competitions] = await Promise.all([
    api<Portfolio>('/career/portfolio'),
    api<Card>('/campus/me/card').catch((): Card => ({ memberships: [], achievements: [] })),
    api<{ credits?: { estimate?: { earliest_completion_term?: string } } }>('/academics/overview').catch(() => null),
    api<{ items: Array<{ id: string; entry: { team_name: string | null } | null }> }>('/career/competitions').catch(() => ({ items: [] })),
  ]);

  const entry = (it: PortfolioItem): CvEntry => {
    const bullets = [...bulletsOf(it.description), ...(it.outcomes ?? [])];
    // A competition award knows its team from the competition record.
    const comp = /^competition:(.+)$/.exec(it.credential_id ?? '');
    const team = comp ? competitions.items.find((c) => c.id === comp[1])?.entry?.team_name : null;
    if (team) bullets.push(`Team: ${team}.`);
    return { id: it.id, title: both(it.title), org: it.org ? both(it.org) : undefined, from: it.start_date, to: it.end_date, ongoing: !!it.start_date && !it.end_date, bullets, verified: it.verification === 'university' };
  };
  const ofKind = (kind: string) => portfolio.items.filter((it) => it.kind === kind).map(entry);

  // The card words its entries as sentences ("Attended ..."); a CV lists the thing itself.
  const stripEn = (title: string) => title.replace(/^(Attended|Volunteered at|Participated in)\s+/i, '');
  const stripAr = (title: string) => title.replace(/^(حضور|تطو[ّ]?ع في|المشاركة في)\s+/, '');
  const fromCard = (kind: string): CvEntry[] =>
    card.achievements
      .filter((a) => a.kind === kind)
      .map((a) => ({ id: a.id, title: both(stripEn(a.title_en), stripAr(a.title_ar ?? '')), org: a.club_name_en ? both(a.club_name_en) : undefined, from: a.event_start_at ?? a.created_at, to: a.event_start_at ?? a.created_at, bullets: [], verified: true }));

  const major = (code: string) => (/^(CIS|SWE|NES|CNE|MIS|CS|IT)\b/.test(code) ? 0 : 1);
  const coursework = portfolio.education.courses
    .filter((c) => c.status === 'completed' && c.grade != null && c.grade in GRADE_RANK)
    .sort((a, b) => major(a.course_code) - major(b.course_code) || GRADE_RANK[a.grade!] - GRADE_RANK[b.grade!])
    .slice(0, 6)
    .map((c) => both(c.title_en, c.title_ar));

  // Skills, strongest claim first: what the university has verified and what the student names
  // as their own; then what completed courses back; then what is being studied now.
  const byName = new Map(portfolio.skills.map((s) => [s.label_en.toLowerCase(), s]));
  const core: Text2[] = [];
  const taken = new Set<string>();
  const push = (list: Text2[], en: string, ar?: string) => {
    if (taken.has(en.toLowerCase())) return;
    taken.add(en.toLowerCase());
    list.push(both(en, ar));
  };
  for (const s of portfolio.skills) if (s.evidence.some((e) => e.kind.includes('verified'))) push(core, s.label_en, s.label_ar);
  for (const name of portfolio.profile.skills ?? []) push(core, name, byName.get(name.toLowerCase())?.label_ar);
  const ranked = [...portfolio.skills].sort((a, b) => b.strength - a.strength || b.evidence.length - a.evidence.length);
  const technical: Text2[] = [];
  const professional: Text2[] = [];
  const learning: Text2[] = [];
  for (const s of ranked) {
    const studying = s.evidence.length > 0 && s.evidence.every((e) => e.kind === 'course_in_progress');
    const list = studying ? learning : SOFT.test(s.label_en) ? professional : technical;
    if (list.length < (list === technical ? 9 : 7)) push(list, s.label_en, s.label_ar);
  }

  const links: CvData['links'] = [];
  for (const [key, href] of Object.entries(portfolio.profile.links ?? {})) if (href) links.push({ label: key, href });
  for (const a of portfolio.accounts ?? []) if (a.url && !links.some((x) => x.href === a.url)) links.push({ label: a.provider ?? 'link', href: a.url });

  const program = portfolio.education.program;
  return {
    name: both(user.name_en, user.name_ar),
    headline: portfolio.profile.headline ?? '',
    availability: portfolio.profile.availability,
    email: user.email ?? '',
    city: user.campus_id === 'khobar' ? { en: 'Khobar, Saudi Arabia', ar: 'الخبر، السعودية' } : { en: 'Riyadh, Saudi Arabia', ar: 'الرياض، السعودية' },
    links,
    summary: portfolio.profile.summary ?? '',
    education: {
      school: { en: 'Al Yamamah University', ar: 'جامعة اليمامة' },
      degree: program ? { en: `${program.degree} in ${program.name_en}`, ar: `بكالوريوس ${program.name_ar || program.name_en}` } : { en: '', ar: '' },
      gpa: portfolio.education.gpa,
      credits: portfolio.education.credits,
      total: program?.total_credits ?? null,
      expected: termLabel(overview?.credits?.estimate?.earliest_completion_term),
      coursework,
    },
    experience: ofKind('experience'),
    projects: ofKind('project'),
    awards: ofKind('award'),
    volunteering: [...ofKind('volunteer'), ...fromCard('volunteer')],
    certificates: ofKind('certificate'),
    activities: card.memberships.map((m) => ({
      id: m.club_id,
      title: both(m.name_en, m.name_ar),
      org: m.role === 'member' ? CV_LABELS.member : both(m.role[0].toUpperCase() + m.role.slice(1)),
      from: m.decided_at,
      to: null,
      ongoing: true,
      bullets: [],
    })),
    workshops: fromCard('participation').slice(0, 5),
    skills: { core, technical, professional, learning },
    languages: portfolio.items.filter((it) => it.kind === 'language').map((it) => it.title),
  };
}

/** Whether a section has anything to show. */
export function hasContent(cv: CvData, section: CvSection): boolean {
  if (section === 'summary') return !!cv.summary.trim();
  if (section === 'education') return !!cv.education.degree.en;
  if (section === 'skills') return cv.skills.core.length + cv.skills.technical.length + cv.skills.professional.length > 0;
  return cv[section].length > 0;
}

export function verifiedCount(cv: CvData, hidden: CvSection[]): number {
  const lists: Array<[CvSection, CvEntry[]]> = [['experience', cv.experience], ['projects', cv.projects], ['awards', cv.awards], ['volunteering', cv.volunteering], ['certificates', cv.certificates], ['workshops', cv.workshops]];
  return lists.filter(([key]) => !hidden.includes(key)).reduce((n, [, list]) => n + list.filter((e) => e.verified).length, 0);
}

/** "Mar 2026", "Apr 2026 - Sep 2026", "Since Apr 2026". */
export function cvDates(e: Pick<CvEntry, 'from' | 'to' | 'ongoing'>, lang: CvLang): string {
  const fmt = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d);
  };
  const from = e.from ? fmt(e.from) : '';
  const to = e.to ? fmt(e.to) : '';
  if (e.ongoing && from) return CV_LABELS.since[lang].replace('{date}', from);
  if (from && to && from !== to) return `${from} - ${to}`;
  return to || from;
}

/** The contact line: what the student typed, falling back to the account's email and linked accounts. */
export function contactOf(cv: CvData, options: CvOptions, lang: CvLang): Array<{ kind: 'city' | 'email' | 'phone' | 'link'; text: string; href?: string }> {
  const out: Array<{ kind: 'city' | 'email' | 'phone' | 'link'; text: string; href?: string }> = [{ kind: 'city', text: cv.city[lang] }];
  const email = options.contact.email.trim() || cv.email;
  if (email) out.push({ kind: 'email', text: email, href: `mailto:${email}` });
  if (options.contact.phone.trim()) out.push({ kind: 'phone', text: options.contact.phone.trim() });
  const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  const full = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
  const typed = [options.contact.linkedin, options.contact.website].map((s) => s.trim()).filter(Boolean);
  for (const url of typed.length ? typed : cv.links.map((x) => x.href)) out.push({ kind: 'link', text: bare(url), href: full(url) });
  return out;
}

/** The CV as plain text, for application forms that want it pasted. */
export function cvText(cv: CvData, options: CvOptions): string {
  const lang = options.lang;
  const on = (s: CvSection) => !options.hidden.includes(s) && hasContent(cv, s);
  const label = (key: keyof typeof CV_LABELS) => CV_LABELS[key][lang].toUpperCase();
  const lines: string[] = [cv.name[lang], cv.headline, contactOf(cv, options, lang).map((c) => c.text).join(' | ')];
  if (cv.availability) lines.push(`${CV_LABELS.available[lang]}: ${cv.availability}`);
  const head = (key: keyof typeof CV_LABELS) => lines.push('', label(key));
  if (on('summary')) {
    head('summary');
    lines.push(cv.summary);
  }
  if (on('education')) {
    const ed = cv.education;
    head('education');
    lines.push(`${ed.degree[lang]}, ${ed.school[lang]}${ed.expected ? ` (${CV_LABELS.expected[lang].replace('{term}', ed.expected[lang])})` : ''}`);
    const facts = [options.showGpa && ed.gpa != null ? `${CV_LABELS.gpa[lang]} ${ed.gpa.toFixed(2)} / 4.00` : '', ed.total ? CV_LABELS.credits[lang].replace('{a}', String(ed.credits)).replace('{b}', String(ed.total)) : ''].filter(Boolean);
    if (facts.length) lines.push(facts.join(', '));
    if (ed.coursework.length) lines.push(`${CV_LABELS.coursework[lang]}: ${ed.coursework.map((c) => c[lang]).join(', ')}`);
  }
  for (const key of ['experience', 'projects', 'awards', 'volunteering', 'activities', 'workshops', 'certificates'] as const) {
    if (!on(key)) continue;
    head(key);
    for (const e of cv[key]) {
      lines.push([e.title[lang], e.org?.[lang], cvDates(e, lang)].filter(Boolean).join(', '));
      for (const b of e.bullets) lines.push(`- ${b}`);
    }
  }
  if (on('skills')) {
    head('skills');
    for (const key of ['core', 'technical', 'professional', 'learning'] as const) {
      if (cv.skills[key].length) lines.push(`${CV_LABELS[key][lang]}: ${cv.skills[key].map((s) => s[lang]).join(', ')}`);
    }
    if (cv.languages.length) lines.push(`${CV_LABELS.languages[lang]}: ${cv.languages.join(', ')}`);
  }
  return lines.join('\n');
}

export interface Polish {
  headline?: string;
  summary?: string;
  entries?: Array<{ id: string; bullets: string[] }>;
}

let modelReady: Promise<boolean> | null = null;
/** Whether the server has a model that can polish wording. */
export function canPolish() {
  modelReady ??= fetch('/agent/status')
    .then((r) => r.json())
    .then((s: { provider?: string }) => s.provider === 'anthropic')
    .catch(() => false);
  return modelReady;
}

const POLISHED = ['experience', 'projects', 'awards', 'volunteering', 'certificates'] as const;

/** Ask the model for stronger wording of what is already there. Throws when it cannot. */
export async function polishCv(cv: CvData): Promise<Polish> {
  const entries = POLISHED.flatMap((key) => cv[key])
    .filter((e) => e.bullets.length)
    .map((e) => ({ id: e.id, title: e.title.en, org: e.org?.en ?? '', bullets: e.bullets }));
  return service<Polish>('/agent/cv', { body: { headline: cv.headline, summary: cv.summary, degree: cv.education.degree.en, skills: cv.skills.core.map((s) => s.en), entries } });
}

export function applyPolish(cv: CvData, polish: Polish | null): CvData {
  if (!polish) return cv;
  const lookup = new Map((polish.entries ?? []).map((e) => [e.id, e.bullets]));
  const fix = (list: CvEntry[]) => list.map((e) => (lookup.get(e.id)?.length ? { ...e, bullets: lookup.get(e.id)! } : e));
  return {
    ...cv,
    headline: polish.headline?.trim() || cv.headline,
    summary: polish.summary?.trim() || cv.summary,
    experience: fix(cv.experience),
    projects: fix(cv.projects),
    awards: fix(cv.awards),
    volunteering: fix(cv.volunteering),
    certificates: fix(cv.certificates),
  };
}
