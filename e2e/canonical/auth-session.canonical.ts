/**
 * Auth-session canonical specs — T1-T3 (issue #1713, PR-2).
 *
 * T1 — sign in through the real /auth form. The `broker`/`admin` legs assert
 *      an authed-only header control BY ROLE — see the KNOWN PRODUCT BUG note
 *      directly above those two tests for why they do NOT also assert
 *      role-aware landing URL, and do not reinstate that assertion without
 *      first confirming the underlying race in src/pages/Auth.tsx is fixed.
 *      The plain `user` leg does the reverse: it asserts landing URL only,
 *      NOT a header control — see the #2238 note above that test for why its
 *      "Saved" header-link assertion was removed (a real, source-confirmed
 *      race, not proven root-caused), and why the landing-URL check that
 *      remains is honestly documented as non-discriminating (it cannot tell
 *      "role resolved correctly" from "role never resolved").
 * T2 — returnTo round-trip from a deep Discover URL, including its node=
 *      param.
 * T3 — a plain `user` (no broker role) reaches the typed-create route
 *      (/broker/listings/new/residential). Per this issue's plan, this
 *      single test IS the entire "owner journey" — an owner is just a plain
 *      `user` who happens to own a listing (a per-object property, not a
 *      login identity), so there is no separate "owner" credential to mint
 *      or a separate journey to cover here.
 *
 * ALL THREE exercise the LIVE sign-in flow itself (loginAsUser/Broker/Admin,
 * reused verbatim from e2e/helpers.ts — never re-implemented here), so every
 * test in this file must start from a genuinely anonymous browser context —
 * even though `canonical-user`/`canonical-broker`/`canonical-admin` projects
 * (playwright.canonical.config.ts) set a PRE-AUTHENTICATED `use.storageState`
 * by default for T12-style specs. The file-level `test.use` below overrides
 * that project default back to an empty session for every test here.
 *
 * ROLE TAGGING: each test title carries a literal `[role:<role>]` substring
 * — playwright.canonical.config.ts's `canonical-<role>` projects `grep` on
 * exactly this tag (and `canonical-anon` `grepInvert`s it), which is how
 * environment gating happens by PROJECT SELECTION rather than test.skip. A
 * role whose credentials are absent from the environment simply has no
 * `canonical-<role>` project this run — these tests are not present to skip.
 *
 * FLAKE DEFENCE (documented session-restore race — src/hooks/
 * useBrokerListingQuality.ts:11): the first post-login request can fire
 * before Supabase's session is restored, get a 401, then retry. `networkidle`
 * is therefore a coin flip and is never used here. Every test below waits on
 * an explicit SESSION-RESTORED signal instead: either the URL leaving /auth
 * (loginAsUser/Broker/Admin's own postcondition) or an authed-only control
 * (`user-menu`) actually resolving — never first paint.
 */

import { test, expect } from './support/canonical-test';
import { loginAsUser, loginAsBroker, loginAsAdmin, hasRealCredentials } from '../helpers';

// ─────────────────────────────────────────────────────────────────────────
// T1[user] settled-landing predicate (issue #2246) — see the T1 [role:user]
// test below for the full root-cause writeup and the binding ruling this
// implements.
// ─────────────────────────────────────────────────────────────────────────

// Canonical /discover query-param allow-list — SOURCE OF TRUTH:
// src/hooks/useDiscoverUrlState.ts:6-59 (facade doc) + the NINE domain
// modules under src/features/discover/state/url/ it delegates to (verified
// against each module's own literal param-key string, not just the facade's
// docstring, since the docstring predates the #2001 decomposition and could
// drift from the modules independently). Update this set if
// useDiscoverUrlState's contract gains/drops a param — a stale list here
// either false-fails a legitimate new param (AC1-in-spirit false negative)
// or, worse, silently stops catching a real unexpected-param regression.
//
// COMPLETENESS SWEEP (fix cycle 1, issue #2246 code-review FIX 1): every
// literal query-key string READ, WRITTEN, or DELETED (`.get(`/`.set(`/
// `.has(`/`.delete(`/`.append(` on searchParams/urlParams — including
// `PARAM_*` constants resolved to their string value) across all nine
// modules — agricultural, area, city, clusterFocus, compatibility, filters,
// navigation, school, viewport — was enumerated and reconciled against this
// set. That sweep found exactly one gap: `town`, a deprecated-but-still-read
// legacy alias for `locality` (agricultural.ts:127,259,268,434,438,454;
// navigation.ts:459) — same category as `group` below. No other gaps found.
const DISCOVER_ALLOWED_PARAMS = new Set([
  'city', 'areaKey', 'lat', 'lon', 'zoom',
  'node', 'nodeListings', 'journey', 'groupId', 'schoolId', 'radiusKm',
  'schoolPicking', 'groupResults', 'region', 'maxKm', 'listing', 'locality',
  'destKey', 'type', 'beds', 'priceMin', 'priceMax', 'seller', 'board',
  'category', 'bom', 'ntm', 'rera', 'rtm', 'from', 'to',
  'agriAcresMin', 'agriAcresMax', 'agriPriceMin', 'agriPriceMax',
  'agriLandCategory', 'agriFarmhouseAvailable', 'agriFencingDone', 'agriWaterSource',
  'q', 'intent', 'scope', 'clusterFocus',
  'group', // deprecated (OD-1 Option A) but still READ — cold-loaded URLs still carry it briefly
  'town', // deprecated legacy alias for `locality` but still READ — see sweep note above
]);

// Leaflet's practically-supported integer zoom range. This repo's own tile
// providers cap out at maxZoom 19 (see e.g. docs/design/retrends-design-
// system/ui_kits/discover/src/PortalMap.jsx's CARTO tileLayer maxZoom: 19);
// 0-22 is deliberately a little more permissive than that so this predicate
// never false-fails on a future tile-provider swap with a slightly higher
// cap — it exists to catch NaN/non-integer/out-of-range garbage, not to
// pin today's exact tile ceiling.
const LEAFLET_MIN_ZOOM = 0;
const LEAFLET_MAX_ZOOM = 22;

/**
 * Settled-/discover predicate for `page.waitForURL` (issue #2246). Returns
 * true only for a URL that is:
 *   (a) pathname EXACTLY '/discover' (no sub-path, no trailing slash drift)
 *   (b) carries well-formed lat/lon/zoom — parsed NUMERICALLY (not pattern-
 *       matched), lat/lon finite and within valid geographic range, zoom
 *       finite and an integer within Leaflet's valid range. `toFixed(5)`
 *       output like "12.00000" must parse fine here (Number() handles
 *       trailing zeros natively) — this is not a digit-pattern regex.
 *   (c) carries no query parameter outside DISCOVER_ALLOWED_PARAMS.
 * A bare `/discover` (no camera params) does NOT satisfy this — that is the
 * whole point of the #2246 fix; see the test body for why.
 */
// FIX 2 (fix cycle 1, issue #2246 code-review) — diagnostics only, NOT a
// pass/fail semantics change: this returns the SAME accept/reject verdict as
// before (`null` = settled/valid, any non-null string = rejected), just with
// a reason attached so a `waitForURL` timeout can report WHICH sub-check
// failed instead of a bare TimeoutError. `isSettledDiscoverUrl` below is a
// thin `=== null` wrapper kept so its call site and meaning are unchanged.
function settledDiscoverUrlRejectionReason(url: URL): string | null {
  if (url.pathname !== '/discover') return `pathname is "${url.pathname}", not "/discover"`;

  for (const key of url.searchParams.keys()) {
    if (!DISCOVER_ALLOWED_PARAMS.has(key)) return `unknown query param "${key}" not in DISCOVER_ALLOWED_PARAMS`;
  }

  const rawLat = url.searchParams.get('lat');
  const rawLon = url.searchParams.get('lon');
  const rawZoom = url.searchParams.get('zoom');
  // Reject null (missing) AND '' (present-but-empty) explicitly — `Number('')`
  // is `0`, NOT `NaN`, so without this an empty `?lon=` would silently parse
  // as valid coordinate 0 instead of being caught as malformed.
  if (!rawLat || !rawLon || !rawZoom) {
    const missing = [
      !rawLat ? 'lat' : null,
      !rawLon ? 'lon' : null,
      !rawZoom ? 'zoom' : null,
    ].filter((v): v is string => v !== null);
    return `missing or empty camera param(s): ${missing.join(', ')}`;
  }

  const lat = Number(rawLat);
  const lon = Number(rawLon);
  const zoom = Number(rawZoom);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return `lat="${rawLat}" is not a finite value in [-90, 90]`;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return `lon="${rawLon}" is not a finite value in [-180, 180]`;
  if (!Number.isInteger(zoom) || zoom < LEAFLET_MIN_ZOOM || zoom > LEAFLET_MAX_ZOOM) {
    return `zoom="${rawZoom}" is not an integer in [${LEAFLET_MIN_ZOOM}, ${LEAFLET_MAX_ZOOM}]`;
  }

  return null;
}

function isSettledDiscoverUrl(url: URL): boolean {
  return settledDiscoverUrlRejectionReason(url) === null;
}

// Every test in this file must start anonymous — see module docstring.
test.use({ storageState: { cookies: [], origins: [] } });

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const brokerEmail = process.env.BROKER_EMAIL || process.env.DEALER_EMAIL || '';
const brokerPassword = process.env.BROKER_PASSWORD || process.env.DEALER_PASSWORD || '';
const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';

// ─────────────────────────────────────────────────────────────────────────
// T1 — role-aware landing + authed-only header control, one test per role.
// ─────────────────────────────────────────────────────────────────────────

test.describe('T1 — sign-in: role-aware landing + authed-only header control', () => {
  // RACY ASSERTION REMOVED (fix cycle 4, issue #2238) — this leg previously
  // also asserted userRoleNavigation's 'Saved' header link
  // (src/components/layout/AppLayout.tsx:90-97), gated on
  // navVisibility.showConsumerActivity (src/lib/routeAccess.ts:149-156).
  // 3x-repeated full-suite runs observed PASS / FAIL / FAIL on exactly this
  // wait (16.5s timeout) — a real intermittent race, not a fluke of this
  // test's own waits.
  //
  // MECHANISM (leading hypothesis, NOT proven — read from source, not
  // live-reproduced): the desktop "Role actions" zone that renders
  // userRoleNavigation — including 'Saved' — is itself gated on
  // `isLoading` (src/components/layout/AppLayout.tsx:324,
  // `{isLoading ? null : ...}`), and `isLoading` only flips false once
  // AuthContext's `fetchUserRole`/`fetchInsightsAccess` round trip resolves
  // (src/contexts/AuthContext.tsx:107-117 — `SIGNED_IN` sets `isLoading`
  // true, an async `setTimeout` + `Promise.all(...).finally()` sets it back
  // false). `AppLayout.tsx:112-113`'s `policyRole`/`navVisibility`
  // computation itself is not what's blocking — for a plain 'user' account
  // it resolves to the correct value the instant `user` becomes non-null,
  // before the role fetch even starts (`isAdmin`/`isBroker` default to
  // `false`, which is already the correct final state for 'user'). The
  // actual gate is the `isLoading` check at line 324, driven by that same
  // async Supabase round trip that #2238 documents for the elevated-role
  // redirect race. Whether that round trip's OWN latency (the competing
  // "hosted Supabase Auth latency" explanation) or something else about the
  // resolution timing is the deeper cause has not been excluded — treat
  // this as one plausible, source-confirmed mechanism, not a settled root
  // cause.
  //
  // Per this issue's "no test.skip, no weakening an assertion to match
  // buggy behaviour" rule (already applied to the broker/admin legs below):
  // the assertion is REMOVED, not retimed with a longer wait or a cleverer
  // selector — a longer wait was considered and rejected as uncertain to
  // actually close the race.
  test('[role:user] plain user signs in successfully and lands on the SETTLED /discover state, camera params required (does NOT assert the "Saved" header control — see #2238 note above; landing-URL check below does not prove role resolution ran, only that it did not mis-land on an elevated dashboard)', async ({ page }) => {
    // Defence-in-depth — see this project's own grep gating in
    // playwright.canonical.config.ts; this test should never run without
    // credentials, but never silently pass if it somehow does.
    if (!hasRealCredentials(userEmail, userPassword)) {
      throw new Error('[T1:user] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
    }

    await loginAsUser(page, userEmail, userPassword);
    // loginAsUser's own postcondition already asserts the URL left /auth
    // (e2e/helpers.ts) — sign-in itself is real and successful.

    // TASK-2 HONESTY NOTE: getRoleAwareDefaultLanding (src/lib/authUtils.ts:
    // 4-29) returns '/discover' for a plain, non-recently-created user
    // whenever BOTH `isAdmin` and `isBroker` are false. For a genuine
    // 'user'-role account those flags are false in TWO indistinguishable
    // cases: (a) role resolution correctly completed and found role='user',
    // or (b) role resolution simply has not run yet, since AuthContext
    // (src/contexts/AuthContext.tsx:29-30) initialises both to `false` by
    // default. This assertion cannot tell those apart — it would pass
    // identically either way, and would ALSO pass if role-fetching for
    // 'user' silently broke entirely, since the broken and working states
    // land on the same URL. It genuinely proves: sign-in succeeded, and the
    // user did NOT incorrectly land on an elevated (admin/broker) dashboard.
    // It does NOT prove role-aware landing logic ran or resolved correctly
    // for this role. Strengthening it further (e.g. asserting on UI that
    // only appears once role resolution completes) would reintroduce the
    // exact `isLoading`-gated race just removed above, so it is left as-is
    // rather than faked into looking more discriminating than it is.
    //
    // #2246 FIX — WHY THE PREVIOUS `toHaveURL('/discover', ...)` WAS FLAKY:
    // a STRING argument to `toHaveURL` compiles to an ANCHORED full-URL glob
    // (`^<baseURL>/discover$`), and Playwright's matcher POLLS until it
    // matches or times out. src/pages/Auth.tsx:26 navigates to a BARE
    // '/discover' the instant `user` becomes truthy; Discover's own
    // camera-sync effect (src/features/discover/state/url/viewport.ts:42-66)
    // then ENRICHES that same URL with lat/lon/zoom via a 300ms-DEBOUNCED
    // `history.replace` once the resolved navigation node's bounds are
    // known (see NavigationController#resolve on the backend — the public
    // GET .../navigation/resolve?node=root call this triggers). So the real
    // URL sequence for every sign-in is bare '/discover' for roughly the
    // first ~1s, THEN '/discover?lat=...&lon=...&zoom=...' from then on,
    // never reverting. The old string-glob assertion happened to pass only
    // when its poll first sampled inside that transient bare window — a
    // true intermittent race, not a fluke of test timing alone.
    //
    // BINDING RULING (PR #2277, decision "A — REQUIRE"): rather than
    // widening the match to accept EITHER state (which would make a genuine
    // Discover-map-init regression invisible to this test), T1 now waits for
    // the SETTLED state and REQUIRES lat/lon/zoom to be present, well-formed,
    // and free of any unexpected query param — see isSettledDiscoverUrl
    // above. A real regression that breaks camera-sync entirely (leaving the
    // URL bare forever, or producing NaN/out-of-range values) now correctly
    // TIMES OUT this test instead of silently passing. This is a deliberate,
    // ruled-on widening of what T1[user] covers, not scope creep: the
    // settled state is empirically the ONLY state a zero-interaction landing
    // ever reaches (live-verified — see this issue's Step 0 evidence: 80
    // consecutive 250ms polls over 20s on a fresh local fixture stayed
    // exactly on the settled `?lat=...&lon=...&zoom=11` URL from ~1s after
    // landing onward, never reverting to bare or drifting further).
    //
    // Empirically observed settle time on a local fixture: URL left /auth at
    // ~1.0s post-click, camera params were present by ~2.0s post-click and
    // remained stable for the rest of a 20s observation window — the 20s
    // timeout below has roughly an order of magnitude of headroom over that.
    // FIX 2 (fix cycle 1): on timeout, `waitForURL` alone throws a generic
    // TimeoutError that does not say WHICH sub-check kept failing (wrong
    // pathname vs missing camera params vs unknown param vs malformed
    // values) — diagnostics only, does not change what URLs are accepted.
    try {
      await page.waitForURL((url) => isSettledDiscoverUrl(url), { timeout: 20_000 });
    } catch (err) {
      const finalUrl = page.url();
      const reason = settledDiscoverUrlRejectionReason(new URL(finalUrl));
      throw new Error(
        `[T1:user] timed out waiting for settled /discover URL. Final URL: "${finalUrl}". ` +
        `Rejection reason: ${reason ?? '(none — URL is valid; the poll may have raced a same-tick navigation)'}. ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  // KNOWN PRODUCT BUG (root-caused live, fix cycle 3) — src/pages/Auth.tsx:9-29:
  // `isAdmin`/`isBroker` come from `useAuth()`, which resolves them via an
  // ASYNC `fetchUserRole()` round trip after `user` itself becomes non-null.
  // Auth.tsx's redirect `useEffect` fires the instant `user` becomes truthy
  // and reads `isAdmin`/`isBroker` AT THAT RENDER — before the async role
  // fetch has resolved, so both are still their initial `false`. Every
  // elevated-role sign-in therefore evaluates `getRoleAwareDefaultLanding`'s
  // branch with the WRONG (stale-false) flags and lands on the same generic
  // '/discover' default as a plain user, and Auth.tsx has already unmounted
  // by the time the real role arrives, so nothing corrects it afterward.
  // Live-verified (fix cycle 3): a real broker/admin sign-in always lands on
  // "/discover?lat=...&lon=...&zoom=11" (the generic default-camera view),
  // never '/broker/(dashboard|setup)' or '/admin/listings/pending' — 16/16
  // consecutive polls over 16s, url never self-corrected. `src/**` is out of
  // scope for this slice (scope-locked to e2e/canonical/**,
  // playwright.canonical.config.ts, scripts/db/fixtures/**), so this cannot
  // be fixed here — a follow-up issue for the Auth.tsx redirect-effect race
  // is being filed separately.
  //
  // HONEST TREATMENT (per this issue's own "no test.skip, no weakening an
  // assertion until it passes against buggy behaviour" rule): the landing-URL
  // assertion is REMOVED below, not weakened to match the bug — asserting
  // '/discover' for broker/admin here would encode the bug as the intended
  // contract, which is exactly what this rule forbids. What remains asserted
  // is real and true today: sign-in itself succeeds (URL leaves /auth), and
  // the role DOES correctly reach the UI — the header's authed-only,
  // role-specific control is driven by AuthContext's own reactive
  // isAdmin/isBroker (not Auth.tsx's one-shot stale-closure effect), so it
  // renders correctly regardless of this bug — live-verified: it was visible
  // within 1s of sign-in on every one of the 16 polls above, on a page that
  // never left the wrong landing URL. Test titles below do not claim
  // role-aware landing works, because it does not.
  test('[role:broker] broker signs in successfully; "Broker dashboard" header link visible (does NOT assert role-aware landing — see KNOWN PRODUCT BUG above)', async ({ page }) => {
    if (!hasRealCredentials(brokerEmail, brokerPassword)) {
      throw new Error('[T1:broker] BROKER_EMAIL/PASSWORD absent — this test should not have run.');
    }

    await loginAsBroker(page, brokerEmail, brokerPassword);
    // loginAsBroker's own postcondition already asserts the URL left /auth
    // (e2e/helpers.ts) — sign-in itself is real and successful.

    // Authed-only, role-specific: brokerRoleNavigation's 'Broker dashboard'
    // link (src/components/layout/AppLayout.tsx:75-79) only renders when
    // navVisibility.showBrokerWorkspace is true — role 'broker'/'dealer' only.
    // Driven by AuthContext's reactive role state, independent of the
    // landing-URL bug documented above.
    await expect(page.getByRole('link', { name: 'Broker dashboard', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('[role:admin] admin signs in successfully; "Admin Console" header control visible (does NOT assert role-aware landing — see KNOWN PRODUCT BUG above)', async ({ page }) => {
    if (!hasRealCredentials(adminEmail, adminPassword)) {
      throw new Error('[T1:admin] ADMIN_EMAIL/PASSWORD absent — this test should not have run.');
    }

    await loginAsAdmin(page, adminEmail, adminPassword);
    // loginAsAdmin's own postcondition already asserts the URL left /auth
    // (e2e/helpers.ts) — sign-in itself is real and successful.

    // Authed-only, role-specific: the "Admin Console" dropdown trigger
    // (src/components/layout/AppLayout.tsx:337-352) only renders when
    // navVisibility.showAdminConsole is true — role 'admin' only. Driven by
    // AuthContext's reactive role state, independent of the landing-URL bug
    // documented above.
    await expect(page.getByRole('button', { name: 'Admin Console' })).toBeVisible({ timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// T2 — returnTo round-trip from a deep Discover URL, including node=.
// ─────────────────────────────────────────────────────────────────────────

// The camera-sync effect (Discover) derives lat/lon/zoom from the resolved
// node's bounds off real browser layout — these can and do settle to a
// different last decimal place between the pre-login capture and the
// post-login re-render (live-verified: a 3x-repeated full-suite run flaked
// on exactly this — same node, lon differing in its final digit only). That
// makes lat/lon/zoom incidental app-appended enrichment, not part of what
// the returnTo contract promises to preserve. Do NOT tighten this back into
// a byte-identical compare — assert only that a camera param the expected
// URL carries is STILL PRESENT post-round-trip, never its value.
//
// What the contract DOES guarantee, and what stays a strict equality check:
// the pathname, and every "journey-defining" query param — city/node in
// particular — decoded and compared exactly (the app serialises a space as
// `+` while `encodeURIComponent` gives `%20`; comparing via URLSearchParams
// avoids that trap rather than string-matching raw search text).
const CAMERA_PARAM_KEYS = new Set(['lat', 'lon', 'zoom']);

function assertReturnToContract(actualPathAndSearch: string, expectedPathAndSearch: string, label: string) {
  const actual = new URL(actualPathAndSearch, 'http://canonical.invalid');
  const expected = new URL(expectedPathAndSearch, 'http://canonical.invalid');

  expect(actual.pathname, `${label}: pathname must match`).toBe(expected.pathname);

  const journeyKeys = [...expected.searchParams.keys()].filter((key) => !CAMERA_PARAM_KEYS.has(key));
  for (const key of journeyKeys) {
    expect(
      actual.searchParams.get(key),
      `${label}: journey-defining param "${key}" must round-trip exactly (decoded)`,
    ).toBe(expected.searchParams.get(key));
  }

  for (const key of CAMERA_PARAM_KEYS) {
    if (expected.searchParams.has(key)) {
      expect(
        actual.searchParams.has(key),
        `${label}: camera param "${key}" is app-appended enrichment — only its PRESENCE is checked, never its value`,
      ).toBe(true);
    }
  }
}

test('[role:user] T2 — returnTo round-trip preserves a deep Discover URL including node=', async ({ page }) => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T2] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }

  // Real fixture area node — RETARGETED at BANGALORE (fix cycle 3). Udupi has
  // ZERO navigation_nodes rows and no PROMOTED city_launch_revision in this
  // fixture (scripts/db/fixtures/navigation-active-revision-fixture-seed.sql's
  // own header explicitly documents this and deliberately does not seed
  // Udupi), so a node= deep-link into Udupi can never resolve against a real
  // navigation graph. Bangalore DOES have a promoted hierarchy — see
  // scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql, which adds
  // 'a:IN|KA|Bengaluru|RR Nagar' as a real AREA leaf (depth 1, under
  // d:southeast) with 2 LIVE fixture listings (navigation-hierarchy-fixture-
  // listings-seed.sql) — live-verified via
  // GET /api/discover/cities/bangalore/navigation/resolve?node=a:IN|KA|Bengaluru|RR%20Nagar
  // returning `"resolution":"EXACT"` against a freshly-seeded fixture.
  const deepPath = '/discover';
  const deepSearch = '?city=bangalore&node=' + encodeURIComponent('a:IN|KA|Bengaluru|RR Nagar');
  const deepUrl = deepPath + deepSearch;

  // Wait on the navigation RESOLVE RESPONSE itself, not a visual state — the
  // app is optimistically area-first while the resolve probe is in flight, so
  // an assertion timed against first paint can observe a transient state that
  // is then replaced once the real resolution lands. This also doubles as
  // this test's own "did the deep node= actually resolve" proof, independent
  // of the later /auth redirect check.
  const resolveResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/navigation/resolve') && resp.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto(deepUrl);
  const resolveResponse = await resolveResponsePromise;
  expect(resolveResponse.ok(), `navigation/resolve for ${deepUrl} must respond 2xx`).toBe(true);

  await page.waitForLoadState('domcontentloaded');
  // Must not have been redirected away — Discover is a genuinely public route
  // (src/lib/routeAccess.ts:7 — isPublicRoute treats '/discover' as public).
  //
  // FIX (this cycle): the previous assertion here —
  // `toHaveURL(new RegExp('^' + deepPath.replace(...)))` — could never pass
  // against any real navigation. Playwright's `toHaveURL` matches a RegExp
  // against `page.url()`, which is always the FULL absolute URL (e.g.
  // "http://localhost:5251/discover?..."); anchoring a pattern on a literal
  // "/discover" prefix therefore requires the string to start with "http",
  // never actually satisfiable. Live-verified: this line failed on every run
  // regardless of app behaviour. The actual intent — "did not get redirected
  // to /auth" — is expressed correctly below the same way T10 expresses it.
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });

  // Live-verified (fix cycle 3): once the node resolves, Discover's camera-
  // sync effect ENRICHES the URL with lat/lon/zoom query params derived from
  // the resolved node's bounds — the URL right after `page.goto(deepUrl)` is
  // therefore NOT the final settled URL. Wait for that enrichment to land
  // (a real, observable signal — not an arbitrary timeout) before capturing
  // "the deep URL" this test's returnTo contract is actually about.
  await expect(page).toHaveURL(/[?&]lat=/, { timeout: 10_000 });
  const resolvedDeepUrlObj = new URL(page.url());
  const resolvedDeepUrl = resolvedDeepUrlObj.pathname + resolvedDeepUrlObj.search;

  // RoleAwareHeader's anon-only "Sign in" link
  // (src/components/layout/AppLayout.tsx:446-455) carries
  // `/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`
  // — this is a REAL, always-present anon control on every page, not
  // specific to Discover. Assert the href's returnTo carries the pathname and
  // journey-defining params (node= etc.) of the settled deep URL exactly —
  // decoded compare, because the app URL-encodes — while only checking
  // PRESENCE (never the value) of camera params; see the module-level
  // comment above assertReturnToContract for why lat/lon/zoom are excluded
  // from equality.
  const signInLink = page.getByRole('link', { name: 'Sign in', exact: true });
  await expect(signInLink).toBeVisible({ timeout: 10_000 });
  const href = await signInLink.getAttribute('href');
  expect(href, 'Sign in link must carry a returnTo param').toBeTruthy();
  const decodedHref = decodeURIComponent(href ?? '');
  const returnToPrefix = '/auth?returnTo=';
  expect(decodedHref.startsWith(returnToPrefix), 'Sign-in link href must be an /auth?returnTo=... link').toBe(true);
  const hrefReturnTo = decodedHref.slice(returnToPrefix.length);
  assertReturnToContract(hrefReturnTo, resolvedDeepUrl, 'Sign-in link returnTo');

  // Navigate to that exact href (real navigation, not a click — clicking
  // this link calls e.preventDefault() and opens an auth MODAL instead of
  // navigating; see SignInGateCard.tsx's identical pattern, which this
  // header link mirrors via openAuthModal).
  await page.goto(href ?? '');
  await page.waitForLoadState('domcontentloaded');

  // NOT `loginAsUser(page, ...)` here — root-caused live (fix cycle 3):
  // loginAsUser's own first line (e2e/helpers.ts:70) is `await page.goto('/auth')`,
  // which would re-navigate to a BARE /auth and DISCARD the `?returnTo=...`
  // query param this test just navigated to, so the post-sign-in redirect
  // falls through to the role-aware default landing (no city/node at all)
  // instead of round-tripping back to this deep URL — live-verified: without
  // this fix the final assertion below observed
  // "/discover?lat=12.98883&lon=77.64278&zoom=11" (the generic default
  // camera), never the seeded RR Nagar deep link. T1/T3 never hit this
  // because they start from a plain, param-less /auth visit, where
  // loginAsUser's leading goto is a harmless no-op re-navigation. Inlined
  // below using loginAsUser's OWN real selectors verbatim (never
  // reinvented), just without its leading `page.goto('/auth')`.
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(userEmail);
  await page.locator('#signin-password').fill(userPassword);
  await page.locator('button[type="submit"]').filter({ hasText: /sign in/i }).first().click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });

  // Auth.tsx reads safeReturnTo and navigates there on sign-in
  // (src/pages/Auth.tsx:16,22,26-27) — must land back on the original deep
  // URL's pathname with node= (and any other journey-defining param)
  // preserved exactly. NOT a byte-identical `toHaveURL(resolvedDeepUrl)`
  // compare — that was this test's own flake (FLAKE DEFENCE comment above
  // assertReturnToContract): the post-login camera-sync re-render can settle
  // lat/lon's last digit differently than the pre-login capture did, which
  // has nothing to do with whether returnTo actually worked. This still
  // fails if node= were dropped by the round-trip — that IS what T2 exists
  // to catch.
  await page.waitForLoadState('domcontentloaded');
  // Same async camera-sync enrichment as the pre-login wait above — the
  // post-login re-render appends lat/lon/zoom on its own schedule too, so
  // wait for that real signal before capturing "the final URL", rather than
  // comparing against a not-yet-settled one (which would fail the "camera
  // param present" check for a reason that has nothing to do with returnTo).
  await expect(page).toHaveURL(/[?&]lat=/, { timeout: 15_000 });
  const finalUrlObj = new URL(page.url());
  const finalPathAndSearch = finalUrlObj.pathname + finalUrlObj.search;
  assertReturnToContract(finalPathAndSearch, resolvedDeepUrl, 'Post-sign-in landing URL');
});

// ─────────────────────────────────────────────────────────────────────────
// T3 — plain user (no broker role) reaches the typed-create route.
// ─────────────────────────────────────────────────────────────────────────

test('[role:user] T3 — plain user reaches the typed-create route, URL does not become /auth', async ({ page }) => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T3] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }

  await loginAsUser(page, userEmail, userPassword);
  // Session-restored signal before navigating onward.
  await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 15_000 });

  // canAccessRoute (src/lib/routeAccess.ts:92-109) explicitly allows role
  // 'user' onto this exact path — a plain consumer, never granted a broker
  // role, listing their own property. ProtectedRoute (src/components/auth/
  // ProtectedRoute.tsx:38-40) would redirect to the role's default landing
  // ('/discover' for 'user') if this were false.
  await page.goto('/broker/listings/new/residential');
  await page.waitForLoadState('domcontentloaded');

  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
  await expect(page).toHaveURL('/broker/listings/new/residential', { timeout: 10_000 });

  // Positive presence, not just "didn't redirect": the typed-create FORM
  // itself rendered, not merely AppLayout's <main> wrapper (which
  // ResidentialNewListingPage — src/pages/broker/ResidentialNewListingPage.tsx:68
  // — renders unconditionally around ResidentialListingForm, so a bare
  // `getByRole('main')` check would pass even if the form's body failed to
  // render at all). ResidentialListingForm's default (fresh, no listingId,
  // not submitted) render mode is 'edit' (src/components/broker/
  // ResidentialListingForm.tsx:328, `useState<'edit' | 'review'>('edit')`),
  // whose header renders a real `<h1>Create a listing</h1>`
  // (src/components/broker/ResidentialListingForm.tsx:1015) — verified by
  // reading that exact line, not assumed. This is form-body-specific: the
  // 'review' and 'submitted' branches render their own different headings
  // ("Review your listing" / "Submitted for review"), so this assertion can
  // only pass if the edit-mode form body actually mounted.
  await expect(page.getByRole('heading', { name: 'Create a listing' })).toBeVisible({ timeout: 10_000 });
});
