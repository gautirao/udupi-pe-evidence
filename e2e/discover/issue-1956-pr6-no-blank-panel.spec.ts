/**
 * Issue #1956 PR-6 — AC6.18 no blank or unhandled panel.
 *
 * The two URL shapes whose panel state previously resolved to a now-deleted
 * panel are:
 *   - journey-less `groupId=` (no journey, no areaKey) — `derivePanelContent`
 *     returns `'area-groups-landing'`.
 *   - `journey=area-first` with no `areaKey` — `derivePanelContent` would
 *     also return `'area-groups-landing'`, BUT `DiscoverRightPanelContainer`
 *     gates on `journey === 'area-first'` at a level ABOVE
 *     `derivePanelContent` entirely, so in the live app this URL shape never
 *     reaches that return value at all — it mounts the canonical
 *     `DiscoverAreasJourneyPanel` at the city root directly. This is
 *     confirmed by reading `DiscoverRightPanelContainer.tsx`
 *     (`showAreasNavigationJourney = urlState.journey === 'area-first'`,
 *     which pre-empts the legacy `DiscoverRightPanel` switch unconditionally)
 *     — so this test asserts the REAL reachable behaviour (canonical city
 *     root, non-blank) rather than a state that cannot occur through normal
 *     navigation.
 *
 * `derivePanelContent`'s `'area-groups-landing'` / `'area-group-results'`
 * return values were DELIBERATELY NOT closed off, because they also drive
 * `discoverLayerRegistry`'s map-layer selection, `isAreaFirstCityLanding`,
 * and `DiscoverMapCountBadge` — closing them would regress live map
 * behaviour. Both cases fall through to the pre-existing `AreaSelectionPanel`
 * placeholder in `DiscoverRightPanel.tsx`. This spec asserts that real
 * current behaviour (a non-blank, non-crashing panel), not that those return
 * values were removed — they were not.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const KNOWN_GROUP_ID = 'west-fixture-group';

async function grantTelemetryConsent(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('@integration-ui #1956 PR-6 — AC6.18 no blank or unhandled panel', () => {
  test('journey-less groupId=: renders the non-blank AreaSelectionPanel placeholder, no console errors', async ({
    page,
  }) => {
    await grantTelemetryConsent(page);
    const pageErrors = collectPageErrors(page);

    await page.goto(`/discover?city=${CITY}&groupId=${encodeURIComponent(KNOWN_GROUP_ID)}`);
    await page.waitForLoadState('domcontentloaded');

    // The legacy wrapper is up (this URL shape does not reach canonical —
    // journey is not 'area-first').
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

    // Non-blank: the AreaSelectionPanel placeholder actually renders content,
    // not an empty div. `empty-state-description` is the shared EmptyState
    // component's own testid; its text content is asserted, not just its
    // presence, so a genuinely EMPTY EmptyState (heading with no body text)
    // would still fail this.
    const description = page.getByTestId('empty-state-description');
    await expect(description).toBeVisible({ timeout: 15_000 });
    await expect(description).not.toHaveText('');
    await expect(page.getByText('Choose a neighbourhood group')).toBeVisible();

    // The panel header for this placeholder renders too (further proof this
    // is a real, structured panel and not a bare fallback div).
    await expect(page.getByText('Explore by neighbourhood')).toBeVisible();

    // Give any deferred/microtask errors a moment to surface before reading
    // the collected list.
    await page.waitForTimeout(500);
    expect(pageErrors, `unexpected uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });

  test('journey=area-first with no areaKey: mounts canonical at city root (non-blank), not the legacy placeholder', async ({
    page,
  }) => {
    await grantTelemetryConsent(page);
    const pageErrors = collectPageErrors(page);

    await page.goto(`/discover?city=${CITY}&journey=area-first`);
    await page.waitForLoadState('domcontentloaded');

    // Canonical mounted, not the legacy wrapper — confirms this URL shape
    // does NOT fall through to the deleted-panel placeholder path in the
    // live app.
    await expect(page.getByTestId('discover-right-panel')).toHaveCount(0);

    const root = page.locator(
      '[data-testid="areas-journey-panel"], [data-testid="areas-journey-panel-empty"]',
    ).first();
    await expect(root, 'canonical must mount a non-blank root at city root').toBeVisible({
      timeout: 15_000,
    });

    // Real fixture ground truth (confirmed live against the running backend
    // in issue-1956-pr6-journey-switch-conversion.spec.ts): the Bangalore
    // navigation root has real children (d:w, d:s, d:southeast, d:northeast,
    // d:southwest), so the city root is NOT the structurally-empty state —
    // assert actual navigable content renders, not just an empty shell.
    const emptyState = page.getByTestId('areas-journey-panel-empty');
    const emptyStateCount = await emptyState.count();
    if (emptyStateCount === 0) {
      // Expected branch on this fixture: real direction-level children exist.
      const content = await root.textContent();
      expect(content?.trim().length ?? 0, 'city-root panel must render non-blank content').toBeGreaterThan(0);
    } else {
      // Disclosed fallback: if the fixture ever has zero root children, the
      // panel still must not be blank — the empty state itself must render
      // real copy, not a bare div.
      const emptyContent = await emptyState.textContent();
      expect(emptyContent?.trim().length ?? 0).toBeGreaterThan(0);
    }

    await page.waitForTimeout(500);
    expect(pageErrors, `unexpected uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });
});
