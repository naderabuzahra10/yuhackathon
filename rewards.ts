import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { deriveEntries, EARN, type EarnKind, type Entry, findMenuItem, type ItemIcon, type MenuItem, OUTLETS, type Outlet, RECORD_PATHS, voucherCode } from '../../shared/rewards.mjs';
import { api, bus } from './api';
import { useSession } from './session';

/* UniPoints: the campus loyalty programme.
   Points are worked out from the student's own records (verified attendance, clubs, classes,
   tasks, feedback, competitions, shared notes), so anything done elsewhere in the app shows up
   here without a second entry.

   With the app's own server running (npm run dev, npm start), the balance and the vouchers live
   on the server: a second device can act as the till, and "used" appears on the student's phone
   as it is scanned. On plain static hosting there is no server to ask, so the same rules run in
   the browser and vouchers stay on the device. The page says which of the two is in use. */

export { EARN, findMenuItem, OUTLETS };
export type { EarnKind, Entry, ItemIcon, MenuItem, Outlet };

export interface Voucher {
  id: string;
  code: string;
  outletId: string;
  itemId: string;
  points: number;
  createdAt: string;
  status: 'active' | 'used';
  usedAt?: string;
}

interface State {
  userId: string | null;
  /** Where the ledger lives: this app's server, or this device when there is no server. */
  mode: 'server' | 'device' | null;
  ready: boolean;
  earnedEntries: Entry[];
  vouchers: Voucher[];
}

const EMPTY: State = { userId: null, mode: null, ready: false, earnedEntries: [], vouchers: [] };
let state: State = EMPTY;
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/* ── Device ledger, used only when there is no server ── */

interface DeviceLedger {
  vouchers: Voucher[];
  bonuses: Entry[];
}

const deviceKey = (userId: string) => `uj.rewards.v1.${userId}`;

function readDevice(userId: string): DeviceLedger {
  try {
    const raw = localStorage.getItem(deviceKey(userId));
    if (raw) return { vouchers: [], bonuses: [], ...(JSON.parse(raw) as Partial<DeviceLedger>) };
  } catch {
    /* private mode or a damaged entry: start empty */
  }
  return { vouchers: [], bonuses: [] };
}

function writeDevice(userId: string, ledger: DeviceLedger) {
  try {
    localStorage.setItem(deviceKey(userId), JSON.stringify(ledger));
  } catch {
    /* kept in memory for this visit */
  }
}

/* ── Loading ── */

async function service<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string; missing: boolean }> {
  try {
    const res = await fetch(`/rewards${path}`, { credentials: 'include', ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } });
    const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
    // A static host answers every unknown path with the app's HTML: that means "no server here".
    if (!isJson) return { ok: false, status: res.status, message: 'No rewards service', missing: true };
    const json = await res.json();
    if (!res.ok) return { ok: false, status: res.status, message: json?.error?.message ?? 'Request failed', missing: false };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, message: 'Network error', missing: true };
  }
}

let loading: Promise<void> | null = null;

async function load(userId: string, fresh: boolean) {
  const res = await service<{ earnedEntries: Entry[]; vouchers: Voucher[] }>(`/me${fresh ? '?fresh=1' : ''}`);
  if (state.userId !== userId) return;
  if (res.ok) return set({ userId, mode: 'server', ready: true, earnedEntries: res.data.earnedEntries, vouchers: res.data.vouchers });
  // The service exists but is unhappy (API down, not a student): keep what is shown rather than switching ledgers.
  if (!res.missing) return set({ ...state, ready: true, mode: state.mode ?? 'server' });

  const names = Object.keys(RECORD_PATHS) as Array<keyof typeof RECORD_PATHS>;
  const values = await Promise.all(names.map((name) => api(RECORD_PATHS[name]).catch(() => null)));
  if (state.userId !== userId) return;
  const ledger = readDevice(userId);
  set({ userId, mode: 'device', ready: true, earnedEntries: [...deriveEntries(Object.fromEntries(names.map((name, i) => [name, values[i]]))), ...ledger.bonuses], vouchers: ledger.vouchers });
}

function ensure(userId: string, fresh = false) {
  if (state.userId !== userId) set({ ...EMPTY, userId });
  loading ??= load(userId, fresh).finally(() => {
    loading = null;
  });
  return loading;
}

// Anything changed anywhere in the app may have earned points: ask again.
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
bus.on('refresh', () => {
  if (!state.userId) return;
  clearTimeout(refreshTimer);
  const userId = state.userId;
  refreshTimer = setTimeout(() => void ensure(userId, true), 250);
});

/** Ask for the balance again, for example after a check-in on another device. */
export function refreshRewards() {
  return state.userId ? ensure(state.userId, true) : Promise.resolve();
}

/* ── Watching vouchers while one is on screen, so the till's scan shows up at once ── */

let watchers = 0;
let watchTimer: ReturnType<typeof setInterval> | undefined;

async function pollVouchers() {
  if (state.mode !== 'server' || document.hidden) return;
  const res = await service<{ vouchers: Voucher[] }>('/vouchers');
  if (!res.ok) return;
  const changed = res.data.vouchers.length !== state.vouchers.length || res.data.vouchers.some((v, i) => v.status !== state.vouchers[i]?.status || v.id !== state.vouchers[i]?.id);
  if (changed) set({ ...state, vouchers: res.data.vouchers });
}

export function useVoucherWatch(active: boolean) {
  useEffect(() => {
    if (!active) return;
    watchers += 1;
    watchTimer ??= setInterval(() => void pollVouchers(), 2500);
    return () => {
      watchers -= 1;
      if (watchers === 0) {
        clearInterval(watchTimer);
        watchTimer = undefined;
      }
    };
  }, [active]);
}

export function outletOf(id: string) {
  return OUTLETS.find((o) => o.id === id);
}

export function itemOf(outletId: string, itemId: string) {
  return outletOf(outletId)?.items.find((i) => i.id === itemId);
}

/** What a voucher's QR says: a link that opens the till with the code filled in. */
export function voucherLink(code: string) {
  return `${window.location.origin}/cashier?code=${encodeURIComponent(code)}`;
}

export function useRewards() {
  const { user, can } = useSession();
  const enabled = !!user && user.roles.includes('student') && can('campusLife');
  const userId = enabled ? user!.id : null;
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const mine = snapshot.userId === userId ? snapshot : EMPTY;

  useEffect(() => {
    if (userId) void ensure(userId);
  }, [userId]);

  const earned = mine.earnedEntries.reduce((sum, e) => sum + e.points, 0);
  const spent = mine.vouchers.reduce((sum, v) => sum + v.points, 0);
  const balance = earned - spent;

  const entries = useMemo<Entry[]>(() => {
    const redeemed: Entry[] = mine.vouchers.map((v) => {
      const o = outletOf(v.outletId);
      const it = itemOf(v.outletId, v.itemId);
      return { id: `red:${v.id}`, kind: 'redeem', title_en: `${it?.name_en ?? ''} · ${o?.name_en ?? ''}`, title_ar: `${it?.name_ar ?? ''} · ${o?.name_ar ?? ''}`, points: -v.points, at: v.createdAt };
    });
    return [...redeemed, ...mine.earnedEntries].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  }, [mine.earnedEntries, mine.vouchers]);

  /** Spend points on an item. Resolves to the voucher, or throws with the reason. */
  const redeem = useCallback(
    async (outlet: Outlet, menuItem: MenuItem, now: Date): Promise<Voucher> => {
      if (!userId) throw new Error('Not signed in as a student');
      if (state.mode === 'server') {
        const res = await service<{ voucher: Voucher }>('/redeem', { method: 'POST', body: JSON.stringify({ itemId: menuItem.id }) });
        if (!res.ok) throw new Error(res.message);
        set({ ...state, vouchers: [res.data.voucher, ...state.vouchers] });
        return res.data.voucher;
      }
      if (menuItem.points > balance) throw new Error('Not enough points');
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      const voucher: Voucher = { id: crypto.randomUUID(), code: voucherCode(outlet.prefix, bytes), outletId: outlet.id, itemId: menuItem.id, points: menuItem.points, createdAt: now.toISOString(), status: 'active' };
      const ledger = readDevice(userId);
      writeDevice(userId, { ...ledger, vouchers: [voucher, ...ledger.vouchers] });
      set({ ...state, vouchers: [voucher, ...state.vouchers] });
      return voucher;
    },
    [userId, balance],
  );

  /** Only when vouchers live on this device: there is no till to scan them, so the student marks them. */
  const markUsed = useCallback(
    (id: string, now: Date) => {
      if (!userId || state.mode !== 'device') return;
      const ledger = readDevice(userId);
      const vouchers = ledger.vouchers.map((v) => (v.id === id ? { ...v, status: 'used' as const, usedAt: now.toISOString() } : v));
      writeDevice(userId, { ...ledger, vouchers });
      set({ ...state, vouchers });
    },
    [userId],
  );

  /** A small bonus for finishing a practice quiz, once per resource. Resolves to the points awarded. */
  const claimQuiz = useCallback(
    async (resourceId: string, title: string, now: Date): Promise<number> => {
      if (!userId) return 0;
      if (state.mode === 'server') {
        const res = await service<{ awarded: number }>('/bonus', { method: 'POST', body: JSON.stringify({ kind: 'quiz', ref: resourceId }) });
        if (res.ok && res.data.awarded) await ensure(userId, true);
        return res.ok ? res.data.awarded : 0;
      }
      const ledger = readDevice(userId);
      const id = `bonus:quiz:${resourceId}`;
      if (ledger.bonuses.some((b) => b.id === id)) return 0;
      const bonus: Entry = { id, kind: 'quiz', title_en: title, title_ar: title, points: EARN.quiz, at: now.toISOString(), link: '/campus/resources' };
      writeDevice(userId, { ...ledger, bonuses: [...ledger.bonuses, bonus] });
      set({ ...state, earnedEntries: [...state.earnedEntries, bonus] });
      return EARN.quiz;
    },
    [userId],
  );

  /** Remembers the last total shown, so the shell can announce new points once. */
  const acknowledge = useCallback(() => {
    if (!userId || !mine.ready) return 0;
    const key = `uj.rewards.seen.${userId}`;
    let seen: number | null = null;
    try {
      const raw = localStorage.getItem(key);
      seen = raw == null ? null : Number(raw);
      if (seen !== earned) localStorage.setItem(key, String(earned));
    } catch {
      return 0;
    }
    return seen == null ? 0 : earned - seen;
  }, [userId, mine.ready, earned]);

  return { enabled, ready: enabled && mine.ready, loading: enabled && !mine.ready, mode: mine.mode, earned, spent, balance, entries, earnedEntries: mine.earnedEntries, vouchers: mine.vouchers, redeem, markUsed, claimQuiz, acknowledge };
}

/** The cheapest thing on any menu the student cannot afford yet: the next reward to aim for. */
export function nextReward(balance: number) {
  let best: { outlet: Outlet; item: MenuItem } | null = null;
  for (const outlet of OUTLETS) {
    for (const it of outlet.items) {
      if (it.points > balance && (!best || it.points < best.item.points)) best = { outlet, item: it };
    }
  }
  return best;
}

/** The best thing the student can afford right now. */
export function topAffordable(balance: number) {
  let best: { outlet: Outlet; item: MenuItem } | null = null;
  for (const outlet of OUTLETS) {
    for (const it of outlet.items) {
      if (it.points <= balance && (!best || it.points > best.item.points)) best = { outlet, item: it };
    }
  }
  return best;
}
