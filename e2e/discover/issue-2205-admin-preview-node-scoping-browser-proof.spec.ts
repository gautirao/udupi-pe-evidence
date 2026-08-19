/**
 * Issue #2205 (cycle-3 fix) — browser/E2E proof that the admin city-launch
 * PREVIEW surface (#2202 backend node-scoping, consumed by #2215's frontend
 * `useDiscoverFilteredMarkers` preview branch) actually emits the correct
 * marker-scope query for BOTH of the two live preview states:
 *
 *   1. A canonical navigation node is resolved (drilled to via real clicks
 *      through the SAME <MapDiscovery/> navigation-level-panel the public
 *      Discover surface uses, reused unmodified by CityLaunchPreview.tsx) ->
 *      the captured `/preview/markers` request carries `node=<resolved key>`
 *      and no `areaKeys=` derived from that node
 *      (`useDiscoverFilteredMarkers.ts`: `source.mode === 'preview' &&
 *      scope.kind === 'node'` branch).
 *   2. No node is resolved but a legacy #1597 sandbox area-group is focused
 *      via the sanctioned `?groupId=<slug>` URL identity (`AreaGroupFocusPanel`,
 *      #2213) -> the captured request retains `areaKeys=` (group-scoped),
 *      per `markerScope.ts` rule 1's node-then-group precedence for preview
 *      mode.
 *
 * Cycle-3 review finding (verbatim): "#2205 explicitly requires a fresh
 * #2204-style E2E proof after #2215/#2216 confirming BOTH residual legacy
 * routes are dead before final deletion/closure... There is still no
 * post-prerequisite browser evidence that admin preview with canonical
 * node= actually emits the node-scoped marker request rather than legacy
 * areaKeys, while the sanctioned no-node/group preview path still emits
 * group scope."
 *
 * FIXTURE (local-fixture-backend, NOT the shared hosted DB): Bangalore
 * (cityId=1) city-launch revision 1, PREPARED via the REAL
 * `POST /api/admin/city-launch/cities/1/prepare` pipeline against this
 * exact fixture's pre-existing production `navigation_nodes` (#1956) and
 * `area_groups` (base migrations) rows — not hand-seeded sandbox SQL. Live-
 * verified against this exact fixture/revision:
 *   - `d:central` (DIRECTION, depth 0)
 *     -> `c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala` (CLUSTER, depth 1)
 *          -> `a:IN|KA|Bengaluru|Koramangala` (AREA leaf, depth 2, area_key
 *             `IN|KA|Bengaluru|Koramangala`)
 *   - sandbox area-group `south-premium` ("South Premium"), member areaKeys
 *     `IN|KA|Bengaluru|Koramangala` / `IN|KA|Bengaluru|Jayanagar` /
 *     `IN|KA|Bengaluru|HSR Layout` (mirrors the production `area_groups` row
 *     of the same slug, copied into `sandbox_area_group`/
 *     `sandbox_area_group_member` by the prepare pipeline).
 *
 * Run (against the local fixture backend/frontend — see this issue's PR body
 * for the exact ports used in this evidence run):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5174 BACKEND_BASE_URL=http://localhost:8090 \
 *     npx playwright test e2e/discover/issue-2205-admin-preview-node-scoping-browser-proof.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';

const CITY_ID = 1;
const REVISION_ID = 1;
const PREVIEW_PATH = `/admin/city-launch/${CITY_ID}/preview/${REVISION_ID}`;

const D_CENTRAL = 'd:central';
const CLUSTER_BTM_KORAMANGALA =
  'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala';
const AREA_KORAMANGALA_NODE = 'a:IN|KA|Bengaluru|Koramangala';

const GROUP_SOUTH_PREMIUM = 'south-premium';
const AREA_KORAMANGALA_KEY = 'IN|KA|Bengaluru|Koramangala';
const AREA_JAYANAGAR_KEY = 'IN|KA|Bengaluru|Jayanagar';
const AREA_HSR_LAYOUT_KEY = 'IN|KA|Bengaluru|HSR Layout';

function previewMarkersUrl(url: string): boolean {
  return url.includes(
    `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/preview/markers`,
  );
}

test.describe('@integration-ui #2205 — admin preview node-scoped vs group-scoped markers', () => {
  test.use({ storageState: 'e2e/fixtures/admin-auth.json' });

  test('canonical node= drill-down emits node-scoped /preview/markers, no derived areaKeys', async ({
    page,
  }: {
    page: Page;
  }) => {
    // Collect every /preview/markers request fired for the whole page
    // lifetime (registered BEFORE navigation) rather than a single
    // narrowly-timed waitForResponse — the markers query re-fires at EVERY
    // navigation-level hop (Direction/Cluster/AREA each resolve their own
    // node scope), so a listener attached only right before the final click
    // can race a request that already landed as part of an earlier hop's
    // settle/prefetch.
    const markersRequests: URL[] = [];
    page.on('request', (req) => {
      if (previewMarkersUrl(req.url())) markersRequests.push(new URL(req.url()));
    });

    await page.goto(PREVIEW_PATH);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 20_000 });

    // Hop 1: root -> Direction (d:central)
    await page.getByTestId(`navigation-child-card-${D_CENTRAL}`).click();
    await expect(page.getByTestId(`navigation-child-card-${CLUSTER_BTM_KORAMANGALA}`)).toBeVisible({
      timeout: 10_000,
    });

    // Hop 2: Direction -> Cluster
    await page.getByTestId(`navigation-child-card-${CLUSTER_BTM_KORAMANGALA}`).click();
    await expect(page.getByTestId(`navigation-child-card-${AREA_KORAMANGALA_NODE}`)).toBeVisible({
      timeout: 10_000,
    });

    // Hop 3: Cluster -> AREA leaf (Koramangala).
    await page.getByTestId(`navigation-child-card-${AREA_KORAMANGALA_NODE}`).click();
    await expect(page.getByText('Properties in Koramangala')).toBeVisible({ timeout: 15_000 });

    // The AREA leaf's fitBounds lands this small area's viewport at exactly
    // zoom=12 (live-verified against this fixture) — markers are gated on
    // `mapZoom > AREA_LAYER_MAX_ZOOM` (12), a STRICT `>` (`shouldShowMarkers`
    // in `src/shared/map/zoomPolicy.ts`), so one real zoom-in click (the same
    // "Zoom in" control a buyer/admin would use) is needed to cross the
    // threshold before the markers query is enabled — this is the map's own
    // pre-existing zoom-gating policy, not something this test works around.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(500);

    await expect
      .poll(() => markersRequests.some((u) => u.searchParams.get('node') === AREA_KORAMANGALA_NODE), {
        timeout: 15_000,
      })
      .toBe(true);

    const markersUrl = markersRequests.find(
      (u) => u.searchParams.get('node') === AREA_KORAMANGALA_NODE,
    )!;
    expect(markersUrl.searchParams.get('node'), 'resolved AREA leaf node= is sent').toBe(
      AREA_KORAMANGALA_NODE,
    );
    expect(
      markersUrl.searchParams.getAll('areaKeys'),
      'no legacy areaKeys= is ever derived/sent alongside a resolved node=',
    ).toEqual([]);
  });

  test('no-node group-focus preview state retains areaKeys= (group-scoped), never node=', async ({
    page,
  }: {
    page: Page;
  }) => {
    const markersRequests: URL[] = [];
    page.on('request', (req) => {
      if (previewMarkersUrl(req.url())) markersRequests.push(new URL(req.url()));
    });

    // Sanctioned journeyless/#2088-virtual-default `?groupId=<group>` entry —
    // AreaGroupFocusPanel (#2213) renders off this URL identity alone, mode-
    // agnostic (live or preview).
    await page.goto(`${PREVIEW_PATH}?groupId=${GROUP_SOUTH_PREMIUM}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('area-group-focus-heading')).toHaveText('South Premium', {
      timeout: 20_000,
    });

    // Same real "Zoom in" control used by the node= test above — a 3-area
    // group's fitBounds spans more ground than a single AREA leaf and can
    // land at/below the `mapZoom > AREA_LAYER_MAX_ZOOM` (12) gate
    // (`shouldShowMarkers`), so click it (up to a few times) until the
    // group-scoped markers query actually fires.
    const zoomInButton = page.getByRole('button', { name: 'Zoom in' });
    await expect
      .poll(
        async () => {
          if (markersRequests.some((u) => u.searchParams.getAll('areaKeys').length > 0)) return true;
          await zoomInButton.click();
          await page.waitForTimeout(600);
          return markersRequests.some((u) => u.searchParams.getAll('areaKeys').length > 0);
        },
        { timeout: 20_000, intervals: [800] },
      )
      .toBe(true);

    const markersUrl = markersRequests.find((u) => u.searchParams.getAll('areaKeys').length > 0)!;

    expect(
      markersUrl.searchParams.get('node'),
      'no node= is ever sent while no canonical node is resolved',
    ).toBeNull();
    expect(
      markersUrl.searchParams.getAll('areaKeys').sort(),
      'the group-focus preview state is scoped to exactly south-premium\'s member areas',
    ).toEqual([AREA_HSR_LAYOUT_KEY, AREA_JAYANAGAR_KEY, AREA_KORAMANGALA_KEY].sort());
  });
});
