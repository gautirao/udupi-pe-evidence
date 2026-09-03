/**
 * E2E: Issue #2015 — Airbnb-style "Search this area" VIEWPORT result scope.
 *
 * Exercises the real cross-layer flow on top of the #2016 canonical
 * ResultScope contract (AREA_SET | POLYGON | VIEWPORT, exactly one active):
 *
 *   1. Desktop flow (AC1/AC2/AC6/AC7):
 *      pan the map past the dirty tolerance → CTA appears with NO auto-fetch
 *      → activate CTA → exactly one refetch scoped to the viewport →
 *      Active-scope chip appears with "Return to previous area" →
 *      clicking it restores the prior AREA_SET scope and removes the chip.
 *   2. History semantics (AC7):
 *      VIEWPORT activation uses `replace` (no extra back-button entry for
 *      the viewport step itself — the browser slot occupied by the
 *      just-committed AREA_SET scope is overwritten in place); "Return to
 *      previous area" is a normal scope-boundary transition using the
 *      default `push` history (undoable via back).
 *   3. Mobile Map/List toggle state is preserved across a VIEWPORT
 *      activation (AC8) — activating the CTA while the mobile map overlay
 *      is open must not silently flip the view back to List.
 *   4. Filters still refetch correctly while VIEWPORT scope is active
 *      (AC4) — a filter param change re-fetches listings without resetting
 *      the committed `rscope=vp`.
 *
 * Uses a real local dev stack (backend + seeded Bangalore fixture data) —
 * no route mocks, per this repo's E2E convention. Reuses:
 *   - the school-first navigation-to-committed-AREA_SET setup from
 *     e2e/issue-2016-result-scope-contract.spec.ts (`reachCommittedKoramangalaAreaSet`,
 *     `urlParam`, `declineConsentBannerIfPresent`), and
 *   - the real-mouse-event Leaflet pan helper and mobile Map/List toggle
 *     testids from e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts
 *     (`panMap`, `control-bar-map-trigger`, `mobile-map-close-list-button`,
 *     the 390x844 mobile viewport convention).
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/issue-2015-search-this-area-viewport.spec.ts
 * Prerequisites: PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL pointing at a running
 * dev stack with the seeded Bangalore fixture (matches #2016/#2089 conventions).
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

const CITY = 'bangalore';
const D_CENTRAL = 'd:central';
const C_CENTRAL = 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala';
const AREA_KORAMANGALA = 'a:IN|KA|Bengaluru|Koramangala';
const AREA_KORAMANGALA_KEY = 'IN|KA|Bengaluru|Koramangala';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Navigates the area-first journey (the DEFAULT journey, virtual-defaulted
 * per issue #2088, and the only tree that renders `AreaSelectedPanel`
 * immediately on committing an area — the school-first journey instead
 * lands on a "schools in this area" browse step per its own panel-content
 * rules, never on the area-selected heading this spec asserts against) down
 * to a committed Koramangala AREA_SET scope (rscope=areas&rareas=<Koramangala
 * key>). Issue #2015 (canonical-path fix cycle) — corrected from an earlier
 * school-first version of this helper (mirrored from
 * e2e/issue-2016-result-scope-contract.spec.ts, which only asserts on URL
 * params and never dereferences the panel heading, so school-first was a
 * silent no-op there) that never actually reached `AreaSelectedPanel` here,
 * making every "heading names Koramangala" assertion in this file fail
 * before any VIEWPORT-scope behavior was ever exercised.
 */
async function reachCommittedKoramangalaAreaSet(page: Page): Promise<void> {
  await page.goto(`/discover?city=${CITY}&journey=area-first`);
  await page.waitForLoadState('domcontentloaded');

  const panelShell = page.getByTestId('discover-areas-journey-panel-shell');
  await expect(panelShell, 'areas journey panel shell should render').toBeVisible({ timeout: 15_000 });
  await declineConsentBannerIfPresent(page);

  const directionCard = panelShell.getByTestId(`navigation-child-card-${D_CENTRAL}`);
  await expect(directionCard, 'Central direction card should render').toBeVisible({ timeout: 15_000 });
  await directionCard.click();
  await expect(page, 'navigating into Central direction').toHaveURL(new RegExp(`node=${encodeURIComponent(D_CENTRAL)}`), {
    timeout: 10_000,
  });

  const clusterCard = panelShell.getByTestId(`navigation-child-card-${C_CENTRAL}`);
  await expect(clusterCard, 'Central cluster card should render').toBeVisible({ timeout: 15_000 });
  await clusterCard.click();
  await expect(page, 'navigating into Central cluster').toHaveURL(new RegExp(`node=${encodeURIComponent(C_CENTRAL)}`), {
    timeout: 10_000,
  });

  const areaCard = panelShell.getByTestId(`navigation-child-card-${AREA_KORAMANGALA}`);
  await expect(areaCard, 'Koramangala area card should render').toBeVisible({ timeout: 15_000 });
  await areaCard.click();

  await expect
    .poll(() => urlParam(page, 'rscope'), { message: 'committing Koramangala should set rscope=areas', timeout: 10_000 })
    .toBe('areas');
  expect(urlParam(page, 'rareas'), 'rareas should carry the Koramangala area key').toBe(AREA_KORAMANGALA_KEY);
  await declineConsentBannerIfPresent(page);
}

/**
 * Real-mouse-event Leaflet pan (synthetic .click()/.dragTo() is documented
 * as unreliable against Leaflet's own event plumbing — see
 * e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts). 12 steps +
 * an 800ms settle window: Leaflet's inertial panning fires dragend/the
 * trailing native click immediately on mouseup, but moveend (and this
 * feature's 300ms viewport-report debounce) can lag 200-350ms past that.
 */
async function panMap(page: Page, dx: number, dy: number): Promise<void> {
  const mapContainer = page.locator('.leaflet-container').first();
  const box = await mapContainer.boundingBox();
  if (!box) throw new Error('leaflet container has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + (dx * i) / steps, startY + (dy * i) / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
}

/**
 * Pans repeatedly, escalating the drag distance, until the "Search this
 * area" CTA becomes visible (i.e. isViewportDirty trips past the 15%
 * center-drift / 20% area-delta tolerance — see useDiscoverViewportSearch.ts).
 * Escalating rather than hard-coding one drag distance keeps this robust to
 * whatever zoom level the committed Koramangala AREA_SET lands the camera at.
 */
async function panUntilCtaVisible(page: Page, ctaButton: Locator): Promise<void> {
  let dx = -180;
  let dy = -120;
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await ctaButton.isVisible().catch(() => false)) return;
    await panMap(page, dx, dy);
    dx *= 1.6;
    dy *= 1.6;
  }
  await expect(ctaButton, 'CTA should appear once the pan drifts the viewport past tolerance').toBeVisible({
    timeout: 5_000,
  });
}

interface CapturedResponse {
  url: string;
  status: number;
}

function trackListingResponses(page: Page, sink: CapturedResponse[]): void {
  page.on('response', (r) => {
    const u = r.url();
    // Authenticated flows (this spec's school-first journey) hit the
    // auth-only /api/discover/listings and /api/discover/markers endpoints.
    // Also capture the anon-safe bbox-only VIEWPORT endpoint added for
    // #2015 Option 3 (GET /api/discover/cities/{city}/listings?bbox=...) so
    // this matcher stays correct for anon-flow coverage too. The `bbox=`
    // requirement avoids falsely matching unrelated city-listings calls
    // that don't carry a bbox param.
    if (
      u.includes('/api/discover/listings') ||
      u.includes('/api/discover/markers') ||
      (u.includes('/api/discover/cities/') && u.includes('bbox='))
    ) {
      sink.push({ url: u, status: r.status() });
    }
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('@integration-ui #2015 — "Search this area" VIEWPORT scope', () => {
  test('desktop: pan-dirty CTA, single scoped refetch, and Return-to-previous restores AREA_SET', async ({ page }) => {
    const responses: CapturedResponse[] = [];
    trackListingResponses(page, responses);

    await reachCommittedKoramangalaAreaSet(page);

    const ctaButton = page.getByRole('button', { name: /search this area/i });
    await expect(ctaButton, 'CTA must not render before the viewport has drifted (AC1)').not.toBeVisible();

    const listingCards = page.getByTestId('listing-card');
    // Wait for the committed AREA_SET's initial listing fetch to settle
    // before snapshotting the baseline count — otherwise this can race the
    // async fetch/render and capture 0 just before it flips to N, which
    // would make the pan-dirty "count unchanged" assertion below trivially
    // false rather than actually proving stability.
    await expect(listingCards.first(), 'at least one listing should render for the committed Koramangala AREA_SET before baselining').toBeVisible({
      timeout: 12_000,
    });
    const listingCountBeforePan = await listingCards.count();

    // AC1 — pan the map past tolerance; the CTA must appear, but merely
    // being "dirty" must NOT trigger a listings refetch (no auto-fetch).
    responses.length = 0;
    await panUntilCtaVisible(page, ctaButton);

    expect(urlParam(page, 'rscope'), 'scope must remain AREA_SET while merely dirty (no auto-commit)').toBe('areas');
    expect(responses, 'panning alone must not refetch listings/markers (no auto-fetch while dirty)').toHaveLength(0);
    expect(
      await listingCards.count(),
      'listing count must be unchanged while the viewport is merely dirty',
    ).toBe(listingCountBeforePan);

    // Issue #2015 regression baseline — snapshot the panel heading and the
    // first card's full text (price, title, etc.) BEFORE committing the
    // VIEWPORT scope. The bug this spec guards against left the results
    // panel pinned to the stale AREA_SET (Koramangala) listings/heading even
    // after "Search this area" correctly committed rscope=vp elsewhere, so a
    // bare network-response/card-visibility check (as this spec had before)
    // would pass even with the panel still showing the wrong data.
    const panelHeading = page.getByRole('heading', { level: 1 });
    const headingBeforeSearch = (await panelHeading.textContent())?.trim() ?? '';
    expect(headingBeforeSearch, 'heading should name the committed Koramangala AREA_SET before the VIEWPORT commit').toMatch(/koramangala/i);
    const firstCardTextBeforeSearch = (await listingCards.first().innerText()).trim();

    // AC2/AC7 — activating the CTA commits exactly one VIEWPORT-scoped
    // refetch, using replace-style history.
    responses.length = 0;
    await ctaButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'activating the CTA should commit rscope=vp', timeout: 10_000 })
      .toBe('vp');
    const rvp = urlParam(page, 'rvp');
    expect(rvp, 'rvp should carry the committed viewport bounds').not.toBeNull();
    expect(rvp, 'rvp should be a 4-part "s,w,n,e" bounds string').toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    expect(urlParam(page, 'rprev'), 'rprev should carry the outgoing AREA_SET scope').toContain('areas:');

    await expect
      .poll(() => responses.length, {
        message: 'activating the CTA must fire exactly one scoped listings/markers refetch',
        timeout: 10_000,
      })
      .toBe(1);
    expect(responses[0]!.status, 'the single VIEWPORT refetch must succeed').toBe(200);

    // AC1 (continued) — the CTA must hide immediately after activation
    // (baseline re-seeds on activeScope.kind change).
    await expect(ctaButton, 'CTA must hide right after activation').not.toBeVisible({ timeout: 5_000 });

    // Map markers and listing panel show a single, consistent result set.
    await expect(page.getByTestId('discover-right-panel'), 'listings panel remains visible under VIEWPORT scope').toBeVisible();
    await expect(listingCards.first(), 'at least one listing renders for the viewport-scoped result set').toBeVisible({
      timeout: 10_000,
    });

    // Issue #2015 regression assertions — the results panel must actually
    // switch to VIEWPORT-scoped data, not just keep showing the committed
    // AREA_SET's listings under a technically-correct URL/network trail.
    await expect
      .poll(async () => (await panelHeading.textContent())?.trim() ?? '', {
        message: 'the panel heading must stop naming the Koramangala AREA_SET once VIEWPORT scope is active',
        timeout: 10_000,
      })
      .not.toMatch(/koramangala/i);
    const headingAfterSearch = (await panelHeading.textContent())?.trim() ?? '';
    expect(headingAfterSearch, 'the VIEWPORT heading must differ from the pre-activation AREA_SET heading').not.toBe(headingBeforeSearch);

    const listingCountAfterSearch = await listingCards.count();
    const firstCardTextAfterSearch = (await listingCards.first().innerText()).trim();
    expect(
      listingCountAfterSearch !== listingCountBeforePan || firstCardTextAfterSearch !== firstCardTextBeforeSearch,
      'the displayed listing set must actually change (count or first card contents) once VIEWPORT scope replaces the stale AREA_SET results',
    ).toBe(true);

    // AC6 — Active-scope chip appears with its "Return to ..." control.
    const returnButton = page.getByRole('button', { name: /return to koramangala/i });
    await expect(returnButton, 'Active-scope chip\'s Return control should render for a VIEWPORT scope whose prior scope was AREA_SET').toBeVisible({
      timeout: 5_000,
    });

    // AC7 — clicking "Return to previous area" restores the prior scope and
    // removes the chip.
    await returnButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'Return should restore rscope=areas', timeout: 10_000 })
      .toBe('areas');
    expect(urlParam(page, 'rareas'), 'Return should restore the original Koramangala area key').toBe(AREA_KORAMANGALA_KEY);
    await expect(returnButton, 'the chip must disappear once the active scope is no longer VIEWPORT').not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('history semantics: VIEWPORT activation replaces, Return-to-previous pushes', async ({ page }) => {
    await reachCommittedKoramangalaAreaSet(page);

    const ctaButton = page.getByRole('button', { name: /search this area/i });
    await panUntilCtaVisible(page, ctaButton);
    await ctaButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'activation should commit rscope=vp', timeout: 10_000 })
      .toBe('vp');

    // AC7 — VIEWPORT activation uses `replace`: the history slot that held
    // the just-committed Koramangala AREA_SET state is overwritten in place
    // rather than pushing a new entry. Proof: a single goBack() from the
    // VIEWPORT state must land on the Central CLUSTER node (the entry
    // immediately before Koramangala was ever committed), never on an
    // intermediate "Koramangala AREA_SET, not yet VIEWPORT" entry — because
    // that entry never existed as its own history slot.
    await page.goBack();
    await expect
      .poll(() => urlParam(page, 'node'), {
        message: 'one back-navigation from the VIEWPORT state should skip past Koramangala straight to the Central cluster (replace semantics)',
        timeout: 10_000,
      })
      .toBe(C_CENTRAL);
    expect(urlParam(page, 'rscope'), 'the skipped-over Koramangala AREA_SET commit must not be its own history entry').not.toBe('areas');

    // Return to the VIEWPORT state to continue the flow.
    await page.goForward();
    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'forward-navigation should restore rscope=vp', timeout: 10_000 })
      .toBe('vp');

    // AC7 — "Return to previous area" is a normal scope-boundary transition
    // and uses the default PUSH history: it must add a new entry, so a
    // subsequent goBack() lands back on the VIEWPORT state (undoable).
    const returnButton = page.getByRole('button', { name: /return to koramangala/i });
    await expect(returnButton).toBeVisible({ timeout: 5_000 });
    await returnButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'Return should commit rscope=areas', timeout: 10_000 })
      .toBe('areas');

    await page.goBack();
    await expect
      .poll(() => urlParam(page, 'rscope'), {
        message: 'Return used push history, so going back once must land back on the VIEWPORT state',
        timeout: 10_000,
      })
      .toBe('vp');
  });

  test('mobile: Map/List toggle state is preserved across a VIEWPORT activation', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await reachCommittedKoramangalaAreaSet(page);

    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger, 'mobile Map trigger should be reachable from the committed AREA_SET panel').toBeVisible({
      timeout: 15_000,
    });
    await mapTrigger.click();

    const closeListButton = page.getByTestId('mobile-map-close-list-button');
    await expect(closeListButton, 'mobile Map overlay should be open (List-return control visible)').toBeVisible({
      timeout: 10_000,
    });

    const ctaButton = page.getByRole('button', { name: /search this area/i });
    await panUntilCtaVisible(page, ctaButton);
    await ctaButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'activation should commit rscope=vp on mobile too', timeout: 10_000 })
      .toBe('vp');

    // AC8 — activating the CTA must not silently flip the mobile view back
    // to List; the Map overlay (and its List-return control) must still be
    // showing immediately after the VIEWPORT commit.
    await expect(
      closeListButton,
      'mobile Map/List toggle state must be preserved across the VIEWPORT activation (AC8)',
    ).toBeVisible({ timeout: 5_000 });
  });

  test('filters still refetch correctly while VIEWPORT scope is active', async ({ page }) => {
    const responses: CapturedResponse[] = [];
    trackListingResponses(page, responses);

    await reachCommittedKoramangalaAreaSet(page);

    const ctaButton = page.getByRole('button', { name: /search this area/i });
    await panUntilCtaVisible(page, ctaButton);
    await ctaButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'activation should commit rscope=vp before applying a filter', timeout: 10_000 })
      .toBe('vp');
    const rvpBeforeFilter = urlParam(page, 'rvp');

    // AC4 — apply a filter (the `ntm` boolean param, same anon-reachable
    // filter dimension exercised by e2e/discover-filter-chips.spec.ts) while
    // VIEWPORT scope is active. Round-trips through a full navigation so the
    // committed rscope=vp/rvp params are read back from the URL exactly as a
    // real reload/deep-link would — this proves the VIEWPORT commitment and
    // the filter coexist rather than one clobbering the other.
    const filteredUrl = new URL(page.url());
    filteredUrl.searchParams.set('ntm', '1');
    responses.length = 0;
    await page.goto(filteredUrl.toString());
    await page.waitForLoadState('domcontentloaded');

    expect(urlParam(page, 'rscope'), 'the VIEWPORT scope must survive a filter change').toBe('vp');
    expect(urlParam(page, 'rvp'), 'the committed viewport bounds must be unchanged by the filter').toBe(rvpBeforeFilter);
    expect(urlParam(page, 'ntm'), 'the filter param must be applied').toBe('1');

    await expect
      .poll(() => responses.length, {
        message: 'the filter change must trigger a fresh listings/markers refetch while VIEWPORT scope is active',
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(1);
    expect(responses.every((r) => r.status === 200), 'the filtered VIEWPORT refetch(es) must succeed').toBe(true);
  });

  test('direct node navigation: rscope auto-commits to AREA_SET and the VIEWPORT flow works with no prior click (regression)', async ({ page }) => {
    // Issue #2015 regression — a direct/deep-link `node=` navigation (no
    // prior click, no `journey=` param — exactly the shape of the original
    // bug report's URL) previously left `rscope` unset even though the panel
    // already rendered "Result scope: Selected area" off nodeAreaPoint alone,
    // so panning never surfaced the "Search this area" CTA. This proves the
    // auto-commit effect in useDiscoverNavigationController.ts fixes both the
    // URL contract on load and the downstream VIEWPORT flow for this entry
    // path — matching the click-driven flow's behaviour exactly.
    await page.goto(
      `/discover?city=${CITY}&node=${encodeURIComponent(AREA_KORAMANGALA)}&lat=12.9352&lon=77.6245&zoom=15`,
    );
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    await expect
      .poll(() => urlParam(page, 'rscope'), {
        message: 'direct node navigation should auto-commit rscope=areas on load (Issue #2015 fix)',
        timeout: 10_000,
      })
      .toBe('areas');
    expect(
      urlParam(page, 'rareas'),
      'rareas should carry the Koramangala area key resolved from node=',
    ).toBe(AREA_KORAMANGALA_KEY);

    const listingCards = page.getByTestId('listing-card');
    await expect(
      listingCards.first(),
      'at least one listing should render for the auto-committed AREA_SET',
    ).toBeVisible({ timeout: 12_000 });

    const ctaButton = page.getByRole('button', { name: /search this area/i });
    await expect(ctaButton, 'CTA must not render before the viewport has drifted (AC1)').not.toBeVisible();

    await panUntilCtaVisible(page, ctaButton);
    await ctaButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), {
        message: 'activating the CTA from a direct-node entry should commit rscope=vp exactly like the click-driven flow',
        timeout: 10_000,
      })
      .toBe('vp');
    expect(urlParam(page, 'rvp'), 'rvp should carry the committed viewport bounds').not.toBeNull();
  });

  test('direct node navigation does not clobber an already-committed scope carried in the URL (back-out guard)', async ({ page }) => {
    // Regression guard for the settledNodeKeyRef / `nav.resultScope?.active
    // != null` guard in useDiscoverNavigationController.ts — a shared or
    // reloaded URL that already carries an explicit VIEWPORT scope alongside
    // `node=` (e.g. a link copied mid-VIEWPORT-search, or the user having
    // explicitly backed out into a different scope) must keep that scope
    // untouched; the auto-commit effect must never override an
    // already-active scope back to AREA_SET.
    const rvp = '12.9200,77.6000,12.9500,77.6500';
    await page.goto(
      `/discover?city=${CITY}&node=${encodeURIComponent(AREA_KORAMANGALA)}&lat=12.9352&lon=77.6245&zoom=15` +
        `&rscope=vp&rvp=${encodeURIComponent(rvp)}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    // Give the auto-commit effect a beat to run (a no-op here) before
    // asserting the scope is still exactly what the URL specified — proves
    // absence of a clobbering commit, not just its eventual absence.
    await page.waitForTimeout(1_000);

    expect(
      urlParam(page, 'rscope'),
      'an explicit rscope carried in the URL must survive direct node navigation unclobbered',
    ).toBe('vp');
    expect(urlParam(page, 'rvp'), 'the explicit rvp bounds must be preserved exactly').toBe(rvp);
  });
});
