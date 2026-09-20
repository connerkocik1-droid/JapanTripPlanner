'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { LngLatBoundsLike, Map as MlMap, Marker } from 'maplibre-gl';
import { LatLng } from '@/lib/data';
import { boundsOf, routeLine, toLngLat } from '@/lib/geo';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const PLACE_LAYER = /city|town|village|suburb|quarter|hamlet|neighbourhood|country|state|province|region/i;

export interface MapPin {
  id: string;
  name: string;
  /** Second line, shown on the selected pin only. */
  sub: string;
  ll: LatLng;
  selected: boolean;
  kind: 'city' | 'hotel' | 'place';
  /** Position in the planned day, when this pin is a stop. */
  stopNumber?: number;
  /** Place category, for the marker glyph. */
  icon?: string;
}

/** One routed hop of the planned day, drawn on the map. */
export interface MapLeg {
  id: string;
  mode: 'walk' | 'transit' | 'bike';
  geometry: [number, number][];
}

export interface MapFocus {
  ll: LatLng;
  zoom: number;
  /** Bumped on every request so repeat taps on the same place re-fly. */
  nonce: number;
}

export interface TripMapProps {
  pins: MapPin[];
  /** City coordinates in trip order — the route is drawn through these. */
  route: LatLng[];
  /** Routed legs of the day being planned; empty on the other tabs. */
  legs: MapLeg[];
  /** Fit the map to these points when the nonce changes. */
  fit: { points: LatLng[]; nonce: number } | null;
  /** Pixels of map covered by the bottom sheet. */
  sheetPx: number;
  focus: MapFocus | null;
  onSelect: (id: string) => void;
}

export default function TripMap({ pins, route, legs, fit, sheetPx, focus, onSelect }: TripMapProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const bounds = useRef<LngLatBoundsLike | null>(null);
  const ready = useRef(false);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef({ w: 0, h: 0 });

  const latest = useRef({ pins, route, legs, sheetPx, onSelect });
  latest.current = { pins, route, legs, sheetPx, onSelect };

  /** Frame the whole route, leaving the header and the sheet uncovered. */
  const frameTrip = (duration = 800) => {
    const m = map.current;
    if (!m || !bounds.current) return;
    const H = holder.current?.clientHeight ?? 874;
    const top = Math.min(190, Math.round(H * 0.18));
    const bottom = Math.max(40, Math.min(latest.current.sheetPx + 24, H - top - 220));
    // Padding passed to flyTo persists on the transform and would stack onto
    // the next fitBounds — zero it first and express offsets explicitly.
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    m.fitBounds(bounds.current, { padding: { top, bottom, left: 56, right: 56 }, duration, maxZoom: 12 });
  };

  useEffect(() => {
    if (map.current || !holder.current) return;
    const m = new maplibregl.Map({
      container: holder.current,
      style: STYLE_URL,
      attributionControl: false,
      center: [10, 25],
      zoom: 1.4,
    });
    map.current = m;

    m.on('load', () => {
      ready.current = true;
      m.resize();

      // OSM vector tiles carry local-script names; force the English/latin field.
      m.getStyle().layers.forEach((layer) => {
        if (layer.type !== 'symbol') return;
        try {
          if (m.getLayoutProperty(layer.id, 'text-field') === undefined) return;
          m.setLayoutProperty(layer.id, 'text-field', [
            'coalesce',
            ['get', 'name:en'],
            ['get', 'name:latin'],
            ['get', 'name_en'],
            ['get', 'name'],
          ]);
          if (PLACE_LAYER.test(layer.id)) m.setLayerZoomRange(layer.id, 5, 24);
        } catch {
          /* layers vary between style versions — skip the ones that don't take it */
        }
      });

      const empty: GeoJSON.Feature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      };
      (['route-main', 'route-pulse'] as const).forEach((id, i) => {
        m.addSource(id, { type: 'geojson', data: empty });
        m.addLayer({
          id,
          type: 'line',
          source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': i ? '#d2cefd' : '#9184d9',
            'line-width': 2.2,
            ...(i ? { 'line-dasharray': [0, 4] } : {}),
          },
        });
      });

      // Planned-day legs: walking dashed, transit solid, drawn above the route.
      m.addSource('day-legs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: 'day-walk',
        type: 'line',
        source: 'day-legs',
        filter: ['!=', ['get', 'mode'], 'transit'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#b5abfc', 'line-width': 3.2, 'line-dasharray': [1.6, 1.6] },
      });
      m.addLayer({
        id: 'day-transit',
        type: 'line',
        source: 'day-legs',
        filter: ['==', ['get', 'mode'], 'transit'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#58c8d8', 'line-width': 3.6 },
      });

      // A light dash crawling the route.
      let phase = 0;
      const pulse = setInterval(() => {
        if (!m.getLayer('route-pulse')) return;
        phase = (phase + 1) % 8;
        m.setPaintProperty('route-pulse', 'line-dasharray', [0, phase, 2, 8 - phase]);
      }, 110);
      m.once('remove', () => clearInterval(pulse));

      sync();
      frameTrip(0);
    });

    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
      map.current?.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Rebuild the route and the markers from the current pins. */
  const sync = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const { pins: ps, route: rt } = latest.current;

    const line = rt.length > 1 ? routeLine(rt) : [];
    (['route-main', 'route-pulse'] as const).forEach((id) => {
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } });
    });

    const legSrc = m.getSource('day-legs') as maplibregl.GeoJSONSource | undefined;
    legSrc?.setData({
      type: 'FeatureCollection',
      features: latest.current.legs
        .filter((l) => l.geometry.length > 1)
        .map((l) => ({
          type: 'Feature' as const,
          properties: { mode: l.mode },
          geometry: { type: 'LineString' as const, coordinates: l.geometry },
        })),
    });

    const seen = new Set(ps.map((p) => p.id));
    Object.keys(markers.current).forEach((id) => {
      if (!seen.has(id)) {
        markers.current[id].remove();
        delete markers.current[id];
      }
    });

    ps.forEach((p) => {
      let mk = markers.current[p.id];
      if (!mk) {
        const el = document.createElement('div');
        el.className = 'trip-pin';
        el.style.width = '80px';
        el.style.textAlign = 'center';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          latest.current.onSelect(p.id);
        });
        mk = new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, -7] })
          .setLngLat(toLngLat(p.ll))
          .addTo(m);
        markers.current[p.id] = mk;
      } else {
        mk.setLngLat(toLngLat(p.ll));
      }
      const el = mk.getElement();
      // Toggle only the state classes — reassigning className loses MapLibre's own.
      el.classList.toggle('is-sel', p.selected);
      el.classList.toggle('is-sub', p.kind !== 'city');
      el.style.zIndex = p.selected ? '500' : p.kind === 'city' ? '400' : '300';
      el.classList.toggle('is-stop', p.stopNumber !== undefined);
      const dot = p.stopNumber !== undefined
        ? `<span class="tp-dot tp-num">${p.stopNumber}</span>`
        : p.icon
          ? `<span class="tp-dot tp-icon"><i class="ph ${p.icon}"></i></span>`
          : '<span class="tp-dot"></span>';
      el.innerHTML =
        '<span class="tp-ret"></span>' + dot +
        '<span class="tp-label"><span class="tp-name"></span><span class="tp-sub"></span></span>';
      const name = el.querySelector('.tp-name');
      const sub = el.querySelector('.tp-sub');
      if (name) name.textContent = p.name;
      if (sub) sub.textContent = p.selected || p.stopNumber !== undefined ? p.sub : '';
    });

    const coords = ps.map((p) => toLngLat(p.ll));
    bounds.current = coords.length ? (boundsOf(coords) as LngLatBoundsLike) : null;
  };

  useEffect(() => {
    sync();
    if (!focus) frameTrip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pins), JSON.stringify(route), JSON.stringify(legs.map((l) => l.id + l.mode + l.geometry.length))]);

  /** Fit a specific set of points — "zoom to day". */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !fit || fit.points.length === 0) return;
    if (stepTimer.current) clearTimeout(stepTimer.current);
    const coords = fit.points.map(toLngLat);
    const H = holder.current?.clientHeight ?? 874;
    const top = Math.min(150, Math.round(H * 0.16));
    const bottom = Math.max(40, Math.min(latest.current.sheetPx + 24, H - top - 200));
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    if (coords.length === 1) {
      m.easeTo({ center: coords[0], zoom: 15, offset: [0, -Math.round(bottom / 2)], duration: 900 });
      return;
    }
    m.fitBounds(boundsOf(coords) as LngLatBoundsLike, {
      padding: { top, bottom, left: 48, right: 48 },
      duration: 900,
      maxZoom: 16,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit?.nonce]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    if (stepTimer.current) clearTimeout(stepTimer.current);

    if (!focus) {
      frameTrip();
      return;
    }
    // Two-stage descent: an out-and-in arc, then a step down to block level.
    const H = holder.current?.clientHeight ?? 874;
    const offsetY = -Math.round(Math.min(latest.current.sheetPx, H * 0.42) / 2);
    const center = toLngLat(focus.ll);
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    m.flyTo({
      center,
      zoom: Math.max(9, focus.zoom - 3.5),
      offset: [0, offsetY],
      duration: 900,
      curve: 1.6,
      essential: true,
    });
    stepTimer.current = setTimeout(() => {
      m.easeTo({ center, zoom: focus.zoom, offset: [0, offsetY], duration: 1100, essential: true });
    }, 950);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, focus === null]);

  // Resize only on a real box change — an unconditional resize cancels
  // any in-flight camera animation.
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === box.current.w && h === box.current.h) return;
      box.current = { w, h };
      map.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="map-holder">
      <div ref={holder} className="map-canvas" />
      <div className="map-tint" />
      <div className="map-glow" />
      <div className="map-sweep" />
      <div className="map-attrib">© OpenStreetMap contributors</div>
    </div>
  );
}
