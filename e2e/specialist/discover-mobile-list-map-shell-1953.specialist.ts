/**
 * E2E — Issue #1953: mobile List/Map shell, true unmount, live backend.
 *
 * NO page.route() mocks — this spec hits the real backend at BACKEND_BASE_URL
 * (see .env.e2e / playwright.config.ts) and asserts against real seeded
 * Bangalore data. It exists to prove the thing unit tests structurally
 * cannot: that the mobile Map overlay is a REAL unmount (DiscoverMapMount.tsx
 * returning `null`, no CSS hiding) with real Leaflet tile requests firing
 * only once Map is opened, across ONE continuous List -> Map -> List ->
 * Escape -> Refresh flow — not five isolated tests that could each pass
 * while the transitions between them leak state.
 *
 * ── Consent decision (read before touching this file) ──────────────────────
 * Deliberately NOT pre-granting `discover_telemetry_consent` via an init
 * script, unlike every other spec in this directory. That convenience
 * previously made a real defect structurally invisible: the consent banner
 * (`fixed bottom-4 left-1/2 z-50`, see DiscoverConsentBanner.tsx) used to sit
 * exactly on the mobile Map trigger's old anchor, so the trigger was
 * unreachable for every first-time user — and no spec that pre-granted
 * consent could ever have caught that, because none of them ever rendered
 * the banner. This journey's entire subject is the mobile List/Map trigger,
 * so it takes the real first-load path instead: if the banner renders, it is
 * dismissed the way an actual user would (clicking "Accept"), through
 * whatever the current DOM position is. If the banner is ever repositioned
 * to overlap the Map trigger (now living inside the control bar, per FIX1)
 * or the "List" close button, the click below will time out and this test
 * will fail — which is the point.
 *
 * Run locally (dev server + backend already up, per the task brief):
 *   npx playwright test --project=full e2e/discover/mobile-list-map-shell-1953.spec.ts
 */

import { test, expect } from './support/specialist-test';

const CITY = 'bangalore';
const VIEWPORT = { width: 390, height: 844 };
// Real tile host used by PropertyMap.tsx's <TileLayer> (OpenStreetMap).
const TILE_HOST_PATTERN = /tile\.openstreetmap\.org/;

interface HrefHistorySnapshot {
  href: string;
  historyLength: number;
}

test.describe('Issue #1953 — mobile List/Map shell: true unmount, live backend (390×844)', () => {
  test.use({ viewport: VIEWPORT });

  test('List -> Map -> List -> Escape -> Refresh -> repeated toggles, one continuous flow', async ({
    page,
  }) => {
    // Attached BEFORE navigation so the very first tile request (if any leaked
    // on cold load) is caught, not just requests after our own interactions.
    const tileRequests: string[] = [];
    page.on('request', (req) => {
      if (TILE_HOST_PATTERN.test(req.url())) tileRequests.push(req.url());
    });

    await page.goto(`/discover?city=${CITY}`);
    await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 15_000 });

    // Real first-load consent path (see decision note above) — dismiss the
    // banner like an actual user would, if it appears at all.
    const consentBanner = page.getByTestId('discover-consent-banner');
    if (await consentBanner.isVisible().catch(() => false)) {
      await consentBanner.getByRole('button', { name: /accept/i }).click();
      await expect(consentBanner).not.toBeVisible();
    }

    const mapTrigger = page.getByRole('button', { name: 'Map', exact: true });
    await expect(mapTrigger).toBeVisible();

    const snapshot = (): Promise<HrefHistorySnapshot> =>
      page.evaluate(() => ({
        href: window.location.href,
        historyLength: window.history.length,
      }));

    const baseline = await snapshot();

    // ── Step 1: List — zero leaflet, zero tile requests ──────────────────
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    expect(
      tileRequests,
      'no map-tile network requests must occur before Map is opened',
    ).toHaveLength(0);

    // ── Step 2: Open Map — exactly one leaflet-container, tiles now fire ─
    await mapTrigger.click();
    await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });
    await expect
      .poll(() => tileRequests.length, {
        message: 'tile requests must occur once Map is open',
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    let overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow, 'scroll lock must be applied while Map overlay is open').toBe('hidden');

    // ── Step 3: Return to List via the in-overlay "List" button — TRUE unmount,
    //    not display:none/visibility:hidden — absence of BOTH the container
    //    and Leaflet's internal panes.
    const listButton = page.getByRole('button', { name: 'List', exact: true });
    await expect(listButton).toBeVisible();
    await listButton.click();
    await expect(page.locator('.leaflet-container')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.leaflet-pane')).toHaveCount(0);

    overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow, 'scroll lock must be released after returning to List').not.toBe('hidden');

    // href/history unaffected by the List -> Map -> List round trip so far.
    let current = await snapshot();
    expect(current.href).toBe(baseline.href);
    expect(current.historyLength).toBe(baseline.historyLength);

    // ── Step 4: Reopen, close via Escape — focus return + scroll-lock release ─
    await mapTrigger.click();
    await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });
    overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow, 'scroll lock must be applied on the second open').toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(page.locator('.leaflet-container')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.leaflet-pane')).toHaveCount(0);

    overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow, 'scroll lock must be released after Escape closes Map').not.toBe('hidden');

    await expect(mapTrigger, 'focus must return to the Map trigger after Escape').toBeFocused();

    // href/history still unaffected after the Escape round trip.
    current = await snapshot();
    expect(current.href).toBe(baseline.href);
    expect(current.historyLength).toBe(baseline.historyLength);

    // ── Step 5: Refresh — URL byte-identical, lands back in LIST not MAP ──
    const urlBeforeReload = page.url();
    await page.reload();
    await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 15_000 });
    expect(page.url(), 'URL must be byte-identical after refresh').toBe(urlBeforeReload);
    // Lands in LIST: the Map trigger (only rendered in LIST state) is back,
    // and the map is still unmounted.
    await expect(page.getByRole('button', { name: 'Map', exact: true })).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);

    // ── Step 6: href/history unaffected across the WHOLE flow, including
    //    after the refresh (same URL, no extra history entries added by our
    //    own map open/close interactions).
    current = await snapshot();
    expect(current.href).toBe(baseline.href);
    expect(current.historyLength).toBe(baseline.historyLength);

    // ── Step 7: repeat open/close ~10 times — no .leaflet-container leak ──
    const repeatMapTrigger = page.getByRole('button', { name: 'Map', exact: true });
    const repeatListButton = page.getByRole('button', { name: 'List', exact: true });
    for (let i = 0; i < 10; i += 1) {
      await repeatMapTrigger.click();
      await expect(
        page.locator('.leaflet-container'),
        `iteration ${i}: exactly one leaflet-container while Map is open`,
      ).toHaveCount(1, { timeout: 10_000 });
      await repeatListButton.click();
      await expect(
        page.locator('.leaflet-container'),
        `iteration ${i}: no leaflet-container leak after closing Map`,
      ).toHaveCount(0, { timeout: 10_000 });
      await expect(
        page.locator('.leaflet-pane'),
        `iteration ${i}: no leaflet-pane leak after closing Map`,
      ).toHaveCount(0);
    }

    current = await snapshot();
    expect(current.href).toBe(baseline.href);
    expect(current.historyLength).toBe(baseline.historyLength);
  });
});
