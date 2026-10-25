#!/usr/bin/env node
// scripts/e2e/specialist-suite.mjs - issue #2750 slice S0
//
// Mechanism for the opt-in, LOCAL-ONLY specialist Playwright suite (e2e/specialist/, playwright.specialist.config.ts,
// `npm run test:e2e:specialist`). The specialist suite is NOT the E2E gate and its results are never E2E evidence.
// Node stdlib only. This module is imported by the Playwright config, the runtime request guard
// (e2e/specialist/support/specialist-test.ts) and the estate guard (scripts/e2e/check-e2e-estate.mjs), so the
// host tables below are the single source of truth: no host literal is ever written under e2e/specialist/.
//
//   node scripts/e2e/specialist-suite.mjs --phase=list      --list <file> [--root <dir>] [--manifest <csv>]
//   node scripts/e2e/specialist-suite.mjs --phase=results   --results <file> --since <epoch-seconds> [--root <dir>] [--manifest <csv>]
//   node scripts/e2e/specialist-suite.mjs --phase=isolation [--root <dir>]
//
// Exit 0 = PASS; 1 = one "FAIL[SP-...] ..." line per problem on stderr; 2 = usage.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(SELF_DIR, '..', '..');
export const MANIFEST_REL = 'docs/testing/e2e-retirement-manifest.csv';
export const SPECIALIST_DIR = 'e2e/specialist';

// ---------------------------------------------------------------------------------------------
// Host tables
// ---------------------------------------------------------------------------------------------

/**
 * Non-loopback hosts a specialist run may reach: ONLY static-asset hosts the app itself hard-codes. Each entry cites its
 * source. The table can grow only by a hard-coded static-asset host (cited file:line); it can NEVER grow by a production,
 * shared or Supabase host, and DENY always wins over it.
 *  - `suffix` entries match a proper subdomain (at least one label before the suffix);
 *  - `exact` entries match that hostname only.
 */
export const ALLOWED_EXTERNAL = [
  // Leaflet tiles: url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" - apps/web/src/components/map/PropertyMap.tsx:3082-3084
  { kind: 'suffix', host: 'tile.openstreetmap.org', source: 'apps/web/src/components/map/PropertyMap.tsx:3082-3084' },
  // Google Fonts stylesheet + preconnect, loaded on every page - apps/web/index.html:46-49
  { kind: 'exact', host: 'fonts.googleapis.com', source: 'apps/web/index.html:46-49' },
  { kind: 'exact', host: 'fonts.gstatic.com', source: 'apps/web/index.html:46-49' },
];

/** Reserved test TLDs (RFC 2606/6761): a request to one can never leave the machine; they appear only in fulfil-mocks. */
export const RESERVED_TEST_TLDS = ['test', 'invalid', 'example'];

/** Production, shared and hosted-Supabase hosts. DENY wins over every allow rule. `suffix` matches the apex and any subdomain. */
export const DENY = [
  { label: 'propertysignal.in', suffix: 'propertysignal.in' },
  { label: '*.pages.dev', suffix: 'pages.dev' },
  { label: '*.onrender.com', suffix: 'onrender.com' },
  { label: '*.supabase.co', suffix: 'supabase.co' },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex (case-insensitive) matching a deny-listed host anywhere in text; used by estate rule SP4. */
export const DENY_LITERAL_RE = new RegExp(DENY.map((d) => escapeRe(d.suffix)).join('|'), 'i');

/**
 * Loopback predicate: EXACT hostname match (mirrors isLoopbackHostname in playwright.canonical.config.ts):
 * localhost, 127.x.x.x (each octet <= 255) and ::1 / [::1]. 0.0.0.0 is a bind-any address, not loopback.
 * It never does suffix or substring matching, so `localhost.evil.com` and `127.0.0.1.evil.com` are refused.
 */
export function isLoopbackHostname(hostname) {
  const h = String(hostname).toLowerCase();
  if (h === 'localhost') return true;
  if (h === '[::1]' || h === '::1') return true;
  const m = h.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return Boolean(m) && m.slice(1).every((o) => Number(o) <= 255);
}

export function denyLabelFor(hostname) {
  const h = String(hostname).toLowerCase();
  const hit = DENY.find((d) => h === d.suffix || h.endsWith(`.${d.suffix}`));
  return hit ? hit.label : null;
}

export function isAllowedExternalHost(hostname) {
  const h = String(hostname).toLowerCase();
  return ALLOWED_EXTERNAL.some((a) => (a.kind === 'exact' ? h === a.host : h.length > a.host.length + 1 && h.endsWith(`.${a.host}`)));
}

export function isReservedTestHost(hostname) {
  const h = String(hostname).toLowerCase();
  return RESERVED_TEST_TLDS.some((t) => h === t || h.endsWith(`.${t}`));
}

/**
 * Classify a browser request URL for the runtime guard: 'allow' (loopback or an allow-listed static-asset host),
 * 'ignore' (data:/blob:/about:), 'reserved' (a reserved test TLD) or 'block' (anything else, with a `label` naming why).
 *
 * 'reserved' is NOT 'ignore'. A reserved-TLD host (.test/.invalid/.example) is legitimate only as the URL of a request a
 * spec's own route FULFILS with a mock. The caller must therefore treat it per layer:
 *   - Layer 1 (route handlers) only sees a request that no earlier page route fulfilled, so 'reserved' there means the
 *     request reached the guard unmocked: abort and record it as blocked.
 *   - Layer 2 (context 'request' event) also fires for mock-fulfilled requests and cannot tell them apart, so it must
 *     NOT flag 'reserved' (it would fail every admitted fulfil-mock).
 *   - The WebSocket guard sees every socket and there are no fulfil-mocks for sockets, so 'reserved' is blocked/recorded.
 */
export function classifyRequestUrl(url) {
  const raw = String(url);
  if (/^(data|blob|about):/i.test(raw)) return { action: 'ignore', host: '', label: 'inline-scheme' };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { action: 'block', host: '', label: 'unparsable' };
  }
  if (!/^(https?|wss?):$/.test(u.protocol)) return { action: 'block', host: u.hostname, label: `scheme ${u.protocol}` };
  const host = u.hostname.toLowerCase();
  const deny = denyLabelFor(host);
  if (deny) return { action: 'block', host, label: `deny-listed ${deny}` };
  if (isLoopbackHostname(host)) return { action: 'allow', host, label: 'loopback' };
  if (isAllowedExternalHost(host)) return { action: 'allow', host, label: 'allow-listed static asset host' };
  if (isReservedTestHost(host)) return { action: 'reserved', host, label: 'reserved-test-TLD (not fulfilled by a mock)' };
  return { action: 'block', host, label: 'external' };
}

/**
 * SP4 helper: every forbidden host literal in `text` (comments are NOT stripped by the caller, which fails closed).
 * Two patterns: a deny pattern anywhere in the text, and any http(s):// literal whose host is neither loopback, nor
 * allow-listed, nor a reserved test TLD. A host containing a template placeholder (`${...}`) cannot be evaluated
 * statically and is skipped; the runtime guard covers it.
 */
export function findForbiddenHostLiterals(text) {
  const hits = [];
  const deny = text.match(new RegExp(DENY_LITERAL_RE.source, 'gi'));
  for (const d of deny ?? []) hits.push({ literal: d, reason: 'deny-listed production/shared/Supabase host' });
  for (const m of text.matchAll(/https?:\/\/([^\s/?#'"`\\<>)]+)/gi)) {
    let authority = m[1];
    authority = authority.slice(authority.lastIndexOf('@') + 1); // userinfo trick: http://localhost@evil.com
    let host;
    if (authority.startsWith('[')) host = authority.slice(0, authority.indexOf(']') + 1);
    else host = authority.split(':')[0];
    if (!host || host.includes('${')) continue;
    if (isLoopbackHostname(host) || isAllowedExternalHost(host) || isReservedTestHost(host)) continue;
    hits.push({ literal: m[0], reason: `non-loopback host "${host}"` });
  }
  return hits;
}

// ---------------------------------------------------------------------------------------------
// Target check (called at config load)
// ---------------------------------------------------------------------------------------------

function parseTarget(tag, name, raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (err) {
    throw new Error(`[${tag}] ${name} ("${raw}") is not a parseable URL (${String(err)}). Use an explicit loopback URL such as http://localhost:5380.`);
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error(`[${tag}] ${name} ("${raw}") must be an http(s) URL.`);
  return u;
}

function requireLoopback(tag, name, raw) {
  const u = parseTarget(tag, name, raw);
  const deny = denyLabelFor(u.hostname);
  if (deny) {
    throw new Error(
      `[${tag}] ${name} ("${raw}") has host "${u.hostname}", which is a production/shared/hosted target (${deny}). ` +
      'The specialist suite is LOCAL-ONLY and refuses it. Point it at a local preview server / backend.',
    );
  }
  if (!isLoopbackHostname(u.hostname)) {
    throw new Error(
      `[${tag}] ${name} ("${raw}") has host "${u.hostname}", which is not a recognised loopback address. ` +
      'The specialist suite requires a LOCAL-ONLY target: localhost, 127.0.0.0/8 or [::1] (0.0.0.0 is refused).',
    );
  }
  return u;
}

/**
 * Throws unless the environment names an explicit, loopback-only target. PLAYWRIGHT_BASE_URL and BACKEND_BASE_URL are
 * REQUIRED (no default, ever); VITE_SUPABASE_URL must be loopback when it is set.
 * @returns {{ baseUrl: string, backendUrl: string, previewPort: string }}
 */
export function assertSpecialistTarget(env = process.env, tag = 'playwright.specialist.config.ts') {
  const out = {};
  for (const [name, key] of [['PLAYWRIGHT_BASE_URL', 'baseUrl'], ['BACKEND_BASE_URL', 'backendUrl']]) {
    const raw = env[name];
    if (!raw) {
      throw new Error(`[${tag}] ${name} is not set. The specialist suite never defaults to any target - set ${name} to a loopback URL (e.g. http://localhost:5380). Run it with: npm run test:e2e:specialist.`);
    }
    out[key] = requireLoopback(tag, name, raw);
  }
  if (env.VITE_SUPABASE_URL) requireLoopback(tag, 'VITE_SUPABASE_URL', env.VITE_SUPABASE_URL);
  return { baseUrl: out.baseUrl.origin, backendUrl: out.backendUrl.origin, previewPort: out.baseUrl.port };
}

// ---------------------------------------------------------------------------------------------
// Manifest + collection helpers
// ---------------------------------------------------------------------------------------------

// A deliberate small copy of parseCsv from check-e2e-estate.mjs: that module imports THIS one (host tables), so importing
// back would create a cycle.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** The set of e2e/specialist/*.specialist.ts files the manifest admits (decision AND status RETAIN_SPECIALIST). */
export function retainSpecialistFiles(manifestText) {
  const table = parseCsv(manifestText).filter((r) => !(r.length === 1 && r[0] === ''));
  const head = table[0] ?? [];
  const ix = (n) => head.indexOf(n);
  const set = new Set();
  for (const r of table.slice(1)) {
    const file = r[ix('file')] ?? '';
    if (file.startsWith(`${SPECIALIST_DIR}/`) && r[ix('decision')] === 'RETAIN_SPECIALIST' && r[ix('status')] === 'RETAIN_SPECIALIST') set.add(file);
  }
  return set;
}

const normSpecialistPath = (p) => {
  const f = p.split(path.sep).join('/').replace(/^\.\//, '');
  return f.startsWith(`${SPECIALIST_DIR}/`) ? f : `${SPECIALIST_DIR}/${f}`;
};

/** Files collected by `playwright test --list`, from the JSON reporter output or the list reporter's stdout. */
export function collectedFilesFromList(content) {
  const files = new Set();
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    const walk = (suite) => {
      if (suite.file && (suite.specs?.length ?? 0) > 0) files.add(normSpecialistPath(suite.file));
      for (const s of suite.suites ?? []) walk(s);
    };
    for (const s of JSON.parse(trimmed).suites ?? []) walk(s);
    return files;
  }
  for (const m of content.matchAll(/([A-Za-z0-9_./@+-]+\.specialist\.ts):\d+:\d+/g)) files.add(normSpecialistPath(m[1]));
  return files;
}

/** @returns {string[]} problems; empty = PASS. Collected set must equal the manifest set, and must not be empty. */
export function checkListPhase({ listContent, manifestText }) {
  const errors = [];
  let collected;
  try {
    collected = collectedFilesFromList(listContent);
  } catch (err) {
    return [`FAIL[SP-LIST] the --list output could not be parsed (${String(err)})`];
  }
  const want = retainSpecialistFiles(manifestText);
  if (collected.size === 0) errors.push('FAIL[SP-LIST] playwright --list collected 0 specialist files; an empty run proves nothing');
  for (const f of [...collected].sort()) if (!want.has(f)) errors.push(`FAIL[SP-LIST] ${f} was collected but has no RETAIN_SPECIALIST row in ${MANIFEST_REL}`);
  for (const f of [...want].sort()) if (!collected.has(f)) errors.push(`FAIL[SP-LIST] ${f} has a RETAIN_SPECIALIST row but was not collected by playwright.specialist.config.ts`);
  const totals = [...listContent.matchAll(/Total:\s*\d+ tests? in (\d+) files?/g)];
  const total = totals[totals.length - 1];
  if (total && Number(total[1]) !== collected.size) errors.push(`FAIL[SP-LIST] --list reports ${total[1]} files but ${collected.size} specialist files were parsed`);
  return errors;
}

/**
 * Evaluate a Playwright JSON results document. Fails closed on skipped / flaky / unexpected / interrupted > 0, a global
 * error, no executed test, a stale file, or a manifest file with 0 passed tests.
 * @returns {{ errors: string[], counts: object }}
 */
export function checkResultsDoc({ doc, manifestFiles, sinceEpochSeconds, mtimeMs }) {
  const errors = [];
  const counts = { passed: 0, skipped: 0, flaky: 0, unexpected: 0, interrupted: 0, expectedFailures: 0, annotated: 0 };
  const passedByFile = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const file = normSpecialistPath(spec.file ?? suite.file ?? '');
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        if (t.expectedStatus !== undefined && t.expectedStatus !== 'passed') counts.expectedFailures += 1;
        if ([...(t.annotations ?? []), ...(spec.annotations ?? [])].some((a) => ['fail', 'fixme', 'skip'].includes(a?.type))) counts.annotated += 1;
        if (results.some((r) => r.status === 'interrupted')) counts.interrupted += 1;
        if (t.status === 'expected') { counts.passed += 1; passedByFile.set(file, (passedByFile.get(file) ?? 0) + 1); }
        else if (t.status === 'skipped') counts.skipped += 1;
        else if (t.status === 'flaky') counts.flaky += 1;
        else if (t.status === 'unexpected') counts.unexpected += 1;
        else counts.unexpected += 1; // an unknown status is never a pass
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of doc.suites ?? []) walk(s);

  if (typeof sinceEpochSeconds === 'number') {
    if (mtimeMs !== undefined && mtimeMs / 1000 < sinceEpochSeconds) errors.push(`FAIL[SP-RESULTS] results file is stale (written before this run started at epoch ${sinceEpochSeconds})`);
    const start = doc.stats?.startTime ? Date.parse(doc.stats.startTime) / 1000 : NaN;
    if (Number.isFinite(start) && start < sinceEpochSeconds - 1) errors.push('FAIL[SP-RESULTS] results stats.startTime precedes this run (stale results)');
  }
  for (const k of ['skipped', 'flaky', 'unexpected', 'interrupted']) {
    if (counts[k] > 0) errors.push(`FAIL[SP-RESULTS] ${counts[k]} ${k} test(s); the specialist suite fails closed`);
  }
  if (counts.expectedFailures > 0) errors.push(`FAIL[SP-RESULTS] ${counts.expectedFailures} test(s) with expectedStatus other than passed (an expected failure is not a pass)`);
  if (counts.annotated > 0) errors.push(`FAIL[SP-RESULTS] ${counts.annotated} test(s) annotated fail/fixme/skip`);
  if ((doc.errors?.length ?? 0) > 0) errors.push(`FAIL[SP-RESULTS] ${doc.errors.length} global error(s) in results.json`);
  if (counts.passed === 0) errors.push('FAIL[SP-RESULTS] 0 passed tests; an empty run proves nothing');
  for (const f of [...manifestFiles].sort()) {
    if (!(passedByFile.get(f) > 0)) errors.push(`FAIL[SP-RESULTS] ${f} (a manifest RETAIN_SPECIALIST file) has 0 passed tests`);
  }
  for (const f of [...passedByFile.keys()].sort()) {
    if (!manifestFiles.has(f)) errors.push(`FAIL[SP-RESULTS] ${f} ran but has no RETAIN_SPECIALIST row in ${MANIFEST_REL}`);
  }
  return { errors, counts };
}

// ---------------------------------------------------------------------------------------------
// Isolation (IR1): the specialist specs are collected by NO other config
// ---------------------------------------------------------------------------------------------

/**
 * String-aware comment stripper for TS/JS source. The estate guard's older stripComments is NOT string-aware: a glob such
 * as '**\/api/**' contains "/*" and would swallow everything up to the next "*\/" (including real code). Specialist specs
 * are full of such globs, so SP5/SP8/SP9 use this tokenizer instead. Line and block comments are removed (newlines kept);
 * '...', "..." and `...` literals are copied verbatim. Regex literals are not modelled (a regex containing a quote could
 * confuse it); that is acceptable for the banned-construct scans it feeds.
 */
export function stripCommentsStrict(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      out += c;
      i += 1;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { out += src[i]; i += 1; }
        if (i < n) { out += src[i]; i += 1; }
      }
      if (i < n) { out += c; i += 1; }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** (a) static: playwright.config.ts must carry testIgnore with the specialist glob. */
export function legacyConfigIgnoresSpecialist(configText) {
  return /testIgnore\s*:\s*\[[^\]]*['"]\*\*\/specialist\/\*\*['"]/.test(stripCommentsStrict(configText));
}

/** Every file path in a `--reporter=json` --list document that sits under a specialist directory. */
export function specialistPathsInListJson(jsonText) {
  const hits = new Set();
  const isSpecialist = (f) => /(^|\/)specialist\//.test(f.split(path.sep).join('/')) || /\.specialist\.ts$/.test(f);
  const walk = (suite) => {
    if (suite.file && isSpecialist(suite.file)) hits.add(suite.file);
    for (const spec of suite.specs ?? []) if (spec.file && isSpecialist(spec.file)) hits.add(spec.file);
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of JSON.parse(jsonText).suites ?? []) walk(s);
  return [...hits].sort();
}

// Dummy LOOPBACK targets for the isolation --list calls: the canonical config throws at load without them, and a legacy
// spec throws at load without BACKEND_BASE_URL (a --list with load errors exits 1, which cannot prove isolation).
const DUMMY_LISTING_ENV = {
  PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:5399',
  BACKEND_BASE_URL: 'http://127.0.0.1:8399',
  VITE_SUPABASE_URL: 'http://127.0.0.1:9399',
};

function defaultRunList(root, config, extraArgs, extraEnv) {
  // Explicit minimal env: nothing ambient (no PLAYWRIGHT_*, no CI, no PLAYWRIGHT_JSON_OUTPUT_NAME) steers the listing.
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...extraEnv };
  const r = spawnSync('npx', ['--no-install', 'playwright', 'test', '--list', `--config=${config}`, '--reporter=json', ...extraArgs], {
    cwd: root, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** @returns {string[]} problems; empty = PASS. `runList` is injectable for tests. */
export function checkIsolation({ root = DEFAULT_ROOT, runList = defaultRunList } = {}) {
  const errors = [];
  const cfgPath = path.join(root, 'playwright.config.ts');
  // An ABSENT legacy config means "no legacy collector" (PR-7 may delete it, docs/testing/e2e-pr7-specialist-amendment.md):
  // skip the legacy arm and the static testIgnore check, with a note. A PRESENT config is still checked and fails closed.
  const legacyPresent = fs.existsSync(cfgPath);
  if (!legacyPresent) {
    process.stdout.write('NOTE[SP-ISO] playwright.config.ts is absent: no legacy collector exists, so the legacy --list arm and the testIgnore check are skipped (the canonical arm is still mandatory)\n');
  } else if (!legacyConfigIgnoresSpecialist(fs.readFileSync(cfgPath, 'utf8'))) {
    errors.push("FAIL[SP-ISO] playwright.config.ts has no testIgnore containing '**/specialist/**' (the legacy config must never collect e2e/specialist)");
  }
  for (const [label, config, extraArgs, extraEnv] of [
    ['legacy (--project=full)', 'playwright.config.ts', ['--project=full'], DUMMY_LISTING_ENV],
    ['canonical', 'playwright.canonical.config.ts', [], DUMMY_LISTING_ENV],
  ]) {
    if (config === 'playwright.config.ts' && !legacyPresent) continue;
    const r = runList(root, config, extraArgs, extraEnv);
    const isEmptyLegacyList = () => {
      if (config !== 'playwright.config.ts' || !r.stdout.trim().startsWith('{')) return false;
      try {
        const doc = JSON.parse(r.stdout);
        return (
          Array.isArray(doc.suites) &&
          doc.suites.length === 0 &&
          Array.isArray(doc.errors) &&
          doc.errors.length === 1 &&
          /No tests found/.test(String(doc.errors[0]?.message ?? ''))
        );
      } catch {
        return false;
      }
    };
    if (r.status !== 0 && !isEmptyLegacyList()) {
      errors.push(`FAIL[SP-ISO] the ${label} --list exited ${r.status}; isolation cannot be proven (${String(r.stderr).split('\n').find((l) => l.trim()) ?? 'no stderr'})`);
      continue;
    }
    try {
      const hits = specialistPathsInListJson(r.stdout);
      for (const h of hits) errors.push(`FAIL[SP-ISO] the ${label} config collects ${h} (e2e/specialist must be collected only by playwright.specialist.config.ts)`);
    } catch (err) {
      errors.push(`FAIL[SP-ISO] the ${label} --list output was not JSON (${String(err)})`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const m = argv[i].match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) return null;
    const known = ['phase', 'list', 'results', 'since', 'root', 'manifest'];
    if (!known.includes(m[1])) return null;
    const v = m[2] ?? argv[++i];
    if (v === undefined) return null;
    opts[m[1]] = v;
  }
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  const usage = () => {
    process.stderr.write('usage: specialist-suite.mjs --phase=list|results|isolation [--list f] [--results f --since epoch] [--root dir] [--manifest csv]\n');
    return 2;
  };
  if (!o || !['list', 'results', 'isolation'].includes(o.phase)) return usage();
  const root = o.root ? path.resolve(o.root) : DEFAULT_ROOT;
  const manifestPath = o.manifest ? path.resolve(o.manifest) : path.join(root, MANIFEST_REL);
  const finish = (name, errors, extra = '') => {
    if (errors.length > 0) {
      for (const e of errors) process.stderr.write(`${e}\n`);
      process.stderr.write(`SPECIALIST ${name}: FAIL (${errors.length} problem${errors.length === 1 ? '' : 's'})\n`);
      return 1;
    }
    process.stdout.write(`SPECIALIST ${name}: PASS${extra}\n`);
    return 0;
  };
  const readOrFail = (p, what) => {
    try { return fs.readFileSync(p, 'utf8'); } catch (err) { return { error: `FAIL[SP-${what}] cannot read ${p} (${err.code ?? String(err)})` }; }
  };

  if (o.phase === 'isolation') return finish('isolation', checkIsolation({ root }));

  const manifest = readOrFail(manifestPath, 'MANIFEST');
  if (typeof manifest !== 'string') return finish(o.phase, [manifest.error]);

  if (o.phase === 'list') {
    if (!o.list) return usage();
    const listContent = readOrFail(path.resolve(o.list), 'LIST');
    if (typeof listContent !== 'string') return finish('list', [listContent.error]);
    return finish('list', checkListPhase({ listContent, manifestText: manifest }), ` (${retainSpecialistFiles(manifest).size} files)`);
  }

  if (!o.results || o.since === undefined || !/^\d+(\.\d+)?$/.test(o.since)) return usage();
  const resultsPath = path.resolve(o.results);
  let stat;
  try { stat = fs.statSync(resultsPath); } catch { return finish('results', [`FAIL[SP-RESULTS] results file missing: ${o.results}`]); }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(resultsPath, 'utf8')); } catch (err) { return finish('results', [`FAIL[SP-RESULTS] results file is unparsable (${String(err)})`]); }
  const { errors, counts } = checkResultsDoc({ doc, manifestFiles: retainSpecialistFiles(manifest), sinceEpochSeconds: Number(o.since), mtimeMs: stat.mtimeMs });
  return finish('results', errors, ` (passed=${counts.passed} skipped=${counts.skipped} flaky=${counts.flaky} unexpected=${counts.unexpected} interrupted=${counts.interrupted})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
