import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { cx } from '@/lib/format';
import type { Tone } from './kit';

/* The pass: the things a student carries. A body and a stub joined at a perforation. */

export function Pass({ children, stub, side, variant, used, className, label, stackStub, sideStub }: { children: ReactNode; stub: ReactNode; side?: boolean; variant?: 'orange' | 'paper'; used?: boolean; className?: string; label?: string; stackStub?: string; sideStub?: string }) {
  return (
    <div className={cx('pass-wrap', className)}>
      <article
        aria-label={label}
        className={cx('pass h-full', side && 'pass-side', variant === 'orange' && 'pass-orange', variant === 'paper' && 'pass-paper', used && 'pass-used')}
        style={{ ['--stub-stack' as string]: stackStub, ['--stub-side' as string]: sideStub } as CSSProperties}
      >
        <div className="min-w-0">{children}</div>
        <div className="pass-stub min-w-0">{stub}</div>
      </article>
    </div>
  );
}

/** One printed field on a pass: a small caption over its value. */
export function PassField({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <p className="t-cap">{label}</p>
      <p className="mt-1 truncate font-semibold">{children}</p>
    </div>
  );
}

/** A real, scannable QR code drawn as one SVG path. */
export function QR({ value, size = 132, label, className }: { value: string; size?: number; label: string; className?: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [value]);
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`-2 -2 ${count + 4} ${count + 4}`} shapeRendering="crispEdges" className={cx('rounded-xl bg-white', className)}>
      <path d={path} fill="#10231a" />
    </svg>
  );
}

/** A figure that counts up to its value the first time it appears, and again when it changes. */
export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    const duration = 900;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value]);
  return <span className="num">{format ? format(shown) : shown}</span>;
}

/** Progress drawn as an arc, with the reading inside it. */
export function Ring({ value, max = 100, size = 72, stroke = 8, tone = 'brand', label, children }: { value: number; max?: number; size?: number; stroke?: number; tone?: Tone; label: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} data-tone={tone} className="relative grid flex-none place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track-off)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tone)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - drawn)} className="ring-draw" />
      </svg>
      <div className="relative text-center leading-none">{children}</div>
    </div>
  );
}
