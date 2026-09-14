/**
 * Listing lifecycle — T13 (broker create→submit) / T14 (admin approve) /
 * T15 (anon views the now-LIVE listing) — issue #1713, PR-4.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ARRANGED-OUT-OF-BAND GATES (mandatory read before touching this file)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * TWO of the four real submit gates (see src/lib/listingStrength.ts, which
 * mirrors backend/.../listing/workflow/ListingTransitionPolicy.java's
 * validateFields()) are satisfied here via REAL AUTHENTICATED API CALLS
 * (Playwright `page.request`, carrying the broker's own real bearer JWT —
 * see "Auth token" below) rather than being driven through the UI:
 *
 *   1. images (>= 3) — the real UI path goes browser → backend-issued
 *      Supabase Storage signed URL → PUT bytes to that URL → POST
 *      /api/listings/{id}/images to register the metadata (see
 *      useListingImages.ts's uploadImage). Only the LAST step (register) is
 *      exercised here; the signed-URL/Storage-PUT steps are skipped
 *      entirely and standalone placehold.co URLs are used instead.
 *
 *   2. addressConfirmed (+ latitude/longitude) — the real UI path requires
 *      opening the AddressPicker map modal via MapPin.tsx's "Pin location
 *      on map" button, which is `disabled={!resolved}` (MapPin.tsx:73).
 *      `resolved` is set ONLY by useResidentialLocation after a live
 *      geocode search or a "Use current location" round trip through
 *      GET /api/geocode[/reverse] — src/lib/geocode.ts:1-3 documents this
 *      as a backend proxy to the LIVE PUBLIC NOMINATIM service: third-party,
 *      rate-limited, not deterministic. A canonical spec must not depend on
 *      a live third-party geocoder responding the same way twice.
 *
 * A THIRD gate this file also arranges out-of-band, found while writing this
 * spec (not called out in this slice's original brief — verified by reading
 * AddressSearch.tsx directly, not assumed):
 *
 *   3. locality — the `#locality` input rendered by AddressSearch.tsx is
 *      NOT a plain text field. Typing into it only edits a local SEARCH
 *      QUERY (`state.query`, internal to useResidentialLocation); the
 *      `locality` value this form actually gates and submits
 *      (ResidentialListingForm.tsx's own `locality` state, fed exclusively
 *      via `onPublicLoc: setLocality`) is set ONLY when a live geocode
 *      search result is picked via "Use" (AddressSearch.tsx:120-128,
 *      `handleUseResult` → `selectResult`) — the exact same live-Nominatim
 *      dependency as gate 2 above — or by hydrating from a previously
 *      persisted `draftListing.locality` after a reload. Since this is the
 *      identical class of non-determinism already justifying gate 2, this
 *      spec sets `locality` via the SAME arranged PUT call as gate 2 rather
 *      than typing a value into `#locality` and hoping a live search
 *      resolves it. (`#locality` is still exercised for realism in step 1
 *      below — a broker really would type there — but the value typed does
 *      NOT feed the gate; only the arranged PUT does.)
 *
 * MITIGATING FACT for gates 1 and 2/3: `POST /api/listings/{id}/images` and
 * `PUT /api/listings/{id}` are the EXACT SAME endpoints the real UI calls
 * (useListingImages.ts's registration POST; useResidentialLocation's save →
 * useUpdateListing's PUT — confirmed by reading
 * backend/.../listing/crud/ListingCrudService.java: `locality` is applied
 * unconditionally at line 912, and `addressConfirmed`/`latitude`/`longitude`
 * at lines 921-923, no extra server-side gate beyond auth+ownership). Only the
 * NON-DETERMINISTIC MEANS of arriving at that call (live Storage upload,
 * live geocoding) is bypassed — the wire contract being proven is identical
 * to what a real browser would send. An arranged precondition must NEVER be
 * read as a PROVEN one: this docstring is an explicit review checklist item,
 * and every arranged call below asserts `.ok()` individually so a silent
 * 403/422 cannot surface later as a baffling "submit never enabled".
 *
 * AUTH TOKEN for the arranged calls: ListingResponse (backend DTO — read in
 * full: backend/.../listing/api/ListingResponse.java) has NO createdBy/
 * ownerId field at all, so it cannot be read back from GET
 * /api/listings/{id} as an earlier plan for this file assumed. Instead this
 * spec captures the REAL bearer token the browser itself sends on the
 * "Save draft" POST /api/listings call (via `response.request().headers()`)
 * and decodes its JWT `sub` claim. This is provably equal to the listing's
 * `createdBy`: ListingCrudService.createListing sets
 * `listing.setCreatedBy(createdBy)` where `createdBy` is the caller's
 * resolved id, and CallerInfoResolver.java:63-... derives that id from
 * `token.getToken().getSubject()` — i.e. the same JWT `sub` this spec reads.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PROJECT-TOPOLOGY DEVIATION (read before "fixing" the role tags below)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * playwright.canonical.config.ts (read in full — out of scope to modify)
 * runs each `canonical-<role>` project as an INDEPENDENT project: a test's
 * title is grep-matched into exactly the project(s) whose pattern it
 * satisfies, and different projects do not share in-memory module state
 * (each project instantiates this file's module scope freshly). T13 (broker
 * creates a listing), T14 (admin approves THAT SAME listing) and T15 (anon
 * views THAT SAME listing) need one shared `listingId` captured once and
 * reused three times, in order — which is only possible if all three run
 * inside the SAME project's sequential test queue.
 *
 * Consequently ALL THREE tests below carry the literal `[role:broker]` tag
 * (not `[role:admin]`/no tag as their content might suggest) so they are
 * selected ONLY by `canonical-broker` and run together, in declared order,
 * inside `test.describe.serial`, sharing this file's module-scope
 * `listingId`. T14 and T15 do their own in-test identity switch on the
 * SAME tracked `page` (never a second untracked browser context — that
 * would escape `installNoApiMockGuard`'s traffic recording and could make
 * this file's `afterEach` `assertBackendTrafficWasReal` a false negative):
 *   - T14 clears the page's storage/cookies, then performs a REAL live
 *     `loginAsAdmin` sign-in (e2e/helpers.ts, reused verbatim) on the same
 *     page — a real UI login, not a hack — which requires ADMIN_EMAIL/
 *     ADMIN_PASSWORD to ALSO be present, in addition to whatever credential
 *     got `canonical-broker` included at all. Defence-in-depth throw (never
 *     skip) if absent — this file's OWN extra requirement, beyond the
 *     single-role credential this project's inclusion already guarantees.
 *   - T15 clears the page's storage/cookies (no live login — anon has no
 *     credentials) and reloads, so AuthContext genuinely observes no user.
 *
 * On T13 FAILING outright: `test.describe.serial` makes Playwright mark T14
 * and T15 SKIPPED, not failed, in that case — so the `if (!listingId) throw`
 * guards inside T14/T15 below are never reached on that path. Those guards
 * cover a narrower case instead: T13 completing (not failing) but leaving
 * `listingId` unset due to a logic bug. This does not weaken this suite's
 * honesty guarantee — a skipped test is still clearly distinguishable from a
 * passed one in CI reporting, so it carries no false-positive risk. Nor does
 * it relax the zero-skips requirement elsewhere in this project: that
 * requirement is about authored `test.skip`/`test.fixme` (there are none
 * here, and none may be added), not about Playwright's own serial-cascade
 * behaviour on a genuine upstream failure.
 *
 * This is a deliberate, source-verified deviation from a literal
 * per-project-per-role test layout. It was not something this scope lock
 * permitted fixing at the config layer (playwright.canonical.config.ts is
 * out of bounds), so it is handled entirely inside this file instead and
 * flagged here for review.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * T14 RE-ENABLED (#2242 fixed) — T15 FIXED (#2274) — anon-teaser contract, re-enabled
 * ═══════════════════════════════════════════════════════════════════════
 *
 * T14/T15 were previously BOTH descoped (Main Agent ruling, rework cycle 3,
 * Option 1: keep AUTHORED, do not execute, do not appear as skipped)
 * because src/pages/admin/PendingListings.tsx read the pending approval
 * queue DIRECTLY from hosted Supabase (`supabase.from('property_listings')
 * ...`), while T13 creates its listing through the backend API, which
 * persists to the LOCAL fixture PostGIS container — a different database
 * entirely. The listing T13 creates could therefore never appear in the
 * queue T14 read, no matter how correct T14/T15's own code was.
 *
 * That mismatch is now FIXED in this branch: PendingListings.tsx reads
 * `GET /api/admin/listings/pending` through the backend (a paginated
 * `Page<ListingResponse>`, admin-guarded) instead of hitting hosted
 * Supabase directly. The backend serves this from the SAME database T13's
 * listing persists to, so the local-fixture topology now works end to end
 * for T14. T14 is therefore RE-ENABLED below, unconditionally, and passes
 * 3/3 — it is proof the #2242 fix works. This rationale (hosted-Supabase
 * vs. local-fixture DB mismatch) is now HISTORICAL for T14: #2242 is fixed
 * in this branch and no longer outstanding.
 *
 * T13 does not share a `test.describe.serial` group with T14 — it runs
 * standalone, and T14 is registered as its own standalone test immediately
 * after it. Ordering between them (T14 needs T13's `listingId`, captured
 * into the shared module-scope `listingId` variable) is guaranteed by
 * Playwright's default same-file, same-project execution order: tests in a
 * spec file run in the order they are declared, and T13's `test(...)` is
 * declared before T14's. No `describe.serial` coupling is needed for that
 * guarantee, and adding one was deliberately avoided here so as not to
 * change T13's or T14's already-green behaviour.
 *
 * T15 (anon visitor views the now-LIVE listing) was temporarily descoped
 * TWICE because it surfaced two SEPARATE, REAL PRODUCT BUGS in succession —
 * filed as issues #2263 (P0) and #2268 — never because of any defect in T15
 * itself:
 *
 *   Nothing on the broker path ever set `area_key` on a listing — not
 *   createDraft, not updateListing, not submitListing, and not
 *   approveListing (whose `if (saved.getAreaKey() != null)` was a read-only
 *   GATE, not an assignment). Only the scraping/ingestion pipeline set it.
 *   Meanwhile PublicListingController.getById → findByIdWithActiveCity
 *   INNER JOINs areas→cities and fail-closes to 404 for a NULL `area_key`.
 *   Net effect: every broker-submitted, admin-approved LIVE listing was
 *   genuinely invisible to anonymous visitors. T15's "anon sees the
 *   listing" assertion was CORRECT; the PRODUCT was wrong.
 *
 * #2263 was FIXED UPSTREAM and merged to main in **#2267** (commit
 * ad8ef333, "fix(#2263): resolve area_key for broker-approved listings"),
 * which this branch now contains. T15 was re-enabled and re-run against it.
 *
 * IT STILL FAILED on re-run — for a narrower, genuinely DIFFERENT reason,
 * tracked as **#2268**. #2267 wired area resolution into the broker path, but
 * the locality->canonical-area lookup did not resolve `locality='Manipal'`:
 * ListingAreaResolutionService logged an UNRESOLVED result, the listing went
 * LIVE with `area_key` still NULL, and PublicListingController.getById
 * fail-closed to 404 exactly as before. DB-corroborated — every
 * `[E2E-T13]%` listing created after the #2267 merge was LIVE with a NULL
 * `area_key`. T15 was descoped a second time, pointing at #2268.
 *
 * #2268 was FIXED in **#2270** (alias-first, city-derived resolution against
 * the curated `area_alias` table — Manipal now resolves even when the
 * geocoder can't map its city name to a `cities` row, and before that,
 * resolves without depending on live geocoding succeeding at all), plus
 * **#2273** (repaired a duplicate Flyway V126 migration collision introduced
 * when #2270 merged concurrently with another PR — a deploy-blocking P0,
 * unrelated to #2268's own logic, now closed). Both are merged to main and
 * in this branch. T15 was re-enabled here for a second time, and this time
 * it genuinely reached the anon detail page for the first time ever — DB-
 * corroborated: `area_key = 'IN|KA|Udupi|Manipal'`, `status = 'LIVE'`, and
 * `GET /api/public/listings/{id}` (anon, no bearer) now returns 200 instead
 * of 404.
 *
 * IT STILL FAILED on THAT re-run too — a THIRD time, for a genuinely
 * different reason, filed as **#2274**. This time it was a TEST defect, not
 * a product defect: T15's assertion expected the exact broker-entered title
 * to render as the page's `<h1>` for an anonymous visitor. It never can, by
 * design — `PublicListingController.getById` branches on caller identity and
 * returns `listingResponseMapper.toTeaserResponse(listing)` (never the real
 * title) for anonymous callers, `toPublicResponse(...)` (real title) only
 * for authenticated ones. `ListingTeaserResponse` is an established,
 * separately-tested DTO (#1941) deliberately scoped to withhold exact-title/
 * price-level detail from anon viewers — the honest teaser design, not a
 * regression. T15's assumption that anon sees the exact title was simply
 * never validated against this real code path before, because #2263 and
 * then #2268 both 404'd the page before the title assertion ever ran.
 *
 * #2274 is FIXED HERE (per exact-head review on `c7e1d26`): T15 now waits
 * for the real anon `GET /api/public/listings/{id}` request and asserts it
 * is genuinely reachable (2xx — the actual #2263/#2268 regression surface),
 * then asserts the honest, client-side-synthesized `${label} in ${locality}`
 * heading ("Apartment in Manipal" for this fixture) that anon visitors
 * actually see — never the broker-only `UNIQUE_TITLE`. No product contract
 * change was needed; T15 is re-enabled with the corrected assertion.
 *
 * Worth preserving for whoever reads this next. Across all three rounds,
 * this test caught two distinct product defects (#2263, #2268) and one
 * test-authoring defect (#2274) in the same code path — descoping it
 * because "its own assertion looked stale" would have quietly stopped
 * verifying that an approved listing is genuinely publicly reachable. It
 * was also the test most readily dismissed as an artefact of this spec's
 * own out-of-band arrangement shortcut (see the ARRANGED-OUT-OF-BAND GATES
 * section above); descoping it on that assumption rather than investigating
 * would have shipped a P0 behind a green suite. Investigate before
 * descoping — and note that a fix landing is not the same as a fix being
 * complete. Re-running the test that found the bug is what tells you which.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * T15 UPDATED (#2235) — anon teaser now carries the real title
 * ═══════════════════════════════════════════════════════════════════════
 *
 * #2274's fix above was correct for the code as it existed at the time:
 * `ListingTeaserResponse` had no `title` field, so anon visitors could only
 * ever see the synthesized `${label} in ${locality}` heading, never the
 * broker's real entered title. #2235 adds a `title` field to
 * `ListingTeaserResponse`, populated from the same `title` column an
 * authenticated caller sees (`ListingResponseMapper.toTeaserResponse` /
 * `toTeaserResponseList`) — anon callers now receive the listing's real
 * title verbatim, same as an authed caller. The synthesized fallback
 * heading in `ListingDetailMainContent.tsx` still exists and still fires
 * for a listing with a genuinely blank/absent title, but T15's listing
 * (created by T13 with `UNIQUE_TITLE`) always has a real title, so its own
 * anon assertion below now expects `UNIQUE_TITLE`, not the synthesized
 * heading. The #1941 anon PII/price gating this test's history is otherwise
 * about (exact price, location beyond locality, contact detail) is
 * unaffected — only `title` was added to the teaser DTO.
 */

import { test, expect } from './support/canonical-test';
import { loginAsAdmin, hasRealCredentials } from '../helpers';

const UNIQUE_TITLE = `[E2E-T13] Lifecycle ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';

/** Decodes a JWT's payload and returns its `sub` claim — no signature verification (test-only). */
function decodeJwtSub(token: string): string {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) {
    throw new Error('[listing-lifecycle] captured Authorization header is not a well-formed JWT (no payload segment).');
  }
  const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const json = Buffer.from(padded, 'base64').toString('utf-8');
  const payload = JSON.parse(json) as { sub?: string };
  if (!payload.sub) {
    throw new Error('[listing-lifecycle] JWT payload has no `sub` claim — cannot derive the broker\'s userId/createdBy.');
  }
  return payload.sub;
}

function requireBackendBaseUrl(): string {
  const backend = process.env.BACKEND_BASE_URL;
  if (!backend) {
    throw new Error('[listing-lifecycle] BACKEND_BASE_URL is unset — required for arranged page.request calls.');
  }
  return backend;
}

// T15_ENABLED — now TRUE, fixed per exact-head review on c7e1d26 (#2274).
// #2263 and #2268 (the two prior PRODUCT bugs on this code path) are fixed
// and closed. #2274 (a TEST defect — T15's own assertion, not the product)
// is fixed here: the anon page's H1 is honestly synthesized client-side as
// `${label} in ${locality}` when the anon ListingTeaserResponse carries no
// `title` (#1941, intentional) — T15 now waits for the real anon
// GET /api/public/listings/{id} request (asserting 2xx — the actual
// #2263/#2268 regression surface) and asserts that honest synthesized
// heading, instead of the broker-only UNIQUE_TITLE an anon visitor is never
// shown. See the module docstring's "T15 FIXED (#2274) — anon-teaser
// contract, re-enabled" section for the full history.
// T14 has NO equivalent flag — it is always registered below, since #2242
// (its own prior blocker) is fixed in this branch.
const T15_ENABLED = true;

// Shared across T13/T14(/T15 when re-enabled) — see the PROJECT-TOPOLOGY
// DEVIATION note above for why this was originally scoped to one shared
// serial group. T13 does not share `test.describe.serial` with T14 (see
// "T14 RE-ENABLED" above); ordering is instead guaranteed by same-file
// declaration order (T13's `test(...)` before T14's). This module-scope
// variable is the link between them, and — once T15 is re-enabled — will
// again be read by T15 too.
let listingId: string | null = null;

test('[role:broker] T13 — broker fills core fields, arranges photos+pin out-of-band, and submits for review', async ({ page }) => {
    const backendBaseUrl = requireBackendBaseUrl();

    await page.goto('/broker/listings/new/residential');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Create a listing' })).toBeVisible({ timeout: 15_000 });

    // ── Step 1 — deterministic UI fields (apartment/residential only) ──
    await page.locator('#title').fill(UNIQUE_TITLE);
    // Real UI interaction, but this field's VALUE does not feed the
    // `locality` gate — see the module docstring's gate 3 note. The
    // gate-satisfying value is set later via the arranged PUT.
    await page.locator('#locality').fill('Manipal');

    // IF T13 GOES RED AND YOU ARE BISECTING: THIS HUNK IS THE FIRST SUSPECT.
    // It was added by #2434 to a currently-green, externally-owned,
    // CI-required test, so it gives T13 a new failure surface it did not have
    // before — the "Write it myself" button and the description-assistant
    // testid are Residential-specific and could drift independently of
    // anything #2434 touches. Revert this hunk first to isolate; the
    // consequence of reverting is the dedupe collision below, which is
    // currently masked only because T14 is broken.
    //
    // FIXTURE-ONLY SWEEP (#2434): this chain has the SAME dedupe collision
    // the Commercial one hit. computeDedupeHash is (description, locality,
    // price) — title is not a component — so varying only UNIQUE_TITLE with
    // a null description and a constant locality produced one shared hash
    // across runs, and rows from run 2 onward carry is_duplicate = true.
    // DiscoverListingPredicateBuilder's base predicate excludes those
    // unconditionally (`pl.is_duplicate = false`). Cited by SYMBOL, not line:
    // this is the sole justification for a hunk in an externally-owned,
    // CI-required test, and the previous `:135` citation had drifted onto a
    // record constructor — which invites the next reader to conclude the
    // justification was fabricated and distrust the hunk.
    //
    // It has not bitten here ONLY because these rows stop at PENDING_REVIEW
    // and never reach LIVE while T14 is broken (#2513). Fixing T14 without
    // this would make the Residential membership assertions fail exactly as
    // the Commercial one did, for a reason that looks nothing like the cause.
    // This is a fixture change only — it does NOT fix T14.
    await page.getByRole('button', { name: 'Write it myself', exact: true }).click();
    const t13Description = page.getByTestId('description-assistant-ready').locator('textarea');
    await expect(t13Description).toBeVisible({ timeout: 10_000 });
    await t13Description.fill(`Canonical Residential lifecycle fixture for ${UNIQUE_TITLE}.`);
    await page.locator('#price').fill('7500000');
    await page.getByRole('radio', { name: '2 BHK' }).click();
    await page.getByRole('radio', { name: '1,000 sqft' }).click();

    // ── Step 2 — Save draft (real POST /api/listings; draft creation is
    //     NOT automatic) — capture both the draft id AND the broker's own
    //     real bearer token from this same real request (see module
    //     docstring's "AUTH TOKEN" note).
    const draftCreatePromise = page.waitForResponse(
      (r) => r.url().endsWith('/api/listings') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const draftCreateResp = await draftCreatePromise;
    expect(draftCreateResp.ok(), 'POST /api/listings (draft create) must respond 2xx').toBe(true);

    const draftBody = (await draftCreateResp.json()) as { id: string };
    listingId = draftBody.id;
    expect(listingId, 'draft create response must carry an id').toBeTruthy();

    const authHeader = draftCreateResp.request().headers()['authorization'];
    expect(authHeader, 'the real draft-create request must carry a real Authorization header').toBeTruthy();
    const bearerToken = (authHeader ?? '').replace(/^Bearer\s+/i, '');
    const brokerUserId = decodeJwtSub(bearerToken);

    // History REPLACE lands the id in the URL (Issue #2039 AC1) — confirms
    // the real UI-observable postcondition, not just the network response.
    await expect(page).toHaveURL(new RegExp(`[?&]draftId=${listingId}`), { timeout: 10_000 });

    // ── Step 3 — POSITIVE CONTROL: the gate is genuinely CLOSED here.
    //     There is no disabled "Submit" button to inspect pre-review —
    //     ResidentialListingForm.tsx only renders "Submit for review"
    //     inside review MODE, and handleGoToReview's own gate check blocks
    //     the edit->review MODE TRANSITION itself whenever
    //     strengthResult.isSubmittable is false (it calls persistDraft(),
    //     THEN checks the gate in persistDraft's onDone, and returns without
    //     calling setMode('review') — see ResidentialListingForm.tsx's own
    //     "PERSIST-THEN-BLOCK SHAPE" comment). So the closed-gate proof here
    //     is: clicking "Review" still issues a real save (a genuine PUT),
    //     but the page never leaves edit mode — no "Review your listing"
    //     heading appears — AND InlinePhotos shows the honest
    //     "(minimum 3 required)" copy proving photos are genuinely absent.
    const blockedReviewPut = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${listingId}`) && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const blockedReviewResp = await blockedReviewPut;
    expect(blockedReviewResp.ok(), 'the blocked Review attempt still persists a real draft PUT').toBe(true);

    await expect(page.getByRole('heading', { name: 'Review your listing' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Create a listing' })).toBeVisible();
    await expect(page.getByTestId('photo-tile-grid')).toBeVisible();
    await expect(page.getByText('minimum 3 required')).toBeVisible();

    // ── Step 4 — arrange the two real submit gates out-of-band ──
    for (let i = 1; i <= 3; i++) {
      const imageResp = await page.request.post(`${backendBaseUrl}/api/listings/${listingId}/images`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        data: {
          storagePath: `listings/${brokerUserId}/${listingId}/photo-${i}.jpg`,
          url: 'https://placehold.co/800x600',
        },
      });
      expect(imageResp.ok(), `arranged image ${i} registration (POST .../images) must respond 2xx — got ${imageResp.status()}: ${await imageResp.text()}`).toBe(true);
    }

    const putResp = await page.request.put(`${backendBaseUrl}/api/listings/${listingId}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      data: {
        addressConfirmed: true,
        latitude: 13.3522,
        longitude: 74.7873,
        // Gate 3 (see module docstring) — set here, not via the UI.
        locality: 'Manipal',
      },
    });
    expect(putResp.ok(), `arranged addressConfirmed/latitude/longitude/locality PUT must respond 2xx — got ${putResp.status()}: ${await putResp.text()}`).toBe(true);

    // ── Step 5 — reload so the form re-observes the arranged state
    //     (['listing-images', listingId] has staleTime 30s; a hard reload
    //     re-mounts React Query fresh regardless, forcing a real refetch).
    const imagesRefetchPromise = page.waitForResponse(
      (r) => r.url().includes(`/api/listings/${listingId}/images`) && r.request().method() === 'GET',
      { timeout: 15_000 },
    );
    const listingRefetchPromise = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${listingId}`) && r.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await page.reload();
    const [imagesRefetchResp, listingRefetchResp] = await Promise.all([imagesRefetchPromise, listingRefetchPromise]);
    expect(imagesRefetchResp.ok(), 'post-reload GET .../images must respond 2xx').toBe(true);
    expect(listingRefetchResp.ok(), 'post-reload GET /api/listings/{id} must respond 2xx').toBe(true);

    // ── Step 6 — the DISABLED -> ENABLED flip: Review now genuinely
    //     transitions into review mode across this real state change.
    const unblockedReviewPut = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${listingId}`) && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const unblockedReviewResp = await unblockedReviewPut;
    expect(unblockedReviewResp.ok(), 'the now-unblocked Review attempt still persists a real draft PUT').toBe(true);
    await expect(page.getByRole('heading', { name: 'Review your listing' })).toBeVisible({ timeout: 10_000 });

    // ── Step 7 — honest copy: "Submit for review", never "Published".
    const submitButton = page.getByRole('button', { name: 'Submit for review', exact: true });
    await expect(submitButton).toBeVisible({ timeout: 10_000 });
    await expect(submitButton).toBeEnabled();
    await expect(page.getByText('Published', { exact: false })).toHaveCount(0);

    // ── Step 8 — submit (POST /api/listings/{id}/submit) ──
    const submitPromise = page.waitForResponse(
      (r) => r.url().endsWith(`/api/listings/${listingId}/submit`) && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await submitButton.click();
    const submitResp = await submitPromise;
    expect(submitResp.ok(), 'POST /api/listings/{id}/submit must respond 2xx').toBe(true);

    const submittedPanel = page.getByTestId('residential-submitted-panel');
    await expect(submittedPanel).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Submitted for review' })).toBeVisible();
    // Scoped to the submitted panel: the unscoped page-wide locator resolves to 3
    // elements — the panel's own copy (ResidentialListingForm.tsx's submitted-panel
    // `<p>`), the toast body from the same handler (`toast({ ..., description:
    // 'Pending admin approval.' })`), and this file's earlier helper text — so
    // Playwright's strict mode correctly refuses to pick one. Scoping within the
    // already-asserted-visible panel container is the single genuine match.
    await expect(submittedPanel.getByText('Pending admin approval.', { exact: false })).toBeVisible();

    // ── Step 9 — appears in /broker/listings as "Under Review" ──
    const myListingsPromise = page.waitForResponse(
      (r) => r.url().includes('/api/listings/mine') && r.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await page.goto('/broker/listings');
    const myListingsResp = await myListingsPromise;
    expect(myListingsResp.ok(), 'GET /api/listings/mine must respond 2xx').toBe(true);

    const titleNode = page.getByText(UNIQUE_TITLE, { exact: true });
    await expect(titleNode).toBeVisible({ timeout: 10_000 });
    // Card is the nearest ancestor that also carries the status badge — no
    // testid on these rows (per this file's brief); walk up via role/DOM
    // structure rather than assuming a fixed class name is stable.
    const card = titleNode.locator('xpath=ancestor::*[self::div][.//*[contains(text(),"Under Review") or contains(text(),"Draft") or contains(text(),"Live")]][1]');
    await expect(card.getByText('Under Review', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

// T14 — RE-ENABLED, UNCONDITIONALLY, now that issue #2242 is fixed. See the
// module docstring's "T14 RE-ENABLED (#2242 fixed) — T15 DESCOPED (#2263)"
// section for the full rationale. T14 previously shared a
// `test.describe.serial` pairing with T15 (T15 depended on T14 having
// approved the listing); that wrapper is kept here around T14 alone —
// unchanged in effect for T14 (a one-test serial group behaves identically
// to a standalone test for pass/fail/reporting purposes) — so T14's own
// body and its surrounding execution semantics are left exactly as they
// were while T15 moves out to its own flag-gated block below.
test.describe.serial('T14 — admin approve (depends on T13\'s listingId)', () => {
    test('[role:broker] T14 — admin approves the submitted listing (real live admin sign-in on the shared page)', async ({ page }) => {
    // NOTE on this guard's actual reach: `test.describe.serial` means that if
    // T13 itself FAILS, Playwright marks T14/T15 SKIPPED and this guard is
    // never reached — a skip, not a false pass, and clearly distinguishable
    // from a pass in CI reporting, so that failure mode is not a
    // false-positive risk this guard needs to cover. What this `if` DOES
    // cover is the narrower case of T13 completing (not failing) but leaving
    // `listingId` unset because of a logic bug — defence-in-depth against
    // that specific gap, not a substitute for T13's own assertions.
    if (!listingId) {
      throw new Error('[T14] listingId was not captured by T13 — see this file\'s PROJECT-TOPOLOGY DEVIATION note.');
    }
    if (!hasRealCredentials(adminEmail, adminPassword)) {
      throw new Error('[T14] ADMIN_EMAIL/ADMIN_PASSWORD absent — this test needs BOTH broker and admin credentials (see module docstring); it should not have run without them.');
    }

    // This test's own default `page` starts fresh from canonical-broker's
    // project storageState (broker-authenticated) — clear it before signing
    // in as admin so loginAsAdmin's `page.goto('/auth')` does not hit
    // Auth.tsx's already-signed-in redirect race (see auth-session.
    // canonical.ts's own KNOWN PRODUCT BUG note for the mechanism).
    await page.goto('/broker/listings');
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();

    await loginAsAdmin(page, adminEmail, adminPassword);
    await expect(page.getByRole('button', { name: 'Admin Console' })).toBeVisible({ timeout: 15_000 });

    // Flake defence: this navigation now triggers a real backend request
    // (GET /api/admin/listings/pending?size=100 — see #2242) that did not
    // exist when this page read hosted Supabase directly. Register the
    // wait BEFORE navigating and assert it responded 2xx, so a 401/403/500
    // here fails with a clear signal instead of a confusing "row not found"
    // timeout. Matched via `.includes(...)` of the path, not exact
    // equality, because PendingListings.tsx appends `?size=100`.
    const pendingQueuePromise = page.waitForResponse(
      (r) => r.url().includes('/api/admin/listings/pending') && r.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await page.goto('/admin/listings/pending');
    const pendingQueueResp = await pendingQueuePromise;
    expect(pendingQueueResp.ok(), 'GET /api/admin/listings/pending must respond 2xx').toBe(true);

    const titleCell = page.getByText(UNIQUE_TITLE, { exact: false });
    await expect(titleCell, 'the just-submitted listing must appear in the pending queue by its unique title').toBeVisible({ timeout: 15_000 });

    const row = page.getByTestId(`pending-row-${listingId}`);
    await expect(row, 'the row located by testid must be the SAME row carrying the unique title').toBeVisible();
    await expect(row.getByText(UNIQUE_TITLE, { exact: false })).toBeVisible();

    const approvePromise = page.waitForResponse(
      (r) => r.url().endsWith(`/api/admin/listings/${listingId}/approve`) && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await row.getByRole('button', { name: 'Approve' }).click();
    const approveResp = await approvePromise;
    expect(approveResp.ok(), 'POST /api/admin/listings/{id}/approve must respond 2xx').toBe(true);

    // Ported from the now-retired e2e/admin-approval.spec.ts (AA2) — #1713.
    // Success toast: "Listing Approved".
    await expect(page.getByText(/listing approved/i).first()).toBeVisible({ timeout: 10_000 });

    await expect(row, 'the approved row must leave the pending queue').toHaveCount(0, { timeout: 10_000 });
  });
});

// T15 — FIXED (#2274) and RE-ENABLED. See the module docstring's "T15 FIXED
// (#2274) — anon-teaser contract, re-enabled" section above for the full
// history: #2267 and #2270 (+#2273) fixed both prior PRODUCT bugs — the
// listing now genuinely goes LIVE with a resolved area_key and the anon
// endpoint returns 200. #2274 was T15's OWN test defect — its assertion
// expected the broker-only title, which anon callers are never shown by
// design (#1941's `toTeaserResponse`). Fixed by asserting the real anon
// contract instead: wait for the genuine anon GET response (2xx — the exact
// #2263/#2268 regression surface), then assert the honestly-synthesized
// `${label} in ${locality}` heading anon visitors actually see.
// Gated behind `if (T15_ENABLED)` rather than a bare registration only so a
// future regression can be descoped again the same honest way (never
// `test.skip`/`test.fixme`) without deleting or rewriting this body.
if (T15_ENABLED) {
  test('[role:broker] T15 — anon visitor sees the now-LIVE listing at /listing/:id', async ({ page }) => {
    // See the module docstring's "On T13 FAILING outright" note — this guard
    // covers T13-completed-but-listingId-unset, not a failed T13 (which
    // skips this test instead of reaching this line).
    if (!listingId) {
      throw new Error('[T15] listingId was not captured by T13 — see this file\'s PROJECT-TOPOLOGY DEVIATION note.');
    }

    // Genuinely anonymize the shared, already-authenticated page — see the
    // module docstring's PROJECT-TOPOLOGY DEVIATION note for why a second,
    // untracked browser context is deliberately avoided here. Must navigate
    // to the listing's own origin FIRST — localStorage is inaccessible from
    // whatever page the browser context is currently on otherwise.
    await page.goto(`/listing/${listingId}`);
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();

    // #2274 fix (per exact-head review on c7e1d26): the anon detail page
    // calls GET /api/public/listings/{id}, which — by design —
    // PublicListingController#getById returns as listingResponseMapper's
    // ListingTeaserResponse for anonymous callers (never the broker's real
    // title, see ListingResponseMapper#toTeaserResponse, #1941). Wait for
    // the real anon-triggered request (the reload below, now that storage/
    // cookies are cleared) and assert it is genuinely reachable (2xx, not
    // the 404 that #2263/#2268 previously caused) BEFORE asserting on the
    // page content it produces — this is the actual regression surface
    // (#2263, then #2268) that T15 exists to catch.
    const anonTeaserPromise = page.waitForResponse(
      (r) => r.url().endsWith(`/api/public/listings/${listingId}`) && r.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await page.reload();
    const anonTeaserResp = await anonTeaserPromise;
    expect(anonTeaserResp.ok(), 'GET /api/public/listings/{id} (anon) must respond 2xx — the exact regression #2263/#2268 caused').toBe(true);
    await page.waitForLoadState('domcontentloaded');

    // Genuinely anonymous — not an accidentally-authenticated session that
    // would make the assertions below pass for the wrong reason.
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });

    // POSITIVE CONTROL against a blank/errored page. UPDATED (#2235): the
    // anon endpoint's ListingTeaserResponse now carries the real `title`
    // field (see this file's "T15 UPDATED (#2235)" module-docstring
    // addendum), so an anon viewer sees the broker's real entered title
    // verbatim — the same UNIQUE_TITLE asserted by T13/T14 above — never the
    // synthesized `${label} in ${locality}` fallback heading, which now only
    // fires for a listing with a genuinely blank/absent title.
    await expect(page.getByRole('heading', { level: 1, name: UNIQUE_TITLE })).toBeVisible({ timeout: 15_000 });

    // This spec deliberately does NOT assert any status word here (no
    // "Published", no "Live") — per this file's honest-copy requirement,
    // matching listing-detail-gating.canonical.ts's T11/T12 precedent.
  });
}
