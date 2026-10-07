/**
 * E2E: Issue #1793 PR-C — "Request a property" card (zero-result recovery) + admin list.
 *
 * GATING (CI-safe): this file needs an ISOLATED stack — a Vite build with
 * VITE_PROPERTY_REQUESTS_ENABLED=true, a backend with PROPERTY_REQUESTS_ENABLED=true (and a throwaway
 * PHONE_ENCRYPTION_KEY), a throwaway Postgres reachable via `docker exec`, and an admin JWT the backend
 * accepts. The default CI/pre-push stack runs with the feature flag OFF (dark by default), so the whole
 * file is skipped unless PROPERTY_REQUEST_E2E=1. A skip is NOT a pass; the isolated run is what proves it.
 *
 * Env (all set by the isolated-stack runner):
 *   PROPERTY_REQUEST_E2E=1
 *   PROPERTY_REQUEST_E2E_PG_CONTAINER        docker container name of the throwaway Postgres
 *   PROPERTY_REQUEST_E2E_ADMIN_JWT           access token of a throwaway admin
 *   PROPERTY_REQUEST_E2E_ADMIN_USER_ID       that admin's user id
 *
 * Real backend + real DB for T1/T2/T3/T8. Only T4 (listings 500), T5 (listings delay) and T7 (POST
 * outcomes) intercept a request, and only the ONE request under test. Admin auth: a Supabase session is
 * injected into localStorage and ONLY the dummy Supabase origin is intercepted (role lookup); every
 * backend call stays real.
 *
 * Every negative ("card never seen") is paired with a positive proof that the surface rendered, and each
 * failure arm has a genuine-zero arm in which the SAME MutationObserver is asserted to SEE the card.
 */
import { execFileSync } from 'node:child_process';
import { test, expect, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';

test.use({ storageState: undefined });

const PG_CONTAINER = process.env.PROPERTY_REQUEST_E2E_PG_CONTAINER ?? '';
const ADMIN_JWT = process.env.PROPERTY_REQUEST_E2E_ADMIN_JWT ?? '';
const ADMIN_USER_ID = process.env.PROPERTY_REQUEST_E2E_ADMIN_USER_ID ?? '';
const SUPABASE_DUMMY_ORIGIN = 'http://127.0.0.1:54399';

const enc = encodeURIComponent;
const AREA_URL = `/discover?city=bangalore&node=${enc('a:IN|KA|Bengaluru|Avalahalli')}`;
const SCHOOL_ID = 'f1713003-0000-0000-0000-000000000004';
const SCHOOL_NAME = '[E2E] Koramangala Fixture CBSE School';
const SCHOOL_URL = `/discover?city=bangalore&journey=school-first&schoolId=${SCHOOL_ID}&radiusKm=3`;
const MAP_URL =
  `/discover?city=udupi&node=${enc('a:IN|KA|Udupi|Manipal')}&lat=13.35&lon=74.79&zoom=14` +
  `&rscope=vp&rvp=${enc('13.300,74.700,13.310,74.710')}`;
const ADMIN_URL = '/admin/property-requests';

const POST_PATH = '/api/public/property-requests';
const CARD_TESTID = 'request-property-card';
const CARD_CTA_TEXT = 'Request a property';
const CONSENT_VERSION = 'property-request-v1';
const PHONE_IN_REQUIREMENT_MESSAGE = 'Please enter contact numbers only in the Phone / WhatsApp field.';

const AREA_ERROR_TESTIDS = ['area-listings-error', 'areas-journey-panel-listings-error'];
const VIEWPORT_ERROR_TESTIDS = [...AREA_ERROR_TESTIDS, 'anon-viewport-error'];
const VIEWPORT_ZERO_TEXT = 'No matching homes in the visible map area';

// ── helpers ────────────────────────────────────────────────────────────────────

let uniqueCounter = 0;
/** Letters+digits only (safe to splice into SQL: generated here, never from page data). */
function uniqueToken(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uniqueCounter}${Math.random().toString(36).slice(2, 7)}`
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

/** A distinct 10-digit Indian mobile per call (starts 9, last digits from time+counter). */
function uniquePhone(): { national: string; e164: string; last4: string } {
  uniqueCounter += 1;
  const tail = String((Date.now() % 100_000_000) * 10 + (uniqueCounter % 10)).padStart(9, '0').slice(-9);
  const national = `9${tail}`;
  return { national, e164: `+91${national}`, last4: national.slice(-4) };
}

function psqlJson(sql: string): Array<Record<string, unknown>> {
  const out = execFileSync('docker', ['exec', PG_CONTAINER, 'psql', '-U', 'postgres', '-At', '-c', sql], {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

async function requestRowsByToken(token: string): Promise<Array<Record<string, unknown>>> {
  expect(token).toMatch(/^[A-Z0-9]+$/);
  return psqlJson(
    `SELECT row_to_json(t) FROM (SELECT id, journey, intent, city, area_key, area_label, requirement, ` +
      `budget_min, budget_max, phone_enc, contact_via, consent_version, status ` +
      `FROM public.property_requests WHERE requirement LIKE '%${token}%') t`,
  );
}

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

async function disarm(page: Page) {
  await page
    .evaluate(() => {
      (window as unknown as { __prcArmed?: boolean }).__prcArmed = false;
    })
    .catch(() => undefined);
}

async function seen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __prcSeen?: string[] }).__prcSeen ?? []);
}

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function isViewportListingsRequest(url: string): boolean {
  return /\/api\/discover\/cities\/[^/]+\/listings/.test(url) && url.includes('bbox=');
}
function isAreaListingsRequest(url: string): boolean {
  return /\/api\/discover\/cities\/[^/]+\/listings/.test(url) && !url.includes('bbox=');
}
function isSchoolRadiusRequest(url: string): boolean {
  return url.includes('/school-radius-listings');
}

/** Counts POSTs to the property-request endpoint and records their headers. */
function trackPosts(page: Page) {
  const posts: Array<{ headers: Record<string, string> }> = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes(POST_PATH)) {
      void r.allHeaders().then((headers) => posts.push({ headers }));
    }
  });
  return posts;
}

async function openSchoolPanel(page: Page) {
  const lookup = page.waitForResponse(
    (r) => r.url().includes(`/api/public/schools/${SCHOOL_ID}`) && r.request().method() === 'GET',
    { timeout: 30_000 },
  );
  await page.goto(SCHOOL_URL);
  await declineConsentIfPresent(page);
  expect((await lookup).status(), `fixture school ${SCHOOL_ID} must resolve`).toBe(200);
  await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Where do you want schools?' })).toHaveCount(0);
  await expect(page.getByText(SCHOOL_NAME).first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('schoolId')).toBe(SCHOOL_ID);
}

/** Expands the card and PROVES the form opened. Returns the card locator. */
async function expandCard(page: Page) {
  const card = page.getByTestId(CARD_TESTID);
  await expect(card).toBeVisible({ timeout: 30_000 });
  const cta = card.getByRole('button', { name: CARD_CTA_TEXT });
  await expect(cta).toHaveAttribute('aria-expanded', 'false');
  await cta.click();
  await expect(cta).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('button', { name: 'Send request' })).toBeVisible();
  return card;
}

interface FormInput {
  requirement?: string;
  budgetMin?: string;
  budgetMax?: string;
  phone: string;
  whatsapp?: boolean;
  consent?: boolean;
}

async function fillForm(page: Page, input: FormInput) {
  const card = page.getByTestId(CARD_TESTID);
  if (input.requirement !== undefined) {
    await card.getByLabel('What are you looking for?').fill(input.requirement);
    await expect(card.getByLabel('What are you looking for?')).toHaveValue(input.requirement);
  }
  if (input.budgetMin) {
    await card.getByLabel('Minimum budget').fill(input.budgetMin);
    await expect(card.getByLabel('Minimum budget')).toHaveValue(input.budgetMin);
  }
  if (input.budgetMax) {
    await card.getByLabel('Maximum budget').fill(input.budgetMax);
    await expect(card.getByLabel('Maximum budget')).toHaveValue(input.budgetMax);
  }
  await card.getByLabel('Phone number').fill(input.phone);
  await expect(card.getByLabel('Phone number')).toHaveValue(input.phone);
  if (input.whatsapp) {
    const radio = card.getByRole('radio', { name: 'WhatsApp' });
    await radio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'true');
  }
  if (input.consent !== false) {
    const box = card.getByRole('checkbox');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
  }
}

const successStatus = (page: Page) => page.getByRole('status').filter({ hasText: 'Request received' });

/** Click Send and PROVE it was clicked from an enabled button; returns once the click was issued. */
async function clickSend(page: Page) {
  const send = page.getByTestId(CARD_TESTID).getByRole('button', { name: 'Send request' });
  await expect(send).toBeEnabled();
  await send.click();
}

/** Browser context holding an injected admin Supabase session (dummy Supabase origin only). */
async function newAdminContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  expect(ADMIN_JWT, 'PROPERTY_REQUEST_E2E_ADMIN_JWT must be set').not.toBe('');
  expect(ADMIN_USER_ID, 'PROPERTY_REQUEST_E2E_ADMIN_USER_ID must be set').not.toBe('');
  const ctx = await browser.newContext({ baseURL });
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: ADMIN_JWT,
    token_type: 'bearer',
    expires_in: 6 * 3600,
    expires_at: now + 6 * 3600,
    refresh_token: 'prc-local-not-a-refresh-token',
    user: {
      id: ADMIN_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'prc-admin@fixture.invalid',
      app_metadata: {},
      user_metadata: {},
    },
  };
  await ctx.addInitScript((s) => {
    try {
      window.localStorage.setItem('sb-127-auth-token', JSON.stringify(s));
      window.localStorage.setItem('discover-telemetry-consent', 'denied');
    } catch {
      /* storage unavailable */
    }
  }, session);
  await ctx.route(`${SUPABASE_DUMMY_ORIGIN}/**`, async (route) => {
    const url = route.request().url();
    const obj = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    if (url.includes('/rest/v1/user_roles')) {
      return fulfillJson(route, 200, obj ? { role: 'admin' } : [{ role: 'admin' }]);
    }
    if (url.includes('/rest/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: obj ? 'null' : '[]' });
    }
    if (url.includes('/auth/v1/user')) return fulfillJson(route, 200, session.user);
    return fulfillJson(route, 404, {});
  });
  return ctx;
}

async function openAdminList(page: Page) {
  await page.goto(ADMIN_URL);
  await expect(page.getByRole('heading', { name: 'Property Requests' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
}

/** Wait for the By Area page to settle on the genuine zero-result surface. */
async function openAreaZero(page: Page) {
  await page.goto(AREA_URL);
  await declineConsentIfPresent(page);
  await expect(page.getByTestId('area-zero-result-recovery')).toBeVisible({ timeout: 40_000 });
}

/** Arms the observer when the matching listings request is issued, then lets it hit the REAL backend. */
async function armOnRealRequest(page: Page, matches: (url: string) => boolean): Promise<() => number> {
  let n = 0;
  await page.route('**/api/discover/cities/**', async (route) => {
    if (matches(route.request().url())) {
      n += 1;
      await arm(page);
    }
    return route.fallback();
  });
  return () => n;
}

// ── tests ──────────────────────────────────────────────────────────────────────

test.describe('#1793 PR-C — property request card + admin list (isolated stack)', () => {
  test.skip(
    process.env.PROPERTY_REQUEST_E2E !== '1',
    'needs the isolated stack: VITE_PROPERTY_REQUESTS_ENABLED=true + backend PROPERTY_REQUESTS_ENABLED=true + throwaway DB/admin',
  );
  test.setTimeout(150_000);

  test.beforeEach(async ({ page }) => {
    await seedConsentDenied(page);
  });

  test('T1: By Area genuine zero -> card -> submit -> success; row persisted encrypted; admin shows masked phone only', async ({
    page,
    browser,
    baseURL,
  }) => {
    await watchCard(page);
    const areaReq = await armOnRealRequest(page, isAreaListingsRequest);
    const posts = trackPosts(page);
    const token = uniqueToken('PRCT1');
    const phone = uniquePhone();

    await openAreaZero(page);
    expect(areaReq(), 'the real area listings request was issued').toBeGreaterThan(0);
    await expect(page.getByTestId('area-listings-error')).toHaveCount(0);
    const card = await expandCard(page);
    // Observer discrimination: on a genuine zero the SAME observer used by the failure arms sees the card.
    expect(await seen(page), 'observer must be able to see the card on a genuine zero').toEqual(
      expect.arrayContaining(['testid']),
    );
    const prefill = (await card.getByText(/^(Buy|Rent) · /).textContent()) ?? '';
    expect(prefill).toContain('Avalahalli');

    await fillForm(page, {
      requirement: `Need 2BHK near metro ${token}`,
      budgetMin: '5000000',
      budgetMax: '9000000',
      phone: phone.e164,
      whatsapp: true,
    });
    await clickSend(page);
    await expect(successStatus(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);

    // The real POST was anonymous: exactly one, with NO Authorization header (and headers were readable).
    await expect.poll(() => posts.length, { timeout: 5_000 }).toBe(1);
    expect(posts[0].headers['content-type']).toContain('application/json');
    expect(posts[0].headers['authorization'], 'anonymous POST must carry no Authorization header').toBeUndefined();

    // DB: persisted, encrypted at rest, context as prefilled.
    const rows = await requestRowsByToken(token);
    expect(rows, 'exactly one row for this unique requirement token').toHaveLength(1);
    const row = rows[0];
    expect(row.journey).toBe('AREA');
    expect(row.intent).toBe('BUY');
    expect(row.city).toBe('bangalore');
    expect(String(row.area_key)).toMatch(/avalahalli/i);
    expect(String(row.area_label)).toMatch(/avalahalli/i);
    expect(row.contact_via).toBe('WHATSAPP');
    expect(Number(row.budget_min)).toBe(5_000_000);
    expect(Number(row.budget_max)).toBe(9_000_000);
    expect(String(row.consent_version)).toBe(CONSENT_VERSION);
    expect(row.status).toBe('RECEIVED');
    const phoneEnc = String(row.phone_enc);
    expect(phoneEnc.startsWith('ENC:')).toBe(true);
    expect(phoneEnc).not.toContain(phone.national);
    expect(phoneEnc).not.toContain(phone.e164);
    console.log(
      `T1 DB EVIDENCE id=${String(row.id)} journey=${String(row.journey)} enc_prefix=${phoneEnc.slice(0, 4)} plaintext_present=false`,
    );

    // Admin list: row visible, masked phone only, plaintext nowhere in text or HTML.
    const adminCtx = await newAdminContext(browser, baseURL);
    try {
      const admin = await adminCtx.newPage();
      await openAdminList(admin);
      const adminRow = admin.getByRole('row').filter({ hasText: token });
      await expect(adminRow).toBeVisible({ timeout: 30_000 });
      await expect(adminRow).toContainText(`+91******${phone.last4}`);
      await expect(adminRow).toContainText('WhatsApp');
      await expect(adminRow).toContainText('Avalahalli');
      const text = await admin.evaluate(() => document.body.innerText);
      const html = await admin.content();
      for (const secret of [phone.national, phone.e164]) {
        expect(text, 'plaintext phone must not appear in admin text').not.toContain(secret);
        expect(html, 'plaintext phone must not appear in admin HTML').not.toContain(secret);
      }
    } finally {
      await adminCtx.close();
    }
  });

  test('T2: Schools genuine zero -> card -> submit -> success; DB journey=SCHOOL', async ({ page }) => {
    await watchCard(page);
    const radiusReq = await armOnRealRequest(page, isSchoolRadiusRequest);
    const token = uniqueToken('PRCT2');
    const phone = uniquePhone();

    await openSchoolPanel(page);
    await expect(page.getByTestId('school-radius-empty-state')).toBeVisible({ timeout: 40_000 });
    expect(radiusReq(), 'the real school-radius request was issued').toBeGreaterThan(0);
    await expect(page.getByTestId('school-radius-listings-error')).toHaveCount(0);
    await expandCard(page);
    expect(await seen(page)).toEqual(expect.arrayContaining(['testid']));

    await fillForm(page, { requirement: `School zero ${token}`, phone: phone.national });
    await clickSend(page);
    await expect(successStatus(page)).toBeVisible({ timeout: 30_000 });

    const rows = await requestRowsByToken(token);
    expect(rows).toHaveLength(1);
    expect(rows[0].journey).toBe('SCHOOL');
    expect(rows[0].intent).toBe('BUY');
    expect(rows[0].city).toBe('bangalore');
    expect(String(rows[0].phone_enc).startsWith('ENC:')).toBe(true);
    expect(String(rows[0].phone_enc)).not.toContain(phone.national);
    console.log(`T2 DB EVIDENCE id=${String(rows[0].id)} journey=${String(rows[0].journey)} area_label=${String(rows[0].area_label)}`);
  });

  test('T3: Map/viewport genuine zero -> card -> submit -> success; DB journey=MAP', async ({ page }) => {
    await watchCard(page);
    const vpReq = await armOnRealRequest(page, isViewportListingsRequest);
    const token = uniqueToken('PRCT3');
    const phone = uniquePhone();

    await page.goto(MAP_URL);
    await declineConsentIfPresent(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('rscope'), { timeout: 15_000 }).toBe('vp');
    await expect(page.getByText(VIEWPORT_ZERO_TEXT).first()).toBeVisible({ timeout: 40_000 });
    expect(vpReq(), 'the real viewport listings request was issued').toBeGreaterThan(0);
    for (const id of VIEWPORT_ERROR_TESTIDS) await expect(page.getByTestId(id)).toHaveCount(0);
    await expandCard(page);
    expect(await seen(page)).toEqual(expect.arrayContaining(['testid']));

    await fillForm(page, { requirement: `Map zero ${token}`, phone: phone.national });
    await clickSend(page);
    await expect(successStatus(page)).toBeVisible({ timeout: 30_000 });

    const rows = await requestRowsByToken(token);
    expect(rows).toHaveLength(1);
    expect(rows[0].journey).toBe('MAP');
    expect(rows[0].city).toBe('udupi');
    expect(rows[0].area_key, 'MAP scopes never invent an area key').toBeNull();
    expect(String(rows[0].phone_enc).startsWith('ENC:')).toBe(true);
    console.log(`T3 DB EVIDENCE id=${String(rows[0].id)} journey=${String(rows[0].journey)}`);
  });

  test.describe('T4: a backend 500 shows Error + Retry and the request card is NEVER present', () => {
    test('T4a By Area listings 500', async ({ page }) => {
      await watchCard(page);
      let requests = 0;
      await page.route('**/api/discover/cities/**', async (route) => {
        if (isAreaListingsRequest(route.request().url())) {
          requests += 1;
          await arm(page);
          return fulfillJson(route, 500, { error: 'simulated_failure' });
        }
        return route.fallback();
      });

      await page.goto(AREA_URL);
      await declineConsentIfPresent(page);
      const errorSurface = page.locator(AREA_ERROR_TESTIDS.map((id) => `[data-testid="${id}"]`).join(', '));
      await expect(errorSurface.first()).toBeVisible({ timeout: 40_000 });
      const retry = page.getByRole('button', { name: /^retry$/i }).first();
      await expect(retry).toBeVisible();
      expect(requests, 'the failing request was really issued').toBeGreaterThan(0);
      await expect(page.getByTestId('area-zero-result-recovery')).toHaveCount(0);
      await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);
      await expect(page.getByRole('button', { name: CARD_CTA_TEXT })).toHaveCount(0);

      const before = requests;
      await retry.click();
      await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(before);
      await expect(errorSurface.first()).toBeVisible({ timeout: 40_000 });
      expect(await seen(page), 'the request card must never have rendered at any frame').toEqual([]);
    });

    test('T4b school-radius listings 500', async ({ page }) => {
      await watchCard(page);
      let requests = 0;
      await page.route('**/api/discover/cities/*/school-radius-listings**', async (route) => {
        requests += 1;
        await arm(page);
        return fulfillJson(route, 500, { error: 'simulated_failure' });
      });

      await openSchoolPanel(page);
      const errorBlock = page.getByTestId('school-radius-listings-error');
      await expect(errorBlock).toBeVisible({ timeout: 40_000 });
      const retry = page.getByTestId('school-radius-listings-error-retry');
      await expect(retry).toBeVisible();
      expect(requests, 'the failing request was really issued').toBeGreaterThan(0);
      await expect(page.getByTestId('school-radius-empty-state')).toHaveCount(0);
      await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);
      await expect(page.getByRole('button', { name: CARD_CTA_TEXT })).toHaveCount(0);

      const before = requests;
      await retry.click();
      await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(before);
      await expect(errorBlock).toBeVisible({ timeout: 40_000 });
      expect(await seen(page), 'the request card must never have rendered at any frame').toEqual([]);
    });

    test('T4c viewport listings 500', async ({ page }) => {
      await watchCard(page);
      let requests = 0;
      await page.route('**/api/discover/cities/**', async (route) => {
        if (isViewportListingsRequest(route.request().url())) {
          requests += 1;
          await arm(page);
          return fulfillJson(route, 500, { error: 'simulated_failure' });
        }
        return route.fallback();
      });

      await page.goto(MAP_URL);
      await declineConsentIfPresent(page);
      await expect.poll(() => new URL(page.url()).searchParams.get('rscope'), { timeout: 15_000 }).toBe('vp');
      await expect.poll(() => requests, { timeout: 30_000 }).toBeGreaterThan(0);
      const errorSurface = page.locator(
        VIEWPORT_ERROR_TESTIDS.map((id) => `[data-testid="${id}"]`).join(', ') +
          ', [data-testid="area-listings-retry-banner"], [data-testid="anon-viewport-retry-banner"]',
      );
      await expect(errorSurface.first()).toBeVisible({ timeout: 40_000 });
      const retry = page.getByRole('button', { name: /^retry$/i }).first();
      await expect(retry).toBeVisible();
      await expect(page.getByText(VIEWPORT_ZERO_TEXT)).toHaveCount(0);
      await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);
      await expect(page.getByRole('button', { name: CARD_CTA_TEXT })).toHaveCount(0);

      const before = requests;
      await retry.click();
      await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(before);
      await expect(errorSurface.first()).toBeVisible({ timeout: 40_000 });
      expect(await seen(page), 'the request card must never have rendered at any frame').toEqual([]);
    });
  });

  test('T5: card is absent while the listings response is pending, present after the real 200-empty arrives', async ({
    page,
  }) => {
    let released = false;
    let delayed = 0;
    await page.route('**/api/discover/cities/**', async (route) => {
      if (isAreaListingsRequest(route.request().url())) {
        delayed += 1;
        await new Promise((r) => setTimeout(r, 4_000));
        released = true;
        return route.fallback();
      }
      return route.fallback();
    });

    await page.goto(AREA_URL);
    await declineConsentIfPresent(page);
    // POSITIVE: the page is in its loading state (skeletons) while the response is held back.
    await expect(page.getByTestId('listing-skeleton').first()).toBeVisible({ timeout: 20_000 });
    expect(delayed, 'the listings request is being held back').toBeGreaterThan(0);
    let samples = 0;
    while (!released && samples < 20) {
      await expect(page.getByTestId(CARD_TESTID)).toHaveCount(0);
      await expect(page.getByRole('button', { name: CARD_CTA_TEXT })).toHaveCount(0);
      samples += 1;
      await page.waitForTimeout(250);
    }
    expect(samples, 'at least one absence sample while the response was pending').toBeGreaterThan(0);

    await expect(page.getByTestId('area-zero-result-recovery')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId(CARD_TESTID)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('listing-skeleton')).toHaveCount(0);
  });

  // Fix cycle 1 (code-review F1a). An ANONYMOUS radius change keeps the previous radius' [] on screen
  // (keepPreviousData) while the new request is in flight, and the shared isFetching is false for anonymous
  // callers — so the card gate must follow the query's OWN settled state, not isFetching.
  test('T9: anonymous school radius change — card is NEVER present while the new radius loads over the stale zero, present after the real 200-empty', async ({
    page,
  }) => {
    await watchCard(page);
    let held = 0;
    let releasedAt = 0;
    await page.route('**/api/discover/cities/*/school-radius-listings**', async (route) => {
      if (new URL(route.request().url()).searchParams.get('schoolRadiusKm') === '5') {
        held += 1;
        await arm(page); // the observer is armed for the whole hold, AFTER the stale card has been replaced
        await new Promise((r) => setTimeout(r, 4_000));
        // Disarm BEFORE the real response can land, so the post-hold card appearance is not
        // recorded as a violation of the "never present during the hold" assertion.
        await disarm(page);
        releasedAt = Date.now();
        // The fixture has 10 real homes within 5 km, so the real 5 km answer is not a zero. Take the
        // REAL backend response and empty only its page content: a genuine 200 of the real shape that
        // is settled-and-empty, so the card's positive arm below can be exercised after the hold.
        const real = await route.fetch();
        const body = (await real.json()) as Record<string, unknown>;
        return route.fulfill({
          response: real,
          json: { ...body, content: [], hasMore: false },
        });
      }
      return route.fallback();
    });

    // 1) POSITIVE: at 3 km the REAL backend answers a settled zero and the card is shown.
    await openSchoolPanel(page);
    await expect(page.getByTestId('school-radius-empty-state')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId(CARD_TESTID)).toBeVisible({ timeout: 30_000 });

    // 2) Click "Try 5 km": the 5 km response is held; the previous radius' [] stays on screen.
    await page.getByTestId('try-radius-5-btn').click();
    await expect.poll(() => held, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(new URL(page.url()).searchParams.get('radiusKm')).toBe('5');
    // POSITIVE (we are inside the placeholder window): the stale zero state is still rendered, and it is
    // NOT the loading skeleton — that is exactly the state in which the old gate showed the card.
    await expect(page.getByTestId('school-radius-empty-state')).toBeVisible();
    await expect(page.getByTestId('combined-listing-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('listing-skeleton')).toHaveCount(0);

    // 3) NEGATIVE, sampled for the whole hold with an IMMEDIATE count (not a polling expect, which would
    // simply wait for a card that stays put to be removed): never present, and never seen by the observer.
    let samples = 0;
    while (releasedAt === 0 && samples < 30) {
      expect(await page.getByTestId(CARD_TESTID).count(), 'card must be absent while the new radius is loading').toBe(0);
      expect(await page.getByRole('button', { name: CARD_CTA_TEXT }).count()).toBe(0);
      samples += 1;
      await page.waitForTimeout(150);
    }
    expect(samples, 'at least one absence sample while the response was held').toBeGreaterThan(1);
    expect(await seen(page), 'the observer never saw the card during the hold').toEqual([]);

    // 4) POSITIVE: once the real 200-empty arrives the card appears (the observer is re-armed to prove
    // it genuinely sees this card — a "never seen" result above is only meaningful if it can see one).
    await expect(page.getByTestId('school-radius-empty-state')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId(CARD_TESTID)).toBeVisible({ timeout: 30_000 });
    await arm(page);
    await page.getByTestId(CARD_TESTID).hover(); // no DOM mutation; the re-arm below forces a fresh check
    await page.evaluate(() => document.body.appendChild(document.createTextNode(' ')));
    await expect.poll(() => seen(page), { timeout: 5_000 }).toEqual(expect.arrayContaining(['testid']));
  });

  test('T6: consent unticked -> submit disabled and no POST is sent (button or Enter)', async ({ page }) => {
    const posts = trackPosts(page);
    const phone = uniquePhone();
    await openAreaZero(page);
    const card = await expandCard(page);
    await fillForm(page, { requirement: `consent gate ${uniqueToken('PRCT6')}`, phone: phone.national, consent: false });

    const send = card.getByRole('button', { name: 'Send request' });
    const box = card.getByRole('checkbox');
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await expect(send).toBeDisabled();
    await expect(card.getByText('Tick the box above to send')).toBeVisible();

    // Keyboard submit path: Enter in the phone field must not send either.
    await card.getByLabel('Phone number').press('Enter');
    await page.waitForTimeout(1_500); // negative window: a stray POST would have been issued by now
    expect(posts.length, 'no POST while consent is unticked').toBe(0);
    await expect(successStatus(page)).toHaveCount(0);

    // Positive control: ticking consent is what enables submit (state changes after the click).
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(send).toBeEnabled();
    expect(posts.length, 'ticking consent alone sends nothing').toBe(0);
  });

  test('T7: submit failure states (only the POST is intercepted)', async ({ page }) => {
    const phone = uniquePhone();
    let mode: '500' | '429' | '400' = '500';
    let intercepted = 0;
    await page.route(`**${POST_PATH}`, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      intercepted += 1;
      const origin = (await route.request().allHeaders())['origin'] ?? '*';
      const headers = { 'access-control-allow-origin': origin, vary: 'Origin' };
      if (mode === '500') {
        return route.fulfill({ status: 500, contentType: 'application/json', headers, body: '{"error":"boom"}' });
      }
      if (mode === '429') {
        return route.fulfill({ status: 429, contentType: 'application/json', headers, body: '{"error":"rate_limited"}' });
      }
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ fields: [{ field: 'phone', message: 'Server says this phone number is not valid.' }] }),
      });
    });

    await openAreaZero(page);
    const card = await expandCard(page);
    await fillForm(page, { requirement: `failure states ${uniqueToken('PRCT7')}`, phone: phone.national });

    // 500 -> "could not send" + Retry; never success.
    await clickSend(page);
    await expect(card.getByText('We could not send your request. Please try again.')).toBeVisible({ timeout: 30_000 });
    const retry = card.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await expect(successStatus(page)).toHaveCount(0);
    expect(intercepted).toBeGreaterThan(0);

    // Retry re-sends (state change: intercepted count rises) and still never reports success.
    const before = intercepted;
    await retry.click();
    await expect.poll(() => intercepted, { timeout: 15_000 }).toBeGreaterThan(before);
    await expect(card.getByText('We could not send your request. Please try again.')).toBeVisible({ timeout: 15_000 });
    await expect(successStatus(page)).toHaveCount(0);

    // 429 -> rate-limit message; never success.
    mode = '429';
    await clickSend(page);
    await expect(card.getByText('Too many requests from this device or number. Please try again later.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(card.getByText('We could not send your request. Please try again.')).toHaveCount(0);
    await expect(successStatus(page)).toHaveCount(0);

    // 400 with fields -> the server's field error is shown on the phone field.
    mode = '400';
    await clickSend(page);
    await expect(card.getByText('Server says this phone number is not valid.')).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText('Please fix the highlighted fields.')).toBeVisible();
    await expect(card.getByLabel('Phone number')).toHaveAttribute('aria-invalid', 'true');
    await expect(successStatus(page)).toHaveCount(0);
  });

  test('T8: hostile free text is stored and shown as literal text (no element, no script)', async ({
    page,
    browser,
    baseURL,
  }) => {
    const token = uniqueToken('PRCT8');
    const phone = uniquePhone();
    const hostile = `<img src=x onerror="window.__xss=1"> ${token}`;

    await openAreaZero(page);
    await expandCard(page);
    await fillForm(page, { requirement: hostile, phone: phone.national });
    await clickSend(page);
    await expect(successStatus(page)).toBeVisible({ timeout: 30_000 });

    const rows = await requestRowsByToken(token);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].requirement)).toContain('<img src=x onerror="window.__xss=1">');

    const adminCtx = await newAdminContext(browser, baseURL);
    try {
      const admin = await adminCtx.newPage();
      await openAdminList(admin);
      const adminRow = admin.getByRole('row').filter({ hasText: token });
      // POSITIVE: the row rendered and shows the hostile string as literal text.
      await expect(adminRow).toBeVisible({ timeout: 30_000 });
      await expect(adminRow).toContainText('<img src=x onerror="window.__xss=1">');
      await expect(admin.locator('table img')).toHaveCount(0);
      await expect(adminRow.locator('img')).toHaveCount(0);
      expect(await admin.evaluate(() => (window as unknown as { __xss?: unknown }).__xss)).toBeUndefined();
    } finally {
      await adminCtx.close();
    }
  });

  // Owner ruling r2: phone-like numbers belong ONLY in the phone field. The card mirrors the server rule so
  // the buyer gets an inline error without a round trip (T10); the server stays authoritative (T11).
  test('T10: a phone number typed into the free-text requirement is rejected inline and NO POST is sent; a corrected requirement then sends', async ({
    page,
  }) => {
    const posts = trackPosts(page);
    const token = uniqueToken('PRCT10');
    const phone = uniquePhone();

    await openAreaZero(page);
    const card = await expandCard(page);
    await fillForm(page, { requirement: `Call me on 9876543210 ${token}`, phone: phone.national });
    await clickSend(page);

    const requirement = card.getByLabel('What are you looking for?');
    await expect(card.getByText(PHONE_IN_REQUIREMENT_MESSAGE)).toBeVisible({ timeout: 10_000 });
    await expect(requirement).toHaveAttribute('aria-invalid', 'true');
    await expect(requirement).toBeFocused();
    const describedBy = (await requirement.getAttribute('aria-describedby')) ?? '';
    const errorId = describedBy.split(' ').find((id) => id.endsWith('-requirement-error'));
    expect(errorId, 'the requirement field must reference its error element').toBeTruthy();
    await expect(page.locator(`[id="${errorId}"]`)).toHaveText(PHONE_IN_REQUIREMENT_MESSAGE);
    await expect(successStatus(page)).toHaveCount(0);

    // Negative window: a stray POST would have been issued by now. Then the DB must have no row either.
    await page.waitForTimeout(1_500);
    expect(posts.length, 'no POST to the property-request endpoint was sent').toBe(0);
    expect(await requestRowsByToken(token), 'no row was persisted for the rejected requirement').toHaveLength(0);

    // Positive control (the form CAN send; the rejection above is the rule, not a broken form): editing the
    // requirement clears the error and the same card then submits successfully.
    await requirement.fill(`Need 2BHK near metro ${token}`);
    await expect(requirement).not.toHaveAttribute('aria-invalid', 'true');
    await expect(card.getByText(PHONE_IN_REQUIREMENT_MESSAGE)).toHaveCount(0);
    await clickSend(page);
    await expect(successStatus(page)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => posts.length, { timeout: 5_000 }).toBe(1);
    expect(await requestRowsByToken(token)).toHaveLength(1);
  });

  // r3: after the phone-in-requirement client error the card focuses the requirement field. At 1440x900 the
  // browser's default focus() scroll left it BEHIND the sticky panel header (Back/breadcrumb + filter chips).
  // Real-browser proof, per viewport x journey: focus is on the requirement textarea AND it is unoccluded.
  const T12_VIEWPORTS = [
    { name: '1366x768', width: 1366, height: 768, mobile: false },
    { name: '1440x900', width: 1440, height: 900, mobile: false },
    { name: '390x844', width: 390, height: 844, mobile: true },
  ];
  const T12_JOURNEYS = ['area', 'schools', 'map'] as const;

  for (const vp of T12_VIEWPORTS) {
    for (const journey of T12_JOURNEYS) {
      test(`T12: ${journey} @ ${vp.name} — the focused requirement field is fully unoccluded after the phone-in-requirement error and keeps focus while typing`, async ({
        browser,
        baseURL,
      }) => {
        const ctx = await browser.newContext({
          baseURL,
          viewport: { width: vp.width, height: vp.height },
          ...(vp.mobile ? { isMobile: true, hasTouch: true } : {}),
        });
        try {
          const page = await ctx.newPage();
          await seedConsentDenied(page);
          if (journey === 'area') {
            await openAreaZero(page);
          } else if (journey === 'schools') {
            await openSchoolPanel(page);
            await expect(page.getByTestId('school-radius-empty-state')).toBeVisible({ timeout: 40_000 });
          } else {
            await page.goto(MAP_URL);
            await declineConsentIfPresent(page);
            await expect.poll(() => new URL(page.url()).searchParams.get('rscope'), { timeout: 15_000 }).toBe('vp');
            await expect(page.getByText(VIEWPORT_ZERO_TEXT).first()).toBeVisible({ timeout: 40_000 });
          }
          const card = await expandCard(page);
          await fillForm(page, { requirement: '2 BHK, call me on 9876543210', phone: '9812345678' });

          // App-shell layout snapshot: the occlusion fix must move ONLY the panel's own scroll container,
          // never the document or any ancestor (that shifted the whole shell and left a blank band).
          const shellSnapshot = () =>
            page.evaluate(() => {
              const top = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().top) : null);
              const root = document.getElementById('root');
              return {
                scrollY: Math.round(window.scrollY),
                docScrollTop: Math.round(document.scrollingElement?.scrollTop ?? 0),
                rootChildTop: top(root?.firstElementChild ?? null),
                mainTop: top(document.querySelector('main')),
                headerTop: top(document.querySelector('header')),
                bodyTop: top(document.body),
              };
            });
          const shellBefore = await shellSnapshot();
          await clickSend(page);

          const requirement = card.getByLabel('What are you looking for?');
          await expect(card.getByText(PHONE_IN_REQUIREMENT_MESSAGE)).toBeVisible({ timeout: 10_000 });
          await expect(requirement).toBeFocused();

          const probe = () =>
            requirement.evaluate((el) => {
              const r = el.getBoundingClientRect();
              const inset = 4;
              const points: Array<[number, number]> = [
                [r.left + inset, r.top + inset],
                [r.right - inset, r.top + inset],
                [r.left + inset, r.bottom - inset],
                [r.right - inset, r.bottom - inset],
                [r.left + r.width / 2, r.top + inset],
              ];
              const hits = points.map(([x, y]) => {
                const hit = document.elementFromPoint(x, y);
                return hit !== null && (hit === el || el.contains(hit));
              });
              return {
                active: document.activeElement === el,
                hits,
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
                inViewport:
                  r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
              };
            });
          // Poll: a scroll may still be settling right after the focus effect.
          await expect
            .poll(
              async () => {
                const p = await probe();
                return p.active && p.inViewport && p.hits.length === 5 && p.hits.every(Boolean);
              },
              {
                timeout: 5_000,
                message: 'requirement textarea must be the active element, inside the viewport, and unoccluded at 5 edge points',
              },
            )
            .toBe(true);
          const final = await probe();
          console.log(`T12 ${journey} @ ${vp.name}: top=${final.top} bottom=${final.bottom} hits=${final.hits.join(',')}`);

          // Shell untouched: document scroll and the shell containers' positions are exactly as before Send.
          const shellAfter = await shellSnapshot();
          console.log(`T12 ${journey} @ ${vp.name}: shell before=${JSON.stringify(shellBefore)} after=${JSON.stringify(shellAfter)}`);
          expect(shellAfter.scrollY, 'window.scrollY unchanged').toBe(shellBefore.scrollY);
          expect(shellAfter.docScrollTop, 'document.scrollingElement.scrollTop unchanged').toBe(shellBefore.docScrollTop);
          expect(shellAfter.rootChildTop, 'app shell root top unchanged').toBe(shellBefore.rootChildTop);
          expect(shellAfter.mainTop, 'main top unchanged').toBe(shellBefore.mainTop);
          expect(shellAfter.headerTop, 'header top unchanged').toBe(shellBefore.headerTop);
          expect(shellAfter.bodyTop, 'body top unchanged').toBe(shellBefore.bodyTop);

          // Typing keeps focus in the requirement (clearing the error never moves focus).
          await page.keyboard.type('x');
          await expect(requirement).toBeFocused();
          await expect(requirement).not.toHaveAttribute('aria-invalid', 'true');
          expect((await probe()).active).toBe(true);
        } finally {
          await ctx.close();
        }
      });
    }
  }

  // r4: a same-key background refetch of the surrounding results must never dim, block or remount an OPEN card
  // (the results wrapper dims + click-blocks on isFetching; the card is exempt, the rest of the zero state is not).
  //
  // Refetch trigger (no app code touched, real react-query): listings queries have staleTime 60s and the app's
  // QueryClient keeps the default refetchOnWindowFocus, so (1) `page.clock.fastForward(61s)` ages the settled
  // query past staleTime, then (2) a window `focus` + `visibilitychange` event makes react-query's focusManager
  // refetch the SAME key. That request is held with page.route (a deferred promise) so assertions run IN FLIGHT.
  // The held request is then released to the REAL backend (still a genuine zero).
  // Review frames are opt-in: set R4_FRAME_DIR (and optionally R4_FRAME_LABEL, default AFTER). Unset = no screenshots.
  const R4_FRAME_DIR = process.env.R4_FRAME_DIR;
  const R4_FRAME_LABEL = process.env.R4_FRAME_LABEL ?? 'AFTER';
  const T13_JOURNEYS = [
    { key: 'area', matches: isAreaListingsRequest, surroundingTestId: 'area-zero-result-recovery' },
    { key: 'school', matches: isSchoolRadiusRequest, surroundingTestId: 'change-school-empty-btn' },
    { key: 'map', matches: isViewportListingsRequest, surroundingTestId: 'area-zero-result-recovery' },
  ] as const;

  for (const vp of T12_VIEWPORTS) {
    for (const journey of T13_JOURNEYS) {
      test(`T13: ${journey.key} @ ${vp.name} — a same-key background refetch never dims, blocks or remounts the open request card`, async ({
        browser,
        baseURL,
      }) => {
        const ctx = await browser.newContext({
          baseURL,
          viewport: { width: vp.width, height: vp.height },
          ...(vp.mobile ? { isMobile: true, hasTouch: true } : {}),
        });
        let hold = false;
        let heldCount = 0;
        let release: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        try {
          const page = await ctx.newPage();
          await seedConsentDenied(page);
          await page.clock.install();

          await page.route('**/api/discover/cities/**', async (route) => {
            if (hold && journey.matches(route.request().url())) {
              heldCount += 1;
              await gate;
            }
            return route.fallback();
          });

          if (journey.key === 'area') {
            await openAreaZero(page);
          } else if (journey.key === 'school') {
            await openSchoolPanel(page);
            await expect(page.getByTestId('school-radius-empty-state')).toBeVisible({ timeout: 40_000 });
          } else {
            await page.goto(MAP_URL);
            await declineConsentIfPresent(page);
            await expect.poll(() => new URL(page.url()).searchParams.get('rscope'), { timeout: 15_000 }).toBe('vp');
            await expect(page.getByText(VIEWPORT_ZERO_TEXT).first()).toBeVisible({ timeout: 40_000 });
          }

          const card = await expandCard(page);
          const requirementText = '2 BHK near the school';
          await fillForm(page, { requirement: requirementText, phone: '9812345678' });
          const requirement = card.getByLabel('What are you looking for?');
          await requirement.focus();
          await expect(requirement).toBeFocused();
          // Identity mark: a remount would replace this node and lose the attribute.
          await card.evaluate((el) => el.setAttribute('data-r4-mark', 'same-node'));

          /** Effective opacity (ancestors multiplied) and any pointer-events:none ancestor of a test id. */
          const effective = (testId: string) =>
            page.evaluate((id) => {
              const el = document.querySelector(`[data-testid="${id}"]`);
              if (!el) return null;
              let opacity = 1;
              const blockedBy: string[] = [];
              for (let n: Element | null = el; n; n = n.parentElement) {
                const cs = getComputedStyle(n);
                opacity *= parseFloat(cs.opacity);
                if (cs.pointerEvents === 'none') blockedBy.push(n.tagName.toLowerCase());
              }
              return { opacity, blockedBy };
            }, testId);

          const assertCardIntact = async (phase: string, expectedRequirement: string) => {
            const cardState = await effective(CARD_TESTID);
            expect(cardState, `${phase}: card present`).not.toBeNull();
            expect(cardState?.opacity, `${phase}: effective opacity of the card (ancestors multiplied)`).toBeCloseTo(1, 2);
            expect(cardState?.blockedBy, `${phase}: no ancestor has pointer-events:none`).toEqual([]);
            // Same node, not a remount.
            await expect(page.locator('[data-r4-mark="same-node"]')).toHaveCount(1);
            expect(await page.getByTestId(CARD_TESTID).getAttribute('data-r4-mark'), `${phase}: same card node`).toBe('same-node');
            // Real hit test on the textarea.
            await requirement.evaluate((el) => el.scrollIntoView({ block: 'center' }));
            const hit = await requirement.evaluate((el) => {
              const r = el.getBoundingClientRect();
              const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return top !== null && (top === el || el.contains(top));
            });
            expect(hit, `${phase}: elementFromPoint at the textarea hits it`).toBe(true);
            await expect(requirement).toBeEnabled();
            await expect(requirement).toHaveValue(expectedRequirement);
            await expect(card.getByLabel('Phone number')).toHaveValue('9812345678');
            await expect(card.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
            await expect(requirement).toBeFocused();
          };

          // 1) Trigger the same-key background refetch and hold it in flight.
          hold = true;
          await page.clock.fastForward(61_000);
          await page.evaluate(() => {
            window.dispatchEvent(new Event('focus'));
            // react-query's focusManager listens on WINDOW (a non-bubbling event fired at document never reaches it).
            window.dispatchEvent(new Event('visibilitychange'));
          });
          await expect.poll(() => heldCount, { timeout: 15_000, message: 'the same-key refetch was issued and is held' }).toBeGreaterThan(0);

          // POSITIVE control: the refetch really flipped isFetching — the REST of the zero state is dimmed.
          // This is only wired for the By Area results surface for ANONYMOUS callers: the anonymous school-radius
          // and viewport sources do not expose their query's isFetching to the panel (useDiscoverMapData gates
          // `isFetching` on isAuthenticated), so those two surfaces do not dim here and the control cannot flip.
          // They are still held in flight and fully asserted below; the dim-wiring itself (isFetching=true) is
          // pinned for them by the unit suites. The By Area arm requires the dim (strict control).
          const dimDeadline = Date.now() + (journey.key === 'area' ? 10_000 : 3_000);
          let sawDim = false;
          while (Date.now() < dimDeadline && !sawDim) {
            sawDim = ((await effective(journey.surroundingTestId))?.opacity ?? 1) < 0.9;
            if (!sawDim) await page.waitForTimeout(150);
          }
          if (journey.key === 'area') {
            expect(sawDim, 'the surrounding zero-state content dims while the refetch is in flight').toBe(true);
          }
          console.log(`T13 ${journey.key} @ ${vp.name}: surrounding content dimmed in flight = ${sawDim}`);
          if (R4_FRAME_DIR) {
            // Captured before any card assertion so the BEFORE (failing) state is still recorded.
            const frame = `${R4_FRAME_DIR}/R4-${R4_FRAME_LABEL}-REFETCH-${journey.key}-${vp.name}`;
            await page.screenshot({ path: `${frame}.jpg`, type: 'jpeg', quality: 70 });
            // TOP frame: scroll the surrounding content (recovery block / zero-state header) to the top of its
            // scroller so the dimmed surroundings and the active card are in view together.
            await page
              .getByTestId(journey.surroundingTestId)
              .first()
              .evaluate((el) => el.scrollIntoView({ block: 'start' }));
            await page.screenshot({ path: `${frame}-TOP.jpg`, type: 'jpeg', quality: 70 });
          }

          // 2) IN FLIGHT: the open card is untouched, and still usable by the buyer.
          await assertCardIntact('in-flight', requirementText);
          await requirement.click({ timeout: 5_000 });
          await page.keyboard.type('!');
          await expect(requirement).toHaveValue(`${requirementText}!`);

          // 3) The refetch resolves (still a genuine zero): the same holds and the dim is gone.
          const heldResponse = page.waitForResponse((r) => journey.matches(r.url()), { timeout: 15_000 });
          release();
          await heldResponse;
          await expect
            .poll(async () => (await effective(journey.surroundingTestId))?.opacity ?? 0, { timeout: 15_000 })
            .toBeGreaterThan(0.99);
          // The held request really completed on every arm: its response was awaited above (not just the dim clearing).
          await expect(page.getByTestId(journey.surroundingTestId).first()).toBeVisible();
          await assertCardIntact('after-refetch', `${requirementText}!`);
        } finally {
          // Always free the held request (idempotent: resolving an already-resolved gate is a no-op), so a failing
          // in-flight assertion never leaves the route handler pending until the context closes.
          release();
          await ctx.close();
        }
      });
    }
  }

  test('T11: the server rejects a phone number in the requirement with a 400 field error that never echoes it; no row is stored', async ({
    request,
    baseURL,
  }) => {
    const backend = process.env.BACKEND_BASE_URL ?? '';
    expect(backend, 'BACKEND_BASE_URL must point at the isolated backend').not.toBe('');
    const token = uniqueToken('PRCT11');
    const phone = uniquePhone();
    const response = await request.post(`${backend}${POST_PATH}`, {
      headers: { 'Content-Type': 'application/json', ...(baseURL ? { Origin: baseURL } : {}) },
      data: {
        city: 'bangalore',
        areaKey: null,
        areaLabel: null,
        journey: 'MAP',
        intent: 'BUY',
        requirement: `Call me on 9876543210 ${token}`,
        phone: phone.e164,
        contactVia: 'PHONE',
        consent: true,
        consentVersion: CONSENT_VERSION,
      },
    });
    const text = await response.text();
    expect(response.status(), `server response: ${text}`).toBe(400);
    expect(text, 'the rejected number must never be echoed back').not.toContain('9876543210');
    const body = JSON.parse(text) as { fields?: Array<{ field: string; message: string }> };
    expect(body.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'requirement', message: PHONE_IN_REQUIREMENT_MESSAGE })]),
    );
    expect(await requestRowsByToken(token), 'no row was persisted for the rejected requirement').toHaveLength(0);
  });
});
