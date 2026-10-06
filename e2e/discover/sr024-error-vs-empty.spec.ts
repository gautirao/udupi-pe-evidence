/**
 * E2E: Issue #1793 SR-024 (PR-A) — a backend/network failure must render Error + Retry and
 * NEVER the zero-result state, for an ANONYMOUS visitor.
 *
 * Overlap check (STEP 0): e2e/discover/school-panel-error-states.spec.ts (ERR-1, ERR-2) covers
 * the SchoolBrowsePanel popular-schools / areas error blocks (different testids, different
 * surface), and e2e/discover/issue-1956-pr4-listings-error-state.spec.ts covers the AREA-leaf
 * `areas-journey-panel-listings-error` on /api/discover/cities/{city}/listings. NEITHER covers
 * the three surfaces here, so this file covers all three:
 *   A1  school-radius listings 500   -> `school-radius-listings-error` (+ Retry), never "No homes within"
 *   A2  anon "Search this area" viewport listings 500 -> an error/retry surface, never the zero state
 *   A3  /api/discover/areas 500      -> `map-areas-error`, never "No properties listed in"
 *
 * Method: a real local backend + fixture DB; ONLY the one endpoint under test is forced to
 * HTTP 500 via page.route (every other call is real). A MutationObserver installed before
 * navigation records whether a forbidden zero-state ever appeared AT ANY FRAME (including the
 * react-query retry window), so "never" is not a one-shot end-of-test snapshot. Each negative
 * is paired with a positive proof that the page rendered, and each failure arm has a paired
 * genuine-zero arm proving the zero state is reachable and the observer can see it.
 *
 * react-query's QueryClient is left at its default (3 retries, ~7s) — retries are NOT disabled,
 * so timeouts below allow for them.
 *
 * Run locally (from the worktree root):
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/sr024-error-vs-empty.spec.ts
 */
import { test, expect, type Page, type Route } from '@playwright/test';

// Anonymous: no storageState (no Authorization token).
test.use({ storageState: undefined });

const CITY = 'udupi';
// Fixture school: "[E2E] Manipal Test College" (Manipal, 13.3525/74.7923) with the [E2E] Manipal
// listings inside 3 km. Its id is a LITERAL in the fixture, so it is stable across restores. The
// production-derived schools (e.g. Sharada Vidyalaya) get a NEW random id on every fixture restore,
// so a hard-coded id for one of those 404s on /api/public/schools/{id}, the deep link is dropped and
// the page falls back to the "Where do you want schools?" browse panel (the original A1 defect).
const SCHOOL_ID = '11111111-2222-3333-4444-555555555555';
const SCHOOL_NAME = '[E2E] Manipal Test College';
const SCHOOL_URL = `/discover?city=${CITY}&journey=school-first&schoolId=${SCHOOL_ID}&radiusKm=3`;
// Committed anon VIEWPORT result scope straight over the Udupi/Manipal fixture area.
const RVP = '13.30,74.70,13.40,74.82';
const VIEWPORT_URL =
  `/discover?city=${CITY}&node=${encodeURIComponent('a:IN|KA|Udupi|Manipal')}&lat=13.35&lon=74.79&zoom=14` +
  `&rscope=vp&rvp=${encodeURIComponent(RVP)}`;
const CITY_URL = `/discover?city=${CITY}`;

const SCHOOL_ZERO_TEXT = 'No homes within';
// The panel-level zero state (SchoolRadiusEmptyState) and the map-level zero card both stand for
// "no homes near this school"; none of them may ever render on a request failure.
const SCHOOL_ZERO_TESTIDS = ['school-radius-empty-state', 'map-zero-results'];
const MAP_ZERO_TEXT = 'No properties listed in';
// R1 (#1793): on a failure the header / radius chips / map pill must OMIT the count rather than
// show "0 homes" next to the Error+Retry panel. \s* tolerates adjacent inline spans (value + label).
const ZERO_HOMES_SOURCE = '\\b0\\s*homes\\b';
const ZERO_HOMES_RE = new RegExp(ZERO_HOMES_SOURCE, 'i');
// R1-dock (#1793): the school-first Map Info Dock count row ("Showing N verified properties near <school>")
// must be OMITTED (not "Showing 0 ...") while the anon school-radius request is in error / loading.
const DOCK_ZERO_SOURCE = 'Showing\\s+0\\s+verified\\s+properties';
const DOCK_ZERO_RE = new RegExp(DOCK_ZERO_SOURCE, 'i');

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Records (in window.__sr024Seen) every forbidden text / testid that appears in the DOM at ANY frame
 * once the page is ARMED. Arming happens when the forced-500 route handler fires (arm()), i.e. from the
 * moment the failing request is issued. Frames before that are the query's not-yet-enabled window
 * (e.g. the school is still being resolved by id) — that is not a failure-vs-empty conflation and also
 * occurs on the success path, so it is deliberately out of scope for this assertion.
 */
async function watchForbidden(
  page: Page,
  forbidden: { texts: string[]; testIds: string[]; patterns?: string[] },
) {
  await page.addInitScript((f) => {
    const w = window as unknown as { __sr024Seen: string[]; __sr024Armed?: boolean };
    w.__sr024Seen = [];
    const record = (key: string) => {
      if (!w.__sr024Seen.includes(key)) w.__sr024Seen.push(key);
    };
    const check = () => {
      const body = document.body;
      if (!body || !w.__sr024Armed) return;
      const text = body.textContent ?? '';
      for (const t of f.texts) if (text.includes(t)) record(`text:${t}`);
      for (const p of f.patterns ?? []) if (new RegExp(p, 'i').test(text)) record(`pattern:${p}`);
      for (const id of f.testIds) if (document.querySelector(`[data-testid="${id}"]`)) record(`testid:${id}`);
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
  }, forbidden);
}

async function arm(page: Page) {
  await page
    .evaluate(() => {
      (window as unknown as { __sr024Armed?: boolean }).__sr024Armed = true;
    })
    .catch(() => undefined);
}

async function seen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __sr024Seen?: string[] }).__sr024Seen ?? []);
}

function fulfillStatus(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function declineConsentIfPresent(page: Page) {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Deterministic A1 setup: opens the school deep link and PROVES the school-radius panel is the one
 * showing before any failure/empty assertion is made. Never relies on a lucky landing:
 *   1. /api/public/schools/{id} (real backend) must answer 200 — otherwise the app drops the deep
 *      link and renders the browse panel, which would make every later assertion vacuous;
 *   2. the URL must still carry schoolId (+ radiusKm) after the page settled;
 *   3. the school-radius panel (radius-btn-3, pressed for the 3 km default) and the school name render,
 *      and the browse panel heading ("Where do you want schools?") is NOT present.
 */
async function openSchoolRadiusPanel(page: Page) {
  const schoolLookup = page.waitForResponse(
    (r) => r.url().includes(`/api/public/schools/${SCHOOL_ID}`) && r.request().method() === 'GET',
    { timeout: 30_000 },
  );
  await page.goto(SCHOOL_URL);
  await declineConsentIfPresent(page);
  expect((await schoolLookup).status(), `fixture school ${SCHOOL_ID} must resolve (stale fixture id?)`).toBe(200);
  await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Where do you want schools?' })).toHaveCount(0);
  await expect(page.getByText(SCHOOL_NAME).first()).toBeVisible();
  const params = new URL(page.url()).searchParams;
  expect(params.get('schoolId'), 'schoolId must still be in the URL (school selected)').toBe(SCHOOL_ID);
  expect(params.get('radiusKm')).toBe('3');
}

/** No "0 homes" text anywhere on the page: locator-level AND whole-body innerText. */
async function expectNoZeroHomesAnywhere(page: Page) {
  await expect(page.getByText(ZERO_HOMES_RE)).toHaveCount(0);
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText, 'body text must not contain "0 homes" beside the failure state').not.toMatch(ZERO_HOMES_RE);
}

/** No "Showing 0 verified properties" dock count anywhere: locator-level AND whole-body innerText. */
async function expectNoZeroDockCountAnywhere(page: Page) {
  await expect(page.getByText(DOCK_ZERO_RE)).toHaveCount(0);
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText, 'body text must not contain the dock "Showing 0 verified properties" beside the failure state').not.toMatch(
    DOCK_ZERO_RE,
  );
}

// ── A1: Schools ────────────────────────────────────────────────────────────────

test.describe('#1793 SR-024 A1 — school-radius listings failure vs genuine zero', () => {
  test.setTimeout(120_000);

  test('A1: 500 on school-radius-listings shows Error+Retry (never "No homes within"), Retry re-issues the request', async ({ page }) => {
    await watchForbidden(page, {
      texts: [SCHOOL_ZERO_TEXT],
      testIds: SCHOOL_ZERO_TESTIDS,
      patterns: [ZERO_HOMES_SOURCE, DOCK_ZERO_SOURCE],
    });
    let radiusRequests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/school-radius-listings')) radiusRequests += 1;
    });
    await page.route('**/api/discover/cities/*/school-radius-listings**', async (route) => {
      await arm(page);
      return fulfillStatus(route, 500, { error: 'simulated_failure' });
    });

    // POSITIVE: the school-radius panel is showing (the negatives below are not vacuous).
    await openSchoolRadiusPanel(page);
    // The error block shows after react-query's ~3 retries (~7s).
    const errorBlock = page.getByTestId('school-radius-listings-error');
    await expect(errorBlock).toBeVisible({ timeout: 40_000 });
    const retryButton = page.getByTestId('school-radius-listings-error-retry');
    await expect(retryButton).toBeVisible();
    await expect(page.getByText(SCHOOL_ZERO_TEXT)).toHaveCount(0);
    await expect(page.getByTestId('school-radius-empty-state')).toHaveCount(0);
    expect(radiusRequests, 'the failing request was really issued').toBeGreaterThan(0);
    // R1: no "0 homes" anywhere (header stat, radius chips, map pill) while the error block shows.
    await expectNoZeroHomesAnywhere(page);
    await expect(page.getByTestId('school-summary-count')).toHaveCount(0);
    // R1-dock: the Map Info Dock must not read "Showing 0 verified properties near ..." either.
    await expectNoZeroDockCountAnywhere(page);

    // Retry re-issues the request (state change: request count increases).
    const before = radiusRequests;
    await retryButton.click();
    await expect.poll(() => radiusRequests, { timeout: 15_000 }).toBeGreaterThan(before);

    // Still failing -> the error block comes back after the retry window (positive), and the
    // zero state NEVER appeared at any frame, including that window (observer flag).
    await expect(errorBlock).toBeVisible({ timeout: 40_000 });
    await expectNoZeroHomesAnywhere(page);
    await expectNoZeroDockCountAnywhere(page);
    expect(await seen(page), 'zero-result copy / "0 homes" must never have rendered, even transiently').toEqual([]);
  });

  test('A1 control: same school, no forced failure -> real homes render and no error block', async ({ page }) => {
    const radiusResponse = page.waitForResponse(
      (r) => r.url().includes('/school-radius-listings') && r.request().method() === 'GET',
      { timeout: 30_000 },
    );
    await openSchoolRadiusPanel(page);
    expect((await radiusResponse).status()).toBe(200);
    // POSITIVE: real fixture listings rendered from the real backend.
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('school-radius-listings-error')).toHaveCount(0);
    await expect(page.getByText(SCHOOL_ZERO_TEXT)).toHaveCount(0);
  });

  test('A1 genuine zero: a 200 with no homes DOES show the school empty state and no error block', async ({ page }) => {
    await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
      fulfillStatus(route, 200, { content: [], page: 0, size: 50, hasMore: false }),
    );
    await openSchoolRadiusPanel(page);
    await expect(page.getByTestId('school-radius-empty-state')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('school-radius-listings-error')).toHaveCount(0);
    // R1 discrimination: on a GENUINE zero the zero count IS shown, so the failure arm's
    // "no 0 homes" negative is a real discriminator rather than a vacuous one.
    await expect(page.getByTestId('school-summary-count')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('school-summary-count')).toContainText('0');
    await expect(page.getByText(ZERO_HOMES_RE).first()).toBeVisible();
    // R1-dock discrimination: on a settled genuine zero the dock count row IS rendered, so the
    // failure arm's "no Showing 0 verified properties" negative is a real discriminator.
    await expect(page.getByText('Showing 0 verified properties near').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── A1 (MOBILE): the map results pill must not read "0 homes" beside a failure ──────
//
// #1793 PR-A M3: at a phone viewport the school-first results live behind a List/Map toggle, and the
// map's results pill (`map-results-heading-text`) used to read "0 homes for sale · Residential" while the
// anon school-radius request was in error / loading. The desktop A1 arm never taps Map, so it could not
// see this. These arms TAP Map (and prove the tap landed via `.leaflet-container`) and keep the observer
// armed across the retries and the toggle back to List.

// Mobile zero-copy: a "0" that is NOT the tail of a larger number ("10 homes" must not match).
const MOBILE_ZERO_HOMES_SOURCE = '(?<![0-9])0\\s*homes';
const MOBILE_ZERO_HOMES_RE = new RegExp(MOBILE_ZERO_HOMES_SOURCE, 'i');
const MAP_HEADING_TESTID = 'map-results-heading-text';

/** Taps the Map toggle and PROVES the tap landed: the Leaflet map container becomes visible. */
async function tapMapToggle(page: Page) {
  const mapToggle = page.getByRole('button', { name: 'Map', exact: true });
  await expect(mapToggle, 'mobile Map toggle must be present at 390px').toBeVisible({ timeout: 20_000 });
  await mapToggle.click();
  await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
}

async function tapListToggle(page: Page) {
  const listToggle = page.getByRole('button', { name: 'List', exact: true });
  await expect(listToggle, 'mobile List toggle must be present while the map is showing').toBeVisible({ timeout: 20_000 });
  await listToggle.click();
}

// Filters-sheet status line zero copy ("... the map still shows 0 homes").
const FILTER_SHEET_ZERO_SOURCE = 'still shows\\s+0';
const FILTER_SHEET_ZERO_RE = new RegExp(FILTER_SHEET_ZERO_SOURCE, 'i');

/** Opens the mobile Filters sheet from the map pill, proves it opened, and stages a 2 BHK chip. */
async function openFiltersSheetAndStageEdit(page: Page) {
  const pill = page.getByTestId('map-filters-pill');
  await expect(pill, 'Filters pill must be present on the mobile map').toBeVisible({ timeout: 20_000 });
  await pill.click();
  const sheet = page.getByTestId('map-filter-sheet');
  await expect(sheet, 'Filters sheet must open after tapping the pill').toBeVisible({ timeout: 10_000 });
  const chip = page.getByTestId('quick-chip-2-bhk');
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip, 'the tap must land: chip becomes pressed').toHaveAttribute('aria-pressed', 'true');
  return sheet;
}

/** The map results pill, if rendered at all, must carry no zero count; "0 homes" anywhere is forbidden. */
async function expectNoZeroPillCount(page: Page) {
  const headingTexts = await page.getByTestId(MAP_HEADING_TESTID).allTextContents();
  expect(headingTexts.join(' | '), 'map results pill must be absent or carry no zero count').not.toMatch(MOBILE_ZERO_HOMES_RE);
  await expect(page.getByText(MOBILE_ZERO_HOMES_RE)).toHaveCount(0);
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText, 'body text must not contain a zero "homes" count (mobile)').not.toMatch(MOBILE_ZERO_HOMES_RE);
  await expect(page.getByText(DOCK_ZERO_RE)).toHaveCount(0);
  expect(bodyText).not.toMatch(DOCK_ZERO_RE);
}

test.describe('#1793 SR-024 A1 (mobile 390x844) — map pill on failure vs genuine zero', () => {
  test.setTimeout(150_000);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('A1 mobile: 500 on school-radius-listings -> tapping Map never shows a zero pill/dock count, across retries and back to List', async ({ page }) => {
    await watchForbidden(page, {
      texts: [SCHOOL_ZERO_TEXT],
      testIds: SCHOOL_ZERO_TESTIDS,
      patterns: [MOBILE_ZERO_HOMES_SOURCE, DOCK_ZERO_SOURCE],
    });
    let radiusRequests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/school-radius-listings')) radiusRequests += 1;
    });
    await page.route('**/api/discover/cities/*/school-radius-listings**', async (route) => {
      await arm(page);
      return fulfillStatus(route, 500, { error: 'simulated_failure' });
    });

    await openSchoolRadiusPanel(page);
    const errorBlock = page.getByTestId('school-radius-listings-error');
    await expect(errorBlock).toBeVisible({ timeout: 40_000 });
    expect(radiusRequests, 'the failing request was really issued').toBeGreaterThan(0);

    // Tap Map: the click provably landed (leaflet visible). Now the pill must carry no zero count.
    await tapMapToggle(page);
    await expectNoZeroPillCount(page);

    // Back to List, Retry (re-issues the request), and go straight back to Map during the loading window.
    await tapListToggle(page);
    await expect(errorBlock).toBeVisible({ timeout: 10_000 });
    const before = radiusRequests;
    await page.getByTestId('school-radius-listings-error-retry').click();
    await expect.poll(() => radiusRequests, { timeout: 15_000 }).toBeGreaterThan(before);
    await tapMapToggle(page);
    await expectNoZeroPillCount(page);

    // Let the retry window settle while the map is showing, then return to List: error comes back.
    await page.waitForTimeout(8_000);
    await expectNoZeroPillCount(page);
    await tapListToggle(page);
    await expect(errorBlock).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(SCHOOL_ZERO_TEXT)).toHaveCount(0);
    await expectNoZeroPillCount(page);
    expect(await seen(page), 'zero "homes" / dock zero copy must never have rendered at any frame (mobile)').toEqual([]);
  });

  // #1793 PR-A F2: the Filters sheet footer status line ("Not applied yet — the map still shows N homes")
  // read the markers count unconditionally, so after a draft edit it said "still shows 0 homes" while the
  // anon school-radius request was failing/loading. Open Filters from the map, stage a bedrooms chip, and
  // assert the line carries NO number; then Apply and assert nothing zero-ish at any frame (observer armed
  // for the whole sequence).
  test('A1 mobile: 500 on school-radius-listings -> Filters sheet edit shows "Not applied yet" with no zero count, before and after Apply', async ({ page }) => {
    await watchForbidden(page, {
      texts: [SCHOOL_ZERO_TEXT],
      testIds: SCHOOL_ZERO_TESTIDS,
      patterns: [MOBILE_ZERO_HOMES_SOURCE, DOCK_ZERO_SOURCE, FILTER_SHEET_ZERO_SOURCE],
    });
    await page.route('**/api/discover/cities/*/school-radius-listings**', async (route) => {
      await arm(page);
      return fulfillStatus(route, 500, { error: 'simulated_failure' });
    });

    await openSchoolRadiusPanel(page);
    await expect(page.getByTestId('school-radius-listings-error')).toBeVisible({ timeout: 40_000 });

    await tapMapToggle(page);
    const sheet = await openFiltersSheetAndStageEdit(page);

    // Draft now differs from applied: the status line is the "Not applied yet" variant, with no number.
    const status = page.getByTestId('map-filter-sheet-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('Not applied yet');
    const statusText = (await status.textContent()) ?? '';
    expect(statusText, 'status line must carry no count while the school-radius request is failing').not.toMatch(/\d/);
    expect(statusText).not.toMatch(FILTER_SHEET_ZERO_RE);
    await expectNoZeroPillCount(page);

    // Apply closes the sheet; nothing zero-ish anywhere afterwards either.
    await page.getByTestId('map-filter-sheet-apply').click();
    await expect(sheet).not.toBeVisible({ timeout: 10_000 });
    await expectNoZeroPillCount(page);
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toMatch(FILTER_SHEET_ZERO_RE);
    expect(await seen(page), 'zero copy must never have rendered at any frame, including inside the Filters sheet').toEqual([]);
  });

  test('A1 mobile genuine zero: Filters sheet edit DOES read "the map still shows 0 homes" (discriminates the failure arm)', async ({ page }) => {
    await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
      fulfillStatus(route, 200, { content: [], page: 0, size: 50, hasMore: false }),
    );
    await openSchoolRadiusPanel(page);
    await expect(page.getByTestId('school-radius-empty-state')).toBeVisible({ timeout: 20_000 });
    await tapMapToggle(page);
    await openFiltersSheetAndStageEdit(page);

    const status = page.getByTestId('map-filter-sheet-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText(/Not applied yet\s+—\s+the map still shows 0 homes/i);
  });

  test('A1 mobile genuine zero: a 200 with no homes DOES show the zero count in the map pill after tapping Map', async ({ page }) => {
    await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
      fulfillStatus(route, 200, { content: [], page: 0, size: 50, hasMore: false }),
    );
    await openSchoolRadiusPanel(page);
    await expect(page.getByTestId('school-radius-empty-state')).toBeVisible({ timeout: 20_000 });
    await tapMapToggle(page);
    // Discrimination: on a settled genuine zero the pill IS rendered with the zero count, so the failure
    // arm's "no zero pill count" negative is a real discriminator rather than a vacuous one.
    const pill = page.getByTestId(MAP_HEADING_TESTID);
    await expect(pill).toBeVisible({ timeout: 20_000 });
    await expect(pill).toHaveText(MOBILE_ZERO_HOMES_RE);
    await expect(page.getByTestId('school-radius-listings-error')).toHaveCount(0);
  });
});

// ── A2: anon "Search this area" viewport ───────────────────────────────────────

const VIEWPORT_ERROR_TESTIDS = ['area-listings-error', 'anon-viewport-error', 'areas-journey-panel-listings-error'];
const VIEWPORT_ZERO_TESTIDS = ['area-zero-result-recovery', 'anon-viewport-empty-state', 'area-empty-state'];
const VIEWPORT_ZERO_TEXT = 'No listings found in this map area';

function isViewportListingsRequest(url: string): boolean {
  return /\/api\/discover\/cities\/[^/]+\/listings/.test(url) && url.includes('bbox=');
}

test.describe('#1793 SR-024 A2 — anon viewport listings failure vs genuine zero', () => {
  test.setTimeout(120_000);

  test('A2: 500 on the anon viewport listings request shows an error/retry surface, never the zero-result state', async ({ page }) => {
    await watchForbidden(page, { texts: [VIEWPORT_ZERO_TEXT], testIds: VIEWPORT_ZERO_TESTIDS });
    let viewportRequests = 0;
    await page.route('**/api/discover/cities/**', async (route) => {
      if (isViewportListingsRequest(route.request().url())) {
        viewportRequests += 1;
        await arm(page);
        return fulfillStatus(route, 500, { error: 'simulated_failure' });
      }
      return route.continue();
    });

    await page.goto(VIEWPORT_URL);
    await declineConsentIfPresent(page);

    // POSITIVE: the committed viewport scope is live and the failing request really fired.
    await expect.poll(() => new URL(page.url()).searchParams.get('rscope'), { timeout: 15_000 }).toBe('vp');
    await expect.poll(() => viewportRequests, { timeout: 30_000 }).toBeGreaterThan(0);

    const errorSurface = page.locator(
      VIEWPORT_ERROR_TESTIDS.map((id) => `[data-testid="${id}"]`).join(', ') +
        ', [data-testid="area-listings-retry-banner"], [data-testid="anon-viewport-retry-banner"]',
    );
    await expect(errorSurface.first()).toBeVisible({ timeout: 40_000 });
    // The retry affordance differs per surface (area-listings-error-retry, the stale banner button,
    // anon-viewport-retry-btn, or the areas-journey panel's plain Retry button) — match by role.
    const retry = page.getByRole('button', { name: /^retry$/i }).first();
    await expect(retry).toBeVisible();

    // Retry re-issues the viewport request.
    const before = viewportRequests;
    await retry.click();
    await expect.poll(() => viewportRequests, { timeout: 15_000 }).toBeGreaterThan(before);

    await expect(errorSurface.first()).toBeVisible({ timeout: 40_000 });
    expect(await seen(page), 'zero-result state must never have rendered').toEqual([]);
  });

  test('A2 genuine zero: a 200 with no listings in the viewport DOES show a zero state and no error surface', async ({ page }) => {
    await page.route('**/api/discover/cities/**', (route) => {
      if (isViewportListingsRequest(route.request().url())) {
        return fulfillStatus(route, 200, { city: CITY, limitPerArea: 50, areas: [] });
      }
      return route.continue();
    });
    await page.goto(VIEWPORT_URL);
    await declineConsentIfPresent(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('rscope'), { timeout: 15_000 }).toBe('vp');

    const zero = page.locator(
      VIEWPORT_ZERO_TESTIDS.map((id) => `[data-testid="${id}"]`).join(', ') +
        `, :text("${VIEWPORT_ZERO_TEXT}")`,
    );
    await expect(zero.first()).toBeVisible({ timeout: 30_000 });
    for (const id of VIEWPORT_ERROR_TESTIDS) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });
});

// ── A3: map areas ──────────────────────────────────────────────────────────────

test.describe('#1793 SR-024 A3 — /api/discover/areas failure vs genuine empty city', () => {
  test.setTimeout(120_000);

  test('A3: 500 on /api/discover/areas shows map-areas-error (never "No properties listed in") and Retry re-issues it', async ({ page }) => {
    await watchForbidden(page, { texts: [MAP_ZERO_TEXT], testIds: [] });
    let areasRequests = 0;
    page.on('request', (r) => {
      if (/\/api\/discover\/areas(\?|$)/.test(r.url())) areasRequests += 1;
    });
    await page.route('**/api/discover/areas**', async (route) => {
      await arm(page);
      return fulfillStatus(route, 500, { error: 'simulated_failure' });
    });

    await page.goto(CITY_URL);
    await declineConsentIfPresent(page);

    // POSITIVE: the map shell rendered.
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
    const errorBlock = page.getByTestId('map-areas-error');
    await expect(errorBlock).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(MAP_ZERO_TEXT)).toHaveCount(0);
    expect(areasRequests, 'the failing areas request was really issued').toBeGreaterThan(0);

    const before = areasRequests;
    await page.getByTestId('map-areas-error-retry').click();
    await expect.poll(() => areasRequests, { timeout: 15_000 }).toBeGreaterThan(before);

    await expect(errorBlock).toBeVisible({ timeout: 40_000 });
    expect(await seen(page), 'empty-city copy must never have rendered, even transiently').toEqual([]);
  });

  test('A3 genuine zero: a 200 with no areas DOES show "No properties listed in" and no map-areas-error', async ({ page }) => {
    await page.route('**/api/discover/areas**', (route) => fulfillStatus(route, 200, { city: CITY, areas: [] }));
    await page.goto(CITY_URL);
    await declineConsentIfPresent(page);
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(MAP_ZERO_TEXT).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('map-areas-error')).toHaveCount(0);
  });
});
