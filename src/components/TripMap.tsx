'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { LngLatBoundsLike, Map as MlMap, Marker } from 'maplibre-gl';
import { AUSTIN, LABEL_OFFSET, LatLng } from '@/lib/data';
import { boundsOf, routeLine, stub, toLngLat } from '@/lib/geo';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** Trip-city names (English + local script) the basemap should not repeat. */
const SUPPRESS = ['Seoul', 'Osaka', 'Kyoto', 'Tokyo', '서울', '大阪', '京都', '東京'];
const PLACE_LAYER = /city|town|village|suburb|quarter|hamlet|neighbourhood|country|state|province|region/i;

export interface MapFocus {
  ll: LatLng;
  zoom: number;
  /** Bumped on every request so repeat taps on the same place re-fly. */
  nonce: number;
}

export interface TripMapProps {
  order: string[];
  places: Record<string, LatLng>;
  selected: string;
  subs: Record<string, string>;
  /** Pixels of map covered by the bottom sheet. */
  sheetPx: number;
  focus: MapFocus | null;
  onSelect: (city: string) => void;
}

export default function TripMap({ order, places, selected, subs, sheetPx, focus, onSelect }: TripMapProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const bounds = useRef<LngLatBoundsLike | null>(null);
  const ready = useRef(false);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef({ w: 0, h: 0 });

  // Latest values for callbacks that outlive a render.
  const latest = useRef({ order, places, selected, subs, sheetPx, onSelect });
  latest.current = { order, places, selected, subs, sheetPx, onSelect };

  const coordsOf = (list: string[], src: Record<string, LatLng>): LatLng[] =>
    list.map((c) => src[c]).filter((p): p is LatLng => !!p);

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
    m.fitBounds(bounds.current, { padding: { top, bottom, left: 56, right: 56 }, duration });
  };

  // --- init ---------------------------------------------------------------
  useEffect(() => {
    if (map.current || !holder.current) return;
    const m = new maplibregl.Map({
      container: holder.current,
      style: STYLE_URL,
      attributionControl: false,
      center: [133, 35.5],
      zoom: 4,
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
          // The app labels the trip cities itself — drop the basemap's duplicates.
          m.setFilter(layer.id, [
            'all',
            ['!in', ['coalesce', ['get', 'name:en'], ['get', 'name'], ''], ['literal', SUPPRESS]],
          ] as never);
          if (PLACE_LAYER.test(layer.id)) m.setLayerZoomRange(layer.id, 7, 24);
        } catch {
          /* layers vary between style versions — skip the ones that don't take it */
        }
      });

      const line = (id: string, data: GeoJSON.Feature, color: string, width: number, dash?: number[]) => {
        m.addSource(id, { type: 'geojson', data });
        m.addLayer({
          id,
          type: 'line',
          source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': color,
            'line-width': width,
            ...(dash ? { 'line-dasharray': dash } : {}),
          },
        });
      };

      const feat = (coords: [number, number][]): GeoJSON.Feature => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      });

      const pts = coordsOf(latest.current.order, latest.current.places);
      line('route-main', feat(routeLine(pts)), '#9184d9', 2.2);
      line('route-pulse', feat(routeLine(pts)), '#d2cefd', 2.2, [0, 4]);
      if (pts.length) {
        line('route-in', feat(stub(pts[0], AUSTIN)), '#6d5fc0', 1.6, [2, 2]);
        line('route-out', feat(stub(pts[pts.length - 1], AUSTIN)), '#6d5fc0', 1.6, [2, 2]);
      }

      // A light dash crawling the route.
      let phase = 0;
      const pulse = setInterval(() => {
        if (!m.getLayer('route-pulse')) return;
        phase = (phase + 1) % 8;
        m.setPaintProperty('route-pulse', 'line-dasharray', [0, phase, 2, 8 - phase]);
      }, 110);
      m.once('remove', () => clearInterval(pulse));

      syncGeometry();
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

  // --- route + markers ----------------------------------------------------
  const syncGeometry = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const { order: ord, places: pl, selected: sel, subs: sb } = latest.current;
    const pts = coordsOf(ord, pl);
    const coords = pts.map(toLngLat);

    const setLine = (id: string, c: [number, number][]) => {
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } });
    };
    setLine('route-main', routeLine(pts));
    setLine('route-pulse', routeLine(pts));
    if (pts.length) {
      setLine('route-in', stub(pts[0], AUSTIN));
      setLine('route-out', stub(pts[pts.length - 1], AUSTIN));
    }

    bounds.current = coords.length > 1 ? (boundsOf(coords) as LngLatBoundsLike) : null;

    // Drop markers for cities no longer on the route.
    Object.keys(markers.current).forEach((c) => {
      if (!ord.includes(c) || !pl[c]) {
        markers.current[c].remove();
        delete markers.current[c];
      }
    });

    ord.forEach((c) => {
      const ll = pl[c];
      if (!ll) return;
      let mk = markers.current[c];
      if (!mk) {
        const el = document.createElement('div');
        el.className = 'trip-pin';
        el.style.width = '80px';
        el.style.textAlign = 'center';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          latest.current.onSelect(c);
        });
        mk = new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, -7] })
          .setLngLat(toLngLat(ll))
          .addTo(m);
        markers.current[c] = mk;
      } else {
        mk.setLngLat(toLngLat(ll));
      }
      const el = mk.getElement();
      const on = sel === c;
      // Toggle only the state class — reassigning className loses MapLibre's own.
      el.classList.toggle('is-sel', on);
      el.style.zIndex = on ? '500' : '400';
      const off = LABEL_OFFSET[c] ?? [0, 0];
      el.innerHTML =
        '<span class="tp-ret"></span><span class="tp-dot"></span>' +
        `<span class="tp-label" style="position:relative;display:block;left:${off[0]}px;top:${off[1]}px">` +
        `<span class="tp-name">${c}</span>` +
        (on && sb[c] ? `<span class="tp-sub">${sb[c]}</span>` : '') +
        '</span>';
    });
  };

  useEffect(() => {
    syncGeometry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.join('|'), selected, JSON.stringify(subs), JSON.stringify(places)]);

  // --- camera -------------------------------------------------------------
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
      zoom: Math.max(11, focus.zoom - 3.5),
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
