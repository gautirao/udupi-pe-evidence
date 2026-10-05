/**
 * Issue #2767 — Udupi School + Area deep link must not ship a synthetic `polygon=`.
 *
 * Production bug: the combined Area + School state synthesised the selected Area's bbox as
 * `polygon=[[s,w],[s,e],[n,e],[n,w],[s,w]]`. The backend treats ANY `polygon=` as a committed
 * user-drawn POLYGON scope and runs PolygonGeographicSafetyPolicy (#2420), which fails closed for
 * Udupi (no VALID canonical CITY boundary) -> HTTP 400 `polygon_outside_searchable_city`.
 * Fix (trust boundary): the client sends NO coordinates for the Area. It sends the single canonical
 * Area key as `schoolAreaKey=IN|KA|Udupi|Kunjibettu` plus the school params, and the backend derives
 * the Area bounds server-side. A client-supplied `areaBbox` would be an unrestricted polygon channel
 * that bypasses #2420, so it is neither sent nor honoured.
 *
 * What this spec pins (the BROWSER REQUEST SHAPE, not the backend):
 *   - /api/discover/listings carries the full-literal `schoolAreaKey`, the school params, and
 *     NEITHER `areaBbox` NOR `polygon`
 *   - the page therefore receives a non-400 response and renders the stubbed result
 *
 * NOT covered here (honest gap, unchanged): /api/discover/markers. The deep link never opens the
 * markers gate (`boundedSearchTriggered` is only set by the school-only "Search within N km" CTA,
 * which the combined Area+School panel does not render), so no markers request is browser-reachable
 * in Area+School; an assertion here could not be made to execute. Markers and listings share the
 * single buildDiscoverSearchParams serializer, so the wire shape is pinned at the hook level
 * (discoverSearchParams.test.ts) and the backend resolution is pinned by the backend ITs.
 *
 * The backend is a STUB, but a FAITHFUL one on the security contract: it answers HTTP 400 to ANY
 * request that carries `polygon=` (what #2420 does for Udupi without canonical geometry) OR
 * `areaBbox=` (a client-supplied rectangle must never be on the wire), and 200 otherwise. So
 * reverting the frontend to the synthetic polygon, to `areaBbox`, or to sending nothing turns this
 * spec red via the app's own observed 400 or the literal `schoolAreaKey` assertion.
 * Auth is a SYNTHETIC session (same technique as commercial-create-listing-1684.spec.ts), so no
 * Supabase credentials or live network are needed: every /api/** and Supabase call is intercepted.
 *
 * Run (note --project=full: the default `smoke` project has an allowlisted testMatch):
 *   bash scripts/run-e2e-local.sh --project=full --workers=1 e2e/issue-2767-udupi-school-area-schoolareakey.spec.ts
 */

import { test, expect, type Page, type Route, type Request } from '@playwright/test';

const SUPABASE_ORIGIN = 'https://elyqnysyqbqoxqqrpiir.supabase.co';
const FAKE_USER_ID = 'e2e-user-2767-0000-0000-000000000000';

const KUNJIBETTU_KEY = 'IN|KA|Udupi|Kunjibettu';
const SCHOOL_ID = 'a939c7cf-3a74-4aab-89af-943151fbc386';

// Kunjibettu bbox as served by /api/discover/areas (the app needs it present to enter the
// School+Area state; the client must NOT put it on the listings wire).
const AREA_MIN_LAT = 13.32;
const AREA_MIN_LON = 74.73;
const AREA_MAX_LAT = 13.35;
const AREA_MAX_LON = 74.76;

// The deep link from the issue, with the host dropped.
const DEEP_LINK =
  '/discover?city=udupi&journey=school-first&lat=13.32674&lon=74.74780&zoom=14' +
  `&areaKey=${encodeURIComponent(KUNJIBETTU_KEY)}&rscope=areas&rareas=${encodeURIComponent(KUNJIBETTU_KEY)}` +
  `&schoolId=${SCHOOL_ID}&radiusKm=3`;

const SCHOOL = {
  id: SCHOOL_ID,
  name: 'Kunjibettu Test School',
  board: 'CBSE',
  boardType: null,
  address: 'Kunjibettu, Udupi',
  latitude: 13.3267,
  longitude: 74.7478,
  distanceKm: 0.4,
  areaKey: KUNJIBETTU_KEY,
};

const DISCOVER_AREAS = {
  city: 'udupi',
  areas: [
    {
      areaKey: KUNJIBETTU_KEY,
      name: 'Kunjibettu',
      geoCenterLat: 13.3267,
      geoCenterLon: 74.7478,
      listingCount: 4,
      schoolCount: 1,
      trendDirection: 'stable',
      minLat: AREA_MIN_LAT,
      minLon: AREA_MIN_LON,
      maxLat: AREA_MAX_LAT,
      maxLon: AREA_MAX_LON,
    },
  ],
};

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockSupabaseSession(page: Page): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const session = {
    access_token: 'e2e-mock-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    refresh_token: 'e2e-mock-refresh-token',
    user: {
      id: FAKE_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e-user-2767@example.com',
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { email_verified: true },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_anonymous: false,
    },
  };
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
      // Telemetry consent granted so the banner does not overlay the page.
      window.localStorage.setItem('discover_telemetry_consent', 'granted');
    },
    { key: 'sb-elyqnysyqbqoxqqrpiir-auth-token', value: session },
  );
  // Registered first = matched last: nothing on the Supabase origin reaches the live network.
  await page.route(`${SUPABASE_ORIGIN}/**`, (route) => fulfillJson(route, 200, {}));
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/user_roles**`, (route) =>
    fulfillJson(route, 200, { role: 'user' }),
  );
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/profiles**`, (route) =>
    fulfillJson(route, 200, { insights_access_until: null }),
  );
}

interface Capture {
  listings: Request[];
  markers: Request[];
  /** HTTP status the stub returned for each captured request, in order (listings then markers share the rule). */
  statuses: number[];
}

/**
 * Faithful stand-in for the security contract: a `polygon=` for Udupi is rejected with 400
 * `polygon_outside_searchable_city` (#2420); a client-supplied `areaBbox=` must never be on the wire
 * and is modelled as a 400 too; anything else is a 200.
 */
function respondLikeBackend(route: Route, okBody: unknown, statuses: number[]): Promise<void> {
  const url = new URL(route.request().url());
  if (url.searchParams.has('polygon')) {
    statuses.push(400);
    return fulfillJson(route, 400, { error: 'polygon_outside_searchable_city' });
  }
  if (url.searchParams.has('areaBbox')) {
    statuses.push(400);
    return fulfillJson(route, 400, { error: 'client_area_bbox_not_accepted' });
  }
  statuses.push(200);
  return fulfillJson(route, 200, okBody);
}

async function stubBackend(page: Page): Promise<Capture> {
  const capture: Capture = { listings: [], markers: [], statuses: [] };

  // Unmatched /api/** never reaches a live backend (registered first = matched last).
  await page.route('**/api/**', (route) => fulfillJson(route, 404, { error: 'e2e-unstubbed' }));

  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, {
      city: 'udupi',
      defaultAreas: [{ areaKey: KUNJIBETTU_KEY, areaLabel: 'Kunjibettu' }],
    }),
  );
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, 200, DISCOVER_AREAS));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [SCHOOL]));
  await page.route(`**/api/public/schools/${SCHOOL_ID}**`, (route) => fulfillJson(route, 200, SCHOOL));
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, { city: 'udupi', limitPerArea: 50, areas: [] }),
  );
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, []),
  );

  await page.route('**/api/discover/listings**', (route) => {
    capture.listings.push(route.request());
    return respondLikeBackend(route, EMPTY_LISTINGS_PAGE, capture.statuses);
  });
  await page.route('**/api/discover/markers**', (route) => {
    capture.markers.push(route.request());
    return respondLikeBackend(route, { city: 'udupi', markers: [] }, capture.statuses);
  });

  return capture;
}

function assertSchoolAreaKeyShape(request: Request, label: string): void {
  const u = new URL(request.url());
  const sp = u.searchParams; // URLSearchParams decodes: `IN%7CKA%7C...` -> `IN|KA|...`
  expect(sp.get('city'), `${label}: city`).toBe('udupi');
  // Full literal (URL-decoded), not truthiness: the single canonical Area key.
  expect(sp.get('schoolAreaKey'), `${label}: schoolAreaKey in ${request.url()}`).toBe(KUNJIBETTU_KEY);
  expect(sp.getAll('schoolAreaKey'), `${label}: schoolAreaKey is single-valued`).toEqual([KUNJIBETTU_KEY]);
  // NEGATIVE: no client coordinates for the Area, neither as a rectangle nor as a committed POLYGON.
  expect(sp.has('areaBbox'), `${label}: areaBbox must be absent in ${request.url()}`).toBe(false);
  expect(sp.has('polygon'), `${label}: polygon must be absent in ${request.url()}`).toBe(false);
  // School constraint is still applied.
  expect(sp.get('schoolLat'), `${label}: schoolLat`).toBe('13.3267');
  expect(sp.get('schoolLon'), `${label}: schoolLon`).toBe('74.7478');
  expect(sp.get('schoolRadiusKm'), `${label}: schoolRadiusKm`).toBe('3');
}

test.describe('Issue #2767: Udupi School + Area request shape (schoolAreaKey, no client coordinates)', () => {
  test('deep link: /api/discover/listings carries schoolAreaKey + school params, no areaBbox, no polygon, and is not 400', async ({
    page,
  }) => {
    await mockSupabaseSession(page);
    const capture = await stubBackend(page);

    // Wait deterministically for the COMBINED Area+School listings REQUEST (school coords present).
    // This does not depend on anything that only renders when schoolAreaKey is sent, so a
    // regression that omits the key still reaches the literal assertion below and fails there.
    const combinedRequest = page.waitForRequest(
      (r) =>
        r.method() === 'GET' &&
        r.url().includes('/api/discover/listings') &&
        new URL(r.url()).searchParams.has('schoolLat'),
      { timeout: 20_000 },
    );
    const navigation = page.goto(DEEP_LINK, { waitUntil: 'domcontentloaded' });
    const firstCombined = await combinedRequest;
    await navigation;

    // THE CONTRACT, asserted first: literal schoolAreaKey, school params, no areaBbox, no polygon.
    assertSchoolAreaKeyShape(firstCombined, 'listings (first combined request)');
    const response = await firstCombined.response();
    if (!response) throw new Error('combined listings request produced no response');

    // The school panel actually rendered for the deep-linked school (the flow was exercised, not skipped).
    await expect(page.getByRole('heading', { name: SCHOOL.name })).toBeVisible({ timeout: 15_000 });

    expect(capture.listings.length, 'at least one listings request was made').toBeGreaterThan(0);
    // NEVER allow a polygon or areaBbox on any listings request (including pre-hydration ones).
    for (const req of capture.listings) {
      const sp = new URL(req.url()).searchParams;
      expect(sp.has('polygon'), `polygon must never be sent: ${req.url()}`).toBe(false);
      expect(sp.has('areaBbox'), `areaBbox must never be sent: ${req.url()}`).toBe(false);
    }
    const combined = capture.listings.filter((r) => new URL(r.url()).searchParams.has('schoolLat'));
    for (const req of combined) assertSchoolAreaKeyShape(req, 'listings');

    expect(response.status(), 'listings response must not be 400').not.toBe(400);
    expect(response.status()).toBe(200);
    expect(capture.statuses).not.toContain(400);
  });
});
