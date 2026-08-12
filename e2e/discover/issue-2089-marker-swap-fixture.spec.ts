/**
 * Issue #2089 — marker-A -> marker-B swap must survive the pan-preserves-preview
 * fix (BLOCKING finding 3, code review on PR #2141).
 *
 * `issue-2089-pan-preserves-listing-preview.spec.ts`'s own
 * "tapping a different visible marker while the preview is open still
 * replaces the preview (no #2129 regression)" test drove REAL (non-fixture)
 * hosted-dev-DB data and self-skipped whenever the currently-reachable RR
 * Nagar AREA leaf didn't expose 2 independently hit-testable markers — which
 * is not deterministic against live data. Issue #2089's own Definition of
 * Done requires this swap to be PROVEN, not skipped. This file closes that
 * gap by reusing the SAME deterministic fixture-backed setup already proven
 * in `issue-2129-mobile-marker-occlusion.spec.ts`:
 *   - `navigation-hierarchy-fixture-listings-seed.sql` seeds the RR Nagar
 *     AREA leaf (`a:IN|KA|Bengaluru|RR Nagar`) with TWO independently
 *     hit-testable listing markers, `RR_NAGAR_LISTING_ID` (`...0001`) and
 *     `RR_NAGAR_LISTING_B_ID` (`...0009`), each wrapped in a
 *     `[data-listing-id="<id>"]` element around `[data-testid="property-marker"]`
 *     — see that seed file's own header for why (offset far enough apart to
 *     clear leaflet.markercluster's maxClusterRadius at the leaf's fitBounds
 *     zoom, but not so far the chunked-loading marker construction drops it).
 *   - `markerLocatorFor`/`tapMarkerFor` below are duplicated verbatim from
 *     `issue-2129-mobile-marker-occlusion.spec.ts` (not imported — that file
 *     does not export them, matching this directory's existing convention of
 *     each spec file owning its own helpers).
 *
 * This spec targets #2089's fix specifically: `DiscoverMapCanvas.tsx`'s
 * `onClick` background-click-dismiss handler now suppresses the "close the
 * open preview" path for a short window after a viewport change (pan/zoom),
 * to stop a trailing native click from clearing `listing=` post-drag. A real
 * marker-to-marker tap never reaches that background `onClick` at all (it is
 * a click on the marker icon itself, handled by `MarkerClusterLayer`'s own
 * 'click' listener in `PropertyMap.tsx`), so the fix should be structurally
 * inert here — this test proves that empirically rather than by code
 * inspection alone.
 *
 * Backend requirement: this spec REQUIRES the local fixture backend stack
 * (`./scripts/dev/local-fixture-backend.sh` — local PostGIS fixture DB +
 * hosted Supabase Auth), NOT the real/hosted-dev-DB server used by
 * `issue-2089-pan-preserves-listing-preview.spec.ts`'s other tests. Running
 * this file against the real hosted-dev-DB dev server will not reliably
 * expose `RR_NAGAR_LISTING_ID`/`RR_NAGAR_LISTING_B_ID` (they only exist in
 * the seeded fixture DB) and the test will fail to find a second marker.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<fixture-backend-port> npx playwright test \
 *     e2e/discover/issue-2089-marker-swap-fixture.spec.ts --project=full
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const RR_NAGAR_LISTING_ID = 'f1956005-0000-0000-0000-000000000001';
// Second RR Nagar fixture listing (see issue-2129-mobile-marker-occlusion.spec.ts's
// module doc and navigation-hierarchy-fixture-listings-seed.sql's own header).
const RR_NAGAR_LISTING_B_ID = 'f1956005-0000-0000-0000-000000000009';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

function currentListingParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('listing');
}

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

/** Navigates straight to the RR Nagar AREA leaf and enters mobile Map mode, WITHOUT tapping any marker. */
async function gotoAreaLeafMapModeNoPreview(page: Page): Promise<void> {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_RR_NAGAR)}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });

  const mapTrigger = page.getByTestId('control-bar-map-trigger');
  await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
  await mapTrigger.click();
  await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
}

/** The single property marker element for a given listing id — same selector precedent as issue-2129-mobile-marker-occlusion.spec.ts. */
function markerLocatorFor(page: Page, listingId: string): Locator {
  return page.locator(`[data-listing-id="${listingId}"] [data-testid="property-marker"]`);
}

/** Real marker tap (no `force`) on a specific listing's marker. */
async function tapMarkerFor(page: Page, listingId: string): Promise<Locator> {
  const marker = markerLocatorFor(page, listingId);
  await marker.waitFor({ state: 'attached', timeout: 15_000 });
  await marker.click({ timeout: 10_000 });
  return marker;
}

test.describe('@integration-ui #2089 — marker-to-marker swap survives the pan-preserves-preview fix', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('marker A -> preview A -> marker B (no intermediate Close) -> preview B', async ({ page }) => {
    await gotoAreaLeafMapModeNoPreview(page);

    await tapMarkerFor(page, RR_NAGAR_LISTING_ID);
    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => currentListingParam(page)).toBe(RR_NAGAR_LISTING_ID);

    await tapMarkerFor(page, RR_NAGAR_LISTING_B_ID);

    // Business-meaningful assertion: the preview sheet must still be showing
    // (never dismissed) and must now reflect listing B, not listing A — this
    // is exactly the behavior #2089's background-click-dismiss suppression
    // window could regress if it ever mis-fired on a marker-to-marker tap.
    await expect(sheet, 'the sheet must remain open across the marker swap').toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() => currentListingParam(page), 'the URL listing= param must switch to marker B')
      .toBe(RR_NAGAR_LISTING_B_ID);
  });
});
