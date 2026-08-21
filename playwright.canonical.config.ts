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
import { hasRealCredentials } from './e2e/helpers';
import { canonicalStorageStatePath, type CanonicalRole } from './e2e/canonical/support/canonical-test';

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

// Derived from PLAYWRIGHT_BASE_URL (already validated as a loopback URL
// above), not hardcoded — CF-1 (PR-2 handoff carry-forward): a fixed
// '--port 5251' here meant every slice's webServer collided on 5251
// regardless of its own assigned selected_ports, which blocks PR-3+ from
// running its own preview server in parallel with PR-2's.
//
// NOTE ON THE '||' BELOW: this file's module docstring says there is no
// '||'/'??' fallback anywhere, but that rule is about never falling back to
// a hosted/production TARGET — this only falls back on the PORT of an
// already-validated LOOPBACK url, never the host. assertLocalOnlyUrl above
// guarantees a well-formed, loopback-hostname URL; it does NOT guarantee the
// URL carries an explicit port (e.g. 'http://localhost' with no ':5251' is
// still well-formed and still loopback). If PLAYWRIGHT_BASE_URL omits a
// port, `.port` is '', and the fallback below covers that case. The failure
// mode if this fallback fires unexpectedly is loud, not silent: webServer
// starts on 5251 while Playwright polls the URL's own (different, implicit)
// port, producing a startup timeout rather than a run against the wrong host.
const PREVIEW_PORT = new URL(PLAYWRIGHT_BASE_URL).port || '5251';

// ─────────────────────────────────────────────────────────────────────────
// Role-aware authenticated projects (issue #1713, PR-2) — ADDITIVE ONLY.
//
// DESIGN DECISION (this slice's live review question — see PR-2 handoff D1):
// a small per-role PROJECT FACTORY, not one hardcoded "canonical-authed"
// project and not an arbitrary/open-ended role system. Reasoning:
//   - The grounded role set is EXACTLY {'user','broker','admin'} — the same
//     CanonicalRole union PR-1 already committed to in canonical-test.ts and
//     exactly what e2e/helpers.ts's loginAsUser/loginAsBroker/loginAsAdmin
//     provide. There is no fourth role to plan for today (no distinct
//     'owner' credential — ownership is a per-listing property of a plain
//     'user', not a login identity; no 'dealer'/'buyer' journey in PR-2..PR-5).
//   - All three roles need IDENTICAL treatment (mint via the real /auth UI,
//     validate the minted storageState, gate project inclusion on that
//     role's own credential pair) — a factory removes that 3x duplication
//     without inventing generality beyond what's already proven necessary.
//   - PR-3/PR-4/PR-5 (per the owner's own design brief) will each need
//     authenticated projects for the SAME three roles, so this becomes a
//     published interface those PRs branch from directly, rather than each
//     re-deriving its own ad hoc authenticated-project wiring.
//
// ENVIRONMENT GATING BY PROJECT SELECTION (mandatory — never test.skip):
// package.json's `test:e2e:canonical` script is out of scope to modify and
// passes no `--project` filter, so it runs every project in this array by
// default. A role's {canonical-setup-<role>, canonical-<role>} project pair
// is only ADDED to the array when that role's real credentials are present
// in the environment (see roleCredentialsPresent below) — mirroring this
// file's own existing synchronous fail-fast style for
// PLAYWRIGHT_BASE_URL/BACKEND_BASE_URL. This means:
//   - An operator with NO SMOKE_USER_EMAIL/BROKER_EMAIL/ADMIN_EMAIL exported
//     gets exactly PR-1's original behaviour back: only `canonical-anon`
//     runs, zero credentials required, zero regression.
//   - An operator who exports (say) SMOKE_USER_EMAIL/PASSWORD before running
//     the bare npm script automatically also gets `canonical-user` (and its
//     `canonical-setup-user` dependency) added — no `--project` flag needed.
//   - A missing/expired credential shows up as an ABSENT project (that role's
//     tests simply do not run this invocation), never as a test.skip inside
//     a spec — satisfying the "indistinguishable from silently not running"
//     ban verbatim.
//
// GREP-BASED ROLE TAGGING: every role-gated spec (T1 per-role sign-in, T2,
// T3, T12) tags its test title with a literal `[role:<role>]` substring.
// `canonical-<role>` projects `grep` on that exact tag; `canonical-anon`
// `grepInvert`s the same pattern so it never attempts a role-tagged test
// that needs credentials/storageState it doesn't have. T10/T11/the harness
// smoke spec carry no such tag and so only ever match `canonical-anon`.
//
// STORAGESTATE VS LIVE LOGIN: T1/T2/T3 exercise the LIVE sign-in flow itself
// (they must start from an anonymous browser context even though they run
// inside a `canonical-<role>` project, whose project-level `use.storageState`
// points at that role's PRE-AUTHENTICATED fixture for T12-style specs).
// auth-session.canonical.ts resolves this with its own file-level
// `test.use({ storageState: { cookies: [], origins: [] } })`, which overrides
// the project default for every test in that file only — see that file's
// module docstring.
// ─────────────────────────────────────────────────────────────────────────

const CANONICAL_ROLES: readonly CanonicalRole[] = ['user', 'broker', 'admin'] as const;

/**
 * Mirrors scripts/dev/local-fixture-backend.sh's own best-effort broker/user
 * identity-seed credential resolution (BROKER_EMAIL falling back to the
 * deprecated DEALER_EMAIL alias — see .env.e2e.example) so this file's
 * gating logic never drifts from what that script can actually seed.
 */
function roleCredentialsPresent(role: CanonicalRole): boolean {
  if (role === 'user') {
    return hasRealCredentials(process.env.SMOKE_USER_EMAIL ?? '', process.env.SMOKE_USER_PASSWORD ?? '');
  }
  if (role === 'broker') {
    return hasRealCredentials(
      process.env.BROKER_EMAIL || process.env.DEALER_EMAIL || '',
      process.env.BROKER_PASSWORD || process.env.DEALER_PASSWORD || '',
    );
  }
  // role === 'admin'
  return hasRealCredentials(process.env.ADMIN_EMAIL ?? '', process.env.ADMIN_PASSWORD ?? '');
}

function roleAwareProjects() {
  const projects: NonNullable<Parameters<typeof defineConfig>[0]['projects']> = [];

  for (const role of CANONICAL_ROLES) {
    if (!roleCredentialsPresent(role)) continue;

    // Mints + validates this role's storageState via the real /auth UI (see
    // e2e/canonical/support/auth-setup.canonical.ts). Scoped with its own
    // testDir/testMatch so it never also picks up the rest of the suite.
    projects.push({
      name: `canonical-setup-${role}`,
      testDir: './e2e/canonical/support',
      testMatch: /auth-setup\.canonical\.ts$/,
      grep: new RegExp(`\\[role:${role}\\]`),
      use: { ...devices['Desktop Chrome'], viewport: DESKTOP_VIEWPORT },
    });

    // Runs this role's tagged product specs. `dependencies` makes Playwright
    // run canonical-setup-<role> to completion first, so the storageState
    // file this project's `use.storageState` reads always exists and is
    // freshly minted for THIS run (never a stale file from a previous run).
    projects.push({
      name: `canonical-${role}`,
      dependencies: [`canonical-setup-${role}`],
      grep: new RegExp(`\\[role:${role}\\]`),
      // Without this, this project's inherited testMatch ('**/*.canonical.ts')
      // combined with the same `[role:${role}]` grep tag would ALSO pick up
      // support/auth-setup.canonical.ts's mint test — re-running it a second
      // time against THIS project's already-authenticated storageState
      // context, where /auth's own redirect-when-signed-in effect
      // (src/pages/Auth.tsx:24-29) means the #signin-email locator never
      // appears and the test times out. canonical-setup-${role}'s own
      // narrower testDir/testMatch already scopes it there exclusively.
      testIgnore: /support\/auth-setup\.canonical\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: DESKTOP_VIEWPORT,
        storageState: canonicalStorageStatePath(role),
      },
    });
  }

  return projects;
}

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
    // Port derived from PLAYWRIGHT_BASE_URL (see PREVIEW_PORT above), not
    // hardcoded, so each slice's own selected_ports is honoured.
    command: `npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
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
      // Never attempt a role-tagged spec here — those need credentials/
      // storageState this project doesn't have (see the module-level
      // "GREP-BASED ROLE TAGGING" note above).
      grepInvert: /\[role:(?:user|broker|admin)\]/,
      use: { ...devices['Desktop Chrome'], viewport: DESKTOP_VIEWPORT },
    },
    ...roleAwareProjects(),
  ],
});
