/**
 * E2E: Badge reflects the correct context level — Issue #1175 v3
 *
 * Precedence rule: school-radius > area > group > city
 *
 * BCP-1  City browse (no group / area / school)   → badge shows cityTotal
 * BCP-2  Group only (?groupId=coastal-strip)       → badge shows group aggregate (8)
 * BCP-3  Area within group                         → badge shows area count (4)
 * BCP-4  School-radius under area                  → badge shows radius count
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/badge-context-precedence.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ── Constants ──────────────────────────────────────────────────────────────────

const CITY       = 'udupi';
const GROUP_ID   = 'coastal-strip';
const AREA_KEY_A = 'IN|KA|Udupi|Manipal';   // listingCount: 5  ─┐ group total: 8
const AREA_KEY_B = 'IN|KA|Udupi|Karkala';   // listingCount: 3  ─┘
const SCHOOL_ID  = '8a4c7543-0ff7-42e9-9fc9-1f1daf4ada6d';
const SCHOOL_LAT = 13.18911;
const SCHOOL_LON = 75.00151;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey:        AREA_KEY_A,
      name:           'Manipal',
      geoCenterLat:   13.3509,
      geoCenterLon:   74.7932,
      minLat: 13.33, maxLat: 13.38,
      minLon: 74.77, maxLon: 74.82,
      listingCount:   5,
      schoolCount:    6,
    },
    {
      areaKey:        AREA_KEY_B,
      name:           'Karkala',
      geoCenterLat:   13.2051,
      geoCenterLon:   74.9926,
      minLat: 13.17, maxLat: 13.24,
      minLon: 74.96, maxLon: 75.03,
      listingCount:   3,
      schoolCount:    2,
    },
  ],
};

// coastal-strip group: member areas are A (5) + B (3) = 8
const AREA_GROUPS_FIXTURE = {
  groups: [
    {
      slug:        GROUP_ID,
      name:        'Coastal Strip',
      subtitle:    'Manipal, Karkala',
      regionLabel: 'West Coast',
      areaKeys:    [AREA_KEY_A, AREA_KEY_B],
    },
  ],
};

const CITY_LISTINGS_EMPTY = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    { areaKey: AREA_KEY_A, areaName: 'Manipal', listings: [] },
    { areaKey: AREA_KEY_B, areaName: 'Karkala', listings: [] },
  ],
};

// Two listings near the school coords (within 2 km) for BCP-4
const CITY_LISTINGS_NEAR_SCHOOL = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY_A,
      areaName: 'Manipal',
      listings: [
        { id: 'l1', title: 'Near School 1', pricePaise: 500000000, bedrooms: 2, propertyType: 'apartment', listingPurpose: 'sale', lat: 13.19, lon: 75.00 },
        { id: 'l2', title: 'Near School 2', pricePaise: 600000000, bedrooms: 3, propertyType: 'house',     listingPurpose: 'sale', lat: 13.18, lon: 75.01 },
      ],
    },
  ],
};

const SCHOOL_FIXTURE = {
  id:        SCHOOL_ID,
  name:      'Badge Precedence Test School',
  board:     'CBSE',
  boardType: null,
  address:   'Manipal, Udupi',
  latitude:  SCHOOL_LAT,
  longitude: SCHOOL_LON,
  city:      CITY,
  areaKey:   AREA_KEY_A,
  category:  'PRIMARY',
};

// ── Helper ─────────────────────────────────────────────────────────────────────

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubBase(page: Page, listingsFixture = CITY_LISTINGS_EMPTY) {
  await page.route('**/api/trends/options**',          (r) => json(r, 200, { city: CITY, defaultAreas: [] }));
  await page.route('**/api/discover/areas**',          (r) => json(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/area-groups**',    (r) => json(r, 200, AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => json(r, 200, listingsFixture));
  await page.route('**/api/discover/listings**',       (r) => json(r, 200, { content: [], totalElements: 0, totalPages: 0, aggregates: { topLocalities: [] } }));
  await page.route('**/api/discover/markers**',        (r) => json(r, 200, []));
  await page.route('**/api/public/schools/popular**',  (r) => json(r, 200, []));
  await page.route('**/api/public/schools/search**',   (r) => json(r, 200, []));
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (r) => json(r, 200, SCHOOL_FIXTURE));
  await page.route('**/api/public/schools/by-area**',  (r) => json(r, 200, []));
}

// ── BCP-1: City browse — badge shows cityTotal ────────────────────────────────

test('BCP-1: city browse (no group/area/school) → badge shows cityTotal (5+3=8)', async ({ page }) => {
  await stubBase(page);
  await page.goto(`/discover?city=${CITY}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 12_000 });

  // cityTotal = 5 + 3 = 8 from the two mocked areas
  await expect(badge).toContainText('8', { timeout: 8_000 });
});

// ── BCP-2: Group only — badge shows group aggregate ────────────────────────────

test('BCP-2: groupId=coastal-strip (no area/school) → badge shows group aggregate (8)', async ({ page }) => {
  await stubBase(page);
  await page.goto(`/discover?city=${CITY}&groupId=${GROUP_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 12_000 });

  // group aggregate: AREA_KEY_A(5) + AREA_KEY_B(3) = 8
  await expect(badge).toContainText('8', { timeout: 8_000 });
});

// ── BCP-3: Area within group — area count wins over group aggregate ─────────────

test('BCP-3: groupId + areaKey → badge shows area listingCount (5), not group total (8)', async ({ page }) => {
  await stubBase(page);
  const encodedAreaKey = encodeURIComponent(AREA_KEY_A);
  await page.goto(`/discover?city=${CITY}&groupId=${GROUP_ID}&areaKey=${encodedAreaKey}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 12_000 });

  // Area AREA_KEY_A has listingCount=5; group total is 8 — area must win
  await expect(badge).toContainText('5', { timeout: 8_000 });
  const text = await badge.textContent();
  expect(text).not.toMatch(/\b8\b/);
});

// ── BCP-4: School-radius under area — school scope wins over area ──────────────

test('BCP-4: schoolId + radiusKm + areaKey → badge shows school-scoped count, not area count', async ({ page }) => {
  await stubBase(page, CITY_LISTINGS_NEAR_SCHOOL);
  const encodedAreaKey = encodeURIComponent(AREA_KEY_A);
  const url = `/discover?city=${CITY}&journey=school-first&schoolId=${SCHOOL_ID}&radiusKm=2&lat=${SCHOOL_LAT}&lon=${SCHOOL_LON}&zoom=14&areaKey=${encodedAreaKey}`;
  await page.goto(url);

  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState('networkidle');

  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 10_000 });

  // Area has listingCount=5 but school-radius count is 2 — school must win
  const text = await badge.textContent();
  expect(text).not.toMatch(/\b5\b/);
  expect(text).not.toMatch(/\b8\b/);
  await expect(badge).toContainText('2', { timeout: 8_000 });
});
