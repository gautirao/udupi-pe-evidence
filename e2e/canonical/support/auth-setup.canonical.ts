/**
 * StorageState minting for the canonical E2E harness's role-aware projects
 * (issue #1713, PR-2).
 *
 * This is HARNESS INFRASTRUCTURE, not a product-behaviour spec — it exists
 * solely to produce and validate the `<role>-auth.json` storageState files
 * that `canonical-<role>` projects consume via
 * `canonicalStorageStatePath(role)` (see support/canonical-test.ts). Every
 * OTHER `*.canonical.ts` file in this directory MUST import `test`/`expect`
 * from support/canonical-test.ts (that file's own docstring says so, and it
 * is the mechanism that makes determinism/consent/real-backend-traffic-proof
 * structurally unavoidable for product specs). This file is a deliberate,
 * documented exception: it imports directly from '@playwright/test'.
 *
 * WHY THE EXCEPTION: canonical-test.ts's `backendTraffic` fixture asserts
 * (in afterEach) that the test made at least one real request to
 * BACKEND_BASE_URL (assertBackendTrafficWasReal). Signing in through the
 * real /auth UI does NOT guarantee that — verified directly from source:
 * AuthContext.tsx's fetchUserRole (src/contexts/AuthContext.tsx:33-61) reads
 * `supabase.from('user_roles')...` — a direct Supabase client call, not a
 * request to this repo's Spring Boot backend. A pure login-and-mint routine
 * can legitimately complete having made zero BACKEND_BASE_URL requests, so
 * wrapping this file in the extended `test` would make it fail the
 * real-backend-traffic guard for a reason that has nothing to do with
 * whether the mint actually worked — a false negative, not a false positive
 * (the whole harness exists to eliminate the latter, but manufacturing the
 * former here would be its own defect). canonical-global-setup.ts is this
 * harness's only other precedent for "*.canonical.ts-adjacent infrastructure
 * that doesn't use the extended test" (it isn't a spec at all, isn't picked
 * up by testMatch), and this file follows the same reasoning at the point
 * where it, unlike that one, IS picked up as a project's test file.
 *
 * ENVIRONMENT_GATED (owner ruling D10-AUTH-FIXTURE): hosted Supabase Auth
 * (Option 1) is a shared external mutable dependency and must NEVER be
 * presented as the deterministic canonical fixture — Option 2 (a
 * deterministic auth fixture) is PR-6b, out of scope here. This file's tests
 * only run at all when playwright.canonical.config.ts's `roleAwareProjects()`
 * has already established that role's credentials are present in the
 * environment (project-selection gating, not test.skip — see that file's
 * module docstring). The `hasRealCredentials` check below is defence-in-depth
 * for a caller that somehow reaches this file outside that config path; it is
 * not the primary gate.
 *
 * FAIL-LOUD VALIDATION (the single most important risk this slice's D2 calls
 * out): a storageState that silently fails to authenticate degrades an
 * "authenticated" run into something indistinguishable from a passing anon
 * run. `assertBackendTrafficWasReal` cannot catch this — it proves traffic
 * was real, not that it was authenticated. So after minting, this file reads
 * the storageState file back and asserts it actually contains a Supabase
 * session token (a `sb-*-auth-token` key in some origin's localStorage with a
 * non-trivial value) — a mint that produces a technically-valid-but-empty or
 * missing session throws loudly and deletes the bad file, rather than leaving
 * a landmine for a later run to silently pick up.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { loginAsUser, loginAsBroker, loginAsAdmin, hasRealCredentials } from '../../helpers';
import { canonicalStorageStatePath, type CanonicalRole } from './canonical-test';

type LoginFn = (page: import('@playwright/test').Page, email: string, password: string) => Promise<void>;

interface RoleCredentials {
  email: string;
  password: string;
  login: LoginFn;
}

/**
 * Mirrors playwright.canonical.config.ts's roleCredentialsPresent — same
 * BROKER_EMAIL/DEALER_EMAIL fallback (see .env.e2e.example's deprecated-alias
 * note) so this file's own defence-in-depth check never drifts from the
 * config's primary gate.
 */
const ROLE_CREDENTIALS: Record<CanonicalRole, RoleCredentials> = {
  user: {
    email: process.env.SMOKE_USER_EMAIL ?? '',
    password: process.env.SMOKE_USER_PASSWORD ?? '',
    login: loginAsUser,
  },
  broker: {
    email: process.env.BROKER_EMAIL || process.env.DEALER_EMAIL || '',
    password: process.env.BROKER_PASSWORD || process.env.DEALER_PASSWORD || '',
    login: loginAsBroker,
  },
  admin: {
    email: process.env.ADMIN_EMAIL ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
    login: loginAsAdmin,
  },
};

/** Matches a Supabase JS client's localStorage session key, e.g. "sb-abcdefgh-auth-token". */
const SUPABASE_SESSION_KEY_RE = /^sb-.*-auth-token$/;

// Reuse a still-valid storageState with at least this much life left before
// re-minting — a login that would expire mid-run is treated the same as one
// that's already expired.
const REUSE_MIN_REMAINING_SECONDS = 5 * 60;

/**
 * RATE-LIMIT MINIMISATION: hosted Supabase Auth (the real, live dependency
 * this file mints against — see module docstring's ENVIRONMENT_GATED
 * section) rate-limits repeated password-grant logins. A full-suite run
 * mints all three roles; running the suite repeatedly (as this issue's own
 * 3x-green evidence bar requires) previously re-minted every role every
 * time, live-verified to trip that rate limit.
 *
 * This performs the SAME validity checks as the fail-loud post-mint
 * validation below (valid JSON, a real `sb-*-auth-token` session entry) plus
 * an expiry check — reusing an on-disk storageState is only safe when it is
 * provably still good, never merely present. Anything that fails any check
 * here (missing file, corrupt JSON, no session token, expired/expiring/
 * unparseable expiry) returns false and falls through to a real mint via the
 * live /auth UI — this never silently reuses a bad file.
 */
function isReusableStorageState(storageStatePath: string): boolean {
  if (!fs.existsSync(storageStatePath)) {
    return false;
  }

  let parsed: { origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }> };
  try {
    parsed = JSON.parse(fs.readFileSync(storageStatePath, 'utf-8'));
  } catch {
    return false;
  }

  const sessionEntry = (parsed.origins ?? [])
    .flatMap((origin) => origin.localStorage ?? [])
    .find((entry) => SUPABASE_SESSION_KEY_RE.test(entry.name) && entry.value && entry.value.length > 20);
  if (!sessionEntry) {
    return false;
  }

  let session: { expires_at?: unknown; currentSession?: { expires_at?: unknown } };
  try {
    session = JSON.parse(sessionEntry.value);
  } catch {
    return false;
  }

  const expiresAt = session.expires_at ?? session.currentSession?.expires_at;
  if (typeof expiresAt !== 'number') {
    // Can't prove this session is still good — re-mint rather than guess.
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAt - nowSeconds > REUSE_MIN_REMAINING_SECONDS;
}

function mintRoleStorageState(role: CanonicalRole) {
  // Tag format `[role:<role>]` is load-bearing — playwright.canonical.config.ts's
  // canonical-setup-<role> project selects exactly this test via `grep`.
  test(`[role:${role}] mint + validate storageState via the real /auth UI`, async ({ page, context }) => {
    const creds = ROLE_CREDENTIALS[role];

    // Defence-in-depth only — see module docstring's ENVIRONMENT_GATED section.
    if (!hasRealCredentials(creds.email, creds.password)) {
      throw new Error(
        `[auth-setup] canonical-setup-${role} ran but ${role} credentials are absent from the ` +
        'environment. This should be unreachable: playwright.canonical.config.ts only adds this ' +
        'project when roleCredentialsPresent(role) is true. Do not invoke this file through any ' +
        'mechanism that bypasses that config.',
      );
    }

    const storageStatePath = canonicalStorageStatePath(role);

    // REUSE, not re-mint, when an on-disk storageState is already provably
    // valid — see isReusableStorageState's own docstring for why this is
    // safe (same validity bar as the fail-loud check below, plus expiry).
    // Never live-authenticates in this branch, which is the whole point.
    if (isReusableStorageState(storageStatePath)) {
      return;
    }

    await creds.login(page, creds.email, creds.password);

    // Authed-only positive EARLY (D2's "HARD REQUIREMENT") — confirms the
    // live sign-in actually produced a session before we bother writing
    // anything to disk. RoleAwareHeader only renders this for `user != null`
    // (src/components/layout/AppLayout.tsx:414-427), regardless of role.
    await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 15_000 });

    fs.mkdirSync(nodePath.dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });

    // FAIL LOUDLY if the file we just wrote doesn't actually carry a session
    // — see module docstring. A storageState with cookies but no Supabase
    // localStorage session token would authenticate nothing on next use.
    const raw = fs.readFileSync(storageStatePath, 'utf-8');
    let parsed: { origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }> };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      fs.rmSync(storageStatePath, { force: true });
      throw new Error(
        `[auth-setup] Minted storageState for role="${role}" at ${storageStatePath} is not valid JSON ` +
        `(${String(err)}). Deleted the bad file rather than leaving it for a later run to trust.`,
      );
    }

    const hasSessionToken = (parsed.origins ?? []).some((origin) =>
      (origin.localStorage ?? []).some(
        (entry) => SUPABASE_SESSION_KEY_RE.test(entry.name) && entry.value && entry.value.length > 20,
      ),
    );

    if (!hasSessionToken) {
      fs.rmSync(storageStatePath, { force: true });
      throw new Error(
        `[auth-setup] Minted storageState for role="${role}" at ${storageStatePath} contains no ` +
        'Supabase session token (no sb-*-auth-token entry with a real value in any origin\'s ' +
        'localStorage). A storageState like this would silently authenticate nothing on next use — ' +
        'deleted the bad file rather than leaving that landmine for a later run.',
      );
    }
  });
}

mintRoleStorageState('user');
mintRoleStorageState('broker');
mintRoleStorageState('admin');
