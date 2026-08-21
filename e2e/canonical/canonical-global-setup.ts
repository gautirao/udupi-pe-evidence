/**
 * Playwright global setup for the canonical E2E harness (issue #1713, PR-1) —
 * playwright.canonical.config.ts's `globalSetup`.
 *
 * Playwright's own `webServer` block in playwright.canonical.config.ts starts
 * the FRONTEND only (`vite preview`) — it deliberately never starts the
 * backend (see that file's docstring). That means an absent/unreachable
 * backend is NOT something Playwright's webServer readiness check can catch;
 * without an explicit probe here, the first symptom would be a confusing
 * mid-test failure (or worse, a false pass — see the CORS note below) deep
 * inside some later spec's assertions.
 *
 * This file runs TWO distinct, REQUIRED probes before any test starts, and
 * each one is failing loudly for a genuinely different failure mode:
 *
 *   (a) BACKEND REACHABILITY — a bounded-timeout HTTP request to
 *       BACKEND_BASE_URL's health endpoint. Proves the backend process is up
 *       and answering HTTP at all.
 *
 *   (b) CORS ORIGIN ADMISSION — a request to the backend carrying an
 *       `Origin: <PLAYWRIGHT_BASE_URL>` header, asserting the response's
 *       `Access-Control-Allow-Origin` admits that exact origin.
 *
 * WHY BOTH, AND WHY (b) CANNOT BE SKIPPED EVEN THOUGH (a) PASSES:
 *
 *   backend/src/main/resources/application.yml:174-175 is
 *
 *     cors:
 *       allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:5173,http://localhost:5174,http://localhost:3000}
 *
 *   This harness serves its preview build on port 5251 (see
 *   playwright.canonical.config.ts's webServer + this repo's #1713 port
 *   allocation), which is NOT in that default allow-list. A CORS-blocked
 *   request does not surface as an HTTP error to the app — the browser
 *   silently withholds the response from JavaScript, the app's fetch calls
 *   reject or return nothing usable, and the UI renders EMPTY. An empty
 *   Discover/listing page is indistinguishable, to a naive "no results
 *   shown" assertion, from a correctly-rendered "no data" state — so a
 *   CORS-misconfigured run can PASS negative assertions while proving
 *   nothing. Probe (a) alone cannot catch this: curl/fetch from Node has no
 *   same-origin policy, so a plain health-check request succeeds whether or
 *   not the backend would actually admit a browser tab running on 5251. Only
 *   an explicit `Origin` header + a check of the response header proves what
 *   a real browser would be permitted to do.
 *
 * BUILD-SHA PROVENANCE (issue #1713 PR review F2 fix): this file also derives
 * the sha that canonical-harness-smoke.canonical.ts's build-sha assertion
 * must match, and does so exactly ONCE via `git rev-parse HEAD` — the caller
 * is never trusted to remember to export it (the prior EXPECTED_BUILD_SHA
 * design made the whole D4 provenance check optional-by-omission, which
 * defeated its purpose; see the PR review that flagged this).
 *
 * Playwright test workers are forked from this process AFTER globalSetup
 * resolves, so `process.env.CANONICAL_EXPECTED_BUILD_SHA` set here is
 * inherited by every worker/test — this is the documented mechanism
 * Playwright itself uses for globalSetup-derived environment values, not an
 * undocumented hack.
 *
 * CANONICAL_SKIP_SHA_PROVENANCE is the only sanctioned opt-OUT (never an
 * opt-in) — set it to skip the equality assertion for local iteration when
 * you deliberately are not testing HEAD (e.g. hand-editing dist/ during
 * harness debugging). Its absence is the fail-loud default: no export means
 * the check runs and is mandatory.
 *
 * DIRTY-TREE HONESTY: HEAD's sha describes the last COMMIT, not uncommitted
 * working-tree changes. A green provenance check on a dirty tree proves the
 * served build matches committed HEAD, not your full working tree — that
 * limitation must be visible, not silent, so this file warns loudly (never
 * fails) when the tree is dirty.
 */

import { execSync } from 'node:child_process';

const HEALTH_TIMEOUT_MS = 10_000;
const CORS_PROBE_TIMEOUT_MS = 10_000;

/** Explicit OPT-OUT (never opt-in) for the mandatory build-sha provenance assertion. See module docstring. */
const SHA_PROVENANCE_OPT_OUT_VAR = 'CANONICAL_SKIP_SHA_PROVENANCE';

/** Throws loudly if PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL are not explicitly set. See module docstring. */
function requireExplicitEnvironment(): { frontend: string; backend: string } {
  const frontend = process.env.PLAYWRIGHT_BASE_URL;
  const backend = process.env.BACKEND_BASE_URL;

  const missing: string[] = [];
  if (!frontend) missing.push('PLAYWRIGHT_BASE_URL');
  if (!backend) missing.push('BACKEND_BASE_URL');

  if (missing.length > 0) {
    throw new Error(
      `[canonical-global-setup] Missing required environment variable(s): ${missing.join(', ')}. ` +
      'The canonical harness NEVER falls back to a default target — set both explicitly ' +
      '(e.g. PLAYWRIGHT_BASE_URL=http://localhost:5251, BACKEND_BASE_URL=http://localhost:8251) ' +
      'before running playwright.canonical.config.ts. See e2e/canonical/README.md.',
    );
  }

  // Non-null by construction above.
  return { frontend: frontend as string, backend: backend as string };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Shared by both probes below — each hits the same health endpoint, once plain and once with an Origin header. */
function healthUrlFor(backend: string): string {
  return new URL('/actuator/health', backend).toString();
}

/** Probe (a): the backend process must be up and answering HTTP within HEALTH_TIMEOUT_MS. */
async function probeBackendReachability(backend: string): Promise<void> {
  const healthUrl = healthUrlFor(backend);

  let response: Response;
  try {
    response = await fetchWithTimeout(healthUrl, { method: 'GET' }, HEALTH_TIMEOUT_MS);
  } catch (err) {
    throw new Error(
      `[canonical-global-setup] BACKEND UNREACHABLE: request to ${healthUrl} failed or timed out ` +
      `after ${HEALTH_TIMEOUT_MS}ms (${String(err)}). Playwright does not manage the backend process — ` +
      'start it yourself before running the canonical suite (see e2e/canonical/README.md, e.g. ' +
      'scripts/dev/local-fixture-backend.sh) and confirm BACKEND_BASE_URL points at it.',
    );
  }

  if (!response.ok) {
    throw new Error(
      `[canonical-global-setup] BACKEND UNHEALTHY: ${healthUrl} responded with HTTP ${response.status}. ` +
      'The backend process is reachable but not reporting healthy — check its logs before running ' +
      'the canonical suite.',
    );
  }
}

/**
 * Probe (b): the backend's CORS configuration must explicitly admit
 * PLAYWRIGHT_BASE_URL as an allowed origin. See module docstring for why
 * this is a SEPARATE probe from (a) and cannot be inferred from it.
 */
async function probeCorsOriginAdmission(backend: string, frontendOrigin: string): Promise<void> {
  const healthUrl = healthUrlFor(backend);

  let response: Response;
  try {
    response = await fetchWithTimeout(
      healthUrl,
      { method: 'GET', headers: { Origin: frontendOrigin } },
      CORS_PROBE_TIMEOUT_MS,
    );
  } catch (err) {
    throw new Error(
      `[canonical-global-setup] CORS PROBE FAILED: request to ${healthUrl} with Origin: ${frontendOrigin} ` +
      `failed or timed out after ${CORS_PROBE_TIMEOUT_MS}ms (${String(err)}).`,
    );
  }

  const allowOrigin = response.headers.get('access-control-allow-origin');

  // Exact-origin match ONLY — no '*' branch. backend's CorsConfig.java sets
  // allowCredentials(true) on the "/**" mapping, and per the CORS spec Spring
  // (and every compliant server) never echoes a literal '*' for
  // Access-Control-Allow-Origin when credentials are allowed — a wildcard
  // response is therefore either impossible from this backend or itself a
  // misconfiguration, and either way must not be treated as a pass.
  if (allowOrigin !== frontendOrigin) {
    throw new Error(
      `[canonical-global-setup] CORS ORIGIN NOT ADMITTED: the backend at ${backend} did not admit ` +
      `Origin: ${frontendOrigin} (Access-Control-Allow-Origin was ${JSON.stringify(allowOrigin)}). ` +
      'A CORS-blocked run does NOT error inside the app — the browser silently withholds every ' +
      'fetch response, the UI renders EMPTY, and a naive "no results" assertion PASSES against a ' +
      'broken app (see this file\'s module docstring). Fix by setting the backend\'s ' +
      `CORS_ALLOWED_ORIGINS environment variable to include exactly "${frontendOrigin}" ` +
      '(backend/src/main/resources/application.yml:174-175 documents the default, which only ' +
      'covers ports 5173/5174/3000 — port 5251, this harness\'s preview port, is not in it).',
    );
  }
}

/** Runs `git rev-parse HEAD` once. Throws loudly if git is unavailable or the command fails. */
function deriveHeadSha(): string {
  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
      throw new Error(`unexpected 'git rev-parse HEAD' output: ${JSON.stringify(sha)}`);
    }
    return sha;
  } catch (err) {
    throw new Error(
      `[canonical-global-setup] Failed to derive the expected build sha via 'git rev-parse HEAD' (${String(err)}). ` +
      'The build-sha provenance assertion cannot run without this. If you deliberately need to skip it ' +
      `(e.g. local harness debugging), set ${SHA_PROVENANCE_OPT_OUT_VAR}=1 instead of working around this failure.`,
    );
  }
}

/**
 * Warns (never fails) when the working tree has uncommitted changes. HEAD's
 * sha does not describe those changes, so a green provenance check on a
 * dirty tree only proves the served build matches committed HEAD — see
 * module docstring's DIRTY-TREE HONESTY section.
 */
function warnIfWorkingTreeDirty(): void {
  let status: string;
  try {
    status = execSync('git status --porcelain', { encoding: 'utf-8' });
  } catch (err) {
    console.warn(`[canonical-global-setup] Could not check working-tree cleanliness (${String(err)}); skipping dirty-tree warning.`);
    return;
  }

  if (status.trim().length > 0) {
    console.warn(
      '[canonical-global-setup] WARNING: working tree has uncommitted changes. The build-sha provenance ' +
      'assertion compares the served build against HEAD only — it does NOT prove your uncommitted changes ' +
      'are what was served. A green provenance check here proves "this run served committed HEAD", not ' +
      '"this run served everything currently in your working tree". Commit or stash first if you need the ' +
      'stronger guarantee.',
    );
  }
}

/**
 * Resolves the build-sha provenance environment for the tests: either derives
 * and publishes CANONICAL_EXPECTED_BUILD_SHA (mandatory default), or — only
 * when the explicit opt-out is set — publishes CANONICAL_SHA_PROVENANCE_SKIPPED
 * instead. Never both. See module docstring.
 */
function resolveBuildShaProvenance(): void {
  warnIfWorkingTreeDirty();

  if (process.env[SHA_PROVENANCE_OPT_OUT_VAR]) {
    console.warn(
      `[canonical-global-setup] ${SHA_PROVENANCE_OPT_OUT_VAR} is set — the build-sha provenance assertion ` +
      'will be SKIPPED for this run. This must never be the default for a real gate run; it exists only ' +
      'for local iteration when you are deliberately not testing HEAD.',
    );
    process.env.CANONICAL_SHA_PROVENANCE_SKIPPED = 'true';
    delete process.env.CANONICAL_EXPECTED_BUILD_SHA;
    return;
  }

  const sha = deriveHeadSha();
  process.env.CANONICAL_EXPECTED_BUILD_SHA = sha;
  delete process.env.CANONICAL_SHA_PROVENANCE_SKIPPED;
  console.log(`[canonical-global-setup] Derived expected build sha from HEAD: ${sha}`);
}

export default async function canonicalGlobalSetup(): Promise<void> {
  const { frontend, backend } = requireExplicitEnvironment();

  console.log(`[canonical-global-setup] Resolved frontend base URL: ${frontend}`);
  console.log(`[canonical-global-setup] Resolved backend base URL: ${backend}`);

  await probeBackendReachability(backend);
  console.log('[canonical-global-setup] Backend reachability probe PASSED.');

  await probeCorsOriginAdmission(backend, frontend);
  console.log(`[canonical-global-setup] CORS origin admission probe PASSED for Origin: ${frontend}.`);

  resolveBuildShaProvenance();
}
