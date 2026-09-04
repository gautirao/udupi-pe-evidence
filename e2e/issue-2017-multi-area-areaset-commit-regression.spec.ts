/**
 * E2E: Issue #2017 — multi-area AREA_SET commit regression.
 *
 * Owner ruling (relayed via team-lead, PR #2424 review) — draft candidate
 * counts are NOT proof the committed AREA_SET actually works: this spec
 * proves the full end-to-end path with known fixtures where an added
 * "nearby area" contributes a listing that is NOT in the originally
 * selected area, and that listing is visible (with a truthful, reconciling
 * result count) only AFTER the draft is committed via "Show listings" —
 * never before.
 *
 * Fixtures (seeded Bangalore local dev stack — see
 * scripts/dev/local-fixture-backend.sh):
 *   - RR Nagar: "[E2E] RR Nagar Fixture Apartment", "[E2E] RR Nagar Fixture
 *     House Two" (2 listings)
 *   - Deepanjali Nagar (a real "Add nearby areas" candidate for RR Nagar):
 *     "[E2E] Deepanjali Nagar Fixture Apartment" (1 listing) — confirmed via
 *     GET /api/discover/cities/bangalore/listings?areaKeys=IN|KA|Bengaluru|
 *     Deepanjali Nagar during this fix cycle's live verification.
 *
 * Team-lead review (fresh exact-head review at acb4cc86) — a second scenario
 * below guards a related MUST-HAVE lifecycle defect found in that pass:
 * Cancel did not actually cancel the draft. Both AreaSetDraftPanel (desktop)
 * and AreaSetChips (mobile) called only shell.closeAreaSetDraft() on Cancel,
 * but useAreaSetDraft's committed-scope seed effect only re-fires when the
 * COMMITTED scope's key set changes — a Cancel with no commit never changes
 * that, so an added-but-never-committed area silently survived a
 * close+reopen. Fixed via a shared `commands.resetToCommitted()` command
 * (see useAreaSetDraft.ts) called on every non-commit close path.
 *
 * Uses a real local dev stack (backend + seeded Bangalore fixture data) — no
 * route mocks, per this repo's E2E convention (mirrors
 * e2e/issue-2015-search-this-area-viewport.spec.ts's `urlParam`/
 * `declineConsentBannerIfPresent` helpers).
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts
 * Prerequisites: PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL pointing at a running
 * dev stack with the seeded Bangalore fixture.
 */

import { test, expect, type Page } from '@playwright/test';

const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';
const AREA_DEEPANJALI_NAGAR_KEY = 'IN|KA|Bengaluru|Deepanjali Nagar';

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Navigates directly to a committed single-Area RR Nagar scope (the
 * canonical area-first entry point that renders `AreaSelectedPanel`) via
 * URL, rather than climbing the navigation-node hierarchy — this spec's
 * subject is the AREA_SET draft/commit flow, not area-first navigation
 * (already covered by e2e/issue-2015-search-this-area-viewport.spec.ts's
 * `reachCommittedKoramangalaAreaSet` pattern).
 */
async function reachSingleAreaRrNagar(page: Page): Promise<void> {
  await page.goto(
    `/discover?node=${encodeURIComponent(AREA_RR_NAGAR)}&areaKey=${encodeURIComponent(AREA_RR_NAGAR_KEY)}&lat=12.93169&lon=77.52932&zoom=16&rscope=area`,
  );
  await page.waitForLoadState('domcontentloaded');
  await declineConsentBannerIfPresent(page);

  const panelHeading = page.getByRole('heading', { level: 1 });
  await expect(panelHeading, 'single-Area RR Nagar heading should render').toContainText(/RR Nagar/i, {
    timeout: 15_000,
  });
}

test.describe('Issue #2017 — multi-area AREA_SET commit regression', () => {
  test('desktop: adding a nearby area only affects listings after commit, and the count reconciles', async ({
    page,
  }) => {
    await reachSingleAreaRrNagar(page);

    const listingCards = page.getByTestId('listing-card');

    // Baseline — single-Area RR Nagar shows only its own 2 fixture listings.
    // Deepanjali Nagar's fixture listing must NOT be visible yet (nothing
    // has been added to any draft, let alone committed).
    await expect(listingCards).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByText('[E2E] Deepanjali Nagar Fixture Apartment')).toHaveCount(0);

    // Open the AREA_SET draft from the single-Area entry point.
    const addNearbyTile = page.getByTestId('area-set-add-nearby-tile');
    await expect(addNearbyTile, '"Add nearby areas" tile should render on a single-Area state').toBeVisible({
      timeout: 15_000,
    });
    await addNearbyTile.click();

    const draftPanel = page.getByTestId('area-set-draft-panel');
    await expect(draftPanel, 'desktop in-panel AREA_SET draft view should open').toBeVisible({ timeout: 10_000 });

    // Add Deepanjali Nagar to the draft.
    const addDeepanjaliButton = draftPanel.getByTestId(
      `area-set-draft-panel-suggestion-${AREA_DEEPANJALI_NAGAR_KEY}-add`,
    );
    await expect(addDeepanjaliButton, 'Deepanjali Nagar candidate should be offered as a nearby area').toBeVisible({
      timeout: 15_000,
    });
    await addDeepanjaliButton.click();

    await expect(draftPanel.getByTestId(`area-set-draft-panel-chip-${AREA_DEEPANJALI_NAGAR_KEY}`)).toBeVisible();

    // Draft-only state — this is the exact "draft candidate count is not
    // proof" gap the owner flagged: the COMMITTED scope (the URL, and
    // therefore the listings query) must NOT have changed yet just from
    // adding to the draft. The single-Area baseline is itself a one-key
    // AREA_SET (rscope=areas with a single rareas key), so the assertion
    // that matters here is that Deepanjali Nagar has NOT joined the
    // committed rareas list yet. (The desktop in-panel draft view REPLACES
    // AreaSelectedPanel's listing cards entirely while open — matching the
    // design mock — so there is nothing to assert about rendered cards at
    // this point; the URL-level check is the real proof.)
    expect(
      (urlParam(page, 'rareas') ?? '').split(','),
      'committed rareas must still be RR Nagar only while merely drafting',
    ).toEqual([AREA_RR_NAGAR_KEY]);

    // Commit.
    const commitButton = draftPanel.getByTestId('area-set-draft-panel-commit-cta');
    await expect(commitButton, '"Show listings" should appear once the draft is dirty').toBeVisible();
    await commitButton.click();

    // Committed AREA_SET scope, carrying BOTH area keys.
    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'commit should set rscope=areas', timeout: 10_000 })
      .toBe('areas');
    const committedAreas = (urlParam(page, 'rareas') ?? '').split(',');
    expect(committedAreas, 'committed rareas should include RR Nagar').toContain(AREA_RR_NAGAR_KEY);
    expect(committedAreas, 'committed rareas should include Deepanjali Nagar').toContain(AREA_DEEPANJALI_NAGAR_KEY);

    // The listings query must now be scoped to the COMMITTED AREA_SET, not
    // just the original single Area — Deepanjali Nagar's fixture listing
    // (which is NOT in RR Nagar) must now be visible.
    await expect(
      page.getByText('[E2E] Deepanjali Nagar Fixture Apartment'),
      "committing the AREA_SET must surface the newly-added area's own listing",
    ).toBeVisible({ timeout: 15_000 });

    // Truthful, reconciling count — RR Nagar's 2 fixture listings + Deepanjali
    // Nagar's 1 fixture listing = 3 cards, and the displayed "N shown for
    // sale" figure must agree with the actual rendered card count (the exact
    // Finding 2 defect this spec guards against: a draft/committed count
    // that visibly disagrees with what's actually rendered).
    await expect(
      listingCards,
      'committed AREA_SET should show RR Nagar (2) + Deepanjali Nagar (1) = 3 listings',
    ).toHaveCount(3, { timeout: 15_000 });
    const resultCountLabel = page.getByTestId('area-header-count');
    await expect(resultCountLabel).toContainText('3');
    await expect(resultCountLabel).toContainText(/shown for sale/i);
  });

  test('desktop: Cancel discards the draft — committed [RR Nagar] -> add Deepanjali Nagar -> Cancel -> reopen shows only RR Nagar, URL/results never changed', async ({
    page,
  }) => {
    await reachSingleAreaRrNagar(page);

    const listingCards = page.getByTestId('listing-card');
    await expect(listingCards).toHaveCount(2, { timeout: 15_000 });

    await page.getByTestId('area-set-add-nearby-tile').click();
    const draftPanel = page.getByTestId('area-set-draft-panel');
    await expect(draftPanel).toBeVisible({ timeout: 10_000 });

    const addDeepanjaliButton = draftPanel.getByTestId(
      `area-set-draft-panel-suggestion-${AREA_DEEPANJALI_NAGAR_KEY}-add`,
    );
    await expect(addDeepanjaliButton).toBeVisible({ timeout: 15_000 });
    await addDeepanjaliButton.click();
    await expect(draftPanel.getByTestId(`area-set-draft-panel-chip-${AREA_DEEPANJALI_NAGAR_KEY}`)).toBeVisible();

    // Cancel — must discard the added-but-uncommitted Deepanjali Nagar, not
    // just close the panel with it still sitting in the draft.
    await draftPanel.getByTestId('area-set-draft-panel-cancel').click();
    await expect(draftPanel).not.toBeVisible({ timeout: 10_000 });

    // Nothing committed changed — same single-Area scope, same 2 cards.
    expect(
      (urlParam(page, 'rareas') ?? '').split(','),
      'Cancel must never touch the committed scope',
    ).toEqual([AREA_RR_NAGAR_KEY]);
    await expect(listingCards, 'Cancel must never change the rendered result set').toHaveCount(2);

    // Reopen — the repro from team-lead's review: without the fix, Deepanjali
    // Nagar was STILL selected here even though it was never committed.
    await page.getByTestId('area-set-add-nearby-tile').click();
    const reopenedPanel = page.getByTestId('area-set-draft-panel');
    await expect(reopenedPanel).toBeVisible({ timeout: 10_000 });

    await expect(
      reopenedPanel.getByTestId(`area-set-draft-panel-chip-${AREA_DEEPANJALI_NAGAR_KEY}`),
      'reopened draft must NOT still carry the area discarded by Cancel',
    ).not.toBeVisible();
    // Only the committed area's chip remains, and the draft is not dirty —
    // no commit bar, since the reopened draft exactly matches committed.
    await expect(reopenedPanel.getByText(/1 of 3 selected/i).first()).toBeVisible();
    await expect(reopenedPanel.getByTestId('area-set-draft-panel-commit-cta')).not.toBeVisible();
  });
});
