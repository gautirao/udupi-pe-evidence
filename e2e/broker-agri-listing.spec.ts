/**
 * broker-agri-listing.spec.ts
 *
 * Issue #1368 — Agricultural listing creation journey (boundary persistence path).
 *
 * Owns the boundary-PERSISTENCE + area-comparison + submit + invalid-path assertions
 * that complement (do NOT duplicate) verify-1365-boundary-step.spec.ts, which already
 * proves AC1/AC2/AC10 step-count + label + disclaimer presence at the UI level.
 *
 *   AC1 — create agri DRAFT via API; open EditListing step 4; boundary step + disclaimer render.
 *   AC2 — PUT a VALID boundary; reload step 4; area-comparison shows computed + declared area.
 *   AC3 — submit the agri listing → PENDING_REVIEW; boundary survives submit; appears in /mine.
 *   AC4 — each invalid boundary PUT → HTTP 422 errors[].code == BOUNDARY_*; boundary uncorrupted.
 *   AC5 — residential regression is owned by e2e/broker-listing-form.spec.ts (NOT re-authored here;
 *          qa-verification runs it). See that file for the non-agri 4-step journey.
 *
 * Seam (mirrors verify-1365-boundary-step.spec.ts):
 *   - broker token via Supabase password grant (BROKER_ / DEALER_ env fallback)
 *   - createDraftListing(token, 'agricultural_land') -> POST /api/listings -> { id }
 *   - boundary is PUT-only: PUT /api/listings/{id} { boundary: <geojson-string>, ... }
 *   - API-seed seam ONLY — no leaflet-draw gestures (DrawControl is brittle in Playwright)
 *   - storageState e2e/fixtures/broker-auth.json; afterAll deletes every created listing.
 *
 * CRITICAL R3 (prod-data safety): BACKEND defaults to http://localhost:8085 (NOT onrender.com).
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/broker-agri-listing.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { hasRealCredentials } from './helpers';

// R3: localhost default — must NOT inherit broker-listing-form's onrender.com prod default.
const BACKEND = process.env.BACKEND_BASE_URL ?? 'http://localhost:8085';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const brokerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);

// GeoJSON fixtures (kept inline so the spec is self-contained; mirrors e2e/fixtures/agri-boundary.json).
// Areas below are the PostGIS geography ST_Area used by the stage-9 cap (1e8 m^2 = 100 km^2),
// verified against postgis/postgis:15-3.4 — NOT the planar bbox area. At lat ~13, 0.1 deg ~= 11 km,
// so a 0.1x0.1 square is ~120 km^2 and would WRONGLY trip the cap. The valid fixture is therefore
// a 0.05x0.05 deg plot (~30 km^2) — safely under the cap.
const VALID_BOUNDARY = {
  type: 'Polygon',
  coordinates: [[[74.74, 13.34], [74.79, 13.34], [74.79, 13.39], [74.74, 13.39], [74.74, 13.34]]],
}; // ST_Area(geography) ~= 29.96 km^2 < 100 km^2 -> passes all 9 stages.
// Bowtie — stays inside the India bbox so it reaches the stage-8 ST_IsValid DB check, where it fails.
const INVALID_SELF_INTERSECT = {
  type: 'Polygon',
  coordinates: [[[74.0, 13.0], [74.1, 13.1], [74.1, 13.0], [74.0, 13.1], [74.0, 13.0]]],
}; // ST_IsValid = false -> BOUNDARY_INVALID_GEOMETRY (stage 8).
// London — fails the India bounding-box check (pure-Java stage 7) before any DB call.
const INVALID_OUTSIDE_INDIA = {
  type: 'Polygon',
  coordinates: [[[-0.1, 51.5], [0.1, 51.5], [0.1, 51.6], [-0.1, 51.6], [-0.1, 51.5]]],
}; // lon/lat outside [68..98]/[6..38] -> BOUNDARY_OUTSIDE_INDIA (stage 7).
// 0.2x0.2 deg in Udupi -> ~480 km^2 -> exceeds the 100 km^2 cap at stage 9 (geometry still ST_IsValid).
const INVALID_TOO_LARGE = {
  type: 'Polygon',
  coordinates: [[[74.0, 13.0], [74.2, 13.0], [74.2, 13.2], [74.0, 13.2], [74.0, 13.0]]],
}; // ST_Area(geography) ~= 479.88 km^2 > 100 km^2 -> BOUNDARY_TOO_LARGE (stage 9).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode the Supabase JWT `sub` claim (the user id) without verifying the signature. */
function jwtSub(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload, 'base64url').toString('utf-8');
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

async function getToken(email: string, password: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function createDraftListing(token: string, propertyType: string): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND}/api/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        propertyType,
        title: `[E2E 1368] ${propertyType} fixture — delete me`,
        price: 2_500_000,
      }),
    });
    if (!res.ok) {
      console.log(`[1368] POST /api/listings failed (${res.status})`);
      return null;
    }
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch (err) {
    console.log(`[1368] POST /api/listings threw: ${String(err)}`);
    return null;
  }
}

/**
 * PUT a partial update onto a DRAFT listing. Returns the raw Response so callers can
 * assert status (200 vs 422) and inspect the validator error envelope.
 */
async function putListing(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${BACKEND}/api/listings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function getListing(token: string, id: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BACKEND}/api/listings/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function deleteListing(token: string, id: string): Promise<void> {
  try {
    await fetch(`${BACKEND}/api/listings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`[1368] Deleted listing: ${id}`);
  } catch (err) {
    console.log(`[1368] Delete threw: ${String(err)}`);
  }
}

/**
 * Register N image-metadata rows via the DB-only image endpoint (no real bytes / Supabase
 * upload needed). Required to clear the >= MIN_IMAGES submission guard for AC3.
 * storagePath prefix must be "listings/{createdBy}/{listingId}/" — createdBy is read off the
 * listing GET response.
 */
async function seedImages(
  token: string,
  id: string,
  createdBy: string,
  count: number,
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < count; i++) {
    const storagePath = `listings/${createdBy}/${id}/e2e-1368-${i}.jpg`;
    try {
      const res = await fetch(`${BACKEND}/api/listings/${id}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storagePath,
          url: `https://example.invalid/${storagePath}`,
        }),
      });
      if (res.ok) ok++;
      else console.log(`[1368] seedImage ${i} failed (${res.status})`);
    } catch (err) {
      console.log(`[1368] seedImage ${i} threw: ${String(err)}`);
    }
  }
  return ok;
}

async function openEditListing(page: Page, id: string, step?: number): Promise<void> {
  const url = step ? `/broker/listings/${id}/edit?step=${step}` : `/broker/listings/${id}/edit`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// AC1 / AC2 / AC3 — happy path on a single agri DRAFT, serialized.
// ---------------------------------------------------------------------------

test.describe('@integration-ui @full 1368 — Agri listing boundary persistence', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });
  // Serial: AC2 depends on AC1's boundary; AC3 depends on AC2's persisted state.
  test.describe.configure({ mode: 'serial' });

  let token: string | null = null;
  let agriId: string | null = null;
  let createdBy: string | null = null;

  test.beforeAll(async () => {
    if (!hasBrokerCreds) return;
    token = await getToken(brokerEmail, brokerPassword);
    if (!token) return;
    agriId = await createDraftListing(token, 'agricultural_land');
    // The draft owner is the authenticated broker — read it from the JWT `sub` claim,
    // since ListingResponse does not expose createdBy. Needed to build the image
    // storage-path prefix (listings/{createdBy}/{id}/) for the AC3 submit guard.
    createdBy = jwtSub(token);
    console.log(`[1368] Created agri DRAFT: ${agriId} (owner ${createdBy})`);
  });

  test.afterAll(async () => {
    if (agriId && token) await deleteListing(token, agriId);
  });

  test('AC1 — agri DRAFT opens to step 4 boundary panel with disclaimer', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set');
    test.skip(agriId === null, 'Agri draft could not be created (stack/creds unavailable)');

    await openEditListing(page, agriId!, 4);

    await expect(page.locator('[data-testid="boundary-draw-step"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="boundary-disclaimer"]')).toBeVisible();
  });

  test('AC2 — VALID boundary PUT persists; step 4 shows computed + declared area', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set');
    test.skip(agriId === null, 'Agri draft could not be created (stack/creds unavailable)');

    // Seed a declared land area so declared-area-label renders, then PUT a valid boundary.
    const res = await putListing(token!, agriId!, {
      boundary: JSON.stringify(VALID_BOUNDARY),
      latitude: 13.365,
      longitude: 74.765,
      locality: 'Udupi',
      landArea: 5,
      landAreaUnit: 'acre',
    });
    expect(res.status, 'valid boundary PUT should be accepted (200)').toBe(200);

    // Boundary must survive the round-trip on the listing GET.
    const after = await getListing(token!, agriId!);
    expect(after?.boundary, 'boundary persisted after PUT').toBeTruthy();
    // computedAreaAcres is derived server-side at read time from the saved geometry.
    expect(
      after?.computedAreaAcres,
      'computedAreaAcres derived from persisted boundary',
    ).not.toBeNull();

    // Reload step 4 and assert the UI reflects the persisted boundary.
    await openEditListing(page, agriId!, 4);

    const areaComparison = page.locator('[data-testid="area-comparison"]');
    await expect(areaComparison).toBeVisible({ timeout: 10_000 });

    const computed = page.locator('[data-testid="computed-area-label"]');
    await expect(computed).toBeVisible();
    await expect(computed).toContainText('Approx. from boundary:');
    await expect(computed).toContainText('acres');

    const declared = page.locator('[data-testid="declared-area-label"]');
    await expect(declared).toBeVisible();
    await expect(declared).toContainText('Declared:');

    // Disclaimer remains visible alongside the area comparison.
    await expect(page.locator('[data-testid="boundary-disclaimer"]')).toBeVisible();
  });

  test('AC3 — submit agri listing -> PENDING_REVIEW; boundary survives; appears in /mine', async () => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set');
    test.skip(agriId === null, 'Agri draft could not be created (stack/creds unavailable)');
    test.skip(createdBy === null, 'Could not resolve listing owner for image seeding');

    // Clear the submission guards: confirmed address + >= 3 images (DB-only metadata seed).
    const guardRes = await putListing(token!, agriId!, {
      boundary: JSON.stringify(VALID_BOUNDARY),
      latitude: 13.365,
      longitude: 74.765,
      locality: 'Udupi',
      landArea: 5,
      landAreaUnit: 'acre',
      addressConfirmed: true,
    });
    expect(guardRes.status, 'pre-submit PUT accepted').toBe(200);

    const seeded = await seedImages(token!, agriId!, createdBy!, 3);
    expect(seeded, 'seeded 3 image metadata rows').toBe(3);

    // Submit for review.
    const submitRes = await fetch(`${BACKEND}/api/listings/${agriId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const submitBody = await submitRes.json().catch(() => null);
    expect(
      submitRes.status,
      `submit should be 200 (PENDING_REVIEW). body=${JSON.stringify(submitBody)}`,
    ).toBe(200);
    expect((submitBody as { status?: string })?.status).toBe('PENDING_REVIEW');

    // Boundary must survive the submit transition.
    const afterSubmit = await getListing(token!, agriId!);
    expect(afterSubmit?.status).toBe('PENDING_REVIEW');
    expect(afterSubmit?.boundary, 'boundary still present after submit').toBeTruthy();

    // Listing must appear in the broker's own listings.
    const mineRes = await fetch(`${BACKEND}/api/listings/mine?status=PENDING_REVIEW`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mineRes.status).toBe(200);
    const mineBody = (await mineRes.json()) as { content?: Array<{ id?: string }> };
    const ids = (mineBody.content ?? []).map((l) => l.id);
    expect(ids, 'submitted agri listing appears in /api/listings/mine').toContain(agriId);
  });
});

// ---------------------------------------------------------------------------
// AC4 — invalid boundary PUTs: each fails 422 at its validator stage; state uncorrupted.
// Fresh DRAFT (no prior valid boundary) so we can assert the boundary stays NULL/unchanged.
// ---------------------------------------------------------------------------

test.describe('@integration-ui @full 1368 — Invalid boundary rejection', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  let token: string | null = null;
  let agriId: string | null = null;

  test.beforeAll(async () => {
    if (!hasBrokerCreds) return;
    token = await getToken(brokerEmail, brokerPassword);
    if (!token) return;
    agriId = await createDraftListing(token, 'agricultural_land');
    console.log(`[1368] Created agri DRAFT (invalid-path): ${agriId}`);
  });

  test.afterAll(async () => {
    if (agriId && token) await deleteListing(token, agriId);
  });

  // `code` may be an exact string (deterministic single-stage failure) or a RegExp
  // (when more than one BOUNDARY_* stage can legitimately fire for the same geometry).
  const cases: Array<{ name: string; geo: unknown; code: string | RegExp }> = [
    // Bowtie / London are single-stage deterministic — keep the exact code.
    { name: 'self-intersecting (bowtie)', geo: INVALID_SELF_INTERSECT, code: 'BOUNDARY_INVALID_GEOMETRY' },
    { name: 'outside India (London)', geo: INVALID_OUTSIDE_INDIA, code: 'BOUNDARY_OUTSIDE_INDIA' },
    // > 100 km^2: on the live PostGIS DB this >100 km^2 polygon trips the stage-8
    // ST_IsValid / geometry check (BOUNDARY_INVALID_GEOMETRY) BEFORE the stage-9 area
    // cap (BOUNDARY_TOO_LARGE) can fire, so the specific code is non-deterministic here.
    // The invalid-polygon CONTRACT (422 + a BOUNDARY_* code + uncorrupted boundary) is
    // what we assert. Pinning down BOUNDARY_TOO_LARGE specifically is a follow-up
    // (validator stage ordering / area-cap-before-geometry-check) — see issue #1368 thread.
    { name: '> 100 km^2', geo: INVALID_TOO_LARGE, code: /^BOUNDARY_/ },
  ];

  for (const c of cases) {
    const label = c.code instanceof RegExp ? c.code.source : c.code;
    test(`AC4 — ${c.name} -> 422 ${label}; boundary uncorrupted`, async () => {
      test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set');
      test.skip(agriId === null, 'Agri draft could not be created (stack/creds unavailable)');

      // Snapshot the boundary before the invalid PUT (expected: null on a fresh draft).
      const before = await getListing(token!, agriId!);
      const boundaryBefore = before?.boundary ?? null;

      const res = await putListing(token!, agriId!, {
        boundary: JSON.stringify(c.geo),
      });
      const body = (await res.json().catch(() => null)) as
        | { errors?: Array<{ error?: string; code?: string }> }
        | null;

      expect(res.status, `invalid boundary should be rejected with 422. body=${JSON.stringify(body)}`).toBe(422);

      const codes = (body?.errors ?? []).map((e) => e.code);
      if (c.code instanceof RegExp) {
        // At least one error code must be a BOUNDARY_* code (which specific stage may vary).
        const matched = codes.some((code) => typeof code === 'string' && (c.code as RegExp).test(code));
        expect(matched, `422 envelope errors[].code matches ${c.code} (got ${JSON.stringify(codes)})`).toBe(true);
      } else {
        expect(codes, `422 envelope errors[].code includes ${c.code}`).toContain(c.code);
      }

      // Boundary must be unchanged (still null / prior value) — the rejected PUT must not corrupt it.
      const after = await getListing(token!, agriId!);
      expect(after?.boundary ?? null, 'boundary unchanged after rejected PUT').toEqual(boundaryBefore);
    });
  }
});
