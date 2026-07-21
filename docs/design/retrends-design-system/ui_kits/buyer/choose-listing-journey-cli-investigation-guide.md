# Investigating the choose-listing-journey mock — a guide for Claude Code (CLI)

Goal: let the CLI **see for itself** how the journey-selector screen is built, what every component state looks like, and how it routes into the three listing forms — so it can rebuild this page with real backend behaviour and matching look & feel. Work top-down: understand the architecture, render it in a real browser, then drive the interaction states and screenshot each one.

Primary file: `ui_kits/buyer/choose-lisiting-journey.html`
Downstream files it routes into: `create-residential-listing.html`, `create-commercial-listing.html`, `create-agricultural-listing.html` (each has its own `*-cli-investigation-guide.md`).

---

## 0. Orientation (read before running anything)

This is the **first screen after "New listing"**: a three-card selector that routes the user into the residential / commercial / agricultural form. It's a **single self-contained HTML file** using React 18 + Babel-standalone, transpiled in the browser. No build step, no dev server beyond a static file server.

Architecture in one breath:

- `<link rel="stylesheet" href="../../styles.css">` — the design-system tokens (`--navy-800`, `--copper-500`, `--font-sans`, `--font-serif`, `--paper`, `--canvas-100`, etc. all live here).
- `<script src="../../_ds_bundle.js">` — the compiled design system (`window.ReTrendsDesignSystem_f37966`). **Note:** this page loads the bundle but does **not** consume any of its components — everything is rendered inline. Its only real dependency on the DS is the CSS tokens. (When you rebuild for production you *should* swap the inline markup for the real DS `Button`/`Card` primitives — see §6.)
- One `<script type="text/babel">` block holds everything: an icon glyph map `I` (raw Lucide SVG paths), a `s()` helper that turns a CSS string into a React style object, an `<Ico>` SVG renderer, a `JOURNEYS` data array, and a single React class `ChooseJourney` that renders the whole page.

**Do this first — skim the structure:**

```bash
grep -n "const JOURNEYS" ui_kits/buyer/choose-lisiting-journey.html
grep -n "this.state" ui_kits/buyer/choose-lisiting-journey.html
grep -n "launch(\|header()\|card(\|helper()\|overlay()\|render()" ui_kits/buyer/choose-lisiting-journey.html
grep -n "LS_KEY\|localStorage\|window.location.href" ui_kits/buyer/choose-lisiting-journey.html
```

### The data model — `JOURNEYS`

Three journey objects drive the whole screen. Each has: `key`, `icon`, `label`, `tag` (eyebrow), `desc`, `examples[]` (the "Includes" pills), `cta` (button text), and `href` (where the card navigates).

| key | label | href |
|---|---|---|
| `residential` | Residential | `create-residential-listing.html` |
| `commercial` | Commercial | `create-commercial-listing.html` |
| `agri` | Agricultural land | `create-agricultural-listing.html` |

`JMAP` is `{key → journey}`; `LS_KEY = 'retrends:lastJourney'` is where the last-picked journey is remembered.

### The state shape (`this.state`)

| field | meaning |
|---|---|
| `hover` | key of the card under the mouse (drives lift + navy fill) — or `null` |
| `focus` | key of the keyboard-focused card (adds the 3px navy focus ring) — or `null` |
| `launching` | key of the journey being opened → shows the full-screen spinner overlay |
| `last` | key read from `localStorage[LS_KEY]` at construct time → drives the "Last used" badge |

**The interaction contract to keep in mind:** clicking a card (or its button, or pressing Enter/Space while focused) calls `launch(key)`, which (1) writes `key` to localStorage, (2) sets `launching`, (3) shows a spinner overlay for **950ms**, then (4) sets `window.location.href = JMAP[key].href`. The navigation delay is purely cosmetic — in production this is where you'd start the real route transition / prefetch the form.

---

## 1. Render it in a real browser

The design system loads from `../../` (two levels up), so **serve from the project root**, not from the file's folder, or the stylesheet 404s.

```bash
# from the project root
python3 -m http.server 8000
# then open:
# http://localhost:8000/ui_kits/buyer/choose-lisiting-journey.html
```

Use Playwright to capture:

```bash
npm i -D playwright && npx playwright install chromium
```

Sanity-check the mount (React renders into `#root`) and that there are no console errors:

```js
// screenshot.mjs — minimal harness
import { chromium } from 'playwright';
const url = 'http://localhost:8000/ui_kits/buyer/choose-lisiting-journey.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');           // React mounted
await page.screenshot({ path: 'shots/00-initial.png', fullPage: true });
console.log('console errors:', errors);
await browser.close();
```

Babel transpiles at load — always `waitForSelector('#root > *')` before screenshotting.

---

## 2. Inventory the components & their look

There are five render helpers on the class; screenshotting the initial page (`00-initial.png`) shows all of them at rest:

- `header()` — sticky 64px top bar: **Re**Trends wordmark (copper "Re" + navy "Trends") with pin glyph, nav links (Discover / Schools / Trends / Broker dashboard), "New listing" label, and a mono `TE` avatar. Nav links hide under 620px.
- The **hero** block (inside `render()`): copper eyebrow "New listing", Fraunces serif `<h1>` "Create a new listing", muted intro paragraph.
- `card(j)` — the three journey cards (see §3 for states).
- `helper()` — the footer block below a hairline rule: a "Not sure which to pick?" help line, a **lifecycle stepper** (`Create listing → Save draft → Submit for review → Pending admin approval`, first step highlighted navy), and the "Listings aren't published instantly" note. This encodes the real product lifecycle — worth preserving verbatim.
- `overlay()` — the full-screen launching spinner (see §3, state 6).

To confirm what the shared DS bundle *would* give you (for the production rebuild), open a DS card gallery instead of reverse-engineering primitives from this mock:

```bash
grep -rl "@dsCard" components tokens ui_kits | head -50
grep -n "window.ReTrendsDesignSystem" ui_kits/buyer/create-residential-listing.html  # example of a page that DOES consume the bundle
```

---

## 3. Drive the states and screenshot each

The interesting states here are per-card hover/focus, the last-used memory, and the launch overlay. Add these to the harness.

```js
const shot = (n) => page.screenshot({ path: `shots/${n}.png`, fullPage: true });
const card = (label) => page.getByRole('button', { name: label, exact: true }).first();

// 1. INITIAL — three cards at rest, no "Last used" badge
await shot('01-initial');

// 2. HOVER — card lifts 3px, icon tile inverts to navy w/ copper glyph, CTA fills navy
await card('Create residential listing').hover();
await shot('02-hover-residential');
await card('Create commercial listing').hover();
await shot('03-hover-commercial');

// 3. KEYBOARD FOCUS — 3px navy focus ring (box-shadow var(--ring))
await page.keyboard.press('Tab');           // walk focus onto the first card
await page.keyboard.press('Tab');
await shot('04-focus-ring');

// 4. LAST-USED MEMORY — seed localStorage, reload; the matching card shows a
//    copper "Last used" pill top-right
await page.evaluate(() => localStorage.setItem('retrends:lastJourney', 'agri'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await shot('05-last-used-agri');

// 5. LAUNCH OVERLAY — click a card, capture the spinner BEFORE it navigates (950ms window)
await card('Create residential listing').click();
await page.waitForTimeout(250);             // inside the 950ms delay
await shot('06-launching-overlay');         // "Opening the residential form…"
// (after ~950ms it navigates to create-residential-listing.html)
```

**Verify the routing contract** rather than trusting the pixels — confirm each card navigates to the right form:

```js
for (const [cta, expect] of [
  ['Create residential listing', 'create-residential-listing.html'],
  ['Create commercial listing',  'create-commercial-listing.html'],
  ['Create agricultural listing', 'create-agricultural-listing.html'],
]) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#root > *');
  await page.getByRole('button', { name: cta, exact: true }).first().click();
  await page.waitForURL('**/' + expect, { timeout: 3000 });
  console.log('✓', cta, '→', new URL(page.url()).pathname.split('/').pop());
}
```

---

## 4. Read the live state directly (optional, powerful)

Confirm the memory + launch model without guessing from pixels:

```js
const probe = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    lastUsedPill:   t.includes('Last used'),
    lsValue:        localStorage.getItem('retrends:lastJourney'),
    lifecycleShown: t.includes('Pending admin approval'),
    launching:      t.includes('Opening the'),
  };
});
console.log(probe);
```

The product rule to confirm: the "Last used" pill appears **only** on the card whose `key` equals `localStorage['retrends:lastJourney']`, and it persists across reloads.

---

## 5. Mobile / responsive check

Breakpoints: **820px** (the 3-col grid collapses to one column) and **620px** (nav links hide, header padding tightens). Re-run at a phone viewport:

```js
await page.setViewportSize({ width: 390, height: 1600 });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#root > *');
await shot('07-mobile-stacked');   // single-column cards, nav links gone
```

---

## 6. What to conclude — and how to rebuild it for real

After running the above you should be able to state, with a screenshot backing each claim:

1. The screen is a pure **router**: its only job is to pick one of three journeys and navigate to that form. No form data is captured here.
2. The three journeys, their copy, their "Includes" examples, and their exact target `href`s (§0 table).
3. The four visual states of a card — rest / hover / focus / last-used — and what changes in each (lift, navy fill, focus ring, copper pill).
4. The launch overlay is a **950ms cosmetic delay** before a hard `window.location.href` navigation.
5. The last-used journey is remembered in `localStorage['retrends:lastJourney']`.
6. The lifecycle stepper (`Create → Save draft → Submit for review → Pending admin approval`) is real product copy and should carry into production.

### Rebuild notes (matching look & feel + real backend)

- **Look & feel:** keep the DS tokens (`styles.css`) verbatim — navy `--navy-800`, copper accent used sparingly (eyebrow, "Last used" pill, hover glyph), Fraunces serif hero, Plus Jakarta body, mono avatar. Swap the inline card/button markup for the real DS `Card` + `Button` primitives from `_ds_bundle.js` so you inherit hover/focus/shadow behaviour instead of re-implementing it inline.
- **Routing:** replace the `setTimeout(...window.location.href...)` with your framework's router (`navigate('/listings/new/residential')` etc.). Drop the artificial delay or replace it with a real prefetch of the target form.
- **Last-used:** back `localStorage['retrends:lastJourney']` with the user's actual last-created-listing type from the backend (fall back to localStorage for logged-out users), so the "Last used" hint is meaningful across devices.
- **Journeys as config:** the `JOURNEYS` array is effectively backend config — expose it from an endpoint if the set of listing types can change, rather than hard-coding three.

The only non-production piece is the 950ms launch timeout; everything else (the three-journey model, the routing targets, the last-used memory, the lifecycle copy) is intended behaviour.
