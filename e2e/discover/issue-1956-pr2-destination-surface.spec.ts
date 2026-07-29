/**
 * Issue #1956 PR-2 — Destination surface (Slice 3, AC3.1/AC3.4/AC3.5/AC3.8/AC3.9).
 *
 * Validates the PR-2 CONSUMER/UI against a FIXTURE-ONLY deterministic
 * promoted shallow tree (not the recursive navigation-tree generator — see
 * the sibling guarded-hierarchy-back spec's module doc for the full ground
 * truth and the [user_rulings_2026_07_29_cycle1].generator_and_fixture
 * ruling). Seeded shape used here:
 *
 *   root -> d:w "West Bangalore" -> AREA children DIRECTLY (Basaveshwara
 *           Nagar, Binnipete) — no Local Destination level (AC3.8).
 *        -> d:e "East Bangalore" -> CLUSTER "Domlur & C V Raman Nagar"
 *           (a genuine Local Destination level, AC3.5) -> AREA children.
 *
 * Map markers only exist at the DIRECTION (root) level in this build — CLUSTER
 * and AREA children have no legitimate position source in the current payload
 * (documented, non-defect limitation: `[known_data_gap_2026_07_29]` in the
 * approved handoff). AC3.9's map-click half is therefore exercised at the
 * root level only, which is exactly where a marker exists to click.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;

const D_W = 'd:w';
const D_E = 'd:e';
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';
const AREA_BINNIPETE = 'a:IN|KA|Bengaluru|Binnipete';
const CLUSTER_DOMLUR = 'c:e:in-ka-bengaluru-c-v-raman-nagar-in-ka-bengaluru-domlur-layout';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

function markerLocator(page: Page, nodeKey: string) {
  return page.locator(`[data-testid="area-destination-marker"][data-node-key="${nodeKey}"]`);
}

/**
 * Leaflet recreates each marker's DOM element on layout-affecting events
 * (`layoutTick`/ResizeObserver in `AreaDestinationMarkerLayer`), which makes
 * Playwright's higher-level `locator.click()` actionability wait (element
 * stability across frames) unreliable for this specific marker — confirmed
 * directly: a real synthetic mouse move/down/up at the marker's own bounding
 * box centre DOES navigate correctly, while `locator.click()` on the exact
 * same element intermittently no-ops. This helper drives the real click via
 * `page.mouse`, which is what a real user's click physically is, rather than
 * weakening the assertion that follows it.
 */
async function clickMarker(page: Page, nodeKey: string): Promise<void> {
  const marker = markerLocator(page, nodeKey);
  await expect(marker).toBeVisible();
  const box = await marker.boundingBox();
  if (!box) {
    throw new Error(`marker for ${nodeKey} has no bounding box`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

async function openRoot(page: Page) {
  await page.goto(`/discover?${BASE}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
}

test.describe('@integration-ui #1956 PR-2 — city root destination surface (AC3.1)', () => {
  test('city root renders 3-5 (here: 2, the full seeded set) promoted Direction destinations on BOTH map and panel, and NO whole-city intermediate marker', async ({
    page,
  }) => {
    await openRoot(page);

    // Positive — the real destination surface rendered, panel side.
    const panelCards = page.getByTestId('navigation-child-list').locator('[role="listitem"]');
    await expect(panelCards).toHaveCount(2);
    await expect(page.getByTestId(cardTestId(D_W))).toBeVisible();
    await expect(page.getByTestId(cardTestId(D_E))).toBeVisible();

    // Positive — the real destination surface rendered, map side.
    const mapMarkers = page.locator('[data-testid="area-destination-marker"]');
    await expect(mapMarkers).toHaveCount(2);
    await expect(markerLocator(page, D_W)).toBeVisible();
    await expect(markerLocator(page, D_E)).toBeVisible();

    // Negative, only now that positive presence is proven: no additional
    // marker/card represents the whole city itself as an intermediate
    // destination (a 3rd, city-level marker/card would fail these counts).
    expect(await mapMarkers.count()).toBe(2);
    expect(await panelCards.count()).toBe(2);
  });
});

test.describe('@integration-ui #1956 PR-2 — panel/map identity and shape (AC3.4/AC3.5/AC3.8)', () => {
  test('AC3.4 — the right-panel heading explicitly names the Direction and shares the same node_key as the map', async ({
    page,
  }) => {
    await openRoot(page);
    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    await expect(page.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', D_W);
    await expect(page.getByTestId('navigation-level-heading')).toContainText('West Bangalore');
  });

  test('AC3.8 — West Bangalore (a small/shallow path) goes DIRECTLY to AREA children, fabricating NO Local Destination level', async ({
    page,
  }) => {
    await openRoot(page);
    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    // Positive: the real AREA children rendered.
    await expect(page.getByTestId(cardTestId(AREA_BASAVESHWARA))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_BINNIPETE))).toBeVisible();
    // Negative: no CLUSTER-typed child card exists at this level (a
    // fabricated Local Destination would show up as a `c:`-prefixed card).
    const clusterCards = page.getByTestId('navigation-child-list').locator('[data-testid^="navigation-child-card-c:"]');
    await expect(clusterCards).toHaveCount(0);
  });

  test('AC3.5 — East Bangalore shows its genuine Local Destination (no more than six), not a direct AREA jump', async ({
    page,
  }) => {
    await openRoot(page);
    await page.getByTestId(cardTestId(D_E)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);

    // Positive: the real Local Destination child rendered.
    await expect(page.getByTestId(cardTestId(CLUSTER_DOMLUR))).toBeVisible();
    await expect(page.getByTestId(cardTestId(CLUSTER_DOMLUR))).toContainText('Domlur & C V Raman Nagar');

    const childCount = await page
      .getByTestId('navigation-child-list')
      .locator('[role="listitem"]')
      .count();
    expect(childCount).toBeGreaterThan(0);
    expect(childCount).toBeLessThanOrEqual(6);

    // Negative: no AREA-typed card leaks directly into the Direction level
    // (that would mean East skipped its real Local Destination level).
    const areaCards = page.getByTestId('navigation-child-list').locator('[data-testid^="navigation-child-card-a:"]');
    await expect(areaCards).toHaveCount(0);
  });
});

test.describe('@integration-ui #1956 PR-2 — map/panel click identity (AC3.9)', () => {
  test('a map marker click and the matching panel-card click dispatch the SAME navigation, converging on identical node= state', async ({
    page,
  }) => {
    await openRoot(page);

    // Path 1: drive via the MAP marker.
    await clickMarker(page, D_E);
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);
    const nodeAfterMapClick = await currentNodeParam(page);
    await expect(page.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', D_E);

    // Reset and drive via the PANEL card for the SAME destination.
    await openRoot(page);
    await page.getByTestId(cardTestId(D_E)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);
    const nodeAfterPanelClick = await currentNodeParam(page);
    await expect(page.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', D_E);

    expect(nodeAfterMapClick).toBe(nodeAfterPanelClick);
  });

  test('hover on a panel card is forwarded to the SAME map marker by node_key (border widens on hover, mirroring the panel-card highlight)', async ({
    page,
  }) => {
    await openRoot(page);
    // The border style lives on the marker's inner styled div, not the
    // `data-testid` div itself.
    const markerCard = markerLocator(page, D_W).locator('div').first();

    // Both start un-highlighted (1px border, isHighlighted=false).
    await expect(markerCard).toHaveCSS('border-width', '1px');

    // Hover the PANEL card — no navigation, so the marker layer stays mounted
    // and we can observe the hover-forwarded highlight on the SAME marker.
    await page.getByTestId(cardTestId(D_W)).hover();
    await expect(markerCard).toHaveCSS('border-width', '2px');

    // Moving off restores the un-highlighted state — proves this is real
    // hover-state forwarding, not a one-way/stuck highlight.
    await page.getByTestId(cardTestId(D_E)).hover();
    await expect(markerCard).toHaveCSS('border-width', '1px');
  });
});
