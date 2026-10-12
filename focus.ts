import { useMemo, useSyncExternalStore } from 'react';
import { type Feature, useSession } from './session';

/* Focus: one switch in the top bar that strips the app down to what the person has marked as
   important. This module holds what can be hidden, what is kept when nothing has been chosen,
   and the choices made in Settings. Choices live on the device, per account.

   Hiding only changes what is shown. A hidden page still opens from a link, and turning Focus
   off brings everything back exactly as it was. */

export type FocusGroupId = 'pages' | 'today' | 'academics' | 'campus' | 'bar';

export interface FocusDef {
  id: string;
  /** Translation keys. */
  label: string;
  hint: string;
  /** Listed only for accounts that have this. */
  cap?: Feature;
  /** Never hidden. */
  locked?: boolean;
}

export const pageId = (to: string) => `page:${to}`;
export const tabId = (to: string) => `tab:${to}`;

export const TODAY_ITEMS: FocusDef[] = [
  { id: 'today:ask', label: 'focus.i.ask', hint: 'focus.i.askHint', cap: 'assistant' },
  { id: 'today:next', label: 'focus.i.next', hint: 'focus.i.nextHint', cap: 'academics' },
  { id: 'today:points', label: 'focus.i.points', hint: 'focus.i.pointsHint', cap: 'rewards' },
  { id: 'today:shortcuts', label: 'focus.i.shortcuts', hint: 'focus.i.shortcutsHint', cap: 'academics' },
  { id: 'today:inbox', label: 'focus.i.inbox', hint: 'focus.i.inboxHint' },
  { id: 'today:forYou', label: 'focus.i.forYou', hint: 'focus.i.forYouHint' },
];

export const TAB_ITEMS: FocusDef[] = [
  { id: tabId('/academics'), label: 'academics.nav.overview', hint: 'focus.h.tab.overview', locked: true },
  { id: tabId('/academics/plan'), label: 'academics.nav.plan', hint: 'focus.h.tab.plan', cap: 'degreePlan' },
  { id: tabId('/academics/register'), label: 'academics.nav.register', hint: 'focus.h.tab.register', cap: 'registration' },
  { id: tabId('/academics/timetable'), label: 'academics.nav.timetable', hint: 'focus.h.tab.timetable' },
  { id: tabId('/academics/attendance'), label: 'academics.nav.attendance', hint: 'focus.h.tab.attendance', cap: 'attendance' },
  { id: tabId('/academics/excuses'), label: 'academics.nav.excuses', hint: 'focus.h.tab.excuses', cap: 'attendance' },
  { id: tabId('/academics/study'), label: 'academics.nav.study', hint: 'focus.h.tab.study', cap: 'study' },
  { id: tabId('/academics/gpa'), label: 'academics.nav.gpa', hint: 'focus.h.tab.gpa', cap: 'gpa' },
];

export const CAMPUS_ITEMS: FocusDef[] = [
  { id: 'campus:community', label: 'focus.i.community', hint: 'focus.i.communityHint', cap: 'community' },
  { id: 'campus:events', label: 'campus.hub.upcoming', hint: 'focus.i.eventsHint' },
  { id: 'campus:clubs', label: 'campus.hub.myClubs', hint: 'focus.i.clubsHint' },
  { id: 'campus:discover', label: 'campus.hub.discover', hint: 'focus.i.discoverHint' },
];

export const BAR_ITEMS: FocusDef[] = [
  { id: 'bar:points', label: 'focus.i.barPoints', hint: 'focus.i.barPointsHint', cap: 'rewards' },
  { id: 'bar:scan', label: 'focus.i.barScan', hint: 'focus.i.barScanHint' },
  { id: 'bar:language', label: 'focus.i.barLanguage', hint: 'focus.i.barLanguageHint' },
  { id: 'bar:demo', label: 'focus.i.barDemo', hint: 'focus.i.barDemoHint' },
];

/** What a student keeps when they have chosen nothing: the daily basics. */
const ESSENTIALS = [
  pageId('/today'), pageId('/academics'), pageId('/campus/resources'), pageId('/campus'), pageId('/campus/rewards'), pageId('/campus/map'), pageId('/portfolio'),
  pageId('/staff'), pageId('/staff/insights'), pageId('/cashier'),
  'today:ask', 'today:next', 'today:inbox',
  tabId('/academics'), tabId('/academics/register'), tabId('/academics/timetable'), tabId('/academics/attendance'), tabId('/academics/study'),
  'campus:events', 'campus:clubs',
  'bar:points', 'bar:scan',
];

export const PRESETS = {
  essentials: ESSENTIALS,
  exams: [
    pageId('/today'), pageId('/academics'), pageId('/campus/resources'), pageId('/campus/map'),
    'today:ask', 'today:next', 'today:inbox',
    tabId('/academics'), tabId('/academics/timetable'), tabId('/academics/study'), tabId('/academics/attendance'), tabId('/academics/gpa'),
  ],
  career: [
    pageId('/today'), pageId('/academics'), pageId('/portfolio'), pageId('/career'), pageId('/competitions'), pageId('/journey'),
    'today:ask', 'today:inbox', 'today:forYou',
    tabId('/academics'), tabId('/academics/timetable'), tabId('/academics/plan'), tabId('/academics/gpa'),
    'campus:events',
  ],
  campus: [
    pageId('/today'), pageId('/academics'), pageId('/campus'), pageId('/campus/rewards'), pageId('/campus/community'), pageId('/campus/map'), pageId('/campus/lost-found'),
    'today:ask', 'today:next', 'today:points', 'today:shortcuts',
    tabId('/academics'), tabId('/academics/timetable'),
    'campus:community', 'campus:events', 'campus:clubs', 'campus:discover',
    'bar:points', 'bar:scan',
  ],
} satisfies Record<string, string[]>;

export type PresetId = keyof typeof PRESETS;

// Today is home, and Settings is the way back out of whatever was hidden.
const LOCKED = new Set([pageId('/today'), pageId('/settings'), tabId('/academics')]);
const ESSENTIAL = new Set(ESSENTIALS);
/** Staff and applicants have short menus where nearly everything is the job: only the extras go. */
const STAFF_EXTRAS = new Set([pageId('/demo'), pageId('/feedback'), 'bar:demo', 'bar:language']);

export const isLocked = (id: string) => LOCKED.has(id);

function recommended(id: string, student: boolean) {
  return student ? ESSENTIAL.has(id) : !STAFF_EXTRAS.has(id);
}

interface State {
  on: boolean;
  /** Only what the person has decided; everything else follows the recommendation. */
  keep: Record<string, boolean>;
}

const EMPTY: State = { on: false, keep: {} };
const cache = new Map<string, State>();
const subs = new Set<() => void>();
const storeKey = (userId: string) => `uj.focus.v1.${userId}`;

function read(userId: string): State {
  const hit = cache.get(userId);
  if (hit) return hit;
  let state = EMPTY;
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(userId)) ?? 'null') as Partial<State> | null;
    if (saved && typeof saved === 'object') state = { on: saved.on === true, keep: saved.keep && typeof saved.keep === 'object' ? saved.keep : {} };
  } catch {
    /* unreadable or blocked storage: start from the recommendation */
  }
  cache.set(userId, state);
  return state;
}

function update(userId: string, change: (state: State) => State) {
  const next = change(read(userId));
  cache.set(userId, next);
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(next));
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  subs.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function useFocus() {
  const { user, can } = useSession();
  const userId = user?.id ?? 'guest';
  const student = can('academics');
  const state = useSyncExternalStore(subscribe, () => read(userId));
  return useMemo(() => {
    /** The choice itself, whether or not Focus is on. */
    const kept = (id: string) => LOCKED.has(id) || (state.keep[id] ?? recommended(id, student));
    const choose = (ids: string[], keep: (id: string) => boolean) =>
      update(userId, (s) => ({ ...s, keep: { ...s.keep, ...Object.fromEntries(ids.filter((id) => !LOCKED.has(id)).map((id) => [id, keep(id)])) } }));
    return {
      on: state.on,
      setOn: (on: boolean) => update(userId, (s) => ({ ...s, on })),
      kept,
      /** Whether something is on screen right now. */
      shows: (id: string) => !state.on || kept(id),
      set: (ids: string[], keep: boolean) => choose(ids, () => keep),
      /** Keep exactly this preset, out of everything this account can hide. */
      applyPreset: (preset: PresetId, all: string[]) => {
        const wanted = new Set<string>(PRESETS[preset]);
        choose(all, (id) => wanted.has(id));
      },
      matches: (preset: PresetId, all: string[]) => {
        const wanted = new Set<string>(PRESETS[preset]);
        return all.every((id) => kept(id) === (LOCKED.has(id) || wanted.has(id)));
      },
      /** Back to the recommendation. */
      reset: () => update(userId, (s) => ({ on: s.on, keep: {} })),
      changed: Object.keys(state.keep).length > 0,
    };
  }, [state, userId, student]);
}

export type Focus = ReturnType<typeof useFocus>;
