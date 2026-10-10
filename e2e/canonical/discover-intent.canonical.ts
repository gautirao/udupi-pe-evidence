/**
 * Discover Buy/Rent intent continuity — T23 (J16), issue #2750 PR-1 C2.
 *
 * T5/T6 prove node browse under ONE intent. T23 proves the intent is a real filter and that it is not lost when the user flips
 * between the List and the Map: on a node whose fixture holds BOTH sale and rent inventory, Buy -> Rent changes the result set
 * (by id, not by count), and the Rent set is still what the user sees, and what the URL says, after List -> Map -> List.
 *
 * ONE test, ONE viewport (390x844): the List <-> Map switch is a mobile-shell control (the desktop shell shows both at once, see
 * e2e/discover/desktop-control-bar-shell-1953.spec.ts), so the mobile viewport is the only place that switch exists. It is not
 * repeated at another viewport. `test.use` is scoped to this describe so no other test in the project changes viewport.
 *
 * FIXTURE (companion rows on the SAME node — scripts/db/fixtures):
 *   RR Nagar  a:IN|KA|Bengaluru|RR Nagar
 *     sale  '[E2E] RR Nagar Fixture Apartment'                      (navigation-hierarchy-fixture-listings-seed.sql)
 *     rent  f2083006-0000-0000-0000-000000000001 '... Rent Apartment A', ...0002 '... Rent House B'
 *                                                                    (navigation-hierarchy-fixture-rent-listings-seed.sql)
 *
 * FALSIFIABLE:
 *   - The Buy set and the Rent set are read from the product's OWN node-scoped query (/api/discover/cities/bangalore/listings
 *     ?areaKeys=...&listingPurpose=sale|rent), and must be DISJOINT by id, each containing its own seeded rows. A Rent that
 *     silently kept returning Buy rows, or a Buy that included rent rows, fails the disjointness / containment assertions.
 *   - Each arm has a positive control (its own seeded title is VISIBLE) before the other intent's title is asserted ABSENT.
 *   - After List -> Map -> List the SAME Rent titles are visible, the Buy title is absent, the URL still carries intent=rent and
 *     the Rent button is pressed; if the Map round trip reset intent to Buy the Buy title would reappear and these fail.
 */
import { test, expect } from './support/canonical-test';
import { hasRealCredentials } from '../helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

const AREA_KEY = 'IN|KA|Bengaluru|RR Nagar';
const NODE_URL = '/discover?city=bangalore&node=' + encodeURIComponent(`a:${AREA_KEY}`);
const SALE_TITLE = '[E2E] RR Nagar Fixture Apartment';
const RENT_IDS = ['f2083006-0000-0000-0000-000000000001', 'f2083006-0000-0000-0000-000000000002'];
const RENT_TITLES = ['[E2E] RR Nagar Fixture Rent Apartment A', '[E2E] RR Nagar Fixture Rent House B'];

type NodeBody = { areas?: Array<{ areaKey?: string; listings?: Array<{ id?: string; title?: string }> }> };
const listingsOf = (b: NodeBody) => (b.areas ?? []).flatMap((a) => a.listings ?? []);

function nodeListingsFor(page: import('./support/canonical-test').Page, purpose: 'sale' | 'rent') {
  return page.waitForResponse(
    (r) => /\/api\/discover\/cities\/bangalore\/listings\?/.test(r.url())
      && r.url().includes('areaKeys=')
      && new RegExp(`listingPurpose=${purpose}\\b`).test(r.url())
      && r.request().method() === 'GET',
    { timeout: 20_000 },
  );
}

test.describe('Buy/Rent intent continuity (mobile shell, 390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('[role:user] T23 — Buy -> Rent changes the result set by id, and the intent survives a List <-> Map switch', async ({ page }) => {
    if (!hasRealCredentials(userEmail, userPassword)) {
      throw new Error('[T23] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
    }
    const heading = (name: string) => page.getByRole('heading', { name, exact: true });
    const rentButton = page.getByTestId('control-bar-intent-selector').getByTestId('intent-selector-rent');
    const buyButton = page.getByTestId('control-bar-intent-selector').getByTestId('intent-selector-buy');

    // ── 1. BUY (the default): the node's sale inventory, none of its rent rows ──
    const buyP = nodeListingsFor(page, 'sale');
    await page.goto(NODE_URL);
    const buyResp = await buyP;
    expect(buyResp.ok(), 'Buy node-scoped listings must respond 2xx').toBe(true);
    const buyListings = listingsOf((await buyResp.json()) as NodeBody);
    const buyIds = buyListings.map((l) => String(l.id));
    expect(buyListings.map((l) => l.title), 'POSITIVE CONTROL: the seeded sale listing is in the Buy set').toContain(SALE_TITLE);
    for (const rentId of RENT_IDS) expect(buyIds, `Buy must not contain the rent listing ${rentId}`).not.toContain(rentId);
    await expect(buyButton).toHaveAttribute('aria-pressed', 'true');
    await expect(heading(SALE_TITLE), 'Buy renders the sale listing').toBeVisible({ timeout: 15_000 });
    for (const t of RENT_TITLES) await expect(heading(t)).toHaveCount(0);

    // ── 2. RENT: the result set CHANGES, by id ───────────────────────────────
    const rentP = nodeListingsFor(page, 'rent');
    await rentButton.click();
    const rentResp = await rentP;
    expect(rentResp.ok(), 'Rent node-scoped listings must respond 2xx').toBe(true);
    const rentListings = listingsOf((await rentResp.json()) as NodeBody);
    const rentIds = rentListings.map((l) => String(l.id));
    for (const id of RENT_IDS) expect(rentIds, `POSITIVE CONTROL: the seeded rent listing ${id} is in the Rent set`).toContain(id);
    expect(rentIds.filter((id) => buyIds.includes(id)), 'Buy and Rent result sets must be DISJOINT on this node').toEqual([]);
    expect(rentIds, 'Rent must not contain the sale listing').not.toContain(buyListings.find((l) => l.title === SALE_TITLE)?.id);
    await expect.poll(() => new URL(page.url()).searchParams.get('intent'), { timeout: 10_000 }).toBe('rent');
    await expect(rentButton).toHaveAttribute('aria-pressed', 'true');
    for (const t of RENT_TITLES) await expect(heading(t), `Rent renders ${t}`).toBeVisible({ timeout: 15_000 });
    await expect(heading(SALE_TITLE), 'the sale listing must be gone under Rent').toHaveCount(0);

    // ── 3. List -> Map -> List: the intent survives ──────────────────────────
    const mapTrigger = page.getByRole('button', { name: 'Map', exact: true });
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await mapTrigger.click();
    await expect(page.locator('.leaflet-container'), 'the Map overlay must really open').toHaveCount(1, { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get('intent'), 'opening the Map must not reset the intent').toBe('rent');

    const listButton = page.getByRole('button', { name: 'List', exact: true });
    await expect(listButton).toBeVisible({ timeout: 10_000 });
    await listButton.click();
    await expect(page.locator('.leaflet-container'), 'the Map overlay must really close').toHaveCount(0, { timeout: 15_000 });

    expect(new URL(page.url()).searchParams.get('intent'), 'the intent must survive List -> Map -> List in the URL').toBe('rent');
    await expect(rentButton, 'the Rent button must still be pressed after the round trip').toHaveAttribute('aria-pressed', 'true');
    await expect(buyButton).toHaveAttribute('aria-pressed', 'false');
    for (const t of RENT_TITLES) await expect(heading(t), `after the round trip ${t} is still shown`).toBeVisible({ timeout: 15_000 });
    await expect(heading(SALE_TITLE), 'the sale listing must NOT have come back after the round trip').toHaveCount(0);
  });
});
