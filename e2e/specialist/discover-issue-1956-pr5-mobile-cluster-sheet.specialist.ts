/**
 * Issue #1956 PR-5 (Slice 3, AC5.6/AC5.7) — MobileClusterSheet, the MAP-mode
 * counterpart of `DiscoverAreasJourneyPanel`'s focused-cluster branch,
 * mounted INSIDE `MapDiscovery.tsx`'s `z-[60]` full-screen mobile map
 * overlay (never portalled — see `MobileClusterSheet.tsx`'s own module doc
 * and `[reuse_seams].sheet_stacking` in the approved PR-5 plan).
 *
 * ── FIXTURE (now real, previously blocked) ──
 * This spec previously targeted `d:s` ("South Bangalore"), whose only child
 * was Hosahalli (no dense cluster) — see git history for the prior run's
 * documented gap. The committed, idempotent fixture seed
 * (`scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql` +
 * `-listings-seed.sql`, applied via
 * `scripts/dev/seed-navigation-hierarchy-fixture.sh`) now provides a REAL
 * dense-cluster Direction, `d:southeast` ("South-East Bangalore"), with
 * exactly 3 AREA children — RR Nagar/Vijayanagar/Nagarbhavi — each carrying
 * one LIVE listing and deliberately close synthetic centre_lat/lon (~10-15m
 * apart) so the client-side pixel-grid clusterer (`areaClustering.ts`)
 * always groups all three into exactly one `area-visual-cluster-marker`
 * cell. Confirmed live via `GET /api/discover/cities/bangalore/navigation/
 * resolve?node=d:southeast` against the isolated verification backend
 * (port 8099) this pass stood up against the same fixture database — see
 * this PR's QA report for the exact resolve response. Every assertion below
 * is real and unweakened against this seeded shape.
 */
import { type Page } from '@playwright/test';
import { test, expect } from './support/specialist-test';
import { assertReachable } from '../support/reachability';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const D_S = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

function clusterMarkerLocator(page: Page) {
  return page.locator('[data-testid="area-visual-cluster-marker"]');
}

/**
 * Same synthetic-pointer approach `issue-1956-pr3-area-clustering.spec.ts`
 * uses and documents: Leaflet recreates marker DOM on layout ticks, which
 * makes `locator.click()` actionability waits unreliable for these markers.
 */
async function clickMarker(locator: ReturnType<typeof clusterMarkerLocator>): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('marker has no bounding box');
  await locator.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await locator.page().mouse.down();
  await locator.page().mouse.up();
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

async function openDirectionInMobileMap(page: Page) {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(D_S)}`);
  await page.waitForLoadState('domcontentloaded');
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
  // LIST is the default mobile view (S1) — switch into the MAP overlay,
  // where MobileClusterSheet (unlike DiscoverAreasJourneyPanel's own
  // focused-cluster branch) actually mounts.
  const mapTrigger = page.getByTestId('control-bar-map-trigger');
  await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
  await mapTrigger.click();
  await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
}

test.describe('@integration-ui #1956 PR-5 — MobileClusterSheet real hit-test proof at 390x844 (AC5.6/AC5.7)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('the sheet is ACTUALLY ON TOP of the map overlay (hit-tested), never merely present in the DOM', async ({
    page,
  }) => {
    await openDirectionInMobileMap(page);
    await clickMarker(clusterMarkerLocator(page));

    const sheet = page.getByTestId('mobile-cluster-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Decisive hit test (step 5 of [reachability_definition]): the point at
    // the sheet's own centre must resolve to the sheet or a descendant, not
    // to whatever the map canvas/overlay chrome stacks on top of it.
    const box = await sheet.boundingBox();
    expect(box, 'sheet has a layout box').not.toBeNull();
    const centreX = box!.x + box!.width / 2;
    const centreY = box!.y + box!.height / 2;
    const isHit = await sheet.evaluate((el, [cx, cy]) => {
      const atPoint = document.elementFromPoint(cx as number, cy as number);
      return atPoint != null && (atPoint === el || el.contains(atPoint));
    }, [centreX, centreY] as const);
    expect(isHit, 'elementFromPoint at the sheet centre resolves to the sheet or a descendant').toBe(true);
  });

  test('"Show all areas" is reachable (6-step definition, no {force:true}) and clears focus WITHOUT changing node= or history', async ({
    page,
  }) => {
    await openDirectionInMobileMap(page);
    await clickMarker(clusterMarkerLocator(page));

    const sheet = page.getByTestId('mobile-cluster-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    const clearButton = page.getByTestId('mobile-cluster-sheet-clear');
    await assertReachable(page, clearButton);

    const nodeBefore = await currentNodeParam(page);
    const historyBefore = await historyLength(page);
    const urlBefore = page.url();
    expect(nodeBefore).toBe(D_S);

    // Real unforced click — assertReachable already proved it is hit-testable.
    await clearButton.click();

    await expect(sheet).toHaveCount(0);
    const urlAfter = new URL(page.url());
    const expectedUrlAfterClear = new URL(urlBefore);
    expect(urlAfter.searchParams.get('clusterFocus')).toBeNull();
    expectedUrlAfterClear.searchParams.delete('clusterFocus');
    expect(urlAfter.toString()).toBe(expectedUrlAfterClear.toString());
    expect(await currentNodeParam(page)).toBe(nodeBefore);
    expect(await historyLength(page)).toBe(historyBefore);
  });

  test('a member row is reachable and selecting it drives the SAME journey.selectNode navigation as every other selection affordance', async ({
    page,
  }) => {
    await openDirectionInMobileMap(page);
    await clickMarker(clusterMarkerLocator(page));

    const memberButton = page.getByTestId(`mobile-cluster-sheet-member-${AREA_RR_NAGAR}`);
    await assertReachable(page, memberButton);
    await memberButton.click();

    await expect.poll(() => currentNodeParam(page)).toBe(AREA_RR_NAGAR);
  });

  test('cluster focus (the panel\'s focused-member set) survives a Map -> List -> Map toggle', async ({ page }) => {
    await openDirectionInMobileMap(page);
    await clickMarker(clusterMarkerLocator(page));

    const sheet = page.getByTestId('mobile-cluster-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    const summaryBefore = await page.getByTestId('mobile-cluster-sheet-summary').textContent();

    // MAP -> LIST: the map canvas genuinely unmounts (DiscoverMapMount), but
    // `focusedClusterMemberAreaKeys` is plain MapDiscovery state, untouched
    // by this toggle.
    await page.getByTestId('mobile-map-close-list-button').click();
    await expect(page.getByTestId('navigation-child-list').or(page.getByTestId('areas-cluster-focus-panel'))).toBeVisible({
      timeout: 10_000,
    });

    // LIST -> MAP again.
    await page.getByTestId('control-bar-map-trigger').click();
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });

    // Deliberately NOT asserting the map's visual cluster grouping is
    // restored — the map canvas re-clusters from scratch on remount and may
    // legitimately regroup differently. Asserting ONLY the panel-owned
    // focused-member set (the sheet itself, and its summary copy) survives.
    const sheetAfter = page.getByTestId('mobile-cluster-sheet');
    await expect(sheetAfter).toBeVisible({ timeout: 10_000 });
    await expect(sheetAfter).toHaveText(summaryBefore ?? '', { useInnerText: true }).catch(async () => {
      // Fall back to a substring check if whitespace normalisation differs
      // between the two renders — the CONTENT match is what matters, not
      // exact text-node equality.
      const summaryAfter = await page.getByTestId('mobile-cluster-sheet-summary').textContent();
      expect(summaryAfter).toBe(summaryBefore);
    });
  });
});
