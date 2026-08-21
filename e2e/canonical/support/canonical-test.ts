/**
 * Canonical E2E harness — the SINGLE extended Playwright `test`/`expect` export
 * (issue #1713, PR-1: "Canonical E2E harness + fixture contract").
 *
 * Every spec under e2e/canonical/**\/*.canonical.ts MUST import `test`/`expect`
 * from THIS file, never directly from '@playwright/test'. That is what makes
 * the governing rules below structurally unavoidable rather than a matter of
 * per-author discipline — a spec that imports from '@playwright/test' instead
 * gets none of these guarantees and is expected to be caught in review, but
 * this file is the mechanism that makes doing it correctly the path of least
 * resistance.
 *
 * What every canonical test gets automatically, via `beforeEach`/`afterEach`
 * fixtures:
 *
 *   1. Determinism: installDeterminismInitScript (kill CSS animations /
 *      transitions / caret) — reused verbatim from e2e-parity/support/determinism.ts,
 *      never re-implemented here. `waitForFontsReady` / `waitForMapSettled` are
 *      re-exported for specs to call explicitly at the point they need them
 *      (they are not blanket beforeEach waits — a spec that never renders the
 *      map should not pay waitForMapSettled's fixed ~1.5s tax).
 *
 *   2. Real-backend proof: installNoApiMockGuard is installed in `beforeEach`
 *      (before any navigation), and assertBackendTrafficWasReal runs in
 *      `afterEach` — reused verbatim from e2e-parity/support/determinism.ts.
 *      This repo has a documented failure mode (issue #1713's own motivating
 *      history) where a mocked or degraded app scores HIGHER on E2E because
 *      negative assertions pass vacuously against an empty page. Every
 *      canonical spec is required to prove it actually talked to a real,
 *      unmocked backend, not just that some assertion happened to pass.
 *
 *   3. Telemetry consent: grantDiscoverConsent (from e2e/helpers.ts) runs in
 *      `beforeEach`, before any navigation. The Discover consent contract is
 *      default-deny (see discover_telemetry_consent in localStorage) — without
 *      this, Discover surfaces render a consent banner and behave differently
 *      than a consented session, which would make canonical specs test the
 *      wrong UI state.
 *
 * Role storageState (authenticated specs) — SEAM, NOT EXERCISED BY THIS SLICE:
 *
 *   PR-1's own smoke spec is anonymous and uses no credentials. But per owner
 *   ruling DISCOVER-JOURNEYS-BUILD-NOW, PR-3 builds authenticated Discover
 *   journeys (area-first/school-first/agri-first) directly on this harness,
 *   so the seam for role-based storageState selection is built now rather
 *   than retrofitted later. `canonicalStorageStatePath(role)` below resolves
 *   a path under e2e/canonical/fixtures/<role>-auth.json — mirroring
 *   e2e-parity's parity-global-setup.ts fixture layout — but does NOT mint or
 *   read anything itself; a spec that needs authenticated state passes the
 *   resolved path directly to `test.use({ storageState })`.
 *
 *   Per owner ruling D10-AUTH-FIXTURE: hosted Supabase Auth (Option 1) is a
 *   shared external mutable dependency and must NEVER be presented as the
 *   deterministic canonical fixture. Any spec that relies on a storageState
 *   minted against hosted Supabase Auth MUST label itself ENVIRONMENT_GATED
 *   (e.g. in its own top-of-file docstring and via a runtime skip when the
 *   required credentials/env are absent) — this file only provides the path
 *   resolution seam, it does not make that judgement call for the caller.
 */

import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  installDeterminismInitScript,
  waitForFontsReady,
  waitForMapSettled,
  installNoApiMockGuard,
  assertBackendTrafficWasReal,
} from '../../../e2e-parity/support/determinism';
import { grantDiscoverConsent } from '../../helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the storageState fixture path for a given role, mirroring
 * e2e-parity's fixture layout (e2e-parity/fixtures/<role>-auth.json).
 *
 * This function does NOT mint, validate, or read the file — it is a path
 * builder only. It is exported so an authenticated canonical spec (PR-3+)
 * can do:
 *
 *   test.use({ storageState: canonicalStorageStatePath('broker') });
 *
 * A spec doing this MUST also document (in its own top-of-file docstring)
 * that it is ENVIRONMENT_GATED on hosted Supabase Auth per owner ruling
 * D10-AUTH-FIXTURE, and MUST skip gracefully (e.g. via hasRealCredentials
 * from e2e/helpers.ts) when the fixture file / credentials are unavailable —
 * never fail the whole canonical run for an environment gap.
 */
export type CanonicalRole = 'admin' | 'broker' | 'user';

export function canonicalStorageStatePath(role: CanonicalRole): string {
  return path.join(__dirname, '..', 'fixtures', `${role}-auth.json`);
}

interface CanonicalFixtures {
  /**
   * Populated by the beforeEach `installNoApiMockGuard` call; asserted
   * non-empty in afterEach via `assertBackendTrafficWasReal`. Exposed to
   * specs in case a test wants to assert something more specific about which
   * backend paths were actually hit (e.g. "the public listing detail
   * endpoint was reached, not just any backend endpoint").
   */
  backendTraffic: { interceptedBackendRequests: string[] };
}

function requireBackendBaseUrl(): string {
  const backend = process.env.BACKEND_BASE_URL;
  if (!backend) {
    // playwright.canonical.config.ts already throws at config-load time if this
    // is unset, so reaching here would mean a test process was launched some
    // other way. Fail loudly rather than silently skip the real-traffic guard.
    throw new Error(
      '[canonical-test] BACKEND_BASE_URL is unset inside a running test. ' +
      'This should be unreachable — playwright.canonical.config.ts fails closed ' +
      'at config-load time before any test can start. Do not launch canonical ' +
      'specs through any mechanism that bypasses that config.',
    );
  }
  return backend;
}

/**
 * The one extended `test` every canonical spec must import instead of
 * '@playwright/test''s own `test`. See module docstring for what beforeEach/
 * afterEach do and why.
 */
export const test = base.extend<CanonicalFixtures>({
  // `auto: true` — this fixture must run for EVERY canonical test even if the
  // test body never destructures `backendTraffic`. Without `auto: true`,
  // Playwright only instantiates a fixture a test actually requests, which
  // would silently skip the determinism/consent/no-mock-guard setup (and the
  // afterEach real-traffic assertion) for any spec that forgets to ask for it
  // — exactly the "structurally unavoidable, not per-author discipline"
  // guarantee this file exists to provide.
  backendTraffic: [
    async ({ page }, use) => {
      await installDeterminismInitScript(page);
      await grantDiscoverConsent(page);

      const guard = await installNoApiMockGuard(page, { backendOrigin: requireBackendBaseUrl() });

      await use(guard);

      assertBackendTrafficWasReal(guard.interceptedBackendRequests);
    },
    { auto: true },
  ],
});

export { expect, waitForFontsReady, waitForMapSettled };
export type { Page };
