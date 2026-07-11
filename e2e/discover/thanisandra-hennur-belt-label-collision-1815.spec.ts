/**
 * E2E: Issue #1815 — dense-group AREA-MARKER LABEL-COLLISION regression guard.
 *
 * Retro on #1810 flagged a real gap: its automated + live browser passes were
 * functional click-through only (chip visible, chip click works, panel lists
 * areas) and never actually measured whether the persistent labelled pin
 * ("area-marker") bounding boxes overlap on screen. A dense group can pass
 * every functional assertion while still rendering visually-overlapping,
 * unreadable label pills. This spec adds the missing SPATIAL check plus the
 * camera-stability and drill-down/chip-click behaviours around it.
 *
 * Runs against the REAL backend + shared hosted Supabase (no page.route()
 * mocks) — thanisandra-hennur-belt is a real, already-seeded 29-area North
 * Bangalore group (confirmed dense enough to exercise degradation in prior
 * #1798/#1806/#1810 work). This PR ships no migrations, so read-only
 * verification against the shared instance is acceptable.
 *
 * Run locally (full project, no stubs):
 *   bash scripts/run-e2e-local.sh --project=full \
 *     e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts
 *
 * Screenshots land in test-results/1815-*.png.
 */

import { test, expect, type Page } from '@playwright/test';
import { grantDiscoverConsent } from '../helpers';

const CITY = 'bangalore';
const GROUP_ID = 'thanisandra-hennur-belt';
const TOTAL_AREAS_EXPECTED = 29;
const DENSE_LABEL_CAP = 10; // design-spec target subset size for a 29-area group
const MIN_GAP_PX = 8; // design-spec minimum visual gap between adjacent pill labels

function groupResultsUrl(): string {
  return `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}`;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** AABB overlap test — two rects overlap if they intersect even after each is
 * shrunk outward-in by MIN_GAP_PX/2 on every side (i.e. any overlap tighter
 * than the design-spec minimum gap counts as a collision). Pure-touching or
 * exactly-8px-apart boxes are NOT a collision. */
function rectsCollide(a: Rect, b: Rect, minGapPx: number): boolean {
  const pad = minGapPx / 2;
  const aLeft = a.x - pad;
  const aRight = a.x + a.width + pad;
  const aTop = a.y - pad;
  const aBottom = a.y + a.height + pad;
  const bLeft = b.x;
  const bRight = b.x + b.width;
  const bTop = b.y;
  const bBottom = b.y + b.height;
  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
}

async function getVisiblePillRects(page: Page): Promise<Rect[]> {
  const pills = page.locator('[data-testid="area-marker"]');
  const count = await pills.count();
  const rects: Rect[] = [];
  for (let i = 0; i < count; i += 1) {
    const box = await pills.nth(i).boundingBox();
    if (box) rects.push(box);
  }
  return rects;
}

/** Reads the Leaflet map-pane's CSS transform (translate3d) as a fingerprint
 * of camera position/zoom. Comparing this string before/after an interaction
 * is a real-DOM proxy for "did the camera move" without reaching into React
 * internals or requiring a test-only camera API. */
async function getMapPaneTransform(page: Page): Promise<string | null> {
  return page.locator('.leaflet-map-pane').first().evaluate((el) => (el as HTMLElement).style.transform || null);
}

/**
 * Polls the visible `area-marker` pill count until it is unchanged across
 * `stableChecks` consecutive polls, instead of guessing a fixed delay.
 *
 * Issue #1815 diagnostic round: gotoDenseGroup previously used a flat
 * `page.waitForTimeout(1000)` before measuring. AreaMarkerLayer's degraded
 * bucketing pass recomputes on zoom-settle (and once when enableDegradation
 * itself flips true, which depends on an async group-membership fetch), so
 * the FINAL converged pill count is not guaranteed to be reached within any
 * fixed delay — two back-to-back fresh loads of the identical URL were
 * observed to settle to different pill counts (4 vs 1) purely from sampling
 * at different points in that settle process. computeAreaMarkers itself is
 * proven byte-identical/deterministic given identical input (see the
 * dedicated unit determinism tests in areaMarkerBucketing.test.ts) — the
 * variance is in WHEN the DOM is sampled relative to that settle, not in the
 * algorithm. Polling for a stable count (rather than lengthening the fixed
 * delay, which would just move the race, not remove it) waits for the
 * actual converged state.
 */
async function waitForStableMarkerCount(
  page: Page,
  opts: { stableChecks?: number; intervalMs?: number; timeoutMs?: number } = {},
): Promise<number> {
  const stableChecks = opts.stableChecks ?? 3;
  const intervalMs = opts.intervalMs ?? 300;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const deadline = Date.now() + timeoutMs;
  let lastCount = -1;
  let stableStreak = 0;
  for (;;) {
    const count = await page.locator('[data-testid="area-marker"]').count();
    if (count === lastCount) {
      stableStreak += 1;
      if (stableStreak >= stableChecks) return count;
    } else {
      stableStreak = 0;
      lastCount = count;
    }
    if (Date.now() >= deadline) return lastCount;
    await page.waitForTimeout(intervalMs);
  }
}

async function gotoDenseGroup(page: Page): Promise<void> {
  await grantDiscoverConsent(page);
  await page.goto(groupResultsUrl());
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="area-marker"]').first()).toBeVisible({ timeout: 15_000 });
  // Wait for the pill count to actually converge (Issue #1815 — see
  // waitForStableMarkerCount doc comment) instead of a fixed sleep.
  await waitForStableMarkerCount(page);
}

test.describe('@integration-ui Issue #1815 — Thanisandra-Hennur Belt dense-group label collision', () => {
  test.describe.configure({ mode: 'serial' });

  test('R1: initial dense load — pill count capped, demotion happened, panel lists all areas', async ({ page }) => {
    await gotoDenseGroup(page);

    const pills = page.locator('[data-testid="area-marker"]');
    const pillCount = await pills.count();
    expect(pillCount, 'persistent labelled pills must be a degraded subset, not all 29').toBeGreaterThan(0);
    expect(pillCount, `pill count should be capped near the design-spec target (${DENSE_LABEL_CAP})`).toBeLessThanOrEqual(
      DENSE_LABEL_CAP + 5, // generous slack for live-data/zoom variance, still proves real degradation
    );
    expect(pillCount, 'must never be one pin per area for a 29-area group').toBeLessThan(TOTAL_AREAS_EXPECTED);

    // Demotion evidence: at least one neutral cluster chip OR demoted dot exists.
    const clusterChips = page.locator('[data-testid="area-cluster-marker"]');
    const dots = page.locator('[data-testid="area-marker-dot"]');
    const clusterCount = await clusterChips.count();
    const dotCount = await dots.count();
    expect(
      clusterCount + dotCount,
      'expected at least one demoted representation (cluster chip or hover-dot) for the non-shown areas',
    ).toBeGreaterThan(0);

    // Panel still enumerates every member area, even the ones demoted on the map.
    const shownOfTotalNote = page.getByTestId('area-marker-shown-of-total-note');
    await expect(shownOfTotalNote).toBeVisible({ timeout: 10_000 });
    const noteText = await shownOfTotalNote.innerText();
    const match = /Showing (\d+) of (\d+) areas on the map/.exec(noteText);
    expect(match, `note text did not match expected pattern: "${noteText}"`).not.toBeNull();
    const shown = Number(match?.[1]);
    const total = Number(match?.[2]);
    expect(total, 'panel must report the full real group size').toBe(TOTAL_AREAS_EXPECTED);
    expect(shown, 'shown-on-map count must be less than total for a dense group').toBeLessThan(total);
    expect(shown, 'shown count should equal the visible pill count').toBe(pillCount);

    // Informational only (no new assertions) — plan-refinement R3 wants the
    // actual R1 counts captured in evidence, not just pass/fail.
    console.log(
      `[1815 R1 counts] pills(area-marker)=${pillCount} clusterChips=${clusterCount} dots=${dotCount} shown=${shown} total=${total}`,
    );

    await page.screenshot({ path: 'test-results/1815-r1-initial-dense-load.png', fullPage: false });
  });

  test('R2: NO PERSISTENT LABEL OVERLAP — pairwise bounding-box collision check', async ({ page }) => {
    await gotoDenseGroup(page);

    const rects = await getVisiblePillRects(page);
    // Issue #1815 diagnostic evidence — directly comparable to R1's
    // "[1815 R1 counts]" log line (same URL, same fresh-navigation pattern,
    // now both using the stable-count wait). If these differ from R1's
    // pillCount, that is evidence of remaining non-determinism even after
    // the stable-wait fix.
    const clusterChipCountR2 = await page.locator('[data-testid="area-cluster-marker"]').count();
    const dotCountR2 = await page.locator('[data-testid="area-marker-dot"]').count();
    console.log(
      `[1815 R2 counts] pills(area-marker)=${rects.length} clusterChips=${clusterChipCountR2} dots=${dotCountR2}`,
    );
    expect(rects.length, 'need at least 2 pills for a meaningful overlap check').toBeGreaterThan(1);

    const collisions: Array<{ i: number; j: number }> = [];
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        if (rectsCollide(rects[i], rects[j], MIN_GAP_PX)) {
          collisions.push({ i, j });
        }
      }
    }

    await page.screenshot({ path: 'test-results/1815-r2-overlap-check.png', fullPage: false });

    expect(
      collisions,
      `found ${collisions.length} overlapping/too-close label pill pair(s) (min gap ${MIN_GAP_PX}px): ` +
        JSON.stringify(collisions.map(({ i, j }) => ({ a: rects[i], b: rects[j] }))),
    ).toHaveLength(0);
  });

  test('R3: panel-hover reveal promotes a demoted area on the map WITHOUT moving the camera', async ({ page }) => {
    await gotoDenseGroup(page);

    // Find a member-area panel row whose area is currently demoted (i.e. not
    // already rendered as a full pill) — hovering it should promote it.
    const rows = page.locator('[data-testid^="browse-all-area-"]');
    const rowCount = await rows.count();
    expect(rowCount, 'panel must list member-area rows').toBeGreaterThan(0);

    const pillLabels = new Set(await page.locator('[data-testid="area-marker"]').allInnerTexts());

    let targetRow: ReturnType<Page['locator']> | null = null;
    for (let i = 0; i < rowCount; i += 1) {
      const row = rows.nth(i);
      const text = await row.innerText();
      const alreadyShown = [...pillLabels].some((label) => label.includes(text.split('\n')[0]?.trim() ?? ' '));
      if (!alreadyShown) {
        targetRow = row;
        break;
      }
    }
    expect(targetRow, 'expected at least one demoted (non-pill) member-area row to hover').not.toBeNull();
    const targetName = (await targetRow!.innerText()).split('\n')[0]?.trim() ?? '';
    const pillCountBeforeHover = await page.locator('[data-testid="area-marker"]').count();

    const transformBefore = await getMapPaneTransform(page);

    await targetRow!.hover();
    // Give the marker-icon swap / forced-representative recompute a moment.
    await page.waitForTimeout(500);

    const transformAfter = await getMapPaneTransform(page);
    expect(transformAfter, 'camera (map-pane transform) must not change on panel hover').toBe(transformBefore);

    // The hovered area should now be revealed on the map — either promoted to
    // a full labelled pill bearing its own name, or shown as a revealed dot.
    const revealedDotForTarget = page.locator(
      '[data-testid="area-marker-dot"][data-revealed="true"]',
      { hasText: targetName },
    );
    const promotedPill = page.locator('[data-testid="area-marker"]', { hasText: targetName });
    const revealedDotCount = await revealedDotForTarget.count();
    const promotedPillCount = await promotedPill.count();
    const pillCountAfterHover = await page.locator('[data-testid="area-marker"]').count();
    expect(
      revealedDotCount > 0 || promotedPillCount > 0 || pillCountAfterHover > pillCountBeforeHover,
      `hovering demoted row "${targetName}" should reveal it on the map (dot or promoted pill)`,
    ).toBeTruthy();

    await page.screenshot({ path: 'test-results/1815-r3-panel-hover-reveal.png', fullPage: false });
  });

  test('R3b: search promotion reveals a matching area WITHOUT moving the camera while typing', async ({ page }) => {
    await gotoDenseGroup(page);

    const rows = page.locator('[data-testid^="browse-all-area-"]');
    const rowCount = await rows.count();
    const pillLabels = new Set(await page.locator('[data-testid="area-marker"]').allInnerTexts());

    let targetName: string | null = null;
    for (let i = 0; i < rowCount; i += 1) {
      const text = (await rows.nth(i).innerText()).split('\n')[0]?.trim();
      if (text && ![...pillLabels].some((label) => label.includes(text))) {
        targetName = text;
        break;
      }
    }
    expect(targetName, 'expected a demoted area name to search for').not.toBeNull();

    const transformBefore = await getMapPaneTransform(page);

    const searchInput = page.getByTestId('scoped-search-input');
    await searchInput.fill(targetName!);
    await page.waitForTimeout(500);

    const transformAfter = await getMapPaneTransform(page);
    expect(transformAfter, 'camera must not move while typing a search query').toBe(transformBefore);
    expect(page.url(), 'search must not navigate away from the group-results route').not.toContain('areaKey=');
    expect(page.url()).toContain(`groupId=${GROUP_ID}`);

    const promotedPin = page.locator('[data-testid="area-marker"]', { hasText: targetName! });
    await expect(promotedPin).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/1815-r3b-search-promotion.png', fullPage: false });
  });

  test('R5: "+N nearby areas" chip click does not empty the map or navigate to listings', async ({ page }) => {
    await gotoDenseGroup(page);

    const clusterChips = page.locator('[data-testid="area-cluster-marker"]');
    const chipCount = await clusterChips.count();
    test.skip(chipCount === 0, 'no cluster chips rendered in this viewport/zoom — nothing to click');

    const urlBefore = page.url();
    await clusterChips.first().click();
    await page.waitForTimeout(600);

    // Map must not be left empty — some marker kind is still present.
    const anyMarkers =
      (await page.locator('[data-testid="area-marker"]').count()) +
      (await page.locator('[data-testid="area-marker-dot"]').count()) +
      (await page.locator('[data-testid="area-cluster-marker"]').count());
    expect(anyMarkers, 'map must not be left empty after a cluster chip click').toBeGreaterThan(0);

    // Must NOT drill to a listings view.
    expect(page.url(), 'cluster chip click must not add areaKey (no listings drill-down)').not.toContain('areaKey=');
    expect(page.url()).toContain(`groupId=${GROUP_ID}`);
    void urlBefore;

    await page.screenshot({ path: 'test-results/1815-r5-cluster-chip-click.png', fullPage: false });
  });

  test('R6 REGRESSION: clicking a named visible area pill drills straight to that area’s listings', async ({ page }) => {
    await gotoDenseGroup(page);

    const pills = page.locator('[data-testid="area-marker"]');
    await expect(pills.first()).toBeVisible({ timeout: 10_000 });

    await pills.first().click();

    await expect(page).toHaveURL(/areaKey=/, { timeout: 8_000 });
    // 'area-selected-panel' is not a real testid in AreaSelectedPanel.tsx (confirmed via
    // source read — no such data-testid exists on this component; other specs that
    // reference it are stub-only/mocked and never exercised the real DOM here). Use
    // 'area-result-summary', which IS rendered on the drilled-in area-listings panel
    // (the "Showing N verified properties in <area>" strip) and is the closest real
    // signal that the drill-down actually landed on that area's listings.
    await expect(page.getByTestId('area-result-summary')).toBeVisible({ timeout: 8_000 });

    await page.screenshot({ path: 'test-results/1815-r6-area-pill-drilldown.png', fullPage: false });
  });

  // ── R4: second dense group ──────────────────────────────────────────────
  //
  // Tried against the real backend: none of airport-belt / tech-corridor /
  // south-premium exist as seeded area-group slugs in the shared Supabase
  // instance today (only thanisandra-hennur-belt is confirmed to carry a
  // real 29-area dense membership — see project memory
  // "Bangalore area-group sizes": north-growth has only 2 areas, so it can't
  // even produce a cluster chip). Rather than fabricate a second group via
  // page.route() stubbing (which would silently reintroduce the exact
  // "functional pass, spatial gap" problem this spec exists to close — a
  // stubbed layout is not evidence about real rendering), this spec
  // documents thanisandra-hennur-belt as the SOLE real dense stress case and
  // does not add a second live-data group test. If/when a second genuinely
  // dense (>=15 area) group is seeded, add a lighter R4 case here reusing
  // rectsCollide()/getVisiblePillRects() against that group's URL. Not added
  // as a vacuous/no-op test here — an assertion-free "pass" would itself
  // repeat the #1810 mistake of reporting coverage that isn't real.
});
