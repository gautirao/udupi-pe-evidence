/**
 * Commercial listing lifecycle — issue #2434.
 *
 * CC1  broker creates a Commercial SHOP through the real UI → PENDING_REVIEW
 * CC1b a second SHOP rent listing, so CC4's C16 compares two-element sets
 * CC1c a third rent listing that is an OFFICE, so CC4's subtype narrowing has
 *      a row it must EXCLUDE — without it, deleting the commercialSubtypes
 *      predicate left every CC4 assertion green
 * CC2  admin approves ALL THREE through the real moderation drawer → LIVE
 * CC4  C13 / C16 / C17 — Discover membership, list⇄marker equality, counts
 * CC3  anonymous visitor, correctly gated
 *
 * CC1c is a SINGLE discriminating control, not subtype coverage — #2434's
 * Non-goal forbids testing every Commercial subtype in the browser.
 *
 * C13/C16/C17 ARE implemented here, in CC4. See "SCOPE" below for the rows
 * that are deliberately NOT this issue's.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STATUS: EXECUTED AND PASSING against a real stack
 * ═══════════════════════════════════════════════════════════════════════
 * Real Spring backend, real Postgres/PostGIS fixture, real built frontend.
 * No page.route, no mocked JSON, no direct DB mutation.
 *
 * The six tests here pass; T14/T15 in listing-lifecycle.canonical.ts fail
 * for a pre-existing reason tracked as #2513 and reproduce with this file
 * removed from the tree entirely.
 *
 * This block previously read "NOT YET EXECUTED", written when the file was
 * authored from a code reading. It stayed there through several rounds of
 * real runs. A stale status line on a spec whose entire value is
 * trustworthiness is worse than no status line: update it with the run, or
 * do not write it.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PROJECT TOPOLOGY — all six tests are tagged [role:broker]
 * ═══════════════════════════════════════════════════════════════════════
 * Not a mistake, and not a claim about which role each test drives. Each
 * `canonical-<role>` project in playwright.canonical.config.ts has exactly
 * one `storageState` and one `grep` tag, so a test tagged [role:admin]
 * cannot see module state set by one tagged [role:broker] — `listingId`
 * below would be null. CC2 therefore signs in as admin LIVE, and CC3 clears
 * storage state, each in its OWN page.
 *
 * WHAT IS SHARED IS THE MODULE STATE, NOT THE PAGE. Playwright's
 * `page`/`context` are TEST-scoped, and canonical-broker sets `storageState`,
 * so every test here starts in a fresh broker-authenticated context; only the
 * module-scope `listingId`/`listingIdB`/`bearerToken` cross test boundaries,
 * which declaration order plus `workers: 1` guarantees. An earlier version of
 * this paragraph said "the shared page", which is wrong and propagated into
 * three other comments before it was caught.
 *
 * This mirrors listing-lifecycle.canonical.ts's T13/T14/T15 exactly (see its
 * PROJECT-TOPOLOGY DEVIATION note, cited by NAME rather than line).
 *
 * Consequence worth knowing: with broker credentials absent, this entire
 * file does not run and the suite is green. That is caught in CI, not here
 * — .github/workflows/ci.yml's "Verify required role credential secrets are
 * present" and "Verify all expected canonical role projects are selected"
 * steps (added by PR #2334 for #2187). A spec cannot assert its own
 * non-existence.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ARRANGED OUT OF BAND — photos and pin/locality only (decision D3, PR #2503)
 * ═══════════════════════════════════════════════════════════════════════
 * #2434 says to HOLD "if the canonical fixture cannot provide deterministic
 * upload/location prerequisites through supported paths". It cannot:
 *
 *   - the address/pin flow goes through GET /api/geocode[/reverse], which
 *     src/lib/geocode.ts:1-3 documents as a proxy to the LIVE PUBLIC
 *     Nominatim service — third-party, rate-limited, non-deterministic;
 *   - `#locality` is not a text input. It is an AddressSearch field whose
 *     value commits ONLY by selecting a returned geocoder result, so
 *     "typing the locality" means driving Nominatim.
 *
 * The Commercial form reuses those components as-is
 * (CommercialListingForm.tsx:45, :480), so it inherits the problem.
 *
 * Per D3, exactly two prerequisites are arranged through real authenticated
 * API calls carrying the broker's OWN real bearer JWT — see
 * arrangeSubmitGatesOutOfBand(). This is not what #2434 bans: nothing is
 * intercepted (no page.route), no JSON is fabricated, no DB row is written
 * directly. Every write goes through the product's own API and its own
 * validation. It skips a third-party geocoder the product does not own.
 *
 * Everything constituting the journey proper stays UI-driven: property
 * type, subtype, purpose, typed fields, review, Submit for review, the
 * admin pending-approval UI, approve, and the anon teaser.
 *
 * If that decision is reversed, the change is local to the one helper.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RENT, NOT LEASE (decision D1, PR #2503; control fixed by #2505)
 * ═══════════════════════════════════════════════════════════════════════
 * #2434's brief asked for listingPurpose=LEASE. `lease` is not persistable:
 * chk_listing_purpose (V32:5) permits only ('sale','rent') and no migration
 * widens it, and #2458's approved contract records that as by design. The
 * fixture therefore uses RENT.
 *
 * The broker form USED TO also offer a separate, unpersistable "For Lease"
 * button (CommercialPurposeSection.tsx pre-#2505) — a selectable control
 * over a value the schema rejects. #2505 removed that third option; the
 * control now offers only "For Sale" and "For Rent / Lease", the latter
 * persisting as `rent`. C3 below clicks that merged button.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SCOPE — which matrix rows are NOT this issue's
 * ═══════════════════════════════════════════════════════════════════════
 * C19 (multi-select OR), C20 (cross-contamination), C20b (legacy
 * NULL-subtype), C21 (URL reload / back-forward) and C21b (unknown-value
 * policy) are #2458's acceptance criteria near-verbatim, not #2434's. This
 * issue also carries an explicit Non-goal: "Do not test every Commercial
 * subtype in the browser; lower-layer subtype matrices remain responsible
 * for exhaustive field contracts."
 *
 * They appear in this lane's matrix because that matrix maps the whole
 * Commercial window, which is broader than this issue's Definition of Done
 * by design. CommercialSubtypeFilter2431IT covers them at the IT layer.
 *
 * An earlier version of this block said those rows were "not in this file
 * YET", which framed another issue's criteria as pending work here.
 */

// `test` MUST come from ./support/canonical-test, never '@playwright/test'.
// Its auto fixture installs installNoApiMockGuard() and asserts
// assertBackendTrafficWasReal() in afterEach — the structural guarantee that
// this spec cannot fake a backend even by accident.
//
// canonical-test.ts DEFINES a requireBackendBaseUrl() but does not export it
// (its export list is `test`, `expect`, `waitForFontsReady`,
// `waitForMapSettled`), so this file keeps its own copy. Importing it was my
// first attempt and it failed the whole suite at collection time — see the
// note on that below.
import { test, expect } from './support/canonical-test';
import { loginAsAdmin, hasRealCredentials } from '../helpers';

// Unique per run. Distinct prefix from the Residential lifecycle's
// `[E2E-T13]` so the two suites' rows are never confused — and note that
// listing-lifecycle.canonical.ts has NO cleanup, so `[E2E-T13]%` rows
// accumulate in the fixture. This file archives its own row in afterAll.
const UNIQUE_TITLE = `[E2E-C] Commercial ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// A UNIQUE TITLE IS NOT ENOUGH, and the failure is invisible until Discover.
//
// ListingDeduplicationService.computeDedupeHash hashes
// (description, locality, price) — TITLE IS NOT A COMPONENT. This fixture
// varies only the title, never filled a description, always uses locality
// "Manipal", and because the listing is RENT its `price` is NULL (monthly
// rent does not participate). The hash input was therefore literally
// "" | "manipal" | "" on every run, identical every time.
//
// From run 2 onward each listing was marked is_duplicate = true with a
// monotonically rising repost_count, and
// DiscoverListingPredicateBuilder's base predicate applies
// `pl.is_duplicate = false` unconditionally, alongside `pl.status = 'LIVE'`
// and `pl.archived_at IS NULL` — so the listing was LIVE and simply never
// servable. (Cited by SYMBOL, not line: the line moved between the original
// citation and this base, and a wrong line number invites the reader to
// conclude the claim was fabricated.)
// `checkAndMarkDuplicate` filters on neither status nor archived_at, so this
// file's own afterAll archive removes the row from Discover while leaving it
// in the dedupe universe: the cleanup that makes the spec repeatable is what
// poisoned every subsequent run.
//
// The description carries the same run token and is the FIRST hash
// component, which makes each run's hash genuinely distinct.
const UNIQUE_TITLE_B = `${UNIQUE_TITLE} (B)`;
// Distinct description: the dedupe hash is (description, locality, price)
// and both rows share locality Manipal with a null price, so a shared
// description would make B a duplicate of A and silently unservable —
// the same collision that made CC4 unpassable for four rounds.
const UNIQUE_DESCRIPTION_B = `Second canonical Commercial parity fixture for ${UNIQUE_TITLE} (B).`;
const UNIQUE_DESCRIPTION = `Canonical Commercial lifecycle fixture for ${UNIQUE_TITLE}. Ground-floor shop unit, for rent, entered by the canonical E2E broker.`;
// The OFF-SCOPE SUBTYPE row — see CC1c. Same dedupe reasoning as B: distinct
// description, because it shares Manipal and a null price with A and B.
const UNIQUE_TITLE_C = `${UNIQUE_TITLE} (C-OFFICE)`;
const UNIQUE_DESCRIPTION_C = `Third canonical Commercial fixture for ${UNIQUE_TITLE} (C). Deliberately an OFFICE, not a SHOP, so CC4's subtype narrowing has something it must exclude.`;
// Issue #2809 (Q13 from #2807) — the OUT-OF-MANIPAL Udupi SHOP/rent geographic negative control.
// Identical to CC1/CC1b on every non-geographic axis (Udupi, Commercial, SHOP, rent), but located
// in Brahmavar (IN|KA|Udupi|Brahmavar) rather than Manipal (IN|KA|Udupi|Manipal). Without this row,
// an unscoped city-wide GET /api/discover/listings?city=udupi&propertyTypes=commercial&commercialSubtypes=SHOP&listingPurpose=rent
// returned the exact same two Manipal rows as a Manipal-scoped query, letting Q13 pass undetected.
const UNIQUE_TITLE_OUT_OF_MANIPAL = `${UNIQUE_TITLE} (D-BRAHMAVAR-SHOP)`;
const UNIQUE_DESCRIPTION_OUT_OF_MANIPAL = `Fourth canonical Commercial fixture for ${UNIQUE_TITLE} (D). Deliberately a SHOP in Brahmavar (outside Manipal) so CC4's Manipal area-leaf scoping must exclude an out-of-Manipal Udupi SHOP/rent row (#2809).`;
const MANIPAL_LOCATION = {
  locality: 'Manipal',
  latitude: 13.3522,
  longitude: 74.7873,
} as const;
const OUT_OF_MANIPAL_LOCATION = {
  locality: 'Brahmavar',
  latitude: 13.4534,
  longitude: 74.7402,
} as const;

const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';

/** Decodes a JWT payload's `sub`. No signature verification — test-only. */
function decodeJwtSub(token: string): string {
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('[#2434] bearer token is not a JWT');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub?: string };
  if (!payload.sub) throw new Error('[#2434] bearer token carries no sub claim');
  return payload.sub;
}

function requireBackendBaseUrl(): string {
  const url = process.env.BACKEND_BASE_URL;
  if (!url) {
    throw new Error('[#2434] BACKEND_BASE_URL is not set. The canonical config requires it explicitly.');
  }
  return url;
}

// ── Fixture facts ────────────────────────────────────────────────────────
// Stable, non-sensitive, and sufficient to exercise the typed Commercial
// contracts. No invented proximity, legal-status, footfall, ROI, approval
// or verification claims — #2434 forbids those explicitly.
// ONLY values this spec actually USES — every field below is either entered
// into the form by CC1 or asserted against the persisted row by CC1.
//
// The previous wording ("every field here is filled by CC1") was FALSE for
// `subtype` and `purpose`, which were read by nothing. That is worse than the
// vague prose it replaced: a precise, checkable claim that is wrong can be
// cited. Both are now genuinely read — at the persistence read-back — so the
// claim holds by construction rather than by assertion.
//
// If you add a constant here, give it a reader in the same change. An unread
// fixture constant cannot be validated by anything and reads as coverage.
//
// An earlier version carried 8 unused entries plus `floorChoice: 'GROUND'`,
// which is NOT a real value — the vocabulary is GROUND_FLOOR, defined in
// listing-constants.ts (cited by NAME, not line — line citations drift every
// time anything edits the cited file, and a wrong one reads as fabricated).
// Nothing caught it because nothing read it: the
// floor was selected positionally. A fixture constant that is never used
// cannot be validated by anything, so it reads as a claim about coverage
// while being inert.
const FIXTURE = {
  // `optionLabel` is the control's visible option text; `value` is what the
  // backend persists. Paired in one object so the two can never drift into
  // selecting one subtype and reading back another — which would make the
  // read-back assertion agree with itself rather than with the form.
  subtype: { value: 'SHOP', optionLabel: 'Shop' },
  purpose: 'rent' as const,
  builtArea: '650',
  floorChoiceLabel: 'Ground floor',   // label; value is GROUND_FLOOR
  monthlyRent: '45000',
  securityDepositMonths: '6',
} as const;

// THE OFF-SCOPE SUBTYPE — the whole point of CC1c.
//
// CC4's SCOPE pins commercialSubtypes=SHOP. Every row this file created used
// to BE a SHOP, and #2517's commercial seed is entirely Bengaluru, so the
// SHOP-scoped set and the set of all Udupi commercial rent rows were THE SAME
// TWO ROWS. Delete the commercialSubtypes predicate from the backend and every
// CC4 assertion still passed — the containment, the equality and the count.
// A row that must be EXCLUDED is what makes subtype narrowing falsifiable.
//
// OFFICE specifically, because its submit gates are byte-identical to SHOP's
// (computeCommercialStrengthResult: SHOP and OFFICE share one branch —
// builtArea > 0 && builtAreaUnit !== '' && floorChoice !== ''), so CC1c can
// reuse the CC1 journey verbatim. A WAREHOUSE or LAND row would need a
// different gate path and would make the helper subtype-aware for no gain.
const OFF_SCOPE_SUBTYPE = { value: 'OFFICE', optionLabel: 'Office' } as const;

// Shared across CC1 → CC2 → CC3. See PROJECT TOPOLOGY above for why this
// module-scope link is sound: all three run in the same project, in
// same-file declaration order, with workers=1.
let listingId: string | null = null;
let listingIdB: string | null = null;
// CC1c's OFFICE row. Named for what it does, not for its creation order: it is
// asserted ABSENT from the SHOP scope and PRESENT in the unfiltered control.
let listingIdC: string | null = null;
// Issue #2809: out-of-Manipal Udupi SHOP/rent row (in Brahmavar). Asserted
// PRESENT in the unfiltered Udupi city control and ABSENT from the Manipal
// area-leaf SHOP/rent results.
let listingIdOutOfManipal: string | null = null;
let bearerToken: string | null = null;
let brokerUserId: string | null = null;

/**
 * Arranges the two submit gates the real UI cannot supply deterministically
 * — photos and pin/locality. See ARRANGED OUT OF BAND above for why, and
 * why this is not a mocked or DB-bypassed journey.
 *
 * Isolated here as a single named helper so that reversing decision D3 is a
 * local edit rather than a rewrite of the test.
 */
async function arrangeSubmitGatesOutOfBand(
  request: import('@playwright/test').APIRequestContext,
  backendBaseUrl: string,
  id: string,
  token: string,
  ownerId: string,
  location: { readonly locality: string; readonly latitude: number; readonly longitude: number } = MANIPAL_LOCATION,
): Promise<void> {
  for (let i = 1; i <= 3; i++) {
    const imageResp = await request.post(`${backendBaseUrl}/api/listings/${id}/images`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        storagePath: `listings/${ownerId}/${id}/photo-${i}.jpg`,
        url: 'https://placehold.co/800x600',
        sortOrder: i,
      },
    });
    // Asserted, not fire-and-forget: a silently-failing arrangement would
    // surface later as a confusing submit-gate failure.
    expect(imageResp.status(), `image ${i} POST should be 2xx`).toBeLessThan(300);
  }

  // locality goes here, not through the UI: `#locality` is an AddressSearch
  // box whose typed value is only a search query — it commits solely by
  // selecting a geocoder result, which means driving live Nominatim. The
  // strength model reads `inputs.locality` from FORM state, so the value set
  // here only becomes visible after the reload re-hydrates the draft. Mirrors
  // T13 (listing-lifecycle.canonical.ts:394-403).
  const putResp = await request.put(`${backendBaseUrl}/api/listings/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      addressConfirmed: true,
      latitude: location.latitude,
      longitude: location.longitude,
      locality: location.locality,
    },
  });
  expect(putResp.status(), 'addressConfirmed/lat/lon/locality PUT should be 2xx').toBeLessThan(300);
}

/**
 * The full broker creation journey, through the real UI, up to
 * PENDING_REVIEW. Extracted from CC1 verbatim so the steps stay
 * single-sourced: CC1 proves the journey, and CC1b/CC1c reuse the identical
 * path rather than a second set of selectors that could drift away from it.
 *
 * `subtype` and `location` are the ONLY axes that vary between callers. Everything
 * else — purpose, built area, floor, rent, deposit — is identical by construction,
 * which is what makes CC1c's exclusion attributable to subtype and
 * `listingIdOutOfManipal`'s exclusion attributable to geographic area scope (#2809).
 */
async function createSubmittedCommercialRentListing(
  page: import('@playwright/test').Page,
  backendBaseUrl: string,
  title: string,
  description: string,
  subtype: { readonly value: string; readonly optionLabel: string },
  location: { readonly locality: string; readonly latitude: number; readonly longitude: number } = MANIPAL_LOCATION,
): Promise<{ id: string; token: string; ownerId: string }> {
  await page.goto('/broker/listings/new/commercial');
  await page.waitForLoadState('domcontentloaded');

  // C1 — the real create route is reachable and is the Commercial one.
  await expect(page.getByRole('heading', { name: 'Create a listing' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#commercial-property-type')).toBeVisible();

  // C2 — subtype control exists and offers the approved choices. Asserted
  // POSITIVELY (the option is present) before selecting, so a form that
  // rendered no options at all would fail here rather than silently pass a
  // later negative.
  const subtypeTrigger = page.locator('#commercialSubtype');
  await expect(subtypeTrigger).toBeVisible();
  await subtypeTrigger.click();
  // Both asserted visible on EVERY call, whichever one this call selects: it
  // is the positive control that the option list rendered at all, and it is
  // what would fail if the vocabulary shrank under CC1c.
  await expect(page.getByRole('option', { name: 'Shop' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Office' })).toBeVisible();
  await page.getByRole('option', { name: subtype.optionLabel, exact: true }).click();

  // C3 — purpose. RENT, not LEASE (see decision D1 above); the button is
  // labelled "For Rent / Lease" since #2505 merged the unpersistable third
  // option into this one.
  await page.getByRole('button', { name: 'For Rent / Lease', exact: true }).click();

  // #monthlyRent is gated on isRentOrLease && fieldVisible('monthlyRent')
  // (CommercialTermsSection.tsx:63-66), so its appearance is itself proof
  // that the purpose selection took effect.
  await expect(page.locator('#monthlyRent')).toBeVisible();

  // C4 — representative typed facts through the real form.
  await page.locator('#title').fill(title);
  await page.locator('#monthlyRent').fill(FIXTURE.monthlyRent);
  await page.locator('#builtArea').fill(FIXTURE.builtArea);

  // Required by the BACKEND, presented as optional by the UI. Submit is
  // enabled without it (it is not one of computeCommercialStrengthResult's
  // gates, and CommercialTermsSection.tsx:74 labels it "Security deposit
  // (months)" with no asterisk, unlike "Monthly rent (₹) *" at :65) — and
  // then POST /api/listings/{id}/submit returns
  //   422 {"field":"security_deposit_months",
  //        "message":"Security deposit months is required for rental listings"}
  // That mismatch is a real defect this test found; it is tracked separately
  // and is NOT what this test asserts. Filled here so CC1 exercises the
  // lifecycle rather than re-failing on a known gap.
  await page.locator('#securityDepositMonths').fill(FIXTURE.securityDepositMonths);

  // Description — required for dedupe distinctness, see UNIQUE_DESCRIPTION.
  // "Write it myself" is the deterministic path into the editor: the
  // assistant starts idle and its other button calls the AI generator
  // (CommercialDescriptionAssistant.tsx:49-51,63-68), which a canonical spec
  // must not depend on.
  await page.getByRole('button', { name: 'Write it myself', exact: true }).click();
  const descriptionBox = page.getByTestId('commercial-description-assistant-ready').locator('textarea');
  await expect(descriptionBox).toBeVisible({ timeout: 10_000 });
  await descriptionBox.fill(description);

  // Real UI interaction, but this field's VALUE does not reach the backend
  // gate — `#locality` is an AddressSearch query box whose value commits only
  // by selecting a geocoder result. T13 does the same and says so. The
  // gate-satisfying value is set by the arranged PUT below.
  await page.locator('#locality').fill(location.locality);

  // C4 — floor. Required, not decorative: for SHOP/OFFICE the commercial
  // strength model's typeSpecific gate is
  //   builtArea > 0 && builtAreaUnit !== '' && floorChoice !== ''
  // (commercialListingPayload.ts, computeCommercialStrengthResult). Omitting
  // it leaves "Add the built area and floor" unmet and Submit permanently
  // disabled — which is how the previous run failed.
  await page.locator('#floorChoice').click();
  // Named, not positional. `.first()` selected whatever happened to be at the
  // top, so the typed fact under test was decided by option ordering and the
  // spec could not say which floor it had chosen.
  await page.getByRole('option', { name: FIXTURE.floorChoiceLabel, exact: true }).click();

  // ── Save draft ────────────────────────────────────────────────────────
  // DRAFT CREATION IS NOT AUTOMATIC. The first draft of this spec assumed
  // filling fields fired POST /api/listings and timed out after 15s waiting
  // for a request the product never makes. listing-lifecycle.canonical.ts:332
  // states it outright for the Residential form, and the Commercial form is
  // the same shape: CommercialFooterActions.tsx:31-34 is a "Save draft"
  // button, gated on `canSubmit`.
  //
  // `canSubmit = subtypeResolved && priceValid` (CommercialListingForm.tsx:100-104),
  // and for a rent purpose `priceValid` is `monthlyRent > 0`. So asserting the
  // button is ENABLED is a real check that the subtype and rent above landed —
  // not a formality.
  const saveDraft = page.getByRole('button', { name: 'Save draft', exact: true });
  await expect(saveDraft).toBeEnabled({ timeout: 10_000 });

  const draftCreatePromise = page.waitForResponse(
    (r) => r.url().endsWith('/api/listings') && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await saveDraft.click();
  const draftCreateResp = await draftCreatePromise;
  expect(draftCreateResp.status(), 'draft create should be 2xx').toBeLessThan(300);

  const draftBody = (await draftCreateResp.json()) as { id: string };
  const createdId = draftBody.id as string;
  expect(createdId, 'draft create must return an id').toBeTruthy();

  // The broker's own real JWT, taken from the request the UI itself issued
  // — never minted or forged here.
  const authHeader = draftCreateResp.request().headers()['authorization'];
  const createdToken = (authHeader ?? '').replace(/^Bearer\s+/i, '');
  expect(createdToken, 'draft create must carry a bearer token').toBeTruthy();
  const createdOwnerId = decodeJwtSub(createdToken);

  // C5/C6 — see ARRANGED OUT OF BAND above.
  await arrangeSubmitGatesOutOfBand(page.request, backendBaseUrl, createdId, createdToken, createdOwnerId, location);

  // ── Reload so the form re-observes the arranged state ──────────────────
  // The photos and pin were written through the API, so the mounted form's
  // React Query cache still believes neither exists and its strength model
  // keeps Submit disabled. A hard reload re-mounts fresh and forces a real
  // refetch. Waiting on both GETs (rather than sleeping) is what makes this
  // deterministic. Same approach as T13 (listing-lifecycle.canonical.ts:405-419).
  const imagesRefetch = page.waitForResponse(
    (r) => r.url().includes(`/api/listings/${createdId}/images`) && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  const listingRefetch = page.waitForResponse(
    (r) => r.url().endsWith(`/api/listings/${createdId}`) && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.reload();
  const [imagesResp, listingResp] = await Promise.all([imagesRefetch, listingRefetch]);
  expect(imagesResp.status(), 'post-reload images GET should be 2xx').toBeLessThan(300);
  expect(listingResp.status(), 'post-reload listing GET should be 2xx').toBeLessThan(300);

  // ── C7 — the review step ───────────────────────────────────────────────
  // "Submit for review" does NOT live on the form. The Commercial footer has
  // "Save draft" and "Review" (CommercialFooterActions.tsx:31-38); Submit is
  // on the review screen (CommercialReviewScreen.tsx:57-64), gated on
  // strengthResult.isSubmittable. Going straight for Submit — as the first
  // draft of this spec did — waits for a control that is not on that page.
  await page.getByRole('button', { name: 'Review', exact: true }).click();

  // CommercialReviewPreview.tsx:168 — the Commercial review surface, not a
  // heading string that could drift.
  await expect(page.getByTestId('commercial-review-preview')).toBeVisible({ timeout: 10_000 });

  // C8 — submit through the real UI. Enabled-ness is a real assertion here:
  // it is gated on strengthResult.isSubmittable, so it flips only because the
  // photos and pin above genuinely landed and the reload re-observed them.
  const submitButton = page.getByRole('button', { name: 'Submit for review', exact: true });
  await expect(submitButton).toBeEnabled({ timeout: 15_000 });

  const submitPromise = page.waitForResponse(
    (r) => r.url().endsWith(`/api/listings/${createdId}/submit`) && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await submitButton.click();
  const submitResp = await submitPromise;
  // Carry the body into the message: a bare status tells you the submit was
  // refused but not why, and this endpoint's refusals are field-level.
  expect(
    submitResp.status(),
    `submit should be 2xx — got ${submitResp.status()}: ${await submitResp.text()}`,
  ).toBeLessThan(300);

  // The COMMERCIAL panel — CommercialListingForm.tsx:245. Asserting the
  // Residential testid here would produce a test that can only fail.
  await expect(page.getByTestId('commercial-submitted-panel')).toBeVisible({ timeout: 10_000 });

  // C9 — PENDING_REVIEW, read back from the API rather than inferred from
  // the panel being visible.
  const stateResp = await page.request.get(`${backendBaseUrl}/api/listings/${createdId}`, {
    headers: { Authorization: `Bearer ${createdToken}` },
  });
  expect(stateResp.status()).toBeLessThan(300);
  const persisted = (await stateResp.json()) as {
    status?: string;
    listingPurpose?: string;
    commercialSubtype?: string;
  };
  expect(persisted.status).toBe('PENDING_REVIEW');

  // The SUBTYPE is read back too. It was previously chosen in the UI and
  // never verified to have persisted — the only downstream proof was CC4's
  // Discover query, which is several tests away and would present a failure
  // here as a membership problem there.
  // LOAD-BEARING FOR CC1c ABOVE ALL. If the OFFICE row silently persisted as
  // SHOP, its absence from CC4's SHOP scope would become a false negative and
  // the discriminating control would be proving the opposite of what it claims.
  expect(
    persisted.commercialSubtype,
    `the created listing must persist the ${subtype.value} subtype that was selected in the form`,
  ).toBe(subtype.value);

  // THE RENT RULING'S ONLY FALSIFIABLE CHECK IN THIS FLOW.
  // `#monthlyRent` becoming visible does NOT prove RENT: its gate is
  // `isRentOrLease`, so it renders identically had "For Lease" been clicked
  // (CommercialTermsSection.tsx:63). Without this read-back the spec could
  // not fail if the owner's D1 ruling were violated in the journey — the
  // purpose was pinned only in CC4's query string, downstream of creation.
  expect(persisted.listingPurpose, 'D1: the created listing must persist RENT, not lease or sale').toBe(FIXTURE.purpose);
  return { id: createdId, token: createdToken, ownerId: createdOwnerId };
}

test('[role:broker] CC1 — broker creates a Commercial SHOP through the real UI and submits for review', async ({ page }) => {
  const backendBaseUrl = requireBackendBaseUrl();
  const created = await createSubmittedCommercialRentListing(
    page, backendBaseUrl, UNIQUE_TITLE, UNIQUE_DESCRIPTION, FIXTURE.subtype,
  );
  listingId = created.id;
  bearerToken = created.token;
  brokerUserId = created.ownerId;
});

test('[role:broker] CC1b — a SECOND Commercial SHOP rent listing, so C16 compares two-element sets', async ({ page }) => {
  // WHY THIS EXISTS — do not delete it as a duplicate of CC1.
  //
  // C16 asserts that list and marker membership are EQUAL. With a single
  // listing in the udupi+commercial+SHOP+rent scope, both sides are
  // one-element sets and equality is indistinguishable from containment:
  // the assertion is correct but proves nothing an `includes` would not.
  // A second row makes it genuinely discriminating — it is what fails if
  // the list holds {a, b} and the markers hold {a, c}.
  //
  // It cannot come from the fixture: the canonical Commercial seed is
  // Bengaluru-only by a standing owner ruling that Udupi must not be
  // promoted inside fixture work (seeding a Udupi canonical node flips
  // ~15 assertion sites in specs the pre-push gate does not run). So the
  // second row is created here, in this issue's own scope, seeding
  // nothing.
  const backendBaseUrl = requireBackendBaseUrl();
  const created = await createSubmittedCommercialRentListing(
    page, backendBaseUrl, UNIQUE_TITLE_B, UNIQUE_DESCRIPTION_B, FIXTURE.subtype,
  );
  listingIdB = created.id;

  // CLEANUP DEPENDS ON THIS, on the FAILURE path specifically. `bearerToken`
  // is otherwise set only by CC1. If CC1 fails before capturing it, Playwright
  // restarts the worker and CC1b runs against a fresh module — so CC1b creates
  // a real row while `bearerToken` is still null, and afterAll returns early
  // on `!bearerToken`, leaking exactly the row the cleanup exists to remove.
  // Both tokens belong to the same broker, so this is a fallback, not a
  // reassignment: never overwrite CC1's.
  if (!bearerToken) bearerToken = created.token;

  expect(listingIdB, 'CC1b must produce a second listing id').toBeTruthy();
  expect(listingIdB, 'CC1b must be a DISTINCT listing from CC1').not.toBe(listingId);

  // Issue #2809 (Q13 from #2807) — also create an OUT-OF-MANIPAL Udupi SHOP/rent
  // control listing in Brahmavar (IN|KA|Udupi|Brahmavar) so CC4's Manipal area-leaf
  // scoping has a real Udupi SHOP/rent negative geographic control it must exclude.
  const createdOutOfManipal = await createSubmittedCommercialRentListing(
    page,
    backendBaseUrl,
    UNIQUE_TITLE_OUT_OF_MANIPAL,
    UNIQUE_DESCRIPTION_OUT_OF_MANIPAL,
    FIXTURE.subtype,
    OUT_OF_MANIPAL_LOCATION,
  );
  listingIdOutOfManipal = createdOutOfManipal.id;
  expect(listingIdOutOfManipal, 'CC1b must produce an out-of-Manipal Udupi SHOP/rent control listing id').toBeTruthy();
  expect(listingIdOutOfManipal, 'out-of-Manipal control must be distinct from CC1').not.toBe(listingId);
  expect(listingIdOutOfManipal, 'out-of-Manipal control must be distinct from CC1b').not.toBe(listingIdB);
});

test('[role:broker] CC1c — a THIRD Commercial rent listing, an OFFICE, so CC4 subtype narrowing can fail', async ({ page }) => {
  // WHY THIS EXISTS — this is the row that makes CC4 falsifiable.
  //
  // Before it, every listing this file created was a SHOP, and #2517's
  // commercial seed is entirely Bengaluru — no seeded Udupi commercial row at
  // all. So CC4's SHOP-scoped set and the set of ALL Udupi commercial rent
  // rows were the same two rows. Removing the `commercialSubtypes` predicate
  // from the backend left every CC4 assertion green: the C13 containment, the
  // C16 equality, the C17 count. CC4 was the one E2E a reader would cite as
  // browser-level proof of Commercial subtype narrowing, and it could not fail.
  //
  // This row is created identically to CC1 and CC1b in EVERY respect except
  // the subtype, so its exclusion from the SHOP scope is attributable to the
  // subtype alone. CC4 asserts it ABSENT there and PRESENT in the unfiltered
  // servability control — the second half being what stops "absent" from
  // meaning "never existed".
  //
  // NOT subtype coverage. #2434's Non-goal is explicit: "Do not test every
  // Commercial subtype in the browser". This is ONE discriminating control for
  // falsifiability. Do not grow it into a matrix — CommercialSubtypeFilter2431IT
  // owns that at the IT layer.
  //
  // IT MUST REACH LIVE. CC2 approves it through the same real drawer as the
  // other two. If it stopped at PENDING_REVIEW its absence from the SHOP set
  // would be explained by STATUS rather than SUBTYPE, and this control would be
  // vacuous while looking like proof — the exact failure class it closes.
  const backendBaseUrl = requireBackendBaseUrl();
  const created = await createSubmittedCommercialRentListing(
    page, backendBaseUrl, UNIQUE_TITLE_C, UNIQUE_DESCRIPTION_C, OFF_SCOPE_SUBTYPE,
  );
  listingIdC = created.id;

  // Same failure-path fallback as CC1b: if CC1 died before capturing the
  // token, the worker restarted and this test created a real row against a
  // fresh module. Without this, afterAll returns early and leaks it.
  if (!bearerToken) bearerToken = created.token;

  expect(listingIdC, 'CC1c must produce a third listing id').toBeTruthy();
  expect(listingIdC, 'CC1c must be DISTINCT from CC1').not.toBe(listingId);
  expect(listingIdC, 'CC1c must be DISTINCT from CC1b').not.toBe(listingIdB);
});

test('[role:broker] CC2 — admin approves the submitted Commercial listing through the real moderation UI', async ({ page }) => {
  const backendBaseUrl = requireBackendBaseUrl();

  // NOTE ON THIS GUARD'S REACH: `listingId` is module scope shared across
  // CC1→CC2→CC3. That sharing survives only while every preceding test
  // PASSES. When a test fails, Playwright tears down the worker and the next
  // test re-imports the module with `listingId` back to null — so a null here
  // usually means CC1 failed, not that CC1 forgot to set it. (This is also
  // what produced T15's confusing "listingId was not captured by T13" in the
  // Residential chain: T14 failed, the worker restarted, T15 saw a fresh
  // module. Noted on #2513.)
  // "CC1 or CC1b or CC1c": a failure in ANY preceding test restarts the worker
  // and re-imports the module, so a null here does not single out CC1. The
  // message used to name CC1 alone and would send the reader to the wrong test.
  expect(listingId, 'CC2 requires CC1 to have created a listing — a null here usually means CC1, CC1b or CC1c failed').toBeTruthy();
  if (!hasRealCredentials(adminEmail, adminPassword)) {
    throw new Error('[#2434] ADMIN_EMAIL/ADMIN_PASSWORD absent — CC2 fails closed rather than skipping.');
  }

  // Live admin sign-in on THIS TEST'S OWN page — see PROJECT TOPOLOGY above.
  // (Not "the shared page": the page is test-scoped and starts broker-
  // authenticated from the project storageState, which is precisely why the
  // clearing below is required.)
  //
  // clearCookies() ALONE IS NOT ENOUGH, and the failure is silent-ish: the
  // Supabase session lives in localStorage, not cookies, so the page stays
  // broker-authenticated, /auth hits Auth.tsx's already-signed-in redirect,
  // and `#signin-email` never renders — the first version of this test timed
  // out there. Navigate first (localStorage is origin-scoped, so there must
  // be a page on the origin before clearing), then clear both.
  // Mirrors T14 (listing-lifecycle.canonical.ts:504-511).
  await page.goto('/broker/listings');
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();

  await loginAsAdmin(page, adminEmail, adminPassword);
  await expect(page.getByRole('button', { name: 'Admin Console' })).toBeVisible({ timeout: 15_000 });

  const pendingQueuePromise = page.waitForResponse(
    (r) => r.url().includes('/api/admin/listings/pending') && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto('/admin/listings/pending');
  const pendingQueueResp = await pendingQueuePromise;
  expect(pendingQueueResp.status()).toBeLessThan(300);

  // C10 — matched by ID, never by title. Title matching would be satisfied
  // by a leaked row from an earlier run (see the cleanup note at the top).
  const row = page.getByTestId(`pending-row-${listingId}`);
  await expect(row).toBeVisible({ timeout: 15_000 });

  // C11 — the REAL moderation interaction is three steps, not one.
  //
  // This originally copied T14's `row.getByRole('button', {name:'Approve'})`.
  // That button does not exist: PendingApprovalsTable.tsx:80-97 gives the row
  // a Checkbox and a "Review" column whose onClick calls onReview(), and no
  // approve control at all. Approval lives in the drawer that click opens.
  // Copying T14's pattern inherited its staleness, so this could never have
  // passed. T14 itself is tracked as #2513 and is NOT fixed here.
  await row.click();

  // ListingReviewDrawer.tsx:149
  await expect(page.getByTestId('listing-review-drawer')).toBeVisible({ timeout: 10_000 });

  // :392-394 — opens the "Approve this listing?" confirm dialog. It does not
  // itself approve, so stopping here would prove nothing.
  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  const approvePromise = page.waitForResponse(
    (r) => r.url().endsWith(`/api/admin/listings/${listingId}/approve`) && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  // :407-410 — the control that actually fires onApprove(listing.id).
  await page.getByTestId('confirm-approve-action').click();
  const approveResp = await approvePromise;
  expect(approveResp.status(), 'approve should be 2xx').toBeLessThan(300);

  // C12 — LIVE, read back rather than inferred from the 200.
  const stateResp = await page.request.get(`${backendBaseUrl}/api/listings/${listingId}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  expect(stateResp.status()).toBeLessThan(300);
  expect((await stateResp.json()).status).toBe('LIVE');

  // ── Approve CC1b's second listing through the SAME real drawer ────────
  // It has to reach LIVE too, or C16's arms stay one-element and the
  // equality assertion goes on coinciding with containment — which is the
  // whole reason CC1b exists.
  expect(listingIdB, 'CC2 needs CC1b to have produced a second listing').toBeTruthy();

  const queueBPromise = page.waitForResponse(
    (r) => r.url().includes('/api/admin/listings/pending') && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto('/admin/listings/pending');
  expect((await queueBPromise).status(), 'pending queue reload should be 2xx').toBeLessThan(300);

  const rowB = page.getByTestId(`pending-row-${listingIdB}`);
  await expect(rowB).toBeVisible({ timeout: 15_000 });
  await rowB.click();
  await expect(page.getByTestId('listing-review-drawer')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  const approveBPromise = page.waitForResponse(
    (r) => r.url().endsWith(`/api/admin/listings/${listingIdB}/approve`) && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByTestId('confirm-approve-action').click();
  expect((await approveBPromise).status(), 'second approve should be 2xx').toBeLessThan(300);

  const stateBResp = await page.request.get(`${backendBaseUrl}/api/listings/${listingIdB}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  expect(stateBResp.status()).toBeLessThan(300);
  expect((await stateBResp.json()).status, 'the second listing must also reach LIVE').toBe('LIVE');

  // ── Approve CC1c's OFFICE row through the SAME real drawer ────────────
  // THIS IS THE STEP THAT MUST NOT BE SKIPPED. CC4 asserts the OFFICE row is
  // ABSENT from the SHOP-scoped set. If it never reaches LIVE, that absence is
  // explained by STATUS and says nothing whatever about SUBTYPE — the negative
  // goes green for the wrong reason and the control that exists to make CC4
  // falsifiable becomes another assertion that cannot fail. CC4's
  // PRESENT-in-the-unfiltered-control arm is what catches this if it regresses,
  // because an unapproved row is absent from that feed too.
  expect(listingIdC, 'CC2 needs CC1c to have produced the OFFICE listing').toBeTruthy();

  const queueCPromise = page.waitForResponse(
    (r) => r.url().includes('/api/admin/listings/pending') && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto('/admin/listings/pending');
  expect((await queueCPromise).status(), 'pending queue reload should be 2xx').toBeLessThan(300);

  const rowC = page.getByTestId(`pending-row-${listingIdC}`);
  await expect(rowC).toBeVisible({ timeout: 15_000 });
  await rowC.click();
  await expect(page.getByTestId('listing-review-drawer')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  const approveCPromise = page.waitForResponse(
    (r) => r.url().endsWith(`/api/admin/listings/${listingIdC}/approve`) && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByTestId('confirm-approve-action').click();
  expect((await approveCPromise).status(), 'third approve should be 2xx').toBeLessThan(300);

  const stateCResp = await page.request.get(`${backendBaseUrl}/api/listings/${listingIdC}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  expect(stateCResp.status()).toBeLessThan(300);
  expect(
    (await stateCResp.json()).status,
    'the OFFICE listing must reach LIVE, or CC4 absence proves status rather than subtype',
  ).toBe('LIVE');

  // ── Approve CC1b's out-of-Manipal Udupi SHOP/rent control row (#2809) ──
  // Must also reach LIVE through the same real moderation drawer so its absence
  // from CC4's Manipal leaf is attributable strictly to geographic scoping, not status.
  expect(
    listingIdOutOfManipal,
    'CC2 needs CC1b to have produced the out-of-Manipal Udupi SHOP/rent control listing',
  ).toBeTruthy();

  const queueOutOfManipalPromise = page.waitForResponse(
    (r) => r.url().includes('/api/admin/listings/pending') && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto('/admin/listings/pending');
  expect((await queueOutOfManipalPromise).status(), 'pending queue reload should be 2xx').toBeLessThan(300);

  const rowOutOfManipal = page.getByTestId(`pending-row-${listingIdOutOfManipal}`);
  await expect(rowOutOfManipal).toBeVisible({ timeout: 15_000 });
  await rowOutOfManipal.click();
  await expect(page.getByTestId('listing-review-drawer')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  const approveOutOfManipalPromise = page.waitForResponse(
    (r) => r.url().endsWith(`/api/admin/listings/${listingIdOutOfManipal}/approve`) && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByTestId('confirm-approve-action').click();
  expect((await approveOutOfManipalPromise).status(), 'fourth approve should be 2xx').toBeLessThan(300);

  const stateOutOfManipalResp = await page.request.get(
    `${backendBaseUrl}/api/listings/${listingIdOutOfManipal}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } },
  );
  expect(stateOutOfManipalResp.status()).toBeLessThan(300);
  expect(
    (await stateOutOfManipalResp.json()).status,
    'the out-of-Manipal Udupi SHOP/rent control listing must reach LIVE, or CC4 absence proves status rather than geographic area scope',
  ).toBe('LIVE');
});

test('[role:broker] CC4 — the created Commercial listing is discoverable under Commercial + Shop, and list and marker membership agree', async ({ page }) => {
  // C13 / C16 / C17.
  //
  // THIS PAGE IS BROKER-AUTHENTICATED, from the canonical-broker project's
  // storageState — NOT admin-authenticated "left over from CC2", as an earlier
  // version of this comment claimed. Playwright's page/context are TEST-scoped,
  // so no sign-in performed in CC2 can reach this test at all. Sufficient
  // either way: /api/discover/listings is auth-only, and these rows are about
  // membership, not role.
  //
  // The declaration order relative to CC3 is therefore NOT load-bearing, and
  // the old claim that it was ("CC3 anonymizes the shared page") was false for
  // the same reason — CC3 clears its OWN context, which this test never sees.
  //
  // DRIVES THE BROWSER, not page.request. The first version asserted purely
  // through Playwright's APIRequestContext and was failed by the harness's own
  // installNoApiMockGuard / assertBackendTrafficWasReal: zero backend requests
  // observed, because that guard watches the PAGE. The guard was right — a
  // membership row that never makes the product issue the query proves the API
  // works, not that Discover uses it. Asserting on the response the APP fires
  // is the stronger claim anyway.
  //
  // Asserts MEMBERSHIP, not rendering.
  //
  // THIS COMMENT PREVIOUSLY SAID the rendering rows "wait on #2433". That is no
  // longer true, and it is corrected rather than left standing: #2433 merged as
  // 0ca505e0 (subtype-aware Commercial summaries on result cards) and #2432 as
  // 7f2b5c9f (Commercial facts on buyer detail). A deferral justified by an
  // EXPIRED reason reads as pending work and is simply false.
  //
  // CARD SUMMARY COPY stays unasserted for COUPLING: the AREA journey renders
  // no Commercial summary (that gap is #2516's), and pinning another lane's
  // wording produces an arm that fails when someone improves a label — which
  // gets it deleted rather than fixed. Where these DO work they are already
  // covered, non-canonically: card summary by e2e/discover-commercial-card-summary.spec.ts
  // (Bangalore, authenticated VIEWPORT) and buyer-detail facts by
  // e2e/commercial-detail-facts-2432.spec.ts.
  //
  // Uses the listings CC1/CC1b/CC1c CREATED, never a seeded row — a binding
  // requirement of this issue, and what makes this row independent of #2517's
  // seed. Note #2517's commercial seed is entirely BENGALURU: there is no seeded
  // Udupi commercial row, so this row can only ever pass on the listings this
  // spec creates. Do not assume fixture coverage backs it up.
  //
  // THAT SAME FACT IS WHY BOTH DISCRIMINATING CONTROLS EXIST:
  //   1. `listingIdC` (Manipal OFFICE/rent): breaks subtype coincidence so
  //      removing `commercialSubtypes=SHOP` fails CC4.
  //   2. `listingIdOutOfManipal` (Brahmavar SHOP/rent, #2809): breaks geographic
  //      coincidence so an unscoped city-wide Udupi SHOP/rent query fails CC4.
  expect(listingId, 'CC4 requires CC1/CC2 to have produced a LIVE listing').toBeTruthy();
  expect(listingIdB, 'CC4 requires CC1b/CC2 to have produced a second in-Manipal LIVE listing').toBeTruthy();
  expect(listingIdC, 'CC4 requires CC1c/CC2 to have produced the LIVE OFFICE listing').toBeTruthy();
  expect(
    listingIdOutOfManipal,
    'CC4 requires CC1b/CC2 to have produced the LIVE out-of-Manipal Udupi SHOP/rent control listing',
  ).toBeTruthy();
  expect(bearerToken, 'CC4 needs the broker token CC1 captured').toBeTruthy();

  const backendBaseUrl = requireBackendBaseUrl();
  const auth = { Authorization: `Bearer ${bearerToken}` };
  const idsOf = (b: { content?: Array<{ id?: string }> }) => new Set((b.content ?? []).map((x) => x.id));

  // ── INTERMEDIATE CONTROL — are all four listings SERVABLE in Udupi? ────
  // Asked BEFORE any filtered assertion, and separately, because a filtered
  // zero has two very different causes that look identical: "the filter
  // excluded it" and "it is LIVE but not servable". The second is what
  // is_duplicate produces, and conflating them cost four rounds of
  // diagnosis here.
  //
  // Neither isDuplicate nor repostCount is exposed on any response DTO, so
  // the flag cannot be asserted directly — this unfiltered query is the
  // closest observable proxy.
  const servableResp = await page.request.get(
    `${backendBaseUrl}/api/discover/listings?city=udupi&listingPurpose=rent&page=0&size=200`,
    { headers: auth },
  );
  expect(servableResp.status(), 'unfiltered city query should be 2xx').toBeLessThan(300);
  const servableBody = (await servableResp.json()) as {
    content?: Array<{ id?: string; areaKey?: string | null; commercialSubtype?: string | null }>;
    totalElements?: number;
  };
  const servableIds = idsOf(servableBody);
  const servableById = new Map((servableBody.content ?? []).map((item) => [item.id, item]));

  // EXHAUSTIVE, asserted. At the previous size=50 with no check, a city whose
  // results outgrew one page would drop the listing for PAGINATION reasons
  // while the message below blamed is_duplicate/archived — a control that
  // misdirects is worse than none, because it is trusted.
  expect(
    servableBody.totalElements,
    `CONTROL is not exhaustive: totalElements ${servableBody.totalElements} exceeds the ${servableIds.size} returned, so absence below would mean pagination, not unservability`,
  ).toBe(servableIds.size);

  expect(
    Array.from(servableIds),
    'CONTROL: CC1 listing is LIVE but absent from the UNFILTERED city query, which is proven exhaustive above — '
      + 'so it is not servable at all (is_duplicate, archived, or excluded by the base predicate), and any filtered result below would be meaningless',
  ).toContain(listingId);
  expect(
    Array.from(servableIds),
    'CONTROL: CC1b listing must be present in the UNFILTERED city query',
  ).toContain(listingIdB);
  expect(servableById.get(listingId ?? '')?.areaKey, 'CC1 listing must resolve to IN|KA|Udupi|Manipal').toBe(
    'IN|KA|Udupi|Manipal',
  );
  expect(servableById.get(listingIdB ?? '')?.areaKey, 'CC1b listing must resolve to IN|KA|Udupi|Manipal').toBe(
    'IN|KA|Udupi|Manipal',
  );

  // ── THE OFFICE ROW IS SERVABLE — half one of the subtype discriminating control ──
  expect(
    Array.from(servableIds),
    'CONTROL: the OFFICE listing must be present in the UNFILTERED city query. If it is not, its '
      + 'absence from the SHOP scope below proves nothing about subtype — it is simply not servable '
      + '(never approved to LIVE, duplicate, or archived), and the discriminating arm is vacuous',
  ).toContain(listingIdC);

  // ── THE OUT-OF-MANIPAL SHOP ROW IS SERVABLE — half one of the geographic discriminating control (#2809) ──
  expect(
    Array.from(servableIds),
    'CONTROL (#2809): the out-of-Manipal Udupi SHOP/rent listing must be present in the UNFILTERED city query. '
      + 'If it is not, its absence from the Manipal leaf below proves nothing about geographic scoping',
  ).toContain(listingIdOutOfManipal);
  expect(
    servableById.get(listingIdOutOfManipal ?? '')?.areaKey,
    'CONTROL (#2809): the out-of-Manipal Udupi SHOP/rent listing must resolve to IN|KA|Udupi|Brahmavar (outside Manipal)',
  ).toBe('IN|KA|Udupi|Brahmavar');
  expect(
    servableById.get(listingIdOutOfManipal ?? '')?.commercialSubtype,
    'CONTROL (#2809): the out-of-Manipal control listing must be a SHOP so only geography excludes it',
  ).toBe('SHOP');

  // ── C13 — the product's OWN Discover query returns the in-Manipal listings ──
  // ── `intent=rent` IS LOAD-BEARING — do not drop it ────────────────────
  // Without it this test asks Discover for Commercial SHOP *for sale*, while
  // CC1 creates one *for rent*, and zero is the CORRECT answer.
  //
  // MUST also match the FILTERED query with committed AREA_SET scopeFingerprint
  // and no bbox.
  const listingsPromise = page.waitForResponse(
    (r) => {
      if (!r.url().includes('/api/discover/listings') || r.request().method() !== 'GET') return false;
      if (!r.url().toUpperCase().includes('SHOP') || !/listingPurpose=rent/i.test(r.url())) return false;
      const u = new URL(r.url());
      if (u.searchParams.has('bbox')) return false;
      try {
        const fp = JSON.parse(u.searchParams.get('scopeFingerprint') ?? 'null') as { scope?: { kind?: string } | null } | null;
        return fp?.scope?.kind === 'AREA_SET';
      } catch { return false; }
    },
    { timeout: 20_000 },
  );
  const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
  const NODE_KEY = `a:${MANIPAL_AREA_KEY}`;
  const NODE = encodeURIComponent(NODE_KEY);
  await page.goto(`/discover?city=udupi&node=${NODE}&type=commercial&subtype=SHOP&intent=rent`);
  const listingsResp = await listingsPromise;
  expect(listingsResp.status(), 'the app own Discover query should be 2xx').toBeLessThan(300);

  expect(listingsResp.url(), 'C13: must assert on the SUBTYPE-FILTERED query').toMatch(/SHOP/i);
  expect(listingsResp.url(), 'C13: must assert on the RENT-scoped query, matching what CC1 created').toMatch(/listingPurpose=rent/i);

  const appUrl = new URL(listingsResp.url());
  const fingerprintRaw = appUrl.searchParams.get('scopeFingerprint');
  expect(fingerprintRaw, `C17 scope: the app's /api/discover/listings call must carry its scopeFingerprint. Query was: ${listingsResp.url()}`).toBeTruthy();
  const fingerprint = JSON.parse(fingerprintRaw ?? '{}') as { scope?: { kind?: string; areaKeys?: string[] } };
  expect(
    fingerprint.scope,
    `C17 scope: the app arm's committed scope must be the Manipal AREA_SET (the node we deep-linked to). Query was: ${listingsResp.url()}`,
  ).toEqual({ kind: 'AREA_SET', areaKeys: [MANIPAL_AREA_KEY] });

  // Issue #2809 (Q13 from #2807): when the app claims a Manipal AREA_SET in scopeFingerprint,
  // it MUST send server-enforced geographic scope (`areaKeys` or `nodeKey`) on the actual wire
  // request. Never accept an unscoped request (`areaKeys:none/nodeKey:none`), and never copy the
  // app request's wire scope into the reference query below.
  const wireAreaKeys = appUrl.searchParams.getAll('areaKeys');
  const wireNodeKeys = appUrl.searchParams.getAll('nodeKey');
  const scopeBranch = `areaKeys:${wireAreaKeys.length ? 'wire' : 'none'}/nodeKey:${wireNodeKeys.length ? 'wire' : 'none'}`;
  expect(
    ['areaKeys:wire/nodeKey:none', 'areaKeys:none/nodeKey:wire'],
    `C13/C17 (#2809): GET /api/discover/listings at the Manipal leaf must carry server-enforced geographic scope (areaKeys or nodeKey) on the wire — got ${scopeBranch} on ${listingsResp.url()}`,
  ).toContain(scopeBranch);
  if (wireAreaKeys.length > 0) {
    expect(
      wireAreaKeys,
      `C13/C17 (#2809): wire areaKeys must equal the Manipal AREA_SET. Query was: ${listingsResp.url()}`,
    ).toEqual([MANIPAL_AREA_KEY]);
  }
  if (wireNodeKeys.length > 0) {
    expect(
      wireNodeKeys,
      `C13/C17 (#2809): wire nodeKey must equal the Manipal nodeKey. Query was: ${listingsResp.url()}`,
    ).toEqual([NODE_KEY]);
  }
  test.info().annotations.push({ type: 'c17-scope-branch', description: scopeBranch });

  const shopBody = (await listingsResp.json()) as { content?: Array<{ id?: string }>, totalElements?: number };
  const shopIds = idsOf(shopBody);

  // POSITIVE CONTROLS on the app's own response: both in-Manipal SHOP/rent listings are present.
  expect(
    shopIds.size,
    `C13 control: the Commercial+SHOP result set must be non-empty. Query was: ${listingsResp.url()}`,
  ).toBeGreaterThan(0);
  expect(Array.from(shopIds), 'C13: Commercial+SHOP at Manipal leaf must return CC1\'s in-Manipal listing').toContain(listingId);
  expect(Array.from(shopIds), 'C13: Commercial+SHOP at Manipal leaf must return CC1b\'s in-Manipal listing').toContain(listingIdB);

  // NEGATIVE GEOGRAPHIC CONTROL on the app's own response (#2809): the out-of-Manipal Udupi SHOP/rent
  // listing (proven LIVE and servable in Udupi above) MUST be excluded by the Manipal leaf query.
  expect(
    Array.from(shopIds),
    'C13 (#2809): the query the APP fires at the Manipal leaf must EXCLUDE the out-of-Manipal Udupi SHOP/rent listing',
  ).not.toContain(listingIdOutOfManipal);

  // ── C16 / C17 — reference list and marker feeds pinned independently to Manipal ──
  // Issue #2809: pin the reference SCOPE independently to Manipal (`areaKeys=IN|KA|Udupi|Manipal`)
  // rather than copying `appUrl`'s params, so an unscoped or wrongly-scoped app request can never
  // drag the reference along and pass C17 by comparing two identically wrong queries.
  const SCOPE = `city=udupi&areaKeys=${encodeURIComponent(MANIPAL_AREA_KEY)}&propertyTypes=commercial&commercialSubtypes=SHOP&listingPurpose=rent`;

  // EXHAUSTIVE list side. The app-fired response above is one default-size
  // page, and one page is not the set: comparing a page against a full marker
  // feed would report a parity failure that is really pagination. Ask for a
  // page large enough to hold everything, then PROVE it did by asserting
  // totalElements === content.length rather than assuming it.
  const fullListResp = await page.request.get(
    `${backendBaseUrl}/api/discover/listings?${SCOPE}&page=0&size=200`,
    { headers: auth },
  );
  expect(fullListResp.status(), 'exhaustive list query should be 2xx').toBeLessThan(300);
  const fullListBody = (await fullListResp.json()) as { content?: Array<{ id?: string }>, totalElements?: number };
  const fullListIds = idsOf(fullListBody);
  // Serves TWO rows: C16 needs the set (not a page), and C17 is exactly the
  // claim that the reported count agrees with the membership returned.
  expect(
    fullListBody.totalElements,
    `C16/C17: the list side must be EXHAUSTIVE for this scope — totalElements ${fullListBody.totalElements} exceeds the ${fullListIds.size} returned, so this page is not the set and the count cannot be checked against it`,
  ).toBe(fullListIds.size);

  // C17, second half — THE COUNT THE PRODUCT REPORTS TO THE USER.
  expect(
    shopBody.totalElements,
    'C17: the count the APP reports at the Manipal leaf must equal the exhaustive Manipal-scoped count.',
  ).toBe(fullListBody.totalElements);

  const markersResp = await page.request.get(
    `${backendBaseUrl}/api/discover/markers?${SCOPE}`,
    { headers: auth },
  );
  expect(markersResp.status(), 'markers query should be 2xx').toBeLessThan(300);
  const markersBody = (await markersResp.json()) as {
    markers?: Array<{ id?: string }>,
    truncated?: boolean,
    returnedElements?: number,
    totalFilteredElements?: number,
  };
  const markerIds = new Set((markersBody.markers ?? []).map((m) => m.id));

  expect(
    markersBody.truncated,
    `C16: the marker arm must be EXHAUSTIVE — truncated=true means the feed was capped at limit, so any difference from the list is the cap, not membership`,
  ).toBe(false);
  expect(
    markersBody.totalFilteredElements,
    `C16: the marker feed must carry no DUPLICATE ids — totalFilteredElements ${markersBody.totalFilteredElements} vs ${markerIds.size} distinct ids returned`,
  ).toBe(markerIds.size);

  // POSITIVE CONTROLS on Manipal-scoped list and marker feeds:
  expect(markerIds.size, 'C16 control: marker set must be non-empty').toBeGreaterThan(0);
  expect(fullListIds.size, 'C16 control: list set must be non-empty').toBeGreaterThan(0);
  expect(
    fullListIds.size,
    `C16 control: the list arm must hold BOTH created in-Manipal listings for equality to discriminate — got ${fullListIds.size}`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    markerIds.size,
    `C16 control: the marker arm must hold BOTH created in-Manipal listings — got ${markerIds.size}`,
  ).toBeGreaterThanOrEqual(2);

  expect(Array.from(fullListIds), 'C16 control: the list must contain CC1\'s in-Manipal listing').toContain(listingId);
  expect(Array.from(markerIds), 'C16 control: the marker feed must contain CC1\'s in-Manipal listing').toContain(listingId);
  expect(Array.from(fullListIds), 'C16 control: the list must contain CC1b\'s in-Manipal listing').toContain(listingIdB);
  expect(Array.from(markerIds), 'C16 control: the marker feed must contain CC1b\'s in-Manipal listing').toContain(listingIdB);

  // ── DISCRIMINATING ARM 1 — geographic area narrowing actually narrows (#2809) ──
  expect(
    Array.from(fullListIds),
    'C13/C16 (#2809): Manipal area scoping must EXCLUDE the out-of-Manipal Udupi SHOP/rent listing from the list',
  ).not.toContain(listingIdOutOfManipal);
  expect(
    Array.from(markerIds),
    'C16 (#2809): Manipal area scoping must EXCLUDE the out-of-Manipal Udupi SHOP/rent listing from the marker feed',
  ).not.toContain(listingIdOutOfManipal);

  // ── DISCRIMINATING ARM 2 — subtype narrowing actually narrows ─────────
  expect(
    Array.from(fullListIds),
    'C13/C16: subtype narrowing must EXCLUDE the OFFICE listing from the SHOP-scoped list. It is '
      + 'present in the unfiltered control asserted above, so if it appears here the commercialSubtypes '
      + 'predicate is not being applied on the list path',
  ).not.toContain(listingIdC);
  expect(
    Array.from(markerIds),
    'C16: subtype narrowing must EXCLUDE the OFFICE listing from the SHOP-scoped MARKER feed too — '
      + 'the markers endpoint applies commercialSubtypes independently of the list endpoint',
  ).not.toContain(listingIdC);
  expect(
    Array.from(shopIds),
    'C13: the query the APP fires for Commercial+Shop must exclude the OFFICE listing',
  ).not.toContain(listingIdC);

  // ── C16 — EXACT SET EQUALITY, not containment ──────────────────────────
  const sortedList = Array.from(fullListIds).sort();
  const sortedMarkers = Array.from(markerIds).sort();
  expect(sortedMarkers, 'C16: marker membership must EQUAL list membership for the same scope').toEqual(sortedList);
});

test('[role:broker] CC3 — anonymous visitor sees the now-LIVE Commercial listing, correctly gated', async ({ page }) => {
  expect(listingId, 'CC3 requires CC1/CC2 to have produced a LIVE listing').toBeTruthy();

  // Genuinely anonymize this test's OWN page. clearCookies() alone leaves the
  // Supabase session in localStorage, so the page stays authenticated — as the
  // BROKER, from the canonical-broker project storageState this test starts
  // with. (An earlier version said "as ADMIN, since CC2 signed in on it";
  // that was wrong — page/context are TEST-scoped, so CC2's sign-in never
  // reaches here. The clearing step is still REQUIRED, just for the broker
  // session rather than an inherited admin one.)
  //
  // An authenticated visitor is never shown the "Sign in" gate. The first
  // version of this test failed here for exactly that reason, and the tempting
  // "fix" would have been to drop the assertion that proves the page is gated
  // at all.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();

  const anonTeaserPromise = page.waitForResponse(
    (r) => r.url().endsWith(`/api/public/listings/${listingId}`) && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto(`/listing/${listingId}`);
  const anonTeaserResp = await anonTeaserPromise;

  // The actual regression surface — #2263/#2268 were both caught here.
  expect(anonTeaserResp.status(), 'anon teaser should be 2xx for a LIVE listing').toBeLessThan(300);

  // C23 — POSITIVE control first: the anon gate is genuinely rendered.
  // Without this, any absence assertion would pass just as happily on a
  // blank or errored page. These are the same locators
  // listing-detail-gating.canonical.ts:98,154 already uses for the anon
  // case, rather than a testid invented here.
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 15_000 });

  // The photo gate is an INTERACTIVE paywall moment, not a page-load state:
  // useGalleryNavigation's nextImage() only sets galleryLocked the first time
  // the visitor clicks past the single synthesized image
  // (listing-detail-gating.canonical.ts:139-149). Asserting it on load — as
  // the first version of this test did — looks for something the product
  // never shows, and the tempting fix is to delete the assertion that proves
  // photos are gated at all.
  const nextImageButton = page.getByRole('button', { name: 'Next image' });
  await expect(nextImageButton).toBeVisible({ timeout: 10_000 });
  await nextImageButton.click();

  const photoGate = page.getByRole('link', { name: 'Sign in to view all photos' });
  await expect(photoGate).toBeVisible({ timeout: 10_000 });

  // Assert the HREF, never a navigation. listing-detail-gating.canonical.ts:151-153
  // documents that clicking this gate calls preventDefault and opens a modal
  // instead of navigating. A "click then expect navigation" arm would fail for
  // a reason unrelated to gating, and the obvious fix would be to weaken it
  // until it passes. Pinning the href keeps this arm immune if someone later
  // adds a click. (Caveat surfaced by #2432's lane.)
  await expect(photoGate).toHaveAttribute(
    'href',
    `/auth?returnTo=${encodeURIComponent(`/listing/${listingId}`)}`,
  );

  // ASSERTS THE TITLE, and the previous comment here was an EXPIRED CITATION.
  // It said the anon teaser "carries no `title` by design (#1941)" and that
  // asserting UNIQUE_TITLE "would be a test that can only fail". That stopped
  // being true at #2235: ListingTeaserResponse declares `String title` (:64),
  // documented at :33-35 as "anon callers see the actual title, not a
  // synthesized fallback" — the frontend synthesizes a `propertyType in
  // locality` heading only when it is blank. T15 was updated to match and
  // asserts the name — see its own
  // `getByRole('heading', { level: 1, name: UNIQUE_TITLE })` in
  // listing-lifecycle.canonical.ts (by ANCHOR, not line, for the same reason
  // as above: this branch edits that file, so a line number here drifts).
  //
  // NOTE for whoever reads that file next: its T15 PREAMBLE still describes
  // the pre-#2235 synthesized-heading behaviour and contradicts its own
  // assertion. That contradiction is pre-existing on main and deliberately
  // NOT fixed here — it sits in an externally-owned, CI-required test and is
  // out of this issue's scope — but it is flagged because this citation now
  // points a reader at it.
  //
  // WHY THIS MATTERED: a bare `heading level 1` carries no accessible name, so
  // it passed on the wrong listing, on an error page that happens to render an
  // h1, or on a listing whose title never persisted. It was the only arm in
  // CC3 touching listing identity through the rendered page, and it could not
  // fail. The other CC3 arms (the Sign in link, the photo gate, the href
  // carrying listingId) are real and do bind to this listing.
  await expect(
    page.getByRole('heading', { level: 1, name: UNIQUE_TITLE }),
  ).toBeVisible({ timeout: 15_000 });
});

// C27 — deterministic cleanup through a supported product lifecycle path.
// POST /api/listings/{id}/archive (ListingController.java:436-442) is
// broker-owned and transitions to ARCHIVED; archived rows drop out of
// Discover. Never a direct DB mutation.
//
// The Residential canonical lifecycle has no equivalent and leaks a LIVE
// row per run. That is not retrofitted here (out of scope, and that file is
// untouched by this issue) but it is why every id match above is by id.
test.afterAll(async ({ playwright }) => {
  // Guard shape matches the loop below, which archives ALL FOUR rows: keying on
  // `listingId` alone returned early while CC1b's row was still live, leaking
  // exactly the row this cleanup exists to remove.
  // Say WHY when skipping. A silent early return here leaves LIVE rows in the
  // fixture and looks identical in the log to a clean run with nothing to do —
  // so the leak that poisons the next run is invisible at the moment it happens.
  if (!bearerToken || (!listingId && !listingIdB && !listingIdC && !listingIdOutOfManipal)) {
    console.warn(
      `[#2434] cleanup SKIPPED — bearerToken=${bearerToken ? 'present' : 'null'}, `
        + `ids=[${[listingId, listingIdB, listingIdC, listingIdOutOfManipal].map((i) => i ?? 'null').join(', ')}]. `
        + 'Any row that WAS created is now leaking as LIVE in the fixture.',
    );
    return;
  }

  const ctx = await playwright.request.newContext();
  try {
    // All four rows, or CC1b's, CC1c's, and the out-of-Manipal control row accumulate
    // in the fixture run after run.
    for (const id of [listingId, listingIdB, listingIdC, listingIdOutOfManipal].filter(Boolean)) {
      const r = await ctx.post(`${requireBackendBaseUrl()}/api/listings/${id}/archive`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (r.status() >= 300) console.warn(`[#2434] cleanup: archive of ${id} returned ${r.status()}`);
    }
    // Warnings only, never a failure: a cleanup problem must not be
    // mistaken for a product regression.
  } finally {
    await ctx.dispose();
  }
});
