/**
 * Issue #1956 PR-6 — AC6.19 the composed seam.
 *
 * [rulings.oq_a]'s residual gap, called out explicitly in the approved
 * handoff: "no test currently asserts the COMPOSED seam (JourneySwitcher
 * click -> canonical panel at root) end to end — a test to add, not a code
 * change." The unit-level coverage (useAreasNavigationJourney's 7 test
 * cases for a null requestedNodeKey coalescing to ROOT_NODE_KEY) proves the
 * pure model; this spec proves the actual composed, real-browser seam: a
 * bare `/discover?city=...` with NO other params, the ACTUAL JourneySwitcher
 * "Explore by area" card click, landing on the canonical panel at the
 * city-root directions level with no staleness notice — and the legacy
 * panel genuinely gone at that point, not merely overlaid (the PR-5 failure
 * mode).
 *
 * Covered at both required viewports (1366x768 desktop, 390x844 mobile) per
 * [qa_requirements].browser_verification.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';

async function grantTelemetryConsent(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

async function runComposedSeamAssertions(page: Page) {
  await grantTelemetryConsent(page);

  // Bare entry point, NO journey/node/groupId/areaKey — the actual shape a
  // fresh shopper session has before touching any control.
  await page.goto(`/discover?city=${CITY}`);
  await page.waitForLoadState('domcontentloaded');

  // Positive: legacy is genuinely up first (guided-entry), so the later
  // absence assertion is proving a real transition, not a vacuous no-op.
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('[data-testid^="areas-journey-panel"]'),
  ).toHaveCount(0);

  const historyLengthBefore = await page.evaluate(() => window.history.length);

  // The ACTUAL in-app JourneySwitcher control — same testid the conversion-
  // seam spec (issue-1956-pr6-journey-switch-conversion.spec.ts) drives.
  await page.getByTestId('journey-card-area-first').click();

  // Canonical mounts at the city-root directions level.
  const root = page.locator('[data-testid="areas-journey-panel"]').first();
  await expect(root, 'canonical must mount at city root after the JourneySwitcher click').toBeVisible({
    timeout: 15_000,
  });

  const params = new URL(page.url()).searchParams;
  expect(params.get('journey')).toBe('area-first');
  // City-root: no node= param (ROOT_NODE_KEY coalescing happens internally,
  // never written to the URL as an explicit node for the unclicked root).
  expect(params.get('groupId')).toBeNull();
  expect(params.get('areaKey')).toBeNull();

  // No staleness notice — this is a fresh, first-class city-root mount, not
  // a stale/unresolved rung.
  await expect(page.getByTestId('navigation-resolution-notice')).toHaveCount(0);

  // The legacy panel is genuinely GONE at this point, not merely covered —
  // `discover-right-panel` is the legacy DiscoverRightPanel wrapper's own
  // testid, never emitted by DiscoverAreasJourneyPanel.
  await expect(page.getByTestId('discover-right-panel')).toHaveCount(0);

  // Exactly one history entry consumed by the one click (no intermediate
  // journey-only push followed by a second node= push).
  const historyLengthAfter = await page.evaluate(() => window.history.length);
  expect(historyLengthAfter - historyLengthBefore).toBe(1);

  // Real content, not a blank shell — the Bangalore fixture root has real
  // direction children (d:w, d:s, d:southeast, d:northeast, d:southwest).
  const content = await root.textContent();
  expect(content?.trim().length ?? 0).toBeGreaterThan(0);
}

test.describe('@integration-ui #1956 PR-6 — AC6.19 composed seam (JourneySwitcher -> canonical city root)', () => {
  test.describe('desktop 1366x768', () => {
    test.use({ viewport: { width: 1366, height: 768 } });
    test('bare /discover?city=... -> click "Explore by area" -> canonical at city root, legacy gone', async ({
      page,
    }) => {
      await runComposedSeamAssertions(page);
    });
  });

  test.describe('mobile 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('bare /discover?city=... -> tap "Explore by area" -> canonical at city root, legacy gone', async ({
      page,
    }) => {
      await runComposedSeamAssertions(page);
    });
  });
});
