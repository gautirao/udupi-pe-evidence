/**
 * Map marker interaction — T19/T20 (issue #1713, PR-5).
 *
 * CONSOLIDATES:
 *   - e2e/discover/issue-2139-coincident-marker-overlap.spec.ts — that spec only
 *     asserted the two coincident markers land at DISTINCT pixel positions. T19
 *     below proves the stronger, product-relevant claim: both fanned markers are
 *     actually REACHABLE (clickable, and browsable via the stepper) even though
 *     their 92px-wide pills still visually overlap far more than the ~26px fan
 *     separates them (COINCIDENT_OFFSET_RADIUS_METERS=30 at zoom 16 predicts a
 *     ~26px centre offset — src/shared/map/zoomPolicy.ts:591-635,
 *     `computeCoincidentMarkerOffsets`, keyed on `toFixed(5)`). Because the pills
 *     overlap, the stepper (marker-popover-card's popover-stepper-*) — not
 *     per-marker clicking of the SECOND marker — is the real reachability
 *     mechanism the product ships; an unforced click on the underneath marker
 *     is structurally impossible here (subtree intercepts pointer events) and
 *     this file deliberately does not attempt one.
 *   - e2e/discover/issue-2129-* (mobile bottom-sheet occlusion) — T20 below
 *     replaces it with a measured (not fixed-pixel-assumed) proof that the
 *     usable map viewport always shrinks by the SHEET'S REAL ResizeObserver
 *     height, never the 150px fallback constant, and that the selected marker
 *     re-fits inside that shrunken viewport (the #2129 fix).
 *
 * DOES NOT CONSOLIDATE issue-2150 (cluster tap / spiderfy): live-verified
 * (multiple nodes, including attempted zoom overrides) that this fixture's
 * camera always settles at zoom=16, which equals CLUSTER_DISABLE_AT_ZOOM — no
 * cluster bubble can ever form against this fixture, so there is nothing for a
 * spiderfy-on-tap spec to exercise here. That coverage stays where it is.
 *
 * WHY THE MARKERS ARE COINCIDENT AT ALL: not coincident source rows. The
 * backend deliberately coarsens public coordinates to 2 decimal places
 * (GeoCoarsener.java, PUBLIC_COORD_DECIMALS=2 — issue #1726, a security
 * control so an exact pin never leaves the server). Two fixture listings in
 * two different areas both round to (13.03, 77.76) and therefore arrive at
 * the map bit-identical, which is what triggers the offset-fan logic.
 *
 * `nodeListings=1` is REQUIRED on every URL below — without it zero listing
 * markers render at all (live-verified), which would make every assertion in
 * this file pass vacuously against an empty map if it were omitted.
 *
 * Every geometry/stepper testid used below is load-bearing to a MEASUREMENT
 * (pixel offset, occlusion height, hit-test target) that a text assertion
 * could not express — each is justified inline at its point of use.
 */

import { test, expect } from './support/canonical-test';

const CITY = 'bangalore';

// ─────────────────────────────────────────────────────────────────────────
// T19 fixture identifiers (navigation-hierarchy-fixture-listings-seed.sql)
// ─────────────────────────────────────────────────────────────────────────
const COINCIDENT_NODE = 'c:northeast:hoskote-kannamangala-whitefield-hoskote-road';
const HOSKOTE_ID = 'f1956005-0000-0000-0000-000000000004'; // rendered ON TOP
const KANNAMANGALA_ID = 'f1956005-0000-0000-0000-000000000005'; // rendered UNDERNEATH
const HOSKOTE_TITLE = '[E2E] Hoskote Fixture House';
const KANNAMANGALA_TITLE = '[E2E] Kannamangala Whitefield Hoskote Road Fixture Apartment';

function markerLocator(page: import('./support/canonical-test').Page, listingId: string) {
  // data-listing-id is on the outer wrapper; data-testid="property-marker" is
  // on the inner pill — this compound selector is what the app itself uses
  // to key coincident-offset computation (zoomPolicy.ts), so it is the
  // correct handle for a per-listing marker, not a generic `.leaflet-marker`.
  return page.locator(`[data-listing-id="${listingId}"] [data-testid="property-marker"]`);
}

test.describe('T19 — coincident markers fan apart and both remain reachable via the stepper', () => {
  test('unforced click + stepper next/prev reach BOTH coincident fixture listings', async ({ page }) => {
    // Anon path — NOT the authenticated /api/discover/listings endpoint.
    // Live-verified real anon call on this exact page:
    //   GET /api/discover/cities/bangalore/listings?areaKeys=...&limitPerArea=20&listingPurpose=sale
    // The predicate below is unambiguous against this page's other sibling
    // calls (/navigation/resolve?node=..., /navigation/<node>/counts?purpose=sale),
    // neither of which contains "/listings".
    const resolvePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/discover/cities/') &&
        resp.url().includes('/listings') &&
        resp.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await page.goto(
      `/discover?city=${CITY}&node=${encodeURIComponent(COINCIDENT_NODE)}&nodeListings=1`,
    );
    const listingsResponse = await resolvePromise;
    expect(listingsResponse.ok(), 'anon node-scoped /api/discover/cities/{city}/listings must respond 2xx').toBe(true);

    const topMarker = markerLocator(page, HOSKOTE_ID);
    const underMarker = markerLocator(page, KANNAMANGALA_ID);

    // POSITIVE CONTROL FIRST: both markers must be present/visible. A
    // CORS-blocked, unauthenticated-401'd, or otherwise empty map fails right
    // here, before any geometry/interaction assertion below has a chance to
    // pass vacuously against nothing.
    await expect(topMarker).toBeVisible({ timeout: 15_000 });
    await expect(underMarker).toBeVisible({ timeout: 15_000 });

    // Structural wait for the real camera settle, not a fixed sleep: the
    // fan geometry below is only meaningful once CameraIntent has actually
    // driven the map to zoom=16 (live-verified settle point for this node —
    // toHaveURL polls until it matches or times out, it does not sleep).
    await expect(page).toHaveURL(/[?&]zoom=16(&|$)/, { timeout: 20_000 });

    // FAN GEOMETRY. Live-verified centre separation is dx=26px, dy=0px at
    // zoom 16 (COINCIDENT_OFFSET_RADIUS_METERS=30 / ~2.32 m/px). We do not
    // pin 26 exactly (subpixel/layout drift across runs), but a band that a
    // dx=0 regression (offset logic broken, both markers rendering at the
    // identical coarsened coordinate) would fail is non-vacuous: identical
    // source coordinates with no fan would put both boxes at literally the
    // same x.
    const topBox = await topMarker.boundingBox();
    const underBox = await underMarker.boundingBox();
    if (!topBox || !underBox) {
      throw new Error('T19: expected both coincident marker bounding boxes to be resolvable once visible.');
    }
    const topCentreX = topBox.x + topBox.width / 2;
    const topCentreY = topBox.y + topBox.height / 2;
    const underCentreX = underBox.x + underBox.width / 2;
    const underCentreY = underBox.y + underBox.height / 2;
    const dx = Math.abs(topCentreX - underCentreX);
    const dy = Math.abs(topCentreY - underCentreY);

    expect(dy, 'coincident-offset fan is horizontal only at this zoom — dy should be ~0').toBeLessThan(3);
    expect(dx, 'dx=0 would mean the offset-fan logic regressed back to literally identical coordinates').toBeGreaterThan(10);
    expect(dx, 'a runaway fan would no longer be the ~26px COINCIDENT_OFFSET_RADIUS_METERS-derived offset').toBeLessThan(60);

    // CRITICAL INTERACTION FACT: only the TOP marker (...0004) is reachable
    // by an UNFORCED click — the 92px-wide pills overlap far more than the
    // 26px fan, so an unforced click on the underneath marker fails a real
    // hit-test ("subtree intercepts pointer events"). No force:true is used
    // anywhere in this file; the unforced click below IS the hit-test proof
    // that the top marker (and only the top marker) is directly clickable.
    await topMarker.click();

    const popover = page.getByTestId('marker-popover-card');
    const stepperLabel = page.getByTestId('popover-stepper-label');
    const stepperPrev = page.getByTestId('popover-stepper-prev');
    const stepperNext = page.getByTestId('popover-stepper-next');

    // STATE 1 — Hoskote (...0004), 1/2.
    //
    // NOTE on why property type ("House"/"Apartment") is deliberately NOT
    // asserted here: both fixture titles end in their own property-type word
    // ("...Fixture House", "...Fixture Apartment"), so a `toContainText`
    // substring check against the type word cannot distinguish the type chip
    // from the title itself — it would pass even if the type chip vanished
    // entirely, as long as the title (which always contains the word) is
    // still present. The card's `aria-label` carries the EXACT title text
    // and nothing else, so it is the unambiguous discriminating signal used
    // below instead. Do not "restore" a type substring assertion here — this
    // is intentional, not an oversight.
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(stepperLabel).toHaveText('1/2');
    await expect(popover).toContainText(HOSKOTE_TITLE);
    await expect(popover).toHaveAttribute('aria-label', HOSKOTE_TITLE);
    await expect(stepperPrev).toBeDisabled();
    await expect(stepperNext).toBeEnabled();
    expect(new URL(page.url()).searchParams.get('listing')).toBe(HOSKOTE_ID);
    // The selection highlight itself must be on the marker the popover is
    // currently describing — a text-only assertion could not express which
    // DOM marker element carries the `--selected` modifier.
    await expect(page.locator('.property-marker--selected')).toHaveAttribute('data-listing-id', HOSKOTE_ID);

    // NEXT -> STATE 2 — Kannamangala Whitefield Hoskote Road (...0005), 2/2.
    // Content must genuinely SWAP: assert presence of the new listing's
    // identity AND absence of the previous listing's identity (absence
    // discipline) — a stale/duplicated card render would pass a
    // presence-only check.
    await stepperNext.click();
    await expect(stepperLabel).toHaveText('2/2');
    await expect(popover).toContainText(KANNAMANGALA_TITLE);
    await expect(popover).toHaveAttribute('aria-label', KANNAMANGALA_TITLE);
    // Unambiguous absence half: the two fixture titles are entirely
    // distinct strings, so this genuinely discriminates a stale/duplicated
    // card render from a real swap (unlike a bare type-word substring, see
    // the STATE 1 comment above).
    await expect(popover).not.toContainText(HOSKOTE_TITLE);
    await expect(popover).not.toHaveAttribute('aria-label', HOSKOTE_TITLE);
    await expect(stepperNext).toBeDisabled();
    await expect(stepperPrev).toBeEnabled();
    expect(new URL(page.url()).searchParams.get('listing')).toBe(KANNAMANGALA_ID);
    await expect(page.locator('.property-marker--selected')).toHaveAttribute('data-listing-id', KANNAMANGALA_ID);

    // PREV -> back to STATE 1.
    await stepperPrev.click();
    await expect(stepperLabel).toHaveText('1/2');
    await expect(popover).toContainText(HOSKOTE_TITLE);
    await expect(popover).toHaveAttribute('aria-label', HOSKOTE_TITLE);
    // Mirrors the NEXT transition's absence half: the reverse direction has
    // its own stepper wiring, so a bug specific to PREV (e.g. it moves the
    // stepper label back but leaves stale Kannamangala content mounted)
    // would not be caught by only re-asserting Hoskote's presence above.
    await expect(popover).not.toContainText(KANNAMANGALA_TITLE);
    await expect(popover).not.toHaveAttribute('aria-label', KANNAMANGALA_TITLE);
    await expect(stepperPrev).toBeDisabled();
    await expect(stepperNext).toBeEnabled();
    expect(new URL(page.url()).searchParams.get('listing')).toBe(HOSKOTE_ID);

    // This proves BOTH coincident listings are reachable from a single
    // unforced click plus the stepper — a strictly stronger claim than
    // issue-2139-coincident-marker-overlap.spec.ts, which only asserted the
    // two markers land at distinct pixel positions and never proved either
    // one, let alone both, was actually clickable/browsable.
  });
});

// ─────────────────────────────────────────────────────────────────────────
// T20 — mobile preview sheet never occludes the usable map viewport
// ─────────────────────────────────────────────────────────────────────────
const HOSKOTE_AREA_NODE = 'a:IN|KA|Bengaluru|Hoskote';

test.describe('T20 — mobile listing preview sheet never occludes the usable map viewport', () => {
  // Verified precedent for overriding viewport inside the Desktop-Chrome
  // canonical project: e2e/discover/issue-2150-cluster-tap-spiderfy-regression.spec.ts:558.
  // playwright.canonical.config.ts itself is NOT edited by this file.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('bottom sheet reserves exactly its own measured height, never the 150px fallback, and the selected marker stays reachable', async ({ page }) => {
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(HOSKOTE_AREA_NODE)}&nodeListings=1`);

    // Mobile Discover starts in list mode; enter map mode explicitly.
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();

    const marker = markerLocator(page, HOSKOTE_ID);
    const allMarkers = page.getByTestId('property-marker');
    const viewport = page.getByTestId('discover-map-usable-viewport');
    const sheet = page.getByTestId('mobile-listing-preview-sheet');

    // POSITIVE CONTROLS FIRST. Exactly one real fixture marker — this area's
    // centre matches its own listing (unlike RR Nagar's fixture, whose
    // centre is ~2.2km from its listings and renders off-screen), so this is
    // a genuine visible-marker case, not a coincidence-of-emptiness one.
    await expect(marker).toBeVisible({ timeout: 15_000 });
    await expect(allMarkers).toHaveCount(1);

    // BEFORE tap: no premature shrink. This is the baseline the later
    // structural convergence wait proves a real transition away from.
    await expect(viewport).toHaveAttribute('data-bottom-occlusion-px', '0');

    // Unforced tap opens the sheet with the REAL fixture title — this
    // positive control is what stops the later hit-test NEGATIVE assertion
    // from passing vacuously against a map with nothing to occlude.
    await marker.click();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet).toContainText(HOSKOTE_TITLE);

    // STRUCTURAL CONVERGENCE WAIT — no fixed timeout. Poll until the
    // viewport's reported occlusion equals the sheet's OWN live
    // boundingBox().height (the real ResizeObserver measurement), not an
    // assumed constant. This is the measured-not-assumed proof that the
    // occlusion tracks the sheet's actual rendered size.
    await expect.poll(
      async () => {
        const occlusionAttr = await viewport.getAttribute('data-bottom-occlusion-px');
        const sheetBox = await sheet.boundingBox();
        if (occlusionAttr === null || !sheetBox) return Number.POSITIVE_INFINITY;
        return Math.abs(Number(occlusionAttr) - sheetBox.height);
      },
      { timeout: 10_000, message: 'data-bottom-occlusion-px never converged to the sheet\'s real measured height' },
    ).toBeLessThan(3);

    const occlusionPx = Number(await viewport.getAttribute('data-bottom-occlusion-px'));
    const wrapperBox = await viewport.boundingBox();
    const sheetBox = await sheet.boundingBox();
    if (!wrapperBox || !sheetBox) {
      throw new Error('T20: expected both the usable-viewport wrapper and the sheet to have resolvable boxes.');
    }

    // Occlusion is real (> 0) and is NOT the 150px fallback constant — the
    // live-verified real height for this fixture is 210px, well outside a
    // 3px tolerance band around 150, so this discriminates a regression back
    // to the hardcoded fallback from the real measured value.
    expect(occlusionPx).toBeGreaterThan(0);
    expect(Math.abs(occlusionPx - 150), 'occlusion must be the real measured sheet height, not the 150px fallback constant').toBeGreaterThan(3);

    // DEGENERATE-BOX GUARD: without this, two collapsed near-zero-height
    // boxes could satisfy both the no-gap and no-overlap inequalities below
    // vacuously (any two points are trivially "adjacent"). Pinning a
    // non-trivial minimum height on the sheet makes the geometry pair below
    // a real measurement, not an accident of both boxes being empty.
    expect(sheetBox.height).toBeGreaterThan(20);

    const TOL = 3;
    // NO GAP: the sheet must start at (or before) where the usable viewport ends.
    expect(sheetBox.y).toBeLessThanOrEqual(wrapperBox.y + wrapperBox.height + TOL);
    // NO OVERLAP: the usable viewport must not extend past where the sheet starts.
    expect(wrapperBox.y + wrapperBox.height).toBeLessThanOrEqual(sheetBox.y + TOL);

    // The map's own clipping context must actually be hidden — otherwise a
    // marker could bleed under the sheet visually even if geometry above
    // looks correct.
    const leafletOverflow = await page.locator('.leaflet-container').first().evaluate(
      (el) => getComputedStyle(el).overflow,
    );
    expect(leafletOverflow).toBe('hidden');

    // PRECONDITION, confirmed IMMEDIATELY BEFORE the probe loop (not just
    // retroactively via markerBoxAfter further down): the probe's negative
    // claim ("nothing here resolves to a property-marker") is only
    // meaningful if a real, still-mounted marker exists to have been hit. If
    // a regression unmounted the marker when the sheet opened, the loop
    // below would pass for the wrong reason — vacuously, against nothing.
    // This synchronous check makes that positive control literally true at
    // the point of use, and its resolved box is reused (not recomputed) for
    // the containment assertion after the loop.
    await expect(marker).toBeVisible();
    const markerBoxAfter = await marker.boundingBox();
    if (!markerBoxAfter) {
      throw new Error('T20: expected the selected marker to still have a resolvable bounding box after the sheet opened.');
    }

    // HIT-TEST PROBE: sample multiple x-positions inside the reserved bottom
    // band and assert none of them resolves (via document.elementFromPoint)
    // to a property-marker — i.e. the sheet, not a stale marker underneath
    // it, owns pointer events there. Paired with the positive marker/title
    // controls above, this cannot pass vacuously on a zero-marker map: if
    // there were no marker at all, "never resolves to a marker" would be
    // true for a trivial reason instead of a real occlusion proof.
    const sampleXs = [
      wrapperBox.x + wrapperBox.width * 0.15,
      wrapperBox.x + wrapperBox.width * 0.5,
      wrapperBox.x + wrapperBox.width * 0.85,
    ];
    const probeY = sheetBox.y + sheetBox.height / 2;
    for (const x of sampleXs) {
      const hitsMarker = await page.evaluate(
        ([px, py]) => {
          const el = document.elementFromPoint(px, py);
          return !!el?.closest('[data-testid="property-marker"]');
        },
        [x, probeY] as [number, number],
      );
      expect(hitsMarker, `elementFromPoint(${x}, ${probeY}) must not resolve to a property-marker once the sheet is open`).toBe(false);
    }

    // The selected marker must have re-fit INSIDE the shrunken usable
    // viewport rectangle (the #2129 fix) rather than being left stranded
    // under the sheet. We do not pin the live-verified 311 centre-y exactly
    // (that value is a consequence of this run's exact 210px sheet height);
    // instead we assert the PROPERTY: the marker's box lies fully within the
    // wrapper's rectangle. Pre-fix, the marker would have been left at its
    // original position, underneath (outside) this shrunken box.
    expect(markerBoxAfter.y).toBeGreaterThanOrEqual(wrapperBox.y - TOL);
    expect(markerBoxAfter.y + markerBoxAfter.height).toBeLessThanOrEqual(wrapperBox.y + wrapperBox.height + TOL);
  });
});
