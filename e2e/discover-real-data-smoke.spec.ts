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

    // Issue #1745 Batch B map-hierarchy fix — the journeyless /discover?city=udupi
    // landing now correctly renders macro-region BUBBLES (Coastal Strip / University
    // Belt / South Udupi / North Udupi), not per-area '.area-marker' pills, so a
    // direct '.leaflet-marker-icon.area-marker' click with hasText 'Manipal' no
    // longer exists at that landing (pre-fix behavior this test used to assert).
    // Navigate straight to the Manipal area (real backend-confirmed seeded [E2E]
    // listings) to preserve this test's area-first anon intent — listing cards
    // reachable, zero 401/403 — without depending on the intermediate
    // bubble → pill drill-down UI.
    await page.goto(`/discover?city=udupi&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}`);

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

      // Set up a promise that resolves when the school-radius endpoint is called
      const schoolRadiusResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/school-radius-listings'),
        { timeout: 20_000 },
      );

      await page.goto(`/discover?city=udupi&schoolId=${encodeURIComponent(schoolId!)}&radiusKm=2`);

      // Wait for the right panel
      await page.waitForSelector('[data-testid="discover-right-panel"]', { timeout: 20_000 });

      // Wait for the school-radius endpoint to be called
      await schoolRadiusResponsePromise.catch(() => {}); // handle cache hits or fast responses

      // Authenticated school-radius path uses same public school-radius endpoint as anon path.
      // May show listing cards OR property markers/clusters.
      await expect.poll(
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

  // -------------------------------------------------------------------------
  // J5 — school-first journey: REAL zone→area→school navigation (no deep-link),
  // radius progression, URL restore, refresh, back/forward, and AC9 (no bare
  // internal grade letter). Issue #1954 (reworked per user correction — the
  // previous version deep-linked straight to areaKey; this version drives the
  // actual zone-bubble → area-row → school-card clicks confirmed live against
  // the local disposable stack on 2026-07-23: /discover?city=udupi&journey=
  // school-first renders REAL "School zones across Udupi" zone cards
  // (data-testid="school-zone-card-university-belt"), clicking one renders REAL
  // area rows (data-testid="school-group-area-row-{areaKey}"), and clicking the
  // Manipal row lands on the same areaKey=IN|KA|Udupi|Manipal used elsewhere in
  // this file).
  // -------------------------------------------------------------------------

  test('J5 — school-first: real zone/area/school navigation, radius 3→5→10, refresh + back/forward restore, no raw A-D grade', async ({ page }) => {
    test.skip(schoolData.schoolId === null, 'No school data near Manipal — J5 skipped');

    // Collect auth errors — the whole journey below is anonymous.
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    // Step 1 — Schools landing: journeyless entry into journey=school-first only
    // (no areaKey, no groupId, no schoolId deep-link).
    await page.goto('/discover?city=udupi&journey=school-first');
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Step 1a — click the REAL "University Belt" zone card (live-confirmed zone
    // covering Manipal + Katapadi; real backend data, no mock).
    const zoneCard = rightPanel.getByTestId('school-zone-card-university-belt');
    await expect(zoneCard, 'J5: University Belt zone card must render on the real Schools landing for udupi').toBeVisible({ timeout: 15_000 });
    await zoneCard.click();
    await expect(page, 'J5: clicking the zone card must write groupId=university-belt to the URL').toHaveURL(/groupId=university-belt/, { timeout: 8_000 });

    // Step 1b — click the REAL Manipal area row within the zone drill-down.
    const areaRow = rightPanel.getByTestId(`school-group-area-row-${MANIPAL_AREA_KEY}`);
    await expect(areaRow, 'J5: Manipal area row must render inside the University Belt zone').toBeVisible({ timeout: 15_000 });
    await areaRow.click();
    await expect.poll(
      () => new URL(page.url()).searchParams.get('areaKey'),
      { message: 'J5: clicking the Manipal area row must write areaKey to the URL', timeout: 8_000 },
    ).toBe(MANIPAL_AREA_KEY);

    // Step 2 — search/filter schools: toggle a board chip, confirm the URL + a
    // re-fetch happen, then clear it again so school selection below is unfiltered.
    //
    // Known PRE-EXISTING race (reproduces on clean main; tracked as a follow-up bug,
    // NOT introduced by #1954): the board-filter click is silently dropped if it lands
    // before the area camera-sync writes lat/lon/zoom to the URL. Wait for settle
    // before interacting — the realistic user path.
    await expect.poll(
      () => {
        const params = new URL(page.url()).searchParams;
        return params.has('lat') && params.has('lon') && params.has('zoom');
      },
      { message: 'J5: area camera-sync must settle (lat/lon/zoom in URL) before filter interaction', timeout: 10_000 },
    ).toBe(true);

    const cbseChip = rightPanel.getByTestId('board-chip-cbse');
    await expect(cbseChip).toBeVisible({ timeout: 15_000 });
    await cbseChip.click();
    await expect(page).toHaveURL(/board=cbse/i, { timeout: 8_000 });
    await cbseChip.click();
    await expect(page).not.toHaveURL(/board=cbse/i, { timeout: 8_000 });

    // Step 3 — select a school (first card in the unfiltered list). Capture the
    // schoolId from the URL IMMEDIATELY after this real click — this captured
    // value (not a separately prefetched one) drives every assertion below.
    const schoolCard = rightPanel.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });
    await schoolCard.click();
    await expect.poll(() => new URL(page.url()).searchParams.get('schoolId'), { timeout: 8_000 }).not.toBeNull();
    await expect(page).toHaveURL(/journey=school-first/, { timeout: 8_000 });
    const schoolId = new URL(page.url()).searchParams.get('schoolId');
    expect(schoolId, 'J5: a real schoolId must be captured from the URL right after the school-card click').not.toBeNull();

    // Step 4 — radius progression 3 → 5 → 10 km. Each click UNCONDITIONALLY asserts:
    // (a) radiusKm updates in the URL; (b) the map legend shows the selected radius;
    // (c) the refetch/loading state settles; (d) a results state OR an explicit
    // no-homes state renders; (e) the visible result count matches the rendered
    // card count; (f) every visible real distance is within the selected radius.
    // A cache hit (no fresh network response) must NOT remove these assertions.
    const radiusLegend = page.getByTestId('school-radius-legend-radius');
    const listingCards = rightPanel.locator('[data-testid="listing-card"]');
    const emptyState = rightPanel.getByTestId('school-radius-empty-state');
    const distanceBadges = rightPanel.locator('[data-testid="distance-badge"]');

    // Issue #1954 rework #2 (FIX 1) — a per-iteration `waitForResponse(...).catch(() =>
    // null)` with a 20s timeout can burn most of the 30s test-wide budget on a radius
    // whose response is already cached (no fresh request fires), spuriously failing a
    // correct UI. Instead, register ONE response listener BEFORE the loop and passively
    // capture any successful school-radius-listings response per radius as it arrives.
    // Each loop iteration then does its UI assertions UNCONDITIONALLY (no network await)
    // and only consults the captured response afterward, IF one was observed for that
    // radius — a cache hit/no-request iteration never blocks or times out.
    const capturedRadiusResponses = new Map<number, Awaited<ReturnType<typeof page.waitForResponse>>>();
    const radiusResponseHandler = (resp: Awaited<ReturnType<typeof page.waitForResponse>>) => {
      const url = resp.url();
      if (!url.includes('/school-radius-listings') || resp.status() !== 200) return;
      const match = url.match(/schoolRadiusKm=(\d+)/);
      if (!match) return;
      capturedRadiusResponses.set(Number(match[1]), resp);
    };
    page.on('response', radiusResponseHandler);

    try {
      for (const km of [3, 5, 10] as const) {
        const radiusBtn = rightPanel.getByTestId(`combined-radius-btn-${km}`);
        await expect(radiusBtn).toBeVisible({ timeout: 15_000 });
        await radiusBtn.click();

        // (a) URL updates.
        await expect.poll(() => new URL(page.url()).searchParams.get('radiusKm'), {
          message: `J5: radiusKm must be ${km} in the URL after clicking the ${km} km chip`,
          timeout: 8_000,
        }).toBe(String(km));

        // (b) map legend shows the selected radius.
        await expect(radiusLegend, `J5: map legend must read "${km} km radius"`).toContainText(`${km} km radius`, { timeout: 10_000 });

        // (c) refetch/loading settles — the dimmed combined-listings-body must clear.
        // Bounded poll only — no unconditional network wait, so a cache-hit radius
        // cannot stall this iteration.
        const listingsBody = rightPanel.getByTestId('combined-listings-body');
        await expect(listingsBody, `J5: combined-listings-body must not remain dimmed mid-refetch at ${km} km`)
          .not.toHaveClass(/opacity-50/, { timeout: 15_000 });

        // (d) either a results state OR an explicit no-homes state must render — never
        // an indefinite skeleton/blank panel.
        await expect
          .poll(
            async () => (await listingCards.count()) > 0 || (await emptyState.count()) > 0,
            { message: `J5: at ${km} km, either listing cards OR the explicit no-homes state must render`, timeout: 15_000 },
          )
          .toBe(true);

        // Consult a captured response for this radius ONLY if one was observed (a
        // fresh fetch actually fired). Absent — e.g. a cache hit — this is a no-op:
        // no wait, no timeout risk.
        const capturedResp = capturedRadiusResponses.get(km);
        if (capturedResp) {
          const body = await capturedResp.json().catch(() => null) as { content?: unknown[] } | null;
          if (body?.content) {
            const freshExpectedCount = body.content.length;
            await expect
              .poll(
                () => listingCards.count(),
                { message: `J5: rendered card count must catch up to the FRESH ${km} km school-radius-listings response (${freshExpectedCount} items)`, timeout: 10_000 },
              )
              .toBe(freshExpectedCount);
          }
        }

        const cardCountAtRadius = await listingCards.count();
        const emptyStateShown = (await emptyState.count()) > 0;

        if (cardCountAtRadius > 0) {
          // (e) visible result count (radius-result-count) must be present AND match
          // the rendered card count — UNCONDITIONALLY. Issue #1954 rework #2 (FIX 2):
          // a regression that deletes this element entirely must now FAIL the test,
          // not silently pass (previously gated behind `if (count > 0)`).
          const resultCountEl = rightPanel.getByTestId('radius-result-count');
          await expect(
            resultCountEl,
            `J5: radius-result-count element must render at ${km} km when ${cardCountAtRadius} card(s) are present`,
          ).toBeVisible({ timeout: 10_000 });
          const resultCountText = (await resultCountEl.innerText()).trim();
          expect(
            Number(resultCountText),
            `J5: radius-result-count text ("${resultCountText}") must match the rendered card count (${cardCountAtRadius}) at ${km} km`,
          ).toBe(cardCountAtRadius);

          // (f) every visible real distance is within the selected radius km.
          const badgeCount = await distanceBadges.count();
          for (let i = 0; i < badgeCount; i++) {
            const badgeText = (await distanceBadges.nth(i).innerText()).trim();
            const match = badgeText.match(/^([\d.]+)\s*km from school$/i);
            expect(match, `J5: distance-badge text "${badgeText}" must match "{n} km from school"`).not.toBeNull();
            const distanceKm = Number(match![1]);
            expect(
              distanceKm,
              `J5: rendered distance ${distanceKm}km must be within the selected ${km}km radius`,
            ).toBeLessThanOrEqual(km);
          }
        } else {
          expect(emptyStateShown, `J5: at ${km} km with zero cards, the explicit school-radius-empty-state must be shown`).toBe(true);
        }
      }
    } finally {
      page.off('response', radiusResponseHandler);
    }

    // AC9 — negative assertion: no bare internal trust-tier grade letter (A/B/C/D)
    // anywhere in the rendered card/popover DOM. Live seeded data is D-tier/null, so a
    // public trust badge word may legitimately be ABSENT — we assert only that no raw
    // grade letter leaks, never that a specific badge word is present.
    const panelText = (await rightPanel.innerText()).trim();
    for (const grade of ['A', 'B', 'C', 'D']) {
      expect(
        new RegExp(`(^|\\s)${grade}(\\s|$)`).test(panelText),
        `J5 (AC9): no bare "${grade}" grade letter may appear in the schools/homes panel`,
      ).toBe(false);
    }

    // Step 5 — refresh: exact state must survive a full reload (URL params, not
    // just in-memory state).
    const preRefreshUrl = new URL(page.url());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('combined-chips').or(page.getByRole('heading', { name: /find homes near a school/i }))).toBeVisible({ timeout: 15_000 });

    const postRefreshUrl = new URL(page.url());
    expect(postRefreshUrl.searchParams.get('journey'), 'J5: journey must survive refresh').toBe('school-first');
    expect(postRefreshUrl.searchParams.get('schoolId'), 'J5: the CAPTURED schoolId must survive refresh').toBe(schoolId);
    expect(postRefreshUrl.searchParams.get('areaKey'), 'J5: areaKey must survive refresh').toBe(MANIPAL_AREA_KEY);
    expect(postRefreshUrl.searchParams.get('radiusKm'), 'J5: radiusKm must survive refresh').toBe(preRefreshUrl.searchParams.get('radiusKm'));

    // Step 6 — Back then Forward: the journey state must restore at each hop.
    // Empirically confirmed live (2026-07-23): each radius-chip click pushes a NEW
    // history entry (not replaceState), so a single Back from the post-refresh state
    // lands on the PREVIOUS radius (10 → 5), not on the pre-radius-progression Step-1
    // entry. Assert what the browser actually does: schoolId/areaKey/journey remain
    // stable across the hop, and radiusKm steps back to the prior value, then forward
    // restores the post-refresh radiusKm.
    const preBackRadiusKm = postRefreshUrl.searchParams.get('radiusKm');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('journey'), { timeout: 8_000 }).toBe('school-first');
    expect(new URL(page.url()).searchParams.get('areaKey'), 'J5: areaKey must be preserved across Back').toBe(MANIPAL_AREA_KEY);
    expect(new URL(page.url()).searchParams.get('schoolId'), 'J5: the CAPTURED schoolId must be preserved across Back').toBe(schoolId);
    expect(
      new URL(page.url()).searchParams.get('radiusKm'),
      'J5: Back must land on a DIFFERENT (earlier) radiusKm than the post-refresh value',
    ).not.toBe(preBackRadiusKm);

    await page.goForward({ waitUntil: 'domcontentloaded' });
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('schoolId'), { timeout: 8_000 }).toBe(schoolId);
    expect(new URL(page.url()).searchParams.get('journey')).toBe('school-first');
    expect(new URL(page.url()).searchParams.get('areaKey'), 'J5: areaKey must be preserved across Forward').toBe(MANIPAL_AREA_KEY);
    expect(
      new URL(page.url()).searchParams.get('radiusKm'),
      'J5: Forward must restore the exact post-refresh radiusKm',
    ).toBe(preBackRadiusKm);

    // No auth errors across the entire anonymous school-first journey.
    expect(authErrors, 'J5: unexpected 401/403 responses on school-first journey').toHaveLength(0);
  });
});
