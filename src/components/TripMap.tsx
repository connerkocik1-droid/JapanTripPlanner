'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import maplibregl, { LngLatBoundsLike, Map as MlMap, Marker } from 'maplibre-gl';
import { LatLng } from '@/lib/data';
import { money } from '@/lib/format';
import { RouteStop, boundsOf, routeSegments, toLngLat } from '@/lib/geo';
import { LEG_STYLE, LegKind } from '@/lib/legKind';

// Point this at your own tiles to run without the public OpenFreeMap instance.
const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron';
const PLACE_LAYER = /city|town|village|suburb|quarter|hamlet|neighbourhood|country|state|province|region/i;

/** What the hotel mini-card shows, carried on the pin that opens it. */
export interface HotelDetail {
  /** The city this option is in — what an activation is applied to. */
  cityId: string;
  city: string;
  /** Rate for one night; 0 when nothing has been entered yet. */
  nightly: number;
  nights: number;
  /** Nightly times the nights of this city's stay. */
  total: number;
  overview: string;
  images: string[];
  url: string;
  /** True for the option currently feeding the budget. */
  pick: boolean;
}

/** What the mini-card on a pinned place shows. */
export interface PlaceDetail {
  /** "Eat", "Do" — what kind of place this is. */
  kindLabel: string;
  /** The colour this kind is drawn in, shared by the pin and the card. */
  color: string;
  /** Rating or price band, as typed: "4.7★", "$$". */
  band: string;
  note: string;
  images: string[];
  url: string;
}

export interface MapPin {
  id: string;
  name: string;
  /** Second line, shown on the selected pin only. */
  sub: string;
  ll: LatLng;
  selected: boolean;
  kind: 'city' | 'hotel' | 'place' | 'airport';
  /** Position in the planned day, when this pin is a stop. */
  stopNumber?: number;
  /** Place category, for the marker glyph. */
  icon?: string;
  /** Present on hotel pins — hovering or tapping one opens this card. */
  hotel?: HotelDetail;
  /** Present on place pins — hovering or tapping one opens this card. */
  place?: PlaceDetail;
}

/** One routed hop of the planned day, drawn on the map in its own colour. */
export interface MapLeg {
  id: string;
  kind: LegKind;
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
  /** Cities in trip order, each carrying how the leg into it is travelled. */
  route: RouteStop[];
  /** Routed legs of the day being planned; empty on the other tabs. */
  legs: MapLeg[];
  /** Fit the map to these points when the nonce changes. */
  fit: { points: LatLng[]; nonce: number } | null;
  /** Pixels of map covered by the bottom sheet. */
  sheetPx: number;
  /**
   * Pixels of map covered by the plan builder, which floats over it rather
   * than pushing it up. Only the mini-card reads this: framing the trip around
   * it would move the camera every time a hover routed something, which is the
   * opposite of what hovering is for.
   */
  overlayPx: number;
  focus: MapFocus | null;
  onSelect: (id: string) => void;
  /**
   * The pointer came to rest on a pinned place. Routing it is the caller's
   * business; the map only reports what is under the cursor.
   */
  onHoverPlace: (id: string) => void;
  /** Drop a place from the trip, from the card that opened over its pin. */
  onRemovePlace: (id: string) => void;
  /** Make this option the one the budget counts, or clear it with null. */
  onActivateHotel: (cityId: string, hotelId: string | null) => void;
}

export default function TripMap({
  pins, route, legs, fit, sheetPx, overlayPx, focus, onSelect, onHoverPlace, onRemovePlace, onActivateHotel,
}: TripMapProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const bounds = useRef<LngLatBoundsLike | null>(null);
  const ready = useRef(false);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef({ w: 0, h: 0 });

  const latest = useRef({ pins, route, legs, sheetPx, overlayPx, onSelect, onHoverPlace, onActivateHotel });
  latest.current = { pins, route, legs, sheetPx, overlayPx, onSelect, onHoverPlace, onActivateHotel };

  // The mini-card, for a hotel or a pinned place. `sticky` is set by a tap and
  // survives the pointer leaving; a hover-opened card closes as the pointer does.
  const [card, setCard] = useState<{ id: string; sticky: boolean } | null>(null);
  const cardBox = useRef<HTMLDivElement | null>(null);
  const cardId = useRef<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  cardId.current = card?.id ?? null;
  const cardPin = card ? pins.find((p) => p.id === card.id) ?? null : null;
  // Narrowed once, so the card's callbacks can reach the payload.
  const cardHotel = cardPin?.hotel ? { pin: cardPin, hotel: cardPin.hotel } : null;
  const cardPlace = cardPin?.place ? { pin: cardPin, place: cardPin.place } : null;

  const holdCard = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  /** Hover opens; a tap on the same pin closes what the tap opened. */
  const hoverCard = (id: string) => {
    holdCard();
    setCard((cur) => (cur && cur.id === id ? cur : { id, sticky: false }));
  };
  const tapCard = (id: string) => {
    holdCard();
    setCard((cur) => (cur && cur.id === id && cur.sticky ? null : { id, sticky: true }));
  };
  const closeCard = () => {
    holdCard();
    setCard(null);
  };
  /** A short grace period so the pointer can travel from the pin to the card. */
  const closeSoon = () => {
    holdCard();
    hideTimer.current = setTimeout(() => setCard((cur) => (cur?.sticky ? cur : null)), 160);
  };

  /**
   * Park the card over its pin: above it by preference, below it when the
   * header would cover it, and clamped into the band of map the header and the
   * bottom sheet leave uncovered so it is never half-hidden behind the chrome.
   */
  const placeCard = () => {
    const m = map.current;
    const el = cardBox.current;
    const id = cardId.current;
    if (!m || !el || !id) return;
    const pin = latest.current.pins.find((p) => p.id === id);
    if (!pin) return;
    const pt = m.project(toLngLat(pin.ll));
    const w = holder.current?.clientWidth ?? 0;
    const h = holder.current?.clientHeight ?? 0;
    const cardW = el.offsetWidth;
    const cardH = el.offsetHeight;
    const ceiling = Math.min(150, Math.round(h * 0.17)) + 8;
    const covered = Math.max(latest.current.sheetPx, latest.current.overlayPx);
    const floor = h - Math.min(covered, Math.round(h * 0.6)) - 8;

    let top = pt.y - 22 - cardH;
    if (top < ceiling) top = pt.y + 30;
    top = Math.min(top, Math.max(ceiling, floor - cardH));
    top = Math.max(top, ceiling);

    el.style.left = Math.round(Math.max(cardW / 2 + 10, Math.min(pt.x, w - cardW / 2 - 10))) + 'px';
    el.style.top = Math.round(top) + 'px';
  };
  const reposition = useRef(placeCard);
  reposition.current = placeCard;

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

      const blank: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

      /*
       * Both the trip route and the day's legs are drawn the same way: one
       * source of coloured features, a solid layer and a dashed one filtered
       * apart, because `line-dasharray` cannot be driven by the data the way
       * `line-color` can. A pale casing underneath keeps every colour legible
       * on a light basemap.
       */
      ([
        ['route', 2.4, 5.4],
        ['day', 3.6, 7],
      ] as const).forEach(([group, width, casing]) => {
        m.addSource(group + '-legs', { type: 'geojson', data: blank });
        m.addLayer({
          id: group + '-casing',
          type: 'line',
          source: group + '-legs',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': casing, 'line-opacity': 0.75 },
        });
        m.addLayer({
          id: group + '-solid',
          type: 'line',
          source: group + '-legs',
          filter: ['!=', ['get', 'dashed'], true],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': width },
        });
        m.addLayer({
          id: group + '-dash',
          type: 'line',
          source: group + '-legs',
          // Flights and walks are chopped: neither follows anything on the ground.
          filter: ['==', ['get', 'dashed'], true],
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': width, 'line-dasharray': [2.2, 2] },
        });
      });

      m.addSource('route-pulse', { type: 'geojson', data: blank });
      m.addLayer({
        id: 'route-pulse',
        type: 'line',
        source: 'route-pulse',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 2.2, 'line-dasharray': [0, 4], 'line-opacity': 0.9 },
      });

      // A light dash crawling the route.
      let phase = 0;
      const pulse = setInterval(() => {
        if (!m.getLayer('route-pulse')) return;
        phase = (phase + 1) % 8;
        m.setPaintProperty('route-pulse', 'line-dasharray', [0, phase, 2, 8 - phase]);
      }, 110);
      m.once('remove', () => clearInterval(pulse));

      m.on('move', () => reposition.current());

      sync();
      frameTrip(0);
    });

    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
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

    // City to city, densified along the great circle and coloured by how you travel.
    const routeData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: routeSegments(rt).map((seg) => ({
        type: 'Feature' as const,
        properties: { color: LEG_STYLE[seg.kind].color, dashed: LEG_STYLE[seg.kind].dashed },
        geometry: { type: 'LineString' as const, coordinates: seg.line },
      })),
    };
    (['route-legs', 'route-pulse'] as const).forEach((id) => {
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      src?.setData(routeData);
    });

    const legSrc = m.getSource('day-legs') as maplibregl.GeoJSONSource | undefined;
    legSrc?.setData({
      type: 'FeatureCollection',
      features: latest.current.legs
        .filter((l) => l.geometry.length > 1)
        .map((l) => ({
          type: 'Feature' as const,
          properties: { color: LEG_STYLE[l.kind].color, dashed: LEG_STYLE[l.kind].dashed },
          geometry: { type: 'LineString' as const, coordinates: l.geometry },
        })),
    });

    const seen = new Set(ps.map((p) => p.id));
    if (cardId.current && !seen.has(cardId.current)) setCard(null);
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
        const self = () => latest.current.pins.find((q) => q.id === p.id);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const me = self();
          // A hotel pin opens its card instead of steering the bottom sheet.
          if (me?.hotel) {
            tapCard(p.id);
            return;
          }
          // A place opens its card and asks for its route in the same tap,
          // which is the only way a phone gets what a hover gets.
          if (me?.place) tapCard(p.id);
          latest.current.onSelect(p.id);
        });
        el.addEventListener('mouseenter', () => {
          const me = self();
          if (!me?.hotel && !me?.place) return;
          hoverCard(p.id);
          // Resting on a place routes it, so the way there is drawn without
          // having to commit to anything.
          if (me.place) latest.current.onHoverPlace(p.id);
        });
        el.addEventListener('mouseleave', () => {
          // The card follows the pointer away; the route it drew does not, so
          // there is something left to look at.
          if (self()?.hotel || self()?.place) closeSoon();
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
      el.classList.toggle('is-hotel', p.kind === 'hotel');
      el.classList.toggle('is-airport', p.kind === 'airport');
      el.classList.toggle('is-pick', p.kind === 'hotel' && !!p.hotel?.pick);
      el.classList.toggle('is-open', cardId.current === p.id);
      el.classList.toggle('is-place', p.kind === 'place');
      // Hotels are purple whatever else they are, so the lodging options read
      // as one set at a glance; the budgeted one is the brighter of them.
      const hotelDot = p.kind === 'hotel' ? ' tp-hotel' + (p.hotel?.pick ? ' is-pick' : '') : '';
      // A place is drawn in its kind's colour — restaurants red — so a city's
      // hundred pins sort themselves out before you read a single label.
      const placeDot = p.place ? ' tp-place' : '';
      if (p.place) el.style.setProperty('--pin', p.place.color);
      else el.style.removeProperty('--pin');
      // Airports are the blue of a flight leg — the same colour arrives twice.
      const airportDot = p.kind === 'airport' ? ' tp-airport' : '';
      const extra = hotelDot + placeDot + airportDot;
      const dot = p.stopNumber !== undefined
        ? `<span class="tp-dot tp-num${extra}">${p.stopNumber}</span>`
        : p.icon
          ? `<span class="tp-dot tp-icon${extra}"><i class="ph ${p.icon}"></i></span>`
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
  }, [JSON.stringify(pins), JSON.stringify(route), JSON.stringify(legs.map((l) => l.id + l.kind + l.geometry.length))]);

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

  useLayoutEffect(() => {
    Object.entries(markers.current).forEach(([id, mk]) => {
      mk.getElement().classList.toggle('is-open', id === card?.id);
    });
    placeCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    card?.id, cardPin?.ll[0], cardPin?.ll[1],
    cardPin?.hotel?.images.length, cardPin?.place?.images.length, sheetPx, overlayPx,
  ]);

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
      {cardHotel ? (
        <HotelMiniCard
          ref={cardBox}
          pin={cardHotel.pin}
          hotel={cardHotel.hotel}
          onHold={holdCard}
          onLeave={closeSoon}
          onClose={closeCard}
          onActivate={() =>
            onActivateHotel(
              cardHotel.hotel.cityId,
              cardHotel.hotel.pick ? null : cardHotel.pin.id,
            )
          }
        />
      ) : null}
      {cardPlace ? (
        <PlaceMiniCard
          ref={cardBox}
          pin={cardPlace.pin}
          place={cardPlace.place}
          onHold={holdCard}
          onLeave={closeSoon}
          onClose={closeCard}
          onRemove={() => {
            closeCard();
            onRemovePlace(cardPlace.pin.id);
          }}
        />
      ) : null}
      <div className="map-attrib">© OpenStreetMap contributors</div>
    </div>
  );
}

/**
 * The hotel mini-card: what an option costs, what it is, and what it looks
 * like, without leaving the map. Missing photos or a missing price just drop
 * their row rather than leaving a gap.
 */
const HotelMiniCard = forwardRef<
  HTMLDivElement,
  {
    pin: MapPin;
    hotel: HotelDetail;
    onHold: () => void;
    onLeave: () => void;
    onClose: () => void;
    onActivate: () => void;
  }
>(function HotelMiniCard({ pin, hotel, onHold, onLeave, onClose, onActivate }, ref) {
  const shots = hotel.images.filter((src) => src.trim());
  return (
    <div
      ref={ref}
      className="hotel-card"
      role="dialog"
      aria-label={pin.name + ' details'}
      onMouseEnter={onHold}
      onMouseLeave={onLeave}
    >
      <div className="hc-head">
        <span className="hc-title">
          {pin.name}
          {hotel.pick ? <span className="mono hc-tag">Budgeted</span> : null}
        </span>
        <button className="tap hc-x" onClick={onClose} aria-label="Close">
          <i className="ph ph-x" />
        </button>
      </div>
      <div className="mono hc-where">{hotel.city}</div>

      <div className="hc-rates">
        <div>
          <div className="mono hc-k">Per night</div>
          <div className="num hc-v">{money(hotel.nightly)}</div>
        </div>
        <div>
          <div className="mono hc-k">{hotel.nights} {hotel.nights === 1 ? 'night' : 'nights'}</div>
          <div className="num hc-v hc-total">{money(hotel.total)}</div>
        </div>
      </div>

      {shots.length ? (
        <div className="hc-shots">
          {shots.map((src, i) => (
            // A dead URL shouldn't leave a broken-image box on the map.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src + i}
              src={src}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ))}
        </div>
      ) : null}

      <p className="hc-note">{hotel.overview.trim() || 'No overview yet.'}</p>

      <div className="hc-actions">
        <button
          className={'tap hc-pick' + (hotel.pick ? ' is-on' : '')}
          aria-pressed={hotel.pick}
          onClick={onActivate}
        >
          <i className={hotel.pick ? 'ph-fill ph-check-circle' : 'ph ph-circle'} />
          {hotel.pick ? 'Active' : 'Set active'}
        </button>
        {hotel.url ? (
          <a className="mono hc-link" href={hotel.url} target="_blank" rel="noopener noreferrer">
            Listing ↗
          </a>
        ) : null}
      </div>
    </div>
  );
});

/**
 * The place mini-card: what somewhere is, what it looks like, and how it was
 * rated, without leaving the map. The route to it is drawn on the map and
 * priced in the plan builder at the same moment, so nothing here repeats it.
 *
 * Every place gets a picture. A photo the travelers pasted is used when there
 * is one; otherwise the card draws its own, from the place's name and kind, so
 * a shortlist of forty restaurants still reads as a shortlist of places rather
 * than a list of empty boxes.
 */
const PlaceMiniCard = forwardRef<
  HTMLDivElement,
  {
    pin: MapPin;
    place: PlaceDetail;
    onHold: () => void;
    onLeave: () => void;
    onClose: () => void;
    onRemove: () => void;
  }
>(function PlaceMiniCard({ pin, place, onHold, onLeave, onClose, onRemove }, ref) {
  const shot = place.images.find((src) => src.trim()) ?? '';
  const [broken, setBroken] = useState(false);
  // Removing takes two taps. The card opens under a finger on a phone, and a
  // place dropped by accident is one you have to remember you had.
  const [armed, setArmed] = useState(false);
  return (
    <div
      ref={ref}
      className="hotel-card place-card"
      style={{ ['--pin' as string]: place.color }}
      role="dialog"
      aria-label={pin.name + ' details'}
      onMouseEnter={onHold}
      onMouseLeave={onLeave}
    >
      <div className="pc-shot">
        {shot && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <PlaceArt name={pin.name} icon={pin.icon ?? 'ph-map-pin'} />
        )}
        {place.band ? <span className="mono pc-band">{place.band}</span> : null}
      </div>

      <div className="hc-head">
        <span className="hc-title">{pin.name}</span>
        <button className="tap hc-x" onClick={onClose} aria-label="Close">
          <i className="ph ph-x" />
        </button>
      </div>
      <div className="mono hc-where">
        <i className={'ph ' + (pin.icon ?? 'ph-map-pin')} /> {place.kindLabel}
      </div>

      {place.note.trim() ? <p className="hc-note pc-note">{place.note}</p> : null}

      <div className="pc-foot">
        {place.url ? (
          <a className="mono hc-link pc-link" href={place.url} target="_blank" rel="noopener noreferrer">
            Open listing ↗
          </a>
        ) : null}
        <button
          className={'tap mono hc-link pc-drop' + (armed ? ' is-armed' : '')}
          onClick={() => (armed ? onRemove() : setArmed(true))}
          onBlur={() => setArmed(false)}
        >
          <i className="ph ph-trash" /> {armed ? 'Tap again' : 'Remove'}
        </button>
      </div>
    </div>
  );
});

/**
 * The stand-in picture: a band of colour keyed to the name, with the kind's
 * glyph over it. Deterministic, so the same restaurant looks the same every
 * time, and drawn rather than fetched, so it never fails to load.
 */
function PlaceArt({ name, icon }: { name: string; icon: string }) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return (
    <span
      className="pc-art"
      style={{
        background:
          `linear-gradient(135deg, hsl(${h} 42% 26%) 0%, hsl(${(h + 38) % 360} 38% 17%) 100%)`,
      }}
    >
      <i className={'ph ' + icon} />
    </span>
  );
}
