/**
 * Test entry point for the specialist suite (issue #2750 S0). Every *.specialist.ts imports `test` and `expect` from here
 * (estate rule SP7), never from '@playwright/test'.
 *
 * It carries the RUNTIME REQUEST GUARD: an auto fixture that keeps a specialist run from silently touching anything but
 * loopback and the app's own hard-coded static-asset hosts. The host tables are IMPORTED from
 * scripts/e2e/specialist-suite.mjs (single source of truth); this file holds no host literal (estate rule SP4).
 *
 *   Layer 1 BLOCK   context.route + page.route on every URL: an allowed request falls back to the next handler (never a
 *                   continue, so a spec's own page mock still runs); a request to any other host is aborted and recorded.
 *   Layer 2 OBSERVE context.on('request') sees every browser request however it is routed. It closes the bypass where a
 *                   spec's own handler ends the chain before layer 1 sees the request. The test fails after it ends,
 *                   listing every observed non-allowed request.
 *                   Reserved test TLDs (.test/.invalid/.example) are NOT flagged here (a fulfil-mock URL looks the same);
 *                   layer 1 aborts and records an UNMOCKED one, and the WebSocket guard records reserved-TLD sockets.
 *   Layer 3 STATIC  estate rule SP8 bans the route continue call in specs; SP9 bans direct APIRequestContext and fetch.
 *
 * APIRequestContext traffic is invisible to routes and request events, so specs reach the backend ONLY through
 * backendGet()/backendBaseUrl(), which read BACKEND_BASE_URL through the loopback assertion with no default.
 */
import { test as base, expect, type APIResponse, type Page, type Route } from '@playwright/test';
import { assertSpecialistTarget, classifyRequestUrl } from '../../../scripts/e2e/specialist-suite.mjs';

/** The backend origin (BACKEND_BASE_URL), asserted loopback on every call. There is no default: a missing value throws. */
export function backendBaseUrl(): string {
  return assertSpecialistTarget(process.env, 'e2e/specialist/support/specialist-test.ts').backendUrl;
}

/** GET a backend path (must start with a single "/"). The only sanctioned way for a spec to make a non-browser request. */
export async function backendGet(page: Page, path: string): Promise<APIResponse> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`backendGet: path must start with a single "/" (got ${JSON.stringify(path)}); absolute URLs are refused`);
  }
  // maxRedirects: 0 - APIRequestContext follows up to 20 redirects by default, and a followed hop would leave the loopback
  // backend unseen by every guard layer. A 3xx is therefore a hard error naming the status and the Location (never followed).
  const res = await page.request.get(`${backendBaseUrl()}${path}`, { maxRedirects: 0 });
  if (res.status() >= 300 && res.status() < 400) {
    throw new Error(
      `backendGet: ${path} answered a ${res.status()} redirect (Location: ${res.headers()['location'] ?? '<none>'}); redirects are refused so a request can never leave the loopback backend`,
    );
  }
  return res;
}

export const test = base.extend<{ requestGuard: void }>({
  requestGuard: [
    async ({ context, page }, use) => {
      const blocked: string[] = [];
      const observed: string[] = [];

      const guard = async (route: Route) => {
        const url = route.request().url();
        const c = classifyRequestUrl(url);
        // 'reserved' (.test/.invalid/.example) reaching THIS handler means no earlier page route fulfilled it: it can
        // only be an unmocked request, so it is aborted and recorded exactly like a block.
        if (c.action === 'block' || c.action === 'reserved') {
          blocked.push(`${c.label}: ${url}`);
          await route.abort('blockedbyclient');
          return;
        }
        await route.fallback();
      };
      await context.route('**/*', guard);
      await page.route('**/*', guard);

      // Layer 2 deliberately does NOT flag 'reserved': this event also fires for requests a spec's route fulfilled with a
      // mock (a reserved-TLD URL is the normal shape of a fulfil-mock) and cannot distinguish them. Unmocked reserved-TLD
      // requests are caught by layer 1 above.
      context.on('request', (request) => {
        const c = classifyRequestUrl(request.url());
        if (c.action === 'block') observed.push(`${c.label}: ${request.url()}`);
      });

      // WebSockets bypass context.route / page.route and the 'request' event, so they get their own layer: every ws/wss
      // URL is classified with the SAME policy (ws -> http, wss -> https for the host check). A blocked socket is
      // recorded and closed; an allowed (loopback / static-asset host) socket is passed through to the real server.
      const blockedSockets: string[] = [];
      await context.routeWebSocket(/.*/, (ws) => {
        const url = ws.url();
        const c = classifyRequestUrl(url.replace(/^ws(s?):/i, 'http$1:'));
        if (c.action === 'allow') {
          ws.connectToServer();
          return;
        }
        // 'reserved' is recorded too: there is no fulfil-mock for a socket, so a reserved-TLD socket is always unmocked.
        if (c.action === 'block' || c.action === 'reserved') blockedSockets.push(`${c.label}: ${url}`);
        void ws.close({ code: 1008, reason: 'blocked by specialist runtime guard' });
      });

      await use();

      const wsFailures = [...new Set(blockedSockets)].map((s) => `websocket ${s}`);
      const all = [...new Set([...blocked, ...observed])];
      if (all.length > 0 || wsFailures.length > 0) {
        throw new Error(
          `specialist runtime guard: ${all.length + wsFailures.length} request(s) to a non-allowed host (loopback and the app's static asset hosts only):\n  ${[...all, ...wsFailures].join('\n  ')}\n` +
          `  blocked (aborted) by layer 1: ${blocked.length}; observed by layer 2: ${observed.length}; blocked websockets: ${wsFailures.length}`,
        );
      }
    },
    { auto: true },
  ],
});

export { expect };
