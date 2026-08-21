/**
 * Canonical E2E harness smoke spec (issue #1713, PR-1).
 *
 * PURPOSE: prove the canonical harness itself works end-to-end — this is
 * deliberately NOT one of the 9 planned canonical specs (T1-T18) covering
 * real product journeys; those belong to PR-2..PR-5 (see this issue's
 * deliverable_11 PR slicing). Writing a second spec in this slice is an
 * explicit forbidden_change per the approved execution handoff.
 *
 * SURFACE CHOSEN: GET /listing/:id (anon, outside <ProtectedRoute> — see
 * src/App.tsx), backed by GET /api/public/listings/:id
 * (backend/src/main/java/com/example/realestate/listing/api/PublicListingController.java,
 * whose own class docstring states: "Public (unauthenticated) listing
 * endpoints. These paths are explicitly permitted in JwtConfig — no JWT is
 * required. CRITICAL: Only LIVE listings are exposed."). This is a genuinely
 * public path end to end — no anon/auth-only ambiguity the way
 * /api/discover/listings and /api/discover/markers have (those are AUTH-ONLY
 * and render an EMPTY UI for an anonymous request rather than erroring,
 * which would let a "no results shown" assertion pass against a broken app;
 * see this issue's execution handoff D5 for that trap). /api/listings/markers
 * (the public discover-adjacent marker endpoint) was the other candidate
 * considered, but the listing-detail route gives a single, stable, real
 * content string to assert on on a page with far less surface area than
 * the full Discover map canvas — better suited to a HARNESS smoke test.
 *
 * FIXTURE STRING VERIFICATION — CORRECTED (see below): the fixture listing
 * id and its DB-seeded values below are read verbatim from
 * scripts/db/fixtures/discover-smoke-seed.sql (section 5, "Manipal
 * listings"), which scripts/dev/local-fixture-backend.sh loads into the
 * local Postgres/PostGIS fixture via restore-test-fixture.sh before the
 * backend starts. That seed file's own validation block (section 6) asserts
 * at load time that at least 12 LIVE [E2E] listings exist including this
 * one — so if this listing is ever renamed, removed, or the fixture pipeline
 * changes shape, the SEED LOAD ITSELF fails loudly before this spec would
 * ever get a chance to run against stale data.
 *
 *   id:            e2e00001-0000-0000-0000-000000000001
 *   DB title:      [E2E] 1 Lakh Manipal Apartment   (NOT asserted here — see below)
 *   propertyType:  apartment
 *   locality:      Manipal
 *   price_paise:   10000000  (₹1,00,000 → PriceBand.of() bucket "₹0–25L")
 *
 * IMPORTANT — anon responses withhold the DB title (verified live, not just
 * read from source): GET /api/public/listings/{id} branches on caller auth
 * (PublicListingController.getById:98-111). An ANONYMOUS caller (this spec
 * never authenticates) receives ListingTeaserResponse, not ListingResponse —
 * confirmed by curl: {"id":...,"imageCount":0,"priceBand":"₹0–25L",
 * "propertyType":"apartment","locality":"Manipal","listingPurpose":"sale"}.
 * There is no `title` key at all; ListingResponseMapper.toTeaserResponse's
 * own doc comment states this is deliberate ("no location, no PII" — #1941
 * additionally withholds exact price for every anon teaser caller). The
 * frontend (ListingDetailMainContent.tsx:70) synthesizes the on-page heading
 * client-side as `${propertyTypeLabel} in ${locality}` whenever
 * `listing.title` is absent — for this listing that is exactly
 * "Apartment in Manipal", never the raw DB title. An earlier version of this
 * spec asserted the raw DB title and failed deterministically 3/3 against a
 * correctly-working app — a real test-authoring defect the harness itself
 * caught (checking the seed SQL and the render site is not enough; the DTO
 * in between silently drops the field for anon callers). The raw DB title is
 * NOT kept here as an unused constant — a future authenticated canonical
 * spec (PR-3+) that asserts the full ListingResponse's real `title` field
 * should re-derive it from the seed SQL at that point, not reuse a stale
 * anon-path constant from this file.
 *
 * STRENGTHENED ANCHOR (not just the synthesized heading): "Apartment in
 * Manipal" alone is a weaker anchor than the withheld DB title — it is
 * synthesized from two generic-shaped teaser fields, so this spec ALSO
 * asserts two more independent pieces of real teaser-response content the
 * live run actually observed: the price band ("₹0–25L", computed by
 * PriceBand.of() from this listing's real seeded price_paise) and the
 * locality ("Manipal", rendered verbatim from the teaser's `locality`
 * field next to the MapPin icon in ListingDetailMainContent.tsx). For each
 * of these three assertions: could it pass against an empty, errored, or
 * degraded app? No — ListingDetail.tsx renders a "Listing Not Found" empty
 * state (no h1, no price element, no locality line) whenever the query
 * errors or returns no listing, so all three require the real backend to
 * have actually returned this listing's real seeded values.
 *
 * This spec also carries the D4 build-sha provenance assertion — see
 * vite.config.ts's `build-sha-meta` plugin and this file's second test. The
 * assertion is MANDATORY, not opt-in: canonical-global-setup.ts derives the
 * expected sha once via `git rev-parse HEAD` and publishes it as
 * CANONICAL_EXPECTED_BUILD_SHA (or, only under the explicit
 * CANONICAL_SKIP_SHA_PROVENANCE opt-out, CANONICAL_SHA_PROVENANCE_SKIPPED) —
 * see that file's module docstring. A prior version of this test only
 * asserted equality when the caller remembered to export EXPECTED_BUILD_SHA,
 * which meant an unset var (or a stale/mismatched export) silently passed;
 * that was flagged in PR review and is fixed here.
 */

import { test, expect, waitForFontsReady } from './support/canonical-test';

const FIXTURE_LISTING_ID = 'e2e00001-0000-0000-0000-000000000001';
// Synthesized client-side heading for an ANON teaser response — NOT the raw
// DB title, which anon callers never receive. See module docstring.
const TEASER_HEADING = 'Apartment in Manipal';
const TEASER_PRICE_BAND = '₹0–25L';
const TEASER_LOCALITY = 'Manipal';

test.describe('canonical harness smoke', () => {
  test('renders real fixture listing content from a genuinely public route', async ({ page }) => {
    await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await waitForFontsReady(page);

    // POSITIVE PRESENCE of specific, real fixture content — not a generic
    // "results container exists" check (which would pass against an empty/
    // broken render too). h1 is the semantic heading element in
    // ListingDetailMainContent.tsx (`<h1>{title}</h1>`), so this also proves
    // the page actually reached its loaded state rather than a skeleton.
    await expect(
      page.getByRole('heading', { level: 1, name: TEASER_HEADING }),
    ).toBeVisible({ timeout: 15_000 });

    // Two further, INDEPENDENT real-content anchors (not derived from the
    // heading) — strengthens the positive-presence guarantee beyond the
    // synthesized heading alone. See module docstring's "STRENGTHENED
    // ANCHOR" section for why each is required and why none of the three
    // can pass against an empty/broken render.
    await expect(page.getByText(TEASER_PRICE_BAND, { exact: true })).toBeVisible();

    // "Manipal" alone is AMBIGUOUS on this page — verified live (fix-cycle-2):
    // it also renders in the breadcrumb and in a related-content paragraph
    // elsewhere on the page, so a bare page.getByText('Manipal', {exact:true})
    // resolves to 3 elements and throws a Playwright strict-mode violation.
    // Scope to the specific MapPin/locality row in
    // ListingDetailMainContent.tsx (`<div className="mt-4 flex items-center
    // gap-2 border-t border-border pt-4 text-sm"><MapPin .../><span
    // className="font-medium text-foreground">{listing.locality}</span>...`)
    // — this exact combination of layout classes is unique to that row.
    const localityRow = page.locator(
      'div.flex.items-center.gap-2.border-t.border-border.pt-4.text-sm',
    );
    await expect(localityRow.getByText(TEASER_LOCALITY, { exact: true })).toBeVisible();
  });

  test('build-sha meta tag is present, non-empty, and matches HEAD sha (mandatory, not opt-in)', async ({
    page,
  }) => {
    // F9 fix-cycle-2 root-cause note: this test previously navigated and read
    // the meta tag immediately after `domcontentloaded`, with no wait for the
    // page's own data fetch. The build-sha meta tag itself is static (baked
    // into the served HTML at build time, present before any JS runs), so
    // that omission never broke THIS test's own assertions — but it meant
    // the test could return, and the shared `backendTraffic` fixture's
    // `afterEach` (assertBackendTrafficWasReal) could run, BEFORE the SPA's
    // React Query fetch to /api/public/listings/{id} had even fired: the
    // app's JS bundle still has to download, parse, and mount the
    // ListingDetail component after `domcontentloaded` resolves, and nothing
    // in the old test body waited for that. That is a genuine race,
    // independent of and in addition to any stale-bundle (dead
    // VITE_API_BASE_URL) cause — determined empirically by observing that a
    // rebuild with the correct API base URL baked in still did not make this
    // test reliably green.
    //
    // Fixed deterministically: explicitly wait for the real network response
    // to the listing endpoint before proceeding — no arbitrary
    // page.waitForTimeout(), and no `networkidle` (this repo has a
    // documented 401-then-retry pattern elsewhere that makes networkidle a
    // coin flip, per this harness's own determinism.ts docstring). The
    // waitForResponse promise is created BEFORE navigation so the response
    // cannot fire and be missed in the window between goto() and awaiting it.
    const listingResponse = page.waitForResponse(
      (response) => response.url().includes(`/api/public/listings/${FIXTURE_LISTING_ID}`),
      { timeout: 15_000 },
    );
    await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
    await listingResponse;

    const buildSha = await page.locator('meta[name="build-sha"]').getAttribute('content');

    // A MISSING tag (null) or an EMPTY string must never read as a pass —
    // both fail this assertion.
    expect(buildSha, 'meta[name="build-sha"] must exist with non-empty content').toBeTruthy();

    // Mandatory, derived, opt-OUT-only (see this file's module docstring and
    // canonical-global-setup.ts). Unlike the prior EXPECTED_BUILD_SHA design,
    // this branch always runs unless the operator explicitly opted out —
    // there is no "caller forgot to export it" path that silently passes.
    const skipped = process.env.CANONICAL_SHA_PROVENANCE_SKIPPED === 'true';
    if (skipped) {
      console.warn(
        '[canonical-harness-smoke] build-sha equality assertion SKIPPED via CANONICAL_SKIP_SHA_PROVENANCE. ' +
        'This run does NOT prove the served build matches HEAD.',
      );
    } else {
      const expected = process.env.CANONICAL_EXPECTED_BUILD_SHA;
      if (!expected) {
        // Unreachable in a correctly-launched run: canonical-global-setup.ts
        // always sets exactly one of CANONICAL_EXPECTED_BUILD_SHA or
        // CANONICAL_SHA_PROVENANCE_SKIPPED before any test starts. Fail
        // loudly rather than silently treating a missing var as a pass —
        // that silent-pass shape is the exact defect this fix closes.
        throw new Error(
          '[canonical-harness-smoke] CANONICAL_EXPECTED_BUILD_SHA is unset and CANONICAL_SHA_PROVENANCE_SKIPPED ' +
          'is not "true". canonical-global-setup.ts should have set one of these before any test ran — do not ' +
          'launch this spec through any mechanism that bypasses playwright.canonical.config.ts\'s globalSetup.',
        );
      }
      // Fails against vite.config.ts's "local-dev" unset-fallback, an empty
      // tag, and any stale/mismatched sha — proving the served build really
      // is the code under review, unconditionally.
      expect(buildSha, `meta[name="build-sha"] must equal HEAD sha "${expected}"`).toBe(expected);
    }
  });
});
