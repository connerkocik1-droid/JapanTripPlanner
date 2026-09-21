# Trip Planner

A map-first itinerary and budget planner for two people. It opens empty — you add
the cities, the places, the days and the budget yourself.

Built with Next.js (App Router) + TypeScript + MapLibre GL. Deploys to Vercel as-is.

The original design prototype and its handoff notes live in [`design/`](design/) —
`design/DESIGN.md` is the spec this app implements.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run typecheck
```

No environment variables are required. Two optional ones tune the geocoder:

| Variable | Default | Purpose |
|---|---|---|
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org/search` | Swap in a paid geocoder |
| `GEOCODER_CONTACT` | `japan-trip-planner` | Sent in the `User-Agent`, per Nominatim's usage policy |
| `OSRM_URL` | `https://routing.openstreetmap.de` | Walking/cycling router |
| `TRANSIT_URL` | *(unset)* | A MOTIS `/api/v1/plan` endpoint for real metro routing |

Without `TRANSIT_URL` the metro option is a clearly-labelled estimate: the walking
distance less the walks either side, ridden at 27 km/h for a short hop and up to
72 km/h for a long one, plus five minutes of waiting and a modelled walk at each
end. So "walk or metro?" still has an answer. Walking is routed either way.

Either way a transit leg comes back split into what you ride and what you walk, which
is what the airport → hotel figures below are built from.

## What's in it

**The app starts empty.** No cities, no itinerary, no checklist, no budget — you
author all of it. Name the trip, set its start date, traveler count and total
budget from the header; everything else grows from the cities you add.

**Map (the primary surface).** MapLibre GL with OpenStreetMap vector tiles
(OpenFreeMap `positron`, no API key). Everything geographic is driven by real
coordinates:

- Add a city by name and it is geocoded on the spot, so the pin lands in the right
  place and the route is correct the moment it appears.
- The route is drawn through the cities **in your current order**, and redrawn
  whenever you reorder, add, or delete one.
- Segments are densified along the **great circle** rather than drawn as straight
  screen lines, so the path between cities is geographically honest at trip zoom.
- Map labels are forced to English (`name:en` → `name:latin` → `name`).
- Selecting a city, hotel, or place runs a two-stage camera descent (out-and-in
  arc, then a step down to block level).
- The selected city also shows its chosen hotel and its places as secondary pins.

**Addresses become pins.** Type an address into a hotel or a place and it is
geocoded through `/api/geocode` (Nominatim, proxied server-side and cached), so the
pin, the camera, and the walking times all reflect the real location. The card says
whether the lookup landed (`Pinned from address`) or not.

**Walking times** are haversine distance × 1.25 for street grid, at 4.8 km/h; over
35 minutes it says "transit" instead. They appear once the selected hotel and the
place both have coordinates.

**Budget.** Each city offers three hotel slots (add more if you want) — fill in
name, booking link, address and nightly rate, and **select exactly one**. Only the
selected option is costed, so switching the radio re-prices the whole trip
instantly. Add the transit leg (× travelers) and a per-day food figure, and the
header card sums Lodging / Transit / Food live against the budget you set. Costs
you attach to itinerary items are tracked separately as "planned items".

**Airport → hotel.** Every city with a pinned hotel shows how you get in from the
airport, for **each** option rather than only the selected one — total door-to-door
time, the metro portion and the walking portion separately, and the fare for
everyone travelling. The airport is the nearest one to the city by default (a
built-in list of Japanese airports plus the nearby regional hubs), and the picker
switches it where that guess is wrong — Haneda rather than Narita, say. The fare
starts from that airport's typical published rail fare into town and is editable per
city, because the express and the ordinary train are not the same money. When a hotel
is close enough that walking beats riding, the row says so and costs nothing. With
`TRANSIT_URL` set these are real routed journeys with the lines named; without it they
are modelled and marked `EST`.

**Plot first, route later.** Every place you pin shows on the map immediately, with
a glyph for its kind (eat / do / stay / other) — across all cities, or just the open
one. Nothing is routed at this stage: pinning costs no requests.

**Day planner.** Each city's nights become days, dated from the trip start. A day is
an ordered list of stops: give a stop a time, title, cost, and point it at one of the
city's pinned places. The day then starts from your selected hotel and routes each
consecutive pair:

- **Walking** comes from a public OSRM instance — the line follows real streets and
  the duration is a routed duration, not a straight line.
- **Transit** comes from a MOTIS-compatible endpoint when `TRANSIT_URL` is set
  (Transitous, or your own instance), including the lines you'd ride.
- Each hop shows both options side by side with time and distance, a ★ on the faster
  one, and `EST` on anything modelled rather than routed. Tap either to choose it.
- The chosen legs are drawn on the map — walking dashed in blurple, transit solid in
  cyan — with numbered stop markers. "Zoom to day" fits the whole day; the pin button
  on any stop flies to it.
- The day header totals your moving time.

Reorder stops with the arrows and the routes recompute. Results are cached per hop,
so reordering or switching modes doesn't re-hit the router.

Items stay attached to their city when you reorder the trip.

**Itinerary builder.** A separate tab for filling a day, two ways:

- *Build your own* — every place you've pinned in that city, filterable by kind,
  each showing what it costs in time and money to add from wherever the day
  currently ends: walking time and distance (free), metro time and fare, and how
  long you'd typically spend there. Tap *Add* and it becomes the next stop.
- *Presets* — ready-made days loaded from `public/presets/`. Add one to the current
  day or replace it; its places are pinned automatically, reusing any you already
  have rather than duplicating them. You can also import a preset from a file.

Presets are plain JSON — see `public/presets/EXAMPLE.json` for the shape. List the
ones you want offered in `public/presets/index.json`; an empty list is fine, and the
builder just says there are none yet.

**Time allotment.** Each stop carries how long you'll spend there (defaulted by kind
— 75 min for a meal, 90 for a sight). The day planner lays that out on a clock with
the routed travel between stops, so you get arrival times, a finish time, total time
out, moving time, and the day's fares. Give a stop an explicit time and the schedule
pins there, so a booked dinner stays put and everything before it reads back from it.

**Fares.** Set the local metro fare per person once per city; every transit leg you
choose is priced at that × travelers, and totalled for the day.

**Checklist.** Yours to write: add, rename, tick and delete items. "Print the
itinerary" produces a letter-paper sheet of every city, its hotel, transit, food,
each day's items, and the checklist.

**Two-person login.** Conner (blue) and Anasophia (pink). It is deliberately
unsecured — tap a face to become that person, switch any time from the header
avatars. Every change is stamped with who made it and when, and the affected
control picks up that person's outline color plus a `Conner · 4m ago` credit line.

**Notes** parks thoughts that aren't in the plan yet, scoped to a city or the whole
trip, marked settled when they're decided. Cities with open notes show a count.

## Installing it (PWA)

It is a installable progressive web app: open the deployed URL on a phone and use
*Add to Home Screen*. Installed, it runs standalone (no browser chrome), lays out
against the safe-area insets, and keeps working on a bad signal:

- a service worker caches the app shell, fonts and icons, and up to 600 map tiles,
  so a place you have already looked at still draws offline;
- routing and geocoding are never served from cache — they need the network, and
  the header shows an **Offline** badge when there isn't one;
- `viewport-fit=cover`, `display: standalone`, portrait orientation, no
  rubber-band scrolling, and no zoom-on-focus.

## Where the data lives

Everything you enter — the trip settings, cities, hotels, transit, places, day
items, checklist, notes, and the attribution stamps — is written to **IndexedDB**,
with a `localStorage` copy as a backup. Writes are debounced and flushed when the
app is backgrounded, and the header shows `Saving` / `Saved`, or **Not saved** if
the browser refused to store it.

On first run the app calls `navigator.storage.persist()`, which asks the browser
not to evict the plan — Chrome grants this to installed apps, and Safari uses it to
exempt the site from its 7-day cleanup of unused storage.

**Back up before you travel.** The trip panel has *Back up* and *Restore*, which
write and read a plain JSON file. On a local-only app that file is the only copy
that survives a lost phone.

**This is per-browser.** Two people on two devices each get their own copy and will
not see each other's edits. Making the plan genuinely shared needs a backend
(Supabase or Vercel Postgres); the state layer in `src/lib/tripState.ts` is written
as a single document so it can be swapped for a server store without touching the
components.

## Layout

```
app/
  layout.tsx, page.tsx, globals.css   # shell + Nocturne design tokens
  api/geocode/route.ts                # address → coordinates
  api/route/route.ts                  # walking (OSRM) and transit legs
src/lib/
  data.ts        # the document's types and blank factories (no trip content)
  geo.ts         # great-circle route geometry, bounds
  routing.ts     # client side of the router, per-hop cache, walk-vs-transit pick
  useDayRoute.ts # routes the planned day's consecutive stops
  derive.ts      # schedule, budget and per-city totals
  tripState.ts   # persisted document + who-changed-what
  people.ts      # Conner / Anasophia
  format.ts      # money, dates, walking distance
  geocode.ts     # client side of the geocoder
src/components/
  TripPlanner.tsx  TripMap.tsx  CityPanel.tsx  TripSettings.tsx
  DaysTab.tsx  ChecklistTab.tsx  NotesTab.tsx
  Login.tsx  TouchMark.tsx  PrintSheet.tsx
```

Map tiles are © OpenStreetMap contributors; attribution is shown on the map.
