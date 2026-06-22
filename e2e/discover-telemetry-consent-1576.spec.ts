/**
 * discover-telemetry-consent-1576.spec.ts
 *
 * Product-verification spec for issue #1576:
 *   Discover Telemetry Consent UI — DiscoverConsentBanner + DiscoverPrivacyToggle
 *
 * Five focused checks:
 *   AC1 — Banner visible on first visit (undecided state).
 *   AC4/AC5 — Zero telemetry before consent (default-deny through the real UI gate).
 *   AC2 — Accept via banner grants consent, hides banner, and telemetry then fires.
 *   AC6 — No re-prompt after consent is already granted.
 *   AC3/AC5 — Revoke via toggle (from granted) stops further telemetry.
 *
 * Stubbing strategy (backend-free):
 *   All Discover API routes intercepted via page.route() — no live backend required.
 *   /api/discover/events POST is captured and 202-stubbed.
 *   Consent localStorage key: 'discover_telemetry_consent', exact value 'granted'.
 *
 * Run (stub-only — no backend required):
 *   cd /Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-1576-telemetry-consent-ui
 *   PLAYWRIGHT_BASE_URL=http://localhost:5318 npx playwright test e2e/discover-telemetry-consent-1576.spec.ts --project=chromium --reporter=list
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const REGION = 'S';
const MAX_KM = '25';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

const AGRI_LISTING_ID = 'agri-1576-listing-001';

const INGEST_PATH_GLOB = '**/api/discover/events**';
const CONSENT_KEY = 'discover_telemetry_consent';
const CONSENT_GRANTED = 'granted';

// ---------------------------------------------------------------------------
// Fixtures (minimal — adapted from #1531)
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
      title: '[AGRI-1576] 4-Acre Farm, Brahmavar',
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
  title: '[AGRI-1576] 4-Acre Farm, Brahmavar',
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
 * No backend required — every route is stubbed.
 */
async function stubDiscoverAgri(page: Page): Promise<CapturedPost[]> {
  const ingestPosts: CapturedPost[] = [];

  // Capture ingest POSTs — respond 202 so the hook does not retry.
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
  await page.route('**/api/public/listings/*', (r) => fulfillJson(r, 200, AGRI_LISTING_DETAIL));
  await page.route('**/api/bookings**', (r) => fulfillJson(r, 200, {}));

  return ingestPosts;
}

/** Navigate to the agri-locality deep-link. */
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
 * Perform three telemetry-triggering actions:
 *   1. FILTER_APPLY — click Apply in AgriFiltersPanel (if visible)
 *   2. PANEL_OPEN   — ensure DiscoverRightPanel is visible (fires on mount)
 *   3. LEAD_INTENT  — click "Request Viewing" CTA (if visible)
 *
 * Mirrors performThreeActions from #1531 — reused here so AC4/AC5 and AC3 can
 * assert that the gate blocks/unblocks emission correctly.
 */
async function performThreeActions(page: Page): Promise<void> {
  // Action 1: FILTER_APPLY
  const filtersPanel = page.getByTestId('agri-filters-panel');
  const filtersPanelVisible = await filtersPanel.isVisible().catch(() => false);
  if (filtersPanelVisible) {
    const btn = filtersPanel.getByRole('button', { name: /apply/i });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }

  // Action 2: PANEL_OPEN
  const rightPanel = page.getByTestId('discover-right-panel');
  if (!(await rightPanel.isVisible().catch(() => false))) {
    const agriCard = page.locator('[data-testid*="agri-listing"]').first();
    if (await agriCard.isVisible().catch(() => false)) await agriCard.click();
  }
  await page.waitForTimeout(300);

  // Action 3: LEAD_INTENT
  const requestBtn = page.getByRole('button', { name: /request.*viewing|view.*property|contact/i }).first();
  if (await requestBtn.isVisible().catch(() => false)) {
    await requestBtn.click();
    await page.waitForTimeout(300);
    const closeBtn = page.getByRole('button', { name: /close|cancel/i }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }
  }

  // Allow fire-and-forget POSTs to flush
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// AC1 — Banner visible on first visit
// ---------------------------------------------------------------------------

test('AC1 — consent banner is visible on first visit (undecided state)', async ({ page }) => {
  await stubDiscoverAgri(page);
  // Playwright starts each test with a fresh browser context — localStorage is empty.
  await gotoAgriLocality(page);

  // The banner must be present and visible when no consent key exists.
  const banner = page.getByTestId('discover-consent-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });

  // Both CTA buttons must be accessible
  await expect(
    banner.getByRole('button', { name: 'Accept anonymous usage data collection' })
  ).toBeVisible();
  await expect(
    banner.getByRole('button', { name: 'Decline anonymous usage data collection' })
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// AC4/AC5 — Zero telemetry before consent (default-deny end-to-end)
// ---------------------------------------------------------------------------

test('AC4/AC5 — ZERO POST to /api/discover/events when consent is undecided', async ({ page }) => {
  const ingestPosts = await stubDiscoverAgri(page);

  await gotoAgriLocality(page);

  // Defensive: remove key in case any residual value leaked from a prior run.
  await page.evaluate(() => localStorage.removeItem('discover_telemetry_consent'));

  // Wait for the initial PANEL_OPEN fire-and-forget window.
  await page.waitForTimeout(500);

  await performThreeActions(page);

  // Extra settle time for any queued network requests.
  await page.waitForTimeout(1000);

  expect(
    ingestPosts.length,
    `Expected 0 POST to /api/discover/events (default-deny), got ${ingestPosts.length}: ${JSON.stringify(ingestPosts)}`
  ).toBe(0);
});

// ---------------------------------------------------------------------------
// AC2 — Accept via banner grants consent, hides banner, then telemetry fires
// ---------------------------------------------------------------------------

test('AC2 — Accept banner button grants consent, hides banner, and telemetry fires', async ({ page }) => {
  const ingestPosts = await stubDiscoverAgri(page);

  await gotoAgriLocality(page);

  // Banner must be present before interaction.
  const banner = page.getByTestId('discover-consent-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });

  // Click the Accept button (drives the UI — not a direct localStorage write).
  await banner.getByRole('button', { name: 'Accept anonymous usage data collection' }).click();

  // Assert: localStorage consent key is now 'granted'.
  const consentValue = await page.evaluate(
    (key) => localStorage.getItem(key),
    CONSENT_KEY
  );
  expect(consentValue, 'localStorage must be set to "granted" after Accept').toBe(CONSENT_GRANTED);

  // Assert: banner is hidden after acceptance.
  await expect(banner).not.toBeVisible({ timeout: 5_000 });

  // Reload so the telemetry hook initialises with the persisted consent value
  // (mirrors CHECK3 in #1531 — the hook reads consent on mount/session-init).
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);

  await performThreeActions(page);
  await page.waitForTimeout(1000);

  // Assert: at least one POST fired after consent was granted.
  expect(
    ingestPosts.length,
    `Expected ≥1 POST to /api/discover/events after Accept, got 0`
  ).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// AC6 — No re-prompt after consent is already granted
// ---------------------------------------------------------------------------

test('AC6 — consent banner is NOT shown when consent is already granted', async ({ page }) => {
  await stubDiscoverAgri(page);

  // Seed consent before navigation (simulates returning user who already accepted).
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'granted');
  }, CONSENT_KEY);

  await gotoAgriLocality(page);

  // Give the page time to fully render.
  await page.waitForTimeout(1000);

  // Banner must not appear.
  const banner = page.getByTestId('discover-consent-banner');
  await expect(banner).not.toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// AC3/AC5 — Revoke via toggle stops further telemetry
// ---------------------------------------------------------------------------

test('AC3/AC5 — revoking via privacy toggle removes consent and stops further POSTs', async ({ page }) => {
  const ingestPosts = await stubDiscoverAgri(page);

  // Start with consent already granted (seed before page load so telemetry hook
  // initialises in the granted state from the first mount).
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'granted');
  }, CONSENT_KEY);

  await gotoAgriLocality(page);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);

  // Confirm the toggle reflects the granted state before we click it.
  const toggle = page.getByTestId('discover-privacy-toggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await expect(
    toggle.getByRole('button', { name: 'Turn off anonymous usage data collection' })
  ).toBeVisible({ timeout: 5_000 });

  // Revoke via the toggle — this should call localStorage.removeItem(CONSENT_KEY).
  await toggle.getByRole('button', { name: 'Turn off anonymous usage data collection' }).click();
  await page.waitForTimeout(300);

  // Assert: key is no longer in localStorage.
  const consentAfterRevoke = await page.evaluate(
    (key) => localStorage.getItem(key),
    CONSENT_KEY
  );
  expect(
    consentAfterRevoke,
    'localStorage consent key must be removed after revoke'
  ).toBeNull();

  // Toggle should now show the "Off" / re-enable button.
  await expect(
    toggle.getByRole('button', { name: 'Allow anonymous usage data collection' })
  ).toBeVisible({ timeout: 5_000 });

  // Snapshot post count immediately after revoke — any posts before the revoke
  // click are irrelevant to this assertion.
  const postCountAtRevoke = ingestPosts.length;

  // Perform three actions — none should emit because consent is now revoked.
  await performThreeActions(page);
  await page.waitForTimeout(1000);

  const newPostsAfterRevoke = ingestPosts.length - postCountAtRevoke;
  expect(
    newPostsAfterRevoke,
    `Expected 0 new POSTs after revoke, got ${newPostsAfterRevoke}`
  ).toBe(0);
});
