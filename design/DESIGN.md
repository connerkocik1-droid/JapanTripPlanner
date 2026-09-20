# Handoff: Trip Planner (map-first mobile itinerary planner)

## Overview

A mobile app for a couple or small group planning a multi-city trip together. The
reference trip is **Austin → Seoul → Osaka → Kyoto → Tokyo → Austin, Mar 21 – Apr 3 2027,
2 travelers**.

The product answers one question well: *what does this trip look like, and what does it
cost?* A full-bleed OpenStreetMap map is the primary surface. A draggable bottom sheet
holds the planning content. There are three tabs: **Map**, **Days**, **Checklist**.

Everything money-related is driven by user selections — three manually entered hotel
options per city (one selected), a manually entered train/flight leg per city, a nights
stepper, and a daily food slider. A "Total budget" card at the top of the map is the live
sum of those selections.

## About the design files

The files in this bundle are **design references created in HTML** — a prototype showing
intended look and behavior, not production code to lift. The task is to **recreate these
designs in the target codebase's existing environment** (React Native, SwiftUI, Flutter,
React web, etc.) using its established patterns, navigation, and component library. If no
environment exists yet, pick the framework that best suits a map-heavy mobile app and
implement there.

Notably, do **not** port the prototype's rendering layer. It uses a bespoke
template/logic runtime (`support.js`, `.dc.html`) that exists only in the design tool.
Read it for structure, values, and behavior; reimplement idiomatically.

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, motion timings and touch-target
sizes are final and are listed below. Recreate the UI to match, using the target
codebase's own primitives. Content is placeholder trip data — replace with real data
from the app's backend.

## Design system

The design follows **Nocturne**, a dark system. Its tokens are in
`_ds/nocturne-a15a1733-bc9c-441e-a8c1-6f7c4c14cee0/styles.css` (copied into this bundle).
If your codebase already has a design system, map these to its equivalents rather than
introducing a second token set.

Governing rule observed throughout: **accent is used as line, edge, and small type — never
as a large flood.** Surfaces are neutral; the accent (blurple `#9184d9`) marks the active
state, the route line, hairlines and numbers.

## Screens / views

### 1. Map tab (primary)

**Purpose:** see the whole trip geographically, and drill from route → city → block.

**Layout:** full-screen map (`position: absolute; inset: 0`), with three overlays:

| Layer | z-index | Notes |
|---|---|---|
| Map canvas | 0 | `isolation: isolate` — required so overlays composite above the tile pane |
| Tint + glow | 2 | see "Map styling" |
| HUD corner brackets | 7 | `inset: 320px 12px 268px` |
| Header scrim | 6 | `pointer-events: none` so map drags pass through |
| Bottom sheet | 8 | draggable |
| Tab pill | 12 | floating, centered, `bottom: 26px` |

**Header (top overlay, `padding: 54px 16px 14px`):**
- Scrim: `linear-gradient(180deg, rgba(16,18,32,.94) 0%, rgba(16,18,32,.72) 62%, transparent 100%)`
- Status line — mono 9.5px, `--color-accent-300`, uppercase, `letter-spacing: .1em`, preceded by
  a 5px accent dot pulsing on a 2.2s `blip` animation: "Itinerary live · 2 travelers"
- Title — 20px / 500 / `line-height 1.15`: "Korea + Japan"
- Telemetry line — mono 9.5px, `--color-neutral-400`, `white-space: nowrap`:
  `Mar 21 – Apr 3 / 14 days / T−185d`
- **Total budget card** — `padding: 11px 13px`, `background: rgba(35,37,50,.92)`,
  `border: 1px solid --color-neutral-800`, `radius: --radius-md`:
  - label row: mono 9.5px "Total budget" / right: mono 9px "$X left of $9,800" (or "over plan")
  - figure: 25px / 600 / `tabular-nums`, re-mounts with a 280ms `countUp` animation on change
  - note: 11px `--color-neutral-500` — "$X each · plus $Y of activities"
  - stacked bar: 5px tall, `radius: 9999px`, track `--color-neutral-900`, three segments —
    Lodging `--color-accent-400`, Transit `--color-accent-600`, Food `--color-accent-800`
  - legend: three 7px swatches + mono 10px labels with amounts

**Bottom sheet:**
- `background: rgba(27,30,46,.97)`, `backdrop-filter: blur(16px)`,
  `border-top: 1px solid --color-neutral-700`, `border-radius: 14px 14px 0 0`,
  `box-shadow: 0 -12px 40px rgba(0,0,0,.5)`
- Accent hairline across the very top:
  `linear-gradient(90deg, transparent, --color-accent-700 22%, --color-accent-500 50%, --color-accent-700 78%, transparent)`
- Handle: 40×5px pill, `--color-neutral-700`, turns `--color-accent-400` while dragging
- Title row: 14px/500 left, mono 9px hint right
- Status ticker: mono 9px `--color-accent-300`, cycles every 4s with a `ticker` fade
  through: legs/days/pax · lodging-transit-food split · FX rates · bloom window · checklist progress

**City list** (sheet content on the Map tab) — one block per city, in trip order:
- Row: `min-height 56px`, `padding 14px`, `radius --radius-md`, `border 1px`,
  collapsed `background --color-surface` / `border --color-neutral-800`,
  expanded `background rgba(145,132,217,.10)` / `border --color-accent-500`.
  Contents: city name 16px/500 · mono 9px date range · 12px tabular cost · caret icon.
  Enters with a `riseIn` 340ms animation, staggered 60ms per row.
- Under each row, a right-aligned control strip: **up / down / delete**, each 44×44,
  `radius --radius-sm`, `border 1px --color-neutral-800`, transparent, 12px Phosphor icon.
- Expanded panel (see "City planning panel" below).
- Footer: **"Add a city"** — full width, `min-height 48px`, dashed
  `1px --color-neutral-700`, accent text, plus icon. Opens an inline form: text input +
  Add button, then a "Suggested stops" chip row (pill, `min-height 36px`), then Cancel.

### 2. City planning panel (expanded inside the Map tab)

Container: `margin 6px 5px 0`, `padding 11px 12px`, `radius --radius-md`,
`background --color-bg`, `border 1px --color-neutral-800`.

**Nights** — label left, stepper right: `−` (neutral border) and `+` (accent border),
each **44×44**, with the count between at 15px/600 tabular.

**Hotel · pick one of three** — three cards, each `radius --radius-sm`, border/background
switching on selection (`--color-accent-500` / `rgba(145,132,217,.10)` when selected):
- Header row (`padding 7px 8px`, gap 6): 44×44 radio button containing a 15px circle ·
  44×44 photo button (an image drop slot) · name input (borderless, 13px/500, height 44) ·
  44×44 `↗` link opening the booking URL.
  **Both the radio and the photo select the option**, and selecting flies the map to that
  hotel at zoom 16.
- When selected, the card expands to reveal: booking-link input (monospace 11px, accent
  text), address input (12px), and a `$ / night` number input (92px wide) with the stay
  total right-aligned.

**Transit leg** — label is contextual ("Seoul → Osaka", "Getting there"), with an
"Open link ↗" anchor padded to a 44px box. Fields: service name, booking link,
`$ / person` number input, with `$X for 2` computed to the right.

**Eating here** — two restaurant cards side by side, each a button: 64px photo slot,
name 11.5px/500, price band in `--color-accent-300`, note 10px, and a mono 9px walking
line with a walk icon — e.g. `2.0 km · 25 min walk`. Tapping flies the map to the
restaurant at zoom 16.5.

**Food, per day** — label + live `$X/day` figure (14px/600 accent), then a range input
`min 10 max 200 step 5`, `accent-color: #9184d9`, 32px tall. Below: `$10` / mono
"$X over N days" / `$200`.

**Subtotal** — divider, then "<City> subtotal" left and the figure right in 15px/600
`--color-accent-200`.

### 3. Days tab

Sheet expands to ~88% height. Sticky day strip at the top: chips **44×48**,
`radius --radius-sm`, showing day number (13px/600) over weekday (8.5px uppercase);
selected chip gets `--color-accent-800` fill and `--color-accent-500` border.

Below: city name 17px/500, mono day label, a weather line (cloud icon + 11px text), then a
timeline. Each item is a 3-column grid `46px | 18px | 1fr`, `min-height 48px`:
time (mono 10px, right-aligned) · dot-and-rail column (9px dot, 1px `--color-neutral-800`
rail) · title 13.5px/500 + note 11px + cost right-aligned. **Tap toggles done** —
strikethrough and `--color-neutral-600`, dot fills with `--color-accent-500`.
Rows stagger in 45ms apart.

### 4. Checklist tab

Progress card: "N of 20 done" 13px/500 + percentage 15px/600 accent, 5px progress bar.
Four groups — *Before you fly · Book + confirm · Pack · On arrival* — each a mono 9.5px
heading over a `--color-surface` list. Rows `min-height 50px`, 17px checkbox
(`radius 5px`; checked = `--color-accent-400` fill with a dark check glyph), label 13px
struck through when done.

Footer: **"Request itinerary PDF"** — full width, `min-height 52px`, accent border,
printer icon; below it a caption. Triggers `window.print()`.

### 5. Print sheet (PDF)

A separate hidden DOM tree shown only in print (`@page letter; margin 16mm 14mm`), dark UI
suppressed, black-on-white. Header with trip name, dates, selection total and activity
total; then per city: name, dates, nights, subtotal, the chosen hotel (name · rate ·
address), the chosen transit, food per day, and every day's schedule as a
`44pt | 1fr | auto` grid with dotted row rules. Cities avoid breaking across pages.

## Map styling and behavior

- **Library:** MapLibre GL JS 4.7.1. **Tiles:** OpenFreeMap `positron` vector style
  (OpenStreetMap data, no API key). Attribution "© OpenStreetMap contributors" shown
  bottom-left in 8.5px.
- **Dark treatment:** the canvas is filtered `invert(1) grayscale(1) brightness(.82) contrast(.95)`,
  then a full-size overlay div applies `background: --color-bg; opacity: .42; mix-blend-mode: color`,
  plus a soft accent radial glow. The map container needs `isolation: isolate; z-index: 0`
  or the tile pane's internal `z-index: 200` wins.
- **English labels:** every symbol layer's `text-field` is rewritten to
  `coalesce(name:en, name:latin, name_en, name)`.
- **Duplicate suppression:** the four trip-city names (English and local script) are
  filtered out of all symbol layers, and any layer whose id matches
  `city|town|village|suburb|quarter|hamlet|neighbourhood|country|state|province|region`
  is limited to `minzoom 7`, so at route overview only water/country-scale text competes
  with the app's own pins.
- **Route:** a `--color-accent` polyline through the cities in order, plus two dashed
  `#6d5fc0` stubs running off-frame toward Austin. A second "pulse" line animates its
  `line-dasharray` every 110ms so a light dash crawls the route.
- **Pins:** custom DOM markers, `anchor: top`, `offset: [0,-7]`. Unselected — 11px dot,
  `#6d5fc0`, 2px `--color-bg` ring, 11px label. Selected — 15px dot `#b5abfc` with a white
  ring, a `pulseRing` shadow, a 44px dashed ring rotating on a 6s `reticle` animation, a
  12.5px label and a nights sub-line. Osaka and Kyoto labels carry small offsets so they
  don't collide at trip zoom. **Only toggle a state class on the marker element — never
  reassign `className`**, or MapLibre's own positioning class is lost.
- **Camera.** Padding must be zeroed (`setPadding`) before every move: padding passed to
  `flyTo` persists on the transform and stacks onto the next `fitBounds`, which then gets
  rejected as unfittable. Overview uses `fitBounds(tripBounds, { top, bottom })` with
  `top = min(190, H*0.18)` and `bottom` clamped to `H - top - 220`. Selecting a city,
  hotel, or restaurant runs a **two-stage descent**: `flyTo` to `zoom - 3.5`
  (900ms, `curve 1.6`), then after 950ms an `easeTo` to the final zoom (1100ms) — city
  13.2, hotel 16, restaurant 16.5.
- Markers and route geometry are rebuilt whenever the city list changes (add / delete /
  reorder), and `tripBounds` recomputed from the new coordinate set.
- Call `resize()` only when the container box actually changes — an unconditional resize
  on every render cancels in-flight camera animations.

## Interactions & behavior

- **Sheet drag** — pointer-driven, three snap points: peek `238px`, half `56%`, full `88%`
  of the device height. Follows the finger, snaps to the nearest on release, animates with
  `height .34s cubic-bezier(.22,1.1,.3,1)` (transition disabled while dragging). A drag of
  more than 6px suppresses the click-to-toggle that would otherwise fire.
- **Tap feedback** — every interactive element uses
  `transition: transform .12s ease, background-color .16s, border-color .16s` and
  `:active { transform: scale(.97) }`.
- **Nights stepper** rewrites the schedule: dates, day numbering, pin sub-labels, the
  following cities' date ranges and all totals derive from one nights value per city.
  Added nights appear in the Days tab as "Nothing planned yet".
- **Walking distances** — haversine between the selected hotel and each restaurant, times
  1.25 for street grid, at 4.8 km/h. Under 1 km shown in metres; over 35 min shown as
  "transit" instead of a walk time. Recomputed when the hotel selection changes.
  *In production, replace with a real routing/geocoding service — the prototype uses
  hard-coded coordinates and cannot geocode a typed address.*
- **Add city** — typed name or one of twelve suggested stops with known coordinates
  (Busan, Jeju, Gyeongju, Fukuoka, Hiroshima, Nara, Kanazawa, Hakone, Nikko, Sapporo,
  Takayama, Naoshima). A typed city with no coordinates gets a planning card but no pin.
- **Minimum touch target is 44×44** throughout.

## State

| State | Shape | Notes |
|---|---|---|
| `tab` | `'map' \| 'days' \| 'list'` | |
| `city` | string | selected city; drives pin, camera, expansion |
| `day` | number | 1-indexed day in the derived schedule |
| `expanded` | boolean | city panel open |
| `snap` | `0 \| 1 \| 2` | sheet snap point |
| `dragH`, `dragging` | number \| null, boolean | live drag height |
| `order` | string[] | city order; null = derived from seed data |
| `cfg` | `{ [city]: { nights, hotelSel, hotels[3]{name,url,addr,cost,ll}, trainName, trainUrl, trainCost, foodPer } }` | all user input |
| `done` | `{ [dayIdx:itemIdx]: boolean }` | ticked itinerary items |
| `checked` | `{ [group:item]: boolean }` | checklist |
| `adding`, `newCity` | boolean, string | add-city form |
| `tick` | number | 4s ticker index |

Derived per render: the day schedule (from nights per city), per-category spend, grand
total, per-city subtotals, walking distances, and the print model.

**Persistence:** the prototype holds everything in memory. In production, persist `cfg`,
`order`, `done` and `checked` per trip, and sync across the group members.

## Design tokens

Colors (from Nocturne):

```
bg           #161826    surface      #232532    text       #e9e9ed
accent       #9184d9    divider      rgba(233,233,237,.16)
neutral 100–900  #f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31
accent  100–900  #f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741
```

Type: **Inter** (400 / 500 / 600) for everything; a monospace stack
(`ui-monospace, "SF Mono", Menlo, monospace`) with `letter-spacing: .1em` and
`text-transform: uppercase` for all HUD micro-labels, dates and timestamps.
Scale in use: 9 / 9.5 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15 / 16 / 17
/ 20 / 25px. Numbers use `font-variant-numeric: tabular-nums`.

Spacing: 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4px.
Radii: `sm 4px`, `md 8px`, `lg 14px`, pills `9999px`.
Shadows: `sm 0 0 0 1px #3f424d` · `md 0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)` ·
`lg 0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,.65)`.

Animations: `riseIn` 340ms · `countUp` 280ms · `ticker` 4s · `blip` 2.2s · `pulseRing` 2.8s ·
`reticle` 6s linear · `sweep` 7.5s (a faint accent gradient passing down the map) ·
`fadeIn` 160–220ms.

## Assets

- **Icons:** Phosphor Icons 2.1.1 (regular + fill) via CDN. Replace with the codebase's icon set.
- **Fonts:** Inter from Google Fonts.
- **Map:** MapLibre GL JS + OpenFreeMap positron tiles (OpenStreetMap data — attribution required).
- **Photography:** none. Hotel and restaurant images are empty drop slots
  (`image-slot.js`) awaiting real photos; in production these come from the listing source.
- **Device frame:** `ios-frame.jsx` is presentation chrome for the prototype only — not part
  of the app.

## Files in this bundle

| File | What it is |
|---|---|
| `Trip Planner v2.dc.html` | The design. Template markup first, then the logic class holding all trip data, budget math, camera control and map setup. |
| `_ds/nocturne-…/styles.css` | Nocturne design tokens. |
| `_ds/nocturne-…/_ds_bundle.js` | Nocturne component bundle. |
| `support.js` | Prototype runtime. Reference only — do not port. |
| `ios-frame.jsx` | Device bezel used for presentation. |
| `image-slot.js` | Image drop-slot placeholder web component. |

Open `Trip Planner v2.dc.html` directly in a browser to interact with the prototype.
