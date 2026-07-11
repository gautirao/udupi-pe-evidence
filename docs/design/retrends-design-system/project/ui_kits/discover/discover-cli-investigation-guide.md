# Investigating the Discover portal — a guide for Claude Code (CLI)

Goal: let the CLI **see for itself** how the redesigned unified Discover portal is built, drive it into every state, and understand how the map and panel stay in lockstep — so it can rebuild the page with real backend behaviour and matching look & feel. Work top-down: understand the one-shell architecture, render it in a real browser, then use **deep-link URLs** to jump straight into each of the 12 layers and screenshot them.

Primary file: `ui_kits/discover/index.html`
Companion spec: `ui_kits/discover/README.md` and `ui_kits/discover/Unified Discover Portal - UX Spec.md`

---

## 0. Orientation (read before running anything)

This is the **redesigned Discover journey**: a single split-screen shell — Leaflet **map on the left, editorial panel on the right** — that unifies four ways to search. It's built with React 18 + Babel-standalone (no build step) and Leaflet 1.9.4, loaded from CDNs.

### The one big idea

> There is **ONE shell**. `scope` (a region) is a *filter*; `journey` (area / school / listings / agri) is a *narrowing method*. **Everything else is derived.** The map's marker layer and the panel's body are two views of the same `(scope, journey, selection)` tuple.

A pure function collapses that tuple into a single **`layer`** string, and both the map and the panel switch on it. There are **12 layers**:

| journey | layers (shallow → deep) |
|---|---|
| _(none)_ | `region-bubbles` (city landing) → `region-hotspots` (region picked) |
| **area** | `area-groups` → `area-areas` → `area-listings` |
| **listings** | `area-listings` (skips the funnel) |
| **school** | `school-zones` → `school-areas` → `school-schools` → `school-homes` |
| **agri** | `agri-corridors` → `agri-clusters` → `agri-parcels` |

`computeLayer(state)` in `src/DiscoverPortal.jsx` is the whole routing table — read it first.

### File / load order (this matters)

`index.html` is a thin host: a `TopNav` + `<window.DiscoverPortal/>`. The real code is six scripts loaded **in order** — the DS bundle and data must load before the babel components that read them:

```
leaflet.js → react → react-dom → babel-standalone
→ ../../_ds_bundle.js            (window.ReTrendsDesignSystem_f37966 → Icon, Button, Badge, TrustBadge)
→ src/data.js                    (plain JS: window.BLR_DATA, BLR_COUNTS, BLR_AGRI, BLR_HOMES_NEAR, BLR_DIST, formatters)
→ src/components/shared.jsx      (BLR_WEDGE + panel primitives: DPSection, DPHeaderBand, DPBackLink, DPFilterBar, DPRadius, DPScopedSearch, DPBuyRent, DPEmpty, DPGhostBtn…)
→ src/components/cards.jsx       (DPRegionCard, DPRichJourneyCard, DPGroupCard, DPAreaCard, DPSchoolCard, DPListingCard, DPCorridorCard, DPClusterCard, DPParcelCard…)
→ src/PortalMap.jsx              (window.DPMap — the single Leaflet map)
→ src/DiscoverPanel.jsx          (window.DiscoverPanelBody — the right rail)
→ src/DiscoverPortal.jsx         (window.DiscoverPortal — the orchestrator + state machine)
```

**Do this first — skim the machine:**

```bash
grep -n "computeLayer" ui_kits/discover/src/DiscoverPortal.jsx
grep -n "React.useState\|const init" ui_kits/discover/src/DiscoverPortal.jsx        # the state fields
grep -n "URL sync\|URLSearchParams\|replaceState" ui_kits/discover/src/DiscoverPortal.jsx
grep -n "case \"" ui_kits/discover/src/PortalMap.jsx                                # map layers
grep -n "if (layer ===" ui_kits/discover/src/DiscoverPanel.jsx                       # panel layers
```

### The state fields (`DiscoverPortal`)

| field | meaning |
|---|---|
| `mode` | `Buy` / `Rent` — reprices & rewords every journey (persists across resets) |
| `city` | `Bangalore` / `Udupi` / `Mangaluru` — changing it resets to that city's landing |
| `scope` | selected region id (`north`/`south`/…) or `null` — a filter, not a journey |
| `journey` | `area` / `school` / `listings` / `agri` / `null` |
| `groupId · zoneId · areaId · schoolId` | residential drill-down selection |
| `corridorId · clusterId · maxKm` | agri drill-down (agri clears `scope` — farmland isn't region-bound) |
| `radiusKm` | school-homes radius: `3` / `5` / `10` km |
| `filters · agriFilters` | residential + agri filter objects (`DP_DEFAULT_FILTERS`, `DP_AGRI_DEFAULTS`) |
| `active · saved` | hovered map listing + saved-listing ids |

**Product rules to verify while investigating:**
1. **Map ⇄ panel mirror.** Every panel level has a matching map layer showing the same records; clicking a map marker drives the same navigation as clicking its panel card.
2. **Agri is a separate model.** Choosing agri **clears the region scope**; agri counts (parcels/corridors/acres) never mix with residential home counts.
3. **State is in the URL.** The full `(mode, scope, journey, selection, radiusKm, maxKm)` tuple is mirrored to the query string via `history.replaceState`, and re-hydrated (and *validated against the data*) on load. This is your fastest way to reach any state (§3).

---

## 1. Render it in a real browser

The DS bundle + stylesheet load from `../../` (two levels up), so **serve from the project root**, or `styles.css` and `_ds_bundle.js` 404. Leaflet + React come from CDNs, so the browser needs network.

```bash
# from the project root
python3 -m http.server 8000
# open: http://localhost:8000/ui_kits/discover/index.html
```

```bash
npm i -D playwright && npx playwright install chromium
```

Minimal harness — wait for **both** React mount *and* Leaflet tiles before shooting:

```js
// screenshot.mjs
import { chromium } from 'playwright';
const BASE = 'http://localhost:8000/ui_kits/discover/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(m.text()));

async function go(query, name) {
  await page.goto(BASE + query, { waitUntil: 'networkidle' });
  await page.waitForSelector('#root header');            // TopNav mounted
  await page.waitForSelector('.leaflet-tile-loaded', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);                        // let flyTo/flyToBounds settle
  await page.screenshot({ path: `shots/${name}.png` });  // NOT fullPage — it's a fixed 100vh split
}

await go('', '00-landing');
console.log('console errors:', errors);
await browser.close();
```

Notes:
- The layout is a **fixed `calc(100vh - 60px)` split**, not a scrolling page — screenshot the viewport, not `fullPage`. The right panel scrolls internally (`.upt-scroll`).
- The map animates (`flyTo` / `flyToBounds`, ~700ms) on every layer change — always `waitForTimeout(~900)` after navigating before capturing, or you'll catch it mid-pan.
- Tiles are CARTO Voyager; `.leaflet-tile-loaded` may never fully settle offline — the `.catch(()=>{})` keeps the harness moving.

---

## 2. Inventory the components & their look

The panel and cards are all `window.DP*` globals; the shared design-system primitives come from the bundle. See them in one shot on the landing (`00-landing.png`): editorial hero → City + Buy/Rent controls → four `DPRichJourneyCard`s (one marked **Recommended**, copper primary) → region cards → trust strip.

```bash
# what each src file exports onto window
grep -n "Object.assign(window" ui_kits/discover/src/components/cards.jsx
grep -rn "window\.DP\|window\.Discover\|window\.BLR" ui_kits/discover/src | grep " = " | head -60
# which DS-bundle components are consumed
grep -rn "ReTrendsDesignSystem_f37966" ui_kits/discover/src
```

**Journey identity colours** (keep them distinct — it's a deliberate system): area = ink-navy, school = **plum** (`--plum-*`, defined inline in `index.html` because it's not in the base tokens), agri = evergreen (`--evergreen-*`). **Copper stays reserved** for the single most-important accent per view (the *Recommended* tag + the one primary button). Confirm this holds at every layer.

For a canonical gallery of the base DS components, open the `@dsCard`-tagged pages instead of reverse-engineering from here:

```bash
grep -rl "@dsCard" components guidelines tokens | head -50
```

---

## 3. Drive every state via deep-link URLs (the fast path)

Because state round-trips through the query string, you can **jump straight to any of the 12 layers** without clicking through — the portal validates each id against `BLR_DATA` on load and falls back gracefully. Read the id vocabulary first:

```bash
grep -n "id:" ui_kits/discover/src/data.js | head -60   # region / group / zone / area / school / corridor / cluster ids
```

Then screenshot the whole layer matrix. (Replace the example ids with real ones from `data.js` — e.g. region `north`, and whatever `groupId`/`areaId`/`schoolId`/`corridorId`/`clusterId` exist.)

```js
const S = [
  ['',                                                              '01-landing'],            // region-bubbles
  ['?mode=rent',                                                    '02-landing-rent'],       // Buy/Rent reword
  ['?region=north',                                                 '03-region-hotspots'],
  ['?journey=area',                                                 '04-area-groups'],
  ['?region=north&journey=area',                                    '05-area-groups-scoped'],
  ['?journey=area&groupId=<G>',                                     '06-area-areas'],
  ['?journey=area&areaId=<A>',                                      '07-area-listings'],
  ['?journey=listings',                                             '08-all-listings'],       // area-listings, no funnel
  ['?journey=school',                                               '09-school-zones'],
  ['?journey=school&zoneId=<Z>',                                    '10-school-areas'],
  ['?journey=school&areaId=<A>',                                    '11-school-schools'],
  ['?journey=school&schoolId=<S>&radiusKm=5',                       '12-school-homes'],
  ['?journey=school&schoolId=<S>&radiusKm=10',                      '13-school-homes-10km'],
  ['?journey=agri',                                                 '14-agri-corridors'],
  ['?journey=agri&corridorId=<C>&maxKm=50',                         '15-agri-clusters'],
  ['?journey=agri&clusterId=<CL>',                                  '16-agri-parcels'],
];
for (const [q, name] of S) await go(q, name);
```

Confirm the **layer for each URL** with the pure function rather than eyeballing:

```js
const layer = await page.evaluate(() => {
  // computeLayer isn't global; infer from the visible crumb + summary pill instead
  const crumb = [...document.querySelectorAll('.leaflet-container ~ *')]; // or read the panel header
  return document.body.innerText.match(/Showing[\s\S]{0,40}/)?.[0];
});
console.log(layer);
```

### Interactions to drive by clicking (not reachable by URL alone)

- **Buy/Rent toggle** (`DPBuyRent`) — flips prices and the noun ("homes for sale" ⇄ "rentals"); watch the helper line + every listing card.
- **Filters** (`DPFilterBar` on `area-listings`, `DPAgriFilters` on `agri-parcels`) — narrow the grid; over-filter to hit the **empty state** (`DPEmpty` with "Clear filters" / "Switch to Buy/Rent").
- **Radius chips** (`DPRadius` on `school-homes`) — 3/5/10 km; the map ring + home count recompute live.
- **Distance band** (`DPDistanceChips` on `agri-clusters`) — widens the evergreen wedge and reveals further towns.
- **Scoped search** (`DPScopedSearch`) — type an area/school name; results are scoped to the current region.
- **Map marker clicks** — click a region bubble / area pin / school pin to confirm it drives the same nav as the panel card (product rule #1).
- **Save** (heart on listing/parcel cards) — toggles `saved`.
- **Back / Start over** — `back()` walks one level up the funnel; `reset()` returns to the neutral landing.

Empty states are worth capturing explicitly:

```js
await go('?journey=listings', 'e1-listings');
// open filters, crank Verified-only + an impossible budget until the grid empties
await page.getByText('No homes match these filters').waitFor();
await page.screenshot({ path: 'shots/e2-listings-empty.png' });
```

---

## 4. Read the live state directly (optional, powerful)

Verify the model instead of trusting pixels:

```js
const probe = await page.evaluate(() => ({
  url: location.search,
  crumb: [...document.querySelectorAll('[style*="chevron"], .leaflet-container')].length,
  summaryPill: (document.body.innerText.match(/Showing[^\n]*/) || [])[0],
  hasMap: !!document.querySelector('.leaflet-container'),
  markers: document.querySelectorAll('.upt-pin').length,
  saved: (document.body.innerText.match(/Saved/) || []).length,
}));
console.log(probe);
```

The two rules to confirm live:
- Navigating into **agri** drops any `region=` from the URL (scope cleared).
- The summary-pill count equals the number of records the panel lists — counts are derived from `BLR_DATA`, never hard-coded (`BLR_COUNTS` / `BLR_AGRI`).

---

## 5. Responsive note

Unlike the older `discover_city.html` (which used a `compact` prop + Preview switcher), this `index.html` is a **desktop split with no built-in mobile breakpoint** — at narrow widths the 50/50 map/panel split just compresses. If you need a mobile story, the README's "Browse / Map bottom tabs" pattern from the earlier prototype is the reference; capture desktop here:

```js
await page.setViewportSize({ width: 1280, height: 800 });
await go('', '17-desktop-1280');
```

Flag this as a rebuild gap rather than a bug.

---

## 6. What to conclude — and how to rebuild it for real

After running the above you should be able to state, with a screenshot backing each claim:

1. It's **one shell**: a Leaflet map + an editorial panel, both switching on a single derived `layer`. `computeLayer()` is the entire routing table.
2. The two independent axes — **scope (region filter)** × **journey (area/school/listings/agri)** — and the 12 layers they produce.
3. That the **map and panel always mirror** the same records, and map clicks == card clicks.
4. That **agri is a walled-off model** (clears scope; separate counts).
5. That **all state lives in the URL** and is validated on load — the basis for shareable deep links and browser back/forward.
6. That **Buy/Rent, filters, radius and distance bands** re-derive counts and copy live, with graceful empty states.

### Rebuild notes (matching look & feel + real backend)

- **Data layer → API.** `src/data.js` (`BLR_DATA`, `BLR_COUNTS`, `BLR_AGRI`, `BLR_HOMES_NEAR`, haversine `BLR_DIST`) is the mock backend. Replace it with real endpoints returning the same shapes: `regions / groups / zones / areas / schools / listings` and a separate `agri {corridors, clusters, parcels, distances}` tree. Keep counts **server-derived** so the map and panel can't disagree. School-radius homes use live haversine — move that to a geo query (`ST_DWithin` / bounding-box + distance sort).
- **Keep the state machine.** `computeLayer` + the `pick*` / `back` / `reset` reducers are the real product logic — port them verbatim. Keep the **URL as the source of truth** (`history.replaceState`), and keep the on-load id validation that falls back to the nearest valid level.
- **Look & feel.** Everything is DS tokens from `styles.css` (navy/copper/greys, Fraunces serif hero, Plus Jakarta UI, Geist Mono for every number). The only non-token literals are the **plum** identity colour (add `--plum-*` to the token set) and the evergreen agri greens. Swap the inline card/panel markup for the real DS `Card` / `Button` / `Badge` / `TrustBadge`; the journey identity colour + selected ring stay as inline styles on tokens. Add `graduation-cap` + `sprout` to the bundled `Icon` set (they're drawn inline here because the subset doesn't ship them).
- **Map.** Existing Leaflet + CARTO Voyager tiles; markers are `divIcon` HTML strings (`regionBubble`, `bubblePill`, `areaPin`, `schoolPin`, `homePin`, `parcelPin`, `agriDirBubble`, `agriTownDisc` in `PortalMap.jsx`). In production these can stay HTML `divIcon`s or become a marker component; the collision/`flyToBounds` framing logic is reusable as-is.
- **Add the mobile layout.** This file has none — lift the compact/bottom-tabs arrangement from the earlier `discover_city.html` prototype, or add a `@media (max-width: 900px)` breakpoint that stacks panel-first with a map toggle.

The only non-production pieces are the mock `data.js` and the missing mobile breakpoint. Everything else — the one-shell model, the 12-layer routing, the URL state, the map⇄panel mirror, Buy/Rent, filters, radius/distance derivations, and the copy — is the intended behaviour.
