/**
 * Discover real-data smoke — Issue #1264.
 *
 * Validates 4 cross-layer journeys against the LIVE backend (no page.route() mocks).
 * Seed data from scripts/seed-discover-listings.mjs must be present before running:
 *   12 LIVE [E2E] listings across Manipal / Malpe / Kaup (4 each).
 *
 * Journeys:
 *   J1  area-first anon       — click area marker → listing cards appear, no 401/403
 *   J2  school-radius anon    — school URL params → school-radius endpoint fires, cards appear
 *   J3  school-first auth     — authenticated school-radius → cards OR property markers appear
 *   J4  keyword contextual    — q=apartment filters results; clearing q restores them
 *
 * Run locally (full project, no stubs):
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-real-data-smoke.spec.ts
 *
 * Prerequisites:
 *   - PLAYWRIGHT_BASE_URL pointing at a running frontend
 *   - Seed data present (run scripts/seed-discover-listings.mjs first)
 *   - PLAYWRIGHT_BROKER_EMAIL + PLAYWRIGHT_BROKER_PASSWORD set for J3 (else J3 skips)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';

// ---------------------------------------------------------------------------
// School data fetched once for J2 + J3
// ---------------------------------------------------------------------------

interface SchoolData {
  schoolId: string | null;
  schoolLat: number | null;
  schoolLon: number | null;
}

let schoolData: SchoolData = { schoolId: null, schoolLat: null, schoolLon: null };

// ---------------------------------------------------------------------------
// J2/J3 school pre-fetch (beforeAll — runs once for the describe block)
// ---------------------------------------------------------------------------

test.describe('Discover real-data smoke', () => {
  // Run tests serially within this block to avoid auth fixture contention under parallel workers.
  // Root cause: J3 (broker auth) and N2 (admin auth) race on shared storageState under 2-worker execution.
  // Serial mode here ensures each auth context settles before the next test begins.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    try {
      const url =
        `${BACKEND}/api/public/schools/by-area` +
        `?areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}&page=0&size=1`;
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`[discover-real-data-smoke] school prefetch returned ${res.status} — J2/J3 will skip`);
        return;
      }
      // Response shape: bare array [{ id, name, latitude, longitude, ... }, ...]
      const data = await res.json() as Array<{ id: string; latitude: number; longitude: number }>;
      const first = data?.[0];
      if (first?.id && first.latitude != null && first.longitude != null) {
        schoolData = {
          schoolId: first.id,
          schoolLat: first.latitude,
          schoolLon: first.longitude,
        };
        console.log(`[discover-real-data-smoke] School prefetch OK: id=${first.id} lat=${first.latitude} lon=${first.longitude}`);
      } else {
        console.log('[discover-real-data-smoke] School prefetch: no schools found near Manipal — J2/J3 will skip');
      }
    } catch (err) {
      console.log(`[discover-real-data-smoke] School prefetch threw: ${String(err)} — J2/J3 will skip`);
    }
  });

  // -------------------------------------------------------------------------
  // J1 — area-first anon
  // -------------------------------------------------------------------------

  test('J1 — area-first anon: click area marker loads listing cards without auth errors', async ({ page }) => {
    // Collect any 401/403 responses during the journey
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    await page.goto('/discover?city=udupi');

    // Wait for area markers — Leaflet divIcon class applied by the area-layer
    await page.waitForSelector('.leaflet-marker-icon.area-marker', { timeout: 15_000 });

    // Click the Manipal area marker (has 4 seeded [E2E] listings)
    await page.locator('.leaflet-marker-icon.area-marker', { hasText: 'Manipal' }).click({ force: true });

    // Wait for listing cards to appear in the right panel
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const cardCount = await page.locator('[data-testid="listing-card"]').count();
    expect(cardCount, 'J1: at least 1 listing card expected after clicking area marker').toBeGreaterThanOrEqual(1);

    // No auth errors — anon path must use public endpoints only
    expect(authErrors, 'J1: unexpected 401/403 responses on anon journey').toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // J2 — school-radius anon
  // -------------------------------------------------------------------------

  test('J2 — school-radius anon: school URL params trigger school-radius endpoint and render cards', async ({ page }) => {
    test.skip(schoolData.schoolId === null, 'No school data near Manipal — J2 skipped');

    const { schoolId } = schoolData;

    // Collect auth errors
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    // Set up a promise that resolves when the school-radius endpoint is called
    const schoolRadiusResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/school-radius-listings'),
      { timeout: 20_000 },
    );

    await page.goto(`/discover?city=udupi&schoolId=${encodeURIComponent(schoolId!)}&radiusKm=2`);

    // Wait for either a listing card or the right panel to become stable
    await page.waitForSelector('[data-testid="discover-right-panel"]', { timeout: 15_000 });

    // Wait for the school-radius endpoint to be called
    await schoolRadiusResponsePromise;

    // Wait for listing cards
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const cardCount = await page.locator('[data-testid="listing-card"]').count();
    expect(cardCount, 'J2: at least 1 listing card expected from school-radius endpoint').toBeGreaterThanOrEqual(1);

    // No auth errors — anon path must use public endpoints only
    expect(authErrors, 'J2: unexpected 401/403 responses on anon school-radius journey').toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // J3 — school-first auth
  // -------------------------------------------------------------------------

  test.describe('J3 — school-first auth', () => {
    const brokerEmail = process.env.PLAYWRIGHT_BROKER_EMAIL ?? process.env.BROKER_EMAIL ?? '';
    const brokerPassword = process.env.PLAYWRIGHT_BROKER_PASSWORD ?? process.env.BROKER_PASSWORD ?? '';
    const hasBrokerCreds = Boolean(brokerEmail && brokerPassword);

    // Use broker storageState if the fixture exists (written by global-setup.ts)
    const brokerAuthPath = path.join(__dirname, 'fixtures', 'broker-auth.json');
    const brokerAuthExists = fs.existsSync(brokerAuthPath);

    // Check if the fixture file has REAL content (global-setup may write empty state when creds absent)
    let brokerAuthHasContent = false;
    if (brokerAuthExists) {
      try {
        const fixtureContent = JSON.parse(fs.readFileSync(brokerAuthPath, 'utf-8')) as {
          cookies?: Array<unknown>;
        };
        brokerAuthHasContent = Array.isArray(fixtureContent.cookies) && fixtureContent.cookies.length > 0;
      } catch {
        brokerAuthHasContent = false;
      }
    }

    // Apply storageState only when the file exists AND has real content
    // (global-setup writes empty { cookies: [], origins: [] } when creds absent)
    test.use({
      storageState: brokerAuthHasContent ? brokerAuthPath : undefined,
    });

    test('J3 — authenticated school-radius: listing cards or property markers appear', async ({ page }) => {
      test.skip(!hasBrokerCreds, 'PLAYWRIGHT_BROKER_EMAIL / PLAYWRIGHT_BROKER_PASSWORD not set — J3 skipped');
      test.skip(schoolData.schoolId === null, 'No school data near Manipal — J3 skipped');

      const { schoolId } = schoolData;

      // If storageState didn't have real credentials, perform login
      if (!brokerAuthHasContent) {
        await page.goto('/auth');
        await page.waitForLoadState('domcontentloaded');
        await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
        await page.locator('#signin-email').fill(brokerEmail);
        await page.locator('#signin-password').fill(brokerPassword);
        await page
          .locator('button[type="submit"]')
          .filter({ hasText: /sign in/i })
          .first()
          .click();
        await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 15_000 });
      }

      await page.goto(`/discover?city=udupi&schoolId=${encodeURIComponent(schoolId!)}&radiusKm=2`);

      // Wait for the right panel
      await page.waitForSelector('[data-testid="discover-right-panel"]', { timeout: 20_000 });

      // School-radius listing cards render asynchronously after API response.
      // Without this timeout, cards are not yet DOM-attached and count as 0.
      await page.waitForTimeout(1000);

      // Authenticated school-radius path uses same public school-radius endpoint as anon path.
      // May show listing cards OR property markers/clusters.
      const cardCount = await page.locator('[data-testid="listing-card"]').count();
      const markerCount = await page.locator('[data-testid="property-marker"]').count();
      const clusterCount = await page.locator('.custom-marker-cluster').count();

      expect(
        cardCount + markerCount + clusterCount,
        'J3: at least 1 listing card OR property marker/cluster expected for authenticated school-radius journey',
      ).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // J4 — keyword contextual search
  // -------------------------------------------------------------------------

  test('J4 — keyword search: q=apartment filters results; clearing q restores them', async ({ page }) => {
    // Collect auth errors
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    // Step 1: Navigate to Manipal area without keyword filter
    await page.goto(`/discover?city=udupi&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}`);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const baselineCount = await page.locator('[data-testid="listing-card"]').count();
    test.skip(baselineCount < 2, 'J4: Seed not present or stale — requires >= 2 Manipal listings; run scripts/seed-discover-listings.mjs first');

    // Step 2: Apply keyword filter (seed has 2 apartment listings in Manipal)
    await page.goto(
      `/discover?city=udupi&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}&q=apartment`,
    );

    // Wait for the network to settle after q param fires a new API call
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    // Allow a brief network-idle period for the filtered results to stabilise
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
      // Non-fatal: long-polling connections may prevent networkidle; proceed anyway
    });

    const filteredCount = await page.locator('[data-testid="listing-card"]').count();
    expect(filteredCount, 'J4: filtered results must include at least 1 apartment listing').toBeGreaterThanOrEqual(1);
    expect(
      filteredCount,
      'J4: filtering must not inflate result count beyond baseline',
    ).toBeLessThanOrEqual(baselineCount);

    // Step 3: Clear the keyword filter — navigate back without q param
    await page.goto(`/discover?city=udupi&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}`);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const restoredCount = await page.locator('[data-testid="listing-card"]').count();
    expect(
      restoredCount,
      'J4: restoring (no q) must show at least as many cards as the filtered set',
    ).toBeGreaterThanOrEqual(filteredCount);

    // No auth errors across the entire keyword journey
    expect(authErrors, 'J4: unexpected 401/403 responses on keyword journey').toHaveLength(0);
  });
});
