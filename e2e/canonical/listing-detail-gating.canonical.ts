/**
 * Listing-detail gating — T11 (anon) / T12 (authed) — issue #1713, PR-2.
 *
 * Mixed-auth BY DESIGN: the anon/authed CONTRAST across these two tests IS
 * the behaviour under test, not an accident of file organisation. T11 runs
 * in `canonical-anon`; T12 is tagged `[role:user]` and runs in
 * `canonical-user` (pre-authenticated storageState — see
 * playwright.canonical.config.ts).
 *
 * FIXTURE: reuses the exact same literal constants as
 * canonical-harness-smoke.canonical.ts for listing
 * e2e00001-0000-0000-0000-000000000001 (that file's own module docstring has
 * the full derivation + live-curl verification of the anon teaser response
 * shape) — not re-derived here, on purpose, per this harness's
 * "reuse, never duplicate" contract.
 *
 * ══════════════════════════════════════════════════════════════════════
 * SCOPE AMENDMENT (this slice): a narrow scripts/db/fixtures/** allowance
 * unblocked one of the two gaps a previous pass of this file had to document
 * as unfulfillable, and live verification (LIVE, not read-from-source —
 * see below) surfaced a SECOND, DIFFERENT, deeper gap that this slice's
 * scope lock does not permit fixing. Both are recorded here rather than
 * worked around, per this slice's own instruction: "if you believe you need
 * a forbidden file, STOP and report — do not work around it."
 *
 * 1. T11's SignInGateCard href — FIXED. scripts/db/fixtures/discover-smoke-seed.sql
 *    section 5d now gives this exact listing (NO new listing) TWO
 *    `listing_images` rows. Live-curl-verified this had to be TWO, not one:
 *    ListingDetail.tsx:196-201 synthesizes a 1-item `images` array from the
 *    anon teaser's `primaryImageUrl` field (anon never receives the real
 *    `images[]` list), so with only one seeded image `images.length` (1,
 *    synthesized) equals `effectiveImageCount` (1, from `imageCount`) and
 *    ListingGallery.tsx's `effectiveImageCount > images.length` lock
 *    condition never trips — an EARLIER version of this seed/spec pair with
 *    exactly one image was written, run live, and failed for exactly this
 *    reason (a real defect this harness caught in its own authoring, not a
 *    simulated one). With two seeded images, `imageCount` (2) genuinely
 *    exceeds the synthesized `images.length` (1), and the anon overlay
 *    SignInGateCard genuinely renders.
 *    CRITICAL GOTCHA (do not click the gate expecting navigation):
 *    SignInGateCard.tsx:47/:65 render
 *    `<Link to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
 *    onClick={handleModalOpen}>` and `handleModalOpen` calls
 *    `e.preventDefault()` and opens a modal instead of navigating. This test
 *    therefore asserts the `href` attribute directly, never a click.
 *
 * 2. T12's contact-phone-section — NOT FIXABLE within this slice's scope
 *    lock; STOPPED AND REPORTED rather than worked around. The listing now
 *    has a real seeded `contact_phone` ('+91-9876500001', seed section 5d),
 *    and ListingDetailSidebar.tsx:104-127 correctly guards it on
 *    `user && listing.contact_phone`. But live-curl against an
 *    AUTHENTICATED GET /api/public/listings/{id} for this exact listing
 *    (contact_phone populated in the DB) proved the JSON response never
 *    contains a `contactPhone` (or `contact_phone`) key at all — confirmed
 *    by reading backend/src/main/java/com/example/realestate/listing/api/
 *    ListingResponse.java in full: its ~150-field record has NO contact
 *    phone field anywhere. ListingResponseMapper#build (which
 *    #toPublicResponse calls for every authenticated caller) never reads
 *    `Listing.getContactPhone()` either. This means the contact-phone
 *    section is DEAD CODE end-to-end for every caller, seeded data or not —
 *    a pre-existing gap in this repo's authenticated listing-detail
 *    response, not something introduced by or fixable via this slice's seed
 *    change. Fixing it needs a backend/src change (add `contactPhone` to
 *    `ListingResponse` + populate it in `ListingResponseMapper#build`) that
 *    this slice's scope lock explicitly forbids (`backend/**` is out of
 *    scope). T12 below therefore does NOT assert the contact-phone section
 *    is visible — asserting it, given this finding, could only ever be a
 *    permanently-red test masking a real product bug, or a quietly-adjusted
 *    assertion that goes back to being vacuous. See this slice's final
 *    report for the recommended backend follow-up.
 * ══════════════════════════════════════════════════════════════════════
 */

import { test, expect } from './support/canonical-test';

const FIXTURE_LISTING_ID = 'e2e00001-0000-0000-0000-000000000001';
const TEASER_PRICE_BAND = '₹0–25L';
const TEASER_LOCALITY = 'Manipal';
// Raw DB title (scripts/db/fixtures/discover-smoke-seed.sql section 5).
// UPDATED (#2235): both anon (T11) and authed (T12) callers now receive this
// real `title` field verbatim — anon teaser responses used to omit `title`
// entirely, which made the frontend synthesize a `${propertyType} in
// ${locality}` fallback heading ("Apartment in Manipal" for this fixture)
// for anon only; that synthesized-heading path is now exercised solely by
// listings with no real title (see canonical-harness-smoke.canonical.ts's
// module docstring and ListingDetailMainContent.test.tsx's #2235 coverage),
// not by this fixture's anon view any more. See T12's own comment for the
// original live-curl verification of the authed side, which is unchanged.
const AUTHED_TITLE = '[E2E] 1 Lakh Manipal Apartment';

test.describe('T11 — anon listing detail: real teaser content + honest gating', () => {
  test('anon sees real teaser content and a genuine sign-in image gate', async ({ page }) => {
    await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Genuinely anonymous — not an accidentally-authenticated session that
    // would make the negative check below pass for the wrong reason.
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });

    // Real, specific teaser content — reused verbatim from the harness
    // smoke spec (see that file for why these three, independently, cannot
    // pass against an empty/broken render). Title assertion UPDATED (#2235):
    // anon now receives the real DB title, same as the authed caller in T12
    // below — see this file's AUTHED_TITLE comment.
    await expect(
      page.getByRole('heading', { level: 1, name: AUTHED_TITLE }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TEASER_PRICE_BAND, { exact: true })).toBeVisible();
    const localityRow = page.locator(
      'div.flex.items-center.gap-2.border-t.border-border.pt-4.text-sm',
    );
    await expect(localityRow.getByText(TEASER_LOCALITY, { exact: true })).toBeVisible();

    // REMOVED (this fix cycle): a `contact-phone-section` count-0 assertion
    // used to sit here. It was vacuous, not merely weak — verified via
    // backend/src/main/java/com/example/realestate/listing/api/
    // ListingResponse.java (full 205-line record read): there is NO
    // contactPhone/contact_phone field anywhere on that DTO, so
    // ListingResponseMapper cannot populate it for ANY caller, authed or
    // anon. ListingDetailSidebar.tsx's `user && listing.contact_phone` guard
    // is therefore always false regardless of auth state — the section is
    // dead code end-to-end, not something this gating spec exercises. A
    // count-0 check against a section that can never render for anyone
    // passes unconditionally and proves nothing about anon-vs-authed
    // gating (T12 correctly never asserted the authed-positive side either,
    // for the same reason — see that test's own comment). Tracked as a
    // backend follow-up (add `contactPhone` to `ListingResponse` +
    // `ListingResponseMapper#build`, then reintroduce a real anon/authed
    // contrast here) rather than kept as a permanently-green no-op. Do not
    // re-add this assertion without that backend change landing first.

    // SignInGateCard href for the anon photo lock — genuinely rendered
    // because the fixture listing now has TWO real listing_images rows
    // (imageCount 2 > the anon-synthesized images.length of 1 — see module
    // docstring finding 1 for why one image was insufficient).
    //
    // LIVE-VERIFIED GOTCHA (not documented anywhere in source, found only by
    // running this against the real app): the overlay is NOT shown on
    // initial render even when `hasMoreLocked` is true.
    // useGalleryNavigation.ts's `nextImage()` only sets `galleryLocked` true
    // (which ListingGallery.tsx:92 OR's into the overlay condition alongside
    // `currentImageIndex >= 1`) the first time the visitor clicks past the
    // single synthesized image — it is a real, interactive "you've hit the
    // paywall" moment, not a passive page-load state. So this test clicks
    // "Next image" once first, exactly what an anon visitor browsing a
    // 2-photo listing would do.
    const nextImageButton = page.getByRole('button', { name: 'Next image' });
    await expect(nextImageButton).toBeVisible({ timeout: 10_000 });
    await nextImageButton.click();

    // Assert the href only — see module docstring's CRITICAL GOTCHA:
    // clicking the gate itself opens a modal (preventDefault), it does not
    // navigate.
    const signInGate = page.getByRole('link', { name: 'Sign in to view all photos' });
    await expect(signInGate).toBeVisible({ timeout: 10_000 });
    await expect(signInGate).toHaveAttribute(
      'href',
      `/auth?returnTo=${encodeURIComponent(`/listing/${FIXTURE_LISTING_ID}`)}`,
    );
  });
});

test.describe('T12 — authed listing detail: gating relaxes', () => {
  test('[role:user] authed user: sign-in control and photo lock absent, area-insights link present', async ({ page }) => {
    await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Authed-only positive EARLY (D2's "HARD REQUIREMENT") — a broken/expired
    // storageState must fail this immediately, not sail through weaker
    // assertions further down.
    await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 15_000 });

    // Live-curl-verified an authed GET /api/public/listings/{id} returns the
    // real DB `title` field ("[E2E] 1 Lakh Manipal Apartment"), which
    // ListingDetailMainContent.tsx renders verbatim whenever `listing.title`
    // is present. UPDATED (#2235): T11 above now asserts this same
    // AUTHED_TITLE for the anon view too, since anon teaser responses also
    // carry the real `title` field now — the synthesized `${propertyType} in
    // ${locality}` fallback heading only fires when a listing genuinely has
    // no title, for either caller.
    await expect(
      page.getByRole('heading', { level: 1, name: AUTHED_TITLE }),
    ).toBeVisible({ timeout: 15_000 });

    // The anon-only "Sign in" header control (present in T11) must be GONE
    // for an authed session — src/components/layout/AppLayout.tsx:445-455
    // only renders it when `!user`. This is the anon/authed CONTRAST this
    // test exists to prove.
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);

    // The anon photo-lock SignInGateCard (asserted present in T11) must also
    // be GONE for an authed session — ListingGallery.tsx only renders it
    // when `isAnonymous`. Same anon/authed contrast, second surface, and a
    // genuine one: an authed caller's `images[]` is the real 2-item array
    // (not anon's synthesized 1-item fallback), so `hasMoreLocked` is false.
    await expect(
      page.getByRole('link', { name: 'Sign in to view all photos' }),
    ).toHaveCount(0);

    // Real content present regardless of auth (ListingDetailSidebar.tsx:76-98
    // — `localityInsights` is derived purely from areaKey, not gated on
    // `user`) — an additional independent anchor per this slice's brief,
    // using the exact selector specified there rather than a new testid.
    await expect(
      page.getByRole('link', { name: 'View trends in this area' }),
    ).toBeVisible({ timeout: 10_000 });

    // NOTE: this test deliberately does NOT assert the contact-phone section
    // is visible with the seeded phone number — see module docstring finding
    // 2. Live verification proved backend ListingResponse.java never
    // serializes contact_phone to ANY caller (authed or not), so the section
    // is dead code end-to-end today regardless of seed data. Asserting
    // visibility here would be a permanently-failing test masking a real,
    // separate backend gap that this slice's scope lock (backend/** off
    // limits) cannot fix. Flagged loudly in this slice's final report as a
    // recommended backend follow-up instead.
  });
});
