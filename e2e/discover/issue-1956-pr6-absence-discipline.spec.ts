/**
 * Issue #1956 PR-6 — AC6.17 absence discipline.
 *
 * WHY THIS EXISTS: the delivery ledger for PR-5 records a real
 * shopper-visible regression (a duplicated sheet stacked on a popover) that
 * survived 19/19 green E2E, two code-reviewer APPROVEs and a ui-designer
 * pass. Root cause: every PR-5 assertion checked that the NEW surface was
 * PRESENT; none checked the OLD surface was ABSENT. Presence-only assertions
 * cannot detect duplication.
 *
 * This spec proves the three PR-6-deleted panels —
 * `AreaGroupsLandingPanel`, `AreaGroupResultsPanel`, `AreaGroupSelectedPanel`
 * (all removed at 1bd4ae0) — never render on ANY entry point, using their
 * REAL former `data-testid`s (sourced via `git show 1bd4ae0^:<path>` and the
 * three panels' own now-deleted unit test files, not invented names — an
 * assertion against a testid that never existed would pass vacuously and
 * prove nothing).
 *
 * It also asserts the exact PR-5 failure mode directly: at most ONE primary
 * right-panel surface (the legacy `DiscoverRightPanel` wrapper OR the
 * canonical `DiscoverAreasJourneyPanel` family) is mounted at a time, never
 * both.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const KNOWN_GROUP_ID = 'west-fixture-group';
const KNOWN_AREA_KEY = 'IN|KA|Bengaluru|Basaveshwara Nagar';

/**
 * Former testids of the three DELETED panels, sourced from:
 *   git show 1bd4ae0^:src/components/discover/panels/AreaGroupsLandingPanel.tsx
 *   git show 1bd4ae0^:src/components/discover/panels/AreaGroupResultsPanel.tsx
 *   git show 1bd4ae0^:src/components/discover/panels/AreaGroupSelectedPanel.tsx
 * cross-checked against each panel's own (also-deleted) unit test file to
 * confirm they were the REAL query targets those tests used, not just any
 * data-testid string that happened to appear in the component source.
 *
 * Deliberately excludes `start-over-button`/`start-over-confirm` (shared
 * StartOverDialog control, not panel-exclusive) and the dynamic
 * `browse-all-area-${areaKey}` / `group-results-listing-${id}` id families
 * (confirmed ABSENT from the surviving `AreaSelectedPanel.tsx` by direct
 * search, but excluded here anyway because a fixed literal id would only
 * cover one areaKey and risk a false-negative on others; the fixed ids below
 * are sufficient on their own to prove each panel's absence).
 */
const DELETED_AREA_GROUPS_LANDING_TESTIDS = [
  'area-groups-intro',
  'area-groups-loading',
  'area-groups-list',
  'area-group-level2',
  'area-group-invalid-message',
  'macro-region-filter-banner',
  'clear-scope-button',
  'region-scoped-groups-loading',
  'region-scoped-groups-error',
  'region-scoped-groups-retry-btn',
  'group-card-area-names',
];

const DELETED_AREA_GROUP_RESULTS_TESTIDS = [
  'area-group-results-header',
  'area-group-results-back',
  'area-group-results-count',
  'area-group-results-anon-banner',
  'area-group-results-anon-signin',
  'area-group-results-body',
  'area-group-results-no-areas',
  'area-group-results-error',
  'area-group-results-empty',
];

const DELETED_AREA_GROUP_SELECTED_TESTIDS = [
  'area-group-breadcrumb',
  'area-group-back-to-all',
  'area-group-back-to-region',
  'area-marker-shown-of-total-note',
  'area-group-selected-card',
  'area-group-view-all',
];

const ALL_DELETED_TESTIDS = [
  ...DELETED_AREA_GROUPS_LANDING_TESTIDS,
  ...DELETED_AREA_GROUP_RESULTS_TESTIDS,
  ...DELETED_AREA_GROUP_SELECTED_TESTIDS,
];

/**
 * The canonical `DiscoverAreasJourneyPanel` family renders one of several
 * mutually-exclusive top-level states, each with its own testid
 * (`areas-journey-panel`, `-loading`, `-empty`, `-error`,
 * `areas-cluster-focus-panel`). None of these ever co-occur as SIBLING
 * top-level renders (only `areas-journey-panel-listings` nests inside
 * `areas-journey-panel`, which is fine for an "is canonical mounted at all"
 * check). Matching all of them lets us treat "canonical is mounted" as a
 * single boolean without depending on which sub-state it is in.
 */
const CANONICAL_ROOT_SELECTOR =
  '[data-testid^="areas-journey-panel"], [data-testid="areas-cluster-focus-panel"]';

async function assertNoDeletedPanels(page: Page) {
  for (const testId of ALL_DELETED_TESTIDS) {
    await expect(
      page.getByTestId(testId),
      `deleted-panel testid "${testId}" must have zero matches`,
    ).toHaveCount(0);
  }
}

/**
 * The exact PR-5 failure mode, generalised: assert exactly one primary
 * right-panel surface is mounted, and that it matches which surface THIS URL
 * shape is expected to resolve to (legacy `DiscoverRightPanel` wrapper, or
 * canonical `DiscoverAreasJourneyPanel`). Never both, never neither.
 */
async function assertExactlyOnePrimarySurface(page: Page, expected: 'legacy' | 'canonical') {
  const legacy = page.getByTestId('discover-right-panel');
  const canonical = page.locator(CANONICAL_ROOT_SELECTOR);

  if (expected === 'legacy') {
    await expect(legacy, 'legacy discover-right-panel wrapper must be the sole surface').toHaveCount(1);
    await expect(canonical, 'canonical areas-journey-panel family must not co-mount').toHaveCount(0);
  } else {
    await expect(legacy, 'legacy discover-right-panel wrapper must not co-mount').toHaveCount(0);
    const canonicalCount = await canonical.count();
    expect(canonicalCount, 'canonical areas-journey-panel family must render at least one node').toBeGreaterThan(0);
  }
}

async function grantTelemetryConsent(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

test.describe('@integration-ui #1956 PR-6 — AC6.17 absence discipline', () => {
  test('bare /discover?city=... (guided-entry): deleted panels absent, legacy is sole surface', async ({ page }) => {
    await grantTelemetryConsent(page);
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

    await assertNoDeletedPanels(page);
    await assertExactlyOnePrimarySurface(page, 'legacy');
  });

  test('journey=area-first (city root, no node): deleted panels absent, canonical is sole surface', async ({ page }) => {
    await grantTelemetryConsent(page);
    await page.goto(`/discover?city=${CITY}&journey=area-first`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(CANONICAL_ROOT_SELECTOR).first()).toBeVisible({ timeout: 15_000 });

    await assertNoDeletedPanels(page);
    await assertExactlyOnePrimarySurface(page, 'canonical');
  });

  test('journey-less groupId= (no journey, no areaKey): deleted panels absent, legacy is sole surface', async ({ page }) => {
    await grantTelemetryConsent(page);
    await page.goto(`/discover?city=${CITY}&groupId=${encodeURIComponent(KNOWN_GROUP_ID)}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

    await assertNoDeletedPanels(page);
    await assertExactlyOnePrimarySurface(page, 'legacy');
  });

  test('journey-less areaKey= (no journey): deleted panels absent, legacy is sole surface', async ({ page }) => {
    await grantTelemetryConsent(page);
    await page.goto(`/discover?city=${CITY}&areaKey=${encodeURIComponent(KNOWN_AREA_KEY)}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

    await assertNoDeletedPanels(page);
    await assertExactlyOnePrimarySurface(page, 'legacy');
  });

  test('journey=school-first with groupId=: deleted panels absent, legacy is sole surface', async ({ page }) => {
    await grantTelemetryConsent(page);
    await page.goto(
      `/discover?city=${CITY}&journey=school-first&groupId=${encodeURIComponent(KNOWN_GROUP_ID)}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

    await assertNoDeletedPanels(page);
    await assertExactlyOnePrimarySurface(page, 'legacy');
  });

  test('journey=agri-first: deleted panels absent, legacy is sole surface', async ({ page }) => {
    await grantTelemetryConsent(page);
    await page.goto(`/discover?city=${CITY}&journey=agri-first`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

    await assertNoDeletedPanels(page);
    await assertExactlyOnePrimarySurface(page, 'legacy');
  });
});
