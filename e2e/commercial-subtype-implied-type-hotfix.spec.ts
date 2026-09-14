/**
 * HOTFIX browser arm — a picked Commercial subtype must reach real inventory, in a real browser.
 *
 * THE DEFECT. `PropertyTypeFilter.handleSubtypeChange` appended the bearing family token
 * (`'commercial'`) for every picked subtype. Only SHOP and OFFICE live in
 * `property_type='commercial'`; BUILDING, WAREHOUSE and LAND are self-describing types. So picking
 * Warehouse sent `type=commercial&subtype=WAREHOUSE`, which the #2458 family/subtype union reads as
 * `property_type IN ('commercial') AND has-subtype WAREHOUSE` — a set no row can be in. Zero
 * results, HTTP 200, no error.
 *
 * WHY THIS RUNS ON UDUPI AND CREATES ITS OWN INVENTORY.
 *
 * The Filters Sheet is rendered by `AreaSelectedPanel` only when it is GIVEN `filtersContent`, and
 * of its three production renderers only `DiscoverRightPanel` passes it — measured, not inferred:
 * `NodeListingsSurface` and `DiscoverAreasJourneyPanel` reference it zero times, and the rendered
 * accessibility tree for a Bengaluru hierarchy area contains no Filters trigger at all.
 * `map-filters.spec.ts` M1/M2 pass against Udupi, which is the legacy `DiscoverRightPanel`
 * composition — so that is where the Sheet demonstrably mounts.
 *
 * #2517's Commercial inventory is seeded only at `IN|KA|Bengaluru|Sanjeevini Nagar`, which resolves
 * through the hierarchy journey. Sheet and seeded inventory are therefore in different
 * compositions. Rather than treat that as terminal, this spec CREATES its own Commercial inventory
 * at Udupi/Manipal at runtime, through the real create -> submit -> approve API, putting rows in
 * the one composition where the Sheet is known to render.
 *
 * FALSIFIABILITY. Every arm asserts the result is NON-EMPTY by naming the specific row it expects.
 * An arm that passed on an empty result set would prove nothing. Critically, SHOP and OFFICE must
 * PASS against the UNFIXED component — they were never broken. If all five fail pre-fix, this spec
 * is measuring something other than this defect and is invalid.
 *
 * Interactions are Playwright clicks (real browser input), not `dispatchEvent`/`el.click()`.
 */
import { test, expect, type Page } from '@playwright/test';
import { hasRealCredentials, grantDiscoverConsent } from './helpers';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const BACKEND = process.env.BACKEND_BASE_URL ?? 'http://localhost:8085';

const brokerEmail = process.env.BROKER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? '';
const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

const hasCreds = hasRealCredentials(
  brokerEmail, brokerPassword, adminEmail, adminPassword, userEmail, userPassword,
);

test.use({ storageState: 'e2e/fixtures/user-auth.json' });

/**
 * `IN|KA|Udupi|Manipal` — the legacy composition where the Filters Sheet demonstrably mounts.
 * 'Manipal' matches the curated V127 area_alias seed exactly, so area resolution is synchronous
 * and needs no geocoding (the same reason global-setup uses it).
 */
const DISCOVER_URL = `/discover?city=udupi&areaKey=${encodeURIComponent('IN|KA|Udupi|Manipal')}`;

/** A run-unique tag so these rows cannot collide with, or be mistaken for, seeded inventory. */
const TAG = `HFX${Date.now().toString().slice(-8)}`;

/**
 * Each subtype accepts a DIFFERENT shape-specific field, and the API rejects the others outright
 * ("Field 'floorChoice' is not accepted for this property type"). Values are taken from
 * `listing-field-options.json`, the server-verified contract — not guessed, and not copied from
 * `commercial-listings-seed.sql`, which writes raw column values and bypasses this validation.
 */
const ARMS = [
  {
    subtype: 'SHOP', propertyType: 'commercial', commercialSubtype: 'SHOP', name: 'Shop',
    extra: { floorChoice: 'GROUND_FLOOR' },
  },
  {
    subtype: 'OFFICE', propertyType: 'commercial', commercialSubtype: 'OFFICE', name: 'Office',
    extra: { floorChoice: 'UPPER_FLOOR' },
  },
  {
    subtype: 'BUILDING', propertyType: 'commercial_building', name: 'Building',
    extra: { floorMode: 'GF_ONLY' },
  },
  {
    subtype: 'WAREHOUSE', propertyType: 'warehouse', name: 'Warehouse',
    extra: { warehouseFlooring: 'CONCRETE_RCC' },
  },
  {
    // Commercial Land is measured as LAND area, not built area — the submit validator requires
    // land_area/land_area_unit for this type and rejects the built-area pair the others need.
    subtype: 'LAND', propertyType: 'commercial_land', name: 'Land',
    extra: { commercialZoning: 'COMMERCIAL', landArea: 2400, landAreaUnit: 'SQ_FT' },
  },
] as const;

const createdIds: string[] = [];

async function getToken(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

/**
 * Creates one LIVE Commercial listing at Manipal through the real API.
 *
 * The DESCRIPTION carries the unique tag, not only the title: the server-side duplicate hash
 * excludes the title, so two rows differing only by title are rejected as duplicates.
 */
async function createLiveListing(
  brokerToken: string,
  adminToken: string,
  arm: (typeof ARMS)[number],
): Promise<string> {
  const body: Record<string, unknown> = {
    propertyType: arm.propertyType,
    title: `[${TAG}] Manipal ${arm.name}`,
    locality: 'Manipal',
    price: 6_500_000,
    description:
      `Hotfix browser-arm fixture ${TAG} ${arm.subtype}. Created at runtime by ` +
      `commercial-subtype-implied-type-hotfix.spec.ts. Safe to delete.`,
    // Required by the commercial submit validator, which names these explicitly in its 422.
    builtArea: 1200,
    builtAreaUnit: 'SQ_FT',
    ...arm.extra,
  };
  if ('commercialSubtype' in arm) body.commercialSubtype = arm.commercialSubtype;

  const created = await fetch(`${BACKEND}/api/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
    body: JSON.stringify(body),
  });
  const createdText = await created.text();
  if (!created.ok) {
    throw new Error(`create ${arm.subtype} failed ${created.status}: ${createdText}`);
  }
  const id = (JSON.parse(createdText) as { id?: string }).id;
  if (!id) throw new Error(`create ${arm.subtype} returned no id: ${createdText}`);

  await fetch(`${BACKEND}/api/listings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
    body: JSON.stringify({ ...body, addressConfirmed: true }),
  });

  // Submit requires at least 3 images. Metadata-only stubs, as global-setup does — no upload.
  const brokerUserId = JSON.parse(
    Buffer.from(brokerToken.split('.')[1] ?? '', 'base64url').toString('utf-8'),
  ).sub as string;
  for (const filename of ['img-1.jpg', 'img-2.jpg', 'img-3.jpg']) {
    await fetch(`${BACKEND}/api/listings/${id}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
      body: JSON.stringify({
        storagePath: `listings/${brokerUserId}/${id}/${filename}`,
        url: `https://placeholder.invalid/${filename}`,
      }),
    });
  }

  const submitted = await fetch(`${BACKEND}/api/listings/${id}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${brokerToken}` },
  });
  if (!submitted.ok) {
    throw new Error(`submit ${arm.subtype} failed ${submitted.status}: ${await submitted.text()}`);
  }

  const approved = await fetch(`${BACKEND}/api/admin/listings/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  if (!approved.ok) {
    throw new Error(`approve ${arm.subtype} failed ${approved.status}: ${await approved.text()}`);
  }
  return id;
}

test.beforeAll(async () => {
  if (!hasCreds) return;

  const brokerToken = await getToken(brokerEmail, brokerPassword);
  const adminToken = await getToken(adminEmail, adminPassword);
  if (!brokerToken || !adminToken) throw new Error('could not obtain broker/admin tokens');

  for (const arm of ARMS) {
    createdIds.push(await createLiveListing(brokerToken, adminToken, arm));
  }
});

test.afterAll(async () => {
  if (createdIds.length === 0) return;
  const adminToken = await getToken(adminEmail, adminPassword);
  if (!adminToken) return;
  for (const id of createdIds) {
    await fetch(`${BACKEND}/api/admin/listings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => undefined);
  }
});

async function openFiltersSheet(page: Page): Promise<void> {
  // Without this the telemetry consent dialog opens over the panel and intercepts clicks.
  await grantDiscoverConsent(page);
  await page.goto(DISCOVER_URL);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 20_000 });

  const filtersSheetBtn = page
    .getByRole('button', { name: /Filters/i })
    .filter({ has: page.locator('svg') })
    .first();
  await expect(filtersSheetBtn).toBeVisible({ timeout: 10_000 });
  await filtersSheetBtn.click();
  await expect(page.locator('label[for="subtype-SHOP"]')).toBeVisible({ timeout: 10_000 });
}

/**
 * Clicks the SUBTYPE control by its own id. Targeting by visible text is ambiguous — the
 * property-type grid has a "Warehouse" checkbox and the subtype row has one too, which is part of
 * why the wrong token went unnoticed.
 */
async function clickSubtype(page: Page, subtype: string): Promise<void> {
  await page.locator(`label[for="subtype-${subtype}"]`).click();
}

/**
 * Asserts the filter ACTUALLY APPLIED, then that it kept the right row.
 *
 * The order matters and the absence assertion is the load-bearing half. Every seeded row is
 * already on screen before any subtype is clicked, so a bare `toBeVisible` on the expected row
 * passes on the PRE-FILTER render and never waits for the filtered response — it cannot fail. An
 * earlier revision of this spec did exactly that and passed 6/7 against the UNFIXED component,
 * which is what exposed it.
 *
 * Waiting for a row that must be EXCLUDED to reach count 0 is what proves a filtered response
 * actually arrived. Only then does the presence assertion mean anything.
 */
async function expectFilteredTo(
  page: Page,
  presentName: string,
  absentName: string,
): Promise<void> {
  await expect(page.getByText(`[${TAG}] Manipal ${absentName}`)).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.getByText(`[${TAG}] Manipal ${presentName}`).first()).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('hotfix — a picked Commercial subtype reaches its own inventory', () => {
  for (const arm of ARMS) {
    test(`${arm.subtype} returns its listing, not an empty set`, async ({ page }) => {
      test.skip(!hasCreds, 'credentials not set');

      await openFiltersSheet(page);
      await clickSubtype(page, arm.subtype);

      // WHAT THESE ARMS ACTUALLY PROVE — measured, and it differs between the two groups.
      //
      // The rendered card list is populated by the SUBTYPE-BLIND call. Established by
      // ELIMINATION, not by instrumentation. After a SHOP click:
      //
      //     /api/discover/listings  (commercialSubtypes=SHOP)  -> NEITHER tagged row
      //     /api/discover/cities/{city}/listings  (no subtype)  -> Shop AND Office
      //     rendered <h3> headings                              -> Shop AND Office
      //
      // A non-empty rendered list cannot originate from a response that did not contain those
      // rows, so the subtype-carrying call is excluded as their source. No row was traced
      // id-by-id from a response into the DOM — that is not required here, because the
      // alternative is ruled out rather than merely less likely. Stated precisely: this
      // establishes the blind call as AT MINIMUM a necessary contributor; even a merged render
      // would need it to supply the two rows the other call did not return.
      //
      // WHY SHOP AND NOT WAREHOUSE — this is the part to preserve if this arm is ever reworked.
      // For WAREHOUSE both calls return the SAME set, so the two hypotheses predict identical
      // observations and nothing could separate them. SHOP was chosen precisely because the
      // hypotheses diverge there. Choosing the input where predictions differ is what made
      // elimination available; a "simplification" to a non-discriminating subtype would quietly
      // destroy the result.
      //
      //   - BUILDING / WAREHOUSE / LAND are distinguishable by `property_type` ALONE, so the blind
      //     call filters them correctly once this fix sends the right implied type. These three
      //     arms genuinely prove row membership, and they fail pre-fix.
      //   - SHOP and OFFICE both imply `property_type='commercial'`, which the blind call cannot
      //     tell apart. These two arms therefore prove the FAMILY-level filter, NOT subtype
      //     narrowing — the Warehouse foil disappears because it is a different property type, not
      //     because the subtype narrowed anything. They pass at every version, which is consistent
      //     with them never having been broken AND with them not exercising the subtype axis.
      //
      // Both facts are stated so neither arm is cited for more than it shows. Subtype narrowing
      // within `commercial` is #2531 and is not fixed here.
      const foil = arm.propertyType === 'commercial' ? 'Warehouse' : 'Shop';
      await expectFilteredTo(page, arm.name, foil);
    });
  }

  test('mixed Shop + Warehouse returns BOTH — the arm a naive fix fails', async ({ page }) => {
    test.skip(!hasCreds, 'credentials not set');

    await openFiltersSheet(page);
    await clickSubtype(page, 'SHOP');
    // Wait for the FIRST selection's debounced URL write to land before clicking the second.
    //
    // There is no production race here: `handleFiltersChange` sets React state synchronously and
    // only the URL write is debounced (300 ms), so the second click reads fresh values and the
    // union computes correctly either way. The wait exists so the ASSERTIONS below observe a
    // settled URL, not so the component behaves. A flat sleep was used here previously; this is
    // the same pattern the deselection arm uses, and the two arms should not disagree about how
    // to wait for the same thing.
    await page.waitForURL(
      (url) => (new URLSearchParams(url.search).get('subtype') ?? '').includes('SHOP'),
      { timeout: 20_000 },
    );
    await clickSubtype(page, 'WAREHOUSE');

    // GUARD 1 — the emitted contract. This is precisely what the fix changes: union rather than
    // overwrite. An implementation that replaced instead of unioning settles on a URL carrying
    // only WAREHOUSE, and this wait times out. It is a positive wait on a specific predicate, so
    // it cannot pass by observing nothing.
    await page.waitForURL(
      (url) => {
        const p = new URLSearchParams(url.search);
        const types = (p.get('type') ?? '').split(',');
        const subs = (p.get('subtype') ?? '').split(',');
        return (
          types.includes('commercial') &&
          types.includes('warehouse') &&
          subs.includes('SHOP') &&
          subs.includes('WAREHOUSE')
        );
      },
      { timeout: 20_000 },
    );

    // NO ROW-LEVEL FOIL IS AVAILABLE IN THIS ARM, and it is not an ordering problem. Measured:
    //
    //   - with the contract wait ABOVE it, so the URL had settled to
    //     `type=commercial,warehouse&subtype=SHOP,WAREHOUSE`, a `Manipal Building` count-0 foil
    //     STILL failed — Building remained on screen;
    //   - instrumenting `/api/discover/cities/*/listings` across the second click captured ZERO
    //     requests. The card list is never refetched for a MIXED selection, so it continues to
    //     show whatever the previous state returned.
    //
    // The cause was in the card source, not in this test: `useDiscoverMapData`'s
    // `discoverPropertyType`/`discoverBedrooms` derivations, feeding the `useDiscoverCityListings`
    // card query, sent `propertyTypes?.length === 1 ? propertyTypes[0] : undefined` — so a two-type
    // selection sent NO property type. With it undefined the query key reverted to the unfiltered
    // shape already cached at page load, React Query served it from cache (hence the zero
    // requests), and `keepPreviousData` kept the old rows on screen. On the CARD LIST a mixed
    // Commercial selection therefore showed apartments, houses and land — gross over-inclusion.
    //
    // FIXED in the #2533 frontend half: that hook now accepts and sends the buyer's FULL selection
    // as repeated `?propertyType=`/`?bedrooms=` params (the backend half, cdf36c8a, widened the
    // endpoint to accept them). Deliberately cited by SYMBOL rather than line number — the two
    // `:NNN` citations this paragraph used to carry had already drifted off the code they named.
    //
    // WHAT THAT DOES NOT LICENSE. A mixed selection now issues a real request, so the row-level
    // foil ruled out above may well be viable today. That was NOT re-measured — this Playwright
    // arm needs credentials and a running stack, and the #2533 frontend PR verified at the unit
    // layer only. So the assertions below are left exactly as they were, still a smoke check and
    // still not the proof. Re-measuring the foil is tracked on #2533, not silently assumed here.
    //
    // Single-subtype selections — the three that were returning nothing, which is what this hotfix
    // is for — were unaffected throughout, because one subtype collapses to exactly one type.
    //
    // So the emitted contract is the only sound target here. That is weaker than a row assertion
    // and it is stated rather than hidden: the union's RESULT MEMBERSHIP is proven at the unit
    // layer (`impliedPropertyType.test.tsx`), not by a browser arm. An earlier revision claimed a
    // row foil "does not work" and blamed a render race — the observation was right, that
    // diagnosis was wrong, and this is the measured one.
    //
    // The two assertions below are retained as a smoke check only. Both rows are on screen before
    // the click, so neither can fail on its own; they are not the proof and must not be cited as
    // it.
    await expect(page.getByText(`[${TAG}] Manipal Shop`).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`[${TAG}] Manipal Warehouse`).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  /**
   * DESELECTION — the path no arm exercised, which is how a second instance of this PR's own
   * defect class survived three review passes.
   *
   * Tick Apartment, tick the WAREHOUSE subtype (which selects `warehouse` for you), then untick
   * the Warehouse TYPE box. Before the symmetric fix this left `propertyTypes=['apartment']`
   * beside `commercialSubtypes=['WAREHOUSE']`; the server intersects incompatible families and
   * emits literal `AND FALSE` — zero rows, HTTP 200, no error.
   */
  test('unticking a property type does not strand its subtype in a zero-result state', async ({
    page,
  }) => {
    test.skip(!hasCreds, 'credentials not set');

    await openFiltersSheet(page);
    await page.locator('label[for="type-apartment"]').click();
    // Same pattern as every other wait in this file: wait on the emitted URL, never a flat sleep
    // sized against the 300 ms debounce. A checkbox assertion is synchronous and proves nothing
    // about the write.
    await page.waitForURL(
      (url) => (new URLSearchParams(url.search).get('type') ?? '').includes('apartment'),
      { timeout: 20_000 },
    );

    await clickSubtype(page, 'WAREHOUSE');
    // The subtype selects `warehouse` for the buyer — wait for that to actually land, or the
    // untick below races it and the arm measures nothing.
    await page.waitForURL(
      (url) => (new URLSearchParams(url.search).get('subtype') ?? '').includes('WAREHOUSE'),
      { timeout: 20_000 },
    );

    await page.locator('label[for="type-warehouse"]').click();

    // ASSERT THE EMITTED CONTRACT, not the rendered rows.
    //
    // A row-based assertion here is vacuous: unticking leaves `AND FALSE`, so EVERY row vanishes,
    // and "the Warehouse row is gone" is then true for the wrong reason. An earlier revision of
    // this arm did exactly that and passed against the buggy head.
    //
    // The contract is what the fix changes: the stranded `subtype=WAREHOUSE` must be dropped
    // along with the type it lived in. Against the unfixed handler the subtype survives and this
    // wait times out.
    await page.waitForURL(
      (url) => {
        const p = new URLSearchParams(url.search);
        const types = (p.get('type') ?? '').split(',').filter(Boolean);
        const subs = (p.get('subtype') ?? '').split(',').filter(Boolean);
        return types.includes('apartment') && !types.includes('warehouse') && subs.length === 0;
      },
      { timeout: 20_000 },
    );
  });
});

test.describe('mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Warehouse reaches its listing at mobile width', async ({ page }) => {
    test.skip(!hasCreds, 'credentials not set');

    await openFiltersSheet(page);
    await clickSubtype(page, 'WAREHOUSE');

    await expectFilteredTo(page, 'Warehouse', 'Shop');
  });
});
