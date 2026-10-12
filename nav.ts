import {
  BookOpenText, Briefcase, CashRegister, ChartBar, ChatsCircle, Coins, Flask, GearSix, GraduationCap, Lifebuoy, MagnifyingGlass, MapTrifold, Path, Stamp, Sun,
  TreeStructure, Trophy, UserFocus, UsersThree, type Icon,
} from '@phosphor-icons/react';
import type { Feature, Role } from '@/lib/session';
import type { Tone } from '@/ui/kit';

export interface NavItem {
  to: string;
  key: string;
  short?: string;
  icon: Icon;
  cap: Feature;
  match?: (path: string) => boolean;
}

export interface NavLine {
  key: string | null;
  tone: Tone;
  items: NavItem[];
}

const under = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

const today: NavItem = { to: '/today', key: 'nav.today', short: 'nav.short.today', icon: Sun, cap: 'today' };
const academics: NavItem = { to: '/academics', key: 'nav.academics', short: 'nav.short.academics', icon: GraduationCap, cap: 'academics' };
const prereqs: NavItem = { to: '/prereqs', key: 'nav.prereqs', short: 'nav.short.prereqs', icon: TreeStructure, cap: 'prereqs' };
const resources: NavItem = { to: '/campus/resources', key: 'nav.resources', icon: BookOpenText, cap: 'resources', match: under('/campus/resources') };
const campus: NavItem = {
  to: '/campus', key: 'nav.campus', short: 'nav.short.campus', icon: UsersThree, cap: 'campusLife',
  match: (p) => p === '/campus' || under('/campus/clubs', '/campus/events')(p),
};
const rewards: NavItem = { to: '/campus/rewards', key: 'nav.rewards', short: 'nav.rewards', icon: Coins, cap: 'rewards', match: under('/campus/rewards') };
const community: NavItem = { to: '/campus/community', key: 'nav.community', icon: ChatsCircle, cap: 'community', match: under('/campus/community') };
const map: NavItem = { to: '/campus/map', key: 'nav.map', short: 'nav.short.map', icon: MapTrifold, cap: 'map', match: under('/campus/map') };
const lostFound: NavItem = { to: '/campus/lost-found', key: 'nav.lostFound', short: 'nav.short.lostFound', icon: MagnifyingGlass, cap: 'lostFound', match: under('/campus/lost-found') };
const portfolio: NavItem = { to: '/portfolio', key: 'nav.portfolio', icon: UserFocus, cap: 'portfolio' };
const career: NavItem = { to: '/career', key: 'nav.career', short: 'nav.short.career', icon: Briefcase, cap: 'career' };
const competitions: NavItem = { to: '/competitions', key: 'nav.competitions', icon: Trophy, cap: 'competitions' };
const journey: NavItem = { to: '/journey', key: 'nav.journey', short: 'nav.short.journey', icon: Path, cap: 'journey' };
const feedback: NavItem = { to: '/feedback', key: 'nav.feedback', icon: Lifebuoy, cap: 'feedback' };
const staff: NavItem = { to: '/staff', key: 'nav.staff', short: 'nav.short.staff', icon: Stamp, cap: 'staff', match: (p) => (p === '/staff' || p.startsWith('/staff/')) && !p.startsWith('/staff/insights') };
const insights: NavItem = { to: '/staff/insights', key: 'nav.insights', icon: ChartBar, cap: 'insights', match: under('/staff/insights') };
const cashier: NavItem = { to: '/cashier', key: 'nav.cashier', icon: CashRegister, cap: 'cashier' };
const demo: NavItem = { to: '/demo', key: 'nav.demo', icon: Flask, cap: 'today' };
const settings: NavItem = { to: '/settings', key: 'nav.settings', icon: GearSix, cap: 'today' };

// Each group carries its module colour: blue Study, orange Campus, orchid Career and journey.
const LINES: NavLine[] = [
  { key: null, tone: 'neutral', items: [today] },
  { key: 'nav.group.work', tone: 'yellow', items: [insights, staff, cashier] },
  { key: 'nav.group.study', tone: 'blue', items: [academics, prereqs, resources] },
  { key: 'nav.group.campus', tone: 'orange', items: [campus, rewards, community, map, lostFound] },
  { key: 'nav.group.future', tone: 'purple', items: [portfolio, career, competitions, journey] },
  { key: 'nav.group.help', tone: 'neutral', items: [feedback, settings] },
];

type Can = (f: Feature) => boolean;

export function navLines(can: Can, demoMode: boolean): NavLine[] {
  const isStudent = can('academics');
  const lines = LINES.filter((line) => !(isStudent && line.key === 'nav.group.work'))
    .map((line) => ({ ...line, items: line.items.filter((it) => can(it.cap)) }))
    .filter((line) => line.items.length);
  const more: NavItem[] = [];
  if (isStudent && can('staff')) more.push(staff);
  if (demoMode) more.push(demo);
  if (more.length) lines.push({ key: 'nav.group.more', tone: 'neutral', items: more });
  return lines;
}

/** The phone dock: the first few of these the account has, and that Focus keeps (`keep`). */
export function dockItems(can: Can, keep: (item: NavItem) => boolean = () => true): NavItem[] {
  const staffOnly = can('staff') && !can('academics');
  const order = !can('academics') && can('insights') ? [today, insights, staff, cashier, map, lostFound]
    : staffOnly ? [today, staff, map, lostFound, prereqs] : [today, academics, journey, campus, rewards, map, career, prereqs];
  return order.filter((it) => can(it.cap) && keep(it) && !(it === journey && can('academics'))).slice(0, can('assistant') ? 4 : 5);
}

export function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.to || path.startsWith(`${item.to}/`);
}

/** The line colour a route belongs to, so pages can pick up their module's colour. */
export function toneForPath(path: string): Tone {
  for (const line of LINES) {
    if (line.items.some((it) => isActive(it, path))) return line.tone;
  }
  return 'neutral';
}

export const ROLE_LABELS: Record<Role, { en: string; ar: string }> = {
  applicant: { en: 'Applicant', ar: 'متقدم' },
  student: { en: 'Student', ar: 'طالب' },
  reviewer: { en: 'Academic reviewer', ar: 'مراجع أكاديمي' },
  club_lead: { en: 'Club lead', ar: 'قائد نادٍ' },
  security: { en: 'Campus security', ar: 'أمن الحرم' },
  operator: { en: 'Demo operator', ar: 'مشغّل العرض' },
  admission_officer: { en: 'Admissions officer', ar: 'موظف قبول' },
  registrar: { en: 'Registrar', ar: 'مسجّل' },
  student_affairs: { en: 'Student affairs', ar: 'شؤون الطلاب' },
  club_advisor: { en: 'Club advisor', ar: 'مشرف نادٍ' },
};
