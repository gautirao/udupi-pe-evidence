/**
 * E2E — Buyer Area Trends confidence journey (Issue #2581)
 *
 * #2581: "Area Trends showed 'Not enough data' for nearly every area because
 * area_intelligence_snapshot had no refresh owner." The backend fix adds
 * AreaIntelligenceSnapshotRollupJob (a real, scheduled refresh owner) and a
 * demand_score-preservation fix in AreaIntelligenceSnapshotService.
 *
 * This spec proves the REAL buyer journey end-to-end against a REAL backend +
 * REAL local Postgres fixture (NOT page.route-mocked network):
 *
 *   Discover (select/open an area) -> click "Trends" -> land on
 *   /trends/:citySlug/areas/:areaSlug -> correct confidence label rendered.
 *
 * ── Why the assertions are non-vacuous ──────────────────────────────────────
 * Every confidence assertion below is served by the app's real, unmocked
 * /api/trends/area-intelligence and /api/admin/intelligence/areas endpoints,
 * reading from area_intelligence_snapshot rows that were themselves written
 * by the REAL AreaIntelligenceSnapshotRollupJob.run() entry point (see
 * beforeAll below) — not hand-inserted to match what we expect to see.
 *
 * AreaIntelligenceSnapshotRollupJob has no HTTP-reachable manual trigger, and
 * the E2E local stack (scripts/run-e2e-local.sh) sets
 * SPRING_TASK_SCHEDULING_ENABLED=false, so its @Scheduled cron never fires
 * during a Playwright run (#2114/SchedulingSuppressionConfig — by design, not
 * a gap this spec works around). So this spec's beforeAll shells out to a new
 * backend fixture-seed harness,
 * apps/api/src/test/java/.../AreaIntelligenceSnapshotRollupJobE2ESeedIT.java,
 * which connects to the SAME disposable local Postgres this run's backend is
 * serving from (via the SUPABASE_DB_HOST/PORT/NAME/USER/PASSWORD env vars
 * scripts/run-e2e-local.sh exports before launching Playwright), seeds real
 * LIVE listings across the three AreaConfidence bands, and calls the real
 * AreaIntelligenceSnapshotRollupJob.run(). If that job were deleted or broken,
 * this seed step itself fails and the whole suite fails closed.
 *
 * Real curated Udupi areas are reused (not sentinel synthetic keys) so the
 * Discover journey below can navigate to them exactly as a buyer would:
 *   FULL          — IN|KA|Udupi|Manipal     (32 seeded LIVE listings)
 *   LIMITED       — IN|KA|Udupi|Brahmavar   (15 seeded LIVE listings)
 *   INSUFFICIENT  — IN|KA|Udupi|Kaup        (3 seeded LIVE listings)
 * (mirrors this issue's real measured examples: Manipal=41 FULL,
 * Kaup=3 INSUFFICIENT — reproduced here with local/test data, not the exact
 * real rows.)
 *
 * Requires the E2E local fixture stack (npm run test:e2e:local /
 * scripts/run-e2e-local.sh) — the whole file skips itself with a clear reason
 * when SUPABASE_DB_HOST is not set (e.g. a bare `npx playwright test` against
 * a hosted backend with no local fixture DB to seed).
 *
 * Run targeted:
 *   npm run test:e2e:local -- e2e/journey/area-trends-2581.spec.ts --project=full
 */

import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { hasRealCredentials } from '../helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');

const CITY_SLUG = 'udupi';

const FULL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const FULL_AREA_LABEL = 'Manipal';
const LIMITED_AREA_KEY = 'IN|KA|Udupi|Brahmavar';
const LIMITED_AREA_LABEL = 'Brahmavar';
const INSUFFICIENT_AREA_KEY = 'IN|KA|Udupi|Kaup';
const INSUFFICIENT_AREA_LABEL = 'Kaup';

const hasLocalFixtureDb = Boolean(process.env.SUPABASE_DB_HOST && process.env.SUPABASE_DB_PORT);

/** Dismisses the anonymous-usage-telemetry consent banner if it is showing (established
 * pattern — see e.g. e2e/discover-area-reskin-mobile-2159.spec.ts). Without this, the
 * banner sits on top of the Discover panel and several interactions/assertions below it
 * behave unreliably. */
async function dismissConsentBannerIfPresent(page: Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const hasAdminCreds = hasRealCredentials(adminEmail, adminPassword);

/**
 * Navigate to Discover with the area pre-selected via URL state (the same
 * URL-driven area-selection contract this app's own Discover journeys use —
 * see e.g. e2e/commercial-subtype-wrap-2450.spec.ts, e2e/discover-area-first-
 * drilldown-1483.spec.ts), then click the real "Trends" CTA rendered by
 * AreaSelectedPanel to land on the canonical /trends/:citySlug/areas/:slug
 * route. This is the real buyer journey the issue brief requires — NOT a
 * direct navigation to the Trends URL.
 */
async function discoverToTrends(page: Page, areaKey: string): Promise<void> {
  // journey=area-first is required alongside areaKey for Discover's
  // useDiscoverJourneyChromeController to resolve `effectiveSelectedArea` and
  // compute AreaSelectedPanel's area-scoped trendsHref (the canonical route).
  // A bare `?areaKey=` alone (the "legacy" composition some older specs use
  // only to mount the Filters Sheet) does not resolve effectiveSelectedArea,
  // and the page then shows only the site header's generic "Trends" nav link
  // (/trends?city=..., no areaKey) instead of the area-scoped CTA.
  await page.goto(
    `/discover?city=${CITY_SLUG}&journey=area-first&areaKey=${encodeURIComponent(areaKey)}`,
  );
  await page.waitForLoadState('domcontentloaded');
  await dismissConsentBannerIfPresent(page);

  // Scope to the <main> landmark so the site header's generic "Trends" nav
  // link (in the <banner> landmark, always present, always /trends?city=...)
  // can never be matched instead of the area-scoped CTA rendered inside the
  // Discover panel.
  const trendsLink = page.locator('main').getByRole('link', { name: /^trends$/i }).first();
  await expect(trendsLink).toBeVisible({ timeout: 15_000 });
  await trendsLink.click();

  await expect(page).toHaveURL(
    new RegExp(`/trends/${CITY_SLUG}/areas/[a-z0-9-]+$`, 'i'),
    { timeout: 15_000 },
  );
}

test.describe('@journey Area Trends confidence — Discover to Trends (#2581)', () => {
  test.beforeAll(() => {
    test.skip(
      !hasLocalFixtureDb,
      'SUPABASE_DB_HOST/SUPABASE_DB_PORT not set — not running under the E2E local fixture ' +
        '(scripts/run-e2e-local.sh); no local Postgres to seed real listings/snapshot rows into.',
    );

    // Seeds real LIVE listings + runs the real AreaIntelligenceSnapshotRollupJob.run() entry
    // point against THIS run's local Postgres fixture. See AreaIntelligenceSnapshotRollupJobE2ESeedIT
    // for the full rationale (no HTTP-reachable trigger exists; @Scheduled is suppressed in E2E).
    execFileSync('mvn', ['-f', 'apps/api/pom.xml', 'test', '-Dtest=AreaIntelligenceSnapshotRollupJobE2ESeedIT'], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit',
      timeout: 180_000,
    });
  });

  // ── Arms 1-3: the three confidence bands, real buyer journey, anonymous ──

  test('Arm 1 — FULL band area (Manipal, 32 LIVE listings): Discover -> Trends -> "Enough data"', async ({ page }) => {
    await discoverToTrends(page, FULL_AREA_KEY);
    await expect(page.getByRole('heading', { name: new RegExp(FULL_AREA_LABEL, 'i'), level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Enough data').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Arm 2 — LIMITED band area (Brahmavar, 15 LIVE listings): Discover -> Trends -> "Limited data"', async ({ page }) => {
    await discoverToTrends(page, LIMITED_AREA_KEY);
    await expect(page.getByRole('heading', { name: new RegExp(LIMITED_AREA_LABEL, 'i'), level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Limited data').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Arm 3 — INSUFFICIENT band area (Kaup, 3 LIVE listings): Discover -> Trends -> "Not enough data yet"', async ({ page }) => {
    await discoverToTrends(page, INSUFFICIENT_AREA_KEY);
    await expect(page.getByRole('heading', { name: new RegExp(INSUFFICIENT_AREA_LABEL, 'i'), level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Not enough data yet').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Arm 4: anonymous buyer completes the journey — no auth wall ──────────

  test('Arm 4 — anonymous buyer completes the full journey with no auth wall or redirect', async ({ page }) => {
    // No storageState -> genuinely anonymous.
    await discoverToTrends(page, FULL_AREA_KEY);
    // Must NOT have been redirected to /auth at any point in the journey.
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(page.getByText('Enough data').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Arm 5: signed-in normal user completes the same journey ──────────────

  test.describe('signed-in user', () => {
    test.use({ storageState: 'e2e/fixtures/user-auth.json' });

    test('Arm 5 — signed-in normal user: Discover -> Trends -> correct confidence', async ({ page }) => {
      await discoverToTrends(page, LIMITED_AREA_KEY);
      await expect(page.getByText('Limited data').first()).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── Arm 6: mobile viewport ─────────────────────────────────────────────

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Arm 6 — mobile buyer viewport: Discover -> Trends -> "Not enough data yet" (INSUFFICIENT)', async ({ page }) => {
      await discoverToTrends(page, INSUFFICIENT_AREA_KEY);
      await expect(page.getByText('Not enough data yet').first()).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── Arm 7: browser refresh preserves the correct state ────────────────

  test('Arm 7 — browser refresh on the Trends page preserves the correct confidence state', async ({ page }) => {
    await discoverToTrends(page, FULL_AREA_KEY);
    await expect(page.getByText('Enough data').first()).toBeVisible({ timeout: 10_000 });

    const urlBeforeReload = page.url();
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(urlBeforeReload);
    await expect(page.getByText('Enough data').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Arm 8: CTA from Trends returns to the correct area scope in Discover ──

  test('Arm 8 — "View homes" CTA from Trends returns to the correct area scope in Discover', async ({ page }) => {
    await discoverToTrends(page, FULL_AREA_KEY);

    const ctaLink = page.getByRole('link', { name: new RegExp(`view homes in ${FULL_AREA_LABEL}`, 'i') }).first();
    await expect(ctaLink).toBeVisible({ timeout: 10_000 });

    const href = await ctaLink.getAttribute('href');
    expect(href).toContain('/discover');
    expect(href).toContain(`city=${CITY_SLUG}`);
    expect(href).toContain(encodeURIComponent(FULL_AREA_KEY));

    await ctaLink.click();
    await expect(page).toHaveURL(new RegExp(`/discover\\?city=${CITY_SLUG}.*areaKey=${encodeURIComponent(FULL_AREA_KEY)}`), {
      timeout: 10_000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Admin journey (Arm 9). Arm 10 (non-admin/anon blocked from the admin
// intelligence surface) is ALREADY covered by existing tests and is not
// duplicated here — see AC coverage table in the QA evidence report:
//   - Backend HTTP layer: AdminIntelligenceControllerTest
//       ::getAreas_withBrokerRole_returns403
//       ::getAreas_withNoJwt_isRejected
//   - Frontend E2E: e2e/admin-intelligence-smoke.spec.ts::AI3
//       ("unauthenticated user is redirected from /admin/intelligence to /auth")
// ─────────────────────────────────────────────────────────────────────────

test.describe('@journey Area Trends — admin/buyer confidence agreement (#2581)', () => {
  test.beforeAll(() => {
    test.skip(!hasLocalFixtureDb, 'SUPABASE_DB_HOST/SUPABASE_DB_PORT not set — see Arm 1-8 beforeAll.');
    // Seed step already ran in the describe block above within this same worker/file run;
    // Maven's own idempotent DELETE-then-seed (see AreaIntelligenceSnapshotRollupJobE2ESeedIT)
    // makes re-invoking it here safe if Playwright ever runs this describe in isolation.
    execFileSync('mvn', ['-f', 'apps/api/pom.xml', 'test', '-Dtest=AreaIntelligenceSnapshotRollupJobE2ESeedIT'], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit',
      timeout: 180_000,
    });
  });

  test.use({ storageState: 'e2e/fixtures/admin-auth.json' });

  test('Arm 9 — /admin/intelligence shows the same fixture areas with confidence agreeing with the buyer page', async ({ page }) => {
    test.skip(!hasAdminCreds, 'ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin agreement check.');

    await page.goto('/admin/intelligence');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/admin\/intelligence/, { timeout: 8_000 });

    await page.locator('[aria-label="Loading intelligence data"]').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});

    await expect(page.locator('[data-testid="intelligence-table"]')).toBeVisible({ timeout: 10_000 });

    // Admin computes confidence LIVE from the listings table (AdminIntelligenceService),
    // buyer reads the cached area_intelligence_snapshot row the rollup job just wrote
    // (BuyerAreaIntelligenceService) — two different code paths over the SAME seeded data.
    // They must agree on the confidence TIER even though the admin badge text ("Full" /
    // "Limited" / "Insufficient") differs from the buyer label ("Enough data" / "Limited
    // data" / "Not enough data yet") by design.
    const bands: Array<{ areaLabel: string; adminBadge: string; buyerLabel: string; areaKey: string }> = [
      { areaLabel: FULL_AREA_LABEL, adminBadge: 'Full', buyerLabel: 'Enough data', areaKey: FULL_AREA_KEY },
      { areaLabel: LIMITED_AREA_LABEL, adminBadge: 'Limited', buyerLabel: 'Limited data', areaKey: LIMITED_AREA_KEY },
      { areaLabel: INSUFFICIENT_AREA_LABEL, adminBadge: 'Insufficient', buyerLabel: 'Not enough data yet', areaKey: INSUFFICIENT_AREA_KEY },
    ];

    for (const band of bands) {
      const row = page.locator('[data-testid="intelligence-table"] tr', { hasText: band.areaLabel }).first();
      await expect(row, `admin table must have a row for ${band.areaLabel}`).toBeVisible({ timeout: 10_000 });
      await expect(row.getByText(band.adminBadge, { exact: true })).toBeVisible();

      // Cross-check against the buyer-facing page for the SAME area.
      await discoverToTrends(page, band.areaKey);
      await expect(page.getByText(band.buyerLabel).first()).toBeVisible({ timeout: 10_000 });

      // Return to the admin table for the next iteration.
      await page.goto('/admin/intelligence');
      await page.waitForLoadState('domcontentloaded');
      await page.locator('[aria-label="Loading intelligence data"]').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
      await expect(page.locator('[data-testid="intelligence-table"]')).toBeVisible({ timeout: 10_000 });
    }
  });
});
