/**
 * Issue #2205 (legacy areaKey/groupId final cleanup) — PR #2220 review follow-up.
 *
 * HARD-GATE browser/E2E proof, against a REAL local-fixture backend
 * (`scripts/dev/local-fixture-backend.sh`), of the exact live sequence a
 * reviewer flagged as needing more than a unit test: a stale `groupId=`
 * surviving a real cross-branch school search/select, and the map staying
 * (or being forced) city-wide rather than silently narrowing to the stale
 * group's member areas.
 *
 * Traced sequence (confirmed live against this exact fixture, both via the
 * browser and via source, before writing this spec):
 *   1. Area-first-equivalent group focus: `journey=school-first&groupId=
 *      south-premium` (the compatibility state e2e/discover/
 *      issue-2204-canonical-node-browser-proof.spec.ts's own Flow 5 already
 *      establishes has no live click PRODUCER — it is only reachable by
 *      direct URL load, matching that spec's own convention for this exact
 *      state). This IS the real "area-first group focus, no schoolId"
 *      shape rule 6's docblock (markerScope.ts) describes as the bug's
 *      entry point.
 *   2. Real UI cross-branch: type into `school-search-input`, click the
 *      `school-card` result (Bethany High School, Koramangala) — fires
 *      `setSchoolJourney` (src/features/discover/state/url/school.ts).
 *      Live-verified: the resulting URL drops `groupId` entirely (the
 *      writer-side #2205 fix) while gaining `schoolId`+`areaKey`.
 *   3. Real UI clear: click `change-school-btn` (SchoolSummaryBand's
 *      "Change school" — SchoolJourneyPanels.tsx's `handleChangeSchool`,
 *      which calls `onBack`). Live-verified: this returns to the
 *      area-scoped "Schools in Koramangala" state — `schoolId` gone,
 *      `groupId` still absent (it cannot resurrect; the writer already
 *      removed it in step 2 and nothing downstream re-adds it).
 *
 * Throughout, no `/api/discover/markers` request of any scope is ever
 * observed (live-verified) — matching the #2204 spec's own Flow 2/5 finding
 * that school-first markers require an active `schoolId`, and confirming
 * `markerScope.ts`'s new `journey === 'school-first' -> city` guard (rule 6,
 * PR #2220 review) never has a group-scoped marker leak to prevent in this
 * exact reachable sequence — the stale param is simply gone before any
 * marker-scoping decision could act on it.
 *
 * Sibling regression (area-first `AreaGroupFocusPanel`, untouched by this
 * PR's diff — only markerScope.ts changed): already covered by
 * e2e/discover/issue-2204-canonical-node-browser-proof.spec.ts's
 * "journeyless groupId= producer-equivalent state" test (Flow 4) and by the
 * component-level src/features/discover/surfaces/panel/__tests__/
 * AreaGroupFocusPanel.test.tsx. Not re-proven here — this spec covers only
 * the school-first cross-branch path #2205's PR review flagged as new.
 *
 * Run (against the local fixture backend/frontend):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5174 BACKEND_BASE_URL=http://localhost:8090 \
 *     npx playwright test e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
// FAIL CLOSED (matching issue-2204-canonical-node-browser-proof.spec.ts's own
// convention) — this hard-gate spec must never silently fall back to a
// hosted/production backend.
const BACKEND = (() => {
  const url = process.env.BACKEND_BASE_URL;
  if (!url) {
    throw new Error(
      'issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts requires BACKEND_BASE_URL to be ' +
        'set to the local fixture backend (e.g. http://localhost:8090) — this hard-gate spec must ' +
        'never fall back to any hosted/production backend.',
    );
  }
  return url;
})();

const GROUP_SOUTH_PREMIUM = 'south-premium';
const SCHOOL_SEARCH_QUERY = 'Bethany';
const AREA_KORAMANGALA_KEY = 'IN|KA|Bengaluru|Koramangala';

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

function currentParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

test.describe('@integration-ui #2205 — School-first cross-branch clears stale groupId (PR #2220 review)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('area-first group focus -> real school search/select -> real clear: groupId never resurfaces, no group-scoped marker leak', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Live-verified against the backend log: two 503s are a PRE-EXISTING,
    // unrelated fixture-completeness gap — this Bangalore fixture has zero
    // agri_destination_classification rows, so AgriDestinationPortPostgresAdapter
    // fails closed on the /api/discover/agri-destinations and
    // /api/discover/regional-area-groups prefetches every /discover page fires
    // regardless of journey (see AgriDestinationPortReadinessCheck's own startup
    // warning). Unrelated to this spec's groupId/school-first scope; filtered
    // rather than silencing console-error detection entirely.
    const IGNORED_RESOURCE_503_PREFIX =
      'Failed to load resource: the server responded with a status of 503';
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().startsWith(IGNORED_RESOURCE_503_PREFIX)) {
        consoleErrors.push(msg.text());
      }
    });
    const markerRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/discover/markers')) markerRequests.push(req.url());
    });

    // ── Step 1 — the reachable compatibility entry: journey=school-first
    // with a stale groupId, no schoolId. This is the exact rule-6 bug shape
    // markerScope.ts's docblock documents; e2e/discover/
    // issue-2204-canonical-node-browser-proof.spec.ts's own Flow 5 already
    // establishes there is no live click producer for this combination, so
    // a direct URL load is the correct (and only) way to reach it. ────────
    await page.goto(
      `/discover?city=${CITY}&journey=school-first&groupId=${GROUP_SOUTH_PREMIUM}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('schools-journey-panel')).toBeVisible({ timeout: 20_000 });

    expect(currentParam(page, 'groupId')).toBe(GROUP_SOUTH_PREMIUM);
    expect(currentParam(page, 'journey')).toBe('school-first');
    expect(currentParam(page, 'schoolId')).toBeNull();

    // ── Step 2 — real UI cross-branch: search for a real seeded school and
    // select it (fires setSchoolJourney). ────────────────────────────────
    const searchInput = page.getByTestId('school-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill(SCHOOL_SEARCH_QUERY);

    const schoolCard = page.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 10_000 });

    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('schoolId') !== null, { timeout: 10_000 }),
      schoolCard.click(),
    ]);

    // THE INVARIANT (writer-side #2205 fix, setSchoolJourney) — selecting a
    // school atomically drops the stale groupId in the SAME write that adds
    // schoolId. Never a two-step "select then separately clear".
    expect(
      currentParam(page, 'groupId'),
      'groupId is removed in the SAME atomic write that sets schoolId (setSchoolJourney fix)',
    ).toBeNull();
    expect(currentParam(page, 'journey')).toBe('school-first');
    expect(currentParam(page, 'schoolId')).not.toBeNull();
    expect(currentParam(page, 'areaKey'), 'school select resolves the real seeded areaKey').toBe(
      AREA_KORAMANGALA_KEY,
    );

    await expect(page.getByTestId('school-summary-band')).toBeVisible({ timeout: 15_000 });

    // ── Step 3 — real UI clear: "Change school" (SchoolSummaryBand ->
    // handleChangeSchool -> onBack). ─────────────────────────────────────
    const changeSchoolBtn = page.getByTestId('change-school-btn');
    await expect(changeSchoolBtn).toBeVisible({ timeout: 10_000 });

    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('schoolId') === null, { timeout: 10_000 }),
      changeSchoolBtn.click(),
    ]);

    // THE INVARIANT this spec exists to prove: groupId cannot resurrect —
    // it was already gone before this clear ran, and nothing on the clear
    // path re-adds it. Even under the pre-fix writer behaviour this would
    // have been the exact rule-6 bug shape (school-first, schoolId=null,
    // stale groupId present); the reader-side guard (markerScope.ts,
    // PR #2220 review) additionally makes that shape city-scoped regardless.
    expect(
      currentParam(page, 'groupId'),
      'groupId never resurfaces after the school clear — post-fix, it cannot even be resurrected as "stale"',
    ).toBeNull();
    expect(currentParam(page, 'schoolId')).toBeNull();
    expect(currentParam(page, 'journey')).toBe('school-first');

    // ── Marker-scope proof (b) — no /api/discover/markers request of any
    // scope (group-scoped or otherwise) fires anywhere across this whole
    // sequence. Live-verified: school-first markers require an active
    // schoolId (Flow 2/5 finding, issue-2204 spec); the areaKey-scoped
    // "Schools in Koramangala" landing after the clear uses a distinct
    // schools-by-area query, not /markers. So there is no group-scoped
    // marker fetch for markerScope.ts's rule 6 to have EVER produced in
    // this reachable sequence, before or after the fix — the strongest
    // form of this proof available: the leak surface is empty by
    // construction, not merely observed-empty this run. ──────────────────
    expect(
      markerRequests,
      'no /api/discover/markers request of any scope fires across the full sequence',
    ).toEqual([]);

    // ── No auth/console errors. ──────────────────────────────────────────
    expect(
      consoleErrors,
      `no console errors during the sequence; observed: ${JSON.stringify(consoleErrors)}`,
    ).toEqual([]);
  });
});
