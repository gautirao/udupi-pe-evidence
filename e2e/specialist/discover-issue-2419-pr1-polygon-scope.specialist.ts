import { test, expect } from './support/specialist-test';
import type { Page, Route } from '@playwright/test';

/**
 * Issue #2419 (PR-1) — browser proof for the three states this PR ships:
 * the committed "Drawn area" scope chip, the return-to-previous-scope
 * transition, and the #2420 rejection contract.
 *
 * The rejection arm forces a real 400 from the listings endpoint carrying
 * #2420's own reason string, rather than asserting against a stub of our own
 * making. The claim under test is a NEGATIVE one — that a rejected polygon
 * writes nothing to the URL — so each rejection assertion is paired with a
 * positive check that the app actually rendered the prior scope, never a bare
 * "the thing is absent".
 */

const WHITEFIELD = 'IN|KA|Bengaluru|Whitefield';
const WHITEFIELD_NODE = `a:${WHITEFIELD}`;
const VARTHUR = 'IN|KA|Bengaluru|Varthur';

/** A small polygon over Whitefield, encoded the way state/url/resultScope.ts writes it. */
const RPOLY = [
  [12.95, 77.73],
  [12.99, 77.73],
  [12.99, 77.77],
  [12.95, 77.77],
]
  .map(([lat, lon]) => `${lat.toFixed(5)}:${lon.toFixed(5)}`)
  .join(';');

const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };

function committedPolygonUrl(): string {
  const params = new URLSearchParams({
    city: 'bangalore',
    journey: 'area-first',
    node: WHITEFIELD_NODE,
    rscope: 'poly',
    rpoly: RPOLY,
    rprev: `areas:${WHITEFIELD},${VARTHUR}`,
  });
  return `/discover?${params.toString()}`;
}

function committedAreaSetUrl(): string {
  const params = new URLSearchParams({
    city: 'bangalore',
    journey: 'area-first',
    node: WHITEFIELD_NODE,
    areaKey: WHITEFIELD,
    rscope: 'areas',
    rareas: `${WHITEFIELD},${VARTHUR}`,
  });
  return `/discover?${params.toString()}`;
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubWhitefieldNavigationNode(page: Page): Promise<void> {
  await page.route('**/api/discover/cities/*/navigation/resolve**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('node') === WHITEFIELD_NODE) {
      await fulfillJson(route, 200, {
        requested: WHITEFIELD_NODE,
        resolution: 'EXACT',
        revisionId: 1,
        node: {
          nodeKey: WHITEFIELD_NODE,
          nodeType: 'AREA',
          displayLabel: 'Whitefield',
          depth: 1,
          regionKey: null,
          ancestry: [{ nodeKey: 'd:e', nodeType: 'DIRECTION', displayLabel: 'East Bangalore' }],
          nextLevelType: 'LISTINGS',
          children: [],
          revisionId: 1,
          bounds: {
            centreLat: 12.9698,
            centreLon: 77.75,
            minLat: 12.95,
            minLon: 77.73,
            maxLat: 12.99,
            maxLon: 77.77,
          },
          descendantAreaKeys: [WHITEFIELD],
          areaKey: WHITEFIELD,
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/discover/cities/*/navigation/*/counts**', async (route) => {
    const url = new URL(route.request().url());
    if (decodeURIComponent(url.pathname).includes(WHITEFIELD_NODE)) {
      await fulfillJson(route, 200, {
        nodeKey: WHITEFIELD_NODE,
        count: 4,
        schoolCount: 2,
        areaCounts: { [WHITEFIELD]: 4 },
        areaSchoolCounts: { [WHITEFIELD]: 2 },
        children: [],
        revisionId: 1,
      });
      return;
    }
    await route.fallback();
  });
}

async function mockLocalSupabaseUserSession(page: Page): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const fakeUser = {
    id: '00000000-0000-4000-8000-000000002419',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'buyer-2419@local.test',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Buyer 2419' },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const fakeSession = {
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDI0MTkiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6OTk5OTk5OTk5OX0.sig',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    refresh_token: 'fake-refresh-token-2419',
    user: fakeUser,
  };
  await page.addInitScript((session) => {
    const raw = JSON.stringify(session);
    window.localStorage.setItem('sb-localhost-auth-token', raw);
    window.localStorage.setItem('sb-127-auth-token', raw);
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  }, fakeSession);
  await page.route('**/auth/v1/user**', (route) => fulfillJson(route, 200, fakeUser));
  await page.route('**/auth/v1/token**', (route) => fulfillJson(route, 200, fakeSession));
  await page.route('**/rest/v1/user_roles**', (route) => fulfillJson(route, 200, { role: 'user' }));
  await page.route('**/rest/v1/profiles**', (route) => fulfillJson(route, 200, { insights_access_until: null }));
}

/** Fails the test if the app never loaded real data — a broken app makes negative assertions pass. */
async function assertAppActuallyLoaded(page: Page) {
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
}

/**
 * Draws a closed polygon by driving the REAL leaflet-draw toolbar, which PR-1
 * deliberately keeps (product-native draw chrome is PR-2). Clicking the first
 * vertex again is what closes the ring.
 */
async function drawPolygonOnMap(page: Page) {
  await dismissConsentBanner(page);
  // Issue #2419 PR-2 hides `.leaflet-draw` via `.discover-hide-leaflet-draw-toolbar`
  // when product-native draw entry is wired; unhide the underlying leaflet-draw
  // toolbar so this PR-1 test can drive `.leaflet-draw-draw-polygon` directly
  // (including in the anonymous session where the product draw button is hidden).
  await page.evaluate(() => {
    (window as unknown as { type?: boolean }).type = true;
  });
  await page.addStyleTag({
    content: '.discover-hide-leaflet-draw-toolbar .leaflet-draw { display: block !important; }',
  });
  const drawButton = page.locator('.leaflet-draw-draw-polygon');
  await expect(drawButton).toBeVisible({ timeout: 20_000 });
  await drawButton.click();

  // Bangalore renders ~40 listing markers across this viewport, and a marker
  // swallows the click before Leaflet's map handler sees it. Without this, the
  // draw armed correctly ("Finish / Delete last point / Cancel" appeared) but
  // every vertex click was absorbed and NO polygon was ever completed — which
  // made the negative assertions downstream pass vacuously. Caught by the
  // probe-count guard, not by the eye.
  //
  // Markers stay visible; they just stop intercepting pointer events for the
  // duration of the draw. Nothing in the product path under test changes.
  // `.leaflet-draw-tooltip` is in this list for its own reason: leaflet-draw's
  // "Click to continue drawing shape" hint follows the cursor and GROWS as the
  // shape progresses, so by the fourth vertex it was wide enough to sit over
  // the next click point and absorb it. That produced a stable "vertex 4 never
  // registered" failure while vertices 1-3 always worked.
  await page.addStyleTag({
    content:
      '.leaflet-marker-pane, .leaflet-overlay-pane, .leaflet-tooltip-pane, .leaflet-draw-tooltip { pointer-events: none !important; }',
  });

  const box = await page.locator('.leaflet-container').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  // Three vertices, not four. A rectangle's FOURTH click failed to register
  // every single run while the first three always landed, and the app only
  // needs a geometrically meaningful polygon: the URL decoder requires >= 3
  // vertices and PolygonGeographicSafetyPolicy no-ops below that, so a
  // triangle exercises the identical commit and validation path with one
  // fewer flaky step. The shape under test is the contract, not its vertex
  // count.
  const points: Array<[number, number]> = [
    [box.x + box.width * 0.3, box.y + box.height * 0.3],
    [box.x + box.width * 0.7, box.y + box.height * 0.35],
    [box.x + box.width * 0.5, box.y + box.height * 0.65],
  ];
  // leaflet-draw tracks the pointer between vertices and only commits one on a
  // click it has already seen move to that position, so a bare click loop
  // placed the first vertex and silently dropped the rest. Move, settle, click
  // — and VERIFY each vertex actually registered before moving on.
  //
  // The verification is not belt-and-braces. With move-and-click alone this
  // helper still dropped a vertex intermittently (one arm in seven failing per
  // run), and the failure surfaced far downstream as a probe that never fired.
  // leaflet-draw renders one `.leaflet-editing-icon` handle per placed vertex,
  // which is a direct observable signal that a click landed.
  const vertexHandles = page.locator('.leaflet-editing-icon');
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    let placed = false;
    for (let attempt = 0; attempt < 3 && !placed; attempt += 1) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(120);
      await page.mouse.click(x, y);
      placed = await vertexHandles
        .nth(i)
        .waitFor({ state: 'attached', timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
    }
    expect(placed, `vertex ${i + 1} never registered`).toBe(true);
  }

  // Close the ring via leaflet-draw's own "Finish" action rather than by
  // clicking the first vertex, which needs a pixel-accurate hit on a small
  // handle. Asserted, never best-effort: an earlier version returned quietly
  // when it could not finish, which left the polygon incomplete and made every
  // downstream negative assertion pass for the wrong reason.
  const finish = page.locator('.leaflet-draw-actions a', { hasText: /^Finish$/ });
  await expect(finish.first()).toBeVisible({ timeout: 10_000 });
  await finish.first().click();

  // Deliberately NOT asserting the action bar disappears: leaflet-draw
  // sometimes leaves it mounted, so that check was flaky and was measuring
  // the plugin's chrome rather than the outcome. Each test asserts the real
  // signal instead — that a polygon-carrying request actually reached the
  // validation probe (`probeCount`), which is what makes its negative
  // assertions meaningful.
  await page.waitForTimeout(300);
}

/** Clears the telemetry-consent banner so it does not cover the evidence screenshots. */
async function dismissConsentBanner(page: Page) {
  const decline = page.getByRole('button', { name: /^decline$/i });
  if (await decline.count()) {
    await decline.first().click().catch(() => {});
    await expect(decline).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
  }
}

test.beforeEach(async ({ page }) => {
  await stubWhitefieldNavigationNode(page);
});

test.describe('#2419 PR-1 — committed POLYGON scope chip', () => {
  for (const [label, viewport] of [
    ['desktop 1366x768', DESKTOP],
    ['mobile 390x844', MOBILE],
  ] as const) {
    test(`names the scope "Drawn area" and offers Return — ${label}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await page.goto(committedPolygonUrl());

      // Issue #2478 moved the scope surface off the map canvas and into the
      // panel's scope bar. Unlike the retired map-overlay chip, the panel
      // renders in the default mobile LIST presentation, so — verified here,
      // not assumed — no Map-view switch is needed to reach it on mobile.
      // `.leaflet-container` is still absent from the DOM in mobile List view
      // (panel and map are mutually exclusive below the lg breakpoint), so
      // assertAppActuallyLoaded (which waits on the map) only applies where
      // the map is guaranteed to be mounted: desktop, where panel and map
      // render side-by-side. On mobile the scope-bar assertion below is
      // itself the load proof — it cannot pass vacuously, since it requires
      // the element to actually exist and be visible.
      if (viewport.width >= 1024) {
        await assertAppActuallyLoaded(page);
      }

      if (viewport.width >= 1366) {
        // Issue #2729 desktop reskin (>=1366): CompactResultsHeader renders
        // "Properties in your drawn area" and houses the Return action inside
        // ScopeActionsMenu (`scope-actions-menu-trigger`).
        const compactTitle = page.getByTestId('compact-results-title');
        await expect(compactTitle).toBeVisible({ timeout: 30_000 });
        await expect(compactTitle).toContainText(/drawn area/i);
        await expect(page.getByText('Area search', { exact: true })).toHaveCount(0);
        await expect(compactTitle).toBeInViewport();

        await page.getByTestId('scope-actions-menu-trigger').click();
        const returnButton = page.getByTestId('area-panel-scope-bar-return');
        await expect(returnButton).toBeVisible();
        await expect(returnButton).toHaveText(/return to/i);
        await page.keyboard.press('Escape');
      } else {
        const scopeBar = page.getByTestId('area-panel-scope-bar-polygon');
        await expect(scopeBar).toBeVisible({ timeout: 30_000 });
        await expect(scopeBar).toContainText('Drawn area');

        // The retired MapStatsBar wording must not co-exist with the scope bar.
        await expect(page.getByText('Area search', { exact: true })).toHaveCount(0);

        const returnButton = page.getByTestId('area-panel-scope-bar-return');
        await expect(returnButton).toBeVisible();
        await expect(returnButton).toHaveAccessibleName(/return to/i);

        await scopeBar.scrollIntoViewIfNeeded();
        await expect(scopeBar).toBeInViewport();
      }

      await dismissConsentBanner(page);
    });
  }

  test('Return restores the previous AREA_SET by name and pushes one history entry', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(committedPolygonUrl());
    await assertAppActuallyLoaded(page);

    const compactTitle = page.getByTestId('compact-results-title');
    await expect(compactTitle).toBeVisible({ timeout: 20_000 });
    await expect(compactTitle).toContainText(/drawn area/i);

    const historyBefore = await page.evaluate(() => window.history.length);

    await page.getByTestId('scope-actions-menu-trigger').click();
    await page.getByTestId('area-panel-scope-bar-return').click();

    // The prior scope is restored BY NAME from rprev, not re-derived from the camera.
    await expect(page).toHaveURL(/rscope=areas/, { timeout: 10_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('rscope')).toBe('areas');
    expect(url.searchParams.get('rareas')).toBe(`${WHITEFIELD},${VARTHUR}`);
    expect(url.searchParams.get('rpoly')).toBeNull();

    // A scope-boundary transition is undoable — exactly one PUSH.
    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore + 1);

    await expect(page.getByTestId('area-panel-scope-bar-polygon')).toHaveCount(0);
  });
});

/**
 * PR review at head 9f061dcc, MUST-HAVE regression. The probe endpoint is
 * authenticated, so an anonymous shopper gets 401 and the verdict is
 * unobtainable. An earlier revision treated that as permission to commit,
 * which put an unvalidated POLYGON into the URL and history — the exact
 * ordering the pre-commit probe exists to prevent.
 *
 * Both arms below assert the SIDE EFFECT (URL and history untouched) rather
 * than a UI string, because that is the actual contract.
 */
test.describe('#2419 PR-1 — an unobtainable verdict never commits', () => {
  test.beforeEach(async ({ page }) => {
    await mockLocalSupabaseUserSession(page);
  });

  for (const [label, fulfil] of [
    ['401, the normal anonymous outcome', { status: 401, body: { error: 'Unauthorized' } }],
    ['a 500 from the validation probe', { status: 500, body: { error: 'INTERNAL_ERROR' } }],
  ] as const) {
    test(`leaves the committed scope and history untouched on ${label}`, async ({ page }) => {
      let probeCount = 0;

      await page.route('**/api/discover/listings**', async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('polygon')) {
          probeCount += 1;
          await route.fulfill({
            status: fulfil.status,
            contentType: 'application/json',
            body: JSON.stringify(fulfil.body),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 }),
        });
      });

      await page.setViewportSize(DESKTOP);
      await page.goto(committedAreaSetUrl());
      await assertAppActuallyLoaded(page);

      const historyBefore = await page.evaluate(() => window.history.length);
      await drawPolygonOnMap(page);
      await page.waitForTimeout(3_000);

      // Positive proof the flow actually ran before any negative assertion.
      expect(probeCount).toBeGreaterThan(0);

      const urlAfter = new URL(page.url());
      expect(urlAfter.searchParams.get('rscope')).toBe('areas');
      expect(urlAfter.searchParams.get('rareas')).toBe(`${WHITEFIELD},${VARTHUR}`);
      expect(urlAfter.searchParams.get('rpoly')).toBeNull();
      expect(urlAfter.searchParams.get('rprev')).toBeNull();
      expect(await page.evaluate(() => window.history.length)).toBe(historyBefore);

      await expect(page.locator('.leaflet-container')).toBeVisible();
      await expect(page.getByTestId('area-panel-scope-bar-polygon')).toHaveCount(0);
    });
  }
});

/**
 * Main Agent ruling (owner informed): drawn-area search is a signed-in
 * capability in PR-1, because the anonymous results path
 * (`useDiscoverCityListings`) never sends `polygon` — an anonymous commit
 * would render a "Drawn area" chip over results that were never scoped to the
 * drawn area.
 *
 * Runs with an explicitly EMPTY storage state so the page is genuinely
 * anonymous, rather than an authenticated session with auth stubbed out.
 */
test.describe('#2419 PR-1 — anonymous draw is refused before any request', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('makes no validation request and leaves the URL and history untouched', async ({ page }) => {
    let polygonRequests = 0;
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/discover/') && url.includes('polygon=')) {
        polygonRequests += 1;
      }
    });

    await page.setViewportSize(DESKTOP);
    await page.goto(committedAreaSetUrl());
    await assertAppActuallyLoaded(page);

    // Proves the session really is anonymous. Without this the test could pass
    // while signed in, with something else blocking the draw.
    await expect(page.getByText(/^sign in$/i).first()).toBeVisible({ timeout: 20_000 });

    const historyBefore = await page.evaluate(() => window.history.length);
    await drawPolygonOnMap(page);
    await page.waitForTimeout(3_000);

    expect(polygonRequests).toBe(0);

    const urlAfter = new URL(page.url());
    expect(urlAfter.searchParams.get('rscope')).toBe('areas');
    expect(urlAfter.searchParams.get('rareas')).toBe(`${WHITEFIELD},${VARTHUR}`);
    expect(urlAfter.searchParams.get('rpoly')).toBeNull();
    expect(urlAfter.searchParams.get('rprev')).toBeNull();
    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore);

    await expect(page.getByTestId('area-panel-scope-bar-polygon')).toHaveCount(0);

    await dismissConsentBanner(page);
  });
});

test.describe('#2419 PR-1 — #2420 rejection preserves the previous scope', () => {
  test.beforeEach(async ({ page }) => {
    await mockLocalSupabaseUserSession(page);
  });

  for (const reason of ['polygon_scope_too_broad', 'polygon_outside_searchable_city'] as const) {
    test(`a ${reason} response never writes the URL`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);

      let probeCount = 0;

      await page.route('**/api/discover/listings**', async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('polygon')) {
          probeCount += 1;
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: reason }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 }),
        });
      });

      await page.goto(committedAreaSetUrl());
      await assertAppActuallyLoaded(page);

      const historyBefore = await page.evaluate(() => window.history.length);

      await drawPolygonOnMap(page);

      // Give the probe time to run and be rejected.
      await page.waitForTimeout(3_000);

      // Positive proof the flow actually ran before any negative assertion.
      expect(probeCount).toBeGreaterThan(0);

      const urlAfter = new URL(page.url());
      expect(urlAfter.searchParams.get('rscope')).toBe('areas');
      expect(urlAfter.searchParams.get('rareas')).toBe(`${WHITEFIELD},${VARTHUR}`);
      expect(urlAfter.searchParams.get('rpoly')).toBeNull();
      expect(urlAfter.searchParams.get('rprev')).toBeNull();
      expect(await page.evaluate(() => window.history.length)).toBe(historyBefore);

      // Positive counterpart: the map is still alive and no POLYGON scope bar appeared.
      await expect(page.locator('.leaflet-container')).toBeVisible();
      await expect(page.getByTestId('area-panel-scope-bar-polygon')).toHaveCount(0);
    });
  }
});
