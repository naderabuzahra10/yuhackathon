import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ArrowUp, BookOpenText, Briefcase, CalendarCheck, CalendarDots, Check, Coins, ListChecks, MapPin, Notebook,
  PencilSimpleLine, Prohibit, Sparkle, Stop, Sun, TreeStructure, UsersThree, WarningCircle, X, type Icon,
} from '@phosphor-icons/react';
import { useClock } from '@/lib/clock';
import { cx, fmtDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useRewards } from '@/lib/rewards';
import { useSession } from '@/lib/session';
import { Spinner } from '@/ui/kit';
import { type AgentStatus, fetchStatus, type Hooks, runLocal, runModel, trimHistory, type Wire } from './engine';
import type { ConfirmRequest, RewardsHandle, ToolCtx } from './tools';

interface Item {
  id: string;
  kind: 'user' | 'assistant' | 'step' | 'confirm' | 'error' | 'note';
  text?: string;
  tool?: string;
  state?: 'running' | 'done' | 'error' | 'declined';
  link?: string | null;
  request?: ConfirmRequest;
  resolve?: (ok: boolean) => void;
  answered?: boolean | null;
}

interface AgentApi {
  open: boolean;
  busy: boolean;
  status: AgentStatus | null;
  items: Item[];
  show: (instant?: boolean) => void;
  close: () => void;
  ask: (text: string) => void;
  stop: () => void;
  reset: () => void;
  answer: (id: string, ok: boolean) => void;
}

const Ctx = createContext<AgentApi | null>(null);

export function useAgent() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAgent outside provider');
  return ctx;
}

let seq = 0;
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export function AgentProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { now } = useClock();
  const rewards = useRewards();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<AgentStatus | null>(null);

  const wire = useRef<Wire[]>([]);
  const abort = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const live = useRef({ rewards: rewards as RewardsHandle, now, pathname, locale, t });
  live.current = { rewards, now, pathname, locale, t };
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    void fetchStatus().then(setStatus);
  }, []);

  // A different person means a different conversation.
  useEffect(() => {
    wire.current = [];
    setItems([]);
  }, [user?.id]);

  const push = useCallback((item: Omit<Item, 'id'> & { id?: string }) => {
    setItems((list) => [...list, { ...item, id: item.id ?? uid() }]);
  }, []);
  const patch = useCallback((id: string, changes: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const show = useCallback((instant?: boolean) => {
    document.documentElement.toggleAttribute('data-agent-instant', !!instant);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const stop = useCallback(() => {
    abort.current?.abort();
    for (const it of itemsRef.current) {
      if (it.kind === 'confirm' && it.answered == null) it.resolve?.(false);
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    wire.current = [];
    setItems([]);
  }, [stop]);

  const answer = useCallback(
    (id: string, ok: boolean) => {
      const it = itemsRef.current.find((x) => x.id === id);
      if (!it || it.answered != null) return;
      patch(id, { answered: ok });
      it.resolve?.(ok);
    },
    [patch],
  );

  const ask = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busyRef.current) return;
      setOpen(true);
      push({ kind: 'user', text });
      busyRef.current = true;
      setBusy(true);
      const controller = new AbortController();
      abort.current = controller;

      const ctx: ToolCtx = {
        locale: live.current.locale,
        t: live.current.t,
        now: () => live.current.now,
        path: () => live.current.pathname,
        rewards: () => live.current.rewards,
        navigate: ((to: string) => {
          navigate(to);
          if (window.innerWidth < 1024) setOpen(false);
        }) as ToolCtx['navigate'],
      };
      const hooks: Hooks = {
        signal: controller.signal,
        onStep: (s) => push({ id: s.id, kind: 'step', tool: s.tool, state: 'running' }),
        onStepDone: (id, outcome) => patch(id, { state: outcome.state, link: outcome.link, text: outcome.error }),
        onInterim: (interim) => push({ kind: 'assistant', text: interim }),
        confirm: (request) =>
          new Promise<boolean>((resolve) => {
            if (controller.signal.aborted) return resolve(false);
            push({ kind: 'confirm', request, resolve, answered: null });
          }),
      };

      void (async () => {
        try {
          const st = status ?? (await fetchStatus());
          if (!status) setStatus(st);
          if (st.provider === 'anthropic') {
            const context = {
              name: user?.name_en,
              program: user?.program_id?.toUpperCase(),
              level: user?.level,
              now: fmtDateTime(live.current.now, 'en'),
              path: live.current.pathname,
              locale: live.current.locale,
            };
            try {
              const out = await runModel(trimHistory([...wire.current, { role: 'user', content: text }]), context, ctx, hooks);
              wire.current = out.history;
              push({ kind: 'assistant', text: out.text || live.current.t('ai.done') });
            } catch (e) {
              if (controller.signal.aborted) throw e;
              // The model is unreachable or refused: say so, then still do the job with the built-in planner.
              push({ kind: 'error', text: live.current.t('ai.modelFailed', { why: e instanceof Error ? e.message : String(e) }) });
              push({ kind: 'assistant', text: await runLocal(text, ctx, hooks) });
            }
          } else {
            push({ kind: 'assistant', text: await runLocal(text, ctx, hooks) });
          }
        } catch (e) {
          if (controller.signal.aborted) push({ kind: 'note', text: live.current.t('ai.stopped') });
          else push({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
        } finally {
          busyRef.current = false;
          setBusy(false);
          setItems((list) => list.map((it) => (it.kind === 'step' && it.state === 'running' ? { ...it, state: 'error' } : it)));
        }
      })();
    },
    [navigate, patch, push, status, user],
  );

  // Ctrl or Cmd + K opens the assistant from anywhere, with no animation: it is a keyboard action.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.documentElement.toggleAttribute('data-agent-instant', true);
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo<AgentApi>(() => ({ open, busy, status, items, show, close, ask, stop, reset, answer }), [open, busy, status, items, show, close, ask, stop, reset, answer]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ── Presentation ── */

const TOOL_ICONS: Record<string, Icon> = {
  get_today: Sun, get_registration: ListChecks, plan_registration: ListChecks, choose_registration_option: ListChecks, approve_registration: ListChecks,
  submit_registration: ListChecks, get_classmates: UsersThree, search_resources: BookOpenText, read_resource: BookOpenText, list_events: CalendarCheck, rsvp_event: CalendarCheck,
  get_attendance: CalendarDots, get_study_tasks: Notebook, add_study_task: Notebook, start_practice: BookOpenText, plan_revision: Notebook, add_revision_plan: Notebook, get_rewards: Coins, redeem_reward: Coins, find_place: MapPin,
  get_prerequisites: TreeStructure, get_opportunities: Briefcase, open_page: MapPin,
};

/** The assistant's mark. */
export function Orb({ size = 32, busy }: { size?: number; busy?: boolean }) {
  return (
    <span className="orb" data-busy={busy ? 'true' : undefined} style={{ width: size, height: size }} aria-hidden>
      <Sparkle size={Math.round(size * 0.5)} weight="fill" />
    </span>
  );
}

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(\/[^)\s]*\))/g).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key} className="font-bold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className="t-code rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.8125rem]" dir="ltr">{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\((\/[^)\s]*)\)$/.exec(part);
    if (link) return <Link key={key} to={link[2]} className="link">{link[1]}</Link>;
    return part;
  });
}

/** Just enough formatting for short answers: paragraphs, lists, bold, code and in-app links. */
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; rows: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l${blocks.length}`} className={cx('space-y-1.5 ps-5', list.ordered ? 'list-decimal' : 'list-disc', 'marker:text-ink-3')}>
        {list.rows.map((row, i) => (
          <li key={i}>{inline(row, `li${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, rows: [] };
      list.rows.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ''), `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className="space-y-2.5 leading-relaxed" dir="auto">{blocks}</div>;
}

function StepRow({ item }: { item: Item }) {
  const { t, rtl } = useI18n();
  const ToolIcon = TOOL_ICONS[item.tool ?? ''] ?? Sparkle;
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const tone = item.state === 'error' ? 'red' : item.state === 'declined' ? 'neutral' : 'brand';
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 py-2 ps-2.5 pe-2" data-tone={tone}>
      <span className="grid size-7 flex-none place-items-center rounded-lg bg-surface text-tone-ink">
        <ToolIcon size={15} weight="bold" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">{t(`ai.step.${item.tool}`)}</span>
      {item.state === 'running' ? (
        <span className="text-ink-2"><Spinner size={14} /></span>
      ) : item.state === 'done' ? (
        item.link ? (
          <Link to={item.link} className="btn btn-ghost btn-sm h-7! px-2! text-brand-ink!">
            {t('common.open')}
            <Arrow size={12} weight="bold" />
          </Link>
        ) : (
          <Check size={15} weight="bold" className="me-1.5 text-green-ink" aria-label={t('status.done')} />
        )
      ) : item.state === 'declined' ? (
        <Prohibit size={15} weight="bold" className="me-1.5 text-ink-3" aria-label={t('ai.declined')} />
      ) : (
        <WarningCircle size={16} weight="fill" className="me-1.5 text-red" aria-label={t('common.error')} />
      )}
    </div>
  );
}

function ConfirmCard({ item }: { item: Item }) {
  const { t } = useI18n();
  const { answer } = useAgent();
  const r = item.request!;
  return (
    <div className="rise rounded-2xl border border-rule-strong bg-surface p-4 shadow-sheet" role="group" aria-label={r.title}>
      <p className="t-lead">{r.title}</p>
      <ul className="mt-2 space-y-1 text-ink-2">
        {r.lines.map((line, i) => (
          <li key={i} dir="auto">{line}</li>
        ))}
      </ul>
      {item.answered == null ? (
        <div className="mt-3.5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => answer(item.id, true)}>
            <Check size={14} weight="bold" />
            {r.action}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => answer(item.id, false)}>
            {t('ai.notNow')}
          </button>
        </div>
      ) : (
        <p className={cx('mt-3 flex items-center gap-1.5 text-[0.8125rem] font-semibold', item.answered ? 'text-green-ink' : 'text-ink-2')}>
          {item.answered ? <Check size={14} weight="bold" /> : <Prohibit size={14} weight="bold" />}
          {t(item.answered ? 'ai.youApproved' : 'ai.declined')}
        </p>
      )}
    </div>
  );
}

export function suggestionsFor(path: string, t: (k: string) => string): string[] {
  if (path.startsWith('/academics/register')) return [t('ai.s.reg1'), t('ai.s.reg2'), t('ai.s.reg3')];
  if (path.startsWith('/portfolio') || path.startsWith('/career')) return [t('ai.s.cv'), t('ai.s.today'), t('ai.s.rew1')];
  if (path.startsWith('/campus/resources')) return [t('ai.s.res1'), t('ai.s.res2'), t('ai.s.tasks')];
  if (path.startsWith('/campus/rewards')) return [t('ai.s.rew1'), t('ai.s.rew2'), t('ai.s.events')];
  if (path.startsWith('/campus')) return [t('ai.s.events'), t('ai.s.rew1'), t('ai.s.route')];
  if (path.startsWith('/academics')) return [t('ai.s.reg1'), t('ai.s.att'), t('ai.s.tasks')];
  return [t('ai.s.today'), t('ai.s.reg1'), t('ai.s.res1'), t('ai.s.rew1')];
}

function providerLabel(status: AgentStatus | null, t: (k: string) => string) {
  if (!status) return '';
  if (status.provider !== 'anthropic') return t('ai.builtin');
  const m = /claude-([a-z]+)-(\d+)-(\d+)/.exec(status.model ?? '');
  return m ? `Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : (status.model ?? 'Claude');
}

export function AgentPanel() {
  const { t, l } = useI18n();
  const { user } = useSession();
  const { pathname } = useLocation();
  const { open, close, items, busy, ask, stop, reset, status } = useAgent();
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const first = (l(user?.name_en, user?.name_ar) || '').split(' ')[0];

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [items, busy]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || busy) return;
    ask(draft);
    setDraft('');
  };

  const waiting = busy && !items.some((it) => (it.kind === 'step' && it.state === 'running') || (it.kind === 'confirm' && it.answered == null));

  return (
    <>
      <div className={cx('no-print fixed inset-0 z-[790] bg-(--scrim) transition-opacity duration-300 lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={close} aria-hidden />
      <aside
        aria-label={t('ai.title')}
        {...({ inert: open ? undefined : '' } as object)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
        className={cx(
          'agent-panel no-print fixed inset-y-0 end-0 z-[800] flex w-full flex-col border-s border-rule bg-surface transition-transform duration-300 ease-drawer sm:w-[26rem]',
          open ? 'translate-x-0 shadow-pop' : 'ltr:translate-x-full rtl:-translate-x-full',
        )}
      >
        <header className="flex items-center gap-3 px-4 pt-[calc(var(--safe-top)+0.875rem)] pb-3">
          <Orb size={36} busy={busy} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="t-title truncate">{t('ai.title')}</p>
            <p className="t-meta truncate">{providerLabel(status, t)}</p>
          </div>
          {items.length ? (
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={reset} aria-label={t('ai.newChat')} title={t('ai.newChat')}>
              <PencilSimpleLine size={17} />
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={close} aria-label={t('common.close')}>
            <X size={17} weight="bold" />
          </button>
        </header>

        <div ref={log} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
          {items.length === 0 ? (
            <div className="pt-6">
              <p className="t-page text-[1.5rem]!">{t('ai.hello', { name: first })}</p>
              <p className="mt-2 text-ink-2">{t('ai.intro')}</p>
              <div className="mt-6 space-y-2">
                {suggestionsFor(pathname, t).map((s, i) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="rise lift flex w-full items-center gap-3 rounded-2xl border border-rule bg-surface p-3.5 text-start" style={{ ['--i' as string]: i }}>
                    <span className="glyph size-8!" data-tone="brand">
                      <Sparkle size={15} weight="fill" />
                    </span>
                    <span className="min-w-0 flex-1 font-semibold">{s}</span>
                  </button>
                ))}
              </div>
              {status?.provider === 'builtin' ? <p className="t-meta mt-5">{t('ai.builtinNote')}</p> : null}
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {items.map((it) =>
                it.kind === 'user' ? (
                  <div key={it.id} className="flex justify-end">
                    <p className="max-w-[88%] rounded-2xl rounded-ee-md bg-brand px-3.5 py-2.5 text-on-brand" dir="auto">{it.text}</p>
                  </div>
                ) : it.kind === 'assistant' ? (
                  <div key={it.id} className="rise pe-2">
                    <Rich text={it.text ?? ''} />
                  </div>
                ) : it.kind === 'step' ? (
                  <StepRow key={it.id} item={it} />
                ) : it.kind === 'confirm' ? (
                  <ConfirmCard key={it.id} item={it} />
                ) : it.kind === 'error' ? (
                  <p key={it.id} role="alert" className="flex gap-2 rounded-xl bg-red-tint px-3 py-2.5 text-[0.8125rem] text-red-ink">
                    <WarningCircle size={16} weight="fill" className="mt-0.5 flex-none" />
                    <span dir="auto">{it.text}</span>
                  </p>
                ) : (
                  <p key={it.id} className="t-meta">{it.text}</p>
                ),
              )}
              {waiting ? (
                <p className="typing text-ink-2" aria-label={t('ai.thinking')}>
                  <span /><span /><span />
                </p>
              ) : null}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="border-t border-rule px-3 pt-3 pb-[calc(var(--safe-bottom)+0.75rem)]">
          <div className="flex items-end gap-2 rounded-[22px] border border-rule-strong bg-surface p-1.5 ps-4 transition-shadow duration-150 focus-within:border-brand-ink focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_40%,transparent)]">
            <textarea
              ref={input}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t('ai.placeholder')}
              aria-label={t('ai.placeholder')}
              dir="auto"
              className="max-h-32 min-h-10 flex-1 resize-none self-center bg-transparent py-2 outline-none placeholder:text-ink-3 [field-sizing:content]"
            />
            {busy ? (
              <button type="button" onClick={stop} className="btn btn-secondary btn-icon" aria-label={t('ai.stop')}>
                <Stop size={15} weight="fill" />
              </button>
            ) : (
              <button type="submit" disabled={!draft.trim()} className="btn btn-accent btn-icon" aria-label={t('ai.send')}>
                <ArrowUp size={17} weight="bold" />
              </button>
            )}
          </div>
          <p className="t-meta mt-2 px-1.5 text-[0.75rem]!">{t('ai.footnote')}</p>
        </form>
      </aside>
    </>
  );
}

/** A prompt field for a page: type the request where you are and the assistant opens with it. */
export function AskBar({ className, suggestions }: { className?: string; suggestions?: string[] }) {
  const { t } = useI18n();
  const { ask, busy } = useAgent();
  const [draft, setDraft] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    ask(draft);
    setDraft('');
  };
  return (
    <div className={className}>
      <form onSubmit={submit} className="flex items-center gap-2.5 rounded-full border border-rule-strong bg-surface p-1.5 ps-2 shadow-sheet transition-shadow duration-150 focus-within:border-brand-ink focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_40%,transparent)]">
        <Orb size={36} busy={busy} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('ai.askPlaceholder')} aria-label={t('ai.askPlaceholder')} dir="auto" className="h-10 min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-ink-3" />
        <kbd className="t-code hidden rounded-md bg-surface-2 px-1.5 py-1 text-[0.6875rem] text-ink-2 lg:block" dir="ltr">Ctrl K</kbd>
        <button type="submit" disabled={!draft.trim() || busy} className="btn btn-primary btn-icon" aria-label={t('ai.send')}>
          <ArrowUp size={17} weight="bold" />
        </button>
      </form>
      {suggestions?.length ? (
        <div className="scroll-x -mx-1 mt-3 flex gap-2 px-1">
          {suggestions.map((s) => (
            <button key={s} type="button" className="pick flex-none" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
