/**
 * E2E: Anonymous zoom-past-area map guidance — Issue #1156
 *
 * When an ANONYMOUS user zooms the Discover map past the area-overview band
 * (AREA_LAYER_MAX_ZOOM = 12) with NO area selected, the area rings hide and
 * anonymous property pins are gated, leaving the map otherwise blank. The
 * MapEmptyGuidance banner now surfaces a prompt steering the user to either
 * select an area or sign in.
 *
 * AZ-1  anon, zoomed past threshold, no area, cityTotal > 0 → prompt + sign-in link visible
 * AZ-2  anon, zoom back out to <= threshold → prompt gone
 * AZ-3  anon, area selected (deep-link areaKey) → prompt NOT shown
 * AZ-4  authenticated session → prompt NOT shown
 *
 * The initial map zoom is set deterministically via the URL viewport params
 * (lat/lon/zoom) — these are bookmarkable per the #1043/#1047 viewport
 * architecture and avoid driving Leaflet zoom controls for the initial state.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/anon-zoom-past-area-guidance.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ── Constants ──────────────────────────────────────────────────────────────────

const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';
// Area-overview band threshold mirrored from MapDiscovery (AREA_LAYER_MAX_ZOOM = 12).
const AREA_LAYER_MAX_ZOOM = 12;
const PAST_THRESHOLD_ZOOM = 14;
const AREA_CENTER = { lat: 13.3509, lon: 74.7932 };

const PROMPT_RE = /Select an area to see properties/i;

// ── Fixtures ───────────────────────────────────────────────────────────────────

// listingCount > 0 → cityTotal > 0, which the new branch requires.
const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: AREA_CENTER.lat,
      geoCenterLon: AREA_CENTER.lon,
      minLat: 13.33, maxLat: 13.38,
      minLon: 74.77, maxLon: 74.82,
      listingCount: 4,
      schoolCount: 6,
      trendDirection: 'stable',
    },
  ],
};

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

const CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubBaseRoutes(page: Page) {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, CITY_LISTINGS_FIXTURE),
  );
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, { content: [], totalElements: 0 }),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE),
  );
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/discover/markers**', (route) =>
    fulfillJson(route, 200, []),
  );
}

/** Build a /discover URL with the viewport zoom pre-set via lat/lon/zoom params. */
function discoverUrlAtZoom(zoom: number, extra = ''): string {
  return `/discover?city=${CITY}&lat=${AREA_CENTER.lat}&lon=${AREA_CENTER.lon}&zoom=${zoom}${extra}`;
}

/** Read the live map zoom MapDiscovery publishes to window.__debug.mapState.zoom. */
async function readMapZoom(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      (window as unknown as { __debug?: { mapState?: { zoom?: number } } }).__debug?.mapState
        ?.zoom ?? null,
  );
}

// ── AZ-1: anon, zoomed past threshold, no area → prompt shown ──────────────────

test('AZ-1: anon zoomed past area band with no area selected → prompt + sign-in link visible', async ({ page }) => {
  await stubBaseRoutes(page);

  await page.goto(discoverUrlAtZoom(PAST_THRESHOLD_ZOOM));
  await page.waitForLoadState('networkidle');

  // Area-select affordance copy.
  const prompt = page.getByText(PROMPT_RE);
  await expect(prompt).toBeVisible({ timeout: 10_000 });

  // Sign-in link must point at the app's /auth?returnTo contract. Scope the
  // lookup to the guidance prompt to avoid a strict-mode collision with the
  // global header "Sign in" link (href /auth, no returnTo).
  const signIn = prompt.getByRole('link', { name: /sign in/i });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute('href', '/auth?returnTo=/discover');
});

// ── AZ-2: zoom back out to <= threshold → prompt gone ──────────────────────────

test('AZ-2: anon zoom back out to area band → prompt disappears', async ({ page }) => {
  await stubBaseRoutes(page);

  await page.goto(discoverUrlAtZoom(PAST_THRESHOLD_ZOOM));
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(PROMPT_RE)).toBeVisible({ timeout: 10_000 });

  // Zoom out via the Leaflet control until the live map zoom is back inside the
  // area band (<= AREA_LAYER_MAX_ZOOM). The prompt uses strict-greater logic
  // (mapZoom > areaLayerMaxZoom), so it stays visible at exactly the threshold's
  // upper neighbours — we must cross to <= 12 before asserting it is gone. Drive
  // the loop off window.__debug.mapState.zoom rather than a hardcoded click count.
  const zoomOut = page.locator('.leaflet-control-zoom-out');
  await expect(zoomOut).toBeVisible({ timeout: 5_000 });

  await expect
    .poll(
      async () => {
        const zoom = await readMapZoom(page);
        if (zoom != null && zoom > AREA_LAYER_MAX_ZOOM) {
          await zoomOut.click();
        }
        return zoom;
      },
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(AREA_LAYER_MAX_ZOOM);

  await expect(page.getByText(PROMPT_RE)).toBeHidden({ timeout: 10_000 });
});

// ── AZ-3: area selected (deep-link areaKey) → prompt NOT shown ─────────────────

test('AZ-3: anon zoomed past threshold WITH an area selected → prompt NOT shown', async ({ page }) => {
  await stubBaseRoutes(page);
  // Deep-link an area selection so hasAreaSelected is true at past-threshold zoom.
  await page.route('**/api/discover/areas/**/listings**', (route) =>
    fulfillJson(route, 200, { content: [], totalElements: 0 }),
  );

  await page.goto(
    discoverUrlAtZoom(PAST_THRESHOLD_ZOOM, `&areaKey=${encodeURIComponent(AREA_KEY)}`),
  );
  await page.waitForLoadState('networkidle');

  await expect(page.getByText(PROMPT_RE)).toBeHidden({ timeout: 5_000 });
});

// ── AZ-4: authenticated session → prompt NOT shown ─────────────────────────────

test.describe('AZ-4 — authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AZ-4: authenticated user zoomed past threshold → prompt NOT shown', async ({ page }) => {
    await stubBaseRoutes(page);

    await page.goto(discoverUrlAtZoom(PAST_THRESHOLD_ZOOM));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(PROMPT_RE)).toBeHidden({ timeout: 5_000 });
  });
});
