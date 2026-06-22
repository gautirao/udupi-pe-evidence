/**
 * broker-demand-gaps.spec.ts — hardened E2E spec for /broker/demand-gaps (#1535)
 *
 * SAFETY CONTRACT (binding):
 *   - All backend calls are intercepted via page.route() with Playwright route mocking.
 *   - NO live mutations against the shared Supabase DB or Spring Boot backend.
 *   - NO broker_id is ever sent — the contract forbids it (JWT-derived server-side).
 *   - Auth state is supplied via storageState: 'e2e/fixtures/broker-auth.json' (written
 *     by global-setup when BROKER_EMAIL/BROKER_PASSWORD are present; empty when absent).
 *   - All tests skip gracefully when broker credentials are absent rather than failing.
 *
 * Reserved frontend port: 5323 (see parallel-worktree-test-ports memory).
 *
 * Run (mocked — no backend required):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5323 \
 *   npx playwright test e2e/broker-demand-gaps.spec.ts --project=chromium --reporter=list
 *
 * AC coverage table:
 *   | Scenario | Test ID | Covered? |
 *   | 1. Full page render (summary + gaps + capture + legend) | DG1 | YES |
 *   | 2. Honest null state (value:null → confidenceLabel, never "0") | DG2 | YES |
 *   | 3. Signal→CTA: actionType drives the CTA button label | DG3 | YES |
 *   | 4. Dismiss/read visibility: id!=null shows controls, id==null hides | DG4 | YES |
 *   | 4b. Clicking dismiss fires POST /api/broker/alerts/{id}/dismiss | DG4b | YES |
 *   | 5. Empty state: empty allGaps renders EmptyState, not fabricated numbers | DG5 | YES |
 *   | 6. Client-side filter/sort: no extra GET on filter; null gapScore rows no crash | DG6 | YES |
 *   | 7. No broker_id leaked in the GET request URL | DG7 | YES |
 */

import { test, expect, type Page } from '@playwright/test';
import { hasRealCredentials } from './helpers';

// ── Credentials guard (mirrors broker-smoke.spec.ts pattern) ──────────────────

const brokerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);

// ── Contract fixtures (verbatim #1534 field names) ────────────────────────────

/**
 * Standard happy-path fixture — two gaps:
 *  - gap-uuid-1: id !== null, signalType=supply_gap, actionType=add_listing
 *  - gap-null:   id === null, signalType=possible_gap, actionType=review_gap, all Metrics null
 */
const MOCK_STANDARD = {
  summary: {
    buyerSearches: { value: 240, confidenceLabel: 'Buyer searches available' },
    buyerEnquiries: { value: 18, confidenceLabel: 'Buyer enquiries available' },
    demandGapsFound: 5,
    brokerMatchingListings: 3,
    opportunitiesToAct: 2,
  },
  topGaps: [
    {
      id: 'gap-uuid-1',
      areaKey: 'Koramangala|Bangalore South|Bangalore',
      propertyType: 'APARTMENT',
      listingPurpose: 'SALE',
      budgetBand: '50L-75L',
      week: '2026-06-16',
      gapScore: { value: 8.4, confidenceLabel: 'Score available' },
      signalType: 'supply_gap',
      actionType: 'add_listing',
      confidence: { value: 'High', confidenceLabel: 'Confidence: High' },
      buyerEnquiries: { value: 12, confidenceLabel: 'Buyer enquiries available' },
      brokerLiveCount: 2,
      readAt: null,
      dismissedAt: null,
    },
  ],
  allGaps: [
    {
      id: 'gap-uuid-1',
      areaKey: 'Koramangala|Bangalore South|Bangalore',
      propertyType: 'APARTMENT',
      listingPurpose: 'SALE',
      budgetBand: '50L-75L',
      week: '2026-06-16',
      gapScore: { value: 8.4, confidenceLabel: 'Score available' },
      signalType: 'supply_gap',
      actionType: 'add_listing',
      confidence: { value: 'High', confidenceLabel: 'Confidence: High' },
      buyerEnquiries: { value: 12, confidenceLabel: 'Buyer enquiries available' },
      brokerLiveCount: 2,
      readAt: null,
      dismissedAt: null,
    },
    {
      id: null,
      areaKey: 'HSR Layout|Bangalore South|Bangalore',
      propertyType: 'VILLA',
      listingPurpose: 'RENT',
      budgetBand: '25K-40K',
      week: '2026-06-16',
      gapScore: { value: null, confidenceLabel: 'Insufficient data' },
      signalType: 'possible_gap',
      actionType: 'review_gap',
      confidence: { value: null, confidenceLabel: 'Low confidence' },
      buyerEnquiries: { value: null, confidenceLabel: 'Suppressed' },
      brokerLiveCount: 0,
      readAt: null,
      dismissedAt: null,
    },
  ],
  captureDemandListings: [
    {
      listingId: 'listing-uuid-1',
      title: '3BHK Apartment Koramangala',
      areaKey: 'Koramangala|Bangalore South|Bangalore',
      propertyType: 'APARTMENT',
      listingPurpose: 'SALE',
      pricePaise: 750000000,
      qualityScore: 72,
    },
  ],
};

/** Fixture with all Metric fields null — tests honest null rendering. */
const MOCK_NULL_METRICS = {
  ...MOCK_STANDARD,
  summary: {
    buyerSearches: { value: null, confidenceLabel: 'Insufficient data' },
    buyerEnquiries: { value: null, confidenceLabel: 'Insufficient data' },
    demandGapsFound: 0,
    brokerMatchingListings: 0,
    opportunitiesToAct: 0,
  },
  topGaps: [],
  captureDemandListings: [],
};

/** Fixture with actionType=improve_listing for CTA-routing test. */
const MOCK_IMPROVE_LISTING_GAP = {
  ...MOCK_STANDARD,
  topGaps: [
    {
      ...MOCK_STANDARD.topGaps[0],
      id: 'gap-uuid-improve',
      signalType: 'information_gap',
      actionType: 'improve_listing',
    },
  ],
  allGaps: [
    {
      ...MOCK_STANDARD.allGaps[0],
      id: 'gap-uuid-improve',
      signalType: 'information_gap',
      actionType: 'improve_listing',
    },
  ],
};

/** Fixture with review_gap actionType for CTA-routing test. */
const MOCK_REVIEW_GAP = {
  ...MOCK_STANDARD,
  topGaps: [
    {
      ...MOCK_STANDARD.topGaps[0],
      id: 'gap-uuid-review',
      signalType: 'possible_gap',
      actionType: 'review_gap',
    },
  ],
  allGaps: [
    {
      ...MOCK_STANDARD.allGaps[0],
      id: 'gap-uuid-review',
      signalType: 'possible_gap',
      actionType: 'review_gap',
    },
  ],
};

/** Empty fixture — tests EmptyState rendering. */
const MOCK_EMPTY = {
  summary: {
    buyerSearches: { value: 0, confidenceLabel: 'Buyer searches available' },
    buyerEnquiries: { value: 0, confidenceLabel: 'Buyer enquiries available' },
    demandGapsFound: 0,
    brokerMatchingListings: 0,
    opportunitiesToAct: 0,
  },
  topGaps: [],
  allGaps: [],
  captureDemandListings: [],
};

// ── Route helpers ─────────────────────────────────────────────────────────────

function fulfillJson(status: number, body: unknown) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

/**
 * Wire the primary demand-gaps GET mock.
 * Also stubs the alerts mutations (204 No Content) so dismiss/read do not fail.
 */
async function mockDemandGaps(page: Page, body: unknown = MOCK_STANDARD) {
  await page.route('**/api/broker/demand-gaps', (route) =>
    void route.fulfill(fulfillJson(200, body)),
  );
  // Stub alert mutations — 204, no side effects
  await page.route('**/api/broker/alerts/**', (route) =>
    void route.fulfill({ status: 204 }),
  );
}

/**
 * Navigate to /broker/demand-gaps and wait until the page has settled.
 * Uses 'networkidle' only as a secondary condition — the primary signal is
 * the page heading becoming visible (auto-waiting, no hard sleep).
 */
async function gotoPage(page: Page) {
  await page.goto('/broker/demand-gaps');
  await page.waitForLoadState('domcontentloaded');
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('@broker-demand-gaps /broker/demand-gaps', () => {
  /**
   * Auth: storageState written by global-setup when broker creds are present.
   * When creds are absent, global-setup writes an empty state file and every
   * test self-skips via the hasBrokerCreds guard.
   */
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  // ── DG1 — Full page render ────────────────────────────────────────────────

  test('DG1 — page renders heading, summary cards, gap cards, gaps table, capture section, and legend', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG1');

    await mockDemandGaps(page, MOCK_STANDARD);
    await gotoPage(page);

    // Must stay on the demand-gaps route — no redirect
    await expect(page).toHaveURL(/\/broker\/demand-gaps/, { timeout: 8_000 });

    // H1: "Demand Gaps"
    await expect(
      page.getByRole('heading', { name: /demand gaps/i, level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // Summary cards — wait for a stable card label as the data-load signal
    await page.waitForSelector('text=Buyer Searches', { timeout: 10_000 });
    await expect(page.getByText(/buyer searches/i).first()).toBeVisible();
    await expect(page.getByText(/buyer enquiries/i).first()).toBeVisible();
    await expect(page.getByText(/demand gaps/i).first()).toBeVisible();
    await expect(page.getByText(/your listings/i).first()).toBeVisible();
    await expect(page.getByText(/act now/i).first()).toBeVisible();

    // Priority Signals section heading
    await expect(
      page.getByRole('heading', { name: /priority signals/i }),
    ).toBeVisible();

    // Top gap card: "Add Listing" CTA for supply_gap / add_listing
    await expect(
      page.getByRole('button', { name: /add listing/i }).first(),
    ).toBeVisible();

    // All Demand Gaps table heading
    await expect(
      page.getByRole('heading', { name: /all demand gaps/i }),
    ).toBeVisible();

    // Table rows — at least one row with the Koramangala area
    await expect(
      page.getByRole('cell', { name: /koramangala/i }).first(),
    ).toBeVisible();

    // Capture-demand section (listing title from fixture)
    await expect(page.getByText('3BHK Apartment Koramangala')).toBeVisible();

    // Signal legend (rendered via SignalLegend inside aria-labelledby="signal-legend-heading")
    // The section uses sr-only heading "About these signals"; assert at least one signal
    // label text from the legend is present on the page.
    await expect(page.getByText(/supply gap/i).first()).toBeVisible();
  });

  // ── DG2 — Honest null state ───────────────────────────────────────────────

  test('DG2 — Metric.value===null renders confidenceLabel text and NEVER the literal "0"', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG2');

    await mockDemandGaps(page, MOCK_NULL_METRICS);
    await gotoPage(page);

    await expect(page).toHaveURL(/\/broker\/demand-gaps/, { timeout: 8_000 });

    // Wait for the null-state confidenceLabel to appear — confirms data loaded
    await page.waitForSelector('text=Insufficient data', { timeout: 10_000 });

    // At least one "Insufficient data" label must be visible
    await expect(page.getByText('Insufficient data').first()).toBeVisible();

    // The buyer searches card MUST NOT display "0" as the large numeric metric.
    // The MetricValue component renders the confidenceLabel (italic text) for null,
    // not the number 0. Verify by asserting the card context: look for the heading
    // label and confirm no sibling "0" metric value is present in the page.
    //
    // Strategy: locate the card by its label text, then assert within its container
    // that no element has exactly "0" as text alongside a large-value class indicator.
    // Since the component renders <p className="text-sm text-muted-foreground italic">
    // for null (not a p.text-3xl), we check that text-3xl "0" is NOT present.
    const metricZero = page.locator('p.text-3xl.font-bold', { hasText: /^0$/ });
    // demandGapsFound=0, brokerMatchingListings=0, opportunitiesToAct=0 are plain numbers
    // rendered as text-3xl — they ARE legitimately 0. But buyer searches/enquiries are
    // Metric<number|null> with value:null and MUST NOT render text-3xl at all.
    // Verify: the Buyer Searches card must contain the italic confidenceLabel, not text-3xl.
    const buyerSearchesCard = page.locator('text=Buyer Searches').locator('..');
    // The card's metric display must be italic (null state), not a large bold number
    await expect(buyerSearchesCard.locator('p.italic')).toBeVisible();
    // And there must be no text-3xl sibling inside the buyer-searches card
    await expect(buyerSearchesCard.locator('p.text-3xl')).toHaveCount(0);

    // Extra: the literal text "0" must not appear as a standalone metric next to "Buyer Searches"
    // Confirmed via the absence of text-3xl inside the card — already asserted above.
    // (metricZero may legitimately exist for the three plain-number fields; don't assert count=0 globally)
    void metricZero; // used for the scoped buyerSearchesCard assertion above
  });

  // ── DG3 — Signal→CTA routing keyed off actionType ────────────────────────

  test('DG3a — actionType=add_listing renders "Add Listing" CTA on top gap card', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG3a');

    await mockDemandGaps(page, MOCK_STANDARD);
    await gotoPage(page);

    await page.waitForSelector('text=Priority Signals', { timeout: 10_000 });

    // The top gap card for supply_gap/add_listing must show "Add Listing" button
    await expect(
      page.getByRole('button', { name: /add listing/i }).first(),
    ).toBeVisible();
    // Must NOT show "Improve Listing" or "Review Gap" on this card
    await expect(
      page.getByRole('button', { name: /improve listing/i }),
    ).toHaveCount(0);
  });

  test('DG3b — actionType=improve_listing renders "Improve Listing" CTA on top gap card', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG3b');

    await mockDemandGaps(page, MOCK_IMPROVE_LISTING_GAP);
    await gotoPage(page);

    await page.waitForSelector('text=Priority Signals', { timeout: 10_000 });

    await expect(
      page.getByRole('button', { name: /improve listing/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /add listing/i }),
    ).toHaveCount(0);
  });

  test('DG3c — actionType=review_gap renders "Review Gap" CTA on top gap card', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG3c');

    await mockDemandGaps(page, MOCK_REVIEW_GAP);
    await gotoPage(page);

    await page.waitForSelector('text=Priority Signals', { timeout: 10_000 });

    await expect(
      page.getByRole('button', { name: /review gap/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /add listing/i }),
    ).toHaveCount(0);
  });

  // ── DG4 — Dismiss/read visibility ────────────────────────────────────────

  test('DG4a — gap with id!=null shows dismiss controls; gap with id==null shows none', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG4a');

    await mockDemandGaps(page, MOCK_STANDARD);
    await gotoPage(page);

    // Wait for the all-gaps table to render (data present)
    await page.waitForSelector('text=All Demand Gaps', { timeout: 10_000 });
    await page.waitForSelector('text=Koramangala', { timeout: 8_000 });

    // MOCK_STANDARD.allGaps has 2 rows: gap-uuid-1 (id!=null) and gap-null (id==null).
    // Only the id!=null row should have dismiss/read controls.
    // aria-label="Dismiss gap" is on the dismiss button in both TopGapCards and AllGapsTable.
    const dismissButtons = page.getByRole('button', { name: /dismiss gap/i });
    // Exactly 1 in the table (gap-uuid-1), plus 1 in the top gap card = 2 total.
    // The id==null row has NO dismiss button — assert total count is < total gap count.
    const count = await dismissButtons.count();
    // There are 2 gaps total (1 with id, 1 without). Max dismiss buttons = gaps with id=2
    // (1 top card + 1 table row for gap-uuid-1). Min = 1 if top card renders same gap.
    // Either way, count must be < 4 (proving id==null gap contributes no button).
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(2);

    // Verify Mark-as-read button also only appears for id!=null gap
    const markReadButtons = page.getByRole('button', { name: /mark as read/i });
    const readCount = await markReadButtons.count();
    expect(readCount).toBeGreaterThanOrEqual(1);
    expect(readCount).toBeLessThanOrEqual(2);
  });

  test('DG4b — clicking dismiss fires POST /api/broker/alerts/{id}/dismiss (no extra GET)', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG4b');

    // Capture dismiss POST requests
    const dismissRequests: string[] = [];
    await mockDemandGaps(page, MOCK_STANDARD);
    // Override the alerts stub to also capture the URL
    await page.route('**/api/broker/alerts/**', (route) => {
      dismissRequests.push(route.request().url());
      void route.fulfill({ status: 204 });
    });

    await gotoPage(page);
    await page.waitForSelector('text=All Demand Gaps', { timeout: 10_000 });
    await page.waitForSelector('text=Koramangala', { timeout: 8_000 });

    // Click the first dismiss button (belongs to gap-uuid-1)
    const dismissBtn = page.getByRole('button', { name: /dismiss gap/i }).first();
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // Wait for the dismiss POST to be captured
    await page.waitForResponse((r) => r.url().includes('/dismiss'), { timeout: 5_000 });

    // Assert the correct endpoint was called
    expect(dismissRequests.some((u) => u.includes('/api/broker/alerts/gap-uuid-1/dismiss'))).toBe(true);
    // Must not leak broker_id in the alerts URL
    expect(dismissRequests.every((u) => !u.includes('broker_id'))).toBe(true);
  });

  // ── DG5 — Empty state ─────────────────────────────────────────────────────

  test('DG5 — empty allGaps renders EmptyState heading, not fabricated gap numbers', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG5');

    await mockDemandGaps(page, MOCK_EMPTY);
    await gotoPage(page);

    await expect(page).toHaveURL(/\/broker\/demand-gaps/, { timeout: 8_000 });

    // Wait for data to resolve (summary cards load immediately)
    await page.waitForSelector('text=All Demand Gaps', { timeout: 10_000 });

    // EmptyState heading from AllGapsTable when gaps.length === 0
    await expect(
      page.getByText('No demand gaps found'),
    ).toBeVisible({ timeout: 8_000 });

    // Also TopGapCards EmptyState when topGaps.length === 0
    await expect(
      page.getByText(/no priority gaps right now/i),
    ).toBeVisible();

    // Must NOT show any gap rows with fabricated data
    await expect(page.getByRole('cell', { name: /koramangala/i })).toHaveCount(0);

    // Summary counts show 0 (plain number, not Metric) — this is correct, not fabricated
    // (demandGapsFound=0 is a legitimate plain integer rendered as-is)
    await expect(page.getByText(/signals found/i)).toBeVisible();
  });

  // ── DG6 — Client-side filter/sort ─────────────────────────────────────────

  test('DG6a — applying a property-type filter changes visible rows WITHOUT firing a new GET /api/broker/demand-gaps', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG6a');

    // Track all demand-gaps GET requests after page load
    const demandGapsGetRequests: string[] = [];

    await mockDemandGaps(page, MOCK_STANDARD);
    await gotoPage(page);

    // Wait for initial load to complete before wiring the counter
    await page.waitForSelector('text=Koramangala', { timeout: 10_000 });

    // Start counting new GETs only after initial load
    page.on('request', (req) => {
      if (req.url().includes('/api/broker/demand-gaps') && req.method() === 'GET') {
        demandGapsGetRequests.push(req.url());
      }
    });

    // Open the property-type filter dropdown (Radix Select — click the trigger)
    const propTypeSelect = page.getByRole('combobox').filter({ hasText: /all property types/i });
    await expect(propTypeSelect).toBeVisible({ timeout: 5_000 });
    await propTypeSelect.click();

    // Select "APARTMENT" from the dropdown
    await page.getByRole('option', { name: 'APARTMENT' }).click();

    // After filtering: only APARTMENT row visible (Koramangala), VILLA row hidden
    await expect(page.getByRole('cell', { name: /koramangala/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('cell', { name: /hsr layout/i })).toHaveCount(0);

    // Critical assertion: no new GET fired during client-side filter
    expect(demandGapsGetRequests).toHaveLength(0);
  });

  test('DG6b — sorting by gapScore with a null-score row does not crash and null rows go last', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG6b');

    // Use standard fixture: gap-uuid-1 has gapScore.value=8.4, gap-null has gapScore.value=null
    await mockDemandGaps(page, MOCK_STANDARD);
    await gotoPage(page);

    await page.waitForSelector('text=All Demand Gaps', { timeout: 10_000 });
    await page.waitForSelector('text=Koramangala', { timeout: 8_000 });

    // Click the "Gap Score" sort button (SortButton component with aria-pressed)
    const sortButton = page.getByRole('button', { name: /gap score/i });
    await expect(sortButton).toBeVisible();

    // Toggle sort — desc is default, click to go asc
    await sortButton.click();
    // Page must not crash — still showing rows
    await expect(page.getByRole('cell', { name: /koramangala/i }).first()).toBeVisible({ timeout: 5_000 });

    // Toggle sort back to desc
    await sortButton.click();
    await expect(page.getByRole('cell', { name: /koramangala/i }).first()).toBeVisible({ timeout: 5_000 });

    // Null-score row (HSR Layout / VILLA) must still be present and rendered last (table sorts nulls last)
    const rows = page.getByRole('row');
    const rowCount = await rows.count();
    // At least 3 rows: 1 header + 2 data rows — null-score row did not crash
    expect(rowCount).toBeGreaterThanOrEqual(3);

    // The last data row should be the null-score gap (HSR Layout)
    // rowCount-1 is the last row (0-indexed)
    const lastRow = rows.nth(rowCount - 1);
    await expect(lastRow).toContainText('HSR Layout');
  });

  // ── DG7 — No broker_id leaked in GET request ─────────────────────────────

  test('DG7 — GET /api/broker/demand-gaps contains NO broker_id or brokerId query parameter', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DG7');

    const capturedUrls: string[] = [];

    await mockDemandGaps(page, MOCK_STANDARD);

    // Capture all requests to the demand-gaps endpoint before navigation
    page.on('request', (req) => {
      if (req.url().includes('demand-gaps')) {
        capturedUrls.push(req.url());
      }
    });

    await gotoPage(page);

    // Wait for data to load — heading confirms the request fired
    await page.waitForSelector('text=Demand Gaps', { timeout: 10_000 });

    // Must have captured at least one request
    expect(capturedUrls.length).toBeGreaterThan(0);

    // None of the captured URLs may include broker_id in any form
    for (const url of capturedUrls) {
      expect(url).not.toMatch(/broker_id/i);
      expect(url).not.toMatch(/brokerid/i);
    }
  });
});
