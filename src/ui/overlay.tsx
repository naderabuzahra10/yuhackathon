import { type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import { cx } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/* ── Dialog: the native element, so focus trapping and Escape come free. ── */

export function Dialog({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cx('dialog', wide && 'dialog-wide')}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <>
          <div className="flex items-start gap-3 border-b border-rule px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="t-title">
                {title}
              </h2>
              {subtitle ? <p className="t-meta mt-0.5">{subtitle}</p> : null}
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm -me-1.5 -mt-1" onClick={onClose} aria-label={t('common.close')}>
              <X size={16} weight="bold" />
            </button>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule px-5 py-3.5">{footer}</div> : null}
        </>
      ) : null}
    </dialog>,
    document.body,
  );
}

/* ── Menu: a popover anchored to its trigger and scaling from it. ── */

export function Menu({ trigger, children, align = 'end', side = 'bottom', width = 260, label }: { trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; side?: 'top' | 'bottom'; width?: number; label: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { rtl } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const atEnd = align === 'end';
  const originX = atEnd !== rtl ? 'right' : 'left';
  return (
    <div ref={wrap} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={cx(
            'pop absolute z-[900] max-h-[min(34rem,calc(100dvh-5rem))] overflow-y-auto scroll-thin text-ink',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            atEnd ? 'end-0' : 'start-0',
          )}
          style={{ width: `min(${width}px, calc(100vw - 1.5rem))`, ['--origin' as string]: `${side === 'top' ? 'bottom' : 'top'} ${originX}` }}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, hint, selected, danger, disabled }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; hint?: ReactNode; selected?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      aria-current={selected || undefined}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors duration-100 hover:bg-surface-2 disabled:opacity-50',
        selected && 'bg-surface-2',
        danger && 'text-red-ink',
      )}
    >
      {icon ? <span className="flex-none text-ink-2">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{children}</span>
        {hint ? <span className="t-meta block truncate">{hint}</span> : null}
      </span>
    </button>
  );
}

/* ── Toasts: call toast() from anywhere; one <Toaster /> renders them. ── */

type ToastKind = 'ok' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const notify = () => subs.forEach((fn) => fn());

function push(kind: ToastKind, text: string) {
  const id = nextId++;
  items = [...items.slice(-2), { id, kind, text }];
  notify();
  setTimeout(() => dismiss(id), kind === 'error' ? 6500 : 3800);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  notify();
}

export const toast = {
  ok: (text: string) => push('ok', text),
  info: (text: string) => push('info', text),
  error: (e: unknown) => push('error', typeof e === 'string' ? e : errorMessage(e)),
};

export function Toaster() {
  const list = useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => items,
  );
  const { t } = useI18n();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-h)+var(--safe-bottom)+0.75rem)] z-[1100] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
      {list.map((item) => (
        <div
          key={item.id}
          role={item.kind === 'error' ? 'alert' : 'status'}
          className="toast pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-plate py-2.5 ps-3.5 pe-2 text-plate-ink shadow-pop"
        >
          {item.kind === 'ok' ? (
            <CheckCircle size={18} weight="fill" className="flex-none text-green" />
          ) : item.kind === 'error' ? (
            <WarningCircle size={18} weight="fill" className="flex-none text-red" />
          ) : (
            <Info size={18} weight="fill" className="flex-none text-blue" />
          )}
          <span className="min-w-0 flex-1 font-medium">{item.text}</span>
          <button type="button" onClick={() => dismiss(item.id)} aria-label={t('common.close')} className="grid size-7 flex-none place-items-center rounded-md text-plate-muted hover:bg-plate-2">
            <X size={13} weight="bold" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Runs a mutation with a pending flag and reports failure as a toast. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  async function run<T>(key: string, fn: () => Promise<T>, okText?: string): Promise<T | undefined> {
    setBusy(key);
    try {
      const result = await fn();
      if (okText) toast.ok(okText);
      return result;
    } catch (e) {
      toast.error(e);
      return undefined;
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}
