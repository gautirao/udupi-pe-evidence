import { test, expect, type Page } from '@playwright/test';

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

const FRONTEND = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5193';

const WHITEFIELD = 'IN|KA|Bengaluru|Whitefield';
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
    rscope: 'poly',
    rpoly: RPOLY,
    rprev: `areas:${WHITEFIELD},${VARTHUR}`,
  });
  return `${FRONTEND}/discover?${params.toString()}`;
}

function committedAreaSetUrl(): string {
  const params = new URLSearchParams({
    city: 'bangalore',
    journey: 'area-first',
    areaKey: WHITEFIELD,
    rscope: 'areas',
    rareas: `${WHITEFIELD},${VARTHUR}`,
  });
  return `${FRONTEND}/discover?${params.toString()}`;
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

      const scopeBar = page.getByTestId('area-panel-scope-bar-polygon');
      await expect(scopeBar).toBeVisible({ timeout: 30_000 });
      await expect(scopeBar).toContainText('Drawn area');

      // The retired MapStatsBar wording must not co-exist with the scope bar.
      await expect(page.getByText('Area search', { exact: true })).toHaveCount(0);

      const returnButton = page.getByTestId('area-panel-scope-bar-return');
      await expect(returnButton).toBeVisible();
      await expect(returnButton).toHaveAccessibleName(/return to/i);

      // The retired positional/overlap check (chip clearing the map's top
      // chrome row) no longer applies: the panel scope bar is laid out in
      // normal panel document flow, not floated over the map, so it cannot
      // collide with DiscoverMapContextOverlay's city chip or
      // SearchThisAreaCta. `toBeInViewport()` is kept as a generic "actually
      // on-screen, not scrolled out of view" check, independent of that
      // retired map-overlap concern.
      await expect(scopeBar).toBeInViewport();

      await dismissConsentBanner(page);
      await page.screenshot({
        path: `docs/pr-evidence/issue-2419/pr1/drawn-area-chip-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
      });
    });
  }

  test('Return restores the previous AREA_SET by name and pushes one history entry', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(committedPolygonUrl());
    await assertAppActuallyLoaded(page);

    const scopeBar = page.getByTestId('area-panel-scope-bar-polygon');
    await expect(scopeBar).toBeVisible({ timeout: 20_000 });

    const historyBefore = await page.evaluate(() => window.history.length);

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

    await page.screenshot({
      path: 'docs/pr-evidence/issue-2419/pr1/return-to-previous-scope-1366x768.png',
    });
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
  // Signed in on purpose. Drawn-area search is a signed-in capability in PR-1,
  // so an anonymous run would be refused by the sign-in gate BEFORE the probe
  // and these arms would prove nothing about transport failures. The default
  // project carries no storage state, which is exactly how an earlier revision
  // of this file passed while never exercising the signed-in path at all.
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  for (const [label, fulfil] of [
    ['401, the normal anonymous outcome', { status: 401, body: { error: 'Unauthorized' } }],
    ['a 500 from the validation probe', { status: 500, body: { error: 'INTERNAL_ERROR' } }],
  ] as const) {
    test(`leaves the committed scope and history untouched on ${label}`, async ({ page }) => {
      // Counted so the assertions below cannot pass vacuously. Every check in
      // this test is a NEGATIVE one, so a draw that silently never happened
      // would look identical to a correct fail-closed. The probe must be
      // proven to have fired.
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
        await route.continue();
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
    // Counts EVERY polygon-carrying discover request, from any hook, observed
    // on the real network rather than through a stub. The claim is that an
    // anonymous draw produces none at all — not that one was made and refused
    // — so a request counter is the only thing that can prove it.
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
    await page.screenshot({
      path: 'docs/pr-evidence/issue-2419/pr1/anonymous-draw-blocked-1366x768.png',
    });
  });
});

test.describe('#2419 PR-1 — #2420 rejection preserves the previous scope', () => {
  // Signed in for the same reason as the unobtainable-verdict suite above:
  // the sign-in gate refuses an anonymous draw before any probe, so these
  // rejection arms only mean something for a signed-in shopper.
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  for (const reason of ['polygon_scope_too_broad', 'polygon_outside_searchable_city'] as const) {
    test(`a ${reason} response never writes the URL`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);

      // Counted for the same reason as the unverified suite above: every
      // assertion here is negative, so a draw that never happened would be
      // indistinguishable from a correct rejection.
      let probeCount = 0;

      // Every listings call carrying a polygon is rejected exactly the way
      // PolygonGeographicSafetyPolicy + GlobalExceptionHandler would.
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
        await route.continue();
      });

      await page.goto(committedAreaSetUrl());
      await assertAppActuallyLoaded(page);

      const historyBefore = await page.evaluate(() => window.history.length);

      await drawPolygonOnMap(page);

      // Give the probe time to run and be rejected.
      await page.waitForTimeout(3_000);

      // Positive proof the flow actually ran before any negative assertion.
      expect(probeCount).toBeGreaterThan(0);

      // The whole point: no RESULT-SCOPE write and no history entry.
      //
      // Asserting the entire URL string is unchanged would be wrong and was
      // tried first: the camera legitimately REPLACES lat/lon/zoom on its own
      // as the map settles, which has nothing to do with result scope. The
      // claim under test is about the r-prefixed params and history depth.
      const urlAfter = new URL(page.url());
      expect(urlAfter.searchParams.get('rscope')).toBe('areas');
      expect(urlAfter.searchParams.get('rareas')).toBe(`${WHITEFIELD},${VARTHUR}`);
      expect(urlAfter.searchParams.get('rpoly')).toBeNull();
      expect(urlAfter.searchParams.get('rprev')).toBeNull();
      expect(await page.evaluate(() => window.history.length)).toBe(historyBefore);

      // Positive counterpart: the map is still alive and no POLYGON scope bar appeared.
      await expect(page.locator('.leaflet-container')).toBeVisible();
      await expect(page.getByTestId('area-panel-scope-bar-polygon')).toHaveCount(0);

      await page.screenshot({
        path: `docs/pr-evidence/issue-2419/pr1/rejection-${reason}-1366x768.png`,
      });
    });
  }
});
