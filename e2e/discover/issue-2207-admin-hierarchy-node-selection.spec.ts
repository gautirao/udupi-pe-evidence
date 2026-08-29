/**
 * Issue #2207 (first deliverable) — browser proof for the admin City Launch
 * hierarchy-tree node-selection + contextual override-prefill flow:
 *
 *   1. Clicking a tree row (`NavigationHierarchyTreeNode`, `role="treeitem"`)
 *      selects it independently of expand/collapse — `aria-selected="true"`
 *      on that row, and the row-scoped `NavigationHierarchySelectionPanel`
 *      (`data-testid="hierarchy-selection-panel"`) appears showing that
 *      node's label/type/key.
 *   2. The panel offers exactly the override actions valid for the selected
 *      node's type (`navigationHierarchyOverrideRules.getValidOverrideKindsForNode`):
 *      an AREA leaf gets Exclude/Reassign/Move (`subjectAreaKey`-keyed);
 *      a non-AREA (DIRECTION/CLUSTER) node gets Relabel/Set-representatives
 *      (`subjectNodeKey`-keyed).
 *   3. Clicking one of those action buttons (`hierarchy-selection-action-<kind>`)
 *      auto-navigates the page's Tabs to the Overrides tab
 *      (`NavigationOverridesPanel`, `data-testid="navigation-overrides-panel"`)
 *      with the form's `#override-kind` select and the relevant subject-key
 *      input (`#subjectAreaKey` / `#subjectNodeKey`) pre-filled from the
 *      selected node — proven via the actual rendered <select>/<input>
 *      values, not just that the tab switched.
 *   4. When the revision is not PREPARED (`overridesEditable=false`), the
 *      panel's action buttons are disabled — an admin can inspect a node's
 *      details on a non-PREPARED revision but cannot launch an override from
 *      it.
 *
 * FIXTURE (local-fixture-backend, NOT the shared hosted DB) — same Bangalore
 * (cityId=1) production `navigation_nodes` (#1956) hierarchy exercised by
 * e2e/discover/issue-2205-admin-preview-node-scoping-browser-proof.spec.ts,
 * but the PREPARED revision itself is obtained dynamically in `beforeAll`
 * below (cloned from Bangalore's current live revision via the REAL
 * `POST /api/admin/city-launch/cities/1/revisions/{id}/edit` endpoint)
 * rather than assuming a fixed revisionId=1 — the fixture backend's city
 * launch state moves forward over time (Bangalore had already progressed
 * past revision 1 by the time this suite was authored), so hardcoding a
 * revision id here would silently rot. Live-verified hierarchy used here:
 *   - `d:central` (DIRECTION, depth 0, non-AREA -> Relabel/Set-representatives)
 *     -> `c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala` (CLUSTER, depth 1, non-AREA)
 *          -> `a:IN|KA|Bengaluru|Koramangala` (AREA leaf, depth 2, area_key
 *             `IN|KA|Bengaluru|Koramangala` -> Exclude/Reassign/Move)
 *
 * Run (against the local fixture backend/frontend on this worker's reserved
 * ports 5261/8261):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5261 BACKEND_BASE_URL=http://localhost:8261 \
 *     npx playwright test e2e/discover/issue-2207-admin-hierarchy-node-selection.spec.ts --project=full
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type Locator } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = process.env.BACKEND_BASE_URL ?? 'http://localhost:8085';

/** Reads the Supabase access token global-setup saved for the admin role. */
function readAdminAccessToken(): string {
  const raw = fs.readFileSync(
    path.resolve(__dirname, '..', 'fixtures', 'admin-auth.json'),
    'utf-8',
  );
  const state = JSON.parse(raw) as {
    origins: Array<{ localStorage: Array<{ name: string; value: string }> }>;
  };
  const entry = state.origins
    .flatMap((o) => o.localStorage)
    .find((item) => item.name.startsWith('sb-') && item.name.endsWith('-auth-token'));
  if (!entry) throw new Error('admin-auth.json has no Supabase auth-token entry — is ADMIN_EMAIL/PASSWORD set?');
  const parsed = JSON.parse(entry.value) as { access_token: string };
  return parsed.access_token;
}

const CITY_ID = 1;
// This suite needs a PREPARED revision (overridesEditable=true) with a real
// navigation hierarchy. revisionId=1 (the fixture used by issue-2205's spec)
// is no longer PREPARED in the shared local-fixture backend — Bangalore has
// since progressed to a "live" revision (id 9 at the time this was written).
// A fresh PREPARED candidate is cloned from that live revision once, via the
// REAL `POST /api/admin/city-launch/cities/1/revisions/{liveRevisionId}/edit`
// endpoint (the same "Edit revision" pipeline CityLaunchPreview.tsx's own
// button drives — see src/hooks/useCityLaunch.ts useEditRevision), in
// beforeAll below, rather than a hand-seeded or hardcoded revision id. The
// clone carries over the exact same production `navigation_nodes` hierarchy
// live-verified against Bangalore in issue-2205's evidence:
//   - `d:central` (DIRECTION, depth 0)
//     -> `c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala` (CLUSTER, depth 1)
//          -> `a:IN|KA|Bengaluru|Koramangala` (AREA leaf, depth 2, area_key
//             `IN|KA|Bengaluru|Koramangala`)
let REVISION_ID: number;
let PREVIEW_PATH: string;

const D_CENTRAL = 'd:central';
const CLUSTER_BTM_KORAMANGALA = 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala';
const AREA_KORAMANGALA_NODE = 'a:IN|KA|Bengaluru|Koramangala';
const AREA_KORAMANGALA_KEY = 'IN|KA|Bengaluru|Koramangala';

/** Opens the Hierarchy tree tab and waits for the tree to render. */
async function openHierarchyTab(page: Page) {
  await page.goto(PREVIEW_PATH);
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('tab', { name: 'Hierarchy tree' }).click();
  await expect(page.getByTestId('navigation-hierarchy-tree')).toBeVisible({ timeout: 20_000 });
}

/**
 * Clicks a tree row to select it, via the row's own label span rather than
 * the row div itself. Two reasons a plain `row.click()` is unsafe here:
 *  - a row's `role="treeitem"` div wraps BOTH its own header content AND
 *    (when expanded) its full descendant subtree in the SAME DOM node (see
 *    NavigationHierarchyTreeNode), so once a row has expanded descendants
 *    its bounding box spans that whole subtree — a default center-point
 *    click can land on a totally different, deeply-nested descendant row;
 *  - the header's LEFT edge is the expand/collapse toggle button and its
 *    RIGHT edge is the Info-popover trigger, both of which stopPropagation
 *    (by design, so neither doubles as a selection click) — a fixed-offset
 *    click that happens to land on either one silently toggles/opens
 *    something else instead of selecting the row.
 * The `span.truncate` label text sits between those two safely, is always
 * part of the row's own header (never affected by what's expanded beneath
 * it), and has no click handler of its own — so a click on it bubbles up to
 * exactly the treeitem's onSelect, every time.
 */
async function selectRow(row: Locator) {
  await row.locator('span.truncate').first().click();
}

/**
 * Expands the tree down to the Koramangala AREA leaf via real toggle clicks.
 * Depth-0 nodes (DEFAULT_EXPANDED_MAX_DEPTH=0 in NavigationHierarchyTree)
 * start already expanded, so `d:central`'s children are visible without any
 * click — only the depth-1 cluster needs an explicit expand to reveal its
 * depth-2 AREA leaf.
 */
async function expandToKoramangalaArea(page: Page) {
  await expect(page.getByTestId(`nav-node-${D_CENTRAL}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`nav-node-${CLUSTER_BTM_KORAMANGALA}`)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId(`nav-node-toggle-${CLUSTER_BTM_KORAMANGALA}`).click();
  await expect(page.getByTestId(`nav-node-${AREA_KORAMANGALA_NODE}`)).toBeVisible({ timeout: 10_000 });
}

// An ABSOLUTE path, not the repo-relative 'e2e/fixtures/admin-auth.json'
// convention other specs use: `test.use({ storageState })`'s relative path
// resolves against process.cwd() at invocation time, not this file's
// directory or the config's rootDir. Running `playwright test` from a
// different cwd than this worktree (e.g. from the main repo while pointing
// --config at a worktree, which is how multiple worktree/port combinations
// on this machine get exercised) silently loads a SIBLING worktree's stale
// admin-auth.json — for a different origin/port — so the login token never
// matches this test's baseURL and every admin-gated route bounces to /auth.
// An absolute path anchored to this spec file removes that footgun.
const ADMIN_STORAGE_STATE = path.resolve(__dirname, '..', 'fixtures', 'admin-auth.json');

test.describe('@integration-ui #2207 — admin hierarchy-tree node selection + override prefill', () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test.beforeAll(async () => {
    const token = readAdminAccessToken();
    const authHeader = { Authorization: `Bearer ${token}` };

    const citiesRes = await fetch(`${BACKEND}/api/admin/city-launch/cities`, { headers: authHeader });
    if (!citiesRes.ok) {
      throw new Error(`GET /api/admin/city-launch/cities failed: ${citiesRes.status} ${await citiesRes.text()}`);
    }
    const cities = (await citiesRes.json()) as Array<{ cityId: number; revisionId: number; status: string }>;
    const bangalore = cities.find((c) => c.cityId === CITY_ID);
    if (!bangalore) throw new Error(`No city-launch entry for cityId=${CITY_ID} in fixture backend.`);

    // The cities-list endpoint's `revisionId` tracks whichever revision is
    // "current" for admin purposes: the LIVE revision when nothing is being
    // edited, or an in-progress PREPARED candidate once one exists (e.g. left
    // over from a prior run of this exact suite). Only `status === 'live'`
    // means it's the promoted revision that must be cloned via the REAL
    // edit-revision pipeline (the same endpoint CityLaunchPreview.tsx's own
    // "Edit revision" button drives — src/hooks/useCityLaunch.ts
    // useEditRevision) to get an override-eligible PREPARED copy; any other
    // status means `revisionId` already IS such a candidate, so reuse it
    // directly — calling edit on a non-live revision 409s by design
    // (CityLaunchCandidateService.editFromLive only clones from LIVE).
    if (bangalore.status === 'live') {
      const editRes = await fetch(
        `${BACKEND}/api/admin/city-launch/cities/${CITY_ID}/revisions/${bangalore.revisionId}/edit`,
        { method: 'POST', headers: authHeader },
      );
      if (!editRes.ok) {
        throw new Error(
          `POST .../revisions/${bangalore.revisionId}/edit failed: ${editRes.status} ${await editRes.text()}`,
        );
      }
      const edited = (await editRes.json()) as { revisionId: number; status: string };
      REVISION_ID = edited.revisionId;
    } else {
      REVISION_ID = bangalore.revisionId;
    }
    PREVIEW_PATH = `/admin/city-launch/${CITY_ID}/preview/${REVISION_ID}`;
  });

  test('selecting an AREA leaf shows aria-selected + Exclude/Reassign/Move actions, no Relabel', async ({
    page,
  }: {
    page: Page;
  }) => {
    await openHierarchyTab(page);
    await expandToKoramangalaArea(page);

    const areaRow = page.getByTestId(`nav-node-${AREA_KORAMANGALA_NODE}`);
    await expect(areaRow, 'unselected row starts aria-selected=false').toHaveAttribute(
      'aria-selected',
      'false',
    );

    await selectRow(areaRow);

    await expect(areaRow, 'clicking the row marks it aria-selected=true').toHaveAttribute(
      'aria-selected',
      'true',
    );

    const panel = page.getByTestId('hierarchy-selection-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('hierarchy-selection-label')).toHaveText('Koramangala');

    // Area-only actions present...
    await expect(page.getByTestId('hierarchy-selection-action-EXCLUDE_AREA')).toBeVisible();
    await expect(page.getByTestId('hierarchy-selection-action-REASSIGN_AREA_REGION')).toBeVisible();
    await expect(page.getByTestId('hierarchy-selection-action-MOVE_AREA')).toBeVisible();
    // ...and non-Area actions must NOT appear for an AREA node.
    await expect(page.getByTestId('hierarchy-selection-action-RELABEL')).toHaveCount(0);
    await expect(page.getByTestId('hierarchy-selection-action-SET_REPRESENTATIVES')).toHaveCount(0);
  });

  test('selecting a non-AREA node shows Relabel/Set-representatives, no Area-subject actions', async ({
    page,
  }: {
    page: Page;
  }) => {
    await openHierarchyTab(page);

    const directionRow = page.getByTestId(`nav-node-${D_CENTRAL}`);
    await expect(directionRow).toBeVisible({ timeout: 15_000 });
    await selectRow(directionRow);

    await expect(directionRow).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('hierarchy-selection-panel')).toBeVisible();

    await expect(page.getByTestId('hierarchy-selection-action-RELABEL')).toBeVisible();
    await expect(page.getByTestId('hierarchy-selection-action-SET_REPRESENTATIVES')).toBeVisible();
    await expect(page.getByTestId('hierarchy-selection-action-EXCLUDE_AREA')).toHaveCount(0);
    await expect(page.getByTestId('hierarchy-selection-action-REASSIGN_AREA_REGION')).toHaveCount(0);
    await expect(page.getByTestId('hierarchy-selection-action-MOVE_AREA')).toHaveCount(0);
  });

  test('selection survives collapsing the row (independent of expand/collapse state)', async ({
    page,
  }: {
    page: Page;
  }) => {
    await openHierarchyTab(page);
    await expandToKoramangalaArea(page);

    const areaRow = page.getByTestId(`nav-node-${AREA_KORAMANGALA_NODE}`);
    await selectRow(areaRow);
    await expect(areaRow).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('hierarchy-selection-label')).toHaveText('Koramangala');

    // Collapse the cluster that contains the selected leaf — this hides the
    // row from the DOM but must NOT clear the selection or the panel.
    await page.getByTestId(`nav-node-toggle-${CLUSTER_BTM_KORAMANGALA}`).click();
    await expect(page.getByTestId(`nav-node-${AREA_KORAMANGALA_NODE}`)).toHaveCount(0);
    await expect(
      page.getByTestId('hierarchy-selection-label'),
      'the selection panel keeps showing the collapsed-away node',
    ).toHaveText('Koramangala');
  });

  test('clicking Exclude area switches to Overrides tab with kind + subjectAreaKey pre-filled', async ({
    page,
  }: {
    page: Page;
  }) => {
    await openHierarchyTab(page);
    await expandToKoramangalaArea(page);

    await selectRow(page.getByTestId(`nav-node-${AREA_KORAMANGALA_NODE}`));
    await expect(page.getByTestId('hierarchy-selection-panel')).toBeVisible();

    await page.getByTestId('hierarchy-selection-action-EXCLUDE_AREA').click();

    // Auto-navigated: the Overrides tab is now the active/visible one.
    await expect(page.getByRole('tab', { name: 'Overrides' })).toHaveAttribute('data-state', 'active');
    const overridesPanel = page.getByTestId('navigation-overrides-panel');
    await expect(overridesPanel).toBeVisible({ timeout: 10_000 });

    // The actual pre-filled form state — the assertion that would fail if
    // the prefill wiring broke, not just that navigation happened.
    await expect(page.locator('#override-kind')).toHaveText('Exclude area');
    await expect(page.locator('#subjectAreaKey')).toHaveValue(AREA_KORAMANGALA_KEY);
  });

  test('clicking Relabel on a non-AREA node switches to Overrides tab with kind + subjectNodeKey pre-filled', async ({
    page,
  }: {
    page: Page;
  }) => {
    await openHierarchyTab(page);

    const directionRow = page.getByTestId(`nav-node-${D_CENTRAL}`);
    await expect(directionRow).toBeVisible({ timeout: 15_000 });
    await selectRow(directionRow);
    await expect(page.getByTestId('hierarchy-selection-panel')).toBeVisible();

    await page.getByTestId('hierarchy-selection-action-RELABEL').click();

    await expect(page.getByRole('tab', { name: 'Overrides' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('navigation-overrides-panel')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('#override-kind')).toHaveText('Relabel node');
    await expect(page.locator('#subjectNodeKey')).toHaveValue(D_CENTRAL);
  });

  test('the pre-filled override can actually be applied end to end', async ({ page }: { page: Page }) => {
    // This test does more network round-trips than the others (apply POST,
    // list refetch, remove DELETE, list refetch again for cleanup) and has
    // been observed within ~2s of the default 30s test timeout even when
    // every step succeeds — give it real headroom rather than risk a flaky
    // false failure on a slightly slower CI/local run.
    test.setTimeout(60_000);
    await openHierarchyTab(page);
    await expandToKoramangalaArea(page);

    await selectRow(page.getByTestId(`nav-node-${AREA_KORAMANGALA_NODE}`));
    await page.getByTestId('hierarchy-selection-action-REASSIGN_AREA_REGION').click();

    await expect(page.getByTestId('navigation-overrides-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#subjectAreaKey')).toHaveValue(AREA_KORAMANGALA_KEY);

    // REASSIGN_AREA_REGION additionally requires a target region key, which
    // the prefill intentionally leaves blank (only kind + subject are
    // seeded) — fill it in to prove the pre-filled subject key round-trips
    // through a real POST, not just that the input displays a value. 'N' is
    // a REAL sandbox region key in this fixture (North Bangalore) — verified
    // via the preview/regions endpoint, alongside CENTRAL/E/S/W. Region keys
    // are the plain sandbox_city_region.key values, NOT the "d:"-prefixed
    // DIRECTION nodeKeys the hierarchy tree uses.
    await page.locator('#targetRegionKey').fill('N');

    const applyResponse = page.waitForResponse(
      (res) =>
        res.url().includes(
          `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/navigation/overrides`,
        ) && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Apply override' }).click();
    const response = await applyResponse;
    expect(response.ok(), `POST /navigation/overrides should succeed, got ${response.status()}`).toBe(true);

    const appliedEntry = page.getByText(`Reassign ${AREA_KORAMANGALA_KEY} → region N`);
    await expect(
      appliedEntry,
      'the applied-overrides list shows an entry built from the pre-filled subject key',
    ).toBeVisible({ timeout: 10_000 });

    // Cleanup: this override structurally moves Koramangala to a different
    // parent, which would break every other test in this file if it stuck
    // around on this suite's shared (reused-across-runs) PREPARED revision.
    // Remove it via the real UI delete flow so the revision is left exactly
    // as this suite found it.
    const overrideRow = page.locator('li').filter({ has: appliedEntry });
    await overrideRow.getByRole('button', { name: /Remove override/ }).click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(appliedEntry).toHaveCount(0, { timeout: 15_000 });
  });
});
