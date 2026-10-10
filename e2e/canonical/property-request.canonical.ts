/**
 * Request-a-property (#1793) — RQ1 buyer submits, RQ2 admin sees it, masked (J12), issue #2750 PR-1 C2.
 *
 * ENVIRONMENT: the feature is DARK BY DEFAULT in production. The canonical TEST STACK turns it on in exactly two places, both in
 * scripts/run-e2e-gate.sh (which ci.yml also runs, so CI cannot drift): the BUILD-TIME frontend flag VITE_PROPERTY_REQUESTS_ENABLED
 * (exported before the build the suite serves) and the backend flag PROPERTY_REQUESTS_ENABLED plus a per-run PHONE_ENCRYPTION_KEY
 * (in the backend subshell only). FC-14 (scripts/e2e/check-canonical-journeys.mjs) requires both there and keeps every production
 * default false. Run outside the gate (no flags) these two tests fail loudly on the missing card / the missing admin route; they
 * are not skipped.
 *
 * RQ1 [role:user]  on a deterministic ZERO-RESULT Discover surface (Bangalore / Avalahalli: a real navigation node with no listing
 *                  in the canonical fixture) the Request-a-property card opens, a real request is submitted (the POST reaches the
 *                  real backend and is seen by installNoApiMockGuard), and the success state replaces the card.
 * RQ2 [role:admin] /admin/property-requests lists THAT request - matched by the id the POST returned and by its unique
 *                  requirement token - with the contact MASKED (+91******<last4>); the plaintext number appears nowhere: not in
 *                  the page text, not in the page HTML, not in the API response the page itself fetched.
 *
 * HAND-OFF BETWEEN THE TWO: RQ1 runs in canonical-user and RQ2 in canonical-admin, and projects do not share module state, so RQ1
 * writes its created request (id, unique token, last four digits) to a file under test-results/canonical/ - Playwright wipes that
 * directory at the start of every run, so a file can only be this run's. canonical-admin follows canonical-user in the project
 * list (single worker), and RQ2 FAILS with an explicit message - never skips - if the file is absent.
 *
 * FALSIFIABLE:
 *   - RQ1 PRE-STATE: the surface is the zero-result recovery (not an error, not a populated list), the card starts COLLAPSED
 *     (aria-expanded=false) and no success status exists; consent is required before Send is enabled.
 *   - RQ1: the POST must be 201 and carry no phone in its response (PropertyRequestCreatedResponse: id, status, createdAt).
 *   - RQ2: a row for a DIFFERENT id/token, or an unmasked number, fails (mutation proof: evidence/c2/mutations.txt).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from './support/canonical-test';
import type { Page } from './support/canonical-test';

const POST_PATH = '/api/public/property-requests';
const ADMIN_LIST_PATH = '/api/admin/property-requests';
const CARD_TESTID = 'request-property-card';
const CARD_CTA_TEXT = 'Request a property';

const AREA_URL = '/discover?city=bangalore&node=' + encodeURIComponent('a:IN|KA|Bengaluru|Avalahalli');

const HANDOFF_FILE = path.join(process.cwd(), 'test-results', 'canonical', 'handoff', 'rq1-created-request.json');

interface Rq1Handoff {
  id: string;
  token: string;
  last4: string;
  national: string;
  e164: string;
}

/** A unique, letters+digits-only requirement token (no phone-like digit runs: the server rejects numbers in free text). */
function uniqueToken(): string {
  const t = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.replace(/[^a-z0-9]/g, '');
  return `CANRQ${t}`.toUpperCase();
}

/** A distinct 10-digit Indian mobile per run (starts with 9). */
function uniquePhone(): { national: string; e164: string; last4: string } {
  const tail = String((Date.now() % 100_000_000) * 10 + Math.floor(Math.random() * 10)).padStart(9, '0').slice(-9);
  const national = `9${tail}`;
  return { national, e164: `+91${national}`, last4: national.slice(-4) };
}

async function declineConsentIfPresent(page: Page) {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

test('[role:user] RQ1 — on a zero-result Discover surface the Request-a-property card submits a real request and shows success', async ({ page, backendTraffic }) => {
  const token = uniqueToken();
  const phone = uniquePhone();

  // ── The surface is a GENUINE zero (not an error, not a populated list) ──
  await page.goto(AREA_URL);
  await declineConsentIfPresent(page);
  await expect(page.getByTestId('area-zero-result-recovery'), 'the Avalahalli node must be the zero-result recovery surface').toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('area-listings-error')).toHaveCount(0);

  // ── The card starts collapsed; opening it proves the form is really there ──
  const card = page.getByTestId(CARD_TESTID);
  await expect(card).toBeVisible({ timeout: 30_000 });
  const cta = card.getByRole('button', { name: CARD_CTA_TEXT });
  await expect(cta).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('status').filter({ hasText: 'Request received' }), 'PRE-STATE: no success status before submitting').toHaveCount(0);
  await cta.click();
  await expect(cta).toHaveAttribute('aria-expanded', 'true');
  const send = card.getByRole('button', { name: 'Send request' });
  await expect(send).toBeVisible();

  // ── Fill it in. Consent is required: Send stays disabled until it is ticked ──
  const requirement = `Need 2BHK near metro ${token}`;
  await card.getByLabel('What are you looking for?').fill(requirement);
  await card.getByLabel('Minimum budget').fill('5000000');
  await card.getByLabel('Maximum budget').fill('9000000');
  await card.getByLabel('Phone number').fill(phone.national);
  const whatsapp = card.getByRole('radio', { name: 'WhatsApp' });
  await whatsapp.click();
  await expect(whatsapp).toHaveAttribute('aria-checked', 'true');
  await expect(send, 'Send must be disabled until consent is given').toBeDisabled();
  const consent = card.getByRole('checkbox');
  await consent.click();
  await expect(consent).toHaveAttribute('aria-checked', 'true');
  await expect(send).toBeEnabled();

  // ── Submit: the REAL POST reaches the REAL backend ──
  const postP = page.waitForResponse((r) => r.url().endsWith(POST_PATH) && r.request().method() === 'POST', { timeout: 30_000 });
  await send.click();
  const postResp = await postP;
  expect(postResp.status(), 'POST /api/public/property-requests must be 201').toBe(201);
  const created = (await postResp.json()) as { id?: string; status?: string; phone?: unknown };
  expect(created.id, 'the 201 body must carry the created request id').toBeTruthy();
  expect(created.status).toBe('RECEIVED');
  expect(JSON.stringify(created), 'the 201 body must never echo the phone').not.toContain(phone.national);

  // ── Success is shown and the card is gone ──
  await expect(page.getByRole('status').filter({ hasText: 'Request received' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);

  // ── The no-mock guard SAW that POST (it records every request that reached the backend origin through the page) ──
  expect(
    backendTraffic.interceptedBackendRequests.some((u) => u.endsWith(POST_PATH)),
    `installNoApiMockGuard must have observed the real POST ${POST_PATH}; saw: ${backendTraffic.interceptedBackendRequests.filter((u) => u.includes('property-requests')).join(', ') || '(none)'}`,
  ).toBe(true);

  // ── Hand the created request to RQ2 ──
  const handoff: Rq1Handoff = { id: String(created.id), token, last4: phone.last4, national: phone.national, e164: phone.e164 };
  fs.mkdirSync(path.dirname(HANDOFF_FILE), { recursive: true });
  fs.writeFileSync(HANDOFF_FILE, JSON.stringify(handoff));
});

test('[role:admin] RQ2 — /admin/property-requests lists the request RQ1 submitted, with the contact masked', async ({ page }) => {
  if (!fs.existsSync(HANDOFF_FILE)) {
    throw new Error(
      `[RQ2] ${HANDOFF_FILE} does not exist: RQ1 (canonical-user) must run first in the same run and write it. ` +
      'This is a hard failure, not a skip; if RQ1 failed, fix it first.',
    );
  }
  const rq1 = JSON.parse(fs.readFileSync(HANDOFF_FILE, 'utf8')) as Rq1Handoff;
  expect(rq1.id && rq1.token && rq1.last4, 'the RQ1 hand-off must carry id, token and last4').toBeTruthy();

  // This page is admin-authenticated from the canonical-admin project's storageState. The route exists only in a build with the
  // frontend flag on, so landing on the heading proves the flag, the guard (requireAdmin) and the session in one step.
  const listP = page.waitForResponse((r) => r.url().includes(ADMIN_LIST_PATH) && r.request().method() === 'GET', { timeout: 30_000 });
  await page.goto('/admin/property-requests');
  const listResp = await listP;
  expect(listResp.ok(), 'GET /api/admin/property-requests must respond 2xx').toBe(true);
  await expect(page.getByRole('heading', { name: 'Property Requests', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });

  // ── The API response the page fetched holds THIS request, by id, masked ──
  const rawList = await listResp.text();
  const list = JSON.parse(rawList) as Array<{ id: string; requirement?: string; phoneMasked?: string; contactVia?: string; status?: string }>;
  expect(Array.isArray(list) && list.length > 0, 'CONTROL: the admin list must be non-empty').toBe(true);
  const mine = list.find((r) => r.id === rq1.id);
  expect(mine, `request ${rq1.id} must be in the admin list (ids: ${list.map((r) => r.id).join(', ')})`).toBeTruthy();
  expect(mine?.requirement).toContain(rq1.token);
  expect(mine?.phoneMasked, 'the contact must be masked to the last four digits').toBe(`+91******${rq1.last4}`);
  expect(mine?.contactVia).toBe('WHATSAPP');
  expect(rawList, 'the admin API response must never carry the plaintext number').not.toContain(rq1.national);

  // ── The page renders that row, masked, and the plaintext is nowhere in text or HTML ──
  const row = page.getByRole('row').filter({ hasText: rq1.token });
  await expect(row, 'the admin table must render the row for RQ1\'s unique requirement token').toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(`+91******${rq1.last4}`);
  await expect(row).toContainText('WhatsApp');
  await expect(row).toContainText('Avalahalli');
  const text = await page.evaluate(() => document.body.innerText);
  const html = await page.content();
  for (const secret of [rq1.national, rq1.e164]) {
    expect(text, 'plaintext phone must not appear in the admin page text').not.toContain(secret);
    expect(html, 'plaintext phone must not appear in the admin page HTML').not.toContain(secret);
  }
});
