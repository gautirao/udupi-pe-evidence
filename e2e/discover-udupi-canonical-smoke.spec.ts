/**
 * Discover canonical-Udupi real-backend smoke — Issue #2446 (owner ruling: Option 2).
 *
 * Restores real-backend Discover coverage for Udupi, the product's home city, which
 * PR #2435 (#2427) retargeted onto Bangalore because the isolated fixture carried no
 * Udupi canonical hierarchy. Rather than promoting Udupi in the DEFAULT fixture — which
 * flips six legacy-Udupi specs from `.area-marker` to canonical rendering (see
 * docs/pr-evidence/issue-2427/option-1-blast-radius.md, Table B) — this spec runs ONLY
 * under the dedicated, opt-in fixture profile:
 *
 *   E2E_FIXTURE_PROFILE=udupi-canonical bash scripts/run-e2e-local.sh --project=udupi-canonical-smoke
 *
 * scripts/db/restore-test-fixture.sh applies scripts/db/fixtures/udupi-canonical-smoke-
 * fixture-seed.sql only under that profile. It seeds a real two-Direction root
 * (`d:n` "North Udupi" -> `a:IN|KA|Udupi|Brahmavar`; `d:s` "South Udupi" ->
 * `a:IN|KA|Udupi|Kaup`), a PROMOTED city_launch_revision for Udupi, one Brahmavar school
 * and three LIVE Brahmavar listings, then asserts all of them landed. (A root with a
 * SINGLE Direction lands straight on that Direction at zoom 18 and never renders a
 * Direction marker to click — measured on this profile's first run — so the second
 * Direction is what makes the Direction hop below real.) On the default profile Udupi
 * stays LEGACY and J0 below fails loudly — by design, so this spec can never report a
 * false green on the wrong fixture.
 *
 * NO page.route() mocks anywhere in this file: every journey talks to the real local
 * backend over the real seeded data.
 *
 * Journeys (mirroring e2e/discover-real-data-smoke.spec.ts's city-agnostic contracts):
 *   J0  fixture-mode precondition — /navigation/resolve?node=root answers canonically for udupi
 *   J1  area-first anon          — city root -> `d:n` Direction -> Brahmavar AREA -> listing cards, no 401/403
 *   J2  school-radius anon       — Brahmavar school URL params -> school-radius endpoint -> cards
 *   J3  school-first auth        — authenticated school-radius -> cards OR property markers (skips without creds)
 *   J4  keyword contextual       — q=apartment strictly narrows Brahmavar's cards; clearing q restores them
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { activateMapNode, declineConsentBannerIfPresent, urlParam, urlZoom } from './helpers/discover-map-drive';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration — every identity below is seeded by
// scripts/db/fixtures/udupi-canonical-smoke-fixture-seed.sql and asserted there.
// ---------------------------------------------------------------------------

const BACKEND = process.env.BACKEND_BASE_URL ?? 'http://localhost:8080';

const CITY = 'udupi';

/** Brahmavar — the taluk HQ ~13 km north of Udupi town; the only fixture AREA under `d:n`. */
const BRAHMAVAR_AREA_KEY = 'IN|KA|Udupi|Brahmavar';

/** Direction destination reached from the Udupi city root (seed section 3, depth 0). */
const NORTH_DIRECTION_NODE = 'd:n';

/** The sibling Direction (seed section 3b) that makes the root a real two-destination level. */
const SOUTH_DIRECTION_NODE = 'd:s';

/** AREA child of `d:n`, pinned by identity rather than `.first()` (Leaflet DOM order != screen order). */
const BRAHMAVAR_AREA_NODE = `a:${BRAHMAVAR_AREA_KEY}`;

/**
 * The fixture school J2/J3 use, pinned by name: `GET /api/public/schools/by-area`
 * returns every school within 2 km of the AREA centroid, not only those whose
 * `area_key` matches, so element [0] is not a safe pick.
 */
const BRAHMAVAR_SCHOOL_NAME = '[E2E] Brahmavar Fixture Government High School';

/**
 * Derived from the seed's coordinates: the school sits at 13.4280, 74.7455; the
 * apartment listing is at the same point (0.000 km), the two houses are ~0.30 km
 * east and ~0.27 km north. 2 km reaches all three with a ~6x margin while the
 * nearest other Udupi listings (Manipal / Malpe, ~9 km south) stay excluded.
 */
const SCHOOL_RADIUS_KM = 2;

/**
 * Exactly ONE of the three LIVE Brahmavar listings carries this token in its FTS
 * vector (`[E2E] Brahmavar Fixture Apartment`); the seed's closing DO block
 * asserts that count, so J4's strict-narrowing assertion is deterministic.
 */
const KEYWORD = 'apartment';

/** LIVE Brahmavar listings the seed asserts (>= 3). */
const BRAHMAVAR_LIVE_LISTING_COUNT = 3;

// ---------------------------------------------------------------------------
// School data fetched once for J2 + J3
// ---------------------------------------------------------------------------

interface SchoolData {
  schoolId: string | null;
}

let schoolData: SchoolData = { schoolId: null };

/**
 * Reported rather than swallowed: the school is seeded into the isolated fixture
 * and asserted present AT SEED TIME, so a missing school means the fixture or the
 * endpoint is broken — exactly what a smoke gate exists to catch.
 */
let schoolPrefetchFailure: string | null = null;

test.describe('Discover canonical-Udupi smoke (#2446, isolated fixture profile)', () => {
  // Serial: J3 uses broker storageState; keep auth contexts from racing under 2 workers.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const url =
      `${BACKEND}/api/public/schools/by-area` +
      `?areaKey=${encodeURIComponent(BRAHMAVAR_AREA_KEY)}&page=0&size=50`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        schoolPrefetchFailure = `GET ${url} returned ${res.status}`;
        return;
      }
      const data = (await res.json()) as Array<{ id: string; name: string; latitude: number; longitude: number }>;
      const school = data?.find((s) => s?.name === BRAHMAVAR_SCHOOL_NAME);
      if (!school) {
        schoolPrefetchFailure =
          `the fixture school "${BRAHMAVAR_SCHOOL_NAME}" was not among the ` +
          `${data?.length ?? 0} school(s) returned for ${BRAHMAVAR_AREA_KEY} ` +
          `(names: ${(data ?? []).map((s) => s?.name).join(', ') || 'none'})`;
        return;
      }
      schoolData = { schoolId: school.id };
      console.log(`[discover-udupi-canonical-smoke] School prefetch OK: id=${school.id}`);
    } catch (err) {
      schoolPrefetchFailure = `GET ${url} threw: ${String(err)}`;
    }
  });

  function assertSchoolFixturePresent(journey: string): string {
    expect(
      schoolPrefetchFailure,
      `${journey}: the Brahmavar fixture school must be resolvable before this journey can run`,
    ).toBeNull();
    expect(
      schoolData.schoolId,
      `${journey}: school prefetch must have resolved an id for "${BRAHMAVAR_SCHOOL_NAME}"`,
    ).not.toBeNull();
    return schoolData.schoolId as string;
  }

  // -------------------------------------------------------------------------
  // J0 — fixture-mode precondition (fails loudly on the default legacy profile)
  // -------------------------------------------------------------------------

  test('J0 — fixture precondition: /navigation/resolve answers canonically for udupi with d:n -> Brahmavar', async () => {
    const url = `${BACKEND}/api/discover/cities/${CITY}/navigation/resolve?node=root`;
    const res = await fetch(url);
    expect(
      res.status,
      `J0: ${url} must be served for the canonical-Udupi profile (E2E_FIXTURE_PROFILE=udupi-canonical); ` +
        'a non-2xx here means this spec is running on the DEFAULT fixture, where Udupi is deliberately LEGACY',
    ).toBe(200);
    const root = (await res.json()) as { node?: { children?: Array<{ nodeKey: string; nodeType: string }> } };
    const rootChildren = root.node?.children ?? [];
    expect(
      rootChildren.map((c) => c.nodeKey).sort(),
      'J0: the Udupi root must expose exactly the two seeded Directions (a single-Direction root auto-lands on that Direction and cannot exercise the Direction hop)',
    ).toEqual([NORTH_DIRECTION_NODE, SOUTH_DIRECTION_NODE].sort());
    expect(
      rootChildren.every((c) => c.nodeType === 'DIRECTION'),
      'J0: every Udupi root child must be a DIRECTION',
    ).toBe(true);
    expect(JSON.stringify(root), 'J0: the Udupi root resolve payload must carry the seeded label "North Udupi"').toContain('North Udupi');

    const direction = await fetch(`${BACKEND}/api/discover/cities/${CITY}/navigation/resolve?node=${encodeURIComponent(NORTH_DIRECTION_NODE)}`);
    expect(direction.status, 'J0: resolving d:n must succeed').toBe(200);
    const directionBody = JSON.stringify(await direction.json());
    expect(
      directionBody,
      'J0: d:n must list the Brahmavar AREA leaf as its child',
    ).toContain(BRAHMAVAR_AREA_NODE);
  });

  // -------------------------------------------------------------------------
  // J1 — area-first anon
  // -------------------------------------------------------------------------

  test('J1 — area-first anon: city root -> d:n Direction -> Brahmavar AREA marker loads listing cards without auth errors', async ({ page }) => {
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('.leaflet-control-zoom-in'),
      'J1: the Discover map (and its zoom control) must mount at the Udupi city root',
    ).toBeVisible({ timeout: 15_000 });
    // Canonical city-root camera-sync writes a zoom into the URL; the legacy
    // Udupi root never does (#2427 header note), so this doubles as a mode check.
    await expect
      .poll(() => urlZoom(page), {
        message: 'J1: canonical city-root camera-sync must settle a zoom into the URL',
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(1);

    await declineConsentBannerIfPresent(page);

    // The legacy AreaMarkerLayer must NOT be what renders at a canonical root.
    expect(
      await page.locator('.leaflet-marker-icon.area-marker').count(),
      'J1: no legacy `.area-marker` ring markers may render at a canonical Udupi root',
    ).toBe(0);
    // The journey must START at the root: a URL already carrying node= here would
    // mean the app skipped the Direction level and the hop below proves nothing.
    expect(
      [null, 'root'],
      'J1: the Udupi city root must not pre-select a node before any marker is clicked',
    ).toContain(urlParam(page, 'node'));

    await activateMapNode(page, 'area-destination-marker', NORTH_DIRECTION_NODE);
    await expect
      .poll(() => urlParam(page, 'node'), {
        message: 'J1: activating the d:n Direction marker must write its canonical node to the URL',
        timeout: 10_000,
      })
      .toBe(NORTH_DIRECTION_NODE);

    await activateMapNode(page, 'area-single-marker', BRAHMAVAR_AREA_NODE);
    await expect
      .poll(() => urlParam(page, 'node'), {
        message: 'J1: activating the Brahmavar AREA marker must write its canonical node to the URL',
        timeout: 10_000,
      })
      .toBe(BRAHMAVAR_AREA_NODE);

    expect(
      urlParam(page, 'areaKey'),
      'J1: the AREA state must be canonical (node=a:…), never the legacy areaKey= param',
    ).toBeNull();

    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    await expect
      .poll(() => page.locator('[data-testid="listing-card"]').count(), {
        message: `J1: all ${BRAHMAVAR_LIVE_LISTING_COUNT} seeded LIVE Brahmavar listings must render as cards`,
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(BRAHMAVAR_LIVE_LISTING_COUNT);

    expect(authErrors, 'J1: unexpected 401/403 responses on anon journey').toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // J2 — school-radius anon
  // -------------------------------------------------------------------------

  test('J2 — school-radius anon: Brahmavar school URL params trigger school-radius endpoint and render cards', async ({ page }) => {
    const schoolId = assertSchoolFixturePresent('J2');

    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    const schoolRadiusResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/school-radius-listings'),
      { timeout: 20_000 },
    );

    await page.goto(
      `/discover?city=${CITY}&schoolId=${encodeURIComponent(schoolId)}` +
        `&radiusKm=${SCHOOL_RADIUS_KM}&journey=school-first`,
    );

    await page.waitForSelector('[data-testid="discover-right-panel"]', { timeout: 15_000 });
    const schoolRadiusResponse = await schoolRadiusResponsePromise;
    expect(schoolRadiusResponse.status(), 'J2: the school-radius endpoint must answer 2xx').toBeLessThan(300);

    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    await expect
      .poll(() => page.locator('[data-testid="listing-card"]').count(), {
        message: `J2: the 2 km radius around the Brahmavar school must reach all ${BRAHMAVAR_LIVE_LISTING_COUNT} seeded listings`,
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(BRAHMAVAR_LIVE_LISTING_COUNT);

    expect(authErrors, 'J2: unexpected 401/403 responses on anon school-radius journey').toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // J3 — school-first auth
  // -------------------------------------------------------------------------

  test.describe('J3 — school-first auth', () => {
    const brokerEmail = process.env.PLAYWRIGHT_BROKER_EMAIL ?? process.env.BROKER_EMAIL ?? '';
    const brokerPassword = process.env.PLAYWRIGHT_BROKER_PASSWORD ?? process.env.BROKER_PASSWORD ?? '';
    const hasBrokerCreds = Boolean(brokerEmail && brokerPassword);

    const brokerAuthPath = path.join(__dirname, 'fixtures', 'broker-auth.json');
    let brokerAuthHasContent = false;
    if (fs.existsSync(brokerAuthPath)) {
      try {
        const fixtureContent = JSON.parse(fs.readFileSync(brokerAuthPath, 'utf-8')) as { cookies?: Array<unknown> };
        brokerAuthHasContent = Array.isArray(fixtureContent.cookies) && fixtureContent.cookies.length > 0;
      } catch {
        brokerAuthHasContent = false;
      }
    }

    test.use({ storageState: brokerAuthHasContent ? brokerAuthPath : undefined });

    test('J3 — authenticated school-radius: listing cards or property markers appear', async ({ page }) => {
      test.skip(!hasBrokerCreds, 'PLAYWRIGHT_BROKER_EMAIL / PLAYWRIGHT_BROKER_PASSWORD not set — J3 skipped');

      const schoolId = assertSchoolFixturePresent('J3');

      if (!brokerAuthHasContent) {
        await page.goto('/auth');
        await page.waitForLoadState('domcontentloaded');
        await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
        await page.locator('#signin-email').fill(brokerEmail);
        await page.locator('#signin-password').fill(brokerPassword);
        await page.locator('button[type="submit"]').filter({ hasText: /sign in/i }).first().click();
        await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 15_000 });
      }

      const schoolRadiusResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/school-radius-listings'),
        { timeout: 20_000 },
      );

      await page.goto(
        `/discover?city=${CITY}&schoolId=${encodeURIComponent(schoolId)}` +
          `&radiusKm=${SCHOOL_RADIUS_KM}&journey=school-first`,
      );

      await page.waitForSelector('[data-testid="discover-right-panel"]', { timeout: 20_000 });
      await schoolRadiusResponsePromise.catch(() => {}); // cache hits / fast responses

      await expect
        .poll(
          async () => {
            const cards = await page.locator('[data-testid="listing-card"]').count();
            const markers = await page.locator('[data-testid="property-marker"]').count();
            const clusters = await page.locator('.custom-marker-cluster').count();
            return cards + markers + clusters;
          },
          {
            message: 'J3: at least 1 listing card OR property marker/cluster expected for authenticated school-radius journey',
            timeout: 15_000,
          },
        )
        .toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // J4 — keyword contextual search
  // -------------------------------------------------------------------------

  test(`J4 — keyword search: q=${KEYWORD} strictly narrows Brahmavar results; clearing q restores them`, async ({ page }) => {
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(BRAHMAVAR_AREA_NODE)}`);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    await expect
      .poll(() => page.locator('[data-testid="listing-card"]').count(), {
        message: `J4: fixture precondition — Brahmavar must expose >= ${BRAHMAVAR_LIVE_LISTING_COUNT} LIVE listing cards before filtering`,
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(BRAHMAVAR_LIVE_LISTING_COUNT);
    const baselineCount = await page.locator('[data-testid="listing-card"]').count();

    await page.goto(
      `/discover?city=${CITY}&node=${encodeURIComponent(BRAHMAVAR_AREA_NODE)}&q=${encodeURIComponent(KEYWORD)}`,
    );
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const filteredCount = await page.locator('[data-testid="listing-card"]').count();
    expect(filteredCount, `J4: filtered results must include the 1 "${KEYWORD}" listing`).toBeGreaterThanOrEqual(1);
    expect(
      filteredCount,
      'J4: filtering must genuinely narrow the result set (exactly one Brahmavar listing matches the keyword)',
    ).toBeLessThan(baselineCount);

    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(BRAHMAVAR_AREA_NODE)}`);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const restoredCount = await page.locator('[data-testid="listing-card"]').count();
    expect(restoredCount, 'J4: restoring (no q) must show the full Brahmavar set again').toBe(baselineCount);

    expect(authErrors, 'J4: unexpected 401/403 responses on keyword journey').toHaveLength(0);
  });
});
