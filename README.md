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

**Days.** Each city's nights become days, dated from the trip start. Add items with
a time, title, note and cost; tap the dot to mark one done. Items stay attached to
their city when you reorder the trip.

**Checklist.** Yours to write: add, rename, tick and delete items. "Print the
itinerary" produces a letter-paper sheet of every city, its hotel, transit, food,
each day's items, and the checklist.

**Two-person login.** Conner (blue) and Anasophia (pink). It is deliberately
unsecured — tap a face to become that person, switch any time from the header
avatars. Every change is stamped with who made it and when, and the affected
control picks up that person's outline color plus a `Conner · 4m ago` credit line.

**Notes** parks thoughts that aren't in the plan yet, scoped to a city or the whole
trip, marked settled when they're decided. Cities with open notes show a count.

## Where the data lives

Everything you enter — the trip settings, cities, hotels, transit, places, day
items, checklist, notes, and the attribution stamps — persists to `localStorage`
under `trip-planner:v2`.

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
src/lib/
  data.ts        # the document's types and blank factories (no trip content)
  geo.ts         # great-circle route geometry, bounds
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
