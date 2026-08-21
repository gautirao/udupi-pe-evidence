/**
 * Discover school-first canonical spec — T7 (issue #1713, PR-3).
 *
 * Fixture dependency: the area-first fixture chain (see discover-area-first.canonical.ts's
 * docstring) PLUS scripts/db/fixtures/navigation-hierarchy-schools-agri-fixture-seed.sql
 * (part (b) — 2 schools resolved by the real V80 trigger into RR Nagar / Vijayanagar, both
 * AREA leaves under d:southeast). See e2e/canonical/README.md for the full ordered sequence.
 *
 * PLAN CORRECTIONS THIS FILE REFLECTS:
 *   c1 — session-restored wait is waitForResponse+resp.ok() on the real navigation/resolve
 *        request (same mechanism as T4/T5), never a header-control visibility check.
 *   c2 — schools placed inside Bangalore's seeded nav-node areas (the pre-existing 27-school
 *        dataset has none inside them — see PR-3's fixture seed docstring).
 *   c4 — supersedes approved-plan.toml's 'Showing {n} of {n} schools' assertion, which does not
 *        exist in source; SchoolsNavigationJourneyPanel.tsx:140-143 renders a plain
 *        "{n} school(s)" count, no "Showing ... of ..." wrapper.
 *
 * WHY THIS TEST STAYS AT NODE LEVEL (node=d:southeast), NOT AN AREA DRILL-DOWN:
 * isSchoolsNavNodeLevel (useDiscoverNavigationController.ts:75) is
 * `nav.journey === 'school-first' && !nav.areaKey && !nav.schoolId` — selecting an AREA leaf
 * clears this and falls through to the LEGACY branch (SchoolsInAreaPanel), which is already
 * component-tested at SchoolsInAreaPanel.school-first-redesign.test.tsx (per team-lead-plan.toml
 * tests.T7.intent). Staying at the DIRECTION node keeps this test on the canonical
 * 'discover-schools-journey-panel-shell' the whole way through.
 *
 * BRANCH CHOSEN (documented per team-lead-plan.toml's implementer_note): d:southeast has 3 AREA
 * children directly (no CLUSTER ancestor), so SchoolsNavigationJourneyPanel renders its
 * NavigationLevelPanel branch (SchoolsNavigationJourneyPanel.tsx:290-301, countKind="schools"),
 * NOT the cluster-focus branch (SchoolsNavigationJourneyPanel.tsx:139-209) — that branch only
 * renders when `focusedClusterMemberAreaKeys` is set, which nothing in this test does. The
 * 'schools-cluster-focus-heading-schools' testid team-lead-plan.toml cites as an example
 * therefore does NOT apply to this node; the real node-scoped count surface for this branch is
 * NavigationLevelPanel's own 'navigation-level-heading' container
 * (NavigationLevelPanel.tsx:144-199), which is what this test scopes its count assertion to
 * instead of a loose page-wide text match.
 *
 * HOW REAL SCHOOL NAMES BECOME ASSERTABLE WITHOUT LEAVING NODE LEVEL: the school SEARCH box
 * (school-search-input, same SchoolsNavigationJourneyPanel component, same shell) is LOCAL state
 * that does not touch nav.areaKey/nav.journey — typing >=2 chars switches this component's OWN
 * isSearching branch to render literal SchoolCard results (SchoolJourneyPanels.tsx's SchoolCard,
 * `school.name`), while the outer 'discover-schools-journey-panel-shell' stays mounted throughout.
 * This is the real, non-vacuous surface for "REAL seeded school names visible by literal string"
 * at node level.
 */
import { test, expect } from './support/canonical-test';
import { hasRealCredentials } from '../helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

test('[role:user] T7 — school-first canonical node= renders the real school shell, a real count, and real seeded school names', async ({ page }) => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T7] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }

  const resolvePromise = page.waitForResponse(
    (resp) => {
      if (!resp.url().includes('/navigation/resolve')) return false;
      if (resp.request().method() !== 'GET') return false;
      return new URL(resp.url()).searchParams.get('node') === 'd:southeast';
    },
    { timeout: 15_000 },
  );
  await page.goto(
    '/discover?city=bangalore&journey=school-first&node=' + encodeURIComponent('d:southeast'),
  );
  const resolveResponse = await resolvePromise;
  // 2xx is ALSO the session-restore proof per c1.
  expect(resolveResponse.ok(), 'd:southeast navigation/resolve must respond 2xx').toBe(true);

  // The SCHOOL shell is mounted — and NOT the areas shell (mutually exclusive per
  // DiscoverPanelSurface.tsx's branch order).
  await expect(page.getByTestId('discover-schools-journey-panel-shell')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('discover-areas-journey-panel-shell')).toHaveCount(0);

  // Real, non-vacuous count: nodeCount.schoolCount is a real server-computed aggregate over the
  // d:southeast subtree, backed by the fixture schools seeded into RR Nagar/Vijayanagar. Scoped
  // to the heading container per the branch note above (never a loose page-wide match). Parsed to
  // an integer and asserted > 0 — a bare /\d+\s*schools?/i regex match is NOT sufficient here: it
  // matches "0 schools" identically to any positive count, so it would pass unchanged against a
  // regressed/empty node aggregate. The explicit > 0 check is what actually proves the count
  // cannot read empty against a working backend.
  const heading = page.getByTestId('navigation-level-heading');
  await expect(heading).toBeVisible({ timeout: 10_000 });
  await expect(heading).toHaveText(/\d+\s*schools?/i);
  const headingText = await heading.innerText();
  const schoolCountMatch = headingText.match(/(\d+)\s*schools?/i);
  expect(schoolCountMatch, `heading must contain a parseable school count, got "${headingText}"`).not.toBeNull();
  const parsedSchoolCount = parseInt(schoolCountMatch![1], 10);
  expect(Number.isFinite(parsedSchoolCount), `school count must be a real number, got "${headingText}"`).toBe(true);
  expect(parsedSchoolCount, 'd:southeast school count must be > 0, not merely present').toBeGreaterThan(0);

  // Real seeded school names, via the in-shell search box (see docstring above for why this is
  // the correct node-level surface rather than an area drill-down).
  const searchPromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/public/schools/search') && resp.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.getByTestId('school-search-input').fill('RR Nagar Fixture');
  const searchResponse = await searchPromise;
  expect(searchResponse.ok(), 'school search must respond 2xx').toBe(true);

  await expect(
    page.getByTestId('school-card').filter({ hasText: '[E2E] RR Nagar Fixture Public School' }),
  ).toBeVisible({ timeout: 10_000 });
});
