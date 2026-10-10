/**
 * Post-deploy reachability check (issue #2750, PR-2).
 *
 * SECONDARY — not the E2E gate. The gate is `npm run test:e2e:gate`. This file only asks "is the deployed site
 * reachable and does it fail closed for an anonymous visitor?". A green run says nothing about the merged backend
 * (Render autoDeploy is OFF) and exercises no signed-in flow.
 *
 * Run:  PLAYWRIGHT_BASE_URL=<frontend> BACKEND_BASE_URL=<backend> npx playwright test --config=playwright.deployed.config.ts
 *
 * Properties (pinned by scripts/e2e/check-deployed-reachability.mjs):
 *  - AUTH-FREE: a fresh context per test, empty storage, no saved sign-in, no credentials, no Supabase URL or key.
 *  - WRITE-FREE, ENFORCED: context.route('**\/*') lets only GET/HEAD/OPTIONS through. Every other method is recorded and
 *    aborted BEFORE it leaves the browser. Any URL containing the hosted-auth path is recorded and aborted whatever its
 *    method. A read-only request to a host other than the two configured origins (web fonts, map tiles) is aborted too,
 *    so no third party is contacted except through a redirect hop, which fails the run (below); it is listed as a test annotation, not treated as a violation. `page.on('request')`
 *    alone would only observe a write after it was sent, so it is not used as the control.
 *  - Redirect hops are fail-closed: context.route sees only the first URL of a redirect chain, so a request that is a
 *    redirect hop (redirectedFrom() !== null) to an origin other than the two configured ones is recorded as a violation.
 *  - G0 proves the guard intercepts, at runtime, on every run (a guard mutated to let everything through goes RED).
 *  - Telemetry consent is seeded 'denied' so the app emits no analytics POST.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

function requireOrigin(name: 'PLAYWRIGHT_BASE_URL' | 'BACKEND_BASE_URL'): string {
  const raw = process.env[name];
  if (!raw || !/^https?:\/\//.test(raw)) throw new Error(`${name} must be an explicit http(s):// URL`);
  return new URL(raw).origin;
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ''; }
}

const FRONTEND = requireOrigin('PLAYWRIGHT_BASE_URL');
const BACKEND = requireOrigin('BACKEND_BASE_URL');

// Exact localStorage key from apps/web/src/lib/discoverTelemetryConsent.ts (CONSENT_KEY). Any value other than
// 'granted' is a denial; 'denied' makes the intent explicit.
const CONSENT_KEY = 'discover_telemetry_consent';

// City slug for the Discover render check. `bangalore` is the slug the canonical fixture and production both serve;
// `udupi` is LEGACY in the default fixture, so it is not used here.
const CITY = 'bangalore';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const AUTH_PATH = '/auth/v1/';
const PROBE_METHODS = ['POST', 'PUT', 'DELETE']; // GUARD_PROBE
const PROBE_PATH = '/__reachability_guard_probe';
// https, not http: on the https production origin Chromium blocks an http:// fetch as active mixed content BEFORE
// context.route runs, so an http probe would never reach the guard. `.invalid` never resolves; the guard aborts it in-browser.
const FOREIGN_PROBE = 'https://guard-probe.invalid/x';

// The ONE allowlisted abort (owner decision, #2750 PR-2 review 1, option A). Cloudflare's bot-challenge script on the
// production origin POSTs to <frontend>/cdn-cgi/challenge-platform/... on its own; that request is not the app's and
// carries no app data. It is still ABORTED unconditionally (never continued or fulfilled, so it never leaves the browser);
// the only difference is that it is recorded in rec.allowlistedAborts (annotation 'aborted-allowlisted') and does not fail afterEach.
// POST-ONLY, the narrowest form covering the observed request: a PUT/DELETE/PATCH to the same path still fails, and a GET to
// it is an ordinary same-origin read that continues as before. Origin is compared by PARSED equality (never substring/endsWith),
// and the path with startsWith on the parsed pathname (case-sensitive; query string and hash are not part of it).
const CHALLENGE_PREFIX = '/cdn-cgi/challenge-platform/';
const ALLOWLISTED_METHOD = 'POST'; // ALLOWLIST_METHOD

function isAllowlistedChallengeAbort(method: string, url: string, frontend: string): boolean {
  if (method !== ALLOWLISTED_METHOD) return false;
  try {
    const u = new URL(url);
    return u.origin === frontend && u.pathname.startsWith(CHALLENGE_PREFIX);
  } catch {
    return false;
  }
}

interface GuardRecord {
  allowlistedAborts: string[]; // the single allowlisted same-origin Cloudflare challenge POST: aborted, NOT a failure (annotation only)
  blocked: string[]; // violations the guard aborted (a non-read method, or a hosted-auth path, on any host)
  foreignReads: string[]; // read-only requests to a host other than the two configured origins (aborted, informational)
  backendFailed: string[]; // requestfailed on the backend origin
  backend5xx: string[]; // backend responses >= 500
  cors: string[]; // console errors that mention CORS
  seen: { method: string; url: string; headerNames: string[] }[]; // every request the page started
}

const test = base.extend<{ rec: GuardRecord }>({
  rec: [
    async ({ context }: { context: BrowserContext }, use) => {
      const rec: GuardRecord = { allowlistedAborts: [], blocked: [], foreignReads: [], backendFailed: [], backend5xx: [], cors: [], seen: [] };
      await context.addInitScript((key: string) => {
        try { window.localStorage.setItem(key, 'denied'); } catch { /* storage unavailable: nothing to seed */ }
      }, CONSENT_KEY);
      await context.route('**/*', async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();
        let origin = '';
        try { origin = new URL(url).origin; } catch { origin = ''; }
        const foreign = origin !== FRONTEND && origin !== BACKEND;
        if (!url.includes(AUTH_PATH) && isAllowlistedChallengeAbort(method, url, FRONTEND)) {
          rec.allowlistedAborts.push(`${method} ${url}`);
          await route.abort('blockedbyclient');
          return;
        }
        const reasons: string[] = [];
        if (url.includes(AUTH_PATH)) reasons.push('hosted-auth path');
        if (!SAFE_METHODS.has(method)) reasons.push('non-read method');
        if (reasons.length > 0) {
          // A write or a hosted-auth path is a violation on ANY host: recorded, aborted, and it fails the test.
          if (foreign) reasons.push('foreign origin');
          rec.blocked.push(`${method} ${url} [${reasons.join(', ')}]`);
          await route.abort('blockedbyclient');
          return;
        }
        if (foreign) {
          // A read-only request to a third-party host (the app loads web fonts and map tiles from CDNs) is aborted so no
          // third party is ever contacted and the check does not depend on one being up. It is recorded for visibility
          // (test annotation) but is not a violation: nothing was written and nothing left the browser.
          rec.foreignReads.push(`${method} ${url}`);
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });
      // WebSocket traffic does not pass through context.route: close any socket in the page before it connects.
      await context.routeWebSocket(/.*/, (ws) => {
        rec.blocked.push(`WS ${ws.url()} [websocket]`);
        void ws.close();
      });
      context.on('request', (r) => { rec.seen.push({ method: r.method(), url: r.url(), headerNames: Object.keys(r.headers()) }); });
      // context.route only sees the FIRST URL of a redirect chain; a hop to a third-party host is never routed, so it
      // would leave the browser unaborted. Record it as a violation so afterEach fails closed.
      context.on('request', (r) => {
        const hop = r.redirectedFrom() !== null && ![FRONTEND, BACKEND].includes(originOf(r.url()));
        if (hop) rec.blocked.push(`${r.method()} ${r.url()} [redirect hop to a foreign origin]`);
      });
      context.on('requestfailed', (r) => { if (r.url().startsWith(BACKEND)) rec.backendFailed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`); });
      context.on('response', (r) => { if (r.url().startsWith(BACKEND) && r.status() >= 500) rec.backend5xx.push(`${r.status()} ${r.url()}`); });
      context.on('console', (m) => { if (m.type() === 'error' && /cors|access-control-allow-origin/i.test(m.text())) rec.cors.push(m.text()); });
      await use(rec);
    },
    { auto: true },
  ],
});

test.afterEach(async ({ rec }, testInfo) => {
  if (rec.foreignReads.length > 0) testInfo.annotations.push({ type: 'third-party reads aborted', description: [...new Set(rec.foreignReads.map((r) => new URL(r.split(' ')[1]).host))].join(', ') });
  if (rec.allowlistedAborts.length > 0) testInfo.annotations.push({ type: 'aborted-allowlisted', description: rec.allowlistedAborts.map((r) => { const [m, u] = r.split(' '); return `${m} ${new URL(u).pathname}`; }).join(', ') });
  expect(rec.blocked, 'the write/auth guard recorded a blocked request').toEqual([]);
  expect(rec.backend5xx, 'backend answered >= 500').toEqual([]);
  expect(rec.backendFailed, 'a request to the backend origin failed').toEqual([]);
  expect(rec.cors, 'CORS console error').toEqual([]);
});

interface GetResult { status: number | null; body: string; error: string | null }

/** In-page GET (so CORS applies exactly as it does for a visitor). Credentials omitted, no custom headers. */
async function pageGet(page: Page, url: string): Promise<GetResult> {
  return page.evaluate(async (u: string): Promise<GetResult> => {
    try {
      const res = await fetch(u, { method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' } }); // GET_ONLY
      return { status: res.status, body: await res.text(), error: null };
    } catch (e) {
      return { status: null, body: '', error: String(e) };
    }
  }, url);
}

const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';

test.describe('guard self-test', () => {
  test('G0 the write/auth/foreign-host guard intercepts at runtime', async ({ page, rec }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, undefined, { timeout: 15_000 });
    const probes: string[] = [];
    for (const method of PROBE_METHODS) probes.push(`${method}|${BACKEND}${PROBE_PATH}`);
    probes.push(`GET|${FRONTEND}${AUTH_PATH}__probe`);
    probes.push(`GET|${FOREIGN_PROBE}`);
    // G0 counts only ITS OWN probes, so an unrelated lazy foreign image/tile loading in the probe window cannot false-RED it,
    // and anything else the page did (a write, a hosted-auth call) stays in the record for afterEach to fail on.
    const probeUrls = [`${BACKEND}${PROBE_PATH}`, `${FRONTEND}${AUTH_PATH}__probe`, FOREIGN_PROBE];
    const isOwn = (entry: string): boolean => probeUrls.some((u) => entry.includes(u));

    const outcomes = await page.evaluate(async (list: string[]) => {
      const out: string[] = [];
      for (const entry of list) {
        const [method, url] = entry.split('|');
        try {
          await fetch(url, { method, credentials: 'omit', body: method === 'GET' ? undefined : '{}' }); // PROBE_FETCH
          out.push(`${entry} => REACHED THE NETWORK`);
        } catch {
          out.push(`${entry} => blocked`);
        }
      }
      return out;
    }, probes);

    expect(outcomes.filter((o) => !o.endsWith('=> blocked')), 'a probe request was not blocked in the browser').toEqual([]);
    const ownBlocked = rec.blocked.filter(isOwn);
    const ownForeign = rec.foreignReads.filter(isOwn);
    const aborted = ownBlocked.length + ownForeign.length;
    expect(aborted, 'guard record count must equal the probe count').toBe(probes.length);
    for (const method of PROBE_METHODS) expect(ownBlocked.some((b) => b.startsWith(`${method} ${BACKEND}${PROBE_PATH}`))).toBe(true);
    expect(ownBlocked.some((b) => b.includes(`${AUTH_PATH}__probe`) && b.includes('hosted-auth path'))).toBe(true);
    expect(ownForeign.some((b) => b.includes(FOREIGN_PROBE))).toBe(true);

    // G0's own probes are removed from the record here so afterEach sees only what the app did.
    for (const list of [rec.blocked, rec.foreignReads, rec.backendFailed]) {
      for (let i = list.length - 1; i >= 0; i -= 1) if (isOwn(list[i])) list.splice(i, 1);
    }
  });
});

test.describe('frontend reachability', () => {
  test('R1 / renders the anonymous home with no role-only navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, undefined, { timeout: 15_000 });
    expect((await page.locator('body').textContent())?.trim().length ?? 0).toBeGreaterThan(0);
    await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^sign in$/i })).toBeVisible({ timeout: 15_000 });
    for (const name of [/my listings/i, /new listing/i, /feed runs/i, /facebook groups/i]) {
      await expect(page.getByRole('link', { name })).toHaveCount(0);
    }
  });

  for (const route of ['/broker/dashboard', '/admin/listings/pending']) {
    test(`R2 ${route} redirects an anonymous visitor to /auth`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    });
  }

  test('R3 an unknown route renders the NotFound page (asserted by text, not status)', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-reachability-check');
    await expect(page.getByText('404')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('R4 /discover renders and the browser reaches the backend discover API', async ({ page }) => {
    const ok: string[] = [];
    page.on('response', (r) => {
      if (r.request().method() === 'GET' && r.url().startsWith(`${BACKEND}/api/discover/`) && r.status() >= 200 && r.status() < 300) ok.push(r.url());
    });
    await page.goto(`/discover?city=${CITY}`);
    await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
    // Minimum-observation rule: a Discover page that never reached the backend is not "reachable".
    await expect.poll(() => ok.length, { timeout: 30_000, message: 'no 2xx GET to <backend>/api/discover/** was observed' }).toBeGreaterThan(0);
    await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
  });
});

test.describe('backend reachability', () => {
  test('B1 /actuator/health answers 200 with status UP', async ({ page }) => {
    await page.goto('/');
    const res = await pageGet(page, `${BACKEND}/actuator/health`);
    expect(res.error, 'health request failed at the network/CORS level').toBeNull();
    expect(res.status).toBe(200);
    expect((JSON.parse(res.body) as { status?: string }).status).toBe('UP');
  });

  test('B2 a public discover endpoint answers 200 JSON', async ({ page }) => {
    // GET /api/discover/area-groups?city=<slug>: permitAll in JwtConfig.java:142; handler AreaGroupsController.getAreaGroups
    // (discover/AreaGroupsController.java:38-47) documents 200 {"city","groups":[]} for an UNKNOWN city, so it does not depend
    // on seeded rows. (DiscoverSummaryController.java:67 /api/discover/summary also needs ?city= and is heavier.)
    await page.goto('/');
    const res = await pageGet(page, `${BACKEND}/api/discover/area-groups?city=${CITY}`);
    expect(res.error, 'public discover request failed at the network/CORS level').toBeNull();
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { groups?: unknown };
    expect(Array.isArray(body.groups), 'response is not the {city, groups[]} shape').toBe(true);
  });

  test('B3 an anonymous GET to an authenticated endpoint is refused with 401 or 403', async ({ page, rec }) => {
    // GET /api/discover/listings is deliberately NOT permitAll (JwtConfig.java:109-114 comment); it falls through to
    // anyRequest().authenticated() at JwtConfig.java:160. LIMIT: that fallthrough returns 401 for ANY unmatched path, so this
    // proves the authenticated fallthrough still refuses anonymous callers, not that this one handler is guarded by itself.
    // A network/CORS error is a failure, never a skip.
    await page.goto('/');
    const url = `${BACKEND}/api/discover/listings`;
    const res = await pageGet(page, url);
    expect(res.error, 'authenticated-endpoint request failed at the network/CORS level').toBeNull();
    expect([401, 403], `expected 401 or 403, got ${res.status}`).toContain(res.status);
    const sent = rec.seen.filter((r) => r.url === url);
    expect(sent.length, 'the B3 request was not observed').toBeGreaterThan(0);
    for (const s of sent) expect(s.headerNames.filter((h) => /^auth/i.test(h)), 'B3 must be anonymous: no auth-bearing request header').toEqual([]);
  });
});
