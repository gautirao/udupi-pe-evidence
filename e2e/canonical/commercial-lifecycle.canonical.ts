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
// The OFF-SCOPE row — see CC1c. Same dedupe reasoning as B: distinct
// description, because it shares Manipal and a null price with A and B.
const UNIQUE_TITLE_C = `${UNIQUE_TITLE} (C-OFFICE)`;
const UNIQUE_DESCRIPTION_C = `Third canonical Commercial fixture for ${UNIQUE_TITLE} (C). Deliberately an OFFICE, not a SHOP, so CC4's subtype narrowing has something it must exclude.`;

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
      latitude: 13.3522,
      longitude: 74.7873,
      locality: 'Manipal',
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
 * `subtype` is the ONLY axis that varies between callers. Everything else —
 * purpose, built area, floor, rent, deposit — is identical by construction,
 * which is what makes CC1c's exclusion from CC4's SHOP scope attributable to
 * the subtype and to nothing else.
 */
async function createSubmittedCommercialRentListing(
  page: import('@playwright/test').Page,
  backendBaseUrl: string,
  title: string,
  description: string,
  subtype: { readonly value: string; readonly optionLabel: string },
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
  await page.locator('#locality').fill('Manipal');

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
  await arrangeSubmitGatesOutOfBand(page.request, backendBaseUrl, createdId, createdToken, createdOwnerId);

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
  // THE CARD -> DETAIL LINK IS NOT ASSERTED HERE, AND THE REASON IS A LIMIT OF
  // THE CANONICAL FIXTURE — NOT A PRODUCT PROPERTY. The distinction is
  // load-bearing and an earlier version of this comment got it wrong: it said
  // "Udupi's LEGACY city surface renders no listing cards at all", which reads
  // as a claim about the product and is NOT supported by anything measured
  // here. A fixture limitation recorded as a product defect is exactly the
  // class this file's own standard rejects.
  //
  // Measured on THIS exact URL against a real stack:
  //   - the backend serves this scope: totalElements=2, returned=2;
  //   - the app DOES fire listings?city=udupi&page=0&size=50 — so this is NOT
  //     the listingsEnabled / isTopGroupedLevel gate; the query runs;
  //   - and ZERO [data-testid="listing-card"] render;
  //   - positive control, same probe/session/selector/CORS origin:
  //     bangalore + node= returns 4 cards — so the zero is a measurement, not
  //     a broken instrument.
  //
  // THE CAUSE IS FIXTURE DATA, read straight from the fixture database:
  //     city        navigation_nodes   promoted revisions   city_regions
  //     bangalore                 20                    1              0
  //     udupi                      0                    0              0
  // The canonical fixture carries navigation data for BANGALORE ONLY, which
  // matches the backend's own startup line "preloaded 1 public-active city ...
  // citySlug=bangalore nodeCount=20". With no Udupi navigation graph there is
  // no area-scoped Udupi journey to drive, so no card panel renders — and CC1
  // creates in Udupi (Manipal), so there is no card to click IN THIS STACK.
  //
  // THIS SAYS NOTHING ABOUT PRODUCTION. Evidence points the other way: an
  // anonymous probe of GET /api/discover/cities/udupi/listings?commercialSubtypes=SHOP
  // returned 3 rows across two areas there. If you are reading this because you
  // suspect a buyer-facing card bug, this comment is not your evidence.
  //
  // NOT "fixed" by adding node=/rscope= to the URL above: that changes what C13
  // asserts, trading a membership proof for a navigation one. NOT fixed by
  // seeding a Udupi canonical node either — a standing owner ruling forbids
  // exactly that (it flips ~15 assertion sites in specs the pre-push gate does
  // not run). Recorded as a NAMED GAP on the PR rather than worked around.
  //
  // CARD SUMMARY COPY stays unasserted too, but now for COUPLING rather than
  // availability: the AREA journey renders no Commercial summary (that gap is
  // #2516's, in flight), and pinning another lane's wording produces an arm
  // that fails when someone improves a label — which gets it deleted rather
  // than fixed. Where these DO work they are already covered, non-canonically:
  // card summary by e2e/discover-commercial-card-summary.spec.ts (Bangalore,
  // authenticated VIEWPORT) and buyer-detail facts by
  // e2e/commercial-detail-facts-2432.spec.ts.
  //
  // Uses the listing CC1 CREATED, never a seeded row — a binding requirement
  // of this issue, and what makes this row independent of #2517's seed.
  // Note #2517's commercial seed is entirely BENGALURU: there is no seeded
  // Udupi commercial row, so this row can only ever pass on the listing CC1
  // creates. Do not assume fixture coverage backs it up.
  //
  // THAT SAME FACT IS WHY CC1c EXISTS. With no seeded Udupi commercial row,
  // every row in this city scope was one this file created, and every one of
  // them was a SHOP — so the SHOP-scoped set and the unfiltered set coincided
  // and the subtype predicate was load-bearing for nothing. CC1c's OFFICE row
  // breaks that coincidence deliberately.
  expect(listingId, 'CC4 requires CC1/CC2 to have produced a LIVE listing').toBeTruthy();
  expect(bearerToken, 'CC4 needs the broker token CC1 captured').toBeTruthy();

  const backendBaseUrl = requireBackendBaseUrl();
  const auth = { Authorization: `Bearer ${bearerToken}` };
  const idsOf = (b: { content?: Array<{ id?: string }> }) => new Set((b.content ?? []).map((x) => x.id));

  // ── INTERMEDIATE CONTROL — is the listing SERVABLE at all? ────────────
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
  const servableBody = (await servableResp.json()) as { content?: Array<{ id?: string }>, totalElements?: number };
  const servableIds = idsOf(servableBody);

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
    'CONTROL: the listing is LIVE but absent from the UNFILTERED city query, which is proven exhaustive above — '
      + 'so it is not servable at all (is_duplicate, archived, or excluded by the base predicate), and any filtered result below would be meaningless',
  ).toContain(listingId);

  // ── THE OFFICE ROW IS SERVABLE — half one of the discriminating control ──
  // Absence from the SHOP scope below only means "the subtype filter excluded
  // it" if the row is otherwise there to be excluded. This arm is what
  // distinguishes that from the three ways the negative could go green for
  // free: the row never reached LIVE (CC2 forgot it), it was marked duplicate,
  // or it was archived. Same query, same page, same exhaustiveness proof as
  // CC1's — only the id differs.
  expect(listingIdC, 'CC4 requires CC1c to have produced the OFFICE listing').toBeTruthy();
  expect(
    Array.from(servableIds),
    'CONTROL: the OFFICE listing must be present in the UNFILTERED city query. If it is not, its '
      + 'absence from the SHOP scope below proves nothing about subtype — it is simply not servable '
      + '(never approved to LIVE, duplicate, or archived), and the discriminating arm is vacuous',
  ).toContain(listingIdC);

  // ── C13 — the product's OWN Discover query returns this listing ────────
  // ── `intent=rent` IS LOAD-BEARING — do not drop it ────────────────────
  // Without it this test asks Discover for Commercial SHOP *for sale*, while
  // CC1 creates one *for rent*, and zero is the CORRECT answer.
  //
  // `sale` never appears in the URL and is on the wire anyway: the URL
  // contract DEFAULTS intent to `buy` (features/discover/state/url/city.ts:36-37),
  // every Discover surface maps that to listingPurpose 'sale'
  // (DiscoverAreasJourneyPanel.tsx:833, NodeListingsSurface.tsx:54 —
  // `nav.intent === 'rent' ? 'rent' : 'sale'`), and the backend applies
  // `AND pl.listing_purpose = ?` in DiscoverListingPredicateBuilder (by SYMBOL,
  // not line — the previous line citation had already drifted).
  // Verified on the wire: the intent-less URL produced
  // `...?city=udupi&propertyTypes=commercial&listingPurpose=sale`.
  //
  // CC1 creates a RENT listing because `lease` is not persistable
  // (chk_listing_purpose, V32:5) — see decision D1 above. So the purpose axis
  // has to be stated here or the two halves of this test disagree silently.
  //
  // MUST also match the FILTERED query, not merely any Discover query.
  // Navigating fires an /api/discover/listings BEFORE the URL filters apply,
  // and a predicate accepting any matching URL captures that one — an empty
  // pre-filter body then reads as "Commercial+Shop returns nothing".
  // MEASURED (fix cycle r2, evidence/fix-r2/diag-cc4-all-listings-requests.txt): navigating to the Manipal leaf fires THREE
  // SHOP+rent listings requests, in this order: (0) scopeFingerprint scope:null (before the area set commits), (1) scope AREA_SET
  // [IN|KA|Udupi|Manipal], (2) the same plus a map bbox. Only (1) is the committed, un-bbox'd, area-scoped query, and a predicate
  // that accepted any of them made the arm that was compared depend on response arrival order (a bbox'd response has a smaller
  // totalElements). The predicate therefore selects (1) explicitly: it must carry an AREA_SET scopeFingerprint and no bbox.
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
  // `type` and `subtype` are the URL contract, read and written in
  // features/discover/state/url/filters.ts (by FILE, not line — the previous
  // `:61,202` citation had drifted; 202 landed on an unrelated param delete).
  //
  // #2750 R2 DRIFT NOTE — THE URL BELOW NOW CARRIES node=. The long note further down says the bare city URL fires
  // /api/discover/listings because Udupi had no navigation graph. That stopped being true when #2707 (c93f9191) made
  // the Udupi hierarchy reachable (scripts/db/fixtures/area-trends-2581-udupi-navigation-seed.sql, loaded by
  // restore-test-fixture.sh): the bare city URL is now the area-first city root, which fires nearby-candidates and
  // navigation/root/counts and NEVER /api/discover/listings (measured, 12 s capture; the 20 s waitForResponse below
  // timed out on exactly that, in a gate run that is independent of where auth lives). The area LEAF is where the
  // product asks for listings, so the deep link goes to the Manipal AREA node (where CC1/CC1b/CC1c create their
  // rows). The waitForResponse predicate ABOVE (listingsPromise) was changed in r2 to match this deep link; it still has to
  // be the app's own GET /api/discover/listings carrying SHOP and listingPurpose=rent.
  //
  // CR r2 SHOULD-1 (the earlier version of this note said "every C13/C16/C17 assertion after it is untouched", which was
  // FALSE, see below): the reference SCOPE (the exhaustive list fetch AND the markers fetch, further down) must ask the SAME
  // geography question as the app arm, otherwise C17 `shopBody.totalElements === fullListBody.totalElements` can only hold
  // because every Udupi SHOP/rent row happens to sit in Manipal.
  //
  // MEASURED (fix cycle r2, evidence/fix-r2/diag-cc4-all-listings-requests.txt): the reviewer's premise "the app arm sends
  // nodeKey" is NOT what the wire shows for this URL - NONE of the three SHOP+rent listings requests carries nodeKey or areaKeys.
  // The committed-scope one (the one selected above) is
  //   ?city=udupi&page=0&size=50&includeAggregates=true&propertyTypes=commercial&commercialSubtypes=SHOP&listingPurpose=rent
  //   &scopeFingerprint={"filters":{...},"listingPurpose":"rent","scope":{"areaKeys":["IN|KA|Udupi|Manipal"],"kind":"AREA_SET"}}
  // i.e. NO nodeKey and NO areaKeys param; the Manipal AREA_SET scope travels only inside the opaque scopeFingerprint (the
  // surface that fires it is the area-set results controller, not NodeListingsSurface). So asserting nodeKey on that request is
  // red for a reason that is not a regression. What this test does instead is DERIVE the reference geography from the app
  // request itself (nodeKey / areaKeys params exactly as sent, none when none were sent) so the two arms can never silently
  // differ, and it asserts the scope the app CLAIMS (the fingerprint) is the Manipal area set. That the area-first leaf fetches
  // without sending its scope on the wire is recorded as an open product question (see the QA transcript).
  const NODE_KEY = 'a:IN|KA|Udupi|Manipal';
  const NODE = encodeURIComponent(NODE_KEY);
  await page.goto(`/discover?city=udupi&node=${NODE}&type=commercial&subtype=SHOP&intent=rent`);
  const listingsResp = await listingsPromise;
  expect(listingsResp.status(), 'the app own Discover query should be 2xx').toBeLessThan(300);

  // DEFENCE-IN-DEPTH, NOT TODAY'S PROTECTION — and the previous comment here
  // claimed otherwise, which was false. The `waitForResponse` predicate above
  // ALREADY requires SHOP and listingPurpose=rent in the URL, so these two
  // assertions restate properties of the response that predicate selected and
  // cannot fail as written. If a default moved, the predicate would simply
  // stop matching and the wait would time out loudly at 20s — that, not these
  // lines, is what protects C13 today.
  //
  // Kept deliberately: they become load-bearing the moment anyone relaxes the
  // predicate (a tempting "fix" when this row goes red), and they document the
  // two axes that must hold. Do not cite them as the guard.
  expect(listingsResp.url(), 'C13: must assert on the SUBTYPE-FILTERED query').toMatch(/SHOP/i);
  expect(listingsResp.url(), 'C13: must assert on the RENT-scoped query, matching what CC1 created').toMatch(/listingPurpose=rent/i);
  // The geography the app arm asks for, exactly as sent on the wire (see the SHOULD-1 note above). The reference SCOPE below
  // repeats these params verbatim, so the two arms cannot differ in geography.
  const appUrl = new URL(listingsResp.url());
  const scopeParams = new URLSearchParams();
  // And the scope the app CLAIMS for this fetch (its own cache identity) must be the Manipal area set: a navigation that landed
  // on another node, or lost the scope, goes red here rather than being compared against a differently-scoped reference.
  const fingerprintRaw = appUrl.searchParams.get('scopeFingerprint');
  expect(fingerprintRaw, `C17 scope: the app's /api/discover/listings call must carry its scopeFingerprint. Query was: ${listingsResp.url()}`).toBeTruthy();
  const fingerprint = JSON.parse(fingerprintRaw ?? '{}') as { scope?: { kind?: string; areaKeys?: string[] } };
  expect(
    fingerprint.scope,
    `C17 scope: the app arm's committed scope must be the Manipal AREA_SET (the node we deep-linked to). Query was: ${listingsResp.url()}`,
  ).toEqual({ kind: 'AREA_SET', areaKeys: ['IN|KA|Udupi|Manipal'] });
  // CR r2 cycle2 MEDIUM-A: never copy the app's wire geography into the reference unvalidated (a drifted app param would then
  // silently drag the reference with it). Validate BEFORE copying. Today neither param is on the wire (branch 'none'); the
  // params are NOT required to be present, but if one ever appears it must be inside the claimed scope / the deep-linked node.
  const claimedAreaKeys = fingerprint.scope?.areaKeys ?? [];
  const wireAreaKeys = appUrl.searchParams.getAll('areaKeys');
  const wireNodeKeys = appUrl.searchParams.getAll('nodeKey');
  for (const v of wireAreaKeys) {
    expect(claimedAreaKeys, `C17 scope: wire areaKeys value ${v} must be a member of the fingerprint scope. Query was: ${listingsResp.url()}`).toContain(v);
  }
  for (const v of wireNodeKeys) {
    expect(v, `C17 scope: wire nodeKey must equal the deep-linked node. Query was: ${listingsResp.url()}`).toBe(NODE_KEY);
  }
  const scopeBranch = `areaKeys:${wireAreaKeys.length ? 'wire' : 'none'}/nodeKey:${wireNodeKeys.length ? 'wire' : 'none'}`;
  expect(['areaKeys:none/nodeKey:none', 'areaKeys:wire/nodeKey:none', 'areaKeys:none/nodeKey:wire', 'areaKeys:wire/nodeKey:wire'], 'C17 scope: branch recorded').toContain(scopeBranch);
  test.info().annotations.push({ type: 'c17-scope-branch', description: scopeBranch });
  for (const k of ['nodeKey', 'areaKeys']) for (const v of appUrl.searchParams.getAll(k)) scopeParams.append(k, v);

  const shopBody = (await listingsResp.json()) as { content?: Array<{ id?: string }>, totalElements?: number };
  const shopIds = idsOf(shopBody);

  // POSITIVE CONTROL before concluding anything: an empty result set makes
  // every containment and agreement assertion below vacuous.
  // The failure message carries the QUERY, not just the count. A bare
  // "expected > 0, received 0" sends the reader hunting a product defect;
  // the URL says which scope actually produced the zero, which is the single
  // most useful fact when this row goes red.
  expect(
    shopIds.size,
    `C13 control: the Commercial+SHOP result set must be non-empty. Query was: ${listingsResp.url()}`,
  ).toBeGreaterThan(0);
  expect(Array.from(shopIds), 'C13: Commercial+SHOP must return the created listing').toContain(listingId);

  // ── C17 — the count agrees with the membership it reports ─────────────
  // Asserted below against the EXHAUSTIVE fetch, not against the app's own
  // single default-size page. Over one page `totalElements === content.length`
  // is a statement about pagination, not about counts agreeing with
  // membership, and it would fail the moment the scope outgrew a page.


  // ── C16 — list and marker membership agree ─────────────────────────────
  // page.request is fine here: the guard is already satisfied by the real
  // navigation above, and this is a direct comparison of two server feeds.
  // Both feeds are fetched in the SAME scope, including listingPurpose=rent.
  // Omitting purpose on either side compares two DIFFERENTLY-SCOPED feeds —
  // the app's marker hook sends the same intent-derived purpose — so the
  // comparison would pass or fail for reasons unrelated to membership.
  // The geography params are COPIED from the app's own request (CR r2 SHOULD-1, see the note above): list and markers fetches
  // below ask the same geography question as the app arm, whatever that is on the wire.
  const geo = scopeParams.toString();
  const SCOPE = `city=udupi${geo ? `&${geo}` : ''}&propertyTypes=commercial&commercialSubtypes=SHOP&listingPurpose=rent`;

  // THERE IS NO IDENTITY SPLIT. A long note here used to claim one, and it
  // was wrong — corrected rather than trimmed, because it was the first thing
  // anyone would read when C17 went red and it sent them after two causes that
  // cannot occur.
  //
  // What it got wrong: Playwright's `page`/`context` are TEST-scoped, and
  // playwright.canonical.config.ts:329 sets `storageState` on the
  // canonical-broker project — so every test in this file starts in a FRESH,
  // BROKER-authenticated context. CC2's admin sign-in happens in CC2's own
  // context and cannot reach here. The sibling file says the same of its own
  // default page — see the comment above T14's `page.goto('/broker/listings')`
  // + `localStorage.clear()` preamble in listing-lifecycle.canonical.ts (by
  // ANCHOR, not line: this PR is still editing that file, so any line number
  // written here drifts by whatever this branch adds above it — which is
  // exactly how the previous citation here broke). So C13 and C16 run
  // under the SAME principal; the explicit bearer header on C16's arms exists
  // only because page.request does not carry the Supabase session (it lives in
  // localStorage, not cookies) — same principal, different transport.
  //
  // THE TWO SIDES DO DIFFER IN QUERY SHAPE, and that part was and is true.
  // The app-fired side is produced by the frontend's URL-to-API translation
  // (/discover?type=…&subtype=…&intent=rent); the direct side sends API params.
  // That is bonus coverage — it pins the translation too — but it means a RED
  // HAS TWO CANDIDATE CAUSES, not one:
  //     1. the reported count genuinely disagrees with membership;
  //     2. the URL-to-API translation drifted, so the two sides are no longer
  //        asking the same question.
  // Rule out (2) first by comparing the two request URLs — it is the cheapest
  // to check and the easiest to mistake for (1).

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
  // Moving the exhaustiveness check onto this direct fetch left the app-fired
  // response's own totalElements parsed and asserted by NOTHING: only the
  // count from a broker-token fetch was checked, while the number a buyer
  // actually sees was not. A field that is parsed but never asserted reads as
  // covered and is not.
  expect(
    shopBody.totalElements,
    'C17: the count the APP reports must equal the exhaustive count. The two sides differ in QUERY '
      + 'SHAPE — the app-fired side comes from the URL-to-API translation, the direct side sends API '
      + 'params — so a failure here does NOT by itself mean the count is wrong; rule out translation '
      + 'drift by comparing the two request URLs first. (Both sides run as the SAME principal, the '
      + 'broker; an earlier version of this message claimed an admin-vs-broker split that does not exist.)',
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

  // EXHAUSTIVE, asserted — the list arm's equivalent is asserted above and
  // this side had no counterpart, which left the comparison half-guarded: a
  // marker feed CAPPED below the true set would look like a membership
  // mismatch, and nothing in the file would say it was the cap.
  // DiscoverMarkersResponse documents `truncated` as true when the filtered
  // set exceeded `limit`, and that totalFilteredElements == returnedElements
  // exactly when truncated is false.
  expect(
    markersBody.truncated,
    `C16: the marker arm must be EXHAUSTIVE — truncated=true means the feed was capped at limit, so any difference from the list is the cap, not membership`,
  ).toBe(false);
  // NOT a second exhaustiveness check — `truncated === false` above is that,
  // and on the non-truncated path the server ASSIGNS
  // totalFilteredElements = returnedElements rather than counting, so
  // comparing them would be true by construction. What this DOES catch is
  // DUPLICATE IDS in the feed: markerIds is a Set, so a feed returning the
  // same id twice has size < returnedElements and fails here. Labelled for
  // what it proves, because the previous label claimed the exhaustiveness the
  // line above already establishes.
  expect(
    markersBody.totalFilteredElements,
    `C16: the marker feed must carry no DUPLICATE ids — totalFilteredElements ${markersBody.totalFilteredElements} vs ${markerIds.size} distinct ids returned`,
  ).toBe(markerIds.size);

  // CONTROLS FIRST, and they are load-bearing: two EMPTY sets are equal, so
  // the equality assertion below would go green on a completely dead marker
  // feed paired with a completely dead list. Neither may be empty, and both
  // must contain the listing this run created.
  // NON-EMPTY, and specifically MULTI-ELEMENT. At N=1 an equality assertion
  // is indistinguishable from containment, so a green would prove nothing an
  // `includes` would not. CC1b exists to make N=2; asserting the size here is
  // what stops a future fixture change quietly collapsing it back to 1 and
  // leaving C16 green but toothless.
  expect(markerIds.size, 'C16 control: marker set must be non-empty').toBeGreaterThan(0);
  expect(fullListIds.size, 'C16 control: list set must be non-empty').toBeGreaterThan(0);
  expect(
    fullListIds.size,
    `C16 control: the list arm must hold BOTH created listings for equality to discriminate — got ${fullListIds.size}`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    markerIds.size,
    `C16 control: the marker arm must hold BOTH created listings — got ${markerIds.size}`,
  ).toBeGreaterThanOrEqual(2);

  expect(Array.from(fullListIds), 'C16 control: the list must contain CC1\'s listing').toContain(listingId);
  expect(Array.from(markerIds), 'C16 control: the marker feed must contain CC1\'s listing').toContain(listingId);
  expect(Array.from(fullListIds), 'C16 control: the list must contain CC1b\'s listing').toContain(listingIdB);
  expect(Array.from(markerIds), 'C16 control: the marker feed must contain CC1b\'s listing').toContain(listingIdB);

  // ── THE DISCRIMINATING ARM — subtype narrowing actually narrows ─────────
  // Half two. The OFFICE row was proven SERVABLE above, so its absence here is
  // attributable to `commercialSubtypes=SHOP` and to nothing else. Everything
  // else about it is identical to CC1's row by construction: same helper, same
  // purpose, same city, same locality, same built area, floor, rent and
  // deposit — subtype is the only axis that varies.
  //
  // WITHOUT THIS ARM, deleting the commercialSubtypes predicate from
  // DiscoverListingPredicateBuilder changed NOTHING in this test. Every other
  // CC4 assertion — the C13 containment, the C16 equality, the C17 count —
  // held, because the SHOP-scoped set and the set of all Udupi commercial rent
  // rows were the same two rows. This is the one assertion that turns red.
  //
  // Asserted on BOTH feeds deliberately. The C16 equality would propagate a
  // list-side leak into the marker side and read as a parity failure rather
  // than as a narrowing failure; naming each arm sends the reader to the right
  // place. The marker endpoint validates commercialSubtypes independently
  // (DiscoverMarkersController), so it is a separate claim, not a restatement.
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

  // The APP-FIRED query as well, not just the two direct fetches. This is the
  // set the product itself asked for via its URL-to-API translation, and it is
  // exhaustive for this scope because its totalElements is asserted equal to
  // the exhaustive count at C17 below. A narrowing bug living in the
  // translation rather than the backend would show up ONLY here.
  expect(
    Array.from(shopIds),
    'C13: the query the APP fires for Commercial+Shop must exclude the OFFICE listing',
  ).not.toContain(listingIdC);

  // ── C16 — EXACT SET EQUALITY, not containment ──────────────────────────
  // Containment on both sides is what this row used to assert, and it passes
  // when the list holds {created, A} and the markers hold {created, B} — the
  // exact parity regression this row exists to catch. Sorted arrays so the
  // failure output names the differing ids instead of "Set !== Set".
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
  // Guard shape matches the loop below, which archives BOTH rows: keying on
  // `listingId` alone returned early while CC1b's row was still live, leaking
  // exactly the row this cleanup exists to remove.
  // Say WHY when skipping. A silent early return here leaves LIVE rows in the
  // fixture and looks identical in the log to a clean run with nothing to do —
  // so the leak that poisons the next run is invisible at the moment it happens.
  if (!bearerToken || (!listingId && !listingIdB && !listingIdC)) {
    console.warn(
      `[#2434] cleanup SKIPPED — bearerToken=${bearerToken ? 'present' : 'null'}, `
        + `ids=[${[listingId, listingIdB, listingIdC].map((i) => i ?? 'null').join(', ')}]. `
        + 'Any row that WAS created is now leaking as LIVE in the fixture.',
    );
    return;
  }

  const ctx = await playwright.request.newContext();
  try {
    // All three rows, or CC1b's and CC1c's accumulate in the fixture run after
    // run — and a leaked LIVE OFFICE row would sit inside CC4's unfiltered
    // control on every subsequent run.
    for (const id of [listingId, listingIdB, listingIdC].filter(Boolean)) {
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
