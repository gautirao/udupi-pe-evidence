/**
 * discover-1939-listing-peek-url-restore.spec.ts
 *
 * E2E regression spec for issue #1939 — the Discover listing "peek" popover
 * (MarkerPopoverCard) did not restore from the URL `listing=<uuid>` param on
 * Back/Forward/hard-refresh/deep-link, even though the marker highlight did
 * restore on its own (DiscoverMapCanvas passes urlState.selectedListing
 * straight through to PropertyMap's selectedListingId prop).
 *
 * Fix under test:
 *   - src/features/discover/state/useMarkerSelection.ts — new
 *     hydrateSelectedMarkerFromUrl(), idempotent + persistently suppressed
 *     right after "Show in list" dismisses the popover for the same id
 *     (LEAVE_PARAM_NO_POPOVER contract for an unresolvable id).
 *   - src/pages/MapDiscovery.tsx — a URL-hydration useEffect gated on
 *     isMarkerPopoverEligible && mapReady && urlHydratedMarkerListing (the
 *     resolved listing from currentMapMarkerListings, the SAME ordered array
 *     the results panel/stepper trust).
 *
 * Journey: area-first residential, areaKey=Whitefield inside the tech-corridor
 * group (Bangalore) — mirrors the exact confirmed repro URL from the bug:
 *   /discover?city=bangalore&journey=area-first&groupId=tech-corridor
 *     &lat=12.97&lon=77.75&zoom=14&areaKey=IN%7CKA%7CBengaluru%7CWhitefield
 *     &listing=<uuid>
 *
 * Stub-first (page.route) — no backend/Testcontainers dependency, mirrors the
 * stub patterns in discover-1738-regression.spec.ts and
 * discover-results-redesign-1547.spec.ts. A single listing, centred exactly
 * on the goto lat/lon, renders as one individually-clickable property marker
 * (no clustering ambiguity to resolve).
 *
 * Scenarios (bug #1939 ACs):
 *   AC1 — deep-link cold load: popover visible + marker highlighted
 *   AC2 — hard refresh (page.reload()): same as AC1 — this is the specific
 *          previously-broken path (highlight restored, popover did not)
 *   AC3 — browser Back after "View details" navigation restores the popover
 *          itself, not just the marker highlight
 *   AC4 — Forward then Back again still restores the popover
 *   AC6 — closing the popover (X button) removes listing= from the URL and
 *          hides the card
 *   AC8 — an unresolvable listing id fails safe: no popover, no uncaught
 *          error, page stays usable (LEAVE_PARAM_NO_POPOVER)
 *   AC9 — unrelated URL state (city/journey/areaKey/groupId) survives a
 *          deep-link hydration round-trip unchanged
 *
 * REWORK (external review findings F1/F2, added post-#1946):
 *   F1 — URL→UI reverse-sync: a marker click pushes listing=<id> and opens
 *          the popover, but the ORIGINAL fix only handled URL→popover
 *          hydration on mount/refresh/deep-link — it did not close the
 *          popover when history navigation (Back) removed listing= from the
 *          URL out from under it. clearMarkerPopoverFromUrl (useMarkerSelection)
 *          now does that; this spec's F1 test is the regression guard.
 *   F2 — bounded rAF readiness retry: hydrateSelectedMarkerFromUrl's first
 *          DOM query for the marker can race Leaflet's own marker-mount
 *          effect (currentMapMarkerListings changes and the hydration effect
 *          can fire before MarkerClusterLayer has actually attached the
 *          marker DOM node for a data-just-arrived marker). Without the ~30
 *          frame / ~500ms rAF retry loop, that race would silently leave
 *          LEAVE_PARAM_NO_POPOVER even though the marker went on to paint a
 *          few frames later. This spec's F2 test delays the listings fixture
 *          response so the marker set (and thus its DOM) is not present at
 *          the moment hydrateSelectedMarkerFromUrl's gating effect first
 *          fires, and asserts the popover still restores.
 *
 * REWORK ROUND 3 (finding F3, added post rework-request-pr-review-2.toml):
 *   F3 — third reconciliation branch (MapDiscovery.tsx's URL-hydration
 *          effect): when the URL names a listing id B that is NOT (yet)
 *          resolvable against currentMapMarkerListings (urlHydratedMarkerListing
 *          == null) WHILE a DIFFERENT listing's popover (A) is still showing
 *          locally (selectedMarkerListing != null && its id !== B), the
 *          effect previously did nothing — the screen kept showing A's stale
 *          popover even though the URL/selection had already moved on. The
 *          fix calls clearMarkerPopoverFromUrl() (which also cancels any
 *          in-flight F2 retry for the OLD id) in that branch, deliberately
 *          WITHOUT stripping the URL's `listing` param, so once B resolves
 *          the happy-path branch hydrates it normally. Two required specs:
 *            - "valid A -> unresolvable B": B never resolves (a well-formed
 *              but unknown id, reusing AC8's INVALID_LISTING_ID) — A must
 *              close and STAY closed; the URL keeps B.
 *            - "valid A -> delayed valid B": B DOES eventually resolve (a
 *              second listing in a second area within the same group), but
 *              its data arrives late — A must close promptly (not linger)
 *              and B's popover must eventually open once its data (and
 *              marker DOM) become available.
 *          Both drive the URL change via pushUrlInApp (history.pushState +
 *          a synthetic 'popstate' dispatch) rather than page.goto/reload:
 *          a fresh document load would never have A open in the first
 *          place, which would make "A must close" trivially true regardless
 *          of whether this fix's third branch exists at all — see
 *          pushUrlInApp's own comment below for the full rationale.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     e2e/discover-1939-listing-peek-url-restore.spec.ts --project=full
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixture constants — mirrors the confirmed repro URL from issue #1939
// ---------------------------------------------------------------------------

const CITY = 'bangalore';
const AREA_KEY = 'IN|KA|Bengaluru|Whitefield';
const GROUP_ID = 'tech-corridor';
const GROUP_NAME = 'Tech Corridor';
const LISTING_ID = 'a1286c10-6843-da5e-44f8-e188db9e638f';
const INVALID_LISTING_ID = '00000000-0000-0000-0000-000000000000';
const LAT = '12.97';
const LON = '77.75';
const ZOOM = '14';
const LISTING_TITLE = 'Tech Corridor 3BHK Apartment';

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Whitefield',
      geoCenterLat: 12.97,
      geoCenterLon: 77.75,
      minLat: 12.94,
      maxLat: 13.0,
      minLon: 77.71,
      maxLon: 77.79,
      listingCount90d: 1,
      listingCount: 1,
      schoolCount: 0,
      trendDirection: 'stable',
    },
  ],
};

const AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      slug: GROUP_ID,
      name: GROUP_NAME,
      subtitle: '1 locality',
      regionLabel: 'East',
      displayOrder: 1,
      areaKeys: [AREA_KEY],
      focusLat: 12.97,
      focusLon: 77.75,
      minLat: 12.94,
      minLon: 77.71,
      maxLat: 13.0,
      maxLon: 77.79,
    },
  ],
};

const CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: 'Whitefield',
      listings: [
        {
          id: LISTING_ID,
          title: LISTING_TITLE,
          pricePaise: 750000000,
          propertyType: 'apartment',
          locality: 'Whitefield',
          primaryImageUrl: null,
          listingPurpose: 'sale',
          bedrooms: 3,
          bathrooms: 3,
          lat: 12.97,
          lon: 77.75,
          latitude: 12.97,
          longitude: 77.75,
        },
      ],
    },
  ],
};

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

const LISTING_DETAIL_FIXTURE = {
  id: LISTING_ID,
  title: LISTING_TITLE,
  propertyType: 'apartment',
  images: [],
  pricePaise: 750000000,
  locality: 'Whitefield',
  city: 'Bangalore',
  bedrooms: 3,
  bathrooms: 3,
  listingPurpose: 'sale',
  status: 'LIVE',
  areaKey: AREA_KEY,
  description: 'Spacious 3BHK apartment in the Whitefield tech corridor.',
};

// ---------------------------------------------------------------------------
// REWORK ROUND 3 (F3) — a SECOND area + a SECOND listing ("B"), used only by
// the two F3 tests below. Kept entirely separate from the fixtures above (no
// existing test touches these) so the original 9 scenarios are byte-identical
// to before this rework. AREA_KEY_B sits in the SAME tech-corridor group as
// AREA_KEY so a real in-app transition between them (via pushUrlInApp) stays
// within one journey/group — exactly the kind of "step to a sibling area"
// URL change a live app session can produce, needed so the F3 "delayed valid
// B" test can force a genuine second /listings fetch (useDiscoverCityListings'
// query key is keyed on areaKeys — see src/hooks/useDiscoverCityListings.ts —
// so an in-app areaKey change, unlike a listing-only change, reliably
// triggers a fresh, independently-delayable network request) without a full
// page reload tearing down A's already-open popover.
// ---------------------------------------------------------------------------

const AREA_KEY_B = 'IN|KA|Bengaluru|Marathahalli';
const LISTING_ID_B = 'b2397d21-7954-eb6f-55f9-f299ec7f749a';
const LISTING_TITLE_B = 'Tech Corridor 2BHK Apartment';

const DISCOVER_AREAS_FIXTURE_TWO_AREAS = {
  city: CITY,
  areas: [
    ...DISCOVER_AREAS_FIXTURE.areas,
    {
      areaKey: AREA_KEY_B,
      name: 'Marathahalli',
      geoCenterLat: 12.956,
      geoCenterLon: 77.701,
      minLat: 12.93,
      maxLat: 12.98,
      minLon: 77.67,
      maxLon: 77.73,
      listingCount90d: 1,
      listingCount: 1,
      schoolCount: 0,
      trendDirection: 'stable',
    },
  ],
};

const AREA_GROUPS_FIXTURE_TWO_AREAS = {
  city: CITY,
  groups: [
    {
      ...AREA_GROUPS_FIXTURE.groups[0],
      subtitle: '2 localities',
      areaKeys: [AREA_KEY, AREA_KEY_B],
    },
  ],
};

/** A-only response — same shape/contents as CITY_LISTINGS_FIXTURE, kept as its own
 * const so the F3 two-area stub doesn't depend on reading through the shared one. */
const CITY_LISTINGS_FIXTURE_AREA_A = CITY_LISTINGS_FIXTURE;

const CITY_LISTINGS_FIXTURE_AREA_B = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY_B,
      areaName: 'Marathahalli',
      listings: [
        {
          id: LISTING_ID_B,
          title: LISTING_TITLE_B,
          pricePaise: 550000000,
          propertyType: 'apartment',
          locality: 'Marathahalli',
          primaryImageUrl: null,
          listingPurpose: 'sale',
          bedrooms: 2,
          bathrooms: 2,
          lat: 12.956,
          lon: 77.701,
          latitude: 12.956,
          longitude: 77.701,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Stub every Discover/listing-detail route this journey touches. */
async function stubAll(page: Page): Promise<void> {
  // INTEGRATION-UI: stubs isolate from backend/seed variability.
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, 200, AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/regional-area-groups**', (r) => fulfillJson(r, 200, { groups: [] }));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/discover/markers**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/agri-map-listings**', (r) => fulfillJson(r, 200, { listings: [] }));
  await page.route('**/api/trends/options**', (r) =>
    fulfillJson(r, 200, { city: CITY, defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Whitefield' }] }),
  );
  await page.route('**/api/public/schools/popular**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/schools/search**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, 200, []));
  // Listing detail route — hit only by AC3/AC4's "View details" navigation.
  await page.route(`**/api/public/listings/${LISTING_ID}`, (r) =>
    fulfillJson(r, 200, LISTING_DETAIL_FIXTURE),
  );
  await page.route(`**/api/public/listings/${LISTING_ID}/price-history`, (r) => fulfillJson(r, 200, []));
  await page.route(`**/api/listings/${LISTING_ID}/trust`, (r) => fulfillJson(r, 200, { badges: [] }));
}

/**
 * REWORK F2 — same stubs as stubAll, but the city-listings route (the source
 * of currentMapMarkerListings, and therefore of the marker's own DOM node)
 * is delayed by `delayMs` before fulfilling. This reproduces "the marker's
 * data — and DOM — is not there yet the first time hydrateSelectedMarkerFromUrl's
 * gating effect fires" without needing to reach into React internals: the
 * hydration effect's dependency (urlHydratedMarkerListing) cannot resolve
 * until this route resolves, so the very first hydration attempt has to
 * live-poll for a marker DOM node that doesn't exist yet at that instant,
 * exactly the race hydrateSelectedMarkerFromUrl's bounded rAF retry (F2)
 * exists to survive. Deliberately well under the ~500ms/30-frame retry
 * budget so a correct fix has margin, and well above "instant" so a reverted
 * fix (single DOM query, no retry) would reliably see no marker element yet.
 */
async function stubAllWithDelayedListings(page: Page, delayMs: number): Promise<void> {
  await stubAll(page);
  await page.route('**/api/discover/cities/*/listings**', async (r) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await fulfillJson(r, 200, CITY_LISTINGS_FIXTURE);
  });
}

/**
 * REWORK ROUND 3 (F3) — two areas (AREA_KEY = A's Whitefield, AREA_KEY_B =
 * B's Marathahalli) in the SAME tech-corridor group. `/api/discover/areas`
 * and `/api/discover/area-groups` return BOTH areas up front (so an in-app
 * areaKey change resolves `selectedArea` instantly — see
 * src/hooks/useDiscoverMapData.ts's `areaKeys: selectedArea ? [selectedArea.areaKey] : []`).
 * The `/listings` route branches on the request's `areaKeys` query param:
 * Whitefield (A) resolves immediately; Marathahalli (B) is delayed by
 * `delayMs`, reproducing "B is a genuinely different, resolvable listing
 * whose data (and therefore marker DOM) legitimately arrives late" — the
 * scenario the F3 test needs, as opposed to F2's "same id, late" case.
 */
async function stubAllWithSecondAreaDelayed(page: Page, delayMs: number): Promise<void> {
  await stubAll(page);
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE_TWO_AREAS));
  await page.route('**/api/discover/area-groups**', (r) =>
    fulfillJson(r, 200, AREA_GROUPS_FIXTURE_TWO_AREAS),
  );
  await page.route('**/api/discover/cities/*/listings**', async (r) => {
    const requestUrl = new URL(r.request().url());
    const areaKeys = requestUrl.searchParams.getAll('areaKeys');
    if (areaKeys.includes(AREA_KEY_B)) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await fulfillJson(r, 200, CITY_LISTINGS_FIXTURE_AREA_B);
      return;
    }
    await fulfillJson(r, 200, CITY_LISTINGS_FIXTURE_AREA_A);
  });
}

/** Builds the repro deep-link URL, optionally with a `listing=` param. */
function repoUrl(listingId?: string): string {
  return repoUrlForArea(AREA_KEY, listingId);
}

/**
 * REWORK ROUND 3 (F3) — same shape as repoUrl, but with the areaKey (and, for
 * AREA_KEY_B, the map centre) parameterized so the "delayed valid B" test can
 * build a URL pointing at the second area/listing.
 */
function repoUrlForArea(areaKey: string, listingId?: string): string {
  const isAreaB = areaKey === AREA_KEY_B;
  const params = new URLSearchParams({
    city: CITY,
    journey: 'area-first',
    groupId: GROUP_ID,
    lat: isAreaB ? '12.956' : LAT,
    lon: isAreaB ? '77.701' : LON,
    zoom: ZOOM,
    areaKey,
  });
  if (listingId) params.set('listing', listingId);
  return `/discover?${params.toString()}`;
}

/**
 * REWORK ROUND 3 (F3) — drives a genuine in-app SPA URL change (the same
 * kind of transition a real marker click or sibling-step produces) WITHOUT a
 * full document reload, so any already-open popover / component state (e.g.
 * listing A's selectedMarkerListing) survives into the new URL exactly like
 * it would for a real user-triggered client-side navigation.
 *
 * Why not page.goto/page.reload: those always perform a full browser
 * navigation even when only the query string differs, tearing down the
 * entire React tree. For the F3 "valid A -> unresolvable B" test in
 * particular, a fresh document load would never have A open to begin with,
 * which would make the "A's popover must close" assertion trivially true
 * regardless of whether the fix's third reconciliation branch
 * (MapDiscovery.tsx's URL-hydration effect, the `selectedMarkerListing != null
 * && selectedMarkerListing.id !== urlState.selectedListing` branch) exists at
 * all — defeating the point of the regression guard.
 *
 * Why pushState + a synthetic 'popstate' dispatch, not pushState alone:
 * react-router's BrowserRouter (confirmed in src/App.tsx) only listens for
 * the native 'popstate' event to notice externally-driven location changes;
 * a raw history.pushState() updates window.location but does not, by itself,
 * notify react-router's internal listeners. Dispatching PopStateEvent after
 * pushState is the standard technique to make react-router pick up an
 * external navigation — functionally the same mechanism AC3/AC4/F1 above
 * already exercise via page.goBack()/page.goForward(), which are also real
 * browser 'popstate' events under the hood.
 */
async function pushUrlInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState(window.history.state, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

function popoverLocator(page: Page) {
  return page.getByTestId('marker-popover-card');
}

/** The single property marker element for a given listing id (data-listing-id wrapper). */
function markerLocator(page: Page, listingId: string) {
  return page.locator(`[data-listing-id="${listingId}"] [data-testid="property-marker"]`);
}

/** The same marker, but only matches when it carries the copper selected/highlighted state. */
function selectedMarkerLocator(page: Page, listingId: string) {
  return page.locator(
    `[data-listing-id="${listingId}"] [data-testid="property-marker"][data-selected="true"]`,
  );
}

/**
 * Matches whichever right-panel surface is mounted for the area-first journey.
 * The canonical panel (Issues #1956/#2084) uses `discover-areas-journey-panel-shell`;
 * the legacy DiscoverRightPanel uses `discover-right-panel`. Both satisfy the
 * intent of "the page's right panel is visible and the page is usable".
 */
function panelLocator(page: Page) {
  return page.locator(
    '[data-testid="discover-right-panel"], [data-testid="discover-areas-journey-panel-shell"]',
  ).first();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui Issue #1939 — listing peek popover restores from URL', () => {
  test.use({ storageState: undefined });

  test('AC1: deep-link cold load — popover visible AND marker highlighted', async ({ page }) => {
    await stubAll(page);
    await page.goto(repoUrl(LISTING_ID));
    await page.waitForLoadState('networkidle');

    // Primary business assertion: the popover CARD itself must render (this is the
    // part that regressed in #1939 — the highlight alone was not enough).
    await expect(popoverLocator(page)).toBeVisible({ timeout: 20_000 });
    await expect(popoverLocator(page)).toHaveAttribute('role', 'dialog');
    await expect(popoverLocator(page).getByTestId('marker-popover-close')).toBeVisible();
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE);

    // The marker highlight (the part that already worked pre-fix) must ALSO be present.
    await expect(selectedMarkerLocator(page, LISTING_ID)).toHaveCount(1, { timeout: 10_000 });
  });

  test('AC2: hard refresh — popover AND marker highlight both restore (previously-broken cold path)', async ({
    page,
  }) => {
    await stubAll(page);
    await page.goto(repoUrl(LISTING_ID));
    await page.waitForLoadState('networkidle');
    await expect(popoverLocator(page)).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Both assertions matter here: pre-fix, the highlight alone would restore
    // (URL-driven selectedListingId prop) while the popover card stayed absent.
    await expect(popoverLocator(page)).toBeVisible({ timeout: 20_000 });
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE);
    await expect(selectedMarkerLocator(page, LISTING_ID)).toHaveCount(1, { timeout: 10_000 });
  });

  test('AC3: browser Back after "View details" navigation restores the popover, not just the highlight', async ({
    page,
  }) => {
    await stubAll(page);
    // Start WITHOUT the listing param — the popover must open from a real click first.
    await page.goto(repoUrl());
    await page.waitForLoadState('networkidle');
    await expect(panelLocator(page)).toBeVisible({ timeout: 15_000 });

    const marker = markerLocator(page, LISTING_ID);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();

    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBe(LISTING_ID);
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });

    // Navigate away via "View details" (real history PUSH to /listing/:id).
    await popoverLocator(page).getByTestId('popover-view-details').click();
    await page.waitForURL(new RegExp(`/listing/${LISTING_ID}`), { timeout: 10_000 });

    await page.goBack();

    // URL restores listing=<uuid> ...
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBe(LISTING_ID);
    // ... AND the popover card itself REOPENS — this is the #1939 regression guard.
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE);
    await expect(selectedMarkerLocator(page, LISTING_ID)).toHaveCount(1, { timeout: 10_000 });
  });

  test('AC4: Forward after Back still restores the popover', async ({ page }) => {
    await stubAll(page);
    await page.goto(repoUrl());
    await page.waitForLoadState('networkidle');
    await expect(panelLocator(page)).toBeVisible({ timeout: 15_000 });

    const marker = markerLocator(page, LISTING_ID);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBe(LISTING_ID);
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });

    await popoverLocator(page).getByTestId('popover-view-details').click();
    await page.waitForURL(new RegExp(`/listing/${LISTING_ID}`), { timeout: 10_000 });

    // Back → popover restores.
    await page.goBack();
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBe(LISTING_ID);
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });

    // Forward → back to /listing/:id ...
    await page.goForward();
    await page.waitForURL(new RegExp(`/listing/${LISTING_ID}`), { timeout: 10_000 });

    // ... Back again → popover must restore a SECOND time, proving this is a durable
    // reactive hydration path, not a one-shot mount-only effect.
    await page.goBack();
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBe(LISTING_ID);
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });
    await expect(selectedMarkerLocator(page, LISTING_ID)).toHaveCount(1, { timeout: 10_000 });
  });

  test('AC6: closing the popover (X) removes listing= from the URL and hides the card', async ({ page }) => {
    await stubAll(page);
    await page.goto(repoUrl(LISTING_ID));
    await page.waitForLoadState('networkidle');
    await expect(popoverLocator(page)).toBeVisible({ timeout: 20_000 });

    await popoverLocator(page).getByTestId('marker-popover-close').click();

    await expect(popoverLocator(page)).toBeHidden({ timeout: 5_000 });
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBeNull();
  });

  test('AC8: unresolvable listing id fails safe — no popover, no crash, page stays usable', async ({ page }) => {
    await stubAll(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(repoUrl(INVALID_LISTING_ID));
    await page.waitForLoadState('networkidle');

    // LEAVE_PARAM_NO_POPOVER never strips the URL param, but no popover renders for it.
    expect(getUrlParam(page, 'listing')).toBe(INVALID_LISTING_ID);
    await expect(popoverLocator(page)).toBeHidden();

    // Page stays otherwise functional: the real listing's own marker still renders,
    // and the panel is present — this is not a broken/blank page.
    await expect(markerLocator(page, LISTING_ID)).toBeVisible({ timeout: 20_000 });
    await expect(panelLocator(page)).toBeVisible();

    // No uncaught JS exception / render crash from resolving the bogus id.
    expect(pageErrors, `Unexpected uncaught page error(s): ${pageErrors.join('\n')}`).toEqual([]);
  });

  test('AC9: unrelated URL state (city/journey/areaKey/groupId) survives a deep-link restore unchanged', async ({
    page,
  }) => {
    await stubAll(page);
    await page.goto(repoUrl(LISTING_ID));
    await page.waitForLoadState('networkidle');
    await expect(popoverLocator(page)).toBeVisible({ timeout: 20_000 });

    expect(getUrlParam(page, 'city')).toBe(CITY);
    expect(getUrlParam(page, 'journey')).toBe('area-first');
    expect(getUrlParam(page, 'areaKey')).toBe(AREA_KEY);
    expect(getUrlParam(page, 'groupId')).toBe(GROUP_ID);
  });

  test('F1: browser Back closes the popover, Forward reopens it (URL↔popover reverse-sync)', async ({
    page,
  }) => {
    await stubAll(page);
    // Start with NO listing selected — the popover must open from a real click.
    await page.goto(repoUrl());
    await page.waitForLoadState('networkidle');
    await expect(panelLocator(page)).toBeVisible({ timeout: 15_000 });
    expect(getUrlParam(page, 'listing')).toBeNull();
    await expect(popoverLocator(page)).toBeHidden();

    const marker = markerLocator(page, LISTING_ID);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();

    // Marker click PUSHES listing=<id> (useDiscoverUrlState.setSelectedListing,
    // { replace: false }) and opens the popover.
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBe(LISTING_ID);
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE);

    // Back: URL loses listing=<id> ...
    await page.goBack();
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBeNull();
    // ... AND the popover MUST CLOSE. This is the F1 crux: pre-fix, there was
    // no URL→UI reverse sync for history navigation, so the popover would
    // stay open (stale) even though the URL no longer names a selected
    // listing. If clearMarkerPopoverFromUrl's Back-triggered wiring regresses,
    // this assertion fails (the card stays visible past its timeout).
    await expect(popoverLocator(page)).toBeHidden({ timeout: 8_000 });

    // Forward: URL regains listing=<id> AND the popover MUST REOPEN.
    await page.goForward();
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBe(LISTING_ID);
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE);
    await expect(selectedMarkerLocator(page, LISTING_ID)).toHaveCount(1, { timeout: 10_000 });
  });

  test('F2: a late-painting marker still restores the popover (bounded rAF readiness retry)', async ({
    page,
  }) => {
    // Delay the listings fixture (the source of currentMapMarkerListings, and
    // therefore of the marker's own DOM node) so the marker is NOT present at
    // the instant hydrateSelectedMarkerFromUrl's gating effect first fires —
    // well under the ~500ms/30-frame retry budget hydrateSelectedMarkerFromUrl
    // (useMarkerSelection.ts) allows, so a correctly-retrying fix has margin.
    await stubAllWithDelayedListings(page, 250);
    await page.goto(repoUrl(LISTING_ID));
    await page.waitForLoadState('networkidle');

    // The marker itself necessarily paints late (same delayed data source).
    await expect(markerLocator(page, LISTING_ID)).toBeVisible({ timeout: 10_000 });

    // Crux: the popover must EVENTUALLY restore, not silently give up because
    // its first DOM lookup raced the marker's late attachment. Playwright's
    // retrying expect(...).toBeVisible() polls rather than sleeping — a
    // marker that paints a few frames late still passes; a marker that NEVER
    // paints (or a hydration path with no retry) fails this assertion when
    // the timeout elapses.
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE);
    await expect(selectedMarkerLocator(page, LISTING_ID)).toHaveCount(1, { timeout: 10_000 });
  });

  test('F3: valid A -> unresolvable B closes A while the URL retains B (no popover for either)', async ({
    page,
  }) => {
    await stubAll(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Start with NO listing selected — open A via a real click (mirrors F1's setup).
    await page.goto(repoUrl());
    await page.waitForLoadState('networkidle');
    await expect(panelLocator(page)).toBeVisible({ timeout: 15_000 });

    const marker = markerLocator(page, LISTING_ID);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBe(LISTING_ID);
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE);

    // Drive an in-app transition straight from A to a DIFFERENT, well-formed
    // but unresolvable id B (the same INVALID_LISTING_ID AC8 uses) — as a
    // navigation FROM an already-open A, not a fresh deep-link. See
    // pushUrlInApp's JSDoc for why this must be a client-side transition.
    await pushUrlInApp(page, repoUrl(INVALID_LISTING_ID));

    // F3 crux: A's popover CLOSES ...
    await expect(popoverLocator(page)).toBeHidden({ timeout: 8_000 });
    // ... AND the URL RETAINS B — LEAVE_PARAM_NO_POPOVER never strips a
    // `listing` param it can't resolve, it just declines to show a card for it.
    expect(getUrlParam(page, 'listing')).toBe(INVALID_LISTING_ID);
    // No popover ever shows for B either (stays unresolvable) — give it a
    // moment to make sure nothing async reopens A's stale content or fakes B.
    await page.waitForTimeout(500);
    await expect(popoverLocator(page)).toBeHidden();

    // Page stays otherwise usable, and no uncaught error reconciling the transition.
    await expect(panelLocator(page)).toBeVisible();
    expect(pageErrors, `Unexpected uncaught page error(s): ${pageErrors.join('\n')}`).toEqual([]);
  });

  test('F3: valid A -> delayed valid B closes A promptly, then opens B once it resolves', async ({
    page,
  }) => {
    await stubAllWithSecondAreaDelayed(page, 300);

    // Deep-link straight to A (Whitefield) — fast (undelayed) path, mirrors AC1.
    await page.goto(repoUrl(LISTING_ID));
    await page.waitForLoadState('networkidle');
    await expect(popoverLocator(page)).toBeVisible({ timeout: 20_000 });
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE);

    // In-app transition to a DIFFERENT area/listing (B, Marathahalli) — this
    // changes useDiscoverCityListings' areaKeys-keyed query key, firing a
    // genuinely new (and, per the stub above, delayed) /listings request for
    // B while A's popover is still live in memory. Not page.goto: see
    // pushUrlInApp's JSDoc — a full reload would trivially "close" A by
    // destroying the page, proving nothing about the reconciliation branch.
    await pushUrlInApp(page, repoUrlForArea(AREA_KEY_B, LISTING_ID_B));

    // F3 crux (part 1): A does NOT remain stale/visible while B is pending —
    // it must close promptly (well before B's 300ms-delayed data arrives),
    // not linger showing the old listing's title.
    await expect(popoverLocator(page)).toBeHidden({ timeout: 2_000 });

    // F3 crux (part 2): B's popover EVENTUALLY opens once its data (and
    // marker DOM) become available — a genuine retrying assertion, so a B
    // that never resolves would fail this on timeout, not pass vacuously.
    await expect(popoverLocator(page)).toBeVisible({ timeout: 10_000 });
    await expect(popoverLocator(page)).toContainText(LISTING_TITLE_B);
    // Confirm it's really B, not a stale re-render of A's content.
    await expect(popoverLocator(page)).not.toContainText(LISTING_TITLE);
    expect(getUrlParam(page, 'listing')).toBe(LISTING_ID_B);
    await expect(selectedMarkerLocator(page, LISTING_ID_B)).toHaveCount(1, { timeout: 10_000 });
  });
});
