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

// Read once at module level — never logged or exposed.
const BACKEND =
  process.env.BACKEND_BASE_URL ??
  'https://udupi-property-explorer.onrender.com';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

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
  test.skip(
    !userEmail || !userPassword,
    'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping Q3',
  );

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
