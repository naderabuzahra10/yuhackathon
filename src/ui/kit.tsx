import { type ComponentPropsWithoutRef, type ReactNode, useId } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { CaretLeft, CaretRight, CircleNotch, WarningCircle } from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import { cx, initials } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export type Tone = 'brand' | 'blue' | 'orange' | 'purple' | 'green' | 'yellow' | 'red' | 'neutral';

/* Every status the API can return maps to one of the three state colours,
   to a line colour when it means "moving", or to neutral. */
const STATUS_TONES: Record<string, Tone> = {
  draft: 'neutral', preview: 'neutral', saved: 'neutral', planned: 'neutral', todo: 'neutral', unscheduled: 'neutral',
  closed: 'neutral', left: 'neutral', withdrawn: 'neutral', dismissed: 'neutral', discarded: 'neutral', expired: 'neutral',
  expired_opp: 'neutral', consumed: 'neutral', cancelled: 'neutral', invalidated: 'neutral', missing: 'neutral', demo: 'neutral',
  needs_review: 'yellow', ready: 'yellow', pending: 'yellow', waitlisted: 'yellow', searching: 'yellow', late: 'yellow',
  partial: 'yellow', outcome_unknown: 'yellow', held: 'yellow', unverified: 'yellow', preparing: 'yellow', reported: 'yellow',
  reported_resource: 'yellow', needs_information: 'yellow', needs_info: 'yellow',
  approved: 'blue', submitting: 'blue', submitted: 'blue', under_review: 'blue', applied: 'blue', assessment: 'blue',
  interview: 'blue', scheduled: 'blue', in_progress: 'blue', enrolled: 'blue', matched: 'blue', found: 'blue', open: 'blue',
  available: 'blue', auto_applied: 'blue',
  accepted: 'green', active: 'green', going: 'green', collected: 'green', ready_for_collection: 'green', published: 'green',
  offer: 'green', completed: 'green', equivalent: 'green', present: 'green', excused: 'green', done: 'green', admitted: 'green',
  cleared: 'green', returned: 'green', eligible: 'green',
  rejected: 'red', failed: 'red', absent: 'red', blocked: 'red',
};

export function statusTone(status: string): Tone {
  return STATUS_TONES[status] ?? 'neutral';
}

export function Chip({ tone = 'neutral', variant, className, children }: { tone?: Tone; variant?: 'solid' | 'outline'; className?: string; children: ReactNode }) {
  return (
    <span data-tone={tone} className={cx('chip', variant === 'solid' && 'chip-solid', variant === 'outline' && 'chip-outline', className)}>
      {children}
    </span>
  );
}

export function Status({ status, label }: { status: string; label?: string }) {
  const { t, has } = useI18n();
  const tone = statusTone(status);
  return (
    <Chip tone={tone}>
      <span className="dot size-1.5!" />
      {label ?? (has(`status.${status}`) ? t(`status.${status}`) : status.replace(/_/g, ' '))}
    </Chip>
  );
}

export function Avatar({ name, color, size = 32, className }: { name: string; color?: string | null; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-grid flex-none place-items-center rounded-full font-semibold text-white select-none', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color ?? 'var(--ink-2)', fontStretch: '88%' }}
    >
      {initials(name)}
    </span>
  );
}

/* ── Page furniture ── */

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({ title, subtitle, crumbs, actions, tone }: { title: ReactNode; subtitle?: ReactNode; crumbs?: Crumb[]; actions?: ReactNode; tone?: Tone }) {
  const { t, rtl } = useI18n();
  const Sep = rtl ? CaretLeft : CaretRight;
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4" data-tone={tone}>
      <div className="min-w-0 max-w-3xl">
        {crumbs?.length ? (
          <nav aria-label={t('common.breadcrumb')} className="mb-2 flex flex-wrap items-center gap-1 text-[0.8125rem] text-ink-2">
            {crumbs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <Sep size={11} weight="bold" className="text-ink-3" />}
                {c.to ? (
                  <Link to={c.to} className="font-medium hover:text-ink">
                    {c.label}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="t-page">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-[68ch] text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Sheet({ title, action, children, className, flush, id, tone }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean; id?: string; tone?: Tone }) {
  const hid = useId();
  return (
    <section id={id} aria-labelledby={title ? hid : undefined} className={cx('sheet', className)} data-tone={tone}>
      {title ? (
        <div className="sheet-head">
          <h2 id={hid} className="t-title">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      <div className={flush ? undefined : title ? 'px-5 pt-1.5 pb-5' : 'p-5'}>{children}</div>
    </section>
  );
}

/** A heading that sits on the platform, above ruled content, with no box. */
export function SectionHead({ title, action, hint }: { title: ReactNode; action?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 px-1">
      <div className="min-w-0">
        <h2 className="t-title">{title}</h2>
        {hint ? <p className="t-meta mt-0.5">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  const { rtl } = useI18n();
  const Arrow = rtl ? CaretLeft : CaretRight;
  return (
    <Link to={to} className="link inline-flex flex-none items-center gap-1 text-[0.8125rem]">
      {children}
      <Arrow size={11} weight="bold" />
    </Link>
  );
}

/* ── States ── */

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon ? <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-tint text-brand-ink">{icon}</div> : null}
      <p className="t-lead">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-ink-2">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="sheet flex flex-wrap items-center gap-3 p-4" data-tone="red">
      <WarningCircle size={22} weight="fill" className="flex-none text-red" />
      <div className="min-w-0 flex-1">
        <p className="t-lead">{t('common.error')}</p>
        <p className="text-ink-2">{errorMessage(error)}</p>
      </div>
      {onRetry ? (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rows" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row">
          <div className="skeleton size-9 flex-none rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5" style={{ width: `${62 - ((i * 13) % 30)}%` }} />
            <div className="skeleton h-3" style={{ width: `${38 - ((i * 7) % 16)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  const { t } = useI18n();
  return (
    <div aria-busy="true" aria-label={t('common.loading')}>
      <div className="skeleton mb-2 h-8 w-56" />
      <div className="skeleton mb-7 h-4 w-80 max-w-full" />
      <div className="sheet">
        <SkeletonRows rows={5} />
      </div>
    </div>
  );
}

/** Renders loading, error and ready states for a query in one place. */
export function Loaded<T>({ q, children, skeleton }: { q: { data: T | undefined; error: unknown; loading: boolean; reload: () => void }; children: (data: T) => ReactNode; skeleton?: ReactNode }) {
  if (q.data !== undefined) return <>{children(q.data)}</>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  return <>{skeleton ?? <PageSkeleton />}</>;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <CircleNotch size={size} weight="bold" className="spin" aria-hidden />;
}

/* ── Controls ── */

type BtnProps = ComponentPropsWithoutRef<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'tone' | 'danger'; size?: 'sm' | 'md' | 'lg'; busy?: boolean; icon?: boolean; tone?: Tone };

export function Button({ variant = 'secondary', size = 'md', busy, icon, tone, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      data-tone={tone}
      disabled={disabled || busy}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', icon && 'btn-icon', className)}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, optional, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; optional?: boolean; children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode; className?: string }) {
  const id = useId();
  const { t } = useI18n();
  const describedBy = error ? `${id}-e` : hint ? `${id}-h` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional ? <span className="ms-1.5 font-normal text-ink-2">({t('common.optional').toLowerCase()})</span> : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-e`} className="field-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-h`} className="help">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface TabItem {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
  end?: boolean;
  badge?: number;
}

/** Route-backed tabs: each tab is a real page, so they are links. */
export function NavTabs({ items, tone, label }: { items: TabItem[]; tone?: Tone; label: string }) {
  return (
    <nav aria-label={label} className="tabs mb-6" data-tone={tone}>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className="tab">
          {it.icon}
          {it.label}
          {it.badge ? <span className="chip chip-solid h-4.5! px-1.5! text-[0.6875rem]!" data-tone="red">{it.badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>; label: string }) {
  return (
    <div role="group" aria-label={label} className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-10.5 flex-none rounded-full transition-colors duration-150', checked ? 'bg-brand' : 'bg-rule-strong', disabled && 'opacity-50')}
      >
        <span
          className={cx(
            'absolute top-0.5 size-5 rounded-full bg-surface shadow-sm transition-transform duration-200 ease-out ltr:left-0.5 rtl:right-0.5',
            checked && 'ltr:translate-x-4.5 rtl:-translate-x-4.5',
          )}
        />
      </button>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block font-semibold">{label}</span>
        {hint ? <span className="t-meta block">{hint}</span> : null}
      </label>
    </div>
  );
}

/** A figure with its label: the one number a section is about. */
export function Figure({ value, label, hint, tone, to }: { value: ReactNode; label: ReactNode; hint?: ReactNode; tone?: Tone; to?: string }) {
  const body = (
    <>
      <p className="t-label">{label}</p>
      <p className="fig mt-2 text-[2.125rem]" style={tone && tone !== 'neutral' ? { color: 'var(--tone-ink)' } : undefined}>
        {value}
      </p>
      {hint ? <p className="t-meta mt-1.5">{hint}</p> : null}
    </>
  );
  return to ? (
    <Link to={to} data-tone={tone} className="block px-5 py-4 transition-colors hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    <div data-tone={tone} className="px-5 py-4">
      {body}
    </div>
  );
}

/** Honest label for simulated or illustrative content. */
export function DemoNote({ children }: { children: ReactNode }) {
  return <p className="t-meta flex items-start gap-1.5 text-ink-2">{children}</p>;
}
