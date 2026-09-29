'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import maplibregl, { LngLatBoundsLike, Map as MlMap, Marker } from 'maplibre-gl';
import { LatLng, Meal } from '@/lib/data';
import { mealsLine, ratingLine, reviewsLine, shortCuisine } from '@/lib/placeDetails';
import { money } from '@/lib/format';
import { boundsOf, toLngLat } from '@/lib/geo';
import { appleMapsUrl } from '@/lib/appleMaps';

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
  /** As typed, for handing over to Apple Maps. */
  addr: string;
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
  /** Out of 5, from the listing it came from; 0 when there is none. */
  rating: number;
  /** How many reviews that is out of; 0 when unknown. */
  ratingCount: number;
  /** "Sushi", "Korean BBQ" — blank when nobody knows. */
  cuisine: string;
  /** Which meals it is worth going for. A suggestion, and shown as one. */
  meals: Meal[];
  note: string;
  images: string[];
  url: string;
  /** As typed, for handing over to Apple Maps. */
  addr: string;
}

/** What a neighbourhood pin opens: what it is like, and what is in it. */
export interface HoodDetail {
  /** The name in the local script, when it differs. */
  local: string;
  blurb: string;
  images: string[];
  /** The places said yes to here, in the order the shortlist holds them. */
  yes: { name: string; icon: string; color: string; band: string }[];
  /** "6 to do · 4 to eat". */
  line: string;
  /** Every located place here, said yes to or not. */
  total: number;
}

export interface MapPin {
  id: string;
  name: string;
  /** Second line, shown on the selected pin only. */
  sub: string;
  ll: LatLng;
  selected: boolean;
  kind: 'city' | 'hotel' | 'place' | 'airport' | 'hood';
  /** Position in the planned day, when this pin is a stop. */
  stopNumber?: number;
  /** Place category, for the marker glyph. */
  icon?: string;
  /** Present on hotel pins — hovering or tapping one opens this card. */
  hotel?: HotelDetail;
  /** Present on place pins — hovering or tapping one opens this card. */
  place?: PlaceDetail;
  /** Present on neighbourhood pins — hovering or tapping one opens this card. */
  hood?: HoodDetail;
  /** Drawn faintly: a place nobody has said yes to yet. */
  faded?: boolean;
}

export interface MapFocus {
  ll: LatLng;
  zoom: number;
  /** Bumped on every request so repeat taps on the same place re-fly. */
  nonce: number;
}

export interface TripMapProps {
  pins: MapPin[];
  /**
   * Trip view frames the whole route; day view holds whatever the caller has
   * pointed the camera at. The map never re-frames itself in day view, so a
   * route arriving for a place you just tapped cannot pull you back out.
   */
  mode: 'trip' | 'day';
  /** Fit the map to these points when the nonce changes. */
  fit: { points: LatLng[]; nonce: number } | null;
  /** Bumped to re-frame the whole trip, however far the map has been moved. */
  frame: number;
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
  pins, mode, fit, frame, sheetPx, overlayPx, focus, onSelect, onHoverPlace,
  onRemovePlace, onActivateHotel,
}: TripMapProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const bounds = useRef<LngLatBoundsLike | null>(null);
  const ready = useRef(false);
  const box = useRef({ w: 0, h: 0 });
  /** The markup each marker currently shows, so an unchanged pin is left alone. */
  const drawn = useRef<Record<string, string>>({});

  const latest = useRef({ pins, sheetPx, overlayPx, onSelect, onHoverPlace, onActivateHotel });
  latest.current = { pins, sheetPx, overlayPx, onSelect, onHoverPlace, onActivateHotel };

  // The mini-card, for a hotel or a pinned place. `sticky` is set by a tap and
  // survives the pointer leaving; a hover-opened card closes as the pointer does.
  const [card, setCard] = useState<{ id: string; sticky: boolean } | null>(null);
  const cardBox = useRef<HTMLDivElement | null>(null);
  const cardId = useRef<string | null>(null);
  const cardSticky = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Where the pointer was last seen, so a card cannot be shut under it. */
  const pointer = useRef({ x: -1, y: -1 });
  cardId.current = card?.id ?? null;
  cardSticky.current = !!card?.sticky;
  const cardPin = card ? pins.find((p) => p.id === card.id) ?? null : null;
  // Narrowed once, so the card's callbacks can reach the payload.
  const cardHotel = cardPin?.hotel ? { pin: cardPin, hotel: cardPin.hotel } : null;
  const cardPlace = cardPin?.place ? { pin: cardPin, place: cardPin.place } : null;
  const cardHood = cardPin?.hood ? { pin: cardPin, hood: cardPin.hood } : null;

  const holdCard = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  /** Hover opens; a tap on the same pin closes what the tap opened. */
  const hoverCard = (id: string) => {
    holdCard();
    setCard((cur) => (cur && cur.id === id ? cur : { id, sticky: false }));
  };
  /** Open a card and keep it open, whatever was showing before. */
  const openCard = (id: string) => {
    holdCard();
    setCard({ id, sticky: true });
  };
  const tapCard = (id: string) => {
    holdCard();
    setCard((cur) => (cur && cur.id === id && cur.sticky ? null : { id, sticky: true }));
  };
  const closeCard = () => {
    holdCard();
    setCard(null);
  };
  /** True while the pointer is inside the open card. */
  const pointerOnCard = () => {
    const el = cardBox.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const { x, y } = pointer.current;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  /**
   * A short grace period so the pointer can travel from the pin to the card.
   *
   * A card that opened over its own pin takes the pointer off the pin without
   * the pointer having moved, which fires the pin's mouseleave — so the close
   * has to ask where the pointer actually is rather than trust that leaving
   * the pin means leaving the card.
   */
  const closeSoon = () => {
    holdCard();
    hideTimer.current = setTimeout(() => {
      if (pointerOnCard()) return;
      setCard((cur) => (cur?.sticky ? cur : null));
    }, 160);
  };

  /**
   * Park the card beside its pin: above it by preference, below it when there
   * is more room that way, and never on top of it.
   *
   * It used to be clamped into the band of map the header and the sheet leave
   * clear, which on a pin near the middle of a phone screen put the card
   * squarely over the pin. The pointer was then on the card rather than the
   * pin, so the pin reported the pointer leaving, the card closed, the pin was
   * under the pointer again and the card reopened — several times a second,
   * fading in each time, for as long as you held still.
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
    // The card may already be carrying a max-height from the last call, so its
    // natural size is the larger of what it is showing and what it holds.
    const border = el.offsetHeight - el.clientHeight;
    const cardH = Math.max(el.offsetHeight, el.scrollHeight + border);
    // The top of the map is clear — the header and the tabs are in the flow
    // above it, not floating over it — so the card may use all of it bar a
    // margin. The old reserve of a sixth of the screen was left from when the
    // header did float, and it squeezed cards that had room to spare.
    const ceiling = 10;
    const covered = Math.max(latest.current.sheetPx, latest.current.overlayPx);
    const floor = h - Math.min(covered, Math.round(h * 0.6)) - 8;

    // How much clear map there is on each side of the pin.
    const above = pt.y - 22 - ceiling;
    const below = floor - (pt.y + 30);
    // Above by preference; below once the card no longer fits above and there
    // is more room down there.
    const useAbove = cardH <= above || above >= below;
    const room = Math.max(120, Math.round(useAbove ? above : below));
    // When neither side can hold the whole card it is squeezed and scrolls,
    // which is still better than covering the thing it describes.
    el.style.maxHeight = room + 'px';
    const shown = Math.min(cardH, room);

    el.style.left = Math.round(Math.max(cardW / 2 + 10, Math.min(pt.x, w - cardW / 2 - 10))) + 'px';
    el.style.top = Math.round(useAbove ? pt.y - 22 - shown : pt.y + 30) + 'px';
  };
  const reposition = useRef(placeCard);
  reposition.current = placeCard;

  /** Frame the whole trip, leaving the header and the sheet uncovered. */
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

      m.on('move', () => reposition.current());

      // On the window, not the map: the card is a sibling of the canvas, and
      // the close needs to know when the pointer is over the card itself.
      const track = (ev: MouseEvent) => {
        pointer.current = { x: ev.clientX, y: ev.clientY };
      };
      window.addEventListener('mousemove', track, { passive: true });
      m.once('remove', () => window.removeEventListener('mousemove', track));

      sync();
      frameTrip(0);
    });

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      map.current?.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Rebuild the markers from the current pins. */
  const sync = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const { pins: ps } = latest.current;

    const seen = new Set(ps.map((p) => p.id));
    if (cardId.current && !seen.has(cardId.current)) setCard(null);
    Object.keys(markers.current).forEach((id) => {
      if (!seen.has(id)) {
        markers.current[id].remove();
        delete markers.current[id];
        delete drawn.current[id];
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
          // A hotel pin opens its card, and puts the map over the hotel while
          // it is open — a tap that closed the card has nothing to look at.
          if (me?.hotel) {
            const opening = !(cardId.current === p.id && cardSticky.current);
            tapCard(p.id);
            if (opening) latest.current.onSelect(p.id);
            return;
          }
          /*
           * A neighbourhood opens its card and zooms in on itself, which is
           * what reveals the places inside it.
           *
           * Which way the tap goes is read off the pin rather than off the
           * card: the card can be dismissed on its own — by its close button,
           * or by a tap on the map — while the neighbourhood stays open, and a
           * card that decided for itself would then close the neighbourhood on
           * the tap that was meant to bring the card back.
           */
          if (me?.hood) {
            const opening = !me.selected;
            latest.current.onSelect(p.id);
            if (opening) openCard(p.id);
            else closeCard();
            return;
          }
          // A place opens its card and asks for its route in the same tap,
          // which is the only way a phone gets what a hover gets.
          if (me?.place) tapCard(p.id);
          latest.current.onSelect(p.id);
        });
        el.addEventListener('mouseenter', () => {
          const me = self();
          if (!me?.hotel && !me?.place && !me?.hood) return;
          hoverCard(p.id);
          // Resting on a place routes it, so the way there is drawn without
          // having to commit to anything.
          if (me.place) latest.current.onHoverPlace(p.id);
        });
        el.addEventListener('mouseleave', () => {
          // The card follows the pointer away; the route it drew does not, so
          // there is something left to look at.
          const me = self();
          if (me?.hotel || me?.place || me?.hood) closeSoon();
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
      el.classList.toggle('is-hood', p.kind === 'hood');
      // A maybe is on the map but not competing with the places you have
      // actually chosen, so it is the same pin at a lower contrast.
      el.classList.toggle('is-faded', !!p.faded);
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
      // A neighbourhood is the app's own accent: it is not one of the kinds of
      // place, it is the thing the kinds of place sit inside.
      const hoodDot = p.kind === 'hood' ? ' tp-hood' : '';
      const extra = hotelDot + placeDot + airportDot + hoodDot;
      const dot = p.stopNumber !== undefined
        ? `<span class="tp-dot tp-num${extra}">${p.stopNumber}</span>`
        : p.icon
          ? `<span class="tp-dot tp-icon${extra}"><i class="ph ${p.icon}"></i></span>`
          : '<span class="tp-dot"></span>';
      const sub = p.selected || p.stopNumber !== undefined || cardId.current === p.id ? p.sub : '';
      /*
       * Rewriting innerHTML re-creates the icon element, and an icon font
       * glyph re-renders blank for a frame when it does — a blink on the very
       * pin the pointer is resting on, since hovering one is what opens its
       * card and changes its second line. So the disc is rebuilt only when
       * the disc itself changes, and the two lines of text are written
       * straight onto the nodes that already hold them.
       */
      if (drawn.current[p.id] !== dot) {
        drawn.current[p.id] = dot;
        el.innerHTML =
          '<span class="tp-ret"></span>' + dot +
          '<span class="tp-label"><span class="tp-name"></span><span class="tp-sub"></span></span>';
      }
      const name = el.querySelector('.tp-name');
      const subEl = el.querySelector('.tp-sub');
      if (name && name.textContent !== p.name) name.textContent = p.name;
      if (subEl && subEl.textContent !== sub) subEl.textContent = sub;
    });

    const coords = ps.map((p) => toLngLat(p.ll));
    bounds.current = coords.length ? (boundsOf(coords) as LngLatBoundsLike) : null;
  };

  /*
   * Redraw, and nothing else. This used to re-frame the whole trip whenever
   * the pins or the legs changed, which meant tapping a place — whose routed
   * legs arrive a moment later — flew the camera out to the whole trip
   * instead of in to the place. Framing now only happens when it is asked
   * for: a view switch, a day step, or a tapped pin.
   */
  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pins)]);

  /** Asked for the whole trip — frame it, wherever the map had got to. */
  useEffect(() => {
    if (!ready.current) return;
    frameTrip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  /** In trip view the camera follows the shape of the trip as cities change. */
  useEffect(() => {
    if (mode !== 'trip' || focus) return;
    frameTrip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, JSON.stringify(pins.filter((p) => p.kind === 'city').map((p) => p.ll))]);

  /** Fit a specific set of points — "zoom to day". */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !fit || fit.points.length === 0) return;
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

    if (!focus) {
      // Day view keeps whatever the caller framed; only trip view pulls back out.
      if (mode === 'trip') frameTrip();
      return;
    }
    /*
     * Straight to it. This used to fly out by three and a half zoom levels
     * first and step back in a second later, which read as the map running
     * away from the pin you had just tapped.
     */
    const H = holder.current?.clientHeight ?? 874;
    const offsetY = -Math.round(Math.min(latest.current.sheetPx, H * 0.42) / 2);
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    m.flyTo({
      center: toLngLat(focus.ll),
      zoom: focus.zoom,
      offset: [0, offsetY],
      duration: 650,
      curve: 1.2,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, focus === null, mode]);

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
      {cardHood ? (
        <HoodMiniCard
          ref={cardBox}
          pin={cardHood.pin}
          hood={cardHood.hood}
          onHold={holdCard}
          onLeave={closeSoon}
          onClose={closeCard}
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
 * The way out of the app: the same row on every card that opens over a pin.
 *
 * Renders nothing when there is neither an address nor a coordinate to hand
 * over, which is the one case where the button would open Apple Maps on a
 * search for a name and land somewhere else entirely.
 */
function OpenInMaps({ name, addr, ll }: { name: string; addr?: string; ll?: LatLng | null }) {
  const href = appleMapsUrl({ name, addr, ll });
  if (!href) return null;
  return (
    <a
      className="mono hc-link hc-maps"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={'Open ' + (name || 'this place') + ' in Apple Maps'}
    >
      <i className="ph ph-navigation-arrow" /> Apple Maps
    </a>
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
        <OpenInMaps name={pin.name} addr={hotel.addr} ll={pin.ll} />
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
        {/* The score, where the shortlist's band used to sit — the same corner
            of the picture, now with the review count behind it. */}
        {ratingLine(place.rating) || place.band ? (
          <span className="mono pc-band">{ratingLine(place.rating) || place.band}</span>
        ) : null}
      </div>

      <div className="hc-head">
        <span className="hc-title">{pin.name}</span>
        <button className="tap hc-x" onClick={onClose} aria-label="Close">
          <i className="ph ph-x" />
        </button>
      </div>
      <div className="mono hc-where">
        <i className={'ph ' + (pin.icon ?? 'ph-map-pin')} />{' '}
        {[shortCuisine(place.cuisine) || place.kindLabel, reviewsLine(place.ratingCount)]
          .filter(Boolean)
          .join(' · ')}
      </div>

      {/* When to go is worked out from the hours and what it serves, so it says
          "best" rather than stating an opening time nobody confirmed. */}
      {mealsLine(place.meals) ? (
        <div className="mono pc-when">
          <i className="ph ph-clock" /> {mealsLine(place.meals)}
          <span className="pc-hint"> · suggested</span>
        </div>
      ) : null}

      {place.note.trim() ? <p className="hc-note pc-note">{place.note}</p> : null}

      <div className="pc-foot">
        <OpenInMaps name={pin.name} addr={place.addr} ll={pin.ll} />
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


/**
 * The neighbourhood mini-card: what this part of the city is like, and what
 * you have said yes to in it.
 *
 * It lists the yes-voted places rather than everything pinned, because the
 * point of the card is "here is what we are doing in Hongdae", not "here are
 * the forty restaurants a shortlist put there". The total is still given, so
 * nothing looks like it went missing.
 */
const HoodMiniCard = forwardRef<
  HTMLDivElement,
  {
    pin: MapPin;
    hood: HoodDetail;
    onHold: () => void;
    onLeave: () => void;
    onClose: () => void;
  }
>(function HoodMiniCard({ pin, hood, onHold, onLeave, onClose }, ref) {
  const shot = hood.images.find((src) => src.trim()) ?? '';
  const [broken, setBroken] = useState(false);
  // A photograph earns the band across the top of the card. A gradient with an
  // icon on it does not: it costs eighty-odd pixels on a phone, which is the
  // difference between the list of what you are doing here being on the card
  // and being below the fold of it. Without one, the tally moves up beside the
  // name and the card starts with its words.
  const art = Boolean(shot) && !broken;
  const where = [hood.local, art ? '' : hood.line].filter((v) => v.trim()).join(' · ');
  return (
    <div
      ref={ref}
      className="hotel-card place-card hood-card"
      role="dialog"
      aria-label={pin.name + ' details'}
      onMouseEnter={onHold}
      onMouseLeave={onLeave}
    >
      {art ? (
        <div className="pc-shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="" loading="lazy" onError={() => setBroken(true)} />
          <span className="mono pc-band">{hood.line}</span>
        </div>
      ) : null}

      <div className="hc-head">
        <span className="hc-title">{pin.name}</span>
        <button className="tap hc-x" onClick={onClose} aria-label="Close">
          <i className="ph ph-x" />
        </button>
      </div>
      {where ? <div className="mono hc-where">{where}</div> : null}

      {hood.blurb.trim() ? <p className="hc-note pc-note">{hood.blurb}</p> : null}

      {hood.yes.length ? (
        <ul className="hood-list">
          {hood.yes.map((y) => (
            <li key={y.name} style={{ ['--pin' as string]: y.color }}>
              <i className={'ph ' + y.icon} />
              <span className="hood-name">{y.name}</span>
              {y.band ? <span className="mono hood-band">{y.band}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mono hood-none">
          {hood.total
            ? `${hood.total} pinned here, none said yes to yet`
            : 'Nothing pinned here yet'}
        </p>
      )}

      {/* A neighbourhood has no street address, so Apple Maps gets its centre
          under its name, which drops you in the middle of it. */}
      <div className="pc-foot">
        <OpenInMaps name={pin.name} ll={pin.ll} />
      </div>
    </div>
  );
});
