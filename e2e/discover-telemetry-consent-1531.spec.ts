/**
 * discover-telemetry-consent-1531.spec.ts
 *
 * Product-verification spec for issue #1531:
 *   M30 PII-free anonymous discover_event telemetry
 *
 * Three focused checks:
 *   CHECK 1 — no-regression render: Discover/agri page renders with no telemetry console error.
 *             AgriFiltersPanel Apply button, DiscoverRightPanel, RequestViewingModal CTA are present.
 *   CHECK 2 — DEFAULT-DENY: no localStorage consent key → ZERO POSTs to /api/discover/events
 *             across FILTER_APPLY + PANEL_OPEN + LEAD_INTENT actions.
 *   CHECK 3 — CONSENT GRANTED: localStorage 'discover_telemetry_consent'='granted' →
 *             POSTs to /api/discover/events DO fire; payload is PII-free (whitelisted keys only,
 *             price_band coarse label, session_id UUID, no email/phone/name/user_id/ip/user_agent).
 *
 * Stubbing strategy:
 *   All Discover API routes intercepted via page.route() → runs stub-only, no backend required.
 *   /api/discover/events POST is captured with page.route() and allowed through (202 stub).
 *
 * Run (stub only — no backend required):
 *   cd /Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-1531-discover-event
 *   PLAYWRIGHT_BASE_URL=http://localhost:5180 npx playwright test e2e/discover-telemetry-consent-1531.spec.ts --project=chromium --reporter=list
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const REGION = 'S';
const MAX_KM = '25';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

const AGRI_LISTING_ID = 'agri-1531-listing-001';

const INGEST_PATH_GLOB = '**/api/discover/events**';
const PII_FORBIDDEN_KEYS = ['email', 'phone', 'name', 'user_id', 'ip', 'user_agent'];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: 'IN|KA|Udupi|Padubidri', areaLabel: 'Padubidri' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 2,
      listingCount90d: 2,
      schoolCount: 4,
      trendDirection: 'stable',
    },
  ],
};

const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      directionCode: REGION,
      groupName: 'South towards Udupi',
      availableMaxDistances: [
        {
          maxKm: 25,
          distanceLabel: 'Up to 25 km',
          includedBandCodes: ['0_10', '10_25'],
          listingCount: 1,
          areaKeys: ['IN|KA|Udupi|Brahmavar'],
        },
      ],
    },
  ],
};

const AGRI_LISTINGS_FIXTURE = {
  city: CITY,
  truncated: false,
  limit: 250,
  listings: [
    {
      id: AGRI_LISTING_ID,
      areaKey: 'IN|KA|Udupi|Brahmavar',
      latitude: 13.18,
      longitude: 74.76,
      pricePaise: null,
      propertyType: 'agricultural_land',
      title: '[AGRI-1531] 4-Acre Farm, Brahmavar',
      locality: 'Brahmavar',
      landArea: 4.0,
      landAreaUnit: 'acres',
      computedAreaAcres: 3.97,
      boundaryGeoJson: null,
      listingPurpose: 'sale',
      landCategory: 'FARMLAND',
      farmhouseAvailable: false,
      fencingDone: true,
      waterSource: 'BOREWELL',
      roadAccess: 'TARRED_ROAD',
      soilType: 'RED_LATERITE',
      cultivationStatus: 'CULTIVATED',
      ownershipType: 'FREEHOLD',
      updatedAt: '2026-06-10T08:00:00Z',
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

const AGRI_LISTING_DETAIL = {
  id: AGRI_LISTING_ID,
  title: '[AGRI-1531] 4-Acre Farm, Brahmavar',
  status: 'LIVE',
  propertyType: 'agricultural_land',
  listingPurpose: 'sale',
  locality: 'Brahmavar',
  areaKey: 'IN|KA|Udupi|Brahmavar',
  pricePaise: null,
  landArea: 4.0,
  landAreaUnit: 'acres',
  heroImageUrl: null,
  images: [],
  agentName: null,
  agentPhone: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Captured ingest POST request body from page.route interception. */
interface CapturedPost {
  url: string;
  body: unknown;
}

/**
 * Wire stubs for the agri-locality Discover journey.
 * Returns a mutable array that accumulates all POSTs to /api/discover/events.
 */
async function stubDiscoverAgri(page: Page): Promise<CapturedPost[]> {
  const ingestPosts: CapturedPost[] = [];

  // Capture ingest POSTs — respond with 202 so the hook doesn't retry.
  await page.route(INGEST_PATH_GLOB, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      let body: unknown = null;
      try {
        body = JSON.parse(req.postData() ?? '{}');
      } catch {
        body = req.postData();
      }
      ingestPosts.push({ url: req.url(), body });
      await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
    } else {
      await route.continue();
    }
  });

  // Discover API stubs
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/regional-area-groups**', (r) =>
    fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, AGRI_LISTINGS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, { city: CITY, limitPerArea: 50, areas: [] }));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/listings/*', (r) =>
    fulfillJson(r, 200, AGRI_LISTING_DETAIL));
  await page.route('**/api/bookings**', (r) => fulfillJson(r, 200, {}));

  return ingestPosts;
}

/** Navigate to agri-locality deep-link. */
async function gotoAgriLocality(page: Page): Promise<void> {
  const params = new URLSearchParams({
    city: CITY,
    journey: 'agri-first',
    region: REGION,
    maxKm: MAX_KM,
    locality: 'Brahmavar',
  });
  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Perform the three telemetry-triggering actions:
 *   1. FILTER_APPLY — click Apply in AgriFiltersPanel
 *   2. PANEL_OPEN   — open DiscoverRightPanel by clicking an agri listing card
 *   3. LEAD_INTENT  — open RequestViewingModal via the CTA
 * All fire-and-forget; function awaits UI state only.
 */
async function performThreeActions(page: Page): Promise<void> {
  // Action 1: FILTER_APPLY — find and click the agri filters Apply button
  const applyBtn = page.getByTestId('agri-filters-panel').getByRole('button', { name: /apply/i });
  const filtersPanel = page.getByTestId('agri-filters-panel');

  // Filters panel may be in the right panel or the locality panel — find it where it is
  const filtersPanelVisible = await filtersPanel.isVisible().catch(() => false);
  if (filtersPanelVisible) {
    const btn = filtersPanel.getByRole('button', { name: /apply/i });
    const btnVisible = await btn.isVisible().catch(() => false);
    if (btnVisible) {
      await btn.click();
      await page.waitForTimeout(300); // fire-and-forget: brief settle
    }
  }

  // Action 2: PANEL_OPEN — DiscoverRightPanel emitPanelOpen fires on mount/visibility.
  // The right panel should already be visible at the agri-locality deep-link.
  const rightPanel = page.getByTestId('discover-right-panel');
  const rightPanelVisible = await rightPanel.isVisible().catch(() => false);
  if (!rightPanelVisible) {
    // Click first agri listing card if visible
    const agriCard = page.locator('[data-testid*="agri-listing"]').first();
    const agriCardVisible = await agriCard.isVisible().catch(() => false);
    if (agriCardVisible) await agriCard.click();
  }
  await page.waitForTimeout(300);

  // Action 3: LEAD_INTENT — open RequestViewingModal
  // Look for "Request Viewing" button inside the right panel or listing detail
  const requestBtn = page.getByRole('button', { name: /request.*viewing|view.*property|contact/i }).first();
  const requestBtnVisible = await requestBtn.isVisible().catch(() => false);
  if (requestBtnVisible) {
    await requestBtn.click();
    await page.waitForTimeout(300);
    // Close the modal so it doesn't block subsequent actions
    const closeBtn = page.getByRole('button', { name: /close|cancel/i }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }
  }

  // Allow fire-and-forget POSTs to flush (they are microtask-queued)
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// CHECK 1 — No-regression render
// ---------------------------------------------------------------------------

test('CHECK1 — Discover agri page renders with no telemetry console error', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Capture only errors related to telemetry wiring
      if (/telemetry|discoverTelemetry|useDiscoverTelemetry|consent/i.test(text)) {
        consoleErrors.push(text);
      }
    }
  });

  await stubDiscoverAgri(page);
  await gotoAgriLocality(page);

  // Verify the page renders: Discover UI is visible (map + right panel present)
  await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

  // The agri-locality deep-link lands in AgriGroupLocalityPanel with listing cards.
  // Confirm the discover right panel is present (PANEL_OPEN telemetry touchpoint).
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

  // Agri heading is rendered (stub data is shown — heading "Agricultural land" appears)
  await expect(page.getByRole('heading', { name: 'Agricultural land' })).toBeVisible({ timeout: 10_000 });

  // No crash / error boundary shown
  await expect(page.locator('body')).not.toContainText('Something went wrong');

  // No telemetry console errors
  expect(consoleErrors, `Telemetry console errors: ${consoleErrors.join('; ')}`).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// CHECK 2 — DEFAULT-DENY: no consent key → ZERO ingest POSTs
// ---------------------------------------------------------------------------

test('CHECK2 — DEFAULT-DENY: no consent in localStorage → ZERO POST to /api/discover/events', async ({ page }) => {
  const ingestPosts = await stubDiscoverAgri(page);

  // Navigate (no localStorage modifications — consent key absent by default in fresh browser context)
  await gotoAgriLocality(page);

  // Confirm no consent key is set (defensive — Playwright starts with a clean context)
  await page.evaluate(() => localStorage.removeItem('discover_telemetry_consent'));

  // Wait for initial PANEL_OPEN fire-and-forget window
  await page.waitForTimeout(500);

  // Perform all three actions
  await performThreeActions(page);

  // Allow extra settle time for any queued network requests
  await page.waitForTimeout(1000);

  // ASSERT: zero ingest POSTs
  expect(
    ingestPosts.length,
    `Expected 0 POST to /api/discover/events (DEFAULT-DENY), got ${ingestPosts.length}: ${JSON.stringify(ingestPosts)}`
  ).toBe(0);
});

// ---------------------------------------------------------------------------
// CHECK 3 — CONSENT GRANTED: consent set → POSTs fire + payload is PII-free
// ---------------------------------------------------------------------------

test('CHECK3 — CONSENT GRANTED: posts fire and payload is PII-free', async ({ page }) => {
  const ingestPosts = await stubDiscoverAgri(page);

  // Navigate first (so app JS loads), then set consent before actions
  await gotoAgriLocality(page);
  await page.waitForLoadState('domcontentloaded');

  // Set consent
  await page.evaluate(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });

  // Reload so the hook picks up the new consent state from sessionStorage reset
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Wait for initial PANEL_OPEN fire-and-forget window (hook fires on mount)
  await page.waitForTimeout(800);

  // Perform all three actions
  await performThreeActions(page);

  // Allow fire-and-forget POSTs to flush
  await page.waitForTimeout(1000);

  // ASSERT: at least one POST fired
  expect(
    ingestPosts.length,
    `Expected ≥1 POST to /api/discover/events (CONSENT GRANTED), got 0`
  ).toBeGreaterThan(0);

  // ASSERT: payload is PII-free
  for (const post of ingestPosts) {
    const body = post.body as { events?: unknown[] };
    expect(body, 'POST body must have "events" array').toHaveProperty('events');

    const events = body.events as Record<string, unknown>[];
    expect(events.length, 'events array must be non-empty').toBeGreaterThan(0);

    for (const event of events) {
      // PII-forbidden keys must not appear
      for (const forbiddenKey of PII_FORBIDDEN_KEYS) {
        expect(
          Object.prototype.hasOwnProperty.call(event, forbiddenKey),
          `PII key "${forbiddenKey}" found in event: ${JSON.stringify(event)}`
        ).toBe(false);
      }

      // Whitelisted top-level keys only
      const ALLOWED_TOP_KEYS = new Set([
        'session_id', 'event_type', 'area_key', 'property_type',
        'listing_purpose', 'price_band', 'filters',
      ]);
      for (const key of Object.keys(event)) {
        expect(
          ALLOWED_TOP_KEYS.has(key),
          `Non-whitelisted key "${key}" found in event: ${JSON.stringify(event)}`
        ).toBe(true);
      }

      // session_id must be a UUID
      if (event.session_id !== undefined) {
        expect(
          typeof event.session_id === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.session_id as string),
          `session_id must be a UUID, got: ${event.session_id}`
        ).toBe(true);
      }

      // price_band must be a coarse label, never a raw number
      if (event.price_band !== undefined) {
        const VALID_BANDS = new Set([
          'UNDER_5L', '5L_20L', '20L_50L', '50L_1CR', '1CR_2CR', 'ABOVE_2CR', 'UNSPECIFIED',
        ]);
        expect(
          VALID_BANDS.has(event.price_band as string),
          `price_band must be a coarse label, got: ${event.price_band}`
        ).toBe(true);
      }

      // event_type must be one of the three allowed values
      expect(
        ['FILTER_APPLY', 'PANEL_OPEN', 'LEAD_INTENT'].includes(event.event_type as string),
        `event_type must be FILTER_APPLY|PANEL_OPEN|LEAD_INTENT, got: ${event.event_type}`
      ).toBe(true);

      // filters sub-object: only whitelisted keys
      if (event.filters !== undefined) {
        const ALLOWED_FILTER_KEYS = new Set([
          'area_key', 'property_type', 'listing_purpose', 'price_band', 'sort_by', 'page',
        ]);
        const filters = event.filters as Record<string, unknown>;
        for (const fk of Object.keys(filters)) {
          expect(
            ALLOWED_FILTER_KEYS.has(fk),
            `Non-whitelisted filter key "${fk}" in event.filters: ${JSON.stringify(filters)}`
          ).toBe(true);
        }
      }
    }
  }
});
