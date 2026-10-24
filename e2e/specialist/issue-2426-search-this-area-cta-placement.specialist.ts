/**
 * E2E: Issue #2426 — "Search this area" CTA positioned clear of the
 * breadcrumb/navigation chrome, while preserving #2015's first-pan
 * activation behaviour unchanged.
 *
 * Follow-up to #2015/PR #2425 (merged, core VIEWPORT activation accepted as
 * correct via live manual testing). This spec covers the PLACEMENT gap: the
 * CTA (previously fixed at `top-4`, same row as the breadcrumb) must render
 * below the real measured bottom edge of DiscoverMapContextOverlay's
 * breadcrumb (and, when present, AreaSetChips's chip strip), at both a
 * desktop and a mobile viewport, asserted via real bounding-box geometry
 * (not just a screenshot) so a future regression fails deterministically.
 *
 * Uses a real local dev stack (backend + seeded Bangalore fixture data) —
 * no route mocks, per this repo's E2E convention. Reuses the same
 * area-first-journey-to-committed-AREA_SET setup and real-mouse-event pan
 * helper as e2e/issue-2015-search-this-area-viewport.spec.ts.
 *
 * Targets d:southeast -> RR Nagar (a direct AREA child, no intermediate
 * CLUSTER), not Koramangala/Central — the ephemeral local smoke fixture
 * (scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql) never seeds a
 * Central/Koramangala node; d:southeast/d:northeast/d:southwest and their
 * real AREA leaves are all it actually contains.
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/issue-2426-search-this-area-cta-placement.spec.ts
 * Prerequisites: PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL pointing at a running
 * dev stack with the seeded Bangalore fixture.
 */

import { test, expect } from './support/specialist-test';
import type { Page, Locator } from '@playwright/test';

const CITY = 'bangalore';
const D_SOUTHEAST = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';

const DESKTOP_VIEWPORT = { width: 1366, height: 768 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/** Same journey pattern as e2e/issue-2015-search-this-area-viewport.spec.ts's reachCommittedKoramangalaAreaSet — see its own doc for the rationale. Retargeted onto a node this fixture actually contains (see module doc above). */
async function reachCommittedRRNagarAreaSet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
  await page.goto(`/discover?city=${CITY}&journey=area-first`);
  await page.waitForLoadState('domcontentloaded');

  const panelShell = page.getByTestId('discover-areas-journey-panel-shell');
  await expect(panelShell, 'areas journey panel shell should render').toBeVisible({ timeout: 15_000 });
  await declineConsentBannerIfPresent(page);

  const directionCard = panelShell.getByTestId(`navigation-child-card-${D_SOUTHEAST}`);
  await expect(directionCard, 'South-East Bangalore direction card should render').toBeVisible({ timeout: 15_000 });
  await directionCard.click();
  await expect(page, 'navigating into South-East Bangalore direction').toHaveURL(
    new RegExp(`node=${encodeURIComponent(D_SOUTHEAST)}`),
    { timeout: 10_000 },
  );

  const areaCard = panelShell.getByTestId(`navigation-child-card-${AREA_RR_NAGAR}`);
  await expect(areaCard, 'RR Nagar area card should render').toBeVisible({ timeout: 15_000 });
  await areaCard.click();

  await expect
    .poll(() => urlParam(page, 'rscope'), { message: 'committing RR Nagar should set rscope=areas', timeout: 10_000 })
    .toBe('areas');
  expect(urlParam(page, 'rareas'), 'rareas should carry the RR Nagar area key').toBe(AREA_RR_NAGAR_KEY);
  await declineConsentBannerIfPresent(page);
  // Allow the programmatic camera fitBounds + debounced mapBbox settle for RR Nagar to complete
  // before user pan gestures begin.
  await page.waitForTimeout(1000);
}

/** Same real-mouse-event pan helper as e2e/issue-2015-search-this-area-viewport.spec.ts — see its own doc. */
async function panMap(page: Page, dx: number, dy: number): Promise<void> {
  const mapContainer = page.locator('.leaflet-container').first();
  const box = await mapContainer.boundingBox();
  if (!box) throw new Error('leaflet container has no bounding box');
  const startX = box.x + box.width * 0.65;
  const startY = box.y + box.height * 0.65;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + (dx * i) / steps, startY + (dy * i) / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
}

async function panUntilCtaVisible(page: Page, ctaButton: Locator): Promise<void> {
  // Keep each drag strictly inside the map container bounds on both desktop (683px map width)
  // and mobile (390px map width) so mousemove coordinates never go negative or leave the viewport.
  const dx = -150;
  const dy = -120;
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await ctaButton.isVisible().catch(() => false)) return;
    await panMap(page, dx, dy);
  }
  await expect(ctaButton, 'CTA should appear once the pan drifts the viewport past tolerance').toBeVisible({
    timeout: 5_000,
  });
}

function boxesIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * The area-first journey (used by reachCommittedRRNagarAreaSet) resolves a
 * canonicalNavigationNode once a real node is committed, so
 * DiscoverMapContextOverlay renders its highest-priority AreasBreadcrumbTrail
 * branch (testId="areas-breadcrumb-trail") — not the legacy
 * map-group-breadcrumb/area-first-landing-breadcrumb fallback branches, which
 * only fire when no canonical node is resolved. Cover all three so this
 * selector survives either journey shape.
 */
function breadcrumbLocator(page: Page): Locator {
  return page
    .getByTestId('areas-breadcrumb-trail')
    .or(page.getByTestId('map-group-breadcrumb'))
    .or(page.getByTestId('area-first-landing-breadcrumb'));
}

/**
 * Full required lifecycle sequence (owner ruling on #2426): initial hidden ->
 * first genuine pan -> visible (no overlap with breadcrumb/AreaSetChips/List
 * button) -> commit VIEWPORT -> hidden -> resize/invalidateSize/moveend ->
 * still hidden -> next genuine pan -> visible.
 */
async function runFullLifecycleWithEvidence(
  page: Page,
  prefix: 'desktop' | 'mobile',
  extraOverlapChecks?: (ctaBox: { x: number; y: number; width: number; height: number }) => Promise<void>,
): Promise<void> {
  const ctaButton = page.getByRole('button', { name: /search this area/i });

  // 1. Initial: committed AREA_SET, no drift yet — CTA hidden.
  await expect(ctaButton, 'CTA must not render before the viewport has drifted (AC1, unchanged from #2015)').not.toBeVisible();

  // 2. First genuine pan — CTA visible, clear of breadcrumb/AreaSetChips/List button.
  await panUntilCtaVisible(page, ctaButton);
  const breadcrumb = breadcrumbLocator(page);
  const breadcrumbBox = await breadcrumb.first().boundingBox();
  let ctaBox = await ctaButton.boundingBox();
  expect(breadcrumbBox, 'breadcrumb must be visible to compare against').not.toBeNull();
  expect(ctaBox, 'CTA must be visible to compare against').not.toBeNull();
  if (breadcrumbBox && ctaBox) {
    expect(
      boxesIntersect(ctaBox, breadcrumbBox),
      `CTA bounding box must not overlap the breadcrumb bounding box (${prefix})`,
    ).toBe(false);
  }
  const chipsRow = page.getByTestId('area-set-chips');
  if (await chipsRow.isVisible().catch(() => false)) {
    const chipsBox = await chipsRow.boundingBox();
    if (chipsBox && ctaBox) {
      expect(
        boxesIntersect(ctaBox, chipsBox),
        `CTA bounding box must not overlap the AreaSetChips strip (${prefix})`,
      ).toBe(false);
    }
  }
  if (extraOverlapChecks && ctaBox) {
    await extraOverlapChecks(ctaBox);
  }

  // 3. Commit VIEWPORT — CTA hides.
  await ctaButton.click();
  await expect
    .poll(() => urlParam(page, 'rscope'), { message: 'activation should commit rscope=vp', timeout: 10_000 })
    .toBe('vp');
  await expect(ctaButton, 'CTA must hide right after activation').not.toBeVisible({ timeout: 5_000 });

  // 4. Layout resize (ResizeObserver -> invalidateSize -> debounced moveend, no user pan/zoom) — CTA must stay hidden (#2426 resize-veto fix).
  const originalViewport = page.viewportSize() ?? DESKTOP_VIEWPORT;
  await page.setViewportSize({ width: originalViewport.width - 100, height: originalViewport.height });
  await page.waitForTimeout(600);
  await page.setViewportSize(originalViewport);
  await page.waitForTimeout(600);
  await expect(
    ctaButton,
    'a layout resize must NOT re-show "Search this area" with no user pan/zoom (#2426 resize-veto fix)',
  ).not.toBeVisible({ timeout: 5_000 });

  // 5. Next genuine pan — CTA visible again (proves the resize-veto is a targeted one-shot, not a blanket suppression).
  await panUntilCtaVisible(page, ctaButton);
  ctaBox = await ctaButton.boundingBox();
  const breadcrumbBox2 = await breadcrumb.first().boundingBox();
  if (breadcrumbBox2 && ctaBox) {
    expect(
      boxesIntersect(ctaBox, breadcrumbBox2),
      `CTA bounding box must not overlap the breadcrumb bounding box after the second pan (${prefix})`,
    ).toBe(false);
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('@integration-ui #2426 — "Search this area" CTA placement', () => {
  test('desktop 1366x768: full lifecycle (hidden -> pan -> visible -> commit -> resize -> pan) with no breadcrumb/chip overlap', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await reachCommittedRRNagarAreaSet(page);
    await runFullLifecycleWithEvidence(page, 'desktop');
  });

  test('mobile 390x844: full lifecycle (hidden -> pan -> visible -> commit -> resize -> pan) with no breadcrumb/chip/List-button overlap', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await reachCommittedRRNagarAreaSet(page);

    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger, 'mobile Map trigger should be reachable from the committed AREA_SET panel').toBeVisible({
      timeout: 15_000,
    });
    await mapTrigger.click();

    const closeListButton = page.getByTestId('mobile-map-close-list-button');
    await expect(closeListButton, 'mobile Map overlay should be open').toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);

    await runFullLifecycleWithEvidence(page, 'mobile', async (ctaBox) => {
      const mapListButtonBox = await closeListButton.boundingBox();
      if (mapListButtonBox) {
        expect(
          boxesIntersect(ctaBox, mapListButtonBox),
          'CTA bounding box must not overlap the mobile Map/List toggle control',
        ).toBe(false);
      }
    });
  });

  test('desktop: clicking the Leaflet zoom-in control after a resize still allows the CTA to reappear on the next pan (#2426 fix cycle 2)', async ({
    page,
  }) => {
    // Team-lead review (#2426 fix cycle 2) — the resize-veto's original
    // cleared-by set (dragstart/wheel/touchstart) missed the Leaflet
    // zoom +/- control (a plain button click, no drag/wheel/touch signal),
    // so a shopper who resized then clicked zoom-in would see the veto
    // wrongly still armed and no CTA on their next pan — a regression
    // against #2015's "first material user pan/zoom" activation contract.
    // Drives the REAL Leaflet zoom control in a real browser (not a
    // simulated click) to prove the fix.
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await reachCommittedRRNagarAreaSet(page);

    const ctaButton = page.getByRole('button', { name: /search this area/i });
    await panUntilCtaVisible(page, ctaButton);
    await ctaButton.click();
    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'activation should commit rscope=vp', timeout: 10_000 })
      .toBe('vp');
    await expect(ctaButton, 'CTA must hide right after activation').not.toBeVisible({ timeout: 5_000 });
    // Let activation's own commit (URL write + any camera settle it
    // triggers) fully finish before starting the resize sequence below —
    // runFullLifecycleWithEvidence's equivalent step naturally gets this
    // headroom from its own intermediate screenshot/overlap-check awaits;
    // this test skips straight to the resize, so it needs the same
    // settle time made explicit instead.
    await page.waitForTimeout(500);

    const originalViewport = page.viewportSize() ?? DESKTOP_VIEWPORT;
    await page.setViewportSize({ width: originalViewport.width - 100, height: originalViewport.height });
    await page.waitForTimeout(600);
    await page.setViewportSize(originalViewport);
    await page.waitForTimeout(600);
    await expect(ctaButton, 'CTA must stay hidden across the layout-only resize').not.toBeVisible({ timeout: 5_000 });

    // The real Leaflet zoom-in control button — clicking it must clear the
    // resize veto so a SUBSEQUENT genuine pan correctly re-shows the CTA.
    const zoomInControl = page.locator('.leaflet-control-zoom-in');
    await expect(zoomInControl, 'Leaflet zoom-in control should render').toBeVisible({ timeout: 10_000 });
    await zoomInControl.click();
    await page.waitForTimeout(500);

    await panUntilCtaVisible(page, ctaButton);
  });
});
