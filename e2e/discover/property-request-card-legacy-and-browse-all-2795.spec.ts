/**
 * E2E: Issue #2795 — "Request a property" card on two more zero-result surfaces:
 *   (L) the legacy `?areaKey=` Discover route (AreaJourneyPanel 'area-selected' -> ListingsBody), and
 *   (B) a non-leaf "Browse all" node (`node=<cluster>&nodeListings=1` -> NodeListingsSurface), where the
 *       card submits areaKey null plus the node label.
 * The card is shown only when that scope's OWN query settled to a genuine zero — never while loading, on
 * error, or over a keepPreviousData placeholder.
 *
 * GATING: the card is behind the BUILD-TIME flag VITE_PROPERTY_REQUESTS_ENABLED=true (dark by default, and it
 * cannot be toggled at runtime), so the file is skipped unless PROPERTY_REQUEST_E2E=1 (same gate as
 * property-request-card.spec.ts). A skip is NOT a pass. Run:
 *   PROPERTY_REQUEST_E2E=1 VITE_PROPERTY_REQUESTS_ENABLED=true bash scripts/run-e2e-local.sh --project=full --workers=1 \
 *     e2e/discover/property-request-card-legacy-and-browse-all-2795.spec.ts
 *
 * Real fixture backend for every listings request. Exactly two things are intercepted, and both are labelled:
 *   - the ERROR arms route the ONE listings request under test to a 500 (mocked-response arm);
 *   - the SUBMIT arms fulfil `POST /api/public/property-requests` with a 201 so no row is written and the
 *     request PAYLOAD can be asserted (the backend create path is covered by property-request-card.spec.ts).
 * Submitted values are obvious test values, never real personal data.
 *
 * Every negative ("card never seen") is paired with a positive proof that the surface rendered, and the SAME
 * MutationObserver is asserted to SEE the card on the genuine-zero arms.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

test.use({ storageState: undefined });

const enc = encodeURIComponent;

// Browse-all runs on Bangalore (promoted navigation hierarchy => canonical Areas journey + NodeListingsSurface).
const CITY = 'bangalore';
const NODE_ZERO_PRICE_MAX = 1_000; // genuine zero for any real cluster
// The legacy ?areaKey= AreaJourneyPanel 'area-selected' route is only reachable for a city with NO active
// navigation hierarchy (a bare/areaKey URL otherwise virtual-defaults to journey=area-first, see state/url/area.ts).
// In the default fixture, Bangalore and Udupi both have a hierarchy; Mangalore (V71 seed city, areas but no
// navigation revision, no fixture listings) is the legacy city, so its areas are a natural genuine zero.
const LEGACY_CITY = 'mangalore';
const LEGACY_KEY = 'IN|KA|Mangalore|Kadri';
const LEGACY_ZERO_URL = `/discover?city=${LEGACY_CITY}&areaKey=${enc(LEGACY_KEY)}`;

const POST_PATH = '/api/public/property-requests';
const CARD_TESTID = 'request-property-card';
const CARD_CTA_TEXT = 'Request a property';
const CONSENT_VERSION = 'property-request-v1';
const TEST_PHONE = '9000000001'; // obvious test value; the POST is intercepted, nothing is stored

// ── helpers ────────────────────────────────────────────────────────────────────

async function seedConsentDenied(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('discover-telemetry-consent', 'denied');
    } catch {
      /* storage unavailable */
    }
  });
}

async function declineConsentIfPresent(page: Page) {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/** Records (window.__prcSeen) if the request card (or its CTA copy) is EVER in the DOM once armed. */
async function watchCard(page: Page) {
  await page.addInitScript(
    ({ testId, ctaText }) => {
      const w = window as unknown as { __prcSeen: string[]; __prcArmed?: boolean };
      w.__prcSeen = [];
      const check = () => {
        if (!document.body || !w.__prcArmed) return;
        if (document.querySelector(`[data-testid="${testId}"]`) && !w.__prcSeen.includes('testid')) w.__prcSeen.push('testid');
        if ((document.body.textContent ?? '').includes(ctaText) && !w.__prcSeen.includes('text')) w.__prcSeen.push('text');
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
    },
    { testId: CARD_TESTID, ctaText: CARD_CTA_TEXT },
  );
}

async function arm(page: Page) {
  await page
    .evaluate(() => {
      (window as unknown as { __prcArmed?: boolean }).__prcArmed = true;
    })
    .catch(() => undefined);
}

async function seen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __prcSeen?: string[] }).__prcSeen ?? []);
}

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** The area / node listings call (public per-city endpoint, no bbox). */
function isCityListingsRequest(url: string): boolean {
  return /\/api\/discover\/cities\/[^/]+\/listings/.test(url);
}

/** Counts the matching listings requests and arms the observer when one is issued; passes to the REAL backend. */
async function armOnRealRequest(page: Page): Promise<() => number> {
  let n = 0;
  await page.route('**/api/discover/cities/**', async (route) => {
    if (isCityListingsRequest(route.request().url())) {
      n += 1;
      await arm(page);
    }
    return route.fallback();
  });
  return () => n;
}

/** Routes the ONE listings request under test to a 500 (MOCKED-RESPONSE arm) and arms the observer. */
async function failListingsWith500(page: Page): Promise<() => number> {
  let n = 0;
  await page.route('**/api/discover/cities/**', async (route) => {
    if (isCityListingsRequest(route.request().url())) {
      n += 1;
      await arm(page);
      return fulfillJson(route, 500, { error: 'simulated_failure' });
    }
    return route.fallback();
  });
  return () => n;
}

/** Captures the JSON body of every create POST and fulfils it with a 201 (no row is written). */
async function interceptCreate(page: Page): Promise<Array<Record<string, unknown>>> {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route(`**${POST_PATH}`, async (route) => {
    const req = route.request();
    const origin = (await req.allHeaders())['origin'] ?? '*';
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      vary: 'Origin',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() !== 'POST') return route.fallback();
    bodies.push(req.postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({ id: '00000000-0000-0000-0000-000000002795', status: 'RECEIVED', createdAt: new Date().toISOString() }),
    });
  });
  return bodies;
}

/** Expands the card and PROVES the form opened. */
async function expandCard(page: Page) {
  const card = page.getByTestId(CARD_TESTID);
  await expect(card).toBeVisible({ timeout: 40_000 });
  const cta = card.getByRole('button', { name: CARD_CTA_TEXT });
  await expect(cta).toHaveAttribute('aria-expanded', 'false');
  await cta.click();
  await expect(cta).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('button', { name: 'Send request' })).toBeVisible();
  return card;
}

async function fillAndSend(page: Page, requirement: string) {
  const card = page.getByTestId(CARD_TESTID);
  await card.getByLabel('What are you looking for?').fill(requirement);
  await expect(card.getByLabel('What are you looking for?')).toHaveValue(requirement);
  await card.getByLabel('Phone number').fill(TEST_PHONE);
  await expect(card.getByLabel('Phone number')).toHaveValue(TEST_PHONE);
  const box = card.getByRole('checkbox');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  const send = card.getByRole('button', { name: 'Send request' });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole('status').filter({ hasText: 'Request received' })).toBeVisible({ timeout: 30_000 });
}

/**
 * Walks the real Navigation hierarchy to a bounded cluster and opens "Browse all" (the same walk
 * discover-bounded-listing-2087.spec.ts uses), then returns the resolved node key + label so the
 * zero-result URL is derived from the app, not hard-coded.
 */
async function openBrowseAllNode(page: Page): Promise<{ nodeKey: string; label: string }> {
  await page.goto(`/discover?city=${CITY}`);
  await declineConsentIfPresent(page);
  // Bare /discover already defaults to the Areas journey (root = regions); tolerate the optional entry card.
  const explore = page.getByText('Explore by area').first();
  if (await explore.isVisible({ timeout: 3_000 }).catch(() => false)) await explore.click();
  // A top-level region (here d:central, 10 fixture listings, 2 descendant areas) is a non-leaf node that
  // offers "Browse all N listings".
  const clusterLabel = 'Langford Gardens & Lavelle Road';
  const region = page.getByText(clusterLabel).first();
  await region.waitFor({ state: 'visible', timeout: 20_000 });
  await declineConsentIfPresent(page); // the banner can overlay the list and swallow the click
  await region.click();
  const cta = page.getByTestId('browse-node-listings-cta');
  await expect(cta).toBeVisible({ timeout: 20_000 });
  await cta.click();
  await expect(page).toHaveURL(/nodeListings=1/);
  await expect(page.getByTestId('areas-journey-panel-node-listings')).toBeVisible({ timeout: 20_000 });
  const nodeKey = new URL(page.url()).searchParams.get('node') ?? '';
  expect(nodeKey, 'resolved node key must be a non-leaf (not a:...) node').not.toBe('');
  expect(nodeKey.startsWith('a:'), 'Browse-all node must be non-leaf').toBe(false);
  return { nodeKey, label: clusterLabel };
}

/** The legacy AreaSelectedPanel header ("Properties in <area>", Result scope - Selected area). */
function legacyHeading(page: Page) {
  return page.getByRole('heading', { name: 'Properties in Kadri', level: 1 });
}

function browseAllUrl(nodeKey: string, priceMax?: number): string {
  return `/discover?city=${CITY}&node=${enc(nodeKey)}&nodeListings=1${priceMax != null ? `&priceMax=${priceMax}` : ''}`;
}

// ── tests ──────────────────────────────────────────────────────────────────────

test.describe('#2795 — request card on legacy ?areaKey= and non-leaf Browse-all zero results', () => {
  test.skip(
    process.env.PROPERTY_REQUEST_E2E !== '1',
    'needs a Vite dev server started with VITE_PROPERTY_REQUESTS_ENABLED=true (build-time flag); set PROPERTY_REQUEST_E2E=1',
  );
  test.setTimeout(150_000);

  test.beforeEach(async ({ page }) => {
    await seedConsentDenied(page);
  });

  test.describe('(L) legacy ?areaKey= route', () => {
    test('L1: genuine zero shows the zero-result state AND the card; submit carries the real area key', async ({ page }) => {
      await watchCard(page);
      const listingsReq = await armOnRealRequest(page);
      const bodies = await interceptCreate(page);

      await page.goto(LEGACY_ZERO_URL);
      await declineConsentIfPresent(page);
      // The legacy panel really rendered (not the new leaf surface) ...
      await expect(legacyHeading(page)).toBeVisible({ timeout: 40_000 });
      // ... the real listings request settled to a genuine zero ...
      await expect(page.getByTestId('area-zero-result-recovery')).toBeVisible({ timeout: 40_000 });
      expect(listingsReq(), 'the real listings request was issued').toBeGreaterThan(0);
      await expect(page.getByTestId('area-listings-error')).toHaveCount(0);
      // ... and the card is there.
      const card = await expandCard(page);
      expect(await seen(page), 'observer must be able to see the card on a genuine zero').toEqual(
        expect.arrayContaining(['testid']),
      );
      await expect(card.getByText(/^(Buy|Rent) · /)).toContainText('Kadri');

      await fillAndSend(page, 'E2E 2795 legacy route test requirement');
      expect(bodies, 'exactly one create POST').toHaveLength(1);
      expect(bodies[0]).toMatchObject({
        city: LEGACY_CITY,
        areaKey: LEGACY_KEY,
        journey: 'AREA',
        intent: 'BUY',
        consent: true,
        consentVersion: CONSENT_VERSION,
      });
      expect(String(bodies[0].areaLabel)).toContain('Kadri');
    });

    test('L2: card is absent while the legacy listings response is pending, present after the real 200-empty arrives', async ({ page }) => {
      let released = false;
      let held = 0;
      await page.route('**/api/discover/cities/**', async (route) => {
        if (isCityListingsRequest(route.request().url())) {
          held += 1;
          await new Promise((r) => setTimeout(r, 6_000));
          released = true;
        }
        return route.fallback();
      });

      await page.goto(LEGACY_ZERO_URL);
      await declineConsentIfPresent(page);
      // POSITIVE: the legacy panel is mounted and still loading while the response is held back.
      await expect(legacyHeading(page)).toBeVisible({ timeout: 40_000 });
      await expect.poll(() => held, { timeout: 30_000 }).toBeGreaterThan(0);
      let samples = 0;
      while (!released && samples < 30) {
        expect(await page.getByTestId(CARD_TESTID).count(), 'card must be absent while the response is pending').toBe(0);
        expect(await page.getByRole('button', { name: CARD_CTA_TEXT }).count()).toBe(0);
        samples += 1;
        await page.waitForTimeout(200);
      }
      expect(samples, 'at least one absence sample while the response was pending').toBeGreaterThan(0);
      // After release the REAL backend answers a settled zero and the card appears.
      await expect(page.getByTestId('area-zero-result-recovery')).toBeVisible({ timeout: 40_000 });
      await expect(page.getByTestId(CARD_TESTID)).toBeVisible({ timeout: 30_000 });
    });

    test('L3: listings 500 (mocked response) shows Error + Retry and the card is NEVER present', async ({ page }) => {
      await watchCard(page);
      const failed = await failListingsWith500(page);
      await page.goto(LEGACY_ZERO_URL);
      await declineConsentIfPresent(page);
      await expect(legacyHeading(page)).toBeVisible({ timeout: 40_000 });
      const retry = page.getByRole('button', { name: /^retry$/i }).first();
      await expect(retry).toBeVisible({ timeout: 40_000 });
      expect(failed(), 'the failing request was really issued').toBeGreaterThan(0);
      await expect(page.getByTestId('area-zero-result-recovery')).toHaveCount(0);
      await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);
      await expect(page.getByRole('button', { name: CARD_CTA_TEXT })).toHaveCount(0);

      const before = failed();
      await retry.click();
      await expect.poll(() => failed(), { timeout: 15_000 }).toBeGreaterThan(before);
      await expect(page.getByRole('button', { name: /^retry$/i }).first()).toBeVisible({ timeout: 40_000 });
      expect(await seen(page), 'the request card must never have rendered at any frame').toEqual([]);
    });
  });

  // MOBILE arm (PR #2803 defect): the legacy route renders through the mobile tree at 390x844; the card
  // must appear on a genuine zero there exactly as on desktop. (The h1 is in the DOM but not visible on
  // mobile, so the positive proof is the zero-result block.)
  test.describe('(L-mobile) legacy ?areaKey= route at 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test('LM1: genuine zero shows the zero-result state AND the card on mobile; submit carries the real area key', async ({ page }) => {
      await watchCard(page);
      const listingsReq = await armOnRealRequest(page);
      const bodies = await interceptCreate(page);

      await page.goto(LEGACY_ZERO_URL);
      await declineConsentIfPresent(page);
      await expect(page.getByTestId('area-zero-result-recovery')).toBeVisible({ timeout: 40_000 });
      expect(listingsReq(), 'the real listings request was issued').toBeGreaterThan(0);
      await expect(page.getByTestId('area-listings-error')).toHaveCount(0);
      await expect(page.getByTestId('listing-card')).toHaveCount(0);
      const card = await expandCard(page);
      await expect(card.getByText(/^(Buy|Rent) · /)).toContainText('Kadri');

      await fillAndSend(page, 'E2E 2795 legacy mobile test requirement');
      expect(bodies, 'exactly one create POST').toHaveLength(1);
      expect(bodies[0]).toMatchObject({ city: LEGACY_CITY, areaKey: LEGACY_KEY, journey: 'AREA', intent: 'BUY', consent: true });
    });

    test('LM2: listings 500 on mobile shows Error + Retry and the card is NEVER present', async ({ page }) => {
      await watchCard(page);
      const failed = await failListingsWith500(page);
      await page.goto(LEGACY_ZERO_URL);
      await declineConsentIfPresent(page);
      await expect(page.getByRole('button', { name: /^retry$/i }).first()).toBeVisible({ timeout: 40_000 });
      expect(failed(), 'the failing request was really issued').toBeGreaterThan(0);
      await expect(page.getByTestId('area-zero-result-recovery')).toHaveCount(0);
      await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);
      expect(await seen(page), 'the request card must never have rendered at any frame').toEqual([]);
    });
  });

  test.describe('(B) non-leaf Browse-all node', () => {
    test('B1: genuine zero shows the card; submit carries areaKey null + the node label', async ({ page }) => {
      await watchCard(page);
      const listingsReq = await armOnRealRequest(page);
      const bodies = await interceptCreate(page);

      // Resolve a real non-leaf Browse-all node via the product UI, then add a filter that empties it.
      const { nodeKey, label } = await openBrowseAllNode(page);
      await page.goto(browseAllUrl(nodeKey, NODE_ZERO_PRICE_MAX));
      await declineConsentIfPresent(page);
      await expect(page.getByTestId('areas-journey-panel-node-listings')).toBeVisible({ timeout: 40_000 });
      await expect(page.getByTestId('areas-journey-panel-node-listings-error')).toHaveCount(0);
      expect(listingsReq(), 'the real node listings request was issued').toBeGreaterThan(0);
      await expect(page.getByTestId('area-zero-result-recovery')).toBeVisible({ timeout: 40_000 });

      const card = await expandCard(page);
      expect(await seen(page), 'observer must be able to see the card on a genuine zero').toEqual(
        expect.arrayContaining(['testid']),
      );
      await expect(card.getByText(/^(Buy|Rent) · /)).toContainText(label.split(' ')[0]);

      await fillAndSend(page, 'E2E 2795 browse-all test requirement');
      expect(bodies, 'exactly one create POST').toHaveLength(1);
      expect(bodies[0].areaKey, 'a navigation node key is NEVER submitted as an area key').toBeNull();
      expect(String(bodies[0].areaLabel), 'the node label names the scope').toContain(label.split(' ')[0]);
      expect(bodies[0]).toMatchObject({ city: CITY, journey: 'AREA', intent: 'BUY', consent: true, consentVersion: CONSENT_VERSION });
    });

    test('B2: control — the same node with inventory shows listings and NO card', async ({ page }) => {
      await watchCard(page);
      await armOnRealRequest(page);
      const { nodeKey } = await openBrowseAllNode(page);
      await page.goto(browseAllUrl(nodeKey));
      await declineConsentIfPresent(page);
      await expect(page.getByTestId('areas-journey-panel-node-listings')).toBeVisible({ timeout: 40_000 });
      await expect(page.getByTestId('area-zero-result-recovery')).toHaveCount(0);
      await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 40_000 });
      await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);
      expect(await seen(page)).toEqual([]);
    });

    test('B3: node listings 500 (mocked response) shows the node error and the card is NEVER present', async ({ page }) => {
      const { nodeKey } = await openBrowseAllNode(page);
      // Fresh page state for the observer: install it, then reload the node with the failing route in place.
      await watchCard(page);
      const failed = await failListingsWith500(page);
      await page.goto(browseAllUrl(nodeKey, NODE_ZERO_PRICE_MAX));
      await declineConsentIfPresent(page);
      await expect(page.getByTestId('areas-journey-panel-node-listings-error')).toBeVisible({ timeout: 40_000 });
      expect(failed(), 'the failing request was really issued').toBeGreaterThan(0);
      await expect(page.getByTestId('area-zero-result-recovery')).toHaveCount(0);
      await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);
      await expect(page.getByRole('button', { name: CARD_CTA_TEXT })).toHaveCount(0);
      expect(await seen(page), 'the request card must never have rendered at any frame').toEqual([]);
    });
  });
});
