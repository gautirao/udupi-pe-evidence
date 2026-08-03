/**
 * Issue #1956 PR-6 — canonical `node=` re-home of the legacy
 * `e2e/area-groups-focus.spec.ts` "browser Back restores the parent, not the
 * landing" coverage (required_evidence item 2 of the approved PR-6 handoff).
 *
 * The legacy spec asserted this against the LEGACY `groupId`/`areaKey` URL
 * contract (test 3, ~:170-192): after drilling group-landing -> area-selected,
 * a browser Back leaves `groupId` present and `areaKey` absent — i.e. Back
 * restores the PARENT level, never the landing/root.
 *
 * This spec proves the EQUIVALENT behaviour on the CANONICAL `node=` contract:
 * after drilling City -> Direction(d:southeast) -> Area(RR Nagar), a browser
 * Back restores the Direction node exactly, and the Area level is genuinely
 * gone (not merely "some node= present") — proven two ways:
 *   (a) the `node=` URL param reverts to `d:southeast` and is never the Area key,
 *   (b) `navigation-level-panel`'s `data-node-key` reverts to `d:southeast`
 *       (proving the Direction SURFACE re-mounted, not just the URL), and the
 *       Area-leaf-only `areas-journey-panel-listings` surface disappears.
 *
 * GROUND TRUTH — fixture reality (ledger #2050): the local fixture DB root
 * does NOT have a `d:e` Direction child. This spec deliberately uses
 * `d:southeast`, confirmed live via
 *   GET /api/discover/cities/bangalore/navigation/resolve?node=d:southeast
 * to resolve EXACT with exactly 3 real AREA children: RR Nagar, Vijayanagar,
 * Nagarbhavi (all under a synthetic-root Direction, ancestry=[]).
 *
 * Anonymous flow — no auth required. Backend-live (no route stubs): the
 * local fixture backend at :8081 serves this shape directly.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5174 BACKEND_BASE_URL=http://localhost:8081 \
 *     npx playwright test e2e/discover/issue-1956-pr6-canonical-back-rehome.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;

const D_SOUTHEAST = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

test.describe('@integration-ui #1956 PR-6 — canonical node= re-home: browser Back restores the parent node, not the landing', () => {
  test('City -> Direction(d:southeast) -> Area(RR Nagar): browser Back restores the Direction node and the Area level is gone', async ({
    page,
  }) => {
    // Step 1: land on the journey root (no node=) — this is the "landing".
    await page.goto(`/discover?${BASE}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
    expect(await currentNodeParam(page)).toBeNull();

    // Step 2: drill into the Direction (pushes a real history entry).
    await expect(page.getByTestId(cardTestId(D_SOUTHEAST))).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(cardTestId(D_SOUTHEAST)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_SOUTHEAST);
    await expect(page.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', D_SOUTHEAST);

    // Positive: the Direction's real AREA children resolved from the fixture
    // are actually rendered before we drill further.
    await expect(page.getByTestId(cardTestId(AREA_RR_NAGAR))).toBeVisible({ timeout: 10_000 });

    // Step 3: drill into the Area leaf (pushes a second real history entry).
    await page.getByTestId(cardTestId(AREA_RR_NAGAR)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_RR_NAGAR);
    // Confirm we are genuinely AT the Area leaf: the listings-restoration
    // surface (not the Direction-level navigation panel) is what renders here.
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });

    // Step 4: browser Back — must restore the PARENT (Direction) level, never
    // the landing/root and never staying on the Area.
    await page.goBack();

    // (a) URL: node= reverts to the Direction, and is NEVER the Area key and
    // NEVER absent (i.e. Back did not overshoot to the landing/root).
    await expect.poll(() => currentNodeParam(page)).toBe(D_SOUTHEAST);
    expect(await currentNodeParam(page)).not.toBe(AREA_RR_NAGAR);
    expect(await currentNodeParam(page)).not.toBeNull();

    // (b) Surface: the Direction-level navigation panel actually re-mounted
    // with the correct node key...
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', D_SOUTHEAST);
    // ...and the Area-leaf-only listings surface is genuinely GONE, not just
    // the URL param — this is what a presence-only assertion cannot catch.
    await expect(page.getByTestId('areas-journey-panel-listings')).toHaveCount(0);

    // The Direction's own children are visible again too (real re-render,
    // not a stale DOM leftover from the Area leaf).
    await expect(page.getByTestId(cardTestId(AREA_RR_NAGAR))).toBeVisible({ timeout: 10_000 });
  });
});
