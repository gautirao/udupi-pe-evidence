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

// ---------------------------------------------------------------------------
// Q1 — App loads; no blank screen; Sentry error boundary not triggered
// ---------------------------------------------------------------------------
test('Q1 — app loads without blank screen or JS error banner', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

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

  // Wait for auth state to resolve (ProtectedRoute may briefly show loading state)
  await page.waitForTimeout(2_000);

  // Dealer-only nav links must NOT appear
  await expect(page.getByRole('link', { name: /my listings/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /new listing/i })).toHaveCount(0);

  // Admin-only nav links must NOT appear
  await expect(page.getByRole('link', { name: /feed runs/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /facebook groups/i })).toHaveCount(0);

  // Since #615, / is no longer protected — unauthenticated users see the teaser home page.
  // Confirm the login CTA is present (anonymous home loaded correctly).
  await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Q7 — Booking duplicate: second request to same listing returns error
//      Skipped if SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD / SMOKE_LISTING_ID not set
// ---------------------------------------------------------------------------
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

  // Log in
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').fill(userEmail);
  await page.locator('#signin-password').fill(userPassword);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });

  // Navigate to the listing detail page
  await page.goto(`/listing/${smokListingId}`);
  await page.waitForLoadState('domcontentloaded');

  // First booking request — submit directly via API from browser context
  const firstResult = await page.evaluate(
    async ({ backendUrl, listingId }: { backendUrl: string; listingId: string }) => {
      // Get Supabase session token from localStorage
      const keys = Object.keys(localStorage);
      const authKey = keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (!authKey) return { status: null, error: 'No Supabase auth token in localStorage' };

      let token: string | null = null;
      try {
        const parsed = JSON.parse(localStorage.getItem(authKey) ?? '{}');
        token = parsed?.access_token ?? null;
      } catch {
        return { status: null, error: 'Failed to parse auth token' };
      }

      if (!token) return { status: null, error: 'access_token is null' };

      // Pick a date 2 days from now
      const d = new Date();
      d.setDate(d.getDate() + 2);
      const requestedDate = d.toISOString().split('T')[0];

      const body = JSON.stringify({
        listingId,
        requestedDate,
        requestedTimeSlot: '10:00-11:00',
      });

      try {
        const r = await fetch(`${backendUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body,
        });
        return { status: r.status, error: null };
      } catch (e) {
        return { status: null, error: String(e) };
      }
    },
    { backendUrl: BACKEND, listingId: smokListingId },
  );

  if (firstResult.error) {
    throw new Error(`First booking request failed unexpectedly: ${firstResult.error}`);
  }

  // First request should succeed (201) or already exist (409 if run before — acceptable)
  expect(
    [201, 409],
    `Expected 201 or 409 from first booking, got ${firstResult.status}`,
  ).toContain(firstResult.status);

  // Second request — must be rejected with 409 (duplicate active booking)
  const secondResult = await page.evaluate(
    async ({ backendUrl, listingId }: { backendUrl: string; listingId: string }) => {
      const keys = Object.keys(localStorage);
      const authKey = keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (!authKey) return { status: null, error: 'No Supabase auth token' };

      let token: string | null = null;
      try {
        const parsed = JSON.parse(localStorage.getItem(authKey) ?? '{}');
        token = parsed?.access_token ?? null;
      } catch {
        return { status: null, error: 'Failed to parse auth token' };
      }

      if (!token) return { status: null, error: 'access_token is null' };

      const d = new Date();
      d.setDate(d.getDate() + 3); // different date, same listing
      const requestedDate = d.toISOString().split('T')[0];

      try {
        const r = await fetch(`${backendUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            listingId,
            requestedDate,
            requestedTimeSlot: '11:00-12:00',
          }),
        });
        return { status: r.status, error: null };
      } catch (e) {
        return { status: null, error: String(e) };
      }
    },
    { backendUrl: BACKEND, listingId: smokListingId },
  );

  if (secondResult.error) {
    throw new Error(`Second booking request failed unexpectedly: ${secondResult.error}`);
  }

  expect(
    secondResult.status,
    `Expected 409 (duplicate active booking) from second request, got ${secondResult.status}`,
  ).toBe(409);
});
