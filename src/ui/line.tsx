import type { ReactNode } from 'react';
import { Check, X } from '@phosphor-icons/react';
import { cx } from '@/lib/format';
import type { Tone } from './kit';

/* The line: anything with stages is drawn as a track with stations.
   Passed stations are filled, the current one is a ringed interchange,
   and stations ahead are open rings on unlit track. */

export type StopState = 'done' | 'current' | 'todo' | 'failed' | 'skipped';

export interface Stage {
  key: string;
  label: ReactNode;
  meta?: ReactNode;
  state: StopState;
}

function StationDot({ state, size = 'md' }: { state: StopState; size?: 'sm' | 'md' }) {
  const base = size === 'sm' ? 'size-3' : 'size-4';
  if (state === 'done') {
    return (
      <span className={cx('relative grid flex-none place-items-center rounded-full bg-tone text-(--on-tone,#fff)', base)}>
        {size === 'md' ? <Check size={10} weight="bold" /> : null}
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className={cx('relative grid flex-none place-items-center rounded-full bg-red text-white', base)}>
        {size === 'md' ? <X size={10} weight="bold" /> : null}
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span
        data-current
        className={cx('now-pulse relative block flex-none rounded-full bg-(--dot-bg)', size === 'sm' ? 'size-3.5' : 'size-5')}
        style={{ boxShadow: `inset 0 0 0 ${size === 'sm' ? 3 : 4}px var(--tone)` }}
      />
    );
  }
  return <span className={cx('relative block flex-none rounded-full bg-(--dot-bg)', base)} style={{ boxShadow: 'inset 0 0 0 2.5px var(--dot-off)' }} />;
}

const lit = (s: StopState) => s === 'done' || s === 'current' || s === 'failed';

/** A horizontal line of stages. Scrolls sideways on narrow screens rather than squeezing labels. */
export function StageLine({ stages, tone = 'blue', label, dense }: { stages: Stage[]; tone?: Tone; label: string; dense?: boolean }) {
  return (
    <div className="scroll-x -mx-1 px-1" data-tone={tone}>
      <ol aria-label={label} className="grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(${dense ? 4.5 : 6}rem, 1fr))` }}>
        {stages.map((s, i) => (
          <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined} className="relative flex flex-col items-center px-1.5 text-center">
            <div className="relative flex h-5 w-full items-center justify-center">
              {i > 0 ? <span className={cx('absolute start-0 end-1/2 h-1', lit(s.state) ? 'bg-tone' : 'bg-(--track-off)')} /> : null}
              {i < stages.length - 1 ? <span className={cx('absolute start-1/2 end-0 h-1', lit(stages[i + 1].state) ? 'bg-tone' : 'bg-(--track-off)')} /> : null}
              <StationDot state={s.state} />
            </div>
            <span className={cx('mt-2 text-[0.8125rem] leading-tight', s.state === 'todo' || s.state === 'skipped' ? 'font-medium opacity-70' : 'font-semibold')}>{s.label}</span>
            {s.meta ? <span className="t-meta mt-0.5">{s.meta}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A vertical line: history, route steps, a day's stops. Each child is one stop. */
export function Stops({ children, tone = 'blue', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <ol data-tone={tone} className={className}>
      {children}
    </ol>
  );
}

export function Stop({ state = 'done', last, children, time, tone }: { state?: StopState; last?: boolean; children: ReactNode; time?: ReactNode; tone?: Tone }) {
  return (
    <li data-tone={tone} className="relative flex gap-3.5">
      {time !== undefined ? <div className="t-code w-[4.25rem] flex-none pt-0.5 text-end text-[0.8125rem] opacity-70">{time}</div> : null}
      <div className="relative flex w-5 flex-none justify-center">
        {!last ? <span className={cx('absolute top-4 -bottom-1 w-1', state === 'done' ? 'bg-tone' : 'bg-(--track-off)')} /> : null}
        <span className="relative mt-0.5 block">
          <StationDot state={state} />
        </span>
      </div>
      <div className={cx('min-w-0 flex-1', last ? 'pb-0' : 'pb-5')}>{children}</div>
    </li>
  );
}

/** Distance travelled along a line: the fill is the journey so far, the ring is where you are. */
export function Meter({ value, max = 100, tone = 'blue', label, marks }: { value: number; max?: number; tone?: Tone; label: string; marks?: number[] }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} data-tone={tone} className="relative h-4">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
      <div className="track-draw absolute start-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-tone" style={{ width: `${pct}%` }} />
      {marks?.map((m) => (
        <span key={m} className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-ink-3" style={{ insetInlineStart: `${(m / max) * 100}%` }} />
      ))}
      <span
        className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-surface"
        style={{ insetInlineStart: `clamp(0px, calc(${pct}% - 8px), calc(100% - 16px))`, boxShadow: 'inset 0 0 0 4px var(--tone)' }}
      />
    </div>
  );
}

/** A slim capacity bar with no knob, for many rows at once. */
export function Bar({ value, max = 100, tone = 'blue', label, marks }: { value: number; max?: number; tone?: Tone; label: string; marks?: Array<{ at: number; tone: Tone }> }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} data-tone={tone} className="relative h-1.5 w-full rounded-full bg-surface-3">
      <div className="absolute inset-y-0 start-0 rounded-full bg-tone" style={{ width: `${pct}%` }} />
      {marks?.map((m) => (
        <span key={m.at} data-tone={m.tone} className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-tone" style={{ insetInlineStart: `${(m.at / max) * 100}%` }} />
      ))}
    </div>
  );
}

/** The bullet that names a line, as on a platform sign. */
export function LineBullet({ tone, children, size = 22 }: { tone: Tone; children?: ReactNode; size?: number }) {
  return (
    <span
      data-tone={tone}
      className="t-code inline-grid flex-none place-items-center rounded-full bg-tone text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5), color: tone === 'yellow' ? 'oklch(0.25 0.05 80)' : undefined }}
    >
      {children}
    </span>
  );
}
