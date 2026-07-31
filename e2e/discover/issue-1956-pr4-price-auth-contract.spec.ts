/**
 * Issue #1956 PR-4 — AC4.8: the auth-branched price contract at an AREA
 * leaf, verified against the REAL request and response (not a screenshot).
 *
 * Fixture: same AC4.11 seed as issue-1956-areas-adaptive-journeys.spec.ts —
 * `IN|KA|Bengaluru|Basaveshwara Nagar` has 2 real sale listings with
 * price_paise set (₹1.8Cr / ₹1.2Cr).
 *
 * Two separate `test.describe` blocks with different `storageState` (default
 * anon vs `e2e/fixtures/user-auth.json`) so this is a genuine two-session
 * comparison, not one page toggling auth client-side.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';

interface CapturedListingsCall {
  url: string;
  hasAuthHeader: boolean;
  areaKeysCount: number;
  body: { areas: Array<{ listings: Array<Record<string, unknown>> }> };
}

async function captureListingsCall(page: Page): Promise<CapturedListingsCall> {
  const responsePromise = page.waitForResponse((res) =>
    res.url().includes('/api/discover/cities/bangalore/listings'),
  );
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
  const response = await responsePromise;
  const request = response.request();
  const headers = await request.allHeaders();
  const url = new URL(request.url());
  const body = (await response.json()) as CapturedListingsCall['body'];
  return {
    url: request.url(),
    hasAuthHeader: 'authorization' in headers,
    areaKeysCount: url.searchParams.getAll('areaKeys').length,
    body,
  };
}

test.describe('@integration-ui #1956 PR-4 — AC4.8 anonymous request/response contract', () => {
  test('anon: no Authorization header, exactly one areaKeys value, every listing has priceBand and no pricePaise', async ({
    page,
  }) => {
    const call = await captureListingsCall(page);

    expect(call.hasAuthHeader, 'anon request must carry NO Authorization header').toBe(false);
    expect(call.areaKeysCount, 'exactly one areaKeys value for a single-area leaf').toBe(1);

    const listings = call.body.areas[0].listings;
    expect(listings.length).toBeGreaterThan(0);
    for (const listing of listings) {
      expect(listing.pricePaise, `listing ${listing.id} must not carry pricePaise for anon`).toBeUndefined();
      if (listing.listingPurpose === 'sale') {
        expect(
          typeof listing.priceBand === 'string' && listing.priceBand.length > 0,
          `sale listing ${listing.id} must carry a non-empty priceBand for anon`,
        ).toBe(true);
      }
    }
  });
});

test.describe('@integration-ui #1956 PR-4 — AC4.8 authenticated request/response contract', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('authed: Authorization header present, exactly one areaKeys value, every sale listing has pricePaise and no priceBand', async ({
    page,
  }) => {
    const call = await captureListingsCall(page);

    expect(call.hasAuthHeader, 'authenticated request must carry an Authorization header').toBe(true);
    expect(call.areaKeysCount, 'exactly one areaKeys value for a single-area leaf').toBe(1);

    const listings = call.body.areas[0].listings;
    expect(listings.length).toBeGreaterThan(0);
    for (const listing of listings) {
      expect(listing.priceBand, `listing ${listing.id} must not carry priceBand for an authed caller`).toBeFalsy();
      if (listing.listingPurpose === 'sale') {
        expect(
          typeof listing.pricePaise === 'number' && listing.pricePaise > 0,
          `sale listing ${listing.id} must carry a real pricePaise for an authenticated caller`,
        ).toBe(true);
      }
    }
  });
});
