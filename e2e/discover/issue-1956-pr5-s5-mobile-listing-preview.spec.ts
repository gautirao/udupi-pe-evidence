/**
 * Issue #1956 PR-5 (Slice 5, AC5.10) — MobileListingPreviewSheet, the mobile
 * Map-mode listing preview sheet. This surface was explicitly OUT OF SCOPE
 * for `issue-1956-pr5-mobile-list-first.spec.ts` (see that file's own module
 * doc) and had never been exercised end-to-end before this pass — this spec
 * closes that gap against the real, newly-seeded fixture backend
 * (`scripts/dev/seed-navigation-hierarchy-fixture.sh`).
 *
 * ── ENTRY-PATH SUBSTITUTION (mirrors the established, disclosed precedent
 * in `issue-1956-pr4-listing-peek-camera-restore.spec.ts`) ──
 * A genuine marker TAP was attempted first. It reproduces the SAME
 * pre-existing, out-of-scope defect that PR-4's spec already documented
 * in detail: `PropertyMap.tsx` never calls `map.invalidateSize()` after a
 * camera fit, so the Leaflet marker's real DOM position lands outside its
 * own map container's clipped viewport. Confirmed live at a TRUE 390x844
 * mobile viewport for this exact fixture (`a:IN|KA|Bengaluru|RR Nagar`,
 * single-listing AREA leaf): the rendered `property-marker`'s
 * `boundingBox()` was `{x: -79, y: 1342, width: 92, height: 34}` — negative
 * x and a y far below the 844px viewport height, i.e. genuinely
 * un-clickable at real screen coordinates (a synthetic mouse event at that
 * point cannot hit-test anything; `document.elementFromPoint` returns null
 * outside the viewport). This is NOT a PR-5 regression and PropertyMap.tsx
 * is explicitly out of scope here, identical to PR-4's own disclosure.
 *
 * Per that established precedent, this spec instead opens the peek via a
 * DEEP-LINK straight to the AREA leaf with `listing=<uuid>` already in the
 * URL — the SAME URL-hydration path a real marker tap would also drive
 * (MapDiscovery.tsx's URL-hydration effect / `useDiscoverUrlState`), so the
 * sheet-stacking, camera/filter/count-parity, View details, and Back/Close
 * assertions below are proven against the real rendered sheet, not a mock.
 * Only the ENTRY mechanism (marker tap vs deep-link) is substituted; the
 * behaviour under test — sheet stacking, parity, and navigation — is
 * unchanged and not weakened by this substitution. This paragraph is the
 * required self-describing record of that substitution, per this PR's own
 * established disclosure convention.
 *
 * OQ6 ruling (governing this spec's Back-after-View-details assertion): the
 * `listing=` peek is deliberately URL-backed and PUSHes (mirrors #1939's
 * pre-existing marker-click contract, reused unchanged here — never a new
 * mechanism). So browser Back from the full listing detail page SHOULD
 * reopen the preview sheet — that is INTENDED behaviour (the existing
 * hydration path fires again), not a bug, and is asserted as a pass
 * condition below, never treated as a defect.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     e2e/discover/issue-1956-pr5-s5-mobile-listing-preview.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';
import { assertReachable } from '../support/reachability';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const RR_NAGAR_LISTING_ID = 'f1956005-0000-0000-0000-000000000001';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

type Camera = { lat: string | null; lon: string | null; zoom: string | null };

function readCamera(page: Page): Camera {
  const u = new URL(page.url());
  return {
    lat: u.searchParams.get('lat'),
    lon: u.searchParams.get('lon'),
    zoom: u.searchParams.get('zoom'),
  };
}

function currentNodeParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('node');
}

function currentListingParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('listing');
}

async function dismissConsentBannerIfPresent(page: Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

/**
 * ENTRY-PATH SUBSTITUTION (see module doc) — deep-links to the AREA leaf with
 * `listing=<uuid>` already present (List mode — `mobileView` is local
 * component state, NOT URL-driven, so it cannot be deep-linked directly),
 * then drives the SAME `control-bar-map-trigger` click every other spec in
 * this PR uses to enter Map mode. `selectedListingPreview` (lifted via
 * `AreaLeafListingsSurface`'s `onSelectedListingPreviewChange`) is derived
 * from `nav.selectedListing` independently of List/Map mode, so it is
 * already populated by the time the Map-mode click fires — the sheet then
 * mounts immediately, via the SAME URL-hydration data a real marker tap
 * would also produce, without needing the broken marker DOM position at
 * all.
 */
async function gotoAreaLeafMapModeWithListingOpen(page: Page, listingId: string): Promise<void> {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_RR_NAGAR)}&listing=${listingId}`);
  await page.waitForLoadState('domcontentloaded');
  await dismissConsentBannerIfPresent(page);
  await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });

  const mapTrigger = page.getByTestId('control-bar-map-trigger');
  await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
  await mapTrigger.click();
  await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
}

test.describe('@integration-ui #1956 PR-5 — MobileListingPreviewSheet real hit-test proof at 390x844 (AC5.10)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('the preview sheet opens WITHOUT switching to List mode, and is genuinely ON TOP of the map overlay (hit-tested)', async ({
    page,
  }) => {
    await gotoAreaLeafMapModeWithListingOpen(page, RR_NAGAR_LISTING_ID);

    // Still in Map mode — the List-mode close button is the mobile map
    // overlay's own marker (mobile-map-close-list-button only renders while
    // mobileMapOpen is true), proving the peek did NOT force a mode switch.
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });

    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    const box = await sheet.boundingBox();
    expect(box, 'sheet has a layout box').not.toBeNull();
    const centreX = box!.x + box!.width / 2;
    const centreY = box!.y + box!.height / 2;
    const isHit = await sheet.evaluate((el, [cx, cy]) => {
      const atPoint = document.elementFromPoint(cx as number, cy as number);
      return atPoint != null && (atPoint === el || el.contains(atPoint));
    }, [centreX, centreY] as const);
    expect(isHit, 'elementFromPoint at the sheet centre resolves to the sheet or a descendant').toBe(true);

    // Phase 7A regression guard (MapDiscovery.tsx:2216,
    // `isMarkerPopoverEligible && !mobileMapOpen`) — the pre-existing legacy
    // MarkerPopoverCard has no mobile guard of its own, so before this fix
    // BOTH surfaces rendered simultaneously for the same `listing=`
    // selection. Our earlier hit-test only proved the new sheet was ON TOP
    // of *something*; it never proved that something wasn't a second,
    // still-live popover underneath. Asserted explicitly here, not implied.
    await expect(
      page.getByTestId('marker-popover-card'),
      'REGRESSION GUARD (Phase 7A): the legacy MarkerPopoverCard must NOT also render in mobile Map mode',
    ).toHaveCount(0);

    expect(currentListingParam(page)).toBe(RR_NAGAR_LISTING_ID);
    expect(currentNodeParam(page)).toBe(AREA_RR_NAGAR);
  });

  test('"Close" is reachable (no {force:true}) and returns to the SAME Map state — camera/node/Map-mode unchanged, listing= cleared', async ({
    page,
  }) => {
    await gotoAreaLeafMapModeWithListingOpen(page, RR_NAGAR_LISTING_ID);
    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    const cameraBefore = readCamera(page);
    const nodeBefore = currentNodeParam(page);
    const urlBeforeMinusListing = new URL(page.url());
    urlBeforeMinusListing.searchParams.delete('listing');

    const closeButton = page.getByTestId('mobile-listing-preview-close');
    await assertReachable(page, closeButton);
    await closeButton.click();

    await expect(sheet).toHaveCount(0);
    await expect.poll(() => currentListingParam(page)).toBeNull();

    // Map-mode is unchanged (the close button routes through
    // clearSelectedListing() only — no mode/camera/node side effect).
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 5_000 });
    expect(currentNodeParam(page), 'AC5.10: node= must be unchanged after Close').toBe(nodeBefore);
    expect(readCamera(page), 'AC5.10: camera must be unchanged after Close').toEqual(cameraBefore);

    const urlAfter = new URL(page.url());
    expect(urlAfter.searchParams.toString()).toBe(urlBeforeMinusListing.searchParams.toString());
  });

  test('Escape closes ONLY the preview sheet — the mobile Map overlay stays open (code-review fix regression guard)', async ({
    page,
  }) => {
    // This is the one behaviour a jsdom test cannot prove: whether the
    // sheet's own keydown handler's stopPropagation() actually stops the
    // REAL native Escape keydown event before it reaches
    // useMobileMapOverlayShell's document-level listener (which would
    // otherwise call onClose() and drop mobileView back to LIST, closing the
    // whole overlay instead of just the sheet). Only a real browser's native
    // event-propagation semantics settle this.
    await gotoAreaLeafMapModeWithListingOpen(page, RR_NAGAR_LISTING_ID);
    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Focus a real element inside the sheet before pressing Escape, so the
    // key event's real target/bubble path starts INSIDE the sheet's own DOM
    // subtree — the same path a real user's keypress would take while
    // interacting with the sheet.
    const closeButton = page.getByTestId('mobile-listing-preview-close');
    await closeButton.focus();
    await page.keyboard.press('Escape');

    // Half 1 — the sheet itself is gone.
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => currentListingParam(page)).toBeNull();

    // Half 2 (THE regression guard) — the mobile Map overlay is STILL open.
    // Before this fix, the native Escape event would have bubbled past the
    // sheet to document, firing useMobileMapOverlayShell's onClose() and
    // dropping mobileView back to 'LIST' — the user would have been kicked
    // off the map entirely instead of just losing the peek.
    await expect(
      page.getByTestId('mobile-map-close-list-button'),
      'REGRESSION GUARD: the mobile Map overlay must remain open after Escape closes only the sheet',
    ).toBeVisible({ timeout: 5_000 });

    // Confirm Close still works unforced afterwards (the fix did not disturb
    // the pointer-driven close path).
    await gotoAreaLeafMapModeWithListingOpen(page, RR_NAGAR_LISTING_ID);
    const sheet2 = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet2).toBeVisible({ timeout: 10_000 });
    const closeButton2 = page.getByTestId('mobile-listing-preview-close');
    await assertReachable(page, closeButton2);
    await closeButton2.click();
    await expect(sheet2).toHaveCount(0);
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 5_000 });
  });

  test('"View details" opens the EXISTING full listing detail, and browser Back reopens the preview (OQ6 — intended, not a bug)', async ({
    page,
  }) => {
    await gotoAreaLeafMapModeWithListingOpen(page, RR_NAGAR_LISTING_ID);
    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    const cameraBefore = readCamera(page);
    const nodeBefore = currentNodeParam(page);
    const countBefore = await page.getByTestId('listing-card').count();

    const viewDetails = page.getByTestId('mobile-listing-preview-view-details');
    await assertReachable(page, viewDetails);
    await viewDetails.click();

    await page.waitForURL(new RegExp(`/listing/${RR_NAGAR_LISTING_ID}`), { timeout: 15_000 });

    // OQ6 — Back reopens the preview (the SAME URL-hydration path fires
    // again on the restored `listing=` param). This is the ruling's
    // INTENDED behaviour, asserted as a pass condition, never a defect. Uses
    // a REAL `page.goBack()` (a genuine browser history navigation), not a
    // browser-automation tool's approximation of one — Phase 7A's own
    // secondary finding (Back sometimes lands in List mode) was explicitly
    // flagged low-confidence because that tool's back action may not be
    // equivalent to a real back gesture. This is the correct instrument to
    // settle which is right.
    await page.goBack();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => currentListingParam(page)).toBe(RR_NAGAR_LISTING_ID);

    // Phase 7A regression guard, re-checked specifically on the Back path
    // (not just the initial-open path above): confirms Back does not
    // resurrect the legacy MarkerPopoverCard alongside the reopened sheet.
    await expect(
      page.getByTestId('marker-popover-card'),
      'REGRESSION GUARD (Phase 7A): MarkerPopoverCard must NOT reappear after Back reopens the sheet',
    ).toHaveCount(0);

    // Explicit, positive proof against Phase 7A's low-confidence secondary
    // finding: Back must reopen MAP mode (never drop to List) — the SAME
    // assertion the sequence below already re-derives via
    // mobile-map-close-list-button, made explicit here as its own named
    // check since this is precisely the disputed claim.
    await expect(
      page.getByTestId('mobile-map-close-list-button'),
      'Back must restore Map mode, not silently land in List mode (Phase 7A low-confidence finding)',
    ).toBeVisible({ timeout: 5_000 });

    // Camera/node/filters/result-count/Map-mode are ALL unchanged across the
    // whole sequence — marker tap (substituted, see module doc) -> View
    // details -> Back.
    expect(currentNodeParam(page), 'node= must be unchanged across the whole sequence').toBe(nodeBefore);
    expect(readCamera(page), 'camera must be unchanged across the whole sequence').toEqual(cameraBefore);
    await expect(page.getByTestId('mobile-map-close-list-button'), 'Map mode must be unchanged').toBeVisible({
      timeout: 5_000,
    });
    const countAfter = await page.getByTestId('listing-card').count();
    expect(countAfter, 'result count must be unchanged across the whole sequence').toBe(countBefore);
  });
});
