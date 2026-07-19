/**
 * E2E — Issue #1941: anonymous residential price consistency (security-labeled).
 *
 * Bug: the anon-only teaser mapper leaked exact residential price on the
 * getById/discovery/within-polygon endpoints. The fix makes anon RESIDENTIAL
 * responses carry a coarse `priceBand` (e.g. "₹1–2Cr") and null price/pricePaise,
 * on BOTH price-bearing surfaces:
 *   - the map marker peek/popover card (MarkerPopoverCard, `popover-price` /
 *     `popover-price-band` testids)
 *   - the listing detail page (ListingDetailMainContent, band rendered as the
 *     price <p> when exact price is absent — no dedicated testid, scoped via
 *     the summary price container).
 * Authed callers are unaffected (exact price on both surfaces, no priceBand).
 * Agricultural listings are unaffected on either surface (still "Sign in to
 * view price" / no price at all — AgriListingDetail's `agri-detail-price-signin`
 * testid, untouched by this fix).
 *
 * Backend-free: every endpoint the pages call is stubbed via page.route() with
 * explicit fixtures (same pattern as e2e/discover-1738-regression.spec.ts and
 * e2e/discover-trust-badge-1567.spec.ts) so these tests do not depend on live
 * seed data or a live backend for the price-band assertions. The one exception
 * is AC5's real sign-in/sign-out round trip (requires SMOKE_USER_EMAIL/
 * SMOKE_USER_PASSWORD against the configured dev backend — never the shared
 * hosted Supabase project — and skips gracefully when creds are absent, same
 * convention as e2e/auth-journey-1509.spec.ts).
 *
 * Fixture listing IDs are the repro IDs from the approved plan
 * (.claude/handoffs/issue-1941/approved-plan.toml):
 *   - RESIDENTIAL_ID: a1286c10-6843-da5e-44f8-e188db9e638f
 *   - AGRI_ID (control): a6210001-0000-0000-0000-000000000001
 *   - NO_PRICE_ID: a synthetic sibling of RESIDENTIAL_ID (null price AND null
 *     priceBand — a listing whose DB price really is null; the plan's own repro
 *     ID always has a price, so a distinct ID is required for the honest-absence
 *     edge case).
 *
 * Run locally (stack already running):
 *   npx playwright test e2e/discover-anon-price-consistency-1941.spec.ts --project=full
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { hasRealCredentials } from './helpers';

// ── Fixture IDs (repro IDs from approved-plan.toml where usable) ──────────

const RESIDENTIAL_ID = 'a1286c10-6843-da5e-44f8-e188db9e638f';
const AGRI_ID = 'a6210001-0000-0000-0000-000000000001';
// Distinct ID: the plan's residential repro listing always has a price, so the
// null-price honest-absence edge case needs its own fixture identity.
const NO_PRICE_ID = 'a1286c10-6843-da5e-44f8-e188db9e638d';

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);
const MANIPAL_LAT = 13.3525;
const MANIPAL_LON = 74.79226;

// Band string taken verbatim from the plan's own example and from the
// already-merged unit tests (MarkerPopoverCard.test.tsx / ListingDetailMainContent.test.tsx)
// so this E2E stays consistent with the unit-level contract.
const BAND = '₹1–2Cr';
// 13,500,000 rupees -> formatPrice() -> "₹1.35 Cr" (also matches the unit tests).
const EXACT_PRICE_RUPEES = 13_500_000;
const EXACT_PRICE_TEXT = '₹1.35 Cr';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

// ── Route helpers ───────────────────────────────────────────────────────

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** GET /api/public/listings/:id response shape (subset of PublicListingDetail). */
function residentialDetailFixture(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    propertyType: 'apartment',
    title: '#1941 QA Residential Fixture',
    locality: 'Manipal',
    listingPurpose: 'sale',
    images: [],
    primaryImageUrl: null,
    imageCount: 0,
    bedrooms: 2,
    bathrooms: 2,
    builtArea: 1100,
    builtAreaUnit: 'sqft',
    price: null,
    pricePaise: null,
    priceBand: null,
    ...overrides,
  };
}

function agriDetailFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: AGRI_ID,
    propertyType: 'agricultural_land',
    title: '#1941 QA Agri Control Fixture',
    locality: 'Hebri',
    listingPurpose: 'sale',
    images: [],
    primaryImageUrl: null,
    imageCount: 0,
    landArea: 2.5,
    landAreaUnit: 'acres',
    waterSource: 'Bore well',
    soilType: 'Red laterite',
    roadAccess: 'Metalled road',
    cultivationStatus: 'Partly cultivated',
    ownershipType: 'Freehold',
    boundary: null,
    latitude: MANIPAL_LAT,
    longitude: MANIPAL_LON,
    computedAreaAcres: null,
    price: null,
    pricePaise: null,
    // Agri NEVER sets priceBand — the fix is residential-only. Kept explicit
    // null here so a future regression that starts fabricating an agri band
    // would show up as a rendered `₹` string this suite asserts against.
    priceBand: null,
    ...overrides,
  };
}

/** Stub the non-price side calls the detail page always fires (kept inert/empty). */
async function stubDetailSideCalls(page: Page, id: string): Promise<void> {
  await page.route(`**/api/public/listings/${id}/price-history**`, (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route(`**/api/listings/${id}/trust**`, (route) =>
    fulfillJson(route, 200, { badges: [] }),
  );
}

/** Stub GET /api/public/listings/:id with a fixed fixture (used by static-state tests). */
async function stubListingDetailStatic(page: Page, id: string, body: unknown): Promise<void> {
  await page.route(`**/api/public/listings/${id}`, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return fulfillJson(route, 200, body);
  });
  await stubDetailSideCalls(page, id);
}

function cityListingsFixture(areaKey: string, listing: Record<string, unknown>) {
  return {
    city: 'udupi',
    limitPerArea: 50,
    areas: [
      {
        areaKey,
        areaName: 'Manipal',
        listings: [listing],
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

function popoverLocator(page: Page) {
  return page.getByTestId('marker-popover-card');
}

function markerSelector(id: string): string {
  return `[data-listing-id="${id}"] [data-testid="property-marker"]`;
}

const areaFirstUrl =
  `/discover?city=udupi&journey=area-first&areaKey=${ENCODED_AREA_KEY}` +
  `&lat=${MANIPAL_LAT}&lon=${MANIPAL_LON}&zoom=14`;

/** Navigate to the area-first map, wait for the (mocked) listings, click the marker, open the popover. */
async function openPopover(
  page: Page,
  id: string,
  listingFixture: Record<string, unknown>,
): Promise<ReturnType<typeof popoverLocator>> {
  await stubMapSideCalls(page);
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, cityListingsFixture(MANIPAL_AREA_KEY, listingFixture)),
  );

  const listingsResponse = page.waitForResponse(
    (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
  );
  await page.goto(areaFirstUrl);
  await listingsResponse;
  await page.waitForLoadState('networkidle');

  const marker = page.locator(markerSelector(id));
  await expect(marker).toBeVisible({ timeout: 20_000 });
  await marker.click();

  const popover = popoverLocator(page);
  await expect(popover).toBeVisible({ timeout: 10_000 });
  return popover;
}

/**
 * Scoped locator for the detail page's summary price container
 * (ListingDetailMainContent's `shrink-0 text-right` block). No data-testid
 * exists on this element in the implementation, so this test relies on the
 * stable Tailwind class pair already asserted-by-shape in the component's
 * own unit tests — documented here so a future refactor that drops the class
 * pair is a visible, intentional break of this spec, not a silent one.
 */
function detailPriceContainer(page: Page) {
  return page.locator('.shrink-0.text-right').first();
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Happy path — anon: SAME band on both surfaces, exact price absent on both
// ─────────────────────────────────────────────────────────────────────────

test.describe('@integration-ui #1941 — anon residential price consistency (happy path)', () => {
  test('1a: anon popover shows the price band, never the exact price', async ({ page }) => {
    const popover = await openPopover(page, RESIDENTIAL_ID, {
      id: RESIDENTIAL_ID,
      propertyType: 'apartment',
      title: 'Popover Residential Fixture',
      locality: 'Manipal',
      listingPurpose: 'sale',
      lat: MANIPAL_LAT,
      lon: MANIPAL_LON,
      pricePaise: null,
      priceBand: BAND,
    });

    const priceEl = popover.getByTestId('popover-price');
    await expect(priceEl).toBeVisible();
    await expect(popover.getByTestId('popover-price-band')).toHaveText(BAND);
    await expect(priceEl).not.toContainText(EXACT_PRICE_TEXT);
    await expect(priceEl).not.toContainText('Sign in to view price');
  });

  test('1b: anon detail page shows the SAME price band, never the exact price', async ({ page }) => {
    await stubListingDetailStatic(
      page,
      RESIDENTIAL_ID,
      residentialDetailFixture(RESIDENTIAL_ID, { price: null, pricePaise: null, priceBand: BAND }),
    );

    await page.goto(`/listing/${RESIDENTIAL_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const priceContainer = detailPriceContainer(page);
    await expect(priceContainer).toContainText(BAND, { timeout: 10_000 });
    await expect(priceContainer).not.toContainText(EXACT_PRICE_TEXT);
    // Cross-surface consistency: the SAME literal band string renders on both
    // surfaces for the same listing id — proven by 1a and 1b sharing the BAND
    // constant and both asserting on it directly (no independent derivation).
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2) Authed — exact price unchanged on both surfaces (no regression)
// ─────────────────────────────────────────────────────────────────────────

test.describe('@integration-ui #1941 — authed residential exact price unchanged', () => {
  // isAuthenticated is derived from the REAL Supabase session (AuthContext), not
  // from the mocked API responses — a real authenticated storageState is required
  // for MarkerPopoverCard / the detail page to even take the authed branch.
  // Gracefully skips (see SMOKE_USER_EMAIL/PASSWORD) rather than false-failing on
  // the anon branch, matching e2e/listing-detail-viewing.spec.ts's LDV1/LDV2 convention.
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('2a: authed popover shows the exact price, never the band', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');
    const popover = await openPopover(page, RESIDENTIAL_ID, {
      id: RESIDENTIAL_ID,
      propertyType: 'apartment',
      title: 'Popover Residential Fixture (authed)',
      locality: 'Manipal',
      listingPurpose: 'sale',
      lat: MANIPAL_LAT,
      lon: MANIPAL_LON,
      pricePaise: EXACT_PRICE_RUPEES * 100,
      // Backend contract is mutually-exclusive, but even if a stray priceBand
      // leaked through on an authed response, MarkerPopoverCard's authed branch
      // must ignore it — assert that here too.
      priceBand: BAND,
    });

    const priceEl = popover.getByTestId('popover-price');
    await expect(priceEl).toHaveText(EXACT_PRICE_TEXT);
    await expect(popover.getByTestId('popover-price-band')).toHaveCount(0);
    await expect(priceEl).not.toContainText(BAND);
  });

  test('2b: authed detail page shows the exact price, never the band', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');
    await stubListingDetailStatic(
      page,
      RESIDENTIAL_ID,
      residentialDetailFixture(RESIDENTIAL_ID, {
        price: EXACT_PRICE_RUPEES,
        pricePaise: EXACT_PRICE_RUPEES * 100,
        priceBand: BAND,
      }),
    );

    await page.goto(`/listing/${RESIDENTIAL_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const priceContainer = detailPriceContainer(page);
    await expect(priceContainer).toContainText(EXACT_PRICE_TEXT, { timeout: 10_000 });
    await expect(priceContainer).not.toContainText(BAND);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3) Agri control — unchanged on both surfaces (no regression, no band ever)
// ─────────────────────────────────────────────────────────────────────────

test.describe('@integration-ui #1941 — agri control unaffected', () => {
  test('3a: agri popover: still "Sign in to view price", no band testid, no exact digits', async ({ page }) => {
    const popover = await openPopover(page, AGRI_ID, {
      id: AGRI_ID,
      propertyType: 'agricultural_land',
      title: 'Popover Agri Control Fixture',
      locality: 'Hebri',
      listingPurpose: 'sale',
      lat: MANIPAL_LAT,
      lon: MANIPAL_LON,
      pricePaise: null,
      priceBand: null,
    });

    const priceEl = popover.getByTestId('popover-price');
    await expect(priceEl).toContainText('Sign in to view price');
    await expect(popover.getByTestId('popover-price-band')).toHaveCount(0);
    await expect(priceEl).not.toContainText(/₹/);
  });

  test('3b: agri detail page: still the sign-in price affordance, no exact price, no band', async ({ page }) => {
    await stubListingDetailStatic(page, AGRI_ID, agriDetailFixture());

    await page.goto(`/listing/${AGRI_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('agri-detail-price-signin')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('agri-detail-price-signin')).toContainText('Sign in to view price');
    // Never fabricate a band or leak an exact figure for agri.
    await expect(page.getByText(BAND)).toHaveCount(0);
    await expect(page.getByText(EXACT_PRICE_TEXT)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4) Edge case — null-price residential listing: honest absence, never fabricated
// ─────────────────────────────────────────────────────────────────────────

test.describe('@integration-ui #1941 — no-price residential listing: honest absence', () => {
  test('4: anon detail page with price=null AND priceBand=null renders no band and no exact price', async ({ page }) => {
    await stubListingDetailStatic(
      page,
      NO_PRICE_ID,
      residentialDetailFixture(NO_PRICE_ID, { price: null, pricePaise: null, priceBand: null }),
    );

    await page.goto(`/listing/${NO_PRICE_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the listing to actually resolve before asserting an absence
    // (otherwise a loading skeleton would trivially pass this check). Scoped to
    // the h1 title — a plain getByText match is ambiguous here because the
    // breadcrumb's current-page <li> also contains the exact same title text.
    await expect(
      page.getByRole('heading', { level: 1, name: '#1941 QA Residential Fixture' }),
    ).toBeVisible({ timeout: 10_000 });

    const priceContainer = detailPriceContainer(page);
    // Mirrors the unit-test assertion in ListingDetailMainContent.test.tsx
    // ("neither price nor priceBand -> honest absence, no fabricated value rendered").
    await expect(priceContainer.getByText(/₹/)).toHaveCount(0);
    await expect(priceContainer).not.toContainText(BAND);
    await expect(priceContainer).not.toContainText(EXACT_PRICE_TEXT);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5) Rapid login-during-session: proves the auth-scoped cache key
//    (listingKeys.public(id, isAuthenticated)) in BOTH directions.
// ─────────────────────────────────────────────────────────────────────────

test.describe('#1941 — rapid login/logout mid-session proves the auth-scoped cache key', () => {
  test('5: anon band -> login refetches to exact price; logout reverts to band (no stale reuse)', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

    await stubDetailSideCalls(page, RESIDENTIAL_ID);

    // Single handler branches on the Authorization header the real api client
    // attaches once a Supabase session exists — this is what actually flips
    // when the useQuery's queryKey (listingKeys.public(id, isAuthenticated))
    // changes and a fresh fetch fires. If the cache key were NOT auth-scoped,
    // the query below would never re-request after login (staleTime is 5 min)
    // and the DOM would keep showing the stale anon band.
    await page.route(`**/api/public/listings/${RESIDENTIAL_ID}`, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const authed = Boolean(route.request().headers()['authorization']);
      return fulfillJson(
        route,
        200,
        authed
          ? residentialDetailFixture(RESIDENTIAL_ID, {
              price: EXACT_PRICE_RUPEES,
              pricePaise: EXACT_PRICE_RUPEES * 100,
              priceBand: null,
            })
          : residentialDetailFixture(RESIDENTIAL_ID, { price: null, pricePaise: null, priceBand: BAND }),
      );
    });

    // ── Step 1: anon load — band shown ────────────────────────────────────
    await page.goto(`/listing/${RESIDENTIAL_ID}`);
    await page.waitForLoadState('domcontentloaded');
    const priceContainer = detailPriceContainer(page);
    await expect(priceContainer).toContainText(BAND, { timeout: 10_000 });
    await expect(priceContainer).not.toContainText(EXACT_PRICE_TEXT);

    // ── Step 2: sign in, with returnTo back to this exact listing ─────────
    const authedRequest = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/public/listings/${RESIDENTIAL_ID}`) &&
        req.method() === 'GET' &&
        Boolean(req.headers()['authorization']),
      { timeout: 20_000 },
    );

    await page.goto(`/auth?returnTo=/listing/${RESIDENTIAL_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('#signin-email').fill(userEmail);
    await page.locator('#signin-password').fill(userPassword);
    await page
      .locator('button[type="submit"]')
      .filter({ hasText: /sign in/i })
      .first()
      .click();
    await page.waitForURL(new RegExp(`/listing/${RESIDENTIAL_ID}`), { timeout: 15_000 });

    // Proves a NEW authenticated fetch actually fired (cache-key scoping, not
    // a lucky coincidence of eventual DOM state).
    await authedRequest;

    // ── Step 3: exact price now shown, band gone — no stale anon reuse ────
    await expect(priceContainer).toContainText(EXACT_PRICE_TEXT, { timeout: 10_000 });
    await expect(priceContainer).not.toContainText(BAND);

    // ── Step 4: sign out ───────────────────────────────────────────────────
    const avatarButton = page.locator('button.rounded-full, button[class*="rounded-full"]').first();
    await expect(avatarButton).toBeVisible({ timeout: 10_000 });
    await avatarButton.click();
    const signOutItem = page.locator('[role="menuitem"]').filter({ hasText: /sign out/i }).first();
    await expect(signOutItem).toBeVisible({ timeout: 5_000 });

    const anonRequestAfterLogout = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/public/listings/${RESIDENTIAL_ID}`) &&
        req.method() === 'GET' &&
        !req.headers()['authorization'],
      { timeout: 20_000 },
    );

    await signOutItem.click();
    await page.waitForURL('/', { timeout: 10_000 });

    // ── Step 5: navigate back to the listing — must revert to band, not the
    //     just-cached authed exact price ────────────────────────────────────
    await page.goto(`/listing/${RESIDENTIAL_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Proves a NEW anonymous fetch actually fired post-logout.
    await anonRequestAfterLogout;

    await expect(priceContainer).toContainText(BAND, { timeout: 10_000 });
    await expect(priceContainer).not.toContainText(EXACT_PRICE_TEXT);
  });
});
