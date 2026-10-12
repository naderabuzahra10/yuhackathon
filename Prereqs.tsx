import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowsIn, ArrowsOut, BookOpenText, CaretDown, Check, CornersOut, GraduationCap, ListBullets, LockSimple, MagnifyingGlass, Minus, Plus,
  Printer, TreeStructure, X,
} from '@phosphor-icons/react';
import { useApi } from '@/lib/api';
import { cx } from '@/lib/format';
import { useMediaQuery, useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Button, Chip, ErrorState, Field, PageHeader, PageSkeleton, Segmented, Switch, type Tone } from '@/ui/kit';
import { Dialog } from '@/ui/overlay';

interface Course {
  code: string;
  title_en: string;
  title_ar: string;
  credits: number;
  category: string;
  description_en: string | null;
  prereqs: string[][];
  coreqs: string[][];
  min_credits: number;
  elective: { kind: string; pool: string[] } | null;
  unlocks: string[];
  depth: number;
}

interface Program {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  college_id: string;
  source_url?: string;
  source_version?: string;
  mine?: boolean;
}

interface Catalog {
  colleges: Array<{ id: string; name_en: string; name_ar: string; programs: Program[] }>;
  mine: string | null;
}

type MyStatus = 'completed' | 'equivalent' | 'enrolled' | 'planned' | 'available' | 'blocked' | 'failed' | 'withdrawn';

interface Chain {
  program: Program;
  terms: Array<{ year: number; sem: number; credits: number; slots: Course[] }>;
  pool: Course[];
  edges: Array<{ from: string; to: string; alt: boolean }>;
  stats: { courses: number; credits: number; longestChain: number; gateways: Array<{ code: string; unlocks: number }> };
  my: Record<string, { status: MyStatus; grade?: string | null }> | null;
}

/* ── Geometry: every station has a computed place, so the map never measures the DOM. ── */

const TILE_W = 188;
const TILE_H = 62;
const COL_GAP = 64;
const ROW_GAP = 16;
const HEAD_H = 46;
const PAD = 20;
const ROWS = 6;

interface Placed {
  course: Course;
  col: number;
  row: number;
  x: number;
  y: number;
}

interface Column {
  key: string;
  title: string;
  meta?: string;
  x: number;
}

function roundedPath(points: Array<[number, number]>, radius = 9) {
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L ${x} ${y}`;
      continue;
    }
    const ax = x - ((x - px) / inLen) * r;
    const ay = y - ((y - py) / inLen) * r;
    const bx = x + ((nx - x) / outLen) * r;
    const by = y + ((ny - y) / outLen) * r;
    d += ` L ${ax} ${ay} Q ${x} ${y} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

function collect(code: string, byCode: Map<string, Course>, next: (c: Course) => string[], seen = new Set<string>()) {
  const course = byCode.get(code);
  if (!course) return seen;
  for (const other of next(course)) {
    if (byCode.has(other) && !seen.has(other)) {
      seen.add(other);
      collect(other, byCode, next, seen);
    }
  }
  return seen;
}

const upstream = (c: Course) => c.prereqs.flat();
const downstream = (c: Course) => c.unlocks;

const STATUS_TONE: Record<MyStatus, Tone> = {
  completed: 'green', equivalent: 'green', enrolled: 'blue', planned: 'blue', available: 'green', blocked: 'neutral', failed: 'red', withdrawn: 'yellow',
};

function StatusDot({ status }: { status?: MyStatus }) {
  if (!status) return <span className="size-3 flex-none rounded-full" style={{ boxShadow: 'inset 0 0 0 2px var(--rule-strong)' }} />;
  const tone = STATUS_TONE[status];
  if (status === 'completed' || status === 'equivalent') {
    return (
      <span data-tone={tone} className="grid size-3.5 flex-none place-items-center rounded-full bg-tone text-white">
        <Check size={9} weight="bold" />
      </span>
    );
  }
  if (status === 'enrolled' || status === 'failed') return <span data-tone={tone} className="size-3.5 flex-none rounded-full bg-tone" />;
  if (status === 'blocked') return <LockSimple size={13} weight="fill" className="flex-none text-ink-3" />;
  return <span data-tone={tone} className="size-3.5 flex-none rounded-full bg-surface" style={{ boxShadow: 'inset 0 0 0 3px var(--tone)' }} />;
}

const isSlot = (code: string) => code.startsWith('ELECTIVE:');

export default function PrereqsPage() {
  const { t, l, rtl } = useI18n();
  const navigate = useNavigate();
  const { programId: routeProgram } = useParams();
  const [params, setParams] = useSearchParams();
  useTitle(t('prereqs.title'));

  const catalog = useApi<Catalog>('/academics/prereqs/catalog');
  const programs = catalog.data?.colleges.flatMap((c) => c.programs) ?? [];
  const programId = routeProgram ?? catalog.data?.mine ?? programs[0]?.id ?? null;
  const chain = useApi<Chain>(programId ? `/academics/prereqs/${programId}` : null);
  const data = chain.data;

  const desktop = useMediaQuery('(min-width: 1024px)');
  const [view, setView] = useState<'map' | 'list'>(() => (matchMedia('(max-width: 767px)').matches ? 'list' : 'map'));
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showMine, setShowMine] = useState(true);
  const [depth, setDepth] = useState<'direct' | 'full'>('direct');
  const [query, setQuery] = useState('');
  const [scale, setScale] = useState(0.9);
  const [full, setFull] = useState(false);

  useEffect(() => {
    setSelected(null);
    setHovered(null);
    setQuery('');
  }, [programId]);

  const byCode = useMemo(() => new Map((data ? [...data.terms.flatMap((x) => x.slots), ...data.pool] : []).map((c) => [c.code, c])), [data]);

  // Deep link: /prereqs?course=SWE 302 selects that course once.
  useEffect(() => {
    const code = params.get('course');
    if (code && byCode.has(code)) {
      setSelected(code);
      setParams({}, { replace: true });
    }
  }, [params, byCode, setParams]);

  const layout = useMemo(() => {
    if (!data) return null;
    const placed = new Map<string, Placed>();
    const columns: Column[] = [];
    let col = 0;
    for (const term of data.terms) {
      columns.push({
        key: `${term.year}-${term.sem}`,
        title: `${t('prereqs.year', { n: term.year })} · ${term.sem === 3 ? t('prereqs.summer') : t('prereqs.semester', { n: term.sem })}`,
        meta: `${term.credits} ${t('prereqs.credits')}`,
        x: 0,
      });
      term.slots.forEach((course, row) => placed.set(course.code, { course, col, row, x: 0, y: 0 }));
      col++;
    }
    // Electives sit after the plan, ordered by chain depth so their links also run forwards.
    const poolStart = col;
    const depths = [...new Set(data.pool.map((c) => c.depth))].sort((a, b) => a - b);
    for (const level of depths) {
      const group = data.pool.filter((c) => c.depth === level);
      for (let i = 0; i < group.length; i += ROWS) {
        columns.push({ key: `pool-${col}`, title: col === poolStart ? t('prereqs.elective') : '', x: 0 });
        group.slice(i, i + ROWS).forEach((course, row) => placed.set(course.code, { course, col, row, x: 0, y: 0 }));
        col++;
      }
    }
    const width = PAD * 2 + col * TILE_W + (col - 1) * COL_GAP;
    const height = PAD * 2 + HEAD_H + ROWS * TILE_H + (ROWS - 1) * ROW_GAP;
    const colX = (c: number) => {
      const x = PAD + c * (TILE_W + COL_GAP);
      return rtl ? width - x - TILE_W : x;
    };
    columns.forEach((column, i) => (column.x = colX(i)));
    for (const p of placed.values()) {
      p.x = colX(p.col);
      p.y = PAD + HEAD_H + p.row * (TILE_H + ROW_GAP);
    }

    // Tracks leave a station's far side and enter the next one's near side.
    // Links from the same course share a lane, so they read as one line branching.
    const dir = rtl ? -1 : 1;
    const lanes = new Map<number, string[]>();
    for (const e of data.edges) {
      const to = placed.get(e.to);
      if (!to || !placed.has(e.from)) continue;
      const list = lanes.get(to.col) ?? [];
      if (!list.includes(e.from)) list.push(e.from);
      lanes.set(to.col, list);
    }
    const edges = data.edges.flatMap((e) => {
      const a = placed.get(e.from);
      const b = placed.get(e.to);
      if (!a || !b || b.col <= a.col) return [];
      const sx = rtl ? a.x : a.x + TILE_W;
      const sy = a.y + TILE_H / 2;
      const tx = rtl ? b.x + TILE_W : b.x;
      const ty = b.y + TILE_H / 2;
      const laneList = lanes.get(b.col)!;
      const lane = (laneList.indexOf(e.from) - (laneList.length - 1) / 2) * Math.min(7, (COL_GAP - 24) / laneList.length);
      const gutterX = tx - dir * (COL_GAP / 2) + dir * lane;
      let points: Array<[number, number]>;
      if (b.col - a.col === 1) {
        points = [[sx, sy], [gutterX, sy], [gutterX, ty], [tx, ty]];
      } else {
        // Longer runs travel in the gap between rows instead of behind other stations.
        const below = b.row >= a.row;
        const corridor = below ? a.y + TILE_H + ROW_GAP / 2 : a.y - ROW_GAP / 2;
        const exitX = sx + dir * 14;
        points = [[sx, sy], [exitX, sy], [exitX, corridor], [gutterX, corridor], [gutterX, ty], [tx, ty]];
      }
      return [{ key: `${e.from}>${e.to}`, from: e.from, to: e.to, alt: e.alt, d: roundedPath(points) }];
    });
    return { placed, columns, edges, width, height, poolStart };
  }, [data, rtl, t]);

  const focus = selected ?? hovered;
  const fullChain = depth === 'full' && !!selected && focus === selected;
  const before = useMemo(() => {
    if (!focus) return new Set<string>();
    return fullChain ? collect(focus, byCode, upstream) : new Set(upstream(byCode.get(focus) ?? ({ prereqs: [] } as unknown as Course)).filter((c) => byCode.has(c)));
  }, [focus, fullChain, byCode]);
  const after = useMemo(() => {
    if (!focus) return new Set<string>();
    return fullChain ? collect(focus, byCode, downstream) : new Set((byCode.get(focus)?.unlocks ?? []).filter((c) => byCode.has(c)));
  }, [focus, fullChain, byCode]);

  const edgeRole = (e: { from: string; to: string }): 'up' | 'down' | null => {
    if (!focus) return null;
    if (fullChain) {
      if (before.has(e.from) && (before.has(e.to) || e.to === focus)) return 'up';
      if (after.has(e.to) && (after.has(e.from) || e.from === focus)) return 'down';
      return null;
    }
    if (e.to === focus && before.has(e.from)) return 'up';
    if (e.from === focus && after.has(e.to)) return 'down';
    return null;
  };

  const mine = showMine ? data?.my ?? null : null;

  /* ── Pan and zoom ── */

  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const ZOOMS = [0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3];
  const step = (dirn: 1 | -1) => setScale((s) => (dirn > 0 ? ZOOMS.find((z) => z > s + 0.001) ?? s : [...ZOOMS].reverse().find((z) => z < s - 0.001) ?? s));
  const fit = () => {
    const el = scroller.current;
    if (el && layout) setScale(Math.max(0.3, Math.min(1, Math.floor(((el.clientWidth - 4) / layout.width) * 100) / 100)));
  };

  const centerOn = useCallback(
    (code: string, smooth = true) => {
      const el = scroller.current;
      const p = layout?.placed.get(code);
      if (!el || !p) return;
      const cx0 = (p.x + TILE_W / 2) * scale - el.clientWidth / 2;
      const left = rtl ? cx0 - (el.scrollWidth - el.clientWidth) : cx0;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left, top: (p.y + TILE_H / 2) * scale - el.clientHeight / 2, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    },
    [layout, scale, rtl],
  );

  // Open on the term the student is in now.
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!data || !layout || view !== 'map' || opened.current === data.program.id) return;
    opened.current = data.program.id;
    const current = data.terms.flatMap((x) => x.slots).find((c) => data.my?.[c.code]?.status === 'enrolled');
    if (current) centerOn(current.code, false);
  }, [data, layout, view, centerOn]);

  useEffect(() => {
    if (selected && view === 'map') centerOn(selected);
  }, [selected, view, centerOn]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      step(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [full]);

  const hoverTimer = useRef<number>();
  const hover = (code: string | null) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovered(code), code ? 80 : 50);
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...byCode.values()].filter((c) => !isSlot(c.code) && (c.code.toLowerCase().includes(q) || c.title_en.toLowerCase().includes(q) || c.title_ar.includes(query.trim()))).slice(0, 8);
  }, [query, byCode]);

  const program = programs.find((p) => p.id === programId) ?? data?.program ?? null;
  const collegeId = program?.college_id ?? catalog.data?.colleges[0]?.id ?? '';
  const selectedCourse = selected ? byCode.get(selected) ?? null : null;

  function onTileKey(e: React.KeyboardEvent, p: Placed) {
    if (!layout) return;
    let { col, row } = p;
    if (e.key === 'ArrowDown') row++;
    else if (e.key === 'ArrowUp') row--;
    else if (e.key === 'ArrowRight') col += rtl ? -1 : 1;
    else if (e.key === 'ArrowLeft') col += rtl ? 1 : -1;
    else return;
    e.preventDefault();
    const target = [...layout.placed.values()].filter((x) => x.col === col).sort((a, b) => Math.abs(a.row - row) - Math.abs(b.row - row))[0];
    if (target) document.getElementById(`stn-${target.course.code}`)?.focus();
  }

  /* ── Course detail: shared by the map panel, the phone sheet and the list. ── */

  const detail = (course: Course) => {
    const status = mine?.[course.code];
    const upN = collect(course.code, byCode, upstream).size;
    const downN = collect(course.code, byCode, downstream).size;
    const jump = (code: string) => (
      <button key={code} type="button" disabled={!byCode.has(code)} onClick={() => setSelected(code)} className="chip chip-outline t-code hover:bg-surface-2 disabled:opacity-50">
        {code}
      </button>
    );
    return (
      <div className="space-y-4">
        {course.description_en ? <p className="text-ink-2">{course.description_en}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip variant="outline">
            {course.credits} {t('prereqs.credits')}
          </Chip>
          {status ? (
            <Chip tone={STATUS_TONE[status.status]}>
              {t(`prereqs.status.${status.status}`)}
              {status.grade ? ` · ${status.grade}` : ''}
            </Chip>
          ) : null}
          {course.min_credits > 0 ? (
            <Chip tone="yellow">
              <LockSimple size={11} weight="fill" />
              {t('prereqs.minCredits', { n: course.min_credits })}
            </Chip>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="well px-3 py-2.5">
            <dt className="t-label">{t('prereqs.chainDepth')}</dt>
            <dd className="fig mt-1 text-2xl">{course.depth}</dd>
          </div>
          <div className="well px-3 py-2.5">
            <dt className="t-label">{t('prereqs.unlocks')}</dt>
            <dd className="fig mt-1 text-2xl">{course.unlocks.length}</dd>
          </div>
        </dl>
        <Segmented
          label={t('prereqs.depth')}
          value={depth}
          onChange={setDepth}
          options={[
            { value: 'direct', label: t('prereqs.depth.direct') },
            { value: 'full', label: t('prereqs.depth.full', { up: upN, down: downN }) },
          ]}
        />
        <div data-tone="orange">
          <h4 className="mb-1.5 flex items-center gap-2 font-semibold">
            <span className="h-1 w-5 rounded-full bg-tone" />
            {course.prereqs.length > 1 ? t('prereqs.requiresAll') : t('prereqs.requires')}
          </h4>
          {course.prereqs.length === 0 ? (
            <p className="text-ink-2">{t('prereqs.noPrereqs')}</p>
          ) : (
            <ul className="space-y-1.5">
              {course.prereqs.map((group, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  {group.length > 1 ? <span className="t-meta">{t('prereqs.oneOf')}</span> : null}
                  {group.map((code, j) => (
                    <span key={code} className="inline-flex items-center gap-1.5">
                      {j > 0 ? <span className="t-meta">{t('prereqs.or')}</span> : null}
                      {jump(code)}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {course.coreqs.length ? (
            <p className="t-meta mt-2">
              {t('prereqs.legendCoreq')}: {course.coreqs.flat().join(', ')}
            </p>
          ) : null}
        </div>
        <div data-tone="blue">
          <h4 className="mb-1.5 flex items-center gap-2 font-semibold">
            <span className="h-1 w-5 rounded-full bg-tone" />
            {t('prereqs.opensUp')}
          </h4>
          {course.unlocks.length === 0 ? <p className="text-ink-2">{t('prereqs.unlocksNothing')}</p> : <div className="flex flex-wrap gap-1.5">{course.unlocks.map(jump)}</div>}
        </div>
        {course.elective?.pool.length ? (
          <div>
            <h4 className="mb-1.5 font-semibold">{t('prereqs.electivePool')}</h4>
            <div className="flex flex-wrap gap-1.5">{course.elective.pool.map(jump)}</div>
          </div>
        ) : null}
        {!isSlot(course.code) ? (
          <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
            {data?.my ? (
              <Link to={`/academics/courses/${encodeURIComponent(course.code)}`} className="btn btn-secondary btn-sm">
                <GraduationCap size={15} />
                {t('prereqs.openCourse')}
              </Link>
            ) : null}
            <Link to={`/campus/resources?course=${encodeURIComponent(course.code)}`} className="btn btn-secondary btn-sm">
              <BookOpenText size={15} />
              {t('prereqs.resources')}
            </Link>
            {data?.my?.[course.code]?.status === 'available' ? (
              <Link to={`/academics/register?course=${encodeURIComponent(course.code)}`} className="btn btn-primary btn-sm">
                {t('prereqs.planTerm')}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const detailTitle = (course: Course) => (
    <span className="flex items-baseline gap-2">
      <span className="t-code text-blue-ink">{isSlot(course.code) ? t('prereqs.elective') : course.code}</span>
      <span dir="auto">{l(course.title_en, course.title_ar)}</span>
    </span>
  );

  return (
    <div data-tone="blue">
      <PageHeader
        title={t('prereqs.title')}
        subtitle={t('prereqs.subtitle')}
        actions={
          <>
            {selected ? (
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <X size={14} weight="bold" />
                {t('prereqs.reset')}
              </Button>
            ) : null}
            <Button size="sm" className="no-print" onClick={() => window.print()}>
              <Printer size={15} />
              {t('prereqs.print')}
            </Button>
          </>
        }
      />

      <div className="no-print mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1.2fr_auto]">
        <Field label={t('prereqs.college')}>
          {(p) => (
            <select
              {...p}
              className="select"
              value={collegeId}
              onChange={(e) => {
                const first = catalog.data?.colleges.find((c) => c.id === e.target.value)?.programs[0];
                if (first) navigate(`/prereqs/${first.id}`);
              }}
            >
              {catalog.data?.colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {l(c.name_en, c.name_ar)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('prereqs.program')}>
          {(p) => (
            <select {...p} className="select" value={programId ?? ''} onChange={(e) => navigate(`/prereqs/${e.target.value}`)}>
              {catalog.data?.colleges
                .filter((c) => c.id === collegeId)
                .flatMap((c) => c.programs)
                .map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {l(pr.name_en, pr.name_ar)} ({pr.code}){pr.mine ? ` · ${t('prereqs.yours')}` : ''}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label={t('prereqs.search')}>
          {(p) => (
            <div className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input {...p} className="input ps-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="SWE 302, Operating Systems…" autoComplete="off" />
              {matches.length ? (
                <ul className="pop absolute inset-x-0 top-full z-[900] mt-1.5 overflow-hidden p-1">
                  {matches.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        className="flex w-full items-baseline gap-2.5 rounded-lg px-2.5 py-2 text-start hover:bg-surface-2"
                        onClick={() => {
                          setSelected(c.code);
                          setQuery('');
                        }}
                      >
                        <span className="t-code text-blue-ink">{c.code}</span>
                        <span className="truncate">{l(c.title_en, c.title_ar)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Field>
        {data?.my ? (
          <div className="flex items-end pb-1">
            <Switch checked={showMine} onChange={setShowMine} label={t('prereqs.myStatus')} hint={t('prereqs.myStatusHint')} />
          </div>
        ) : null}
      </div>

      {chain.error ? <ErrorState error={chain.error} onRetry={chain.reload} /> : null}
      {!data && !chain.error ? <PageSkeleton /> : null}

      {data && layout ? (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                {[
                  [data.stats.credits, t('prereqs.credit_total')],
                  [data.stats.courses, t('prereqs.courses')],
                  [data.stats.longestChain, t('prereqs.longest')],
                ].map(([n, label]) => (
                  <span key={String(label)} className="inline-flex items-baseline gap-1.5">
                    <span className="fig text-[1.75rem]">{n}</span>
                    <span className="text-ink-2">{label}</span>
                  </span>
                ))}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="me-1 font-semibold" title={t('prereqs.gatewaysHint')}>
                  {t('prereqs.gateways')}
                </span>
                {data.stats.gateways.map((g) => (
                  <button
                    key={g.code}
                    type="button"
                    aria-pressed={selected === g.code}
                    onClick={() => setSelected(g.code)}
                    className={cx('chip h-7! transition-colors', selected === g.code ? 'chip-solid' : 'chip-outline hover:bg-surface-2')}
                    data-tone={selected === g.code ? 'blue' : undefined}
                  >
                    <span className="t-code">{g.code}</span>
                    <span className="font-medium opacity-80">{t('prereqs.unlocksN', { n: g.unlocks })}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="no-print">
              <Segmented
                label={t('prereqs.view')}
                value={view}
                onChange={(v) => {
                  setView(v);
                  setFull(false);
                }}
                options={[
                  { value: 'map', label: t('prereqs.view.map'), icon: <TreeStructure size={15} /> },
                  { value: 'list', label: t('prereqs.view.list'), icon: <ListBullets size={15} /> },
                ]}
              />
            </div>
          </div>

          {view === 'map' ? (
            <section aria-label={t('prereqs.h.map')} className={cx('sheet relative flex flex-col overflow-hidden', full ? 'fixed inset-0 z-[1000] rounded-none border-0' : 'h-[min(40rem,calc(100dvh-13rem))] min-h-[26rem]')}>
              <div className="no-print flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-3 py-2">
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-2" aria-label={t('prereqs.legend')}>
                  <li className="flex items-center gap-1.5" data-tone="orange">
                    <span className="h-1 w-5 rounded-full bg-tone" />
                    {t('prereqs.legendUp')}
                  </li>
                  <li className="flex items-center gap-1.5" data-tone="blue">
                    <span className="h-1 w-5 rounded-full bg-tone" />
                    {t('prereqs.legendDown')}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-5 border-t-2 border-dashed border-ink-3" />
                    {t('prereqs.legendAlt')}
                  </li>
                  {mine
                    ? (['completed', 'enrolled', 'available', 'blocked'] as const).map((s) => (
                        <li key={s} className="flex items-center gap-1.5">
                          <StatusDot status={s} />
                          {t(`prereqs.status.${s}`)}
                        </li>
                      ))
                    : null}
                </ul>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" icon onClick={() => step(-1)} aria-label={t('prereqs.zoomOut')} disabled={scale <= ZOOMS[0]}>
                    <Minus size={15} weight="bold" />
                  </Button>
                  <span className="num w-11 text-center text-[0.8125rem] font-semibold">{Math.round(scale * 100)}%</span>
                  <Button variant="ghost" size="sm" icon onClick={() => step(1)} aria-label={t('prereqs.zoomIn')} disabled={scale >= ZOOMS[ZOOMS.length - 1]}>
                    <Plus size={15} weight="bold" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={fit}>
                    <ArrowsIn size={15} />
                    {t('prereqs.fitShort')}
                  </Button>
                  <Button variant="ghost" size="sm" icon onClick={() => setFull((f) => !f)} aria-label={t(full ? 'prereqs.exitFull' : 'prereqs.full')}>
                    {full ? <ArrowsOut size={15} className="rotate-180" /> : <CornersOut size={15} />}
                  </Button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1">
                <div
                  ref={scroller}
                  className="scroll-thin absolute inset-0 cursor-grab overflow-auto bg-surface-2/50 active:cursor-grabbing"
                  onPointerDown={(e) => {
                    if (e.button !== 0 || e.pointerType === 'touch') return;
                    const el = scroller.current!;
                    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
                  }}
                  onPointerMove={(e) => {
                    const st = drag.current;
                    if (!st) return;
                    if (Math.abs(e.clientX - st.x) + Math.abs(e.clientY - st.y) > 4) st.moved = true;
                    if (!st.moved) return;
                    const el = scroller.current!;
                    el.scrollLeft = st.left - (e.clientX - st.x);
                    el.scrollTop = st.top - (e.clientY - st.y);
                  }}
                  onPointerUp={() => window.setTimeout(() => (drag.current = null), 0)}
                  onPointerLeave={() => (drag.current = null)}
                >
                  <div style={{ width: layout.width * scale, height: layout.height * scale }}>
                    <div className="relative" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: rtl ? 'top right' : 'top left' }}>
                      {layout.columns.map((c, i) => (
                        <div key={c.key} className="absolute" style={{ left: c.x, top: PAD, width: TILE_W }}>
                          {c.title ? (
                            <>
                              <p className="t-label truncate text-ink!">{c.title}</p>
                              {c.meta ? <p className="t-meta">{c.meta}</p> : null}
                            </>
                          ) : null}
                          {i === layout.poolStart ? <p className="t-meta truncate">{t('prereqs.poolTitle')}</p> : null}
                        </div>
                      ))}

                      <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden>
                        {layout.edges.map((e) => {
                          const role = edgeRole(e);
                          if (role) return null;
                          return <path key={e.key} d={e.d} fill="none" stroke="var(--rule-strong)" strokeWidth={2} strokeDasharray={e.alt ? '5 5' : undefined} opacity={focus ? 0.22 : 0.85} strokeLinecap="round" />;
                        })}
                        {layout.edges.map((e) => {
                          const role = edgeRole(e);
                          if (!role) return null;
                          return (
                            <path
                              key={`${e.key}-${focus}-${depth}`}
                              d={e.d}
                              fill="none"
                              stroke={role === 'up' ? 'var(--orange)' : 'var(--blue)'}
                              strokeWidth={4}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              pathLength={e.alt ? undefined : 1}
                              strokeDasharray={e.alt ? '7 6' : undefined}
                              className={e.alt ? undefined : 'path-draw'}
                            />
                          );
                        })}
                      </svg>

                      {[...layout.placed.values()].map((p) => {
                        const c = p.course;
                        const isSel = selected === c.code;
                        const isFocus = focus === c.code;
                        const isBefore = before.has(c.code);
                        const isAfter = after.has(c.code);
                        const dim = !!focus && !isFocus && !isBefore && !isAfter;
                        const slot = isSlot(c.code);
                        const status = mine?.[c.code]?.status;
                        return (
                          <button
                            key={c.code}
                            id={`stn-${c.code}`}
                            type="button"
                            aria-pressed={isSel}
                            title={`${c.code} · ${l(c.title_en, c.title_ar)}`}
                            onMouseEnter={() => hover(c.code)}
                            onMouseLeave={() => hover(null)}
                            onFocus={() => setHovered(c.code)}
                            onBlur={() => setHovered(null)}
                            onKeyDown={(e) => onTileKey(e, p)}
                            onClick={() => {
                              if (!drag.current?.moved) setSelected((s) => (s === c.code ? null : c.code));
                            }}
                            data-tone={isBefore ? 'orange' : isAfter ? 'blue' : undefined}
                            className={cx(
                              'absolute rounded-[10px] border bg-surface px-2.5 py-2 text-start transition-[opacity,box-shadow,border-color] duration-150',
                              slot ? 'border-dashed border-rule-strong' : 'border-rule-strong',
                              isFocus && 'z-10 border-ink shadow-pop',
                              isSel && 'outline-2 outline-ink',
                              !isFocus && (isBefore || isAfter) && 'border-tone',
                              dim && 'opacity-30',
                            )}
                            style={{ left: p.x, top: p.y, width: TILE_W, height: TILE_H, boxShadow: !isFocus && (isBefore || isAfter) ? '0 0 0 2px var(--tone)' : undefined }}
                          >
                            <span className="flex items-center gap-1.5">
                              {mine && !slot ? <StatusDot status={status} /> : null}
                              <span className={cx('t-code text-[0.8125rem]', slot ? 'text-ink-2' : 'text-ink')}>{slot ? c.elective?.kind.toUpperCase() : c.code}</span>
                              {c.min_credits > 0 ? <LockSimple size={11} weight="fill" className="text-yellow-ink" aria-label={t('prereqs.minCredits', { n: c.min_credits })} /> : null}
                              <span className="t-meta ms-auto num">
                                {c.credits} {t('prereqs.credits')}
                              </span>
                            </span>
                            <span className={cx('mt-0.5 block truncate text-[0.8125rem] leading-snug', slot ? 'text-ink-2' : 'font-medium')}>{l(c.title_en, c.title_ar)}</span>
                            {c.unlocks.length >= 3 ? (
                              <span
                                className="t-code absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-ink text-[0.6875rem] text-surface ltr:-right-2.5 rtl:-left-2.5"
                                title={`${t('prereqs.unlocks')} ${c.unlocks.length}`}
                              >
                                {c.unlocks.length}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {desktop && selectedCourse ? (
                  <aside aria-label={t('prereqs.h.detail')} className="pop scroll-thin absolute end-3 top-3 bottom-3 z-20 w-[21.5rem] overflow-y-auto">
                    <div className="sticky top-0 z-10 flex items-start gap-2 border-b border-rule bg-surface px-4 py-3">
                      <h3 className="t-title min-w-0 flex-1">{detailTitle(selectedCourse)}</h3>
                      <Button variant="ghost" size="sm" icon onClick={() => setSelected(null)} aria-label={t('common.close')} className="-me-1.5 -mt-0.5">
                        <X size={14} weight="bold" />
                      </Button>
                    </div>
                    <div className="p-4">{detail(selectedCourse)}</div>
                  </aside>
                ) : null}
                {!selectedCourse ? <p className="no-print t-meta pointer-events-none absolute start-3 bottom-3 rounded-md bg-surface/90 px-2 py-1">{t('prereqs.hint2')}</p> : null}
              </div>
            </section>
          ) : (
            <section aria-label={t('prereqs.view.list')} className="space-y-5">
              {[
                ...data.terms.map((term) => ({
                  key: `${term.year}-${term.sem}`,
                  title: `${t('prereqs.year', { n: term.year })} · ${term.sem === 3 ? t('prereqs.summer') : t('prereqs.semester', { n: term.sem })}`,
                  meta: `${term.credits} ${t('prereqs.credits')}`,
                  courses: term.slots,
                })),
                ...(data.pool.length ? [{ key: 'pool', title: t('prereqs.poolTitle'), meta: '', courses: data.pool }] : []),
              ].map((group) => (
                <div key={group.key}>
                  <h3 className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
                    <span className="t-title">{group.title}</span>
                    <span className="t-meta">{group.meta}</span>
                  </h3>
                  <ul className="sheet rows overflow-hidden">
                    {group.courses.map((c) => {
                      const open = selected === c.code;
                      const status = mine?.[c.code]?.status;
                      const slot = isSlot(c.code);
                      const needs = c.prereqs.length;
                      return (
                        <li key={c.code}>
                          <button type="button" className="row" aria-expanded={open} onClick={() => setSelected(open ? null : c.code)}>
                            {mine && !slot ? <StatusDot status={status} /> : null}
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className="t-code text-blue-ink">{slot ? t('prereqs.elective') : c.code}</span>
                                <span className="font-semibold" dir="auto">
                                  {l(c.title_en, c.title_ar)}
                                </span>
                              </span>
                              <span className="t-meta block">
                                {[
                                  needs ? t('prereqs.needsCount', { n: needs }) : t('prereqs.noPrereqsShort'),
                                  c.unlocks.length ? t('prereqs.unlocksN', { n: c.unlocks.length }) : null,
                                  status ? t(`prereqs.status.${status}`) : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </span>
                            <CaretDown size={14} weight="bold" className={cx('flex-none text-ink-3 transition-transform duration-200', open && 'rotate-180')} />
                          </button>
                          {open ? <div className="border-t border-rule bg-surface-2/50 px-4.5 py-4">{detail(c)}</div> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {data.program.source_version ? (
            <p className="t-meta mt-4">
              {t('prereqs.source')}:{' '}
              {data.program.source_url ? (
                <a href={data.program.source_url} target="_blank" rel="noreferrer" className="link">
                  {data.program.source_version}
                </a>
              ) : (
                data.program.source_version
              )}
            </p>
          ) : null}

          <Dialog open={view === 'map' && !desktop && !!selectedCourse} onClose={() => setSelected(null)} title={selectedCourse ? detailTitle(selectedCourse) : ''}>
            {selectedCourse ? detail(selectedCourse) : null}
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
