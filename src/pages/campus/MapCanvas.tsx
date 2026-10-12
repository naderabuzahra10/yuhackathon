import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type LatLng = [number, number];

export interface MapPlace {
  id: string;
  kind: string;
  category: string;
  label: string;
  lat: number;
  lng: number;
  polygon: LatLng[] | null;
  badge?: string;
  named?: boolean;
}

export interface MapLot {
  id: string;
  label: string;
  free: number;
  level: 'available' | 'limited' | 'full' | 'no_data';
  lat: number;
  lng: number;
  polygon: LatLng[];
  bays?: Array<{ id: string; kind: string; status: 'free' | 'occupied' | 'unknown' | 'closed'; polygon: LatLng[]; title: string }>;
}

interface Props {
  boundary: LatLng[];
  center: LatLng;
  zoom: number;
  tiles: { url: string; attribution: string; maxNativeZoom: number };
  rtl: boolean;
  places: MapPlace[];
  selectedId: string | null;
  route: LatLng[] | null;
  me: LatLng | null;
  lots: MapLot[] | null;
  focusLot: string | null;
  selectedBay: string | null;
  fitSignal: number;
  onPlace: (id: string) => void;
  onLot: (id: string) => void;
  onBay: (lotId: string, bayId: string) => void;
  className?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Leaflet is driven imperatively; each effect owns one layer and rebuilds only that layer. */
export default function MapCanvas(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ tiles?: L.TileLayer; boundary?: L.Layer; places: L.LayerGroup; route: L.LayerGroup; lots: L.LayerGroup; bays: L.LayerGroup; me: L.LayerGroup } | null>(null);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, zoomSnap: 0.25, attributionControl: true, maxZoom: 21, fadeAnimation: false });
    L.control.zoom({ position: props.rtl ? 'bottomleft' : 'bottomright' }).addTo(m);
    m.attributionControl.setPrefix(false);
    layers.current = {
      lots: L.layerGroup().addTo(m),
      bays: L.layerGroup().addTo(m),
      places: L.layerGroup().addTo(m),
      route: L.layerGroup().addTo(m),
      me: L.layerGroup().addTo(m),
    };
    map.current = m;
    const obs = new ResizeObserver(() => m.invalidateSize());
    obs.observe(el.current!);
    return () => {
      obs.disconnect();
      m.remove();
      map.current = null;
    };
    // The control corner is fixed at creation; a language switch remounts the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current!;
    layers.current!.tiles?.remove();
    layers.current!.tiles = L.tileLayer(props.tiles.url, { attribution: props.tiles.attribution, maxNativeZoom: props.tiles.maxNativeZoom, maxZoom: 21 }).addTo(m);
    layers.current!.tiles.bringToBack();
  }, [props.tiles.url, props.tiles.attribution, props.tiles.maxNativeZoom]);

  const boundaryKey = JSON.stringify(props.boundary);
  useEffect(() => {
    const m = map.current!;
    layers.current!.boundary?.remove();
    if (props.boundary.length >= 3) {
      layers.current!.boundary = L.polygon(props.boundary, { className: 'uj-boundary', interactive: false }).addTo(m);
      m.fitBounds(L.latLngBounds(props.boundary), { padding: [24, 24] });
    } else {
      m.setView(props.center, props.zoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryKey, props.fitSignal]);

  useEffect(() => {
    const group = layers.current!.places;
    group.clearLayers();
    for (const p of props.places) {
      const selected = p.id === props.selectedId;
      if (p.polygon) {
        L.polygon(p.polygon, { className: `uj-area uj-c-${p.category}${selected ? ' uj-area--sel' : ''}` })
          .on('click', () => cb.current.onPlace(p.id))
          .addTo(group);
      }
      const icon = L.divIcon({
        className: 'uj-pin-wrap',
        html: `<span class="uj-pin uj-c-${p.category}${p.badge ? ' uj-pin--badge' : ''}${selected ? ' uj-pin--sel' : ''}">${p.badge ? esc(p.badge) : ''}</span>`,
        iconSize: [0, 0],
      });
      const marker = L.marker([p.lat, p.lng], { icon, title: p.label, keyboard: true, zIndexOffset: selected ? 1000 : 0 }).on('click', () => cb.current.onPlace(p.id));
      if (p.named || selected) marker.bindTooltip(esc(p.label), { permanent: true, direction: 'bottom', offset: [0, 9], className: 'uj-label' });
      marker.addTo(group);
    }
  }, [props.places, props.selectedId]);

  useEffect(() => {
    const group = layers.current!.route;
    group.clearLayers();
    const line = props.route;
    if (!line || line.length < 2) return;
    // A route is drawn as a metro line: a cased track with a station at each end.
    L.polyline(line, { className: 'uj-route-case', interactive: false }).addTo(group);
    L.polyline(line, { className: 'uj-route', interactive: false }).addTo(group);
    const station = (at: LatLng, end: boolean) =>
      L.marker(at, { icon: L.divIcon({ className: 'uj-pin-wrap', html: `<span class="uj-stop${end ? ' uj-stop--end' : ''}"></span>`, iconSize: [0, 0] }), interactive: false, zIndexOffset: 2000 }).addTo(group);
    station(line[0], false);
    station(line[line.length - 1], true);
    map.current!.fitBounds(L.latLngBounds(line), { padding: [56, 56], maxZoom: 19 });
  }, [props.route]);

  useEffect(() => {
    const group = layers.current!.me;
    group.clearLayers();
    if (props.me) L.marker(props.me, { icon: L.divIcon({ className: 'uj-pin-wrap', html: '<span class="uj-me"></span>', iconSize: [0, 0] }), interactive: false, zIndexOffset: 3000 }).addTo(group);
  }, [props.me]);

  useEffect(() => {
    const m = map.current!;
    const lotGroup = layers.current!.lots;
    const bayGroup = layers.current!.bays;
    const draw = () => {
      lotGroup.clearLayers();
      bayGroup.clearLayers();
      const lots = cb.current.lots;
      if (!lots) return;
      const showBays = m.getZoom() >= 18.5;
      for (const lot of lots) {
        if (lot.polygon.length < 3) continue;
        L.polygon(lot.polygon, { className: `uj-lot uj-lvl-${lot.level}${showBays && lot.bays?.length ? ' uj-lot--open' : ''}` })
          .on('click', () => cb.current.onLot(lot.id))
          .addTo(lotGroup);
        L.marker([lot.lat, lot.lng], {
          icon: L.divIcon({ className: 'uj-pin-wrap', html: `<span class="uj-park uj-lvl-${lot.level}"><b>P</b>${lot.free}</span>`, iconSize: [0, 0] }),
          title: lot.label,
          zIndexOffset: 500,
        })
          .on('click', () => cb.current.onLot(lot.id))
          .addTo(lotGroup);
        if (showBays) {
          for (const bay of lot.bays ?? []) {
            L.polygon(bay.polygon, { className: `uj-bay uj-bay--${bay.status}${bay.kind === 'disabled' ? ' uj-bay--acc' : ''}${bay.id === cb.current.selectedBay ? ' uj-bay--sel' : ''}` })
              .bindTooltip(esc(bay.title), { direction: 'top', className: 'uj-label' })
              .on('click', () => cb.current.onBay(lot.id, bay.id))
              .addTo(bayGroup);
          }
        }
      }
    };
    draw();
    m.on('zoomend', draw);
    return () => {
      m.off('zoomend', draw);
    };
  }, [props.lots, props.selectedBay]);

  useEffect(() => {
    const lot = props.lots?.find((x) => x.id === props.focusLot);
    if (lot && lot.polygon.length) map.current!.fitBounds(L.latLngBounds(lot.polygon), { padding: [70, 70], maxZoom: 20 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusLot]);

  useEffect(() => {
    const p = props.places.find((x) => x.id === props.selectedId);
    if (p && !props.route) map.current!.panTo([p.lat, p.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId]);

  return <div ref={el} className={props.className} />;
}
