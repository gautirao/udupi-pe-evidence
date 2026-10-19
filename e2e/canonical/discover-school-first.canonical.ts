/**
 * Discover school-first canonical specs — T7 (issue #1713, PR-3), T7b (#2860, see its own block below).
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

// ─────────────────────────────────────────────────────────────────────────
// T7b — #2860: a stale school-first groupId is dropped on school select and never resurrected on clear
// (legacy e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts). Select and clear are
// mutation-proven (MUT-2205-SEL, MUT-2205-CLR); select ATOMICITY (the URL never holds schoolId and groupId together,
// across every history write of the transition) is proven by the URL-transition recorder (MUT-CODEX-F1). The
// marker-scope checks span the whole select window but are a CONDITIONAL guard only: school-first is city scope in
// the reader as well, and no markers request was observed before the school select, so they carry no mutation
// credit (2205-16r NOT_PROVEN, see docs/testing/e2e-retirement-map-2860.md). Canonical substitution (D6):
// '[E2E] Koramangala Fixture Public School' (navigation-hierarchy-schools-agri-fixture-seed.sql) for Bethany High
// School, which is not in the canonical seed chain. south-premium is the V78 curated group containing Koramangala.
// ─────────────────────────────────────────────────────────────────────────

const STALE_GROUP_ID = 'south-premium';
const KORAMANGALA_SCHOOL = '[E2E] Koramangala Fixture Public School';
const KORAMANGALA_AREA_KEY = 'IN|KA|Bengaluru|Koramangala';

test('[role:user] T7b — school-first with a stale groupId: select drops groupId, change-school never resurrects it (marker scope: conditional guard only, no pre-select traffic observed)', async ({ page }) => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T7b] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }

  // 2205-16r collector — installed BEFORE navigation and read only after the post-select URL and summary band have
  // settled, so it spans every URL write of the select transition. School-first marker scope is CITY
  // (markerScope.ts), so a city-wide markers request is expected; what must never happen is a GROUP- or NODE-scoped
  // one. Group scope travels on the wire as repeated areaKeys= (never groupId=), node scope as nodeKey=.
  const markerRequestUrls: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.endsWith('/api/discover/markers')) markerRequestUrls.push(req.url());
  });

  // 2205-07 URL-transition recorder — installed BEFORE navigation. Records the URL after EVERY history
  // pushState/replaceState/popstate in the page (an init script, so it wraps history before the app boots), plus
  // every main-frame navigation Playwright reports. A two-step select (schoolId written first, groupId deleted in a
  // later write) leaves a recorded URL holding both params even though the FINAL URL looks correct.
  await page.addInitScript(() => {
    const w = window as unknown as { __t7bUrlLog: string[] };
    w.__t7bUrlLog = [window.location.href];
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      origPush(data, unused, url);
      w.__t7bUrlLog.push(window.location.href);
    };
    window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      origReplace(data, unused, url);
      w.__t7bUrlLog.push(window.location.href);
    };
    window.addEventListener('popstate', () => w.__t7bUrlLog.push(window.location.href));
  });
  const frameNavUrls: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) frameNavUrls.push(frame.url());
  });

  await page.goto(`/discover?city=bangalore&journey=school-first&groupId=${STALE_GROUP_ID}`);

  // 2205-01..04: the school-first shell, on the stale-group URL, with no school yet.
  await expect(page.getByTestId('discover-schools-journey-panel-shell')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('discover-areas-journey-panel-shell')).toHaveCount(0);
  const onLoad = new URL(page.url()).searchParams;
  expect(onLoad.get('groupId'), 'precondition: the stale groupId is on the URL').toBe(STALE_GROUP_ID);
  expect(onLoad.get('journey')).toBe('school-first');
  expect(onLoad.get('schoolId'), 'precondition: no school selected yet').toBeNull();

  // 2205-05/06: search arm BEFORE fill (no debounce: one request per value; q= is the query param).
  const searchInput = page.getByTestId('school-search-input');
  await expect(searchInput).toBeVisible({ timeout: 10_000 });
  const searchResp = page.waitForResponse(
    (r) => {
      const u = new URL(r.url());
      return (
        u.pathname.endsWith('/api/public/schools/search') &&
        r.request().method() === 'GET' &&
        /koramangala fixture/i.test(u.searchParams.get('q') ?? '')
      );
    },
    { timeout: 15_000 },
  );
  await searchInput.fill('Koramangala Fixture');
  expect((await searchResp).ok(), 'school search must respond 2xx').toBe(true);
  const schoolCard = page.getByTestId('school-card').filter({ hasText: KORAMANGALA_SCHOOL });
  await expect(schoolCard).toBeVisible({ timeout: 10_000 });

  // 2205-07: select drops groupId in the same write that sets schoolId.
  const preSelectMarkerCount = markerRequestUrls.length;
  await schoolCard.click();
  await expect(page, 'school select must set schoolId AND drop the stale groupId').toHaveURL(
    (u) => u.searchParams.get('schoolId') !== null && u.searchParams.get('groupId') === null,
    { timeout: 10_000 },
  );
  const afterSelect = new URL(page.url()).searchParams;
  expect(afterSelect.get('journey'), 'select keeps journey=school-first').toBe('school-first');
  expect(afterSelect.get('schoolId'), 'select writes a schoolId').not.toBeNull();
  expect(afterSelect.get('areaKey'), 'select writes the school\'s own areaKey').toBe(KORAMANGALA_AREA_KEY);
  await expect(page.getByTestId('school-summary-band').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

  // The select transition has settled (post-select URL + summary band). Snapshot both collectors HERE, so the
  // window runs from before navigation through every URL write of the select.
  const selectWindowMarkerUrls = [...markerRequestUrls];
  const historyUrls = await page.evaluate(() => (window as unknown as { __t7bUrlLog?: string[] }).__t7bUrlLog ?? []);
  const transitionUrls = [...historyUrls, ...frameNavUrls];

  // 2205-07 atomicity (URL-transition oracle): the recorder must have seen the stale-group load AND the select
  // write (non-vacuity), and NO recorded URL may ever hold schoolId and groupId together.
  expect(
    transitionUrls.some((u) => new URL(u).searchParams.get('groupId') === STALE_GROUP_ID),
    `recorder must have seen the stale-group URL: ${JSON.stringify(transitionUrls)}`,
  ).toBe(true);
  expect(
    historyUrls.some((u) => new URL(u).searchParams.get('schoolId') !== null),
    `history recorder must have seen the select write: ${JSON.stringify(historyUrls)}`,
  ).toBe(true);
  const bothParamsUrls = transitionUrls.filter((u) => {
    const p = new URL(u).searchParams;
    return p.has('schoolId') && p.has('groupId');
  });
  expect(bothParamsUrls, 'the URL must never hold schoolId AND groupId together (select is one atomic write)').toEqual([]);

  // 2205-16r over the whole select window (before navigation -> settled select): no markers request carries a group-
  // or node-scope wire shape. CONDITIONAL GUARD: school-first is city scope in the reader too, so these hold even if
  // the writer regressed; they carry mutation credit only if markers traffic was actually observed (counts annotated).
  test.info().annotations.push({
    type: 'T7b-markers-requests',
    description: `preSelect=${preSelectMarkerCount} selectWindow=${selectWindowMarkerUrls.length}`,
  });
  const memberKeys = ['IN|KA|Bengaluru|Koramangala', 'IN|KA|Bengaluru|Jayanagar', 'IN|KA|Bengaluru|HSR Layout'];
  for (const url of selectWindowMarkerUrls) {
    const p = new URL(url).searchParams;
    const scopeValues = [...p.getAll('areaKeys'), ...p.getAll('nodeKey')];
    for (const key of memberKeys) {
      expect(scopeValues.some((v) => v.includes(key)), `markers request must not be scoped to south-premium member ${key}: ${url}`).toBe(false);
    }
    expect(p.getAll('areaKeys'), `select-window markers request must not be group-scoped (areaKeys=): ${url}`).toEqual([]);
    expect(p.has('nodeKey'), `select-window markers request must not be node-scoped (nodeKey=): ${url}`).toBe(false);
    expect(p.has('groupId'), `select-window markers request must not carry groupId=: ${url}`).toBe(false);
  }

  // 2205-12..15: change school clears the school and never resurrects the stale groupId.
  const changeSchool = page.getByTestId('change-school-btn').filter({ visible: true }).first();
  await expect(changeSchool).toBeVisible({ timeout: 10_000 });
  await changeSchool.click();
  await expect(page, 'change school must clear schoolId').toHaveURL((u) => u.searchParams.get('schoolId') === null, { timeout: 10_000 });
  const afterClear = new URL(page.url()).searchParams;
  expect(afterClear.get('groupId'), 'change school must never resurrect the stale groupId').toBeNull();
  expect(afterClear.get('journey'), 'change school keeps journey=school-first').toBe('school-first');

  // 2205-16r (whole test): no markers request at all may carry groupId on the wire. The group/node-scope checks for
  // the select window ran above.
  // NON-VACUITY NOT AVAILABLE (recorded NOT_PROVEN in docs/testing/e2e-retirement-map-2860.md): the #2860 DEV RUN
  // (37a019cf) observed ZERO markers requests in the pre-select window, so a ">= 1" assertion fails at base and was
  // dropped per the approved plan; the scope assertions stay as a guard, and the observed counts are attached as
  // annotations on every run so the window's traffic is evidence, not an assumption.
  test.info().annotations.push({ type: 'T7b-markers-requests-total', description: `total=${markerRequestUrls.length}` });
  for (const url of markerRequestUrls) {
    expect(new URL(url).searchParams.has('groupId'), `markers request must not carry groupId: ${url}`).toBe(false);
  }
});
