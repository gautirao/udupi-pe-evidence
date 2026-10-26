/**
 * Agricultural lifecycle — AG1 (broker create -> hydrate -> UI submit) / AG2 (admin approve) / AG3 (buyer agri discovery), J15,
 * issue #2750 PR-1 C2 + issue #2811 (AgriculturalListingForm URL-seeded draft hydration & real UI submit). Mirrors
 * listing-lifecycle.canonical.ts' T13/T14/T15 (same project topology, same identity switch, same arranged-gate rules); read that
 * file's module docstring first.
 *
 * ARRANGED, NOT PROVEN (stated so it is never mistaken for proof):
 *   - The three photos, the confirmed address + coordinates + locality are registered through the SAME authenticated
 *     endpoints the product uses (POST /api/listings/{id}/images, PUT /api/listings/{id}), because the real routes need a live
 *     third-party geocoder and signed-URL storage upload (not deterministic). Every arranged call asserts 2xx.
 *   - Once those two non-deterministic gates are arranged, AG1 reloads the page at `/broker/listings/new/agricultural?draftId=<id>`
 *     (stamped into the URL via history REPLACE when the draft was created), proves one-shot draft hydration of the agricultural
 *     form fields + location/pin + photos, clicks `Review` -> `Submit for review` through the REAL UI (parity with Residential T13
 *     and Commercial CC1), and asserts `POST /api/listings/{id}/submit` returns `PENDING_REVIEW` and renders `agricultural-submitted-panel`.
 *
 * WHERE THE LISTING LANDS: locality 'Rajarajeshwari Nagar' (RR Nagar's full name; the product resolves area_key alias-first
 * from the locality text, and the canonical fixture carries a curated alias row for it, see part (e) of
 * navigation-hierarchy-schools-agri-fixture-seed.sql) + Bangalore coordinates, so the approved listing falls in the Bangalore RR Nagar
 * area, which is a promoted agri destination in the canonical fixture (agri_destination_classification, SW, 8.384 km:
 * navigation-hierarchy-schools-agri-fixture-seed.sql). A Udupi/Manipal listing could never appear in agri discovery: Udupi has
 * no promoted agri destinations (the endpoint answers 503 AGRI_DESTINATIONS_NOT_YET_PROMOTED).
 *
 * FALSIFIABLE (AG3): the SW <= 25 km agri destinations total is read BEFORE approval (AG2) and AFTER; it must rise by exactly
 * one, the new id must be in /api/discover/agri-map-listings for the RR Nagar area key, and the Discover agri panel must render
 * that new total. A query that returned everything, or an approval that did not make the parcel buyer-visible, fails here.
 */
import { test, expect } from './support/canonical-test';
import { loginAsAdmin, hasRealCredentials } from '../helpers';

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const UNIQUE_TITLE = `[E2E-AG1] Agri lifecycle ${RUN}`;
// Price varies per run so the (description, locality, price) dedupe hash cannot collide with an earlier run on a reused fixture.
const PRICE = 4_000_000 + (Date.now() % 900_000);

// A 1x1 GIF as a data: URL: the arranged photo rows need a url value, but nothing may fetch a third-party host (CR r2 LOW-8).
const HERMETIC_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const RR_NAGAR_AREA_KEY ='IN|KA|Bengaluru|RR Nagar';
const AGRI_DESTINATIONS = '/api/discover/agri-destinations?city=bangalore&direction=SW&maxKm=25';

const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';

let agriId: string | null = null;
let brokerBearer: string | null = null;
let totalBeforeApproval: number | null = null;

function backend(): string {
  const b = process.env.BACKEND_BASE_URL;
  if (!b) throw new Error('[agri-lifecycle] BACKEND_BASE_URL is unset.');
  return b;
}

function decodeJwtSub(token: string): string {
  const seg = token.split('.')[1];
  if (!seg) throw new Error('[agri-lifecycle] bearer is not a JWT.');
  const n = seg.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(n + '='.repeat((4 - (n.length % 4)) % 4), 'base64').toString('utf-8');
  const sub = (JSON.parse(json) as { sub?: string }).sub;
  if (!sub) throw new Error('[agri-lifecycle] JWT has no sub.');
  return sub;
}

type Destinations = { destinations?: Array<{ areaKey?: string; parcelCount?: number }> };

async function agriTotal(page: import('./support/canonical-test').Page): Promise<{ total: number; rrNagar: number }> {
  const r = await page.request.get(`${backend()}${AGRI_DESTINATIONS}`);
  expect(r.ok(), `GET ${AGRI_DESTINATIONS} must respond 2xx (a 503 means the agri destinations fixture is missing)`).toBe(true);
  const body = (await r.json()) as Destinations;
  const ds = body.destinations ?? [];
  expect(ds.length, 'CONTROL: the SW agri corridor must have destinations').toBeGreaterThan(0);
  const total = ds.reduce((s, d) => s + Number(d.parcelCount ?? 0), 0);
  const rr = ds.find((d) => d.areaKey === RR_NAGAR_AREA_KEY);
  expect(rr, `CONTROL: ${RR_NAGAR_AREA_KEY} must be a destination in the SW corridor`).toBeTruthy();
  return { total, rrNagar: Number(rr?.parcelCount ?? 0) };
}

test.describe.serial('AG — agricultural lifecycle (AG2/AG3 depend on AG1)', () => {
  test('[role:broker] AG1 — broker creates an agricultural listing via the real form, arranges photos+pin out-of-band, reloads to hydrate draftId, and submits for review through the real UI', async ({ page }) => {
    await page.goto('/broker/listings/new/agricultural');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Agricultural land listing', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Create a listing' })).toBeVisible();

    await page.locator('#title').fill(UNIQUE_TITLE);
    await page.getByRole('radio', { name: '2 acres' }).click();
    await expect(page.locator('#landArea')).toHaveValue('2');
    await page.locator('#price').fill(String(PRICE));

    // Real draft create.
    const draftPost = page.waitForResponse((r) => r.url().endsWith('/api/listings') && r.request().method() === 'POST', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const draftResp = await draftPost;
    expect(draftResp.ok(), 'POST /api/listings (agri draft create) must respond 2xx').toBe(true);
    const created = (await draftResp.json()) as { id: string; propertyType?: string };
    agriId = created.id;
    expect(agriId, 'the draft create response must carry an id').toBeTruthy();
    expect(created.propertyType, 'the form must create an agricultural_land listing').toBe('agricultural_land');
    const auth = draftResp.request().headers()['authorization'];
    expect(auth, 'the real draft request must carry the broker bearer token').toBeTruthy();
    brokerBearer = (auth ?? '').replace(/^Bearer\s+/i, '');
    const brokerUserId = decodeJwtSub(brokerBearer);

    // #2811 AC1: history REPLACE stamps `?draftId=<id>` into the URL on initial draft create.
    await expect(page).toHaveURL(new RegExp(`[?&]draftId=${agriId}`), { timeout: 10_000 });

    // CLOSED-GATE CONTROL: open Review (a real PUT); with no photos/location the Submit button must be disabled.
    const reviewPut = page.waitForResponse((r) => r.url().endsWith(`/api/listings/${agriId}`) && r.request().method() === 'PUT', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    expect((await reviewPut).ok(), 'the Review save (PUT) must respond 2xx').toBe(true);
    await expect(page.getByRole('heading', { name: 'Review your listing' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Submit for review', exact: true }), 'submit must be blocked while photos/location are missing').toBeDisabled();
    await expect(page.getByText(/item\(s\) still needed/)).toBeVisible();

    // Arranged gates (see docstring): photos, then address/coordinates/locality as the LAST write.
    for (let i = 1; i <= 3; i++) {
      const img = await page.request.post(`${backend()}/api/listings/${agriId}/images`, {
        headers: { Authorization: `Bearer ${brokerBearer}` },
        data: { storagePath: `listings/${brokerUserId}/${agriId}/photo-${i}.jpg`, url: HERMETIC_PIXEL },
      });
      expect(img.ok(), `arranged image ${i} must respond 2xx - got ${img.status()}: ${await img.text()}`).toBe(true);
    }
    const arranged = await page.request.put(`${backend()}/api/listings/${agriId}`, {
      headers: { Authorization: `Bearer ${brokerBearer}` },
      data: { addressConfirmed: true, latitude: 12.9255, longitude: 77.5176, locality: 'Rajarajeshwari Nagar', landArea: 2, landAreaUnit: 'acre' },
    });
    expect(arranged.ok(), `arranged address/locality PUT must respond 2xx - got ${arranged.status()}: ${await arranged.text()}`).toBe(true);

    // #2811 AC2/AC3: reload the page (URL already carries `?draftId=${agriId}`) so AgriculturalListingForm
    // re-fetches and hydrates the draft (title, landArea, price, locality, confirmed pin, and 3 photos) in edit mode.
    const imagesRefetch = page.waitForResponse(
      (r) => r.url().includes(`/api/listings/${agriId}/images`) && r.request().method() === 'GET',
      { timeout: 15_000 },
    );
    const listingRefetch = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${agriId}`) && r.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await page.reload();
    const [imagesRefetchResp, listingRefetchResp] = await Promise.all([imagesRefetch, listingRefetch]);
    expect(imagesRefetchResp.ok(), 'post-reload GET .../images must respond 2xx').toBe(true);
    expect(listingRefetchResp.ok(), 'post-reload GET /api/listings/{id} must respond 2xx').toBe(true);

    await expect(page.getByRole('heading', { name: 'Create a listing' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#title')).toHaveValue(UNIQUE_TITLE, { timeout: 10_000 });
    await expect(page.locator('#landArea')).toHaveValue('2');
    await expect(page.getByTestId('map-pin-status')).toHaveText('Pin confirmed — Rajarajeshwari Nagar', { timeout: 10_000 });

    // Open Review again: the real PUT now preserves hydrated locality/fields (never overwrites with empty state),
    // and the Submit for review button flips from DISABLED -> ENABLED.
    const unblockedReviewPut = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${agriId}`) && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const unblockedReviewResp = await unblockedReviewPut;
    expect(unblockedReviewResp.ok(), 'post-hydration Review save (PUT) must respond 2xx').toBe(true);
    await expect(page.getByRole('heading', { name: 'Review your listing' })).toBeVisible({ timeout: 10_000 });

    const submitButton = page.getByRole('button', { name: 'Submit for review', exact: true });
    await expect(submitButton).toBeVisible({ timeout: 10_000 });
    await expect(submitButton, 'submit must be enabled once hydrated gates are satisfied').toBeEnabled();
    await expect(page.getByText('Published', { exact: false })).toHaveCount(0);

    // Real UI submit click -> POST /api/listings/{id}/submit -> PENDING_REVIEW -> agricultural-submitted-panel.
    const submitPromise = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${agriId}/submit`) && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await submitButton.click();
    const submitResp = await submitPromise;
    expect(submitResp.ok(), `POST /api/listings/{id}/submit must respond 2xx - got ${submitResp.status()}: ${await submitResp.text()}`).toBe(true);
    expect(((await submitResp.json()) as { status?: string }).status).toBe('PENDING_REVIEW');

    const submittedPanel = page.getByTestId('agricultural-submitted-panel');
    await expect(submittedPanel).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Submitted for review' })).toBeVisible();
    await expect(submittedPanel.getByText('Pending admin approval.', { exact: false })).toBeVisible();

    // And the broker sees it as Under Review.
    const mine = page.waitForResponse((r) => r.url().includes('/api/listings/mine') && r.request().method() === 'GET', { timeout: 15_000 });
    await page.goto('/broker/listings');
    expect((await mine).ok(), 'GET /api/listings/mine must respond 2xx').toBe(true);
    const titleNode = page.getByText(UNIQUE_TITLE, { exact: true });
    await expect(titleNode).toBeVisible({ timeout: 10_000 });
    const card = titleNode.locator('xpath=ancestor::*[self::div][.//*[contains(text(),"Under Review") or contains(text(),"Draft") or contains(text(),"Live")]][1]');
    await expect(card.getByText('Under Review', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('[role:broker] AG2 — admin approves the agricultural listing (real admin sign-in on the shared page)', async ({ page }) => {
    if (!agriId) throw new Error('[AG2] agriId was not captured by AG1.');
    if (!hasRealCredentials(adminEmail, adminPassword)) throw new Error('[AG2] ADMIN_EMAIL/ADMIN_PASSWORD absent.');

    // PRE-STATE for AG3: the corridor total BEFORE approval (public endpoint, no session needed).
    const before = await agriTotal(page);
    totalBeforeApproval = before.total;

    await page.goto('/broker/listings');
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();
    await loginAsAdmin(page, adminEmail, adminPassword);
    await expect(page.getByRole('button', { name: 'Admin Console' })).toBeVisible({ timeout: 15_000 });

    const pending = page.waitForResponse((r) => r.url().includes('/api/admin/listings/pending') && r.request().method() === 'GET', { timeout: 15_000 });
    await page.goto('/admin/listings/pending');
    expect((await pending).ok(), 'GET /api/admin/listings/pending must respond 2xx').toBe(true);
    const row = page.getByTestId(`pending-row-${agriId}`);
    await expect(row, 'the submitted agricultural listing must be in the pending queue').toBeVisible({ timeout: 15_000 });
    await expect(row.getByText(UNIQUE_TITLE, { exact: false })).toBeVisible();

    await row.click();
    await expect(page.getByTestId('listing-review-drawer')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    const approve = page.waitForResponse((r) => r.url().endsWith(`/api/admin/listings/${agriId}/approve`) && r.request().method() === 'POST', { timeout: 15_000 });
    await page.getByTestId('confirm-approve-action').click();
    expect((await approve).ok(), 'POST /api/admin/listings/{id}/approve must respond 2xx').toBe(true);
    await expect(page.getByText(/listing approved/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(row, 'the approved row must leave the pending queue').toHaveCount(0, { timeout: 10_000 });
  });

  test('[role:broker] AG3 — the approved agricultural listing is reachable through agri discovery (corridor total +1, listed, rendered)', async ({ page }) => {
    if (!agriId) throw new Error('[AG3] agriId was not captured by AG1.');
    expect(totalBeforeApproval, 'AG2 must have recorded the pre-approval corridor total').not.toBeNull();

    const after = await agriTotal(page);
    expect(after.total, 'approval must add exactly one parcel to the SW <= 25 km agri corridor').toBe((totalBeforeApproval ?? -1) + 1);

    const list = await page.request.get(`${backend()}/api/discover/agri-map-listings?city=bangalore&areaKey=${encodeURIComponent(RR_NAGAR_AREA_KEY)}`);
    expect(list.ok(), 'GET /api/discover/agri-map-listings must respond 2xx').toBe(true);
    const listBody = (await list.json()) as { listings?: Array<{ id?: string }> };
    const ids = (listBody.listings ?? []).map((l) => String(l.id));
    expect(ids.length, 'CONTROL: the RR Nagar agri parcel list must not be empty').toBeGreaterThan(0);
    expect(ids, 'the approved agricultural listing must be among the RR Nagar agri parcels').toContain(agriId);

    // The buyer sees it: the Discover agri panel renders the NEW corridor total.
    const dest = page.waitForResponse((r) => r.url().includes('/api/discover/agri-destinations') && r.request().method() === 'GET', { timeout: 20_000 });
    await page.goto('/discover?city=bangalore&journey=agri-first&region=SW&maxKm=25');
    expect((await dest).ok(), 'the app\'s own agri-destinations request must respond 2xx').toBe(true);
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('agri-group-listing-count')).toHaveText(new RegExp(`^\\s*${after.total}\\s*parcels?\\b`), { timeout: 15_000 });
  });
});
