/**
 * Discover panel-exclusivity canonical spec — T18 (issue #1713, PR-3).
 *
 * Cross-journey INVARIANT: exactly one primary right-panel surface is ever mounted, and it is
 * the one the URL shape is DECLARED to resolve to (DiscoverPanelSurface.tsx:35-40, "Exactly one
 * panel is ever mounted"). Written LAST in this slice because its expectation table depends on
 * T4-T9's URL shapes already being settled (team-lead-plan.toml sequencing.step_3).
 *
 * PLAN CORRECTIONS THIS FILE REFLECTS:
 *   c3 — LegacyRightPanelBridge is ALIVE (DiscoverPanelSurface.tsx:3,86), not retired. There are
 *        FOUR mutually-exclusive branches, not three: group-focus, area-first,
 *        school-first-node-level, legacy fallback (DiscoverPanelSurface.tsx:62-87). This file's
 *        surface table and its "exactly one of four" tier-2 assertion both model all four.
 *   c6 — agri-first resolves to the LEGACY branch (no canonical agri shell exists) — see
 *        discover-agri-first.canonical.ts's docstring for the full mechanism. Modelled here too.
 *
 * MODEL SOURCE (team-lead-plan.toml tests.T18.model_on): mirrors `assertExactlyOnePrimarySurface`
 * at e2e/discover/issue-1956-pr6-absence-discipline.spec.ts:116-128, generalised from that file's
 * two-way `'legacy' | 'canonical'` model to the FOUR branches DiscoverPanelSurface.tsx:62-87
 * actually routes today (correction c3 — LegacyRightPanelBridge is NOT retired, so "canonical vs.
 * legacy" is no longer a two-way split). This file's `assertExactlyOnePrimarySurface` keeps that
 * helper's two-tier shape (an expected-surface strong check plus an unconditional exclusivity
 * check) but widens both to sum across all four `SURFACE_TESTIDS` instead of one legacy testid
 * and one canonical-family locator.
 *
 * TESTIDS ARE IRREPLACEABLE HERE (documented exception to the prefer-getByRole rule): component
 * IDENTITY is the assertion this test exists to make — which exact panel COMPONENT mounted, not
 * what visible text it happens to render. A getByRole/getByText query could accidentally match
 * text that migrated between panels and mask exactly the kind of both-mounted/wrong-mounted
 * regression this test exists to catch.
 *
 * TWO-TIER ASSERTION (mandatory, team-lead-plan.toml tests.T18.two_tier_assertion):
 *   Tier 1 (STRONG): for each URL, the table's expected testid is mounted.
 *   Tier 2 (WEAK BUT UNCONDITIONAL): for each URL, the SUM of all four testids' counts is
 *     exactly 1 — asserted independently of the table, so a table gone stale still catches a
 *     genuine double-mount (the PR5_PRECEDENT class) instead of silently passing nothing.
 *
 * N1/N2/N3 (qa-fast pre-implementation scan digest, forwarded verbatim in this issue's handoff):
 *   N1 (VACUOUS-PASS HOLE) — closed. Every URL row below additionally asserts a REAL,
 *      data-bearing signal specific to that branch (not just component identity): the area-first
 *      row asserts real Direction labels; the school-first row asserts a real school count; the
 *      agri-first row asserts a real non-zero parcel count (mirrors T8's assertion exactly); the
 *      group-focus row asserts the real curated group name. A branch that mounted the right
 *      component but rendered EMPTY still fails this test, unlike an identity-only design.
 *   N2 (ZERO-MOUNT) — a child component early-returning `null` after the surface selected its
 *      branch would make ALL FOUR testids read 0, which the tier-2 `=== 1` assertion already
 *      fails on its own (0 !== 1) — no separate handling needed. This is treated as a REAL
 *      regression signal (a transient loading state renders its OWN shell wrapper testid, e.g.
 *      'discover-areas-journey-panel-shell', even while its content is still loading — the shell
 *      itself does not null-return), not a legitimate transient to wait past.
 *   N3 (MOBILE/DESKTOP) — this spec runs under whatever Playwright project selects it
 *      (`canonical-user`, per its [role:user] tag) at that project's configured desktop viewport
 *      (playwright.canonical.config.ts) — explicitly NOT asserting or assuming a mobile
 *      `isMobileShell` layout. A future mobile-viewport project would need its own pass/citation
 *      here rather than silently inheriting this one.
 *
 * Fixture dependency: the full PR-3 seed chain (area-first + schools + agri) — see
 * e2e/canonical/README.md. groupId=tech-corridor is a pre-existing curated Bangalore area group
 * (scripts/db/fixtures/discover-smoke-seed.sql-era data, live-verified present: `SELECT id, slug,
 * name FROM area_groups WHERE city_id = 1` returns id=1/slug='tech-corridor'/name='Tech
 * Corridor').
 */
import { test, expect } from './support/canonical-test';
import type { Page } from './support/canonical-test';
import { hasRealCredentials } from '../helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

const SURFACE_TESTIDS = [
  'area-group-focus-panel',
  'discover-areas-journey-panel-shell',
  'discover-schools-journey-panel-shell',
  'discover-right-panel',
] as const;

async function assertExactlyOnePrimarySurface(page: Page, expectedTestId: (typeof SURFACE_TESTIDS)[number]) {
  // Tier 1 — STRONG: the table's expected testid is mounted.
  await expect(page.getByTestId(expectedTestId)).toBeVisible({ timeout: 10_000 });

  // Tier 2 — WEAK BUT UNCONDITIONAL: exactly one of the four testids is present, summed
  // independently of which one the table predicted. Never `>= 1`, never "the expected one is
  // visible" alone — a both-mounted regression only fails if the OTHERS are asserted absent too.
  let total = 0;
  for (const testId of SURFACE_TESTIDS) {
    total += await page.getByTestId(testId).count();
  }
  expect(total, `exactly one primary surface must be mounted, got ${total} (testids: ${SURFACE_TESTIDS.join(', ')})`).toBe(1);
}

test.beforeEach(() => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T18] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }
});

test('[role:user] T18 — bare city URL (area-first) mounts exactly the areas shell, with real data', async ({ page }) => {
  const resolvePromise = page.waitForResponse(
    (resp) => resp.url().includes('/navigation/resolve') && resp.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto('/discover?city=bangalore');
  const resolveResponse = await resolvePromise;
  expect(resolveResponse.ok()).toBe(true);

  await assertExactlyOnePrimarySurface(page, 'discover-areas-journey-panel-shell');
  // Data-bearing (N1): real fixture Direction label.
  await expect(page.getByText('South-East Bangalore', { exact: true })).toBeVisible({ timeout: 10_000 });
  // #2860 (legacy 1468 AC8, rows 1468-52..54): no agri sub-panel leaks into area-first. Negative assertions,
  // discriminated by the pair rule: the same three testids are asserted PRESENT in T8b
  // (discover-agri-first.canonical.ts), and the Direction label above proves the panel is not blank.
  await expect(page.getByTestId('agri-group-locality-panel')).toHaveCount(0);
  await expect(page.getByTestId('agri-listing-peek')).toHaveCount(0);
  await expect(page.getByTestId('agri-group-selected-panel')).toHaveCount(0);
});

test('[role:user] T18 — a Direction node (area-first) mounts exactly the areas shell, with real children', async ({ page }) => {
  const resolvePromise = page.waitForResponse(
    (resp) => {
      if (!resp.url().includes('/navigation/resolve')) return false;
      return new URL(resp.url()).searchParams.get('node') === 'd:southeast';
    },
    { timeout: 15_000 },
  );
  await page.goto('/discover?city=bangalore&node=' + encodeURIComponent('d:southeast'));
  const resolveResponse = await resolvePromise;
  expect(resolveResponse.ok()).toBe(true);

  await assertExactlyOnePrimarySurface(page, 'discover-areas-journey-panel-shell');
  await expect(page.getByText('RR Nagar', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
});

test('[role:user] T18 — a school-first node mounts exactly the schools shell, with a real count', async ({ page }) => {
  const resolvePromise = page.waitForResponse(
    (resp) => {
      if (!resp.url().includes('/navigation/resolve')) return false;
      return new URL(resp.url()).searchParams.get('node') === 'd:southeast';
    },
    { timeout: 15_000 },
  );
  await page.goto(
    '/discover?city=bangalore&journey=school-first&node=' + encodeURIComponent('d:southeast'),
  );
  const resolveResponse = await resolvePromise;
  expect(resolveResponse.ok()).toBe(true);

  await assertExactlyOnePrimarySurface(page, 'discover-schools-journey-panel-shell');
  await expect(page.getByTestId('navigation-level-heading')).toHaveText(/\d+\s*schools?/i);
});

test('[role:user] T18 — agri-first region+maxKm mounts exactly the legacy panel (c6), with real non-zero data', async ({ page }) => {
  const agriPromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/discover/agri-destinations') && resp.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto('/discover?city=bangalore&journey=agri-first&region=SW&maxKm=25');
  const agriResponse = await agriPromise;
  expect(agriResponse.ok(), 'agri-destinations must respond 2xx (not the 503 not-yet-promoted code)').toBe(true);

  await assertExactlyOnePrimarySurface(page, 'discover-right-panel');
  const countText = await page.getByTestId('agri-group-listing-count').innerText();
  expect(parseInt(countText.trim(), 10)).toBeGreaterThan(0);
});

test('[role:user] T18 — groupId-only mounts exactly the group-focus panel, with the real curated group name', async ({ page }) => {
  await page.goto('/discover?city=bangalore&groupId=tech-corridor');
  // No single canonical resolve/data endpoint is guaranteed for the legacy group-focus branch the
  // way the other four rows have one — the session-restore/real-backend proof here is the
  // afterEach assertBackendTrafficWasReal auto-fixture (canonical-test.ts) plus the real curated
  // group NAME assertion below, which cannot render without a real backend response.
  await assertExactlyOnePrimarySurface(page, 'area-group-focus-panel');
  await expect(page.getByText('Tech Corridor', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
});
