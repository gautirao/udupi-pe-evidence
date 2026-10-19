// scripts/e2e/legacy-seed-mvn-env.mjs - issue #2864
//
// Minimal, fail-closed child environment for the ONE Maven launcher the kept legacy spec
// e2e/journey/area-trends-2581.spec.ts starts (its two beforeAll seed steps run
// AreaIntelligenceSnapshotRollupJobE2ESeedIT). Before #2864 the spec passed `env: process.env`, so every
// parent variable reached mvn and the forked surefire JVM. Four independent routes could then point the
// seed IT's datasource at a hosted/shared DB while SUPABASE_DB_HOST stayed loopback: a multi-host
// SUPABASE_DB_PORT, SPRING_DATASOURCE_HIKARI_JDBC_URL, JVM option vars or ~/.mavenrc, and
// SPRING_APPLICATION_JSON / SPRING_CONFIG_*.
// This module is an ALLOW-LIST: anything not named below is dropped, so a future variable cannot add a route.
// Node stdlib only, plus two predicates reused (not modified) from specialist-suite.mjs.
//
// API
//   buildLegacySeedMvnEnv(parentEnv) -> frozen plain object; throws Error on any refusal.
//   runLegacySeedMvn({ parentEnv, exec, cwd }) -> validates via buildLegacySeedMvnEnv FIRST, then calls
//     exec('mvn', SEED_MVN_ARGS, { cwd, env: <minimal>, stdio: 'inherit', timeout: 180000 }).
//     `exec` is REQUIRED (there is no default spawner), so a test can never start a real process by accident.
//   The parameter is named `parentEnv` (not `env`) so the spec's call site never contains the text
//   `env: process.env`; the wiring check W1 in the test file asserts that text is absent from the spec.
//
// Rule-id table. Every refusal message has the form
//   "legacy-seed-mvn-env: refused <VARIABLE> [<RULE>]: <reason>"
// and never contains a variable's VALUE (so SUPABASE_DB_PASSWORD cannot leak through an error).
//   R0  Printable-ASCII guard: a value with any char outside 0x21-0x7E is refused. It has exactly FOUR call
//       sites, one each for SUPABASE_DB_HOST, _PORT, _NAME and _USER, and it runs on the RAW value before any
//       regex. R6 has its OWN separate call site (R6a), so a mutation can remove one without the other.
//   R1  SUPABASE_DB_HOST: required. Allowed charset is [A-Za-z0-9.[]:]. Must be exactly localhost, 127.a.b.c
//       (octets 0-255) or [::1], via isLoopbackHostname, with denyLabelFor === null. Bare ::1 is refused,
//       because the IT concatenates host:port and an unbracketed IPv6 is malformed. No trim-then-accept.
//   R2  SUPABASE_DB_PORT: required; /^[0-9]{1,5}$/ (no m/s/y flag) on the untrimmed value AND 1..65535.
//   R3  SUPABASE_DB_NAME (if set): /^[A-Za-z0-9_]{1,63}$/. SUPABASE_DB_USER (if set): /^[A-Za-z0-9_.-]{1,63}$/.
//   R4  Security-relevant ambient variable: a LOUD refusal, never a silent drop. The NAME is matched
//       case-insensitively.
//       (i)   every /^SPRING_DATASOURCE_/i. It counts as present even when the value is ''.
//       (ii)  /^SPRING_(FLYWAY|LIQUIBASE|R2DBC|SQL_INIT)_.*(URL|URI|JDBC)/i.
//       (iii) SPRING_APPLICATION_JSON and every /^SPRING_CONFIG_/i.
//       (iv)  DATABASE_URL and any name containing JDBC.
//       (v)   PGHOST, PGHOSTADDR, PGPORT, PGSERVICE, PGSERVICEFILE.
//       (vi)  any /^SUPABASE_DB_/i name other than the five exact allow-listed names. This catches
//             SUPABASE_DB_URL, and also a lower-case supabase_db_host.
//       Classes (ii)-(vi) count only when the value is non-empty. R4 runs BEFORE R6, so SUPABASE_DB_URL -> R4.
//   R5  Not a check, a policy: every refusal throws before exec is called (no process, no connection). The
//       thrown Error carries only a message: no cause, no extra properties, no value.
//   R6  SUPABASE URL-style vars: /^(VITE_)?SUPABASE_[A-Z0-9_]*URL$/i, when present and non-empty.
//       R6a is R6's OWN raw printable-ASCII check, and its message still says R6. It is load-bearing, because
//       WHATWG new URL() silently strips tab/LF/CR anywhere and leading/trailing C0+space.
//       Then new URL(raw) must parse, the protocol must be http: or https:, and there must be no
//       username/password. The hostname, with brackets stripped, must be loopback with denyLabelFor === null.
//       A passing value is still DROPPED, never forwarded.
//
// Forwarded:
// - PATH, HOME, JAVA_HOME, TMPDIR, LANG, LC_ALL, USER, LOGNAME, when present and non-empty; trusted as-is.
// - The validated SUPABASE_DB_HOST/_PORT (required), and _NAME/_USER when set.
// - SUPABASE_DB_PASSWORD when set. It is opaque: never validated, never logged, never in an error.
// - Always MAVEN_SKIP_RC=1, which stops the mvn launcher from sourcing ~/.mavenrc and /etc/mavenrc.
// Everything else is DROPPED. That includes MAVEN_OPTS, MAVEN_ARGS, M2_HOME, MAVEN_HOME, JAVA_TOOL_OPTIONS,
// JDK_JAVA_OPTIONS, _JAVA_OPTIONS and benign SPRING_* toggles. It also includes SUPABASE_PROJECT_REF and
// AI_API_KEY. The input object is never mutated.
//
// Documented consequences and accepted limits (owner decision OD1, approved plan for #2864):
//  - The disabled legacy wrapper scripts/run-e2e-local.sh exports SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL
//    and _SSLMODE (:295-296). If it is re-enabled unchanged, this seed step REFUSES under R4(i). That is intended.
//    Re-enablement must stop exporting them, because the IT pins ssl/sslmode itself (IT:57-58).
//  - SUPABASE_PROJECT_REF and AI_API_KEY are never forwarded. By static reading, the @DataJpaTest slice of
//    the seed IT does not resolve them. application.yml:52 is read only by the OAuth2 resource-server
//    auto-config, and application.yml:57 is read only by AiClient's @Value. Neither is in the slice, which
//    @Imports only AreaIntelligenceSnapshotService and AreaIntelligenceSnapshotRollupJob, whose deps are
//    JPA-only. Not proven by a run: if either is ever needed, the seed fails CLOSED, and that is accepted.
//  - A helper throw inside the spec's beforeAll fails that describe block closed. That is intended.
//  - stdio:'inherit' means mvn output can echo the datasource URL. This is pre-existing, not a new route.
//    PATH and JAVA_HOME are trusted. HOME is forwarded, so ~/.m2/settings.xml remains an unfiltered,
//    file-based route; that is out of scope.
//  - The seed IT still concatenates the raw URL. A loopback check inside the IT is follow-up #2866.
//  - Whether this minimal env is enough for mvn/surefire to start is NOT_PROVEN without running it. A
//    failure there is closed, not a bypass.

import { denyLabelFor, isLoopbackHostname } from './specialist-suite.mjs';

export const SEED_MVN_ARGS = Object.freeze(['-f', 'apps/api/pom.xml', 'test', '-Dtest=AreaIntelligenceSnapshotRollupJobE2ESeedIT']);
export const SEED_MVN_TIMEOUT_MS = 180_000;

export const TOOLCHAIN_VARS = Object.freeze(['PATH', 'HOME', 'JAVA_HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'LOGNAME']);
export const DB_VARS = Object.freeze([
  'SUPABASE_DB_HOST',
  'SUPABASE_DB_PORT',
  'SUPABASE_DB_NAME',
  'SUPABASE_DB_USER',
  'SUPABASE_DB_PASSWORD',
]);

// Regexes: anchored, NO m/s/y flag (ECMAScript: without m, `$` matches only at the absolute end of input).
const PORT_RE = /^[0-9]{1,5}$/;
const NAME_RE = /^[A-Za-z0-9_]{1,63}$/;
const USER_RE = /^[A-Za-z0-9_.-]{1,63}$/;
const HOST_CHARSET_RE = /^[A-Za-z0-9.[\]:]+$/;
const NON_PRINTABLE_RE = /[^\x21-\x7e]/;

const R4_PRESENT_EVEN_IF_EMPTY = [{ re: /^SPRING_DATASOURCE_/i, cls: 'i' }];
const R4_PRESENT_IF_NON_EMPTY = [
  { re: /^SPRING_(FLYWAY|LIQUIBASE|R2DBC|SQL_INIT)_.*(URL|URI|JDBC)/i, cls: 'ii' },
  { re: /^SPRING_APPLICATION_JSON$/i, cls: 'iii' },
  { re: /^SPRING_CONFIG_/i, cls: 'iii' },
  { re: /^DATABASE_URL$/i, cls: 'iv' },
  { re: /JDBC/i, cls: 'iv' },
  { re: /^(PGHOST|PGHOSTADDR|PGPORT|PGSERVICE|PGSERVICEFILE)$/i, cls: 'v' },
];
const SUPABASE_DB_PREFIX_RE = /^SUPABASE_DB_/i;
const R6_NAME_RE = /^(VITE_)?SUPABASE_[A-Z0-9_]*URL$/i;

function refuse(variable, rule, reason) {
  // Message only: no value, no cause, no extra properties (R5).
  throw new Error(`legacy-seed-mvn-env: refused ${variable} [${rule}]: ${reason}`);
}

/** Shared pure predicate. R0 and R6a are SEPARATE call sites of it. */
function hasNonPrintableAscii(value) {
  return NON_PRINTABLE_RE.test(value);
}

function isNonEmpty(value) {
  return value !== undefined && value !== null && value !== '';
}

function checkAmbient(parentEnv) {
  for (const name of Object.keys(parentEnv)) {
    const value = parentEnv[name];
    for (const { re, cls } of R4_PRESENT_EVEN_IF_EMPTY) {
      if (re.test(name)) refuse(name, 'R4', `security-relevant ambient variable (class ${cls}) must not be set, even empty`);
    }
    if (!isNonEmpty(value)) continue;
    for (const { re, cls } of R4_PRESENT_IF_NON_EMPTY) {
      if (re.test(name)) refuse(name, 'R4', `security-relevant ambient variable (class ${cls}) must not be set`);
    }
    if (SUPABASE_DB_PREFIX_RE.test(name) && !DB_VARS.includes(name)) {
      refuse(name, 'R4', 'security-relevant ambient variable (class vi): not one of the five allow-listed SUPABASE_DB_* names');
    }
  }
}

function checkSupabaseUrls(parentEnv) {
  for (const name of Object.keys(parentEnv)) {
    if (!R6_NAME_RE.test(name)) continue;
    const raw = parentEnv[name];
    if (!isNonEmpty(raw)) continue;
    if (hasNonPrintableAscii(String(raw))) refuse(name, 'R6', 'contains a character outside printable ASCII 0x21-0x7E'); // R6a-call-site
    let url;
    try {
      url = new URL(String(raw));
    } catch {
      refuse(name, 'R6', 'is not a parsable URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') refuse(name, 'R6', 'protocol must be http: or https:');
    if (url.username !== '' || url.password !== '') refuse(name, 'R6', 'must not carry userinfo');
    const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
    if (!isLoopbackHostname(host) || denyLabelFor(host) !== null) refuse(name, 'R6', 'host is not loopback; a hosted Supabase endpoint means this is not the local fixture');
  }
}

/**
 * Build the minimal, validated child env for the seed mvn launcher. Throws on any refusal (see the rule table above).
 * @param {Record<string, string | undefined>} parentEnv
 * @returns {Readonly<Record<string, string>>}
 */
export function buildLegacySeedMvnEnv(parentEnv) {
  if (parentEnv === null || typeof parentEnv !== 'object') {
    throw new TypeError('legacy-seed-mvn-env: parentEnv must be an object');
  }

  checkAmbient(parentEnv); // R4 (runs before R6)
  checkSupabaseUrls(parentEnv); // R6

  // R1 HOST
  const host = parentEnv.SUPABASE_DB_HOST;
  if (typeof host !== 'string' || host === '') refuse('SUPABASE_DB_HOST', 'R1', 'is required');
  if (hasNonPrintableAscii(host)) refuse('SUPABASE_DB_HOST', 'R0', 'contains a character outside printable ASCII 0x21-0x7E'); // R0-call-site HOST
  if (!HOST_CHARSET_RE.test(host)) refuse('SUPABASE_DB_HOST', 'R1', 'contains a character outside [A-Za-z0-9.[]:]');
  if (host === '::1') refuse('SUPABASE_DB_HOST', 'R1', 'bare ::1 is refused; use [::1]');
  if (!isLoopbackHostname(host) || denyLabelFor(host) !== null) refuse('SUPABASE_DB_HOST', 'R1', 'must be localhost, 127.a.b.c or [::1]');

  // R2 PORT
  const port = parentEnv.SUPABASE_DB_PORT;
  if (typeof port !== 'string' || port === '') refuse('SUPABASE_DB_PORT', 'R2', 'is required');
  if (hasNonPrintableAscii(port)) refuse('SUPABASE_DB_PORT', 'R0', 'contains a character outside printable ASCII 0x21-0x7E'); // R0-call-site PORT
  if (!PORT_RE.test(port)) refuse('SUPABASE_DB_PORT', 'R2', 'must be 1-5 decimal digits');
  const portNumber = Number(port);
  if (!(portNumber >= 1 && portNumber <= 65535)) refuse('SUPABASE_DB_PORT', 'R2', 'must be in 1..65535');

  // R3 NAME / USER (optional; the IT applies its own defaults when unset)
  const name = parentEnv.SUPABASE_DB_NAME;
  if (isNonEmpty(name)) {
    if (hasNonPrintableAscii(String(name))) refuse('SUPABASE_DB_NAME', 'R0', 'contains a character outside printable ASCII 0x21-0x7E'); // R0-call-site NAME
    if (!NAME_RE.test(String(name))) refuse('SUPABASE_DB_NAME', 'R3', 'must match [A-Za-z0-9_]{1,63}');
  }
  const user = parentEnv.SUPABASE_DB_USER;
  if (isNonEmpty(user)) {
    if (hasNonPrintableAscii(String(user))) refuse('SUPABASE_DB_USER', 'R0', 'contains a character outside printable ASCII 0x21-0x7E'); // R0-call-site USER
    if (!USER_RE.test(String(user))) refuse('SUPABASE_DB_USER', 'R3', 'must match [A-Za-z0-9_.-]{1,63}');
  }

  const out = {};
  for (const key of TOOLCHAIN_VARS) {
    if (isNonEmpty(parentEnv[key])) out[key] = String(parentEnv[key]);
  }
  out.SUPABASE_DB_HOST = host;
  out.SUPABASE_DB_PORT = port;
  if (isNonEmpty(name)) out.SUPABASE_DB_NAME = String(name);
  if (isNonEmpty(user)) out.SUPABASE_DB_USER = String(user);
  if (isNonEmpty(parentEnv.SUPABASE_DB_PASSWORD)) out.SUPABASE_DB_PASSWORD = String(parentEnv.SUPABASE_DB_PASSWORD);
  out.MAVEN_SKIP_RC = '1';
  return Object.freeze(out);
}

/**
 * Validate FIRST, then start the seed mvn launcher through the injected `exec` (e.g. child_process.execFileSync).
 * @param {{ parentEnv: Record<string, string | undefined>, exec: Function, cwd: string }} options
 */
export function runLegacySeedMvn({ parentEnv, exec, cwd } = {}) {
  if (typeof exec !== 'function') throw new TypeError('legacy-seed-mvn-env: exec must be a function (no default spawner)');
  if (typeof cwd !== 'string' || cwd === '') throw new TypeError('legacy-seed-mvn-env: cwd must be a non-empty string');
  const childEnv = buildLegacySeedMvnEnv(parentEnv);
  return exec('mvn', [...SEED_MVN_ARGS], { cwd, env: childEnv, stdio: 'inherit', timeout: SEED_MVN_TIMEOUT_MS });
}
