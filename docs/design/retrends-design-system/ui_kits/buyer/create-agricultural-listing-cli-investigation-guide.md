# Investigating the agricultural create-listing mock — a guide for Claude Code (CLI)

Goal: let the CLI **see for itself** how the agricultural create-listing mock is built, exercise every state of every component in a real browser, and understand the flow well enough to **rebuild it as a production page** (real backend, real geocoding/map) that matches this look and feel exactly.

Work top-down: understand the architecture → render it live → drive the state machine and screenshot each state → read the live model to confirm the product rules → then map each mocked piece to a real backend contract.

Primary file: `ui_kits/buyer/create-agricultural-listing.html`
Sibling references (same folder, same patterns): `create-residential-listing.html`, `create-commercial-listing.html`, and their `*-cli-investigation-guide.md` / `create-listing-location-build-notes.md`.

---

## 0. Orientation (read before running anything)

The mock is a **single self-contained HTML file** using React 18 + Babel-standalone, transpiled in the browser. No build step, no dev server beyond a static file server.

Architecture in one breath:

- `<link rel="stylesheet" href="../../styles.css">` — the design-system tokens (all `--evergreen-600`, `--copper-500`, `--navy-800`, `--font-sans`, `--font-serif`, `--font-mono`, `--border`, `--trust-verified-bg`, etc. live here). **This is where look-and-feel comes from — match it, don't re-invent colors.**
- `<script src="../../_ds_bundle.js">` — the compiled design system, exposed as the global `window.ReTrendsDesignSystem_f37966`. The mock pulls `{ Button, Input, Select }` from it.
- One `<script type="text/babel">` block holds everything else: an icon glyph map `I` (raw SVG path data rendered by a local `<Ico>` helper), a CSS-string→style-object helper `s()`, a handful of style-constant strings (`CARD`, `NUM`, `FLD`, …), and a single React class component `CreateAgriListing` that renders the whole page.
- The class holds `this.state`; the render helper `rv()` maps state → one big `R` object of values + handlers; `render()` (and its sub-renderers `header/locationCard/formCol/editRail/reviewView/footer/picker`) consume `R`.

**Do this first:**

```bash
# 1. Skim the component: state shape, the rv() map, and the sub-renderers
grep -n "this.state =" ui_kits/buyer/create-agricultural-listing.html
grep -n "rv()\|renderVals\|R = this.rv" ui_kits/buyer/create-agricultural-listing.html
grep -n "locationCard\|formCol\|editRail\|reviewView\|picker(R)\|footer(R)" ui_kits/buyer/create-agricultural-listing.html
# 2. The location state machine + the derived 'pinned' rule
grep -n "locStatus\|resolved\|pinDone\|pickerOpen\|geo:\|const pinned =" ui_kits/buyer/create-agricultural-listing.html
# 3. The design-system global + which primitives are used
grep -n "window.ReTrendsDesignSystem\|<Button\|<Input\|<Select" ui_kits/buyer/create-agricultural-listing.html
```

### State fields to understand

**Location flow (the heart of the page):**

| field | meaning |
|---|---|
| `locQuery` | raw text in the "Search village, locality or landmark" box |
| `locStatus` | `empty` → `typed` → `searching` → `results` → `notfound` / `resolved` |
| `locResults` | candidate matches shown under "Choose the nearest matched place" |
| `resolved` | the chosen candidate `{ line, sub, publicLoc, coords }` — enough to *enable* pinning, but **not** a confirmed location |
| `locSource` | `search` or `browser` (current-location path) |
| `geo` | `idle` → `prompt` → `locating` → `done` (browser-location permission flow) |
| `pickerOpen` | map-pin confirmation modal visibility |
| `pinDone` + `pinPos` | pin confirmed + its `{x,y}` % position on the map |
| `boundaryDrawn` | optional approximate outline sketch (a guide, **not** a legal boundary) |

Derived, in `rv()`: `const pinned = pinDone && !!resolved;` — the single source of truth for "location is confirmed".

**Rest of the form / page mode:**

| field | meaning |
|---|---|
| `v` | all form values (`{ areaUnit:'Acre', area, price, facing, roadAccess, water, soil, crops[], features[], survey, rtc, ownership, … }`) |
| `waterOpen` / `recordsOpen` | the two collapsible optional sections |
| `photos` / `coverPhoto` | photo count (0–6) + which tile is the cover |
| `nearby[]` / `poiDraft` | derived + broker-added nearby context; draft for the "add a landmark" form |
| `desc` / `aiState` / `tone` / `descUsed` | description text + AI drafting state (`idle` → `generating` → `ready`) |
| `mode` | `edit` → `review` (the two top-level page modes) |
| `published` | internal flag; when true, the "Submitted for review · Pending admin approval" success screen shows |

### Product rules to keep in mind while investigating

1. **Typed/searched text is not a confirmed location.** The pin stays disabled until `resolved` is set; the location isn't "confirmed" until `pinDone`. Only the confirmed map pin is the final listing location.
2. **The pin confirms a location, not a legal boundary or survey.** The optional outline is explicitly "approximate."
3. **Nearby context is gated** behind a confirmed pin (`pinned`). Before that it's a locked empty state.
4. **Lifecycle is honest:** Save draft → Review listing → Submit for review → **Pending admin approval**. There is no "Publish/Published" anywhere, and nothing is shown as platform-verified. Survey/RTC/ownership are labelled seller/broker-provided.

---

## 1. Render it in a real browser

The design system loads from `../../` (two levels up), so **serve from the project root**, not from the file's folder, or `styles.css` and `_ds_bundle.js` 404 (and the page renders unstyled / crashes on the missing global).

```bash
# from the project root
python3 -m http.server 8000
# then open:
# http://localhost:8000/ui_kits/buyer/create-agricultural-listing.html
```

Use Playwright for headless capture:

```bash
npm i -D playwright && npx playwright install chromium
```

```js
// screenshot.mjs — minimal harness
import { chromium } from 'playwright';
const url = 'http://localhost:8000/ui_kits/buyer/create-agricultural-listing.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 2400 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');           // React mounted
await page.screenshot({ path: 'shots/00-initial.png', fullPage: true });
console.log('console errors:', errors);            // expect [] (a Babel dev warning is fine)
await browser.close();
```

Babel transpiles at load, so always `waitForSelector('#root > *')` (or `networkidle`) before screenshotting — don't race the first paint.

---

## 2. Investigate each component visually

The design-system primitives (`Button`, `Input`, `Select`) come from `_ds_bundle.js`. To read their prop surface and how the mock uses them:

```bash
grep -n "window.ReTrendsDesignSystem" ui_kits/buyer/create-agricultural-listing.html
grep -n "<Button\|<Input\|<Select" ui_kits/buyer/create-agricultural-listing.html
```

For a canonical gallery of every DS component and every token, open the design-system card pages (each tagged `@dsCard`) rather than reverse-engineering from this one mock:

```bash
grep -rl "@dsCard" components tokens ui_kits | head -50
# serve + open any of them the same way
```

The icon set used here is the `I` object near the top of the babel block; each entry is raw SVG path data drawn by the local `<Ico inner={...}>` helper (not a DS component).

**Local (non-DS) components rendered by this page — screenshot each in its states:**

| component | where | states to capture |
|---|---|---|
| Location status stepper | top of section 1 | `No location selected` / `Pin confirmation pending` / `Location confirmed` (dot + 3-segment bar: search / choose match / confirm pin) |
| Address search | section 1 | empty, typed, searching (spinner), results list, not-found, resolved card |
| "Use my current location" | section 1 | link → permission rationale card → locating → resolved-via-browser |
| Confirm-pin block | section 1 | disabled (no match yet), enabled ("Map centred near…" + button), confirmed (green card + coords + Reposition) |
| Map-pin modal (`picker`) | overlay | open + draggable pin + amber "approximate pin, not a legal boundary" warning |
| Nearby context | section 1 | **locked** ("Nearby context is locked") vs **unlocked** (derived rows + "Add a local landmark") |
| Price breakdown | section 2 | empty ("derived once you add…") vs derived (per-acre / per-cent / per-sq.ft) |
| Collapsibles | sections 4 & 6 | collapsed vs expanded (Water/cultivation; Land-record details) |
| Photos grid | section 7 | 0 photos, some photos, cover selected, remove |
| Description + AI | section 8 | `idle` (prompt) → `generating` (spinner) → `ready` (editable textarea + Regenerate/Shorter/Factual) |
| Buyer preview rail | right column | no-photos vs photos; location "Confirmed" badge only after pin |
| Listing strength | right column | rows flip as fields complete (esp. "Matched place selected", "Exact land pin confirmed") |
| Review view | `mode:'review'` | full listing-detail preview |
| Success screen | `published:true` | "Submitted for review" + "Pending admin approval" pill |

---

## 3. Drive the state machine and screenshot every state

The geocoder and browser-location are **mocked with ~700–850ms timeouts** (`mockResults`, `findLocation`, `allowGeo`), so wait after each trigger. Drive through the real DOM using the visible text/placeholders the mock exposes.

```js
const shot = (n) => page.screenshot({ path: `shots/${n}.png`, fullPage: true });
const clickExact = (t) => page.getByRole('button', { name: t, exact: true }).first().click();

// --- LOCATION FLOW ---

// 1. EMPTY — status pill "No location selected"; pin block disabled
await shot('01-empty');

// 2. TYPED — buyer preview shows "Location not confirmed" (ochre)
await page.fill('input[placeholder="Search village, locality or landmark"]', 'Hejamadi');
await shot('02-typed');

// 3. SEARCHING — spinner "Finding matching places…"
await clickExact('Search');
await shot('03-searching');

// 4. RESULTS — "Choose the nearest matched place"
await page.waitForTimeout(900);
await shot('04-results');

// 5. RESOLVED — pick the first candidate (row button ends with "Choose")
await page.locator('button', { hasText: /Choose$/ }).first().click();
await shot('05-resolved');            // "Search result selected" + "This is only your starting point…"

// 6. PIN ENABLED — "Map centred near …" + button
await page.getByText('Confirm land pin on map').scrollIntoViewIfNeeded();
await shot('06-pin-enabled');

// 7. MAP PICKER OPEN — draggable pin modal + amber warning
await clickExact('Confirm land pin on map');
await shot('07-picker-open');

// 8. PIN MOVED + CONFIRMED
const map = page.getByText('Drag or tap to move the pin to the land').locator('..');
await map.click({ position: { x: 300, y: 150 } });     // move the pin
await clickExact('Confirm land location');
await shot('08-pin-confirmed');       // "Location confirmed" + "≈ <coords>" + strength rows flip

// 8b. NEARBY UNLOCKED — now visible below the confirmed card
await page.getByText('Nearby context', { exact: true }).scrollIntoViewIfNeeded();
await shot('08b-nearby-unlocked');

// 8c. OPTIONAL OUTLINE
await clickExact('Sketch approximate outline');
await shot('08c-outline');            // "Approx. outline ≈ … Derived"

// 9. NOT-FOUND — re-search with junk
await page.fill('input[placeholder="Search village, locality or landmark"]', 'zz');
await clickExact('Search');
await page.waitForTimeout(900);
await shot('09-notfound');            // "We couldn't find that place"

// 10. BROWSER-LOCATION PATH
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await clickExact('Use my current location');
await shot('10a-geo-permission');     // rationale card
await clickExact('Allow location');
await page.waitForTimeout(1000);
await shot('10b-geo-resolved');       // resolved via browser; "Using your current location" badge

// --- REST OF THE FORM ---

// 11. PRICE BREAKDOWN (derived)
await page.fill('input[placeholder="e.g. 2.5"]', '2.5');
await page.fill('input[placeholder="e.g. 7800000"]', '7800000');
await shot('11-price-derived');       // per-acre / per-cent / per-sq.ft appear

// 12. COLLAPSIBLES
await page.getByText('Water, cultivation & suitability').click();
await shot('12a-water-open');
await page.getByText('Land record details').click();
await shot('12b-records-open');       // note "Seller / broker-provided details"

// 13. PHOTOS — click empty tiles (they render as "+")
await page.getByRole('button', { name: '+', exact: true }).first().click();
await shot('13a-one-photo');
await page.getByRole('button', { name: '+', exact: true }).first().click();
await shot('13b-two-photos');         // "Set cover" appears on the non-cover tile

// 14. DESCRIPTION AI
await page.getByText('Generate description').scrollIntoViewIfNeeded();
await clickExact('Generate description');
await shot('14a-ai-generating');
await page.waitForTimeout(800);
await shot('14b-ai-ready');           // editable draft + Regenerate/Make shorter/More factual

// --- PAGE MODE ---

// 15. REVIEW MODE
await clickExact('Review listing');
await page.waitForTimeout(300);
await shot('15-review');              // listing-detail preview; "Before you submit for review"

// 16. SUBMITTED — pending admin approval
await clickExact('Submit for review');
await shot('16-submitted');           // "Submitted for review" + "Pending admin approval" pill
```

Diff the screenshots against the component-states table in §2. Every state named there should have a matching `shots/*.png`.

---

## 4. Read the live state directly (confirm the product rules)

Verify the UI matches the model without guessing from pixels:

```js
const probe = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    statusNoLocation:   t.includes('No location selected'),
    statusPending:      t.includes('Pin confirmation pending'),
    statusConfirmed:    t.includes('Location confirmed'),
    previewUnconfirmed: t.includes('Location not confirmed'),
    resultSelected:     t.includes('Search result selected') || t.includes('Using your current location'),
    startingPointNote:  t.includes('only your starting point'),
    privacyLine:        t.includes('Buyers see only'),
    pinDisabledMsg:     t.includes('Choose a matched place above'),
    pinCentred:         t.includes('Map centred near'),
    pinConfirmedCoords: t.includes('\u2248'),                 // "≈ 13.xxxx° N …"
    nearbyLocked:       t.includes('Nearby context is locked'),
    nearbyUnlocked:     t.includes('Refresh from map'),
    notLegalBoundary:   t.includes('not a legal boundary'),
    lifecyclePending:   t.includes('Pending admin approval'),
    noPublishWord:      !/\bpublish(ed)?\b/i.test(t),         // must be true
  };
});
console.log(probe);
```

Key assertions to hold:
- `resultSelected` true but `statusConfirmed` false ⇒ nearby stays **locked** and the buyer-preview "Confirmed" badge is absent (pinning gated on `pinDone`).
- `nearbyLocked` XOR `nearbyUnlocked` — never both.
- `noPublishWord` is **true** everywhere (lifecycle uses review/approval language only).
- `notLegalBoundary` present wherever the pin/outline is confirmed.

---

## 5. Responsive / narrow-viewport check

This file has **no `@media` breakpoints** — fluidity comes only from `flex-wrap` and `minmax()` grids (the outer container is capped at `max-width: 1180px`). So at narrow widths the two-column edit grid does *not* cleanly collapse the way the residential mock does. Re-run the key shots at a phone width and note what wraps vs. overflows — this is a gap to design for in the real build:

```js
await page.setViewportSize({ width: 390, height: 3000 });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await shot('17-mobile-initial');
// repeat steps 2→8; watch the search row (input + "Search"), the picker modal, and the preview rail
```

---

## 6. Rebuild it with a real backend (the point of all this)

The intended production route is `/broker/listings/new/agricultural` (later tied into the New-Listing journey selector alongside residential/commercial — see issue #1719). Everything except the two mocked async calls is intended behaviour; keep the state model, gating, copy, and privacy handling. Map the mock to real services like this:

**Geocoding / search** — replace `mockResults(q)` + the timeout in `findLocation()`:
- Wire `findLocation` → a places/geocoding autocomplete API (e.g. a Places Autocomplete → Geocode). Keep the `locStatus` machine (`searching`/`results`/`notfound`) exactly.
- Each candidate must carry a **public** display value (`publicLoc`, village/taluk) *and* private precise data (`line`, `coords`) — the UI already separates these; the API layer must too.

**Browser location** — replace `allowGeo()`'s timeout with the real `navigator.geolocation.getCurrentPosition` + reverse-geocode. Keep the `geo` permission states (`prompt`/`locating`/`done`) and the "we only centre the map" rationale copy.

**Map + pin confirmation** — the static grid `<div>` and `picker` modal stand in for a real map SDK:
- Mount an interactive map (Leaflet/Mapbox/Google) centred on `resolved.coords`.
- `confirmPin()` persists the exact `{lat,lng}` (from the dragged pin) as the listing's confirmed location. The optional `boundaryDrawn` outline maps to an approximate polygon — store it flagged as **approximate, non-legal**; never present it as a survey boundary.
- Preserve the gate: `pinned = pinDone && resolved`. Persist confirmation as its own field; a saved draft with a resolved-but-unpinned location must reload as *pending*, not confirmed.

**Nearby context** — `deriveNearby()` returns qualitative placeholders (Adjoining / Nearby / Few km) tagged "Derived from map". In production, query a POI/roads service **only after** the pin is confirmed, and render real distances only from that data. Do **not** hard-code exact POIs/distances. Broker-added landmarks (`poiDraft`/`addPoi`) must stay tagged "Added by broker", not platform-verified.

**Description AI** — `buildDesc()` composes strictly from entered fields; `generate()` is a local timeout. Replace with a real drafting call, but keep the constraint: **only** facts the user entered, never invented title/conversion/yield/verification claims.

**Lifecycle / persistence** — `mode` and `published` are local. Wire to real endpoints:
- Save draft → `PATCH` draft listing.
- Review listing → client-side `mode:'review'` (no write needed).
- Submit for review → `POST` submit; server sets status **pending admin approval**. Buyers never see it until an admin approves. Never expose a "publish/published" state.

**Land records** — survey number, RTC, ownership are seller/broker-entered and shown exactly as written. Only ever render a "verified" affordance if a real verification pipeline exists; the mock deliberately shows none.

---

## 7. Match the look and feel

- **Tokens, not hex.** Every color/space/radius/shadow is a CSS variable in `../../styles.css` (`--evergreen-600` is the agri accent, `--copper-500` the brand copper, `--navy-900` headings, `--trust-verified-bg/-fg` for confirmed states, `--ochre-50/-600` for pending/caution). Build the real page against those same tokens.
- **Type:** `--font-serif` for page/section H1s, `--font-sans` for body/labels, `--font-mono` for prices, coordinates and refs. Sizes/weights are visible in the style-constant strings (`CARD`, `FLD`, `HINT`, `NUM`, `BIG`, …) near the top of the babel block — lift them.
- **Components:** reuse the real design-system `Button`/`Input`/`Select` (same package that compiles into `_ds_bundle.js` / `window.ReTrendsDesignSystem_f37966`), not bespoke clones.
- **Density & rhythm:** rounded 16px cards, numbered section heads (evergreen circle), 44–48px controls, chip groups with `flex`+`gap`. Keep the calm rural/agri tone in copy.

---

## 8. What to conclude

After running the above you should be able to state, with a screenshot backing each claim:

1. Which DS components the page uses and where they come from (`_ds_bundle.js` global) vs. which are local (icons, status stepper, map/picker, price breakdown).
2. The full agricultural **location state machine** and the exact transitions across empty → typed → searching → results/notfound → resolved → pin-enabled → pin-confirmed, plus the browser-location branch.
3. That **pinning is gated on a resolved location, and nearby context is gated on a confirmed pin** — verified live in §4.
4. How public (`publicLoc`) vs private (exact `coords`/`line`) location data is separated.
5. That the lifecycle is **Save draft → Review → Submit → Pending admin approval** with no "publish" anywhere, and records are shown unverified.
6. A concrete mapping (from §6) of every mocked piece to a real backend/API + the `/broker/listings/new/agricultural` route, so the page can be rebuilt with production behaviour while matching this look and feel.
