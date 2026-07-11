/**
 * E2E: Active-context chips + trustworthy result-count badge — Issue #1817
 *
 * Covers the three APPROVED cross-layer flows (AC3, AC8, AC9, AC10):
 *
 *   CHIP-1  Cold-load filtered URL (area selected + type filter)
 *           → chip renders + badge shows the "M of N match your filters in
 *             {area}" form on first paint (AC3/AC4).
 *   CHIP-2  Cold-load filtered URL, NO area selected (group only)
 *           → chip renders + badge falls back to the honest no-number
 *             "Filtered results" copy — no fabricated count (AC3/AC6).
 *   CHIP-3  Clicking a chip's ✕ removes only that URL param, preserves
 *           scope (groupId/areaKey) + map camera (lat/lon/zoom), and the
 *           badge/results refetch to the unfiltered count (AC9).
 *   CHIP-4  "Start over" from a substantial-state area selection: confirm
 *           popover appears, confirming resets to the bare city URL,
 *           preserving city + Buy/Rent intent (AC8).
 *   CHIP-5  (AC10, optional) ≥6 active filters cold-loaded → chips beyond
 *           the visible cap collapse into a "+N" overflow popover whose
 *           hidden chips are reachable.
 *
 * Precedent: e2e/discover/badge-context-precedence.spec.ts (same fixture
 * shape: city=udupi, groupId=coastal-strip, AREA_KEY_A="IN|KA|Udupi|Manipal"
 * with listingCount=5). This spec reuses that scope but adds a query-aware
 * listings route so property-type/bedroom filters return a genuinely
 * filtered subset (mirrors useDiscoverCityListings, which forwards
 * `propertyType`/`bedrooms` to `/api/discover/cities/{city}/listings`).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/active-context-chips-and-badge.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ── Constants ──────────────────────────────────────────────────────────────────

const CITY = 'udupi';
const GROUP_ID = 'coastal-strip';
const AREA_KEY_A = 'IN|KA|Udupi|Manipal';   // listingCount: 5
const AREA_KEY_B = 'IN|KA|Udupi|Karkala';   // listingCount: 3
const ENCODED_AREA_KEY_A = encodeURIComponent(AREA_KEY_A);

// ── Fixtures ───────────────────────────────────────────────────────────────────

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY_A,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33, maxLat: 13.38,
      minLon: 74.77, maxLon: 74.82,
      listingCount: 5,
      schoolCount: 6,
    },
    {
      areaKey: AREA_KEY_B,
      name: 'Karkala',
      geoCenterLat: 13.2051,
      geoCenterLon: 74.9926,
      minLat: 13.17, maxLat: 13.24,
      minLon: 74.96, maxLon: 75.03,
      listingCount: 3,
      schoolCount: 2,
    },
  ],
};

const AREA_GROUPS_FIXTURE = {
  groups: [
    {
      slug: GROUP_ID,
      name: 'Coastal Strip',
      subtitle: 'Manipal, Karkala',
      regionLabel: 'West Coast',
      areaKeys: [AREA_KEY_A, AREA_KEY_B],
    },
  ],
};

// Full, unfiltered listing set for AREA_KEY_A (5 total: 3 apartment, 2 house).
// The listings route below filters this in-memory by the request's query
// params (propertyType/bedrooms), mirroring useDiscoverCityListings's
// server-forwarded filter contract — so cold-loading with `type=apartment`
// genuinely returns 3, not a static/misleading fixture.
const AREA_A_LISTINGS_ALL = [
  { id: 'a1', title: 'Apt A1', pricePaise: 500000000, bedrooms: 2, propertyType: 'apartment', listingPurpose: 'sale', lat: 13.351, lon: 74.793 },
  { id: 'a2', title: 'Apt A2', pricePaise: 520000000, bedrooms: 2, propertyType: 'apartment', listingPurpose: 'sale', lat: 13.352, lon: 74.794 },
  { id: 'a3', title: 'Apt A3', pricePaise: 610000000, bedrooms: 3, propertyType: 'apartment', listingPurpose: 'sale', lat: 13.353, lon: 74.795 },
  { id: 'h1', title: 'House H1', pricePaise: 900000000, bedrooms: 4, propertyType: 'house', listingPurpose: 'sale', lat: 13.354, lon: 74.796 },
  { id: 'h2', title: 'House H2', pricePaise: 950000000, bedrooms: 4, propertyType: 'house', listingPurpose: 'sale', lat: 13.355, lon: 74.797 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Filters AREA_A_LISTINGS_ALL by the request's propertyType/bedrooms query params. */
function filterAreaAListings(requestUrl: string) {
  const url = new URL(requestUrl);
  const propertyType = url.searchParams.get('propertyType');
  const bedrooms = url.searchParams.get('bedrooms');
  return AREA_A_LISTINGS_ALL.filter((l) => {
    if (propertyType && l.propertyType.toLowerCase() !== propertyType.toLowerCase()) return false;
    if (bedrooms && String(l.bedrooms) !== bedrooms) return false;
    return true;
  });
}

async function stubBase(page: Page) {
  await page.route('**/api/trends/options**', (r) => json(r, 200, { city: CITY, defaultAreas: [] }));
  await page.route('**/api/discover/areas**', (r) => json(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/area-groups**', (r) => json(r, 200, AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => {
    const listings = filterAreaAListings(r.request().url());
    return json(r, 200, {
      city: CITY,
      limitPerArea: 50,
      areas: [
        { areaKey: AREA_KEY_A, areaName: 'Manipal', listings },
        { areaKey: AREA_KEY_B, areaName: 'Karkala', listings: [] },
      ],
    });
  });
  await page.route('**/api/discover/listings**', (r) =>
    json(r, 200, { content: [], totalElements: 0, totalPages: 0, aggregates: { topLocalities: [] } }),
  );
  await page.route('**/api/discover/markers**', (r) => json(r, 200, []));
  await page.route('**/api/public/schools/popular**', (r) => json(r, 200, []));
  await page.route('**/api/public/schools/search**', (r) => json(r, 200, []));
  await page.route('**/api/public/schools/by-area**', (r) => json(r, 200, []));
}

async function gotoAndWaitForPanel(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
}

// ── CHIP-1: Cold-load area-selected + type filter → chip + "M of N" badge ──────

test('CHIP-1: cold-load area-selected with type=apartment → chip renders + badge shows 3 of 5 on first paint', async ({ page }) => {
  await stubBase(page);

  const url = `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}&areaKey=${ENCODED_AREA_KEY_A}&type=apartment`;
  await gotoAndWaitForPanel(page, url);

  // Chip renders on first paint (AC3) with the humanized label.
  const typeChip = page.getByTestId('chip-type');
  await expect(typeChip).toBeVisible({ timeout: 10_000 });
  await expect(typeChip).toContainText('Apartment');

  // Badge reflects the filtered state — 3 (apartment-only) of 5 (area total),
  // NOT a fabricated or unfiltered number (AC4).
  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 12_000 });
  await expect(badge).toContainText(/3\s+of\s+5\s+match\s+your\s+filters\s+in\s+Manipal/, { timeout: 8_000 });
});

// ── CHIP-2: Cold-load group-only (no area) + filter → honest no-number fallback ─

test('CHIP-2: cold-load group-only with type=apartment (no area selected) → chip renders + badge falls back to "Filtered results"', async ({ page }) => {
  await stubBase(page);

  // groupId only, no areaKey — the group scope has no filter-aware count backing it,
  // so the badge must NOT invent a number (AC6): honest "Filtered results" fallback.
  const url = `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}&type=apartment`;
  await gotoAndWaitForPanel(page, url);

  const typeChip = page.getByTestId('chip-type');
  await expect(typeChip).toBeVisible({ timeout: 10_000 });
  await expect(typeChip).toContainText('Apartment');

  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId('discover-badge-stale')).toBeVisible({ timeout: 8_000 });
  await expect(badge).toContainText('Filtered results');

  // Never a fabricated digit alongside the honest fallback copy.
  const badgeText = await badge.textContent();
  expect(badgeText).not.toMatch(/\d/);
});

// ── CHIP-3: Chip clear → URL param dropped, scope + camera preserved, refetch ──

test('CHIP-3: clicking the type chip\'s remove control drops only "type", preserves groupId/areaKey/viewport, and refetches to the unfiltered count', async ({ page }) => {
  await stubBase(page);

  const url =
    `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}&areaKey=${ENCODED_AREA_KEY_A}` +
    `&type=apartment&lat=13.35090&lon=74.79320&zoom=14`;
  await gotoAndWaitForPanel(page, url);

  const typeChip = page.getByTestId('chip-type');
  await expect(typeChip).toBeVisible({ timeout: 10_000 });

  const badge = page.getByTestId('discover-badge');
  await expect(badge).toContainText(/3\s+of\s+5\s+match\s+your\s+filters\s+in\s+Manipal/, { timeout: 12_000 });

  // Chip has no dedicated dismiss testid (only booleans/search/board/category do) —
  // remove via its accessible "Remove {label}" control, mirroring how a keyboard/
  // screen-reader user would activate it.
  await page.getByRole('button', { name: 'Remove Apartment' }).click();

  // "type" is dropped from the URL; scope (groupId/areaKey/city) and the map camera
  // (lat/lon/zoom) are untouched — the chip-clear callback only ever touches filters,
  // never viewport (AC9: camera must not jump).
  await expect(page).not.toHaveURL(/[?&]type=/, { timeout: 8_000 });
  await expect(page).toHaveURL(new RegExp(`groupId=${GROUP_ID}`));
  await expect(page).toHaveURL(/areaKey=IN%7CKA%7CUdupi%7CManipal/);
  await expect(page).toHaveURL(/lat=13\.3509/);
  await expect(page).toHaveURL(/lon=74\.7932/);
  await expect(page).toHaveURL(/zoom=14/);

  // The chip is gone and the results/badge refetch to the unfiltered area total (5).
  await expect(typeChip).toHaveCount(0);
  await expect(badge).toContainText(/5\s+verified\s+properties\s+in\s+Manipal/, { timeout: 8_000 });
});

// ── CHIP-4: Start over → confirm popover → bare city URL, city+intent preserved ─

test('CHIP-4: Start over from a filtered area selection shows the confirm popover, then resets to the bare city URL preserving city + rent intent', async ({ page }) => {
  await stubBase(page);

  const url = `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}&areaKey=${ENCODED_AREA_KEY_A}&type=apartment&intent=rent`;
  await gotoAndWaitForPanel(page, url);

  await expect(page.getByTestId('chip-type')).toBeVisible({ timeout: 10_000 });

  const startOverButton = page.getByTestId('start-over-button');
  await expect(startOverButton).toBeVisible({ timeout: 10_000 });
  await startOverButton.click();

  // Substantial state (area selected + active filter) gates a confirm popover
  // rather than resetting immediately (design §8 / AC8).
  const confirmPopover = page.getByTestId('start-over-confirm-popover');
  await expect(confirmPopover).toBeVisible({ timeout: 5_000 });

  await page.getByTestId('start-over-confirm').click();

  // Clean slate: bare /discover with only city (+ intent=rent, since it is
  // non-default and explicitly preserved). groupId/areaKey/type/filters are gone.
  await expect(page).toHaveURL(new RegExp(`city=${CITY}`), { timeout: 8_000 });
  await expect(page).toHaveURL(/intent=rent/);
  await expect(page).not.toHaveURL(/groupId=/);
  await expect(page).not.toHaveURL(/areaKey=/);
  await expect(page).not.toHaveURL(/journey=/);
  await expect(page).not.toHaveURL(/[?&]type=/);

  await expect(page.getByTestId('chip-type')).toHaveCount(0);
});

// ── CHIP-5 (AC10, optional): ≥6 filters cold-loaded → "+N" overflow popover ─────

test('CHIP-5: cold-load with 6 active filters collapses the overflow into a "+2" popover whose hidden chips are reachable', async ({ page }) => {
  await stubBase(page);

  // 4 boolean chips (bom/ntm/rera/rtm) + type + bhk = 6 chips; MAX_VISIBLE_FILTER_CHIPS=4
  // (booleans render first per design §5), so type + bhk overflow → "+2".
  const url =
    `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}&areaKey=${ENCODED_AREA_KEY_A}` +
    `&bom=1&ntm=1&rera=1&rtm=1&type=apartment&beds=2`;
  await gotoAndWaitForPanel(page, url);

  await expect(page.getByTestId('active-context-chips')).toBeVisible({ timeout: 10_000 });

  const overflowTrigger = page.getByTestId('active-chips-overflow-trigger');
  await expect(overflowTrigger).toBeVisible({ timeout: 10_000 });
  await expect(overflowTrigger).toContainText('+2');

  // The 4 visible chips are the booleans; type/bhk are inside the overflow popover.
  await expect(page.getByTestId('chip-bool-bom')).toBeVisible();
  await expect(page.getByTestId('chip-bool-ntm')).toBeVisible();
  await expect(page.getByTestId('chip-bool-rera')).toBeVisible();
  await expect(page.getByTestId('chip-bool-rtm')).toBeVisible();
  await expect(page.getByTestId('chip-type')).toHaveCount(0);

  await overflowTrigger.click();
  const overflowPopover = page.getByTestId('active-chips-overflow-popover');
  await expect(overflowPopover).toBeVisible({ timeout: 5_000 });
  await expect(overflowPopover.getByText('Apartment')).toBeVisible();
  await expect(overflowPopover.getByText('2 BHK')).toBeVisible();
});
