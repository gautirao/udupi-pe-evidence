/**
 * Issue #2459 — the Residential area-bound arm, and the browser proof of the two client-side
 * guards added by the exact-head review (fixes 3 and 4).
 *
 * ============================================================================================
 * WHAT THIS FILE DELIBERATELY DOES NOT COVER, AND WHY — READ BEFORE ADDING A CASE
 * ============================================================================================
 *
 * ## No COMMERCIAL arm
 *
 * #2524: no Commercial row reachable by this suite carries an area value, so a Commercial
 * area-bound assertion would be VACUOUS — every bound returns zero rows, "the filter narrowed the
 * results" passes trivially, and a completely broken predicate would score the same green. The
 * exclusion is deliberate. It is written here rather than left silent because a missing arm and a
 * deliberately-omitted arm look identical in a test report, and the next reader would otherwise
 * "fix" the gap by adding exactly the vacuous test this paragraph exists to prevent.
 *
 * ## No assertion that a bound NARROWS a result set — for the SAME reason, now Residential too
 *
 * ⚠️ CORRECTION TO THE REVIEW PREMISE, MEASURED 2026-09-12. The review authorising this file
 * held that a Residential arm is NOT blocked by #2524, on the grounds that 1,641 of 1,650 live
 * apartments carry `built_area`. That is true of the LIVE/hosted database — and this suite has not
 * run against it since PR #2423 (2026-09-02) isolated the gate onto an ephemeral fixture Postgres
 * (see `e2e/discover-real-data-smoke.spec.ts`'s #2427 header for the same migration).
 *
 * Verified against ALL THIRTEEN `*.sql` seeds under `scripts/db/fixtures/` — not the four that
 * obviously carry listings. The wider sweep does not change the conclusion, but it is recorded at
 * its true width so a reader who counts the directory and finds nine more files does not have to
 * wonder whether the exclusion below was reasoned over a sample.
 *
 * Measured 2026-09-12, per column:
 *
 *  - `built_area` / `carpet_area` — inserted by NO seed, anywhere. Every row whose primary area
 *    resolves to BUILT-UP (apartment, villa, house, shop, office, commercial building) or to
 *    WAREHOUSE therefore has a NULL primary area, since both meanings read `built_area`.
 *  - `land_area` — inserted by EXACTLY ONE seed, `agricultural-listings-seed.sql` (in its
 *    `property_listings` column list and its `ON CONFLICT` update). Agricultural rows consequently
 *    DO carry a resolvable primary area; no other seed populates the column.
 *
 * ⚠️ An earlier revision of this header said all four seeds insert none of the three columns.
 * That was wrong about `land_area`, and the correction is kept rather than quietly dropped because
 * it is the sentence a future reader would otherwise reuse to justify an agricultural arm.
 *
 * The RESIDENTIAL conclusion is unaffected, and is now load-bearing for a narrower reason than
 * "the fixture has no areas at all": apartments/villas/houses need `built_area`, which no seed
 * writes, and residential plots need `land_area`, which only the AGRICULTURAL seed writes. So
 * every Residential row still has a NULL primary area.
 *
 * #2524 therefore blocks the narrowing assertion for Residential on this suite exactly as it does
 * for Commercial. Asserting "an 800 sq ft minimum narrows the apartments" here would be the
 * vacuous test the paragraph above forbids, wearing a Residential label. It is omitted on the same
 * grounds, and this file asserts only things the fixture can actually falsify.
 *
 * Closing that gap needs area values in the fixture seeds, not another spec — tracked with #2524.
 *
 * ============================================================================================
 * WHAT IT DOES COVER
 * ============================================================================================
 *
 * 1. The Residential arm is NON-EMPTY (test 1). Asserted FIRST and on its own, because every
 *    assertion below is conditional on results existing at all — a suite that renders nothing
 *    would otherwise satisfy "no error was shown" perfectly.
 *
 * 2. The two client guards, in a REAL browser against the REAL API — which is the half unit tests
 *    structurally cannot reach, and which does NOT depend on any row carrying an area value,
 *    because both guards work by DROPPING the bound before it is ever sent:
 *
 *      fix 4 — `?areaMinSqft=800.5`. Both controllers bind `Integer`, so a decimal 400s on
 *      Spring's REQUEST BINDING before `AreaBoundsParam.validate()` can produce its designed
 *      message. `state/url/filters.ts` documents that a hand-edited link "degrades to no area
 *      filter rather than to a bad request"; before the fix that sentence was false.
 *
 *      fix 3 — `?areaMinSqft=2000&areaMaxSqft=1000`. Each value is individually valid, so no
 *      single-key guard could see it; the server 400s the PAIR by design
 *      (`AreaBoundsParam:48-51`) where "no results" is the honest buyer answer.
 *
 *    Both are asserted on the NETWORK (no `/api/discover/*` response ≥ 400), not on the absence of
 *    a visible error string — a page that silently swallowed a 400 would pass the visual check.
 *
 * 3. A VALID integer bound is RETAINED in the URL (test 4) — the control arm that separates "the
 *    guard dropped an unsatisfiable bound" from "the guard drops every bound". Without it, a
 *    guard that deleted the feature outright would pass tests 2 and 3 perfectly.
 *
 * Backend requirement: the local fixture backend stack (`./scripts/dev/local-fixture-backend.sh`),
 * as for every other spec in this directory — the RR Nagar listings exist only in the seeded
 * fixture DB.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<fixture-backend-port> npx playwright test \
 *     e2e/discover/issue-2459-area-bounds-residential.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
/** The AREA leaf whose fixture provenance is documented in `issue-2089-marker-swap-fixture.spec.ts`. */
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

/**
 * Records every Discover API response with a 4xx/5xx status.
 *
 * This is the assertion that actually matters for fixes 3 and 4: the defect was a BAD REQUEST, and
 * a page that renders an empty list after silently swallowing a 400 is indistinguishable, on
 * screen, from one that correctly degraded to no filter.
 */
function collectDiscoverErrorResponses(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/discover/') && response.status() >= 400) {
      failures.push(`${response.status()} ${url}`);
    }
  });
  return failures;
}

async function gotoAreaLeaf(page: Page, extraParams = ''): Promise<void> {
  const suffix = extraParams ? `&${extraParams}` : '';
  await page.goto(
    `/discover?${BASE}&node=${encodeURIComponent(AREA_RR_NAGAR)}${suffix}`,
  );
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });
}

function areaParams(page: Page): { min: string | null; max: string | null } {
  const params = new URL(page.url()).searchParams;
  return { min: params.get('areaMinSqft'), max: params.get('areaMaxSqft') };
}

test.describe('@integration-ui #2459 — Residential area bounds and the client-side range guards', () => {
  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('1. the Residential arm is non-empty — every assertion below depends on this', async ({
    page,
  }) => {
    // Deliberately its own test rather than a preamble to the others: if the fixture stops
    // producing listings, this fails on its own terms and names the reason, instead of quietly
    // turning the guard tests below into assertions about a blank page.
    const errors = collectDiscoverErrorResponses(page);
    await gotoAreaLeaf(page);

    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 20_000 });
    expect(
      await page.getByTestId('listing-card').count(),
      'the RR Nagar leaf must carry LIVE residential listings, or nothing below is meaningful',
    ).toBeGreaterThan(0);
    expect(errors, 'the unfiltered Residential arm must not error').toEqual([]);
  });

  test('2. a DECIMAL bound degrades to no filter instead of 400ing on Integer request binding (fix 4)', async ({
    page,
  }) => {
    const errors = collectDiscoverErrorResponses(page);
    await gotoAreaLeaf(page, 'areaMinSqft=800.5');

    // The claim is about the REQUEST, not about what rendered.
    expect(
      errors,
      'a decimal bound must never reach the server — it 400s on Spring request binding, before the designed validator runs',
    ).toEqual([]);

    // …and it degraded to NO area filter, which is what filters.ts promises in writing.
    expect(areaParams(page).min).not.toBe('800.5');

    // The page is still a working results page, not an error surface.
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('areas-journey-panel-listings-error')).toHaveCount(0);
  });

  test('3. an INVERTED bound degrades to no filter instead of 400ing on the designed validator (fix 3)', async ({
    page,
  }) => {
    const errors = collectDiscoverErrorResponses(page);
    await gotoAreaLeaf(page, 'areaMinSqft=2000&areaMaxSqft=1000');

    expect(
      errors,
      'an inverted pair must never reach the server — AreaBoundsParam:48-51 answers it with a 400, where "no results" is the honest answer',
    ).toEqual([]);

    const { min, max } = areaParams(page);
    expect(min).not.toBe('2000');
    expect(max).not.toBe('1000');

    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('areas-journey-panel-listings-error')).toHaveCount(0);
  });

  test('4. a VALID integer bound is RETAINED, not swallowed by the guards — the control arm', async ({
    page,
  }) => {
    // Tests 2 and 3 prove unsatisfiable bounds are dropped. On their own they would be satisfied
    // just as well by a guard that dropped EVERY bound, i.e. by deleting the feature. This is the
    // arm that separates the two, and it varies only the property under test: same URL shape, same
    // leaf, only the bound values differ.
    const errors = collectDiscoverErrorResponses(page);
    await gotoAreaLeaf(page, 'areaMinSqft=800&areaMaxSqft=1600');

    const { min, max } = areaParams(page);
    expect(min, 'a valid integer minimum must survive the guard').toBe('800');
    expect(max, 'a valid integer maximum must survive the guard').toBe('1600');
    expect(errors, 'a valid range must be accepted by the server, not 400ed').toEqual([]);

    // NOTE: no assertion on the resulting CARD COUNT. Fixture listings carry a NULL primary area
    // (see this file's header), so the filtered count is zero for reasons that have nothing to do
    // with whether the predicate is correct. Asserting on it would be vacuous.
  });
});
