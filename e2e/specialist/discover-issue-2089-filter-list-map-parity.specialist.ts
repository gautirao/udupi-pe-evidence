/**
 * Issue #2089 (PR #2141, code-review follow-up) — bounded-Browse filter
 * reachability, PROVEN by an automated Playwright spec instead of a manual/
 * prose claim in a PR comment.
 *
 * A PR reviewer bot correctly flagged that the "select a filter chip in List
 * view -> narrows results -> Map view shows the same filtered set -> back to
 * List keeps the filter" journey had only been verified by a live-browser
 * agent narrating the steps in a PR comment, not by a committed automated
 * assertion. Per this repo's CLAUDE.md §11 evidence-quality rule, a manual
 * claim cannot substitute for an automated one when an automated one is
 * feasible — this file closes that gap.
 *
 * FIXTURE (reused verbatim from `issue-2089-marker-swap-fixture.spec.ts`,
 * whose module doc documents the full provenance/geometry):
 *   `a:IN|KA|Bengaluru|RR Nagar` (AREA leaf) carries exactly TWO LIVE
 *   listings from `navigation-hierarchy-fixture-listings-seed.sql`:
 *     - `f1956005-...0001` — property_type='apartment'
 *     - `f1956005-...0009` — property_type='house', offset +300m EAST of
 *       ...0001 so it renders as a second, independently hit-testable
 *       `property-marker` DOM node at the leaf's fitBounds zoom (16),
 *       comfortably outside leaflet.markercluster's maxClusterRadius.
 *   This gives a DETERMINISTIC 2-total / 1-apartment split: selecting the
 *   "Apartments" quick-chip (`AreaSelectedPanel.tsx`, `quick-chip-apartment`,
 *   unchanged by this PR) narrows the List from 2 cards to exactly 1
 *   (listing ...0001), and the Map view at the same node must then show
 *   exactly 1 `property-marker` (listing ...0001's), not 2.
 *
 * Backend requirement: this spec REQUIRES the local fixture backend stack
 * (`./scripts/dev/local-fixture-backend.sh` — local PostGIS fixture DB +
 * hosted Supabase Auth), NOT the real/hosted-dev-DB server. The RR Nagar
 * fixture listings only exist in the seeded fixture DB.
 *
 * Run:
 *   npm run test:e2e:specialist
 */
import { test, expect } from './support/specialist-test';
import type { Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const RR_NAGAR_APARTMENT_LISTING_ID = 'f1956005-0000-0000-0000-000000000001';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

/** Navigates straight to the RR Nagar AREA leaf in (default) List view. */
async function gotoAreaLeafListMode(page: Page): Promise<void> {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_RR_NAGAR)}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });
}

function propertyTypeUrlParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('type');
}

test.describe('@integration-ui #2089 — filter chip narrows List, holds through Map, and survives List<->Map round-trip', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('Apartments chip narrows List, Map shows the same filtered marker set, and switching back preserves the filter', async ({
    page,
  }) => {
    await gotoAreaLeafListMode(page);

    // 1. Baseline: both RR Nagar fixture listings are visible, unfiltered.
    const cards = page.getByTestId('listing-card');
    await expect(cards).toHaveCount(2, { timeout: 15_000 });

    const apartmentChip = page.getByTestId('quick-chip-apartment');
    await expect(apartmentChip).toBeVisible();
    await expect(apartmentChip).toHaveAttribute('aria-pressed', 'false');

    // 2. Select the real "Apartments" property-type chip — a genuine click,
    // not a synthesized filter state — and prove the List narrows from 2 to 1.
    await apartmentChip.click();
    await expect(apartmentChip).toHaveAttribute('aria-pressed', 'true');
    await expect(cards).toHaveCount(1, { timeout: 10_000 });
    await expect
      .poll(() => propertyTypeUrlParam(page), 'the URL type= param must reflect the selected filter')
      .toBe('apartment');

    // 3. Switch to Map view — the marker set must be consistent with the
    // filtered List (exactly 1 property-marker, the apartment listing),
    // never the unfiltered 2.
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });

    const markers = page.locator('[data-testid="property-marker"]');
    await expect(markers).toHaveCount(1, { timeout: 15_000 });
    await expect(
      page.locator(
        `[data-listing-id="${RR_NAGAR_APARTMENT_LISTING_ID}"] [data-testid="property-marker"]`,
      ),
      'the single visible marker must be the apartment listing, not the filtered-out house',
    ).toBeVisible();

    // 4. Switch back to List — the filter selection (chip state + URL) and
    // the narrowed count must both be PRESERVED, never silently reverted to
    // the unfiltered 2-card baseline.
    const listButton = page.getByTestId('mobile-map-close-list-button');
    await listButton.click();
    await expect(listButton).toHaveCount(0);
    await expect(mapTrigger).toBeVisible({ timeout: 10_000 });

    await expect(apartmentChip).toHaveAttribute('aria-pressed', 'true');
    await expect(cards).toHaveCount(1, { timeout: 10_000 });
    expect(
      propertyTypeUrlParam(page),
      'the type= filter param must still be set after the List<->Map round-trip',
    ).toBe('apartment');
  });
});
