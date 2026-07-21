# Investigating the create-listing mock — a guide for Claude Code (CLI)

Goal: let the CLI **see for itself** how the residential create-listing mock is built and how each component looks in every state — not just read the source. Work top-down: understand the architecture, render it in a real browser, then drive the state machine and screenshot each state.

Primary file: `ui_kits/buyer/create-residential-listing.html`
Companion spec: `ui_kits/buyer/create-listing-location-build-notes.md`

---

## 0. Orientation (read before running anything)

The mock is a **single self-contained HTML file** using React 18 + Babel-standalone, transpiled in the browser. There is no build step and no dev server required beyond a static file server.

Architecture in one breath:

- `<link rel="stylesheet" href="../../styles.css">` — the design-system tokens (all `--navy-800`, `--copper-500`, `--font-sans`, etc. live here).
- `<script src="../../_ds_bundle.js">` — the compiled design system. It exposes a global: `window.ReTrendsDesignSystem_f37966`, from which the mock pulls `{ Button, Input, Select }`.
- One `<script type="text/babel">` block holds everything else: an icon glyph map `I`, and a single React class component that renders the whole page.
- State machine lives in that class: `this.state` holds the form values plus the location/pin flow (`locStatus`, `resolved`, `pinDone`, `pickerOpen`, `geo`, …). The render helper `rv()` maps state → a big `R` object of values + handlers; `render()` consumes `R`.

**Do this first:**

```bash
# 1. Read the two docs end to end
sed -n '1,120p' ui_kits/buyer/create-listing-location-build-notes.md
# 2. Skim the component: state shape, the rv() map, and the render() JSX
grep -n "this.state =" ui_kits/buyer/create-residential-listing.html
grep -n "rv()" ui_kits/buyer/create-residential-listing.html
grep -n "locStatus\|resolved\|pinDone\|pickerOpen\|geo:" ui_kits/buyer/create-residential-listing.html
```

The state fields to understand (location flow):

| field | meaning |
|---|---|
| `locQuery` | raw text in the address search box |
| `locStatus` | `empty` → `typed` → `searching` → `results` → `notfound` / `resolved` |
| `locResults` | candidate matches shown in the results list |
| `resolved` | the chosen candidate `{line, sub, publicLoc}` — enough to enable pinning |
| `locSource` | `search` or `browser` |
| `geo` | `idle` → `prompt` → `locating` → `done` (browser-location permission) |
| `pickerOpen` | map picker modal visibility |
| `pinDone` + `pinPos` | pin confirmed + its x/y position |

Product rule to keep in mind while investigating: **typed text is not a location.** The pin stays disabled until `resolved` is set; location isn't "complete" until `pinDone`.

---

## 1. Render it in a real browser

The design system loads from `../../` (two levels up), so **serve from the project root**, not from the file's folder, or the stylesheet and bundle 404.

```bash
# from the project root
python3 -m http.server 8000
# then open:
# http://localhost:8000/ui_kits/buyer/create-residential-listing.html
```

Use a headless browser to capture — Playwright is the most reliable:

```bash
npm i -D playwright && npx playwright install chromium
```

Sanity check the page mounted (React renders into `#root`) and there are no console errors:

```js
// screenshot.mjs — minimal harness
import { chromium } from 'playwright';
const url = 'http://localhost:8000/ui_kits/buyer/create-residential-listing.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 2000 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');           // React mounted
await page.screenshot({ path: 'shots/00-initial.png', fullPage: true });
console.log('console errors:', errors);
await browser.close();
```

Babel transpiles at load, so always `waitForSelector('#root > *')` (or `networkidle`) before screenshotting — don't race the first paint.

---

## 2. Investigate each component visually

The design-system primitives (`Button`, `Input`, `Select`) come from `_ds_bundle.js`. To see them in isolation and read their prop surface:

```bash
# what the bundle exposes and how the mock uses each primitive
grep -n "window.ReTrendsDesignSystem" ui_kits/buyer/create-residential-listing.html
grep -n "<Button\|<Input\|<Select" ui_kits/buyer/create-residential-listing.html
```

For a canonical gallery of every DS component, open the design-system card pages (each is tagged `@dsCard`) rather than reverse-engineering from this one mock:

```bash
grep -rl "@dsCard" components tokens ui_kits | head -50
# open any of them the same way via the http server
```

To see the icon set used here, the glyph map is the `I` object near the top of the babel block — each entry is raw SVG path data rendered by the local `<Ico>` helper.

---

## 3. Drive the state machine and screenshot every state

This is the important part: the location/pin flow has ten states and you want to *see* each. Drive it through the real DOM (same selectors the mock exposes). Add these steps to the harness, screenshotting after each transition. The geocoder and browser-location are **mocked with ~750–900ms timeouts**, so wait after each trigger.

```js
const shot = (n) => page.screenshot({ path: `shots/${n}.png`, fullPage: true });
const clickText = (t) => page.getByRole('button', { name: t, exact: true }).first().click();

// 1. EMPTY — nothing typed
await shot('01-empty');

// 2. TYPED, NOT CONFIRMED — buyer preview shows "Location not confirmed"
await page.fill('input[placeholder^="Search address"]', 'Indiranagar');
await shot('02-typed');

// 3. SEARCHING
await clickText('Find location');
await shot('03-searching');           // spinner

// 4. RESULTS SHOWN
await page.waitForTimeout(900);
await shot('04-results');             // "Select the closest match"

// 5. RESOLVED — pick the first candidate
await page.getByText('Select the closest match')
         .locator('xpath=following-sibling::button[1]').click();
await shot('05-resolved');            // "Location found" + "Buyers see only …"

// 6. MAP PIN ENABLED — scroll to Section 6
await page.getByText('Pin location on map').scrollIntoViewIfNeeded();
await shot('06-pin-enabled');         // "Map centred near …"

// 7. MAP PICKER OPEN
await clickText('Pin location on map');
await shot('07-picker-open');         // draggable pin modal

// 8. PIN ADJUSTED + CONFIRMED
const map = page.locator('text=Drag or tap to move the pin').locator('..');
await map.click({ position: { x: 260, y: 120 } });   // move the pin
await clickText('Confirm pin');
await shot('08-pin-confirmed');       // "Map pin confirmed" + strength row flips

// 9. NOT-FOUND ERROR — re-search with junk
await page.fill('input[placeholder^="Search address"]', 'zz');
await clickText('Find location');
await page.waitForTimeout(900);
await shot('09-notfound');            // "We couldn't find that location"

// 10. BROWSER-LOCATION PATH
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await clickText('Use my current location');
await shot('10a-geo-permission');     // rationale card
await clickText('Allow location');
await page.waitForTimeout(1000);
await shot('10b-geo-resolved');       // resolved via browser, source badge differs
```

Then diff the screenshots against the state list in the build-notes doc (§ "Required design states"). Every state named there should have a matching `shots/*.png`.

---

## 4. Read the live state directly (optional, powerful)

To confirm the UI matches the underlying model, inspect what the mock renders for each state without guessing from pixels:

```js
// dump the visible location/pin signals as plain booleans
const probe = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    previewUnconfirmed: t.includes('Location not confirmed'),
    resolved: t.includes('Location found') || t.includes('Using your current location'),
    privacyLine: t.includes('Buyers see only'),
    pinDisabledMsg: t.includes('Add or confirm the address above'),
    pinCentred: t.includes('Map centred near'),
    pinConfirmed: t.includes('Map pin confirmed'),
    previewConfirmed: t.includes('Location confirmed'),
    strengthLocationEntered: t.includes('Location entered'),
  };
});
console.log(probe);
```

This is how you verify the product rule holds: `resolved` true but `pinConfirmed` false should still leave listing-strength's "Map pin confirmed" row off.

---

## 5. Mobile / responsive check

The layout has breakpoints at 920px and 560px (grid collapses, address search stacks, top nav hides). Re-run the key screenshots at a phone viewport:

```js
await page.setViewportSize({ width: 390, height: 2200 });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await shot('11-mobile-initial');
// then repeat steps 2→8 to see the stacked address search + picker on mobile
```

---

## 6. What to conclude

After running the above you should be able to state, with a screenshot backing each claim:

1. Which DS components the mock uses and where they come from (`_ds_bundle.js` global).
2. The full location state machine and the exact transitions between the ten states.
3. That pinning is gated on a resolved location (the core product rule), verified live in step 4.
4. How public (`publicLoc`) vs private (exact pin/line) address data is separated in the UI.
5. How the mobile layout differs.

The mocked geocoder/browser-location (`mockResults`, timeouts in `findLocation`/`allowGeo`) is the only non-production piece — everything else (state model, gating, copy, privacy handling) is the intended behaviour, and the build-notes doc maps each of these to real geocoding/map-SDK calls for implementation.
