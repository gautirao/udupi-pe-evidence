/**
 * Saved Homes persistence — T21 (J13), issue #2750 PR-1 C2.
 *
 * ONE journey, server-backed end to end: an authenticated user saves a fixture listing from a Discover result card, the save
 * SURVIVES A RELOAD (it is POST /api/me/saved-listings, not client state), /saved-homes lists the SAME listing, and removing it
 * there empties the list again — also across a reload. Real frontend, real backend, local fixture, no page.route.
 *
 * LISTING: the Bangalore fixture's '[E2E] RR Nagar Fixture Apartment' (navigation-hierarchy-fixture-listings-seed.sql), reached
 * through the same area-leaf URL T6 uses, so it is a card the product itself renders on a real Discover result set.
 *
 * FALSIFIABLE / NO RESIDUE:
 *   - PRE-STATE: before saving, the heart is NOT pressed and /saved-homes does not list the listing (a regression that renders
 *     every heart pressed, or lists every listing, fails here, not later).
 *   - POST-RELOAD: the heart is still pressed after page.reload() (a client-only toggle fails here).
 *   - IDENTITY: the saved row links to /listing/<id> for the id the POST carried — not merely "some card".
 *   - CLEAN-UP: the test unsaves through the UI and re-checks after a reload; a `finally` also DELETEs through the API with the
 *     captured bearer if anything failed in between, so a red run cannot leave a saved row for the next one.
 */
import { test, expect } from './support/canonical-test';
import { hasRealCredentials } from '../helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

const NODE_URL = '/discover?city=bangalore&node=' + encodeURIComponent('a:IN|KA|Bengaluru|RR Nagar');
const TITLE = '[E2E] RR Nagar Fixture Apartment';

test('[role:user] T21 — an authed user saves a fixture listing, it survives a reload and is listed on /saved-homes, and unsaving removes it', async ({ page }) => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T21] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }
  const backend = process.env.BACKEND_BASE_URL;
  if (!backend) throw new Error('[T21] BACKEND_BASE_URL is unset.');

  let savedListingId: string | null = null;
  let bearer: string | null = null;
  let removedThroughUi = false;

  const savedCards = () => page.locator('[data-testid="saved-listing-card"]');
  const openSavedHomes = async () => {
    const listP = page.waitForResponse((r) => /\/api\/me\/saved-listings(\?|$)/.test(r.url()) && r.request().method() === 'GET', { timeout: 20_000 });
    await page.goto('/saved-homes');
    expect((await listP).ok(), 'GET /api/me/saved-listings must respond 2xx').toBe(true);
    await expect(page.getByRole('heading', { name: 'Saved homes', exact: true })).toBeVisible({ timeout: 15_000 });
  };
  const openLeafAndGetHeart = async () => {
    const listingsP = page.waitForResponse((r) => r.url().includes('/api/discover/listings') && r.request().method() === 'GET', { timeout: 20_000 });
    await page.goto(NODE_URL);
    expect((await listingsP).ok(), 'node-scoped /api/discover/listings must respond 2xx').toBe(true);
    const card = page.locator('[data-testid="listing-card"]', { hasText: TITLE }).first();
    await expect(card, `the Discover leaf must render a card titled ${TITLE}`).toBeVisible({ timeout: 15_000 });
    return card.getByTestId('listing-save-button');
  };

  try {
    // ── 0. PRE-STATE: nothing is saved ────────────────────────────────────
    await openSavedHomes();
    await expect(savedCards().filter({ hasText: TITLE }), 'PRE-STATE: the listing must not already be saved').toHaveCount(0);

    // ── 1. Save from the Discover card ────────────────────────────────────
    let heart = await openLeafAndGetHeart();
    await expect(heart, 'PRE-STATE: the heart must start unpressed').toHaveAttribute('aria-pressed', 'false');
    const savePost = page.waitForResponse((r) => /\/api\/me\/saved-listings$/.test(r.url()) && r.request().method() === 'POST', { timeout: 15_000 });
    await heart.click();
    const saveResp = await savePost;
    expect(saveResp.ok(), 'POST /api/me/saved-listings must respond 2xx').toBe(true);
    savedListingId = (saveResp.request().postDataJSON() as { listingId?: string }).listingId ?? null;
    expect(savedListingId, 'the save request must carry a listingId').toBeTruthy();
    bearer = saveResp.request().headers()['authorization'] ?? null;
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await expect(heart).toHaveAttribute('aria-label', 'Remove saved property');

    // ── 2. Survives a reload (server-backed, not a client toggle) ─────────
    heart = await (async () => {
      const idsP = page.waitForResponse((r) => /\/api\/me\/saved-listings\/ids/.test(r.url()) && r.request().method() === 'GET', { timeout: 20_000 });
      await page.reload();
      expect((await idsP).ok(), 'GET /api/me/saved-listings/ids must respond 2xx after the reload').toBe(true);
      const card = page.locator('[data-testid="listing-card"]', { hasText: TITLE }).first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      return card.getByTestId('listing-save-button');
    })();
    await expect(heart, 'the save must SURVIVE a reload').toHaveAttribute('aria-pressed', 'true');

    // ── 3. /saved-homes lists the SAME listing ────────────────────────────
    await openSavedHomes();
    const savedCard = savedCards().filter({ hasText: TITLE });
    await expect(savedCard, '/saved-homes must list exactly the saved listing').toHaveCount(1);
    await expect(savedCard.getByRole('link', { name: TITLE })).toHaveAttribute('href', `/listing/${savedListingId}`);

    // ── 4. Unsave there; gone now AND after a reload ──────────────────────
    const unsaveDelete = page.waitForResponse((r) => r.url().endsWith(`/api/me/saved-listings/${savedListingId}`) && r.request().method() === 'DELETE', { timeout: 15_000 });
    await savedCard.getByRole('button', { name: 'Remove saved property' }).click();
    expect((await unsaveDelete).ok(), 'DELETE /api/me/saved-listings/:id must respond 2xx').toBe(true);
    removedThroughUi = true;
    await expect(savedCards().filter({ hasText: TITLE })).toHaveCount(0);
    await expect(page.getByText('No saved homes yet.')).toBeVisible({ timeout: 10_000 });

    await openSavedHomes();
    await expect(savedCards().filter({ hasText: TITLE }), 'the removal must persist across a reload').toHaveCount(0);
    await expect(page.getByText('No saved homes yet.')).toBeVisible();
  } finally {
    // Residue guard: never leave the saved row behind when a step above failed. DELETE is idempotent (204 even if absent).
    if (savedListingId && !removedThroughUi && bearer) {
      await page.request.delete(`${backend}/api/me/saved-listings/${savedListingId}`, { headers: { Authorization: bearer } }).catch(() => undefined);
    }
  }
});
