# Investigating the commercial create-listing mock — a guide for Claude Code (CLI)

Goal: let the CLI **see for itself** how the commercial create-listing mock is built and how each component looks in every state — not just read the source. Work top-down: understand the architecture, render it in a real browser, then drive the state machine and screenshot each state.

Primary file: `ui_kits/buyer/create-commercial-listing.html`
Companion spec: `ui_kits/buyer/create-listing-location-build-notes.md` (the address/pin state model is identical to residential and applies verbatim here)

This is the commercial sibling of `create-residential-listing.html`. It shares the same shell, address/map-pin flow, and photo grid, but the fields, copy, preview and listing-strength are commercial-specific.

---

## 0. Orientation (read before running anything)

Single self-contained HTML file, React 18 + Babel-standalone transpiled in the browser. No build step.

- `<link rel="stylesheet" href="../../styles.css">` — design-system tokens (`--navy-800`, `--copper-500`, `--font-sans`, …).
- `<script src="../../_ds_bundle.js">` — compiled design system, exposes `window.ReTrendsDesignSystem_f37966`; the mock pulls `{ Button, Input, Select }`.
- One `<script type="text/babel">` block: icon glyph map `I`, config constants (`TYPES`, `SUIT`, `HUBS`), and one React class `CreateCommercialListing`.
- State lives in that class. `rv()` maps `state` → a big `R` object of values + handlers; `render()` (and its helpers `formCol`, `editRail`, `reviewView`, `footer`, `picker`) consume `R`.

**Do this first:**

```bash
sed -n '1,120p' ui_kits/buyer/create-listing-location-build-notes.md
grep -n "this.state =" ui_kits/buyer/create-commercial-listing.html
grep -n "rv()\|renderVals\|reviewView\|picker(R)" ui_kits/buyer/create-commercial-listing.html
grep -n "const TYPES\|const SUIT\|const HUBS" ui_kits/buyer/create-commercial-listing.html
grep -n "locStatus\|resolved\|pinDone\|pickerOpen\|geo:" ui_kits/buyer/create-commercial-listing.html
```

Commercial-specific structure to understand:

- **Subtypes** (`ctype`): `shop` · `office` · `building` · `warehouse` · `land`. Set in Section 1. Field visibility (Sections 3–7) is driven by `ctype` — e.g. `isWarehouse` shows clear height / loading bays / truck access; `isLand` hides utilities.
- **Purpose** (`purpose`): `sale` · `rent` · `lease` (`isRL = rent||lease`). Switches Section 5 between sale terms and rent/lease terms.
- **Business suitability** (`v.suit`, from `SUIT[ctype]`) — multi-select chips, "suitable for" not a legal claim.
- **Lifecycle**: honest `Save draft → Review & submit → Submit for review → Submitted · pending admin approval`. There is deliberately **no "Publish"** anywhere.

Location-flow state fields (identical to residential):

| field | meaning |
|---|---|
| `locQuery` | raw text in the address search box |
| `locStatus` | `empty` → `typed` → `searching` → `results` → `notfound` / `resolved` |
| `resolved` | chosen candidate `{line, sub, publicLoc}` — enough to enable pinning |
| `locSource` | `search` or `browser` |
| `geo` | `idle` → `prompt` → `locating` → `done` |
| `pickerOpen` / `pinDone` / `pinPos` | picker modal / pin confirmed / pin x-y |

Product rule: **typed text is not a location.** Pin stays disabled until `resolved`; location isn't "complete" until `pinDone`.

---

## 1. Render it in a real browser

Design system loads from `../../`, so **serve from the project root**, not the file's folder, or `styles.css` and `_ds_bundle.js` 404.

```bash
python3 -m http.server 8000
# open: http://localhost:8000/ui_kits/buyer/create-commercial-listing.html
```

Playwright harness — confirm React mounted (`#root`) and no console errors:

```js
import { chromium } from 'playwright';
const url = 'http://localhost:8000/ui_kits/buyer/create-commercial-listing.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await page.screenshot({ path: 'shots/00-initial.png', fullPage: true });
console.log('console errors:', errors);
```

Babel transpiles at load — always `waitForSelector('#root > *')` before capturing.

---

## 2. Investigate each component visually

DS primitives (`Button`, `Input`, `Select`) come from `_ds_bundle.js`:

```bash
grep -n "window.ReTrendsDesignSystem" ui_kits/buyer/create-commercial-listing.html
grep -n "<Button\|<Input\|<Select" ui_kits/buyer/create-commercial-listing.html
```

For a canonical gallery of every DS component, open the `@dsCard`-tagged pages instead of reverse-engineering from this mock:

```bash
grep -rl "@dsCard" components tokens ui_kits | head -50
```

The icon set is the `I` object at the top of the babel block (raw SVG paths rendered by `<Ico>`); subtype/section icons are mapped in `TYPES` and `ICON`.

---

## 3. Drive the state machine and screenshot every state

The geocoder and browser-location are **mocked with ~750–900ms timeouts**, so wait after each trigger. Add these to the harness:

```js
const shot = (n) => page.screenshot({ path: `shots/${n}.png`, fullPage: true });
const clickText = (t) => page.getByRole('button', { name: t, exact: true }).first().click();

// --- SUBTYPE + PURPOSE (Section 1) ---
await shot('01-empty');                       // default: shop / for sale
for (const [label, tag] of [['Office space','office'],['Commercial building','building'],['Warehouse','warehouse'],['Land / plot','land']]) {
  await clickText(label);
  await shot(`02-type-${tag}`);               // Sections 3–7 change per subtype
}
await clickText('Shop / showroom');
await clickText('For rent');  await shot('03-purpose-rent');   // Section 5 → rent/lease terms
await clickText('For sale');

// --- ADDRESS / LOCATION (Section 2) ---
await page.fill('input[placeholder^="Search address"]', 'Whitefield');
await shot('04-typed');                        // preview: "Location not confirmed"
await clickText('Find location');
await shot('05-searching');                    // spinner
await page.waitForTimeout(900);
await shot('06-results');                      // "Select the closest match"
await page.getByText('Select the closest match')
         .locator('xpath=following-sibling::button[1]').click();
await shot('07-resolved');                     // "Location found" + "Buyers see only …"

// --- MAP PIN (Section 9) ---
await page.getByText('Pin location on map').scrollIntoViewIfNeeded();
await shot('08-pin-enabled');                  // "Map centred near …"
await clickText('Pin location on map');
await shot('09-picker-open');                  // draggable pin modal
const map = page.locator('text=Drag or tap to move the pin').locator('..');
await map.click({ position: { x: 260, y: 120 } });
await clickText('Confirm pin');
await shot('10-pin-confirmed');                // "Map pin confirmed" + nearby POIs load

// --- SUITABILITY + PHOTOS ---
await page.getByText('Retail', { exact: true }).click();
await page.getByText('Showroom', { exact: true }).click();
await shot('11-suitability');
// photo tiles: click the first empty "+" tile a few times, then "Set cover" on another
await shot('12-photos');

// --- NOT-FOUND ERROR ---
await page.fill('input[placeholder^="Search address"]', 'zz');
await clickText('Find location');
await page.waitForTimeout(900);
await shot('13-notfound');

// --- BROWSER-LOCATION PATH ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await clickText('Use my current location');
await shot('14a-geo-permission');
await clickText('Allow location');
await page.waitForTimeout(1000);
await shot('14b-geo-resolved');

// --- REVIEW + SUBMIT LIFECYCLE ---
await clickText('Review & submit');            // footer CTA
await page.waitForTimeout(400);
await shot('15-review');                        // "Before you submit"; no "publish" anywhere
await clickText('Submit for review');
await shot('16-submitted');                     // "Submitted for review · pending admin approval"
```

Diff the screenshots against the "Design states required" list in the commercial spec. Every state named there should have a matching `shots/*.png`.

---

## 4. Read the live state directly (verify the rules)

```js
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
    suitabilityRow: t.includes('Business suitability added'),
    noPublishWord: !/publish/i.test(t),   // lifecycle guardrail
  };
});
console.log(probe);
```

Two rules to confirm hold:
1. `resolved` true but `pinConfirmed` false must still leave listing-strength's "Map pin confirmed" row off (location entered ≠ location complete).
2. `noPublishWord` must be `true` in every state — the lifecycle is Save draft → Submit for review → Pending admin approval.

---

## 5. Mobile / responsive check

Breakpoints at 920px (grids collapse, top nav hides, photo grid → 3 cols) and 560px (address search stacks).

```js
await page.setViewportSize({ width: 390, height: 2400 });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await shot('17-mobile-initial');
// repeat steps 4→10 to see the stacked address search + picker on mobile
```

---

## 6. What to conclude

With a screenshot backing each claim, you should be able to state:

1. Which DS components the mock uses and where they come from (`_ds_bundle.js` global).
2. How `ctype` drives field visibility across Sections 3–7, and how `purpose` switches Section 5 terms.
3. The full location state machine and its transitions (identical to residential).
4. That pinning is gated on a resolved location (verified live in step 4).
5. That the lifecycle is honest — no "Publish", ending in pending admin approval — and listing-strength/trust badges avoid fake claims.
6. How public (`publicLoc`) vs private (exact pin/line) address data is separated.
7. How the mobile layout differs.

The mocked geocoder/browser-location (`mockResults`, timeouts in `findLocation`/`allowGeo`) is the only non-production piece — swap for a real geocoding/map SDK in production. Everything else (state model, gating, copy, privacy handling, submit lifecycle) is intended behaviour; the build-notes doc maps each to real implementation.
