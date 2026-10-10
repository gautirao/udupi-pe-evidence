/**
 * Broker edit persistence — T22 (J14), issue #2750 PR-1 C2.
 *
 * T13 proves a broker can CREATE a listing through the real form. T22 proves an EDIT persists: the broker changes one
 * deterministic field on a listing this run itself owns, saves through the real edit form, and the new value is still there
 * after a hard reload and when the server is asked directly.
 *
 * LISTING UNDER EDIT: a fresh DRAFT created by this test through the typed Residential form (Save draft -> POST /api/listings),
 * owned by the run's broker. Not the T13 listing: that one is PENDING_REVIEW -> LIVE by now, and EditListing.tsx locks those
 * statuses read-only (LOCKED_STATUSES), so editing it is not a supported journey. A DRAFT is the editable state.
 *
 * FIELD: the description (EditListing step 1, textarea #description). Chosen because it is free text with a unique per-run
 * marker, so a stale/default/other-listing value can never equal it by accident, and it has no derived side effects (a title
 * edit can trigger the title/locality warning and area resolution).
 *
 * FALSIFIABLE:
 *   - PRE-STATE: the edit page first hydrates the ORIGINAL description and does not contain the edit marker.
 *   - The persisted value is checked twice, by two independent routes: the form re-hydrated from GET after a hard reload, AND a
 *     direct authenticated GET /api/listings/{id} (bearer taken from the real PUT) — so a UI that only echoes local state fails.
 *   - The PUT is the product's own save (not an arranged call) and must be 2xx.
 */
import { test, expect } from './support/canonical-test';

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const TITLE = `[E2E-T22] Edit persistence ${RUN}`;
const ORIGINAL_DESCRIPTION = `Canonical T22 original description ${RUN}.`;
const EDITED_DESCRIPTION = `Canonical T22 EDITED description ${RUN}.`;

test('[role:broker] T22 — a broker edits one field on a listing they own, saves, and the new value persists across a reload', async ({ page }) => {
  const backend = process.env.BACKEND_BASE_URL;
  if (!backend) throw new Error('[T22] BACKEND_BASE_URL is unset.');

  // ── Arrange (through the real create form): an owned DRAFT ─────────────
  await page.goto('/broker/listings/new/residential');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: 'Create a listing' })).toBeVisible({ timeout: 15_000 });
  await page.locator('#title').fill(TITLE);
  await page.locator('#locality').fill('Manipal');
  await page.getByRole('button', { name: 'Write it myself', exact: true }).click();
  const description = page.getByTestId('description-assistant-ready').locator('textarea');
  await expect(description).toBeVisible({ timeout: 10_000 });
  await description.fill(ORIGINAL_DESCRIPTION);
  await page.locator('#price').fill('6500000');

  const draftCreate = page.waitForResponse((r) => r.url().endsWith('/api/listings') && r.request().method() === 'POST', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const draftResp = await draftCreate;
  expect(draftResp.ok(), 'POST /api/listings (draft create) must respond 2xx').toBe(true);
  const listingId = ((await draftResp.json()) as { id: string }).id;
  expect(listingId, 'the draft create response must carry an id').toBeTruthy();

  // ── PRE-STATE: the edit page hydrates the ORIGINAL value ───────────────
  const editLoad = page.waitForResponse((r) => r.url().endsWith(`/api/listings/${listingId}`) && r.request().method() === 'GET', { timeout: 15_000 });
  await page.goto(`/broker/listings/${listingId}/edit`);
  expect((await editLoad).ok(), 'GET /api/listings/{id} for the edit page must respond 2xx').toBe(true);
  await expect(page.getByRole('heading', { name: 'Edit Listing', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('DRAFT', { exact: true }), 'the listing must be an editable DRAFT, not a locked status').toBeVisible();
  const editDescription = page.locator('#description');
  await expect(editDescription).toHaveValue(ORIGINAL_DESCRIPTION, { timeout: 15_000 });
  expect(await editDescription.inputValue()).not.toContain('EDITED');

  // ── Edit one field and save through the product's own save ─────────────
  await editDescription.fill(EDITED_DESCRIPTION);
  const savePut = page.waitForResponse((r) => r.url().endsWith(`/api/listings/${listingId}`) && r.request().method() === 'PUT', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Save & Continue', exact: true }).click();
  const putResp = await savePut;
  expect(putResp.ok(), 'PUT /api/listings/{id} (the edit form\'s own save) must respond 2xx').toBe(true);
  const bearer = putResp.request().headers()['authorization'];
  expect(bearer, 'the real save must carry the broker bearer token').toBeTruthy();

  // ── Persistence, route 1: a hard reload re-hydrates the form from the server ──
  const reloadLoad = page.waitForResponse((r) => r.url().endsWith(`/api/listings/${listingId}`) && r.request().method() === 'GET', { timeout: 15_000 });
  await page.reload();
  expect((await reloadLoad).ok(), 'GET /api/listings/{id} after the reload must respond 2xx').toBe(true);
  await expect(page.locator('#description'), 'the edited description must survive a hard reload').toHaveValue(EDITED_DESCRIPTION, { timeout: 15_000 });

  // ── Persistence, route 2: the server itself holds the new value ────────
  const direct = await page.request.get(`${backend}/api/listings/${listingId}`, { headers: { Authorization: bearer ?? '' } });
  expect(direct.ok(), 'direct GET /api/listings/{id} must respond 2xx').toBe(true);
  const stored = (await direct.json()) as { id: string; description?: string; status?: string };
  expect(stored.id).toBe(listingId);
  expect(stored.description, 'the server must store the edited description').toBe(EDITED_DESCRIPTION);
  expect(stored.status, 'an edit must not change the DRAFT status').toBe('DRAFT');
});
