/**
 * E2E — Issue #1942: anon individual map pins render the coarse priceBand.
 *
 * Bug: on the anonymous Discover area-first map, an individual (non-clustered)
 * listing pin rendered a bare '—' because PropertyMap's icon builders
 * (createMarkerIcon / createSelectedMarkerIcon) only ever read `listing.price`
 * (always null for anon) and never `listing.priceBand` (already shipped on
 * PropertyListing by #1941). The fix threads priceBand into
 * deriveMarkerLabel's precedence: exact price > coarse band > residual '—'.
 *
 * Pin markup (unchanged by this fix, asserted here as the contract):
 *   - `<div data-testid="property-marker">` — the pill — containing a
 *     type-glyph disc + a `<span>` with the label text.
 *   - aria-label = "Price unavailable" for the residual '—' case (under
 *     #1941's contract an anon response always carries a priceBand when a
 *     price exists, so the residual branch means no price data exists at
 *     all — a "sign in" prompt would be a false promise), "Approximate price
 *     {band}" for the band case, absent for an exact price (the visible text
 *     is itself the accessible name).
 *   - `[data-listing-id="<id>"]` on the marker element (E2E selector anchor).
 * Cluster-count pins (`.custom-marker-cluster`, "N HOMES" label) are a
 * SEPARATE code path (leaflet.markercluster's iconCreateFunction, not
 * createMarkerIcon/createSelectedMarkerIcon) — this suite proves they render
 * unaffected by the #1942 change.
 *
 * Backend-free: every side call MapDiscovery fires on the area-first map is
 * stubbed via page.route() (same pattern/helpers as
 * e2e/discover-anon-price-consistency-1941.spec.ts, itself modelled on
 * e2e/discover-1738-regression.spec.ts and e2e/discover-trust-badge-1567.spec.ts)
 * so tests 1-3 need no live backend or seed data. Test 4 (authed, exact price)
 * requires SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD against the configured dev
 * backend (never the shared hosted Supabase project) and skips gracefully
 * when creds are absent — matching #1941's AC2/AC5 convention.
 *
 * Run locally (stack already running):
 *   npx playwright test e2e/discover-1942-pin-price-band.spec.ts --project=full
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { hasRealCredentials } from './helpers';

// ── Fixture IDs (distinct from #1941's fixtures to avoid any cross-suite
//    coincidental collision; each test's page.route stubs are scoped to the
//    test's own page anyway, so collision is not a correctness risk — this
//    is purely for readability when triaging a failure). ──────────────────

const BAND_PIN_ID = 'b1942a10-0000-0000-0000-000000000001';
const RESIDUAL_PIN_ID = 'b1942a10-0000-0000-0000-000000000002';
const CLUSTER_PIN_A_ID = 'b1942a10-0000-0000-0000-000000000003';
const CLUSTER_PIN_B_ID = 'b1942a10-0000-0000-0000-000000000004';
const AUTHED_PIN_ID = 'b1942a10-0000-0000-0000-000000000005';

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);
const MANIPAL_LAT = 13.3525;
const MANIPAL_LON = 74.79226;

// Band string taken verbatim from #1941's spec / the merged unit tests
// (PropertyMap.pinPriceBand.test.tsx, MarkerPopoverCard.test.tsx) so this
// E2E stays consistent with the already-verified unit-level contract.
const BAND = '₹1–2Cr';
// 13,500,000 rupees -> formatPrice() -> "₹1.35 Cr" (matches the unit tests
// and #1941's spec — the authed control-flow formatting is unchanged).
const EXACT_PRICE_RUPEES = 13_500_000;
const EXACT_PRICE_TEXT = '₹1.35 Cr';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

// ── Route helpers (mirrors #1941's spec) ───────────────────────────────────

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function cityListingsFixture(areaKey: string, listings: Record<string, unknown>[]) {
  return {
    city: 'udupi',
    limitPerArea: 50,
    areas: [
      {
        areaKey,
        areaName: 'Manipal',
        listings,
      },
    ],
  };
}

/** Stub every side call MapDiscovery fires so the area-first map is backend-free. */
async function stubMapSideCalls(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, {
      city: 'udupi',
      defaultAreas: [{ areaKey: MANIPAL_AREA_KEY, areaLabel: 'Manipal' }],
    }),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, {
      city: 'udupi',
      areas: [
        {
          areaKey: MANIPAL_AREA_KEY,
          name: 'Manipal',
          geoCenterLat: MANIPAL_LAT,
          geoCenterLon: MANIPAL_LON,
          minLat: 13.33,
          maxLat: 13.38,
          minLon: 74.77,
          maxLon: 74.82,
          listingCount: 1,
          schoolCount: 0,
          trendDirection: 'stable',
        },
      ],
    }),
  );
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/discover/area-groups**', (route) => fulfillJson(route, 200, { groups: [] }));
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, {
      content: [],
      page: 0,
      size: 50,
      totalElements: 0,
      totalPages: 0,
      aggregates: { topLocalities: [] },
    }),
  );
}

function markerSelector(id: string): string {
  return `[data-listing-id="${id}"] [data-testid="property-marker"]`;
}

// zoom=14 lands the map in the 'markers' zoom band (> AREA_LAYER_MAX_ZOOM=12,
// see src/lib/map/zoomPolicy.ts), so MarkerClusterLayer (individual pins /
// cluster pins) is the primary layer rather than AreaMarkerLayer — same URL
// shape as #1941's spec.
const areaFirstUrl =
  `/discover?city=udupi&journey=area-first&areaKey=${ENCODED_AREA_KEY}` +
  `&lat=${MANIPAL_LAT}&lon=${MANIPAL_LON}&zoom=14`;

/** Navigate to the area-first map with the given listing fixtures already stubbed. */
async function gotoAreaFirstMap(
  page: Page,
  listings: Record<string, unknown>[],
): Promise<void> {
  await stubMapSideCalls(page);
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, cityListingsFixture(MANIPAL_AREA_KEY, listings)),
  );

  const listingsResponse = page.waitForResponse(
    (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
  );
  await page.goto(areaFirstUrl);
  await listingsResponse;
  await page.waitForLoadState('networkidle');
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Individual anon pin with a priceBand shows the band, never '—'.
// ─────────────────────────────────────────────────────────────────────────

test.describe('@integration-ui #1942 — anon individual pin shows the price band', () => {
  test('1: pin renders the priceBand text and the "Approximate price" aria-label, not "—"', async ({ page }) => {
    await gotoAreaFirstMap(page, [
      {
        id: BAND_PIN_ID,
        propertyType: 'apartment',
        title: 'Pin Price-Band Fixture',
        locality: 'Manipal',
        listingPurpose: 'sale',
        lat: MANIPAL_LAT,
        lon: MANIPAL_LON,
        pricePaise: null,
        priceBand: BAND,
      },
    ]);

    const pin = page.locator(markerSelector(BAND_PIN_ID));
    await expect(pin).toBeVisible({ timeout: 20_000 });
    await expect(pin).toContainText(BAND);
    await expect(pin).not.toContainText('—');
    await expect(pin).toHaveAttribute('aria-label', `Approximate price ${BAND}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2) Cluster-count pins ("N HOMES") are a separate code path — unaffected.
// ─────────────────────────────────────────────────────────────────────────

test.describe('@integration-ui #1942 — cluster pins unaffected (no regression)', () => {
  test('2: two co-located listings render a single "2 HOMES" cluster pin, not individual price pins', async ({ page }) => {
    // Identical coordinates guarantee the two listings fall inside
    // leaflet.markercluster's maxClusterRadius at any zoom below
    // CLUSTER_DISABLE_AT_ZOOM (16) — see src/lib/map/zoomPolicy.ts. zoom=14
    // here is comfortably below that threshold.
    await gotoAreaFirstMap(page, [
      {
        id: CLUSTER_PIN_A_ID,
        propertyType: 'apartment',
        title: 'Cluster Fixture A',
        locality: 'Manipal',
        listingPurpose: 'sale',
        lat: MANIPAL_LAT,
        lon: MANIPAL_LON,
        pricePaise: null,
        priceBand: BAND,
      },
      {
        id: CLUSTER_PIN_B_ID,
        propertyType: 'villa',
        title: 'Cluster Fixture B',
        locality: 'Manipal',
        listingPurpose: 'sale',
        lat: MANIPAL_LAT,
        lon: MANIPAL_LON,
        pricePaise: null,
        priceBand: '₹2–3Cr',
      },
    ]);

    const clusterPin = page.locator('.custom-marker-cluster');
    await expect(clusterPin).toBeVisible({ timeout: 20_000 });
    await expect(clusterPin.locator('.custom-marker-cluster-count')).toHaveText('2');
    await expect(clusterPin.locator('.custom-marker-cluster-label')).toHaveText('HOMES');

    // The individual pins are absorbed into the cluster and must NOT be
    // independently visible — proves clustering itself is unaffected by the
    // #1942 label-derivation change (the two code paths remain separate).
    await expect(page.locator(markerSelector(CLUSTER_PIN_A_ID))).toHaveCount(0);
    await expect(page.locator(markerSelector(CLUSTER_PIN_B_ID))).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3) Residual case: no exact price AND no priceBand — accessible label still
//    present even though the visible glyph is minimal ('—').
// ─────────────────────────────────────────────────────────────────────────

test.describe('@integration-ui #1942 — residual pin exposes an accessible label', () => {
  test('3: pin with no price and no priceBand shows "—" but keeps a "Price unavailable" aria-label', async ({ page }) => {
    await gotoAreaFirstMap(page, [
      {
        id: RESIDUAL_PIN_ID,
        propertyType: 'agricultural_land',
        title: 'Residual Fixture',
        locality: 'Manipal',
        listingPurpose: 'sale',
        lat: MANIPAL_LAT,
        lon: MANIPAL_LON,
        pricePaise: null,
        priceBand: null,
      },
    ]);

    const pin = page.locator(markerSelector(RESIDUAL_PIN_ID));
    await expect(pin).toBeVisible({ timeout: 20_000 });
    await expect(pin).toContainText('—');
    await expect(pin).toHaveAttribute('aria-label', 'Price unavailable');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4) Authed — same pin shows the exact price, never the band (no regression).
// ─────────────────────────────────────────────────────────────────────────

test.describe('#1942 — authed pin shows exact price, not the band', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('4: authed session renders the exact price on the pin, never the band', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

    await gotoAreaFirstMap(page, [
      {
        id: AUTHED_PIN_ID,
        propertyType: 'apartment',
        title: 'Authed Pin Fixture',
        locality: 'Manipal',
        listingPurpose: 'sale',
        lat: MANIPAL_LAT,
        lon: MANIPAL_LON,
        pricePaise: EXACT_PRICE_RUPEES * 100,
        // Backend contract is mutually-exclusive, but even if a stray
        // priceBand leaked through on an authed response, deriveMarkerLabel's
        // exact-price-wins precedence must ignore it — assert that here too.
        priceBand: BAND,
      },
    ]);

    const pin = page.locator(markerSelector(AUTHED_PIN_ID));
    await expect(pin).toBeVisible({ timeout: 20_000 });
    await expect(pin).toContainText(EXACT_PRICE_TEXT);
    await expect(pin).not.toContainText(BAND);
  });
});
