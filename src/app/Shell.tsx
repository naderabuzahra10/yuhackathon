import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CaretUpDown, Check, Checks, Coins, Crosshair, Desktop, Flask, GearSix, IdentificationCard, List, Moon, QrCode, SignOut, Sparkle, Sun, Translate, UserSwitch, X,
} from '@phosphor-icons/react';
import { AgentPanel, AgentProvider, Orb, useAgent } from '@/agent/Agent';
import { api, refreshAll, useApi } from '@/lib/api';
import { closeStudentCard, openStudentCard, useStudentCardOpen } from '@/lib/card';
import { cx, fmtDay, fmtNumber, fmtRelative, fmtTime } from '@/lib/format';
import { pageId, useFocus } from '@/lib/focus';
import { type Theme, useTheme } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { nextReward, useRewards } from '@/lib/rewards';
import { openScanner } from '@/lib/scan';
import { type Persona, type Role, useSession } from '@/lib/session';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Avatar, Chip, PageSkeleton, Segmented } from '@/ui/kit';
import { Dialog, Menu, MenuItem, Toaster, toast } from '@/ui/overlay';
import { CountUp } from '@/ui/pass';
import { useFocusCatalog } from './focusCatalog';
import { GlobalScanner } from './GlobalScanner';
import { dockItems, isActive, type NavLine, navLines, ROLE_LABELS } from './nav';

function Wordmark({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Link to="/today" aria-label={compact ? t('app.name') : undefined} className="flex items-center gap-2.5 rounded-xl">
      <svg viewBox="0 0 36 36" className="size-9 flex-none" aria-hidden>
        <rect width="36" height="36" rx="11" fill="var(--plate)" />
        <path d="M11 11v8a7 7 0 0 0 14 0v-8" fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="25" cy="11" r="3.2" fill="var(--accent)" />
        <circle cx="11" cy="11" r="2.4" fill="var(--plate)" stroke="var(--accent)" strokeWidth="1.8" />
      </svg>
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block text-[1.0625rem] font-bold tracking-tight" style={{ fontStretch: '106%' }}>{t('app.name')}</span>
          <span className="block truncate text-xs text-ink-2">{t('app.university')}</span>
        </span>
      )}
    </Link>
  );
}

/* The side navigation: each group carries its module colour on its icons, and the open page is a filled pill. */
function SideNav({ lines, hidden = 0, onNavigate }: { lines: NavLine[]; hidden?: number; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <nav aria-label={t('shell.primaryNav')} className="space-y-4">
      {lines.map((line) => (
        <div key={line.key ?? 'hub'} data-tone={line.tone}>
          {line.key ? <p className="t-label mb-1 px-3">{t(line.key)}</p> : null}
          <ul className="space-y-0.5">
            {line.items.map((item) => {
              const active = isActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex h-[2.375rem] items-center gap-3 rounded-xl px-3 transition-[background-color,color,transform] duration-150 active:scale-[0.98]',
                      active ? 'bg-brand font-semibold text-on-brand' : 'font-medium text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <Icon size={20} weight={active ? 'fill' : 'regular'} className={cx('flex-none', !active && line.tone !== 'neutral' && 'text-tone')} />
                    <span className="truncate">{t(item.key)}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {/* Focus has taken pages out of this list: say so, and lead to where that is chosen. */}
      {hidden ? (
        <Link to="/settings#focus-pages" onClick={onNavigate} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.8125rem] font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink">
          <Crosshair size={17} weight="fill" className="flex-none text-brand-ink" />
          <span className="min-w-0 flex-1 truncate">{t('focus.navHidden', { n: hidden })}</span>
          <span className="font-semibold text-ink">{t('focus.edit')}</span>
        </Link>
      ) : null}
    </nav>
  );
}

/* The Focus switch: on, the app shows only what the person kept in Settings. */
function FocusToggle() {
  const { t } = useI18n();
  const focus = useFocus();
  const { ids } = useFocusCatalog();
  const flip = () => {
    const on = !focus.on;
    focus.setOn(on);
    const hidden = ids.filter((id) => !focus.kept(id)).length;
    toast.info(on ? (hidden ? t('focus.toastOn', { n: hidden }) : t('focus.toastOnNone')) : t('focus.toastOff'));
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={focus.on}
      aria-label={t('focus.title')}
      title={t(focus.on ? 'focus.tipOn' : 'focus.tipOff')}
      onClick={flip}
      className={cx('btn flex-none max-sm:w-10 max-sm:px-0', focus.on ? 'btn-primary' : 'btn-secondary')}
    >
      <Crosshair size={19} weight={focus.on ? 'fill' : 'regular'} />
      <span className="max-lg:hidden">{t('focus.name')}</span>
      <span aria-hidden className={cx('relative h-4 w-7 flex-none rounded-full transition-colors duration-150 max-sm:hidden', focus.on ? 'bg-on-brand/30' : 'bg-rule-strong')}>
        <span className={cx('absolute top-0.5 size-3 rounded-full transition-transform duration-200 ease-out ltr:left-0.5 rtl:right-0.5', focus.on ? 'bg-on-brand ltr:translate-x-3 rtl:-translate-x-3' : 'bg-surface')} />
      </span>
    </button>
  );
}

/** The balance, always in reach from the side navigation. */
function PointsCard({ onNavigate }: { onNavigate?: () => void }) {
  const { t, locale } = useI18n();
  const r = useRewards();
  const focus = useFocus();
  if (!r.enabled || !focus.shows('bar:points')) return null;
  const next = nextReward(r.balance);
  const pct = next ? Math.min(100, (r.balance / next.item.points) * 100) : 100;
  return (
    <Link to="/campus/rewards" onClick={onNavigate} className="plate pass-orange lift block overflow-hidden rounded-2xl! px-3.5 py-3">
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
          <Coins size={16} weight="fill" />
          {t('rw.name')}
        </span>
        <span className="fig text-[1.3125rem]">{r.ready ? <CountUp value={r.balance} format={(n) => fmtNumber(n, locale)} /> : '…'}</span>
      </span>
      <span className="mt-2.5 block h-1.5 rounded-full bg-[color-mix(in_oklab,var(--plate-ink)_18%,transparent)]">
        <span className="block h-full rounded-full bg-(--plate-ink) transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </span>
    </Link>
  );
}

function roleLabel(role: Role, locale: 'en' | 'ar') {
  return ROLE_LABELS[role]?.[locale] ?? role;
}

function PersonaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { personas, user, switchPersona } = useSession();
  const { t, l, locale } = useI18n();
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);

  const groups: Array<{ label: string; filter: (p: Persona) => boolean }> = [
    { label: `${t('nav.journey')} · ${t('x.studentsApplicants')}`, filter: (p) => p.roles.includes('student') || p.roles.includes('applicant') },
    { label: t('nav.staff'), filter: (p) => !p.roles.includes('student') && !p.roles.includes('applicant') && !p.roles.includes('operator') },
    { label: t('nav.demo'), filter: (p) => p.roles.includes('operator') },
  ];

  async function choose(p: Persona) {
    setPending(p.id);
    try {
      await switchPersona(p.id);
      onClose();
      navigate(p.roles.length === 1 && p.roles[0] === 'applicant' ? '/journey' : '/today');
    } catch (e) {
      toast.error(e);
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('shell.switchPersona')} subtitle={t('shell.personaHint')} wide>
      <div className="space-y-5">
        {groups.map((g) => {
          const list = personas.filter(g.filter);
          if (!list.length) return null;
          return (
            <div key={g.label}>
              <p className="t-label mb-2">{g.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((p) => {
                  const current = user?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!!pending}
                      aria-pressed={current}
                      onClick={() => void choose(p)}
                      className={cx(
                        'flex items-start gap-3 rounded-xl border p-3 text-start transition-[border-color,background-color,transform] duration-150 active:scale-[0.99]',
                        current ? 'border-brand-ink bg-brand-tint' : 'border-rule hover:border-rule-strong hover:bg-surface-2',
                        pending === p.id && 'opacity-60',
                      )}
                    >
                      <Avatar name={p.name_en} color={p.avatar_color} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span className="truncate">{l(p.name_en, p.name_ar)}</span>
                          {current ? <Check size={14} weight="bold" className="flex-none text-green-ink" /> : null}
                        </span>
                        <span className="t-meta block truncate">
                          {p.department ?? (p.program_id ? `${p.program_id.toUpperCase()} · ${p.stage}` : p.stage)} · {p.campus_id === 'khobar' ? t('shell.khobar') : t('shell.riyadh')}
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {p.roles.map((r) => (
                            <Chip key={r} variant="outline">
                              {roleLabel(r, locale)}
                            </Chip>
                          ))}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

function AccountMenu({ placement }: { placement: 'rail' | 'topbar' }) {
  const { user, demoMode, can } = useSession();
  const { t, l, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const [personaOpen, setPersonaOpen] = useState(false);
  const navigate = useNavigate();
  if (!user) return null;
  const name = l(user.name_en, user.name_ar);

  return (
    <>
      <Menu
        label={t('shell.account')}
        side={placement === 'rail' ? 'top' : 'bottom'}
        align={placement === 'rail' ? 'start' : 'end'}
        width={296}
        trigger={(props) =>
          placement === 'rail' ? (
            <button
              type="button"
              {...props}
              className="flex w-full items-center gap-2.5 rounded-xl p-2 text-start transition-colors duration-150 hover:bg-surface-2 aria-expanded:bg-surface-2"
            >
              <Avatar name={user.name_en} color={user.avatar_color} size={34} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-semibold">{name}</span>
                <span className="block truncate text-xs text-ink-2">{user.roles.map((r) => roleLabel(r, locale)).join(' · ')}</span>
              </span>
              <CaretUpDown size={14} className="flex-none text-ink-2" />
            </button>
          ) : (
            <button type="button" {...props} aria-label={t('shell.account')} className="rounded-full transition-transform duration-150 active:scale-95">
              <Avatar name={user.name_en} color={user.avatar_color} size={34} />
            </button>
          )
        }
      >
        {(close) => (
          <div className="p-1.5">
            <div className="px-2.5 pt-2 pb-3">
              <p className="t-meta">{t('shell.signedInAs')}</p>
              <p className="t-lead truncate">{name}</p>
              <p className="t-meta truncate" dir="ltr">
                {user.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <Chip key={r} variant="outline">
                    {roleLabel(r, locale)}
                  </Chip>
                ))}
                <Chip variant="outline">{user.campus_id === 'khobar' ? t('shell.khobar') : t('shell.riyadh')}</Chip>
              </div>
            </div>
            <div className="border-t border-rule pt-1.5">
              {can('studentCard') ? (
                <MenuItem
                  icon={<IdentificationCard size={18} />}
                  onClick={() => {
                    close();
                    openStudentCard();
                  }}
                >
                  {t('card.title')}
                </MenuItem>
              ) : null}
              <MenuItem
                icon={<GearSix size={18} />}
                onClick={() => {
                  close();
                  navigate('/settings');
                }}
              >
                {t('nav.settings')}
              </MenuItem>
              {demoMode ? (
                <MenuItem
                  icon={<UserSwitch size={18} />}
                  onClick={() => {
                    close();
                    setPersonaOpen(true);
                  }}
                >
                  {t('shell.switchPersonaDemo')}
                </MenuItem>
              ) : null}
            </div>
            <div className="mt-1.5 space-y-3 border-t border-rule px-2.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{t('shell.theme')}</span>
                <Segmented<Theme>
                  label={t('shell.theme')}
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'system', label: <Desktop size={15} aria-label={t('shell.theme.system')} /> },
                    { value: 'light', label: <Sun size={15} aria-label={t('shell.theme.light')} /> },
                    { value: 'dark', label: <Moon size={15} aria-label={t('shell.theme.dark')} /> },
                  ]}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{t('shell.languageLabel')}</span>
                <Segmented
                  label={t('shell.languageLabel')}
                  value={locale}
                  onChange={setLocale}
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'ar', label: 'العربية' },
                  ]}
                />
              </div>
            </div>
            <div className="border-t border-rule pt-1.5">
              <MenuItem icon={<SignOut size={18} />} disabled hint={t('shell.signOutDemo')}>
                {t('shell.signOut')}
              </MenuItem>
            </div>
          </div>
        )}
      </Menu>
      <PersonaDialog open={personaOpen} onClose={() => setPersonaOpen(false)} />
    </>
  );
}

interface Notification {
  id: string;
  module: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function NotificationsMenu({ now }: { now: Date }) {
  const { unread, refresh } = useSession();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const q = useApi<{ items: Notification[]; unread: number }>('/notifications');

  async function open(n: Notification, close: () => void) {
    close();
    if (!n.read_at) {
      try {
        await api(`/notifications/${n.id}/read`, { method: 'POST' });
        void q.reload();
        void refresh();
      } catch {
        /* reading still works if the receipt fails */
      }
    }
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    try {
      await api('/notifications/all/read', { method: 'POST' });
      refreshAll();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Menu
      label={t('nav.notifications')}
      width={380}
      trigger={(props) => (
        <button type="button" {...props} className="btn btn-ghost btn-icon relative" aria-label={`${t('nav.notifications')} (${unread})`}>
          <Bell size={19} />
          {unread > 0 ? (
            <span className="num absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[0.625rem] leading-none font-bold text-white">{unread}</span>
          ) : null}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between gap-3 border-b border-rule py-2.5 ps-4 pe-2.5">
            <p className="t-title">{t('nav.notifications')}</p>
            {unread > 0 ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void markAll()}>
                <Checks size={15} />
                {t('shell.markAllRead')}
              </button>
            ) : null}
          </div>
          {q.data?.items.length ? (
            <ul className="rows">
              {q.data.items.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <button type="button" className="row items-start! py-3!" onClick={() => void open(n, close)}>
                    <span data-tone={n.read_at ? 'neutral' : 'red'} className={cx('dot mt-1.5', n.read_at && 'opacity-0')} aria-label={n.read_at ? undefined : t('shell.unread')} />
                    <span className="min-w-0 flex-1">
                      <span className={cx('block', !n.read_at && 'font-semibold')} dir="auto">
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="t-meta line-clamp-2" dir="auto">
                          {n.body}
                        </span>
                      ) : null}
                      <span className="t-meta mt-0.5 block text-ink-3!">{fmtRelative(n.created_at, now, locale)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-ink-2">{t('shell.noNotifications')}</p>
          )}
          <div className="border-t border-rule p-1.5">
            <Link to="/notifications" onClick={close} className="btn btn-ghost btn-sm w-full">
              {t('common.view')} · {t('nav.notifications')}
            </Link>
          </div>
        </div>
      )}
    </Menu>
  );
}

const StudentCard = lazy(() => import('./StudentCard'));

/* The student ID opens over the page. Its code is only fetched the first time it is asked for. */
function StudentCardHost() {
  const open = useStudentCardOpen();
  const wanted = useRef(false);
  if (open) wanted.current = true;
  return wanted.current ? (
    <Suspense fallback={null}>
      <StudentCard open={open} onClose={closeStudentCard} />
    </Suspense>
  ) : null;
}

function Dock() {
  const { can } = useSession();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { show, busy } = useAgent();
  const focus = useFocus();
  const items = dockItems(can, (item) => focus.shows(pageId(item.to)));
  const assistant = can('assistant');
  const half = Math.ceil(items.length / 2);
  const slots: Array<(typeof items)[number] | 'ask'> = assistant ? [...items.slice(0, half), 'ask', ...items.slice(half)] : items;
  return (
    <nav aria-label={t('shell.primaryNav')} className="no-print fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.625rem)] z-[500] mx-auto max-w-md rounded-[26px] border border-rule bg-surface/92 shadow-lift backdrop-blur-xl lg:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
        {slots.map((item) => {
          if (item === 'ask') {
            return (
              <li key="ask" className="grid place-items-center">
                <button type="button" onClick={() => show()} aria-label={t('ai.open')} className="-mt-5 rounded-full ring-4 ring-bg transition-transform duration-150 active:scale-95">
                  <Orb size={52} busy={busy} />
                </button>
              </li>
            );
          }
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink to={item.to} aria-current={active ? 'page' : undefined} className={cx('flex h-(--dock-h) flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold transition-colors', active ? 'text-brand-ink' : 'text-ink-2')}>
                <span className={cx('grid h-7 w-12 place-items-center rounded-full transition-colors duration-200', active && 'bg-brand-tint')}>
                  <Icon size={21} weight={active ? 'fill' : 'regular'} />
                </span>
                <span className="max-w-full truncate px-1">{t(item.short ?? item.key)}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ShellBody() {
  const { t, locale, setLocale } = useI18n();
  const { user, demoMode, can } = useSession();
  const { pathname } = useLocation();
  const agent = useAgent();
  const rewards = useRewards();
  const [drawer, setDrawer] = useState(false);
  const status = useApi<{ clock: string }>(demoMode ? '/demo/status' : null);
  const now = status.data ? new Date(status.data.clock) : new Date();
  const focus = useFocus();
  const allLines = navLines(can, demoMode);
  const lines = allLines.map((line) => ({ ...line, items: line.items.filter((item) => focus.shows(pageId(item.to))) })).filter((line) => line.items.length);
  const count = (list: NavLine[]) => list.reduce((n, line) => n + line.items.length, 0);
  const navHidden = count(allLines) - count(lines);
  const assistant = can('assistant');
  // Students scan event posters; the cashier desk scans vouchers.
  const scanner = can('campusLife') || can('cashier');

  useEffect(() => {
    setDrawer(false);
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  // New points are announced once, wherever the student happens to be.
  const { ready, earned, acknowledge } = rewards;
  useEffect(() => {
    if (!ready) return;
    const gained = acknowledge();
    if (gained > 0) toast.ok(t('rw.gained', { n: gained }));
  }, [ready, earned, acknowledge, t]);

  return (
    <div className="min-h-dvh lg:ps-(--rail-w)">
      <a href="#main" className="btn btn-primary fixed start-3 top-3 z-[1200] -translate-y-20 focus:translate-y-0">
        {t('shell.skipToContent')}
      </a>

      {/* Desktop side navigation */}
      <aside className="no-print fixed inset-y-0 start-0 z-[40] hidden w-(--rail-w) flex-col border-e border-rule bg-surface lg:flex">
        <div className="px-4 pt-5 pb-5">
          <Wordmark />
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <SideNav lines={lines} hidden={navHidden} />
        </div>
        <div className="space-y-2 p-3">
          <PointsCard />
          <AccountMenu placement="rail" />
        </div>
      </aside>

      {/* Mobile drawer */}
      <div className={cx('no-print fixed inset-0 z-[900] lg:hidden', drawer ? '' : 'pointer-events-none')} aria-hidden={!drawer}>
        <div className={cx('absolute inset-0 bg-(--scrim) transition-opacity duration-300', drawer ? 'opacity-100' : 'opacity-0')} onClick={() => setDrawer(false)} />
        <aside
          className={cx(
            'absolute inset-y-0 start-0 flex w-[min(19.5rem,86vw)] flex-col bg-surface transition-transform duration-300 ease-drawer',
            drawer ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
          )}
          {...({ inert: drawer ? undefined : '' } as object)}
        >
          <div className="flex items-center justify-between px-4 pt-[calc(var(--safe-top)+1rem)] pb-4">
            <Wordmark />
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setDrawer(false)} aria-label={t('common.close')}>
              <X size={18} weight="bold" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <SideNav lines={lines} hidden={navHidden} onNavigate={() => setDrawer(false)} />
          </div>
          <div className="p-3 pb-[calc(var(--safe-bottom)+0.75rem)]">
            <PointsCard onNavigate={() => setDrawer(false)} />
          </div>
        </aside>
      </div>

      {/* Top bar */}
      <header className="no-print sticky top-0 z-[30] flex h-[calc(var(--topbar-h)+var(--safe-top))] items-center gap-1 bg-bg/85 px-3 pt-(--safe-top) backdrop-blur-md sm:gap-1.5 sm:px-5 lg:px-8">
        <button type="button" className="btn btn-ghost btn-icon lg:hidden" onClick={() => setDrawer(true)} aria-label={t('shell.menu')}>
          <List size={21} />
        </button>
        <div className="lg:hidden">
          <Wordmark compact />
        </div>
        <div className="flex-1" />
        {demoMode && status.data && focus.shows('bar:demo') ? (
          <Link
            to="/demo"
            title={t('shell.demoPillHint')}
            className="t-code flex h-9 flex-none items-center gap-2 rounded-full bg-yellow-tint px-3 text-[0.8125rem] text-yellow-ink transition-transform duration-150 active:scale-[0.97] max-[419px]:hidden"
          >
            <Flask size={15} weight="fill" />
            <span className="max-xl:hidden">{t('shell.demoMode')} ·</span>
            <span className="max-xl:hidden">{fmtDay(now, locale)} ·</span>
            <span>{fmtTime(now, locale)}</span>
          </Link>
        ) : null}
        {rewards.enabled && focus.shows('bar:points') ? (
          <Link to="/campus/rewards" aria-label={`${t('rw.name')}: ${rewards.balance}`} className="flex h-9 flex-none items-center gap-1.5 rounded-full bg-orange-tint ps-2.5 pe-3 text-[0.8125rem] font-bold text-orange-ink transition-transform duration-150 active:scale-[0.97] max-[339px]:hidden lg:hidden">
            <Coins size={16} weight="fill" className="max-[399px]:hidden" />
            <span className="num">{rewards.ready ? fmtNumber(rewards.balance, locale) : '…'}</span>
          </Link>
        ) : null}
        <FocusToggle />
        {scanner && focus.shows('bar:scan') ? (
          <button type="button" onClick={openScanner} aria-label={t('scan.title')} className="btn btn-secondary flex-none max-sm:w-10 max-sm:px-0">
            <QrCode size={19} />
            <span className="max-sm:hidden">{t('scan.open')}</span>
          </button>
        ) : null}
        {assistant ? (
          <button type="button" onClick={() => (agent.open ? agent.close() : agent.show())} aria-expanded={agent.open} className="btn btn-accent max-lg:hidden">
            <Sparkle size={16} weight="fill" />
            {t('ai.ask')}
            <kbd className="t-code rounded-md bg-[color-mix(in_oklab,var(--accent-ink)_14%,transparent)] px-1.5 py-0.5 text-[0.6875rem]" dir="ltr">Ctrl K</kbd>
          </button>
        ) : null}
        {focus.shows('bar:language') ? (
          <button type="button" className="btn btn-ghost max-md:hidden" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} aria-label={locale === 'ar' ? t('x.switchToEnglish') : t('shell.languageSwitch')}>
            <Translate size={19} />
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
        ) : null}
        {user ? <NotificationsMenu now={now} /> : null}
        <div className="lg:hidden">
          <AccountMenu placement="topbar" />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1240px] px-4 pt-3 pb-[calc(var(--dock-h)+var(--safe-bottom)+3rem)] sm:px-6 lg:px-8 lg:pt-2 lg:pb-16">
        <Suspense fallback={<PageSkeleton />}>
          <div key={pathname.split('/').slice(0, 3).join('/')} className="page-in">
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </Suspense>
      </main>

      <Dock />
      {assistant ? <AgentPanel /> : null}
      {scanner ? <GlobalScanner /> : null}
      {can('studentCard') ? <StudentCardHost /> : null}
      <Toaster />
    </div>
  );
}

export function Shell() {
  return (
    <AgentProvider>
      <ShellBody />
    </AgentProvider>
  );
}
