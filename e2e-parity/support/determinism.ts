/**
 * Determinism helpers for the Discover-V2 parity harness (issue #2076, Stage 1).
 *
 * This module is the single place that encodes the harness's determinism
 * contract (see docs/audit/issue-2076/fixture-environment-manifest.md for the
 * full written contract this code implements):
 *   - kill CSS animations/transitions/caret before any screenshot-adjacent
 *     assertion runs
 *   - wait for web fonts to finish loading (`document.fonts.ready`)
 *   - wait for the map to settle: a conservative fixed-delay heuristic
 *     (no "Loading..." text + best-effort network-idle + a fixed ~1.5s
 *     sleep), NOT an event-driven wait on CameraIntent quiescence, marker
 *     rendering, or marker image decode — see `waitForMapSettled`'s
 *     docstring
 *   - observe that at least one real, unmocked request reached the backend
 *     origin — parity specs observe the REAL backend response, they do not
 *     intentionally stub `/api/**`. This is a best-effort spot-check, NOT a
 *     mechanical proof that no mocking occurred anywhere on the page: see
 *     `installNoApiMockGuard`'s docstring for why Playwright's route-handler
 *     precedence (last-registered-runs-first, chain stops at the first
 *     `continue()`/`fulfill()`) means a later-registered mock can fulfil a
 *     request before this guard ever sees it.
 *
 * Stage 1 scope: this is a skeleton. The concrete DOM contracts referenced
 * below (data-testid values, marker layer selectors) are believed correct
 * from reading the current source (src/components/discover/DiscoverMapCountBadge.tsx,
 * src/components/map/AreaMarkerLayer.tsx, src/features/discover/views/DiscoverMapCanvas.tsx)
 * but have NOT been exercised against a live render inside this Stage-1 run —
 * that verification is the pilot spec's job, executed by a later specialist.
 */

import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * addInitScript payload — runs in every new document before any app code.
 * Disables CSS animations/transitions and hides the text caret so repeated
 * runs (and, in later stages, screenshot baselines) are not perturbed by
 * animation-frame timing or caret blink phase.
 */
export const KILL_ANIMATIONS_INIT_SCRIPT = `
  (() => {
    const style = document.createElement('style');
    style.setAttribute('data-parity-harness', 'kill-animations');
    style.textContent = \`
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-delay: 0ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        transition-delay: 0ms !important;
        scroll-behavior: auto !important;
        caret-color: transparent !important;
      }
    \`;
    // The style element must exist before <head> parses in most cases;
    // document.head may not exist yet at addInitScript time for the very
    // first navigation, so guard and retry on DOMContentLoaded.
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style), { once: true });
    }
  })();
`;

/** Installs the animation/transition/caret kill switch for a page's whole lifetime (all navigations). */
export async function installDeterminismInitScript(page: Page): Promise<void> {
  await page.addInitScript(KILL_ANIMATIONS_INIT_SCRIPT);
}

/**
 * Waits for web fonts to finish loading so text metrics (and, later, glyph
 * rendering) are stable.
 *
 * `document.fonts.ready` is a Promise that resolves once all pending font
 * loads have settled — that is the correct primitive (there is no `'ready'`
 * member of `FontFaceSetLoadStatus`; the only values are `'loading'` and
 * `'loaded'`). We race that promise against an explicit timeout so a page
 * whose fonts genuinely never finish loading still fails loudly instead of
 * hanging or being silently swallowed.
 */
export async function waitForFontsReady(page: Page, timeoutMs = 10_000): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`waitForFontsReady: document.fonts.ready did not resolve within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    await Promise.race([
      page.evaluate(() => document.fonts.ready.then(() => undefined)),
      timeout,
    ]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * A conservative, fixed-delay settle heuristic for the Discover map — NOT an
 * event-driven readiness contract. It does not wait on marker-layer
 * attachment, "no results" state, or marker `<img>` decode; it does exactly
 * three things, in order:
 *   1. Waits for no visible "Loading..." text node (mirrors the existing e2e
 *      convention in
 *      e2e/capture-discover-city-landing-polish.spec.ts::waitForRealLoadedState).
 *   2. Waits for network idle for a short window, best-effort only (tile
 *      fetches from the basemap provider are excluded from network-idle by
 *      their own long-poll nature in some browsers, so a `.catch()` makes
 *      this advisory, not load-bearing — a timeout here does not fail the
 *      wait).
 *   3. Sleeps a fixed ~1.5s, on the assumption that this is enough time for
 *      CameraIntent → Leaflet fitBounds/flyTo to finish its animation frame
 *      and for marker icon `<img>` decode to complete. This is a guess, not
 *      a signal — there is no confirmation the map is actually settled when
 *      this function returns.
 *
 * This is intentionally conservative (timeouts, not perfect signal-based
 * waits) because Stage 1 does not yet have access to a `cameraSettled`
 * test hook wired into MapDiscovery/PropertyMap. Fold in a real quiescence
 * signal (e.g. a `data-camera-settled` attribute or a window event) in
 * Stage 2 if flakiness shows up in practice — tracked as a known gap, see
 * fixture-environment-manifest.md "Known gaps".
 */
export async function waitForMapSettled(page: Page, timeoutMs = 20_000): Promise<void> {
  // No .catch() here: `.not.toBeVisible()` already resolves successfully when
  // the locator is entirely absent from the DOM (zero matches counts as "not
  // visible"), so a rejection here only happens when the "Loading..." text is
  // genuinely still visible after the timeout — i.e. a real stuck-loading
  // state. Swallowing that would silently let the harness screenshot a
  // loading state instead of a settled one, which is the same class of
  // false-evidence bug as the font-wait issue above.
  await expect(page.locator('text=Loading...').first())
    .not.toBeVisible({ timeout: Math.min(timeoutMs, 5_000) });

  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {
    /* best-effort — see docstring */
  });

  // Fixed settle window for CameraIntent → Leaflet flyTo/fitBounds animation
  // and marker <img> decode. See fixture-environment-manifest.md for why this
  // is a fixed wait rather than an event-driven one in Stage 1.
  await page.waitForTimeout(1_500);
}

/** Backend-origin hostnames the parity harness must NEVER see a request reach through a page.route() mock of our own. */
export interface NoApiMockGuardOptions {
  /** The resolved backend base URL for this run (e.g. from BACKEND_BASE_URL). */
  backendOrigin: string;
}

/**
 * Installs a route handler that:
 *   1. Allows every request it sees to pass through untouched
 *      (`route.continue()`) — this handler itself never mocks `/api/**`, it
 *      observes the real backend.
 *   2. Records every request whose URL origin matches `backendOrigin` into
 *      `interceptedBackendRequests` so a spec can assert the count is > 0 —
 *      i.e. that at least one real request reached the backend origin
 *      through this handler.
 *
 * What this does NOT prove, and why: Playwright runs multiple matching
 * `page.route()` handlers in the ORDER OPPOSITE TO THEIR REGISTRATION (last
 * registered runs first — see the Playwright docs for `Route`/`page.route`),
 * and a handler that calls `route.continue()` or `route.fulfill()` ends the
 * chain immediately — no earlier-registered handler is invoked for that
 * request at all. Concretely: if a spec calls `installNoApiMockGuard(page,
 * ...)` and LATER registers its own `page.route()` mock for `/api/**`, that
 * later-registered mock runs FIRST and can `fulfill()` the request before
 * this guard's handler ever executes — the request simply never appears in
 * `interceptedBackendRequests`, silently. The guard therefore cannot
 * mechanically prove "no mocking happened anywhere on this page"; it can
 * only prove "at least one request that reached this handler was real,
 * unmodified backend traffic." Callers that need a stronger guarantee must
 * register this guard LAST (so it runs first in Playwright's reversed
 * order) and must not register any other `/api/**` handler after it.
 *
 * Tile-host traffic (basemap tiles) is passed through unmodified as well —
 * Stage 1 does not attempt to intercept or replace map tile requests.
 */
export async function installNoApiMockGuard(
  page: Page,
  options: NoApiMockGuardOptions,
): Promise<{ interceptedBackendRequests: string[] }> {
  const interceptedBackendRequests: string[] = [];
  const backendOrigin = new URL(options.backendOrigin).origin;

  const handler = async (route: Route) => {
    const url = route.request().url();
    try {
      if (new URL(url).origin === backendOrigin) {
        interceptedBackendRequests.push(url);
      }
    } catch {
      // Malformed URL — not our concern, let it through.
    }
    await route.continue();
  };

  // Intentionally route '**/*' (not scoped to backendOrigin) so this handler
  // sees every request it is given a chance to see — see the function
  // docstring above for why "given a chance to see" is the operative limit:
  // a page.route() handler registered AFTER this one runs BEFORE it, and can
  // fulfill() a backend-origin request without this handler ever being
  // invoked for it.
  //
  // Awaited (not fire-and-forget): page.route() registration is a round
  // trip to the browser process. Returning before it resolves would let a
  // fast navigation's first requests escape interception — a race-dependent
  // "guarantee" is not a guarantee. Callers must await this function so
  // registration is confirmed complete before any navigation.
  await page.route('**/*', handler);

  return { interceptedBackendRequests };
}

/**
 * Asserts that at least one request recorded by `installNoApiMockGuard`
 * reached the real network through this handler (i.e. the handler called
 * `continue()`, never `fulfill()` — `installNoApiMockGuard` only ever calls
 * `continue()`, so any recorded request is real by construction). This is a
 * spot-check, not a mechanical proof that no other request to the same
 * origin was mocked by a different handler elsewhere on the page — see
 * `installNoApiMockGuard`'s docstring for the route-handler-precedence
 * reason a stronger guarantee is not possible with this mechanism.
 */
export function assertBackendTrafficWasReal(interceptedBackendRequests: string[]): void {
  expect(
    interceptedBackendRequests.length,
    'Expected at least one real request to the backend origin to have been observed by installNoApiMockGuard — a parity spec that never talks to the real API cannot prove anything about parity.',
  ).toBeGreaterThan(0);
}
