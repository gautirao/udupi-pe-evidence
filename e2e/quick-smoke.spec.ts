/**
 * Quick 5-Step Smoke — automated with Playwright (real Chromium)
 *
 * Covers: Q1 app load · Q2 auth redirect · Q3 login · Q4 CORS · Q5 ingestion 401
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=you@example.com SMOKE_USER_PASSWORD=secret npm run test:e2e
 *
 * With a custom backend URL:
 *   BACKEND_BASE_URL=https://udupi-property-explorer.onrender.com \
 *   SMOKE_USER_EMAIL=you@example.com \
 *   SMOKE_USER_PASSWORD=secret \
 *   npm run test:e2e
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { hasRealCredentials } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read once at module level — never logged or exposed.
const BACKEND =
  process.env.BACKEND_BASE_URL ??
  'https://udupi-property-explorer.onrender.com';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

/**
 * Resolve the listing ID for Q7.
 * Priority:
 *   1. SMOKE_LISTING_ID env var (explicit override)
 *   2. e2e/.test-listing-id written by global-setup (first line = UUID)
 *   3. Empty string → Q7 will skip itself
 */
function getListingId(): string {
  if (process.env.SMOKE_LISTING_ID) return process.env.SMOKE_LISTING_ID;
  const idFile = path.join(__dirname, '.test-listing-id');
  if (fs.existsSync(idFile)) return fs.readFileSync(idFile, 'utf-8').trim().split('\n')[0];
  return '';
}

/**
 * Returns 'LIVE' or 'DRAFT'.
 * When SMOKE_LISTING_ID is explicitly set, assume LIVE.
 * Otherwise read line 2 of .test-listing-id.
 */
function getListingStatus(): 'LIVE' | 'DRAFT' {
  if (process.env.SMOKE_LISTING_ID) return 'LIVE';
  const idFile = path.join(__dirname, '.test-listing-id');
  if (fs.existsSync(idFile)) {
    const line2 = fs.readFileSync(idFile, 'utf-8').trim().split('\n')[1]?.trim();
    return line2 === 'LIVE' ? 'LIVE' : 'DRAFT';
  }
  return 'DRAFT';
}

const smokListingId = getListingId();
const smokeListingStatus = getListingStatus();

// @smoke
// ---------------------------------------------------------------------------
// Q1 — App loads; no blank screen; Sentry error boundary not triggered
// ---------------------------------------------------------------------------
test('Q1 — app loads without blank screen or JS error banner', async ({ page }) => {
  await page.goto('/');
  // Wait for React to render — LandingPage shows a spinner (SVG, no text) until
  // auth state resolves, so domcontentloaded fires before any text is present.
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 10_000 });

  const bodyText = await page.locator('body').textContent();
  expect(bodyText?.trim().length, 'page body appears blank').toBeGreaterThan(0);

  // Sentry error boundary fallback text must not be present
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Q2 — Protected route redirects to login when unauthenticated
// ---------------------------------------------------------------------------
test('Q2 — /dealer/listings/new redirects to /auth when not logged in', async ({ page }) => {
  await page.goto('/dealer/listings/new');
  // React Router loads, ProtectedRoute waits for Supabase auth to initialise
  // (isLoading true → false), then redirects unauthenticated users to /auth.
  // Allow up to 10 s for the Supabase session check to complete.
  await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// Q3 — Login with valid credentials succeeds (skipped if creds not set)
// ---------------------------------------------------------------------------
test('Q3 — login with valid credentials succeeds', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set or placeholder — skipping Q3');

  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');

  // Use stable id attributes from Auth.tsx (sign-in tab is active by default)
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(userEmail);
  await page.locator('#signin-password').fill(userPassword);

  // Submit: prefer button[type="submit"], fallback to text
  const submitBtn = page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first();
  await submitBtn.click();

  // Must redirect away from /auth within 10 s on success
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });

  // No error toast indicating invalid credentials
  await expect(
    page.locator('[role="alert"]').filter({ hasText: /invalid|error/i }),
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Q4 — No CORS errors while navigating through app pages
// ---------------------------------------------------------------------------
test('Q4 — no CORS errors navigating through Home and Insights', async ({ page }) => {
  const corsErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (
        text.includes('CORS') ||
        text.includes('Access-Control-Allow-Origin') ||
        text.includes('blocked by CORS policy') ||
        text.includes('has been blocked by CORS')
      ) {
        corsErrors.push(text);
      }
    }
  });

  for (const path of ['/', '/insights']) {
    await page.goto(path);
    try {
      // networkidle settles after all XHR/fetch activity; tolerate timeout on
      // long-polling connections by catching and proceeding.
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      // Non-fatal — proceed with whatever errors were collected so far.
    }
  }

  if (corsErrors.length > 0) {
    throw new Error(`CORS policy errors detected:\n${corsErrors.join('\n')}`);
  }
});

// ---------------------------------------------------------------------------
// Q5 — Unauthenticated POST to ingestion endpoint is rejected (401 or 403)
// ---------------------------------------------------------------------------
test('Q5 — unauthenticated ingestion POST returns 401 or 403', async ({ page }) => {
  // Load the frontend first so the fetch runs from the same origin (CORS applies).
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const result = await page.evaluate(async (backendUrl: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/ingestion/ingest-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[]',
      });
      return { status: res.status, error: null };
    } catch (e) {
      return { status: null, error: String(e) };
    }
  }, BACKEND);

  if (result.error) {
    throw new Error(`Fetch to ingestion endpoint failed (CORS or network error): ${result.error}`);
  }

  expect(
    [401, 403],
    `Expected 401 or 403 from ingestion endpoint, got ${result.status}`,
  ).toContain(result.status);
});

// ---------------------------------------------------------------------------
// Q6 — Logged-out nav: dealer-specific and admin links are not visible
// ---------------------------------------------------------------------------
test('Q6 — logged-out: role-specific nav links are not present', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');


  // Dealer-only nav links must NOT appear
  await expect(page.getByRole('link', { name: /my listings/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /new listing/i })).toHaveCount(0);

  // Admin-only nav links must NOT appear
  await expect(page.getByRole('link', { name: /feed runs/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /facebook groups/i })).toHaveCount(0);

  // Since #615, / is no longer protected — unauthenticated users see the teaser home page.
  // Confirm the login CTA is present (anonymous home loaded correctly).
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Q7 — Booking duplicate: second request to same listing returns error
//      Skipped if SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD / SMOKE_LISTING_ID not set
// ---------------------------------------------------------------------------
test.describe('@smoke Q7 — user-authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('Q7 — duplicate booking request is rejected', async ({ page }) => {
  test.skip(!hasUserCreds || !smokListingId, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set or placeholder, or SMOKE_LISTING_ID missing — skipping Q7');
  test.skip(
    smokeListingStatus !== 'LIVE',
    'Test listing is not LIVE (admin approval required for bookings) — skipping Q7',
  );
  // When using the auto-created fixture (no explicit SMOKE_LISTING_ID), L4 in
  // listing-lifecycle.spec.ts runs the same test concurrently, causing a race on the
  // unique booking constraint. Skip Q7 in that case to avoid the conflict.
  test.skip(
    !process.env.SMOKE_LISTING_ID,
    'Auto-fixture present — L4 in listing-lifecycle.spec.ts covers this; skipping Q7',
  );

  // Duplicate constraint is per (listing, user) — any second active booking on the same
  // listing returns 409 regardless of requested date or time slot.
  const BOOKING_DATE_Q7 = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  })();

  // Navigate to the listing detail page
  await page.goto(`/listing/${smokListingId}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Open the RequestViewingModal
  await page.getByRole('button', { name: /request viewing/i }).click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });

  // Fill date and time slot then submit first request
  await page.locator('#requested-date').fill(BOOKING_DATE_Q7);
  await page.locator('#time-slot').click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: /send request/i }).click();

  // Branch: if an active booking already exists for this listing+user the backend
  // returns 409 immediately and the modal shows an inline error.
  const inlineError = page.locator('[role="dialog"] .text-destructive');
  const alreadyHasBooking = await inlineError
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (alreadyHasBooking) {
    // Prior active booking existed — duplicate constraint already proven
    await expect(inlineError).toBeVisible();
  } else {
    // First request succeeded — wait for success toast
    await expect(page.getByText(/viewing request sent/i).first()).toBeVisible({ timeout: 10_000 });

    // Reopen the modal and submit a second (duplicate) booking request
    await page.getByRole('button', { name: /request viewing/i }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });

    await page.locator('#requested-date').fill(BOOKING_DATE_Q7);
    await page.locator('#time-slot').click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: /send request/i }).click();

    // Second request must show the inline error (duplicate active booking per listing+user)
    await expect(inlineError).toBeVisible({ timeout: 10_000 });
  }
  });
});

// ---------------------------------------------------------------------------
// N3 — Unknown route renders the 404 Not Found page
//      Auth-free: the * route is outside ProtectedRoute.
//      Moved from nav-roles.spec.ts so it runs in the smoke gate without
//      pulling in the auth-dependent N1/N2 tests.
// ---------------------------------------------------------------------------
test('N3 — unknown route renders 404 Not Found page', async ({ page }) => {
  await page.goto('/this-route-does-not-exist-e2e-abc123');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByText('404')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 8_000 });
});
