/**
 * Playwright config for the CANONICAL E2E harness (issue #1713, PR-1).
 *
 * WHY THIS FILE EXISTS: playwright.config.ts:35 is
 *
 *   baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://udupi-property-explorer.pages.dev'
 *
 * — an unset env var silently retargets the ENTIRE existing suite at the
 * DEPLOYED PRODUCTION SITE. A run against production can pass every
 * assertion while proving nothing about the code under review, and the run
 * looks identical to a correct local run in CI logs. This config makes that
 * failure mode structurally impossible: every check below THROWS AT
 * CONFIG-LOAD TIME, before Playwright schedules a single test, and there is
 * NO `||`/`??` fallback anywhere in this file — that fallback IS the bug
 * this file exists to close. See playwright.parity.config.ts for the
 * precedent this pattern is copied from (not literally reused — this file
 * intentionally does not import it, to keep the two harnesses decoupled).
 *
 * testDir/testMatch: testDir is './e2e/canonical', and testMatch is
 * '**\/*.canonical.ts' — NOT '*.spec.ts'. This is MANDATORY, not a style
 * choice: playwright.config.ts's `full` project (line ~69) has no
 * `testMatch` of its own, so it recursively picks up EVERY '*.spec.ts' under
 * testDir './e2e', INCLUDING anything under e2e/canonical/. Combined with
 * that file's baseURL fallback above, a canonical spec named '*.spec.ts'
 * would be run a SECOND time by the OLD config, with none of this file's
 * guards, against the DEPLOYED PRODUCTION SITE. Playwright's own default
 * testMatch (`**\/*.@(spec|test).?(c|m)[jt]s?(x)`) does not match
 * '*.canonical.ts', so this naming convention makes the isolation a property
 * of the filename itself rather than something that depends on remembering
 * to update playwright.config.ts (which is forbidden to modify for this
 * slice in any case — see e2e/canonical/README.md). See D6 in this issue's
 * execution handoff for the full citation of playwright.config.ts's lines.
 *
 * Determinism contract (mirrors playwright.parity.config.ts's, this harness's
 * nearest precedent):
 *   - locale en-IN, timezoneId Asia/Kolkata
 *   - deviceScaleFactor 1, colorScheme light, reducedMotion 'reduce'
 *   - retries 0, workers 1 — this harness's fixture is a single local
 *     Postgres/PostGIS container (see e2e/canonical/README.md); parallel
 *     workers would race on shared row state.
 *
 * webServer starts the FRONTEND ONLY (`vite preview --port 5251
 * --strictPort`). It deliberately never starts the backend — Playwright does
 * not manage cross-service processes for this harness, and
 * canonical-global-setup.ts's two probes (backend reachability + CORS origin
 * admission) exist specifically to turn "backend not running" into a loud
 * failure at globalSetup time instead of a confusing mid-test one. See
 * e2e/canonical/README.md for the required local run sequence.
 *
 * Reporter/outputDir are namespaced under subdirectories of the existing
 * bare `playwright-report/`/`test-results/` roots (`playwright-report/canonical`,
 * `test-results/canonical`) — not `-canonical` suffixed siblings — so this
 * harness's output can never collide with playwright.config.ts's or
 * playwright.parity.config.ts's, AND so it stays covered by the root
 * .gitignore's existing bare `playwright-report/`/`test-results/` entries
 * without editing that file (out of scope for this slice). A `-canonical`
 * suffixed sibling directory would NOT match those bare patterns and would
 * leave failure screenshots/traces untracked-but-uncommitted.
 *
 * Projects are named, not gated by test.skip: environment gating (e.g. an
 * authenticated-only project for PR-3's future specs) must happen by PROJECT
 * SELECTION (`--project=<name>`), never by a runtime `test.skip` inside a
 * spec — a skipped test still reports as a pass-adjacent outcome in some CI
 * summaries, which is exactly the kind of ambiguous "did this actually run"
 * signal this whole harness exists to eliminate. This slice defines exactly
 * one project (`canonical-anon`) because its one smoke spec is anonymous;
 * PR-3+ adds authenticated projects alongside it.
 */

import { defineConfig, devices } from '@playwright/test';

const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL;

// BELT-AND-BRACES ONLY, NOT LOAD-BEARING (see the positive predicate below,
// which is the actual control). A deny-list can only ever name domains it
// already knows about — it silently admits any OTHER non-local host (a
// future propertysignal.in, a staging domain, a raw production IP), which is
// exactly the gap a PR review of this file caught. Kept purely because it
// gives a sharper, more specific error message for the single most likely
// operator mistake (pasting a pages.dev/supabase.co URL). This block must
// only ever ADD a throw on top of the positive check below — it must never
// be able to permit something the positive check rejects.
//
// `i` flag: an operator-set PLAYWRIGHT_BASE_URL/BACKEND_BASE_URL with mixed-
// or upper-case host casing (e.g. "https://PAGES.DEV") must not bypass this
// refusal — hostnames are case-insensitive, and this guard's entire job is
// refusing the wrong target.
const HOSTED_TARGET_PATTERN = /pages\.dev|supabase\.co/i;

/**
 * Positive local-only predicate — the ACTUAL control (issue #1713 PR review
 * F1 fix). Rather than deny known-bad hosts, this requires the hostname to be
 * a recognised loopback form:
 *   - 'localhost'
 *   - the 127.0.0.0/8 range (127.x.x.x)
 *   - IPv6 loopback ::1 — Node's URL parser normalises this to the bracketed
 *     '[::1]' form in `.hostname` for a URL like 'http://[::1]:5251', so both
 *     the bracketed and bare forms are accepted here.
 *
 * 0.0.0.0 is explicitly NOT loopback — it is a bind-any address ("listen on
 * every interface"), not a target you can meaningfully "run against
 * yourself" the way localhost/127.0.0.1 are, and admitting it would reopen
 * the same class of hole this predicate exists to close. It is rejected by
 * simply not matching any of the three recognised forms above — no special
 * case needed.
 */
function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost') return true;
  if (h === '[::1]' || h === '::1') return true;
  const ipv4Match = h.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    return ipv4Match.slice(1).every((octet) => Number(octet) <= 255);
  }
  return false;
}

/**
 * Throws at config-load time (module scope) unless `rawValue` is a
 * well-formed URL whose hostname is a recognised loopback form. A value that
 * fails to parse as a URL at all is NOT permitted through — it throws rather
 * than silently falling through to the hosted-target deny-list below.
 */
function assertLocalOnlyUrl(varName: string, rawValue: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch (err) {
    throw new Error(
      `[playwright.canonical.config.ts] ${varName} ("${rawValue}") is not a parseable URL (${String(err)}). ` +
      'This config requires an explicit, well-formed, loopback-only URL, e.g. http://localhost:5251. ' +
      'See e2e/canonical/README.md.',
    );
  }

  if (!isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      `[playwright.canonical.config.ts] ${varName} ("${rawValue}") has hostname "${parsed.hostname}", which ` +
      'is not a recognised loopback address. The canonical suite requires a LOCAL-ONLY target: localhost, ' +
      '127.0.0.0/8, or [::1]. This is a positive allow-list, not a deny-list — it refuses every non-local ' +
      'host (including 0.0.0.0, a bind-any address rather than a loopback target, and any hosted deployment ' +
      'the deny-list below does not happen to name). Point it at a local dev/preview server instead. ' +
      'See e2e/canonical/README.md.',
    );
  }
}

if (!PLAYWRIGHT_BASE_URL) {
  throw new Error(
    '[playwright.canonical.config.ts] PLAYWRIGHT_BASE_URL is not set. ' +
    'This config never defaults to any target — set PLAYWRIGHT_BASE_URL explicitly ' +
    '(e.g. http://localhost:5251) before running the canonical suite. See e2e/canonical/README.md.',
  );
}

if (!BACKEND_BASE_URL) {
  throw new Error(
    '[playwright.canonical.config.ts] BACKEND_BASE_URL is not set. ' +
    'This config never defaults to any target — set BACKEND_BASE_URL explicitly ' +
    '(e.g. http://localhost:8251) before running the canonical suite. See e2e/canonical/README.md.',
  );
}

// Positive predicate FIRST — this is the actual control (see docstrings above).
assertLocalOnlyUrl('PLAYWRIGHT_BASE_URL', PLAYWRIGHT_BASE_URL);
assertLocalOnlyUrl('BACKEND_BASE_URL', BACKEND_BASE_URL);

// Redundant secondary check — belt-and-braces only, see comment above
// HOSTED_TARGET_PATTERN. Anything it would catch, the positive predicate
// above has already thrown on; this exists only to give a sharper error
// message for the most likely operator mistake.
if (HOSTED_TARGET_PATTERN.test(PLAYWRIGHT_BASE_URL)) {
  throw new Error(
    `[playwright.canonical.config.ts] PLAYWRIGHT_BASE_URL ("${PLAYWRIGHT_BASE_URL}") looks like a ` +
    'hosted target (matches /pages.dev|supabase.co/). The canonical suite refuses to run against a ' +
    'hosted deployment or a hosted Supabase project — it exists specifically to close the "silently ' +
    'ran against production" failure mode. Point it at a local dev/preview server instead.',
  );
}

if (HOSTED_TARGET_PATTERN.test(BACKEND_BASE_URL)) {
  throw new Error(
    `[playwright.canonical.config.ts] BACKEND_BASE_URL ("${BACKEND_BASE_URL}") looks like a hosted ` +
    'target (matches /pages.dev|supabase.co/). The canonical suite refuses to run against a hosted ' +
    'deployment. Point it at a local backend instead (see e2e/canonical/README.md).',
  );
}

const DESKTOP_VIEWPORT = { width: 1366, height: 768 };

export default defineConfig({
  testDir: './e2e/canonical',
  testMatch: '**/*.canonical.ts',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  globalSetup: './e2e/canonical/canonical-global-setup.ts',
  // Nested under the existing bare `playwright-report/`/`test-results/` roots
  // (root .gitignore lines 51-52) rather than `playwright-report-canonical`/
  // `test-results-canonical` sibling directories — a `-canonical` suffixed
  // sibling would NOT match either bare gitignore pattern, so PR-3's
  // authenticated-spec failure screenshots/traces would land untracked and
  // one `git add -A` from being committed. Nesting reuses the existing
  // ignore coverage without touching the root .gitignore (out of scope for
  // this slice) or any other harness's report/output directories.
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/canonical' }]],
  outputDir: 'test-results/canonical',
  webServer: {
    // FRONTEND ONLY — see module docstring. Never add a backend start command here.
    command: 'npm run preview -- --port 5251 --strictPort',
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'canonical-anon',
      use: { ...devices['Desktop Chrome'], viewport: DESKTOP_VIEWPORT },
    },
  ],
});
