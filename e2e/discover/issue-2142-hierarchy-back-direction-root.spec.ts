/**
 * Bug fix — hierarchy Back missing at a top-level Direction (`d:central`).
 *
 * Verified pre-existing on `main` before #2147 (NOT a #2147 regression). The
 * old guard (`HierarchyBackButton.tsx`: `!node || node.ancestry.length === 0`
 * -> render nothing) treated an empty `ancestry` as "this is the city root",
 * but a top-level DIRECTION also reports `ancestry: []` on the wire (it is
 * simply never backed by a persisted `NavigationNode` row for its own
 * synthetic-root parent) — so the Back control silently vanished at every
 * Direction, not only at the true root.
 *
 * `resolveHierarchyBackDestination` (`hierarchyBackDestination.ts`) now
 * distinguishes the two cases: the true ROOT still renders no control; a
 * DIRECTION with no ancestry parent falls back to the synthetic city root.
 *
 * Covers both reproducers from the bug report:
 *   - `d:central` with `schoolPicking=1` (school-first journey)
 *   - `d:central` on ordinary canonical (area-first) navigation
 * and proves the existing guarded POP/REPLACE history mechanism
 * (`hierarchy_back_guarded_pop` ruling) is unchanged: clicking Back still
 * leaves browser Forward able to restore the Direction.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const D_CENTRAL = 'd:central';

function directionCardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

test.describe('@integration-ui #2142 — hierarchy Back at a top-level Direction', () => {
  test('area-first: d:central renders "Back to Bangalore", clicking it reaches root, and browser Forward restores d:central', async ({
    page,
  }) => {
    await page.goto(`/discover?city=${CITY}&journey=area-first`);
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId(directionCardTestId(D_CENTRAL)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_CENTRAL);

    const backButton = page.getByTestId('areas-hierarchy-back');
    await expect(backButton).toBeVisible({ timeout: 10_000 });
    await expect(backButton).toHaveText(/Back to Bangalore/i);

    await backButton.click();
    await expect.poll(() => currentNodeParam(page)).toBeNull();

    // Browser Forward must restore d:central — proves the fix reused the
    // existing guarded POP/REPLACE mechanism rather than a second URL writer
    // or a blind history.back()/navigate(-1).
    await page.goForward();
    await expect.poll(() => currentNodeParam(page)).toBe(D_CENTRAL);
  });

  test('school-first (schoolPicking=1): d:central renders the same "Back to Bangalore" control and it navigates to root', async ({
    page,
  }) => {
    await page.goto(`/discover?city=${CITY}&journey=school-first`);
    await expect(page.getByTestId('discover-schools-journey-panel-shell')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId(directionCardTestId(D_CENTRAL)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_CENTRAL);

    const backButton = page.getByTestId('areas-hierarchy-back');
    await expect(backButton).toBeVisible({ timeout: 10_000 });
    await expect(backButton).toHaveText(/Back to Bangalore/i);

    await backButton.click();
    await expect.poll(() => currentNodeParam(page)).toBeNull();
  });
});
