/**
 * Broker Dashboard v2 — Playwright smoke spec (#1523)
 *
 * Covers:
 *   BD1 — signed-in broker sees summary cards on /broker/dashboard
 *   BD2 — 'Start here today' / 'Broker workspaces' sections are present
 *   BD3 — "Details coming soon" (no live link to /broker/listing-quality)
 *   BD4 — clicking the Drafts workspace navigates to /broker/listings?status=DRAFT
 *
 * Convention mirrors e2e/broker-smoke.spec.ts:
 *   - Auth via storageState: 'e2e/fixtures/broker-auth.json'
 *   - Credentials guard via hasRealCredentials()
 *   - No hard waits — uses Playwright auto-waiting / waitForSelector
 *
 * Run locally (targeted):
 *   npx playwright test e2e/broker-dashboard-v2.spec.ts --project=chromium
 * Or via project alias:
 *   npm run test:e2e:local -- --grep "@broker-dashboard-v2"
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const brokerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';

const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);

// ---------------------------------------------------------------------------
// BD1–BD4 — Broker-authenticated tests
// ---------------------------------------------------------------------------
test.describe('@broker-dashboard-v2 broker dashboard v2 smoke', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  // ── BD1 — Summary cards visible ──────────────────────────────────────────
  test('BD1 — broker sees 5 summary cards on /broker/dashboard', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping BD1');

    await page.goto('/broker/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Must remain on dashboard (not redirect away)
    await expect(page).toHaveURL(/\/broker\/dashboard/, { timeout: 8_000 });

    // Wait for data to load — the "Active Listings" card label is the earliest stable signal
    await page.waitForSelector('text=Active Listings', { timeout: 12_000 });

    // Business assertion: all 5 card labels must be visible
    await expect(page.getByText(/active listings/i).first()).toBeVisible();
    await expect(page.getByText(/avg quality/i).first()).toBeVisible();
    await expect(page.getByText(/needs fixes/i).first()).toBeVisible();
    await expect(page.getByText(/missing location/i).first()).toBeVisible();
    await expect(page.getByText(/buyer-ready/i).first()).toBeVisible();
  });

  // ── BD2 — 'Start here today' and 'Broker workspaces' sections ─────────────
  test('BD2 — "Start here today" and "Broker workspaces" sections are present', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping BD2');

    await page.goto('/broker/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Start here today', { timeout: 12_000 });

    // Business assertion: action section headings
    await expect(page.getByText(/start here today/i)).toBeVisible();
    await expect(page.getByText(/broker workspaces/i)).toBeVisible();

    // Demand gap limited-data tile must appear (AC5 proof in real browser)
    await expect(page.getByText(/possible demand gap/i)).toBeVisible();
    await expect(page.getByText(/limited data/i).first()).toBeVisible();

    // Engagement 'coming soon' (AC4 proof)
    await expect(page.getByText(/engagement tracking coming soon/i)).toBeVisible();
  });

  // ── BD3 — listing-quality link is disabled ────────────────────────────────
  test('BD3 — no live anchor to /broker/listing-quality; "Details coming soon" is shown', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping BD3');

    await page.goto('/broker/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Avg Quality', { timeout: 12_000 });

    // Business assertion: disabled quality CTA present
    await expect(page.getByText(/details coming soon/i)).toBeVisible();

    // No active link to /broker/listing-quality must exist in the summary cards
    const qualityLink = page.locator('[aria-live="polite"] a[href="/broker/listing-quality"]');
    await expect(qualityLink).toHaveCount(0);
  });

  // ── BD4 — Drafts workspace navigates to /broker/listings?status=DRAFT ─────
  test('BD4 — clicking Drafts workspace card navigates to /broker/listings?status=DRAFT', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping BD4');

    await page.goto('/broker/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Broker workspaces', { timeout: 12_000 });

    // Click the "Drafts" workspace nav card
    const draftsLink = page.getByRole('link', { name: /drafts/i });
    await expect(draftsLink).toBeVisible();
    await draftsLink.click();

    // Business assertion: navigated to the drafts-filtered listings page
    await expect(page).toHaveURL(/\/broker\/listings(\?.*status=DRAFT|.*status=DRAFT.*)/, { timeout: 8_000 });

    // Confirm we're on the listings page — not a blank or error page
    await expect(page.getByRole('heading', { name: /my listings/i })).toBeVisible({ timeout: 8_000 });
  });
});
