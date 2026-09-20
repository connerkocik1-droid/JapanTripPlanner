# Trip Planner

A map-first itinerary and budget planner for one trip: **Austin → Seoul → Osaka →
Kyoto → Tokyo → Austin, Mar 21 – Apr 3 2027, 2 travelers**.

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

**Map (the primary surface).** MapLibre GL with OpenStreetMap vector tiles
(OpenFreeMap `positron`, no API key). Everything geographic is driven by real
coordinates:

- The route is drawn through the cities **in your current order**, and redrawn
  whenever you reorder, add, or delete one.
- Segments are densified along the **great circle** rather than drawn as straight
  screen lines, so the path between cities is geographically honest at trip zoom.
- Dashed stubs run off-frame toward Austin at each end.
- Map labels are forced to English (`name:en` → `name:latin` → `name`), and the
  basemap's own labels for the trip cities are suppressed so they don't duplicate
  the app's pins.
- Selecting a city, hotel, or restaurant runs a two-stage camera descent
  (out-and-in arc, then a step down to block level).

**Addresses become pins.** Type an address into the selected hotel card and it is
geocoded through `/api/geocode` (Nominatim, proxied server-side and cached), so the
pin, the camera, and the walking times all reflect the real location. Cities you add
by name are geocoded the same way. The card says whether the lookup landed
(`Pinned from address`) or not (`No match — pin unchanged`).

**Walking times** are haversine distance × 1.25 for street grid, at 4.8 km/h; over
35 minutes it says "transit" instead. They recompute when the hotel selection or
its address changes.

**Budget** is the live sum of what's selected — three hotel options per city (one
picked), a transit leg per city, a nights stepper, and the per-day food slider
($10–$200). Lodging / Transit / Food are broken out in the header card.

**Days** tab derives its schedule from the nights per city; tapping an item marks it
done. **Checklist** tab tracks 20 items and prints the whole itinerary via
`window.print()`.

**Two-person login.** Conner (blue) and Anasophia (pink). It is deliberately
unsecured — tap a face to become that person, switch any time from the header
avatars. Every change is stamped with who made it and when, and the affected
control picks up that person's outline color plus a `Conner · 4m ago` credit line.

**Notes** tab parks thoughts that aren't in the plan yet, scoped to a city or the
whole trip, marked settled when they're decided. Cities with open notes show a
count on their row.

## Where the data lives

Everything you enter — hotels, transit, nights, food, ticked items, notes, and the
attribution stamps — persists to `localStorage` under `trip-planner:v1`.

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
  data.ts        # trip seed: cities, hotels, transit, eats, checklist
  geo.ts         # great-circle route geometry, bounds
  derive.ts      # schedule, budget and per-city totals
  tripState.ts   # persisted document + who-changed-what
  people.ts      # Conner / Anasophia
  format.ts      # money, dates, walking distance
  geocode.ts     # client side of the geocoder
src/components/
  TripPlanner.tsx  TripMap.tsx  CityPanel.tsx
  DaysTab.tsx  ChecklistTab.tsx  NotesTab.tsx
  Login.tsx  TouchMark.tsx  PrintSheet.tsx
```

Map tiles are © OpenStreetMap contributors; attribution is shown on the map.
