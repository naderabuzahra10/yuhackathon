import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowsDownUp, ArrowsOutSimple, CarProfile, Clock, Crosshair, GraduationCap, Info, MagnifyingGlass, NavigationArrow, Pause, PersonSimpleWalk,
  Play, Signpost, Stairs, TrendDown, TrendUp, Warning, Wheelchair, X,
} from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { fmtDuration } from '@/lib/clock';
import { cx, fmtNumber, fmtTime } from '@/lib/format';
import { useIsDark, useStored, useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Chip, Empty, ErrorState, Field, PageHeader, Segmented, SkeletonRows, type Tone } from '@/ui/kit';
import { Bar, Stop, Stops } from '@/ui/line';
import { Dialog, toast, useAction } from '@/ui/overlay';
import type { LatLng, MapLot, MapPlace } from './MapCanvas';

const MapCanvas = lazy(() => import('./MapCanvas'));

interface Campus {
  id: string;
  name_en: string;
  name_ar: string;
  city_en: string;
  city_ar: string;
  lat: number;
  lng: number;
  zoom: number;
  boundary: LatLng[];
  geometry_status: string;
  source_note: string;
}

export interface Place {
  id: string;
  campus_id: string;
  kind: string;
  name_en: string;
  name_ar: string;
  building_id: string | null;
  building_name_en: string | null;
  building_name_ar: string | null;
  floor: number;
  lat: number;
  lng: number;
  accessible: 'yes' | 'no' | 'unknown';
  tags: string[];
  description_en: string | null;
  geometry_status: string;
  polygon: LatLng[] | null;
}

interface Route {
  found: boolean;
  distance_m: number;
  duration_min: number;
  steps: Array<{ to: string; to_name_en: string; to_name_ar: string; kind: string; meters: number; instruction_en: string; instruction_ar: string; accessible: string }>;
  polyline: LatLng[];
  warnings: string[];
  unknownAccessibilitySegments: number;
  stairsSegments: number;
  reason?: string;
}

interface Bay {
  id: string;
  n: number;
  kind: string;
  polygon: LatLng[];
  status: 'free' | 'occupied' | 'unknown' | 'closed';
  since: string | null;
  closed_reason: string | null;
}

interface Lot {
  id: string;
  name_en: string;
  name_ar: string;
  audience: string;
  detection: string;
  lat: number;
  lng: number;
  polygon: LatLng[] | null;
  free: number;
  occupied: number;
  unknown: number;
  closed: number;
  total: number;
  usable: number;
  level: 'available' | 'limited' | 'full' | 'no_data';
  trend: 'filling' | 'emptying' | 'steady';
  full_by: string | null;
  by_kind: Record<string, { total: number; free: number }>;
  walk: { meters: number; minutes: number } | null;
  bays?: Bay[];
}

interface Parking {
  mode: 'live' | 'replay';
  time: string;
  lots: Lot[];
  totals: { total: number; free: number };
  can_manage: boolean;
  note: string;
}

const CATEGORIES = ['academic', 'services', 'food', 'sports', 'prayer', 'housing', 'parking', 'gates'] as const;
type Category = (typeof CATEGORIES)[number];

function categoryOf(p: Pick<Place, 'kind' | 'tags'>): Category {
  const tags = p.tags ?? [];
  if (p.kind === 'gate') return 'gates';
  if (p.kind === 'parking') return 'parking';
  if (p.kind === 'mosque') return 'prayer';
  if (p.kind === 'cafe') return 'food';
  if (p.kind === 'outdoor' || tags.includes('sports')) return 'sports';
  if (tags.includes('residence')) return 'housing';
  if (p.kind === 'security' || p.kind === 'service' || p.kind === 'entrance') return 'services';
  return 'academic';
}

const CATEGORY_TONE: Record<Category, Tone> = { academic: 'blue', services: 'purple', food: 'orange', sports: 'green', prayer: 'yellow', housing: 'neutral', parking: 'neutral', gates: 'neutral' };
const LEVEL_TONE: Record<Lot['level'], Tone> = { available: 'green', limited: 'yellow', full: 'red', no_data: 'neutral' };

const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const clean = (s: string) => s.replace(/ — /g, ' · ');
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function readDemoLocation(): { lat: number; lng: number; accuracy?: number } | null {
  try {
    const raw = localStorage.getItem('uj.demoLocation.v2');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ── Place picker: type to search, or choose a shortcut or a popular place. ── */

function PlacePicker({ label, value, onChange, places, popular, shortcuts, placeholder }: { label: string; value: string; onChange: (id: string) => void; places: Place[]; popular: Place[]; shortcuts?: Array<{ value: string; label: string; icon: React.ReactNode }>; placeholder: string }) {
  const { t, l } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const name = (p: Place) => clean(l(p.name_en, p.name_ar));
  const detailOf = (p: Place) =>
    p.building_id ? [l(p.building_name_en ?? '', p.building_name_ar), p.floor ? t('map.picker.floor', { n: p.floor }) : null].filter(Boolean).join(' · ') : t(`map.cat.${categoryOf(p)}`);
  const shown = value === '@me' ? t('map.me.option') : value && byId.get(value) ? name(byId.get(value)!) : '';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const q = text.trim().toLowerCase();
  const results = q
    ? places.filter((p) => !['junction', 'entrance'].includes(p.kind) && [p.name_en, p.name_ar, p.building_name_en ?? '', p.building_name_ar ?? '', p.kind, ...p.tags].join(' ').toLowerCase().includes(q)).slice(0, 12)
    : popular;

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setText('');
  };

  return (
    <Field label={label}>
      {(p) => (
        <div ref={wrap} className="relative">
          <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            {...p}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            className={cx('input ps-9', value && 'pe-9')}
            value={open ? text : shown}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && results[0]) choose(results[0].id);
            }}
          />
          {value && !open ? (
            <button type="button" className="absolute end-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => onChange('')} aria-label={t('map.picker.clear', { field: label })}>
              <X size={13} weight="bold" />
            </button>
          ) : null}
          {open ? (
            <div role="listbox" className="pop scroll-thin absolute inset-x-0 top-full z-[900] mt-1.5 max-h-72 overflow-y-auto p-1">
              {!q && shortcuts?.length ? (
                <>
                  <p className="t-label px-2.5 pt-2 pb-1">{t('map.picker.shortcuts')}</p>
                  {shortcuts.map((s) => (
                    <button key={s.value} type="button" role="option" aria-selected={false} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start hover:bg-surface-2" onClick={() => choose(s.value)}>
                      <span className="text-blue-ink">{s.icon}</span>
                      <span className="font-medium">{s.label}</span>
                    </button>
                  ))}
                </>
              ) : null}
              {!q ? <p className="t-label px-2.5 pt-2 pb-1">{t('map.popular')}</p> : null}
              {results.length ? (
                results.map((r) => (
                  <button key={r.id} type="button" role="option" aria-selected={r.id === value} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start hover:bg-surface-2" onClick={() => choose(r.id)}>
                    <span data-tone={CATEGORY_TONE[categoryOf(r)]} className="dot" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{name(r)}</span>
                      <span className="t-meta block truncate">{detailOf(r)}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-ink-2">{t('map.picker.none', { q: text })}</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/* ── Parking panel ── */

function ParkingPanel({ data, at, setAt, target, setTarget, places, onFocus, selectedBay, onBayChanged }: { data: Parking; at: number | null; setAt: (m: number | null) => void; target: string; setTarget: (id: string) => void; places: Place[]; onFocus: (lotId: string) => void; selectedBay: { lot: Lot; bay: Bay } | null; onBayChanged: () => void }) {
  const { t, l, locale } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  const next = useApi<{ location: Place | null }>('/campus/map/next-class');
  const atRef = useRef(at);
  atRef.current = at;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const cur = atRef.current ?? 360;
      if (cur + 15 > 1320) {
        setPlaying(false);
        return;
      }
      setAt(cur + 15);
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, setAt]);

  useEffect(() => setReason(''), [selectedBay?.bay.id]);

  const lots = [...data.lots].sort((a, b) => (a.walk && b.walk ? a.walk.minutes - b.walk.minutes : 0) || b.free - a.free);
  const targetPlace = places.find((p) => p.id === target);

  return (
    <div className="space-y-5">
      <div>
        <p className="flex items-baseline gap-2">
          <span className="fig text-[3rem] text-green-ink">{fmtNumber(data.totals.free, locale)}</span>
          <span className="text-ink-2">{t('parking.totals', { free: '', total: fmtNumber(data.totals.total, locale) }).replace(/^\s+/, '')}</span>
        </p>
        <p className="t-meta mt-1 flex items-center gap-1.5">
          <span data-tone={data.mode === 'live' ? 'green' : 'yellow'} className="dot size-2!" />
          {data.mode === 'live' ? t('parking.liveAt', { time: fmtTime(data.time, locale) }) : t('parking.replayAt', { time: fmtTime(data.time, locale) })}
        </p>
      </div>

      <div className="well p-3">
        <div className="flex items-center gap-2">
          <Button size="sm" icon variant="secondary" onClick={() => setPlaying((p) => !p)} aria-label={t(playing ? 'parking.pause' : 'parking.play')} title={t(playing ? 'parking.pause' : 'parking.play')}>
            {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </Button>
          <input
            type="range"
            min={360}
            max={1320}
            step={15}
            value={at ?? 540}
            onChange={(e) => {
              setPlaying(false);
              setAt(Number(e.target.value));
            }}
            aria-label={t('parking.slider')}
            aria-valuetext={fmtTime(hhmm(at ?? 540), locale)}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-(--ink)"
          />
          <span className="t-code w-[4.25rem] text-end text-[0.8125rem]">{fmtTime(hhmm(at ?? 540), locale)}</span>
        </div>
        {at !== null ? (
          <button
            type="button"
            className="link mt-2 text-[0.8125rem]"
            onClick={() => {
              setPlaying(false);
              setAt(null);
            }}
          >
            {t('parking.backToLive')}
          </button>
        ) : null}
      </div>

      <Field label={t('parking.walkTo')}>
        {(p) => (
          <select {...p} className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t('parking.noTarget')}</option>
            {next.data?.location ? (
              <option value={next.data.location.id}>
                {t('parking.nextClass')} · {clean(l(next.data.location.name_en, next.data.location.name_ar))}
              </option>
            ) : null}
            {places
              .filter((x) => !x.building_id && !['junction', 'gate', 'parking', 'entrance', 'room'].includes(x.kind) && x.id !== next.data?.location?.id)
              .sort((a, b) => a.name_en.localeCompare(b.name_en))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {clean(l(x.name_en, x.name_ar))}
                </option>
              ))}
          </select>
        )}
      </Field>

      {selectedBay ? (
        <div className="sheet p-3.5">
          <p className="t-lead">
            {t('parking.bay', { n: selectedBay.bay.n })} · {clean(l(selectedBay.lot.name_en, selectedBay.lot.name_ar))}
          </p>
          <p className="t-meta mt-0.5">
            {t(`parking.kind.${selectedBay.bay.kind}`)} · {selectedBay.bay.status === 'closed' ? t('parking.bay.closed') : t(`parking.bay.${selectedBay.bay.status}`, { time: selectedBay.bay.since ?? '' })}
          </p>
          {selectedBay.bay.closed_reason ? <p className="mt-1 text-ink-2">{selectedBay.bay.closed_reason}</p> : null}
          {data.can_manage ? (
            <div className="mt-3 space-y-2.5">
              {selectedBay.bay.status !== 'closed' ? <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('parking.closeReason')} aria-label={t('parking.closeReason')} /> : null}
              <Button
                size="sm"
                variant={selectedBay.bay.status === 'closed' ? 'secondary' : 'danger'}
                busy={busy === 'bay'}
                onClick={() =>
                  void run('bay', async () => {
                    const closing = selectedBay.bay.status !== 'closed';
                    await api(`/campus/map/parking/bays/${selectedBay.bay.id}`, { method: 'POST', body: { closed: closing, reason: reason.trim() || undefined } });
                    toast.ok(t(closing ? 'parking.bayClosed' : 'parking.bayOpened'));
                    onBayChanged();
                  })
                }
              >
                {t(selectedBay.bay.status === 'closed' ? 'parking.openBay' : 'parking.closeBay')}
              </Button>
              <p className="t-meta">{t('parking.securityNote')}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {lots.length ? (
        <ul className="sheet rows overflow-hidden">
          {lots.map((lot) => {
            const acc = lot.by_kind.disabled;
            const Trend = lot.trend === 'filling' ? TrendUp : lot.trend === 'emptying' ? TrendDown : null;
            return (
              <li key={lot.id} data-tone={LEVEL_TONE[lot.level]}>
                <button type="button" className="row items-start! py-3.5!" onClick={() => onFocus(lot.id)} title={t('parking.showOnMap')}>
                  <span className="w-14 flex-none text-center">
                    <span className="fig block text-[1.875rem] text-tone-ink">{lot.free}</span>
                    <span className="t-meta block num">{t('parking.of', { n: lot.usable })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{clean(l(lot.name_en, lot.name_ar))}</span>
                      <Chip tone={LEVEL_TONE[lot.level]}>{t(`parking.level.${lot.level}`)}</Chip>
                    </span>
                    <span className="mt-1.5 block">
                      <Bar value={lot.usable - lot.free} max={Math.max(1, lot.usable)} tone={LEVEL_TONE[lot.level]} label={`${lot.free} / ${lot.usable}`} />
                    </span>
                    <span className="t-meta mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span>{t(`parking.audience.${lot.audience}`)}</span>
                      {Trend ? (
                        <span className="inline-flex items-center gap-1">
                          <Trend size={13} />
                          {lot.full_by ? t('parking.fullBy', { time: fmtTime(lot.full_by, locale) }) : t(`parking.trend.${lot.trend}`)}
                        </span>
                      ) : null}
                      {lot.walk ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <PersonSimpleWalk size={13} />
                          {targetPlace ? t('parking.walkTarget', { min: lot.walk.minutes, place: clean(l(targetPlace.name_en, targetPlace.name_ar)) }) : t('parking.walk', { min: lot.walk.minutes })}
                        </span>
                      ) : null}
                      {acc ? (
                        <span className="inline-flex items-center gap-1">
                          <Wheelchair size={13} />
                          {t('parking.accessible', { free: acc.free, total: acc.total })}
                        </span>
                      ) : null}
                      {lot.closed ? <span>{t('parking.closedN', { n: lot.closed })}</span> : null}
                      {lot.unknown ? <span>{t('parking.unknownN', { n: lot.unknown })}</span> : null}
                      {lot.detection === 'entry_exit' ? <span>{t('parking.detection.entry_exit')}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={<CarProfile size={22} />} title={t('parking.empty')} />
      )}

      <div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8125rem] text-ink-2" aria-label={t('parking.legend')}>
          {(
            [
              ['free', 'green'],
              ['occupied', 'neutral'],
              ['unknown', 'yellow'],
              ['closed', 'red'],
            ] as const
          ).map(([k, tone]) => (
            <li key={k} data-tone={tone} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-tone" />
              {t(`parking.legend.${k}`)}
            </li>
          ))}
        </ul>
        <p className="t-meta mt-2">{t('parking.zoomHint')}</p>
        <p className="t-meta mt-1">{t('parking.disclosure')}</p>
      </div>
    </div>
  );
}

/* ── Page ── */

export default function CampusMapPage() {
  const { t, l, locale, rtl } = useI18n();
  const { user } = useSession();
  const dark = useIsDark();
  useTitle(t('map.title'));
  const [params, setParams] = useSearchParams();

  const campuses = useApi<Campus[]>('/campus/map/campuses');
  const config = useApi<{ cartoKey: string | null }>('/config/public');
  const [campusId, setCampusId] = useState<string>(user?.campus_id ?? 'riyadh');
  const campus = campuses.data?.find((c) => c.id === campusId) ?? campuses.data?.[0];
  const locations = useApi<Place[]>('/campus/map/locations', { campus: campusId });
  const places = useMemo(() => locations.data ?? [], [locations.data]);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  const [view, setView] = useState<'directions' | 'parking'>(params.get('view') === 'parking' ? 'parking' : 'directions');
  const [basemap, setBasemap] = useStored<'map' | 'satellite'>('uj.basemap', 'map');
  const [hidden, setHidden] = useState<Set<Category>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mode, setMode] = useState<'walking' | 'accessible'>('walking');
  const [me, setMe] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [about, setAbout] = useState(false);

  // Parking
  const [at, setAt] = useState<number | null>(null);
  const [target, setTarget] = useState<string>('');
  const [focusLot, setFocusLot] = useState<string | null>(null);
  const [bayRef, setBayRef] = useState<{ lotId: string; bayId: string } | null>(null);

  // A link such as /campus/map?to=<room> opens with the route ready: the main gate is the default start.
  const linkTo = params.get('to');
  useEffect(() => {
    if (!linkTo || !places.length) return;
    const dest = byId.get(linkTo);
    if (!dest) return;
    setTo(linkTo);
    setFrom((cur) => cur || places.find((p) => p.kind === 'gate')?.id || '');
    setParams({}, { replace: true });
  }, [linkTo, places, byId, setParams]);

  const route = useApi<Route>(
    from && to && from !== '@me' ? '/campus/map/route' : null,
    from && to && from !== '@me' ? { from, to, mode } : undefined,
  );
  const [pointRoute, setPointRoute] = useState<Route | null>(null);
  useEffect(() => {
    setPointRoute(null);
    if (from !== '@me' || !to || !me) return;
    let live = true;
    api<Route>('/campus/map/route/from-point', { body: { lat: me.lat, lng: me.lng, accuracy: me.accuracy ?? 20, to, mode } })
      .then((r) => live && setPointRoute(r))
      .catch((e) => toast.error(e));
    return () => {
      live = false;
    };
  }, [from, to, me, mode]);
  const activeRoute = from === '@me' ? pointRoute : from && to ? route.data ?? null : null;

  const parking = useApi<Parking>(view === 'parking' ? '/campus/map/parking' : null, view === 'parking' ? { campus: campusId, at: at !== null ? hhmm(at) : undefined, to: target || undefined, bays: 1 } : undefined);
  const lastParking = useRef<Parking | null>(null);
  if (parking.data) lastParking.current = parking.data;
  const parkingData = view === 'parking' ? parking.data ?? lastParking.current : null;

  useEffect(() => {
    if (view !== 'parking' || at !== null) return;
    const id = window.setInterval(() => void parking.reload(), 30000);
    return () => window.clearInterval(id);
  }, [view, at, parking]);

  const next = useApi<{ location: Place | null }>('/campus/map/next-class');
  const targetInit = useRef(false);
  useEffect(() => {
    if (view !== 'parking' || targetInit.current || !next.data) return;
    targetInit.current = true;
    if (next.data.location?.campus_id === campusId) setTarget(next.data.location.id);
  }, [view, next.data, campusId]);

  function locate(thenUse: boolean) {
    const demo = readDemoLocation();
    const done = (pos: { lat: number; lng: number; accuracy?: number }) => {
      setMe(pos);
      if (thenUse) setFrom('@me');
    };
    if (demo) return done(demo);
    if (!('geolocation' in navigator)) return toast.error(t('map.me.lost'));
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => toast.error(t(err.code === err.PERMISSION_DENIED ? 'map.me.denied' : 'map.me.lost')),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  const popular = useMemo(() => places.filter((p) => !p.building_id && !['junction', 'gate', 'parking', 'entrance', 'room'].includes(p.kind) && !p.tags.includes('closed')).slice(0, 9), [places]);
  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const p of places) if (!p.building_id && p.kind !== 'junction') m.set(categoryOf(p), (m.get(categoryOf(p)) ?? 0) + 1);
    return m;
  }, [places]);

  const mapPlaces = useMemo<MapPlace[]>(() => {
    const parkingView = view === 'parking';
    return places
      .filter((p) => p.kind !== 'junction' && (!p.building_id || p.id === selectedId || p.id === to || p.id === from))
      .filter((p) => {
        const cat = categoryOf(p);
        if (p.id === selectedId || p.id === to || p.id === from) return true;
        if (parkingView) return cat !== 'parking' && cat !== 'gates' && cat !== 'academic' ? false : cat === 'academic' && !!p.polygon;
        return !hidden.has(cat) && p.kind !== 'entrance';
      })
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        category: categoryOf(p),
        label: clean(l(p.name_en, p.name_ar)),
        lat: p.lat,
        lng: p.lng,
        polygon: p.polygon,
        badge: p.kind === 'gate' ? p.name_en.match(/Gate\s*(\d+)/i)?.[1] ?? '' : p.kind === 'parking' ? 'P' : undefined,
        named: !!p.polygon && ['building', 'library', 'mosque'].includes(p.kind) && !p.tags.includes('residence') && !p.tags.includes('closed'),
      }));
  }, [places, view, hidden, selectedId, to, from, l]);

  const mapLots = useMemo<MapLot[] | null>(() => {
    if (!parkingData) return null;
    return parkingData.lots.map((lot) => ({
      id: lot.id,
      label: `${clean(l(lot.name_en, lot.name_ar))}: ${t('parking.free', { n: lot.free })}`,
      free: lot.free,
      level: lot.level,
      lat: lot.lat,
      lng: lot.lng,
      polygon: lot.polygon ?? [],
      bays: lot.bays?.map((b) => ({
        id: b.id,
        kind: b.kind,
        status: b.status,
        polygon: b.polygon,
        title: `${t('parking.bay', { n: b.n })} · ${t(`parking.kind.${b.kind}`)} · ${b.status === 'closed' ? t('parking.bay.closed') : t(`parking.bay.${b.status}`, { time: b.since ?? '' })}`,
      })),
    }));
  }, [parkingData, l, t]);

  const selectedBay = useMemo(() => {
    if (!bayRef || !parkingData) return null;
    const lot = parkingData.lots.find((x) => x.id === bayRef.lotId);
    const bay = lot?.bays?.find((b) => b.id === bayRef.bayId);
    return lot && bay ? { lot, bay } : null;
  }, [bayRef, parkingData]);

  const tiles = useMemo(() => {
    const key = config.data?.cartoKey ? `?key=${encodeURIComponent(config.data.cartoKey)}` : '';
    if (basemap === 'satellite') return { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxNativeZoom: 19 };
    return { url: `https://basemaps.cartocdn.com/rastertiles/${dark ? 'dark_all' : 'voyager'}/{z}/{x}/{y}{r}.png${key}`, attribution: TILE_ATTR, maxNativeZoom: 20 };
  }, [basemap, dark, config.data]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const detail = useApi<Place & { rooms: Place[]; upcoming_events: Array<{ id: string; title: string; start_at: string }>; reachable: boolean }>(selected ? `/campus/map/locations/${selected.id}` : null);
  const routeLine = activeRoute?.found ? activeRoute.polyline : null;

  const pickTo = async (value: string) => {
    if (value !== '@next') return setTo(value);
    try {
      const n = await api<{ location: Place | null }>('/campus/map/next-class');
      if (n.location) setTo(n.location.id);
      else toast.info(t('campus.map.noNextClass'));
    } catch (e) {
      toast.error(e);
    }
  };

  if (campuses.error) return <ErrorState error={campuses.error} onRetry={campuses.reload} />;

  return (
    <div data-tone="orange">
      <PageHeader
        title={t('map.title')}
        subtitle={t('map.subtitle')}
        actions={
          <>
            {campuses.data && campuses.data.length > 1 ? (
              <Segmented
                label={t('campus.map.campus')}
                value={campusId}
                onChange={(id) => {
                  setCampusId(id);
                  setFrom('');
                  setTo('');
                  setSelectedId(null);
                  setTarget('');
                }}
                options={[...campuses.data].sort((a, b) => (a.id === 'riyadh' ? -1 : b.id === 'riyadh' ? 1 : 0)).map((c) => ({ value: c.id, label: l(c.city_en, c.city_ar) }))}
              />
            ) : null}
            <Segmented
              label={t('campus.map.tiles')}
              value={basemap}
              onChange={setBasemap}
              options={[
                { value: 'map', label: t('map.basemap.map') },
                { value: 'satellite', label: t('map.basemap.satellite') },
              ]}
            />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[23rem_minmax(0,1fr)] lg:items-start">
        {/* Map first on phones, panel first in reading order on desktop. */}
        <div className="relative order-first lg:order-last">
          <div className="sheet relative isolate h-[56dvh] min-h-80 overflow-hidden lg:sticky lg:top-[calc(var(--topbar-h)+0.75rem)] lg:h-[calc(100dvh-var(--topbar-h)-9.5rem)]">
            {campus ? (
              <Suspense fallback={<div className="skeleton size-full rounded-none!" />}>
                <MapCanvas
                  key={`${campus.id}-${locale}`}
                  className="size-full"
                  boundary={campus.boundary}
                  center={[campus.lat, campus.lng]}
                  zoom={campus.zoom}
                  tiles={tiles}
                  rtl={rtl}
                  places={mapPlaces}
                  selectedId={selectedId}
                  route={view === 'directions' ? routeLine : null}
                  me={me ? [me.lat, me.lng] : null}
                  lots={mapLots}
                  focusLot={focusLot}
                  selectedBay={bayRef?.bayId ?? null}
                  fitSignal={fitSignal}
                  onPlace={setSelectedId}
                  onLot={(id) => setFocusLot(id)}
                  onBay={(lotId, bayId) => setBayRef({ lotId, bayId })}
                />
              </Suspense>
            ) : (
              <div className="skeleton size-full rounded-none!" />
            )}

            {view === 'directions' ? (
              <div className="scroll-x absolute inset-x-0 top-0 z-[400] flex gap-1.5 p-2.5">
                {CATEGORIES.filter((c) => counts.get(c)).map((c) => {
                  const on = !hidden.has(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      data-tone={CATEGORY_TONE[c]}
                      onClick={() =>
                        setHidden((prev) => {
                          const nextSet = new Set(prev);
                          on ? nextSet.add(c) : nextSet.delete(c);
                          return nextSet;
                        })
                      }
                      className={cx(
                        'flex h-8 flex-none items-center gap-1.5 rounded-full border bg-surface px-2.5 text-[0.8125rem] font-semibold shadow-[0_1px_3px_oklch(0.2_0.03_262/0.16)] transition-[opacity,transform] duration-150 active:scale-95',
                        on ? 'border-rule-strong' : 'border-rule text-ink-2 opacity-70',
                      )}
                    >
                      <span className={cx('dot', !on && 'dot-ring')} style={c === 'gates' || c === 'parking' ? { borderRadius: 3, background: on ? 'var(--ink)' : undefined } : undefined} />
                      {t(`map.cat.${c}`)}
                      <span className="num font-medium text-ink-2">{counts.get(c)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="absolute start-2.5 bottom-2.5 z-[400] flex gap-1.5">
              <Button size="sm" onClick={() => setFitSignal((n) => n + 1)} className="shadow-[0_1px_3px_oklch(0.2_0.03_262/0.16)]">
                <ArrowsOutSimple size={14} />
                {t('map.wholeCampus')}
              </Button>
              <Button size="sm" icon onClick={() => locate(false)} aria-label={t('map.me.show')} title={t('map.me.show')} className="shadow-[0_1px_3px_oklch(0.2_0.03_262/0.16)]">
                <Crosshair size={15} />
              </Button>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <Segmented
            label={t('parking.views')}
            value={view}
            onChange={(v) => {
              setView(v);
              setBayRef(null);
            }}
            options={[
              { value: 'directions', label: t('parking.directions'), icon: <Signpost size={15} /> },
              { value: 'parking', label: t('parking.view'), icon: <CarProfile size={15} /> },
            ]}
          />

          {view === 'parking' ? (
            parkingData ? (
              <ParkingPanel
                data={parkingData}
                at={at}
                setAt={setAt}
                target={target}
                setTarget={setTarget}
                places={places}
                onFocus={(id) => setFocusLot(id === focusLot ? `${id}` : id)}
                selectedBay={selectedBay}
                onBayChanged={() => {
                  refreshAll();
                }}
              />
            ) : parking.error ? (
              <ErrorState error={parking.error} onRetry={parking.reload} />
            ) : (
              <SkeletonRows rows={5} />
            )
          ) : (
            <>
              <div className="sheet space-y-3.5 p-4">
                <div className="relative space-y-3">
                  <PlacePicker
                    label={t('campus.map.from')}
                    value={from}
                    onChange={(v) => (v === '@me' ? locate(true) : setFrom(v))}
                    places={places}
                    popular={popular}
                    placeholder={t('map.pickStart')}
                    shortcuts={[{ value: '@me', label: t('map.me.useAsStart'), icon: <Crosshair size={17} /> }]}
                  />
                  <PlacePicker
                    label={t('campus.map.to')}
                    value={to}
                    onChange={(v) => void pickTo(v)}
                    places={places}
                    popular={popular}
                    placeholder={t('map.pickEnd')}
                    shortcuts={next.data?.location ? [{ value: '@next', label: t('campus.map.nextClass'), icon: <GraduationCap size={17} /> }] : undefined}
                  />
                  <Button
                    size="sm"
                    icon
                    variant="secondary"
                    className="absolute end-3 top-[3.6rem] z-10 rounded-full!"
                    aria-label={t('campus.map.swap')}
                    title={t('campus.map.swap')}
                    onClick={() => {
                      setFrom(to);
                      setTo(from === '@me' ? '' : from);
                    }}
                  >
                    <ArrowsDownUp size={14} weight="bold" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Segmented
                    label={t('campus.map.mode')}
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'walking', label: t('campus.map.walking'), icon: <PersonSimpleWalk size={15} /> },
                      { value: 'accessible', label: t('campus.map.accessible'), icon: <Wheelchair size={15} /> },
                    ]}
                  />
                  {from || to ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setFrom('');
                        setTo('');
                      }}
                    >
                      {t('map.closeRoute')}
                    </Button>
                  ) : null}
                </div>
              </div>

              {from && to ? (
                activeRoute ? (
                  activeRoute.found ? (
                    <div className="space-y-4" data-tone="blue">
                      <div className="plate flex items-end justify-between gap-4 px-4.5 py-4">
                        <div>
                          <p className="t-label">{t('campus.map.duration')}</p>
                          <p className="fig mt-1.5 text-[2.5rem]">{fmtDuration(activeRoute.duration_min, locale)}</p>
                        </div>
                        <div className="text-end">
                          <p className="t-label">{t('campus.map.distance')}</p>
                          <p className="fig mt-1.5 text-[1.75rem]">{fmtNumber(activeRoute.distance_m, locale)} m</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {activeRoute.stairsSegments ? (
                          <Chip tone="yellow">
                            <Stairs size={12} weight="bold" />
                            {t('campus.map.stairs')}
                          </Chip>
                        ) : (
                          <Chip tone="green">
                            <Wheelchair size={12} weight="bold" />
                            {t('campus.map.stepFree')}
                          </Chip>
                        )}
                        {activeRoute.unknownAccessibilitySegments ? <Chip variant="outline">{t('campus.map.unknownSegments', { n: activeRoute.unknownAccessibilitySegments })}</Chip> : null}
                      </div>
                      {activeRoute.warnings.map((w) => (
                        <p key={w} className="flex gap-2 rounded-lg bg-yellow-tint px-3 py-2.5 text-yellow-ink">
                          <Warning size={16} weight="fill" className="mt-0.5 flex-none" />
                          {w}
                        </p>
                      ))}
                      <div>
                        <h2 className="t-title mb-3">{t('campus.map.steps')}</h2>
                        <Stops tone="blue">
                          <Stop state="done">
                            <p className="font-semibold">{from === '@me' ? t('map.me.here') : clean(l(byId.get(from)?.name_en ?? '', byId.get(from)?.name_ar))}</p>
                          </Stop>
                          {activeRoute.steps.map((s, i) => {
                            const last = i === activeRoute.steps.length - 1;
                            return (
                              <Stop key={i} state={last ? 'current' : 'done'} last={last}>
                                <p className={last ? 'font-semibold' : undefined}>{l(s.instruction_en, s.instruction_ar)}</p>
                                {last ? <p className="t-meta">{clean(l(byId.get(to)?.name_en ?? '', byId.get(to)?.name_ar))}</p> : null}
                              </Stop>
                            );
                          })}
                        </Stops>
                      </div>
                    </div>
                  ) : (
                    <Empty icon={<NavigationArrow size={22} />} title={t('campus.map.noRoute')} body={activeRoute.reason ?? t('campus.map.unreachable')} />
                  )
                ) : route.error ? (
                  <ErrorState error={route.error} onRetry={route.reload} />
                ) : (
                  <SkeletonRows rows={3} />
                )
              ) : selected ? (
                <div className="sheet p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="t-title">{clean(l(selected.name_en, selected.name_ar))}</h2>
                      <p className="t-meta mt-0.5">
                        {selected.building_id
                          ? `${t('map.inside', { b: l(selected.building_name_en ?? '', selected.building_name_ar) })} · ${selected.floor ? t('map.floorN', { n: selected.floor }) : t('map.ground')}`
                          : t(`map.cat.${categoryOf(selected)}`)}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" icon onClick={() => setSelectedId(null)} aria-label={t('common.close')}>
                      <X size={14} weight="bold" />
                    </Button>
                  </div>
                  {selected.description_en ? <p className="mt-2 text-ink-2">{selected.description_en}</p> : null}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {selected.accessible === 'yes' ? (
                      <Chip tone="green">
                        <Wheelchair size={12} weight="bold" />
                        {t('campus.map.accessibleLabel')}
                      </Chip>
                    ) : null}
                    <Chip variant="outline">
                      {t('campus.map.geometry')}: {t(`campus.map.geometry.${selected.geometry_status}`)}
                    </Chip>
                  </div>
                  {detail.data?.rooms.length ? (
                    <div className="mt-3.5">
                      <p className="t-label mb-1.5">{t('map.roomsHere')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.data.rooms.map((r) => (
                          <button key={r.id} type="button" className="chip chip-outline hover:bg-surface-2" onClick={() => setSelectedId(r.id)}>
                            {clean(l(r.name_en, r.name_ar))}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {detail.data && !detail.data.reachable ? <p className="t-meta mt-3 text-yellow-ink!">{t('campus.map.unreachable')}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={() => setTo(selected.id)}>
                      <NavigationArrow size={14} weight="fill" />
                      {t('map.goHere')}
                    </Button>
                    <Button size="sm" onClick={() => setFrom(selected.id)}>
                      {t('map.startHere')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="t-title mb-2.5 px-0.5">{t('map.popular')}</h2>
                  {locations.data ? (
                    <ul className="sheet rows overflow-hidden">
                      {popular.map((p) => (
                        <li key={p.id}>
                          <button type="button" className="row min-h-11! py-2.5!" onClick={() => setSelectedId(p.id)}>
                            <span data-tone={CATEGORY_TONE[categoryOf(p)]} className="dot" />
                            <span className="min-w-0 flex-1 truncate font-medium">{clean(l(p.name_en, p.name_ar))}</span>
                            <span className="t-meta flex-none">{t(`map.cat.${categoryOf(p)}`)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="sheet">
                      <SkeletonRows rows={5} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <button type="button" className="link inline-flex items-center gap-1.5 text-[0.8125rem]" onClick={() => setAbout(true)}>
            <Info size={15} />
            {t('map.about')}
          </button>
        </div>
      </div>

      <Dialog open={about} onClose={() => setAbout(false)} title={t('map.about')}>
        <div className="prose-sm space-y-3">
          <p>{t('campus.map.subtitle')}</p>
          <p>{t('map.source.annotated')}</p>
          {campus?.source_note ? <p>{campus.source_note}</p> : null}
          <p>
            <span className="font-semibold text-ink">{t('campus.map.disclosure')}: </span>
            {t('campus.map.disclosureBody')}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock size={15} />
            {t('parking.disclosure')}
          </p>
        </div>
      </Dialog>
    </div>
  );
}
