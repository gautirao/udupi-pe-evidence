#!/usr/bin/env node
// scripts/e2e/check-deployed-reachability.mjs - issue #2750 (PR-2)
//
// Static guard for the post-deploy REACHABILITY check (secondary — not the E2E gate). It reads the files as TEXT and
// never imports or executes the Playwright config (importing it would run its load-time throw, N-F).
//
//   node scripts/e2e/check-deployed-reachability.mjs [--root <dir>]
//
// Exit 0 = consistent; 1 = one "FAIL[FC-xx] ..." line per violation on stderr; 2 = usage.
//
//  FC-29 config shape      explicit URL inputs that throw when unset/non-http(s); no fallback literal, global hooks,
//                          web server, saved sign-in state, env-file read; retries 0, workers 1, forbidOnly, SW blocked.
//  FC-30 write-free source e2e/deployed/** can only GET: no APIRequest/fetch-with-method outside the two marked probe
//                          lines, no mocking, no interaction; the context.route guard and the afterEach record check exist.
//  FC-31 credential-free   no password/email/storage-state/Supabase/service-role/anon-key/Authorization/secrets in the
//                          deployed files or the workflow.
//  FC-32 directory         e2e/deployed/ holds exactly post-deploy.reachability.ts, importing only @playwright/test + builtins.
//  FC-33 workflow shape    read-only permissions, no secrets, exactly the deployed config, labelled, vars.-with-https-fallback
//                          URLs (frontend default pinned), persist-credentials false, no ${{ }} in run:, every wait loop ends exit 1.
//  FC-35 runtime guard     (static half) the G0 self-test exists and asserts the guard record count equals the probe count.
//  FC-34 legacy smoke gone playwright.config.ts has no smoke / udupi-canonical-smoke project; ci.yml has no playwright-pr job
//                          or --project=smoke; package.json has no test:e2e:smoke; pre-push-classify.sh has no smoke allowlist;
//                          run-e2e-local.sh refuses (exit 2) without --project; the PR-2 specs/support files are absent.
//  FC-37 allowlisted abort exactly ONE aborted-but-non-failing request: a POST whose parsed origin equals the frontend's and
//                          whose parsed pathname starts with '/cdn-cgi/challenge-platform/'; pinned verbatim, abort unconditional.
//  FC-36 profile retired   restore-test-fixture.sh rejects any non-empty E2E_FIXTURE_PROFILE (exit 1) before any docker call.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(SELF_DIR, '..', '..');

export const CONFIG_REL = 'playwright.deployed.config.ts';
export const DEPLOYED_DIR_REL = 'e2e/deployed';
export const SPEC_NAME = 'post-deploy.reachability.ts';
export const SPEC_REL = `${DEPLOYED_DIR_REL}/${SPEC_NAME}`;
export const WORKFLOW_REL = '.github/workflows/e2e-post-deploy.yml';
export const SECONDARY_LABEL = 'secondary — not the E2E gate';
export const FRONTEND_DEFAULT = 'https://propertysignal.in';
export const TEST_COMMAND = 'npx playwright test --config=playwright.deployed.config.ts';

const NODE_BUILTINS = new Set(['fs', 'path', 'url', 'os', 'util', 'assert', 'crypto', 'events', 'stream', 'http', 'https', 'net', 'child_process']);

function read(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/**
 * Removes // and block comments from JS/TS while keeping line structure (comment text becomes spaces, newlines stay), so
 * code line N lines up with raw line N. String and template literals are skipped. A `//` starts a comment only at the
 * start of a line or after whitespace, which keeps regex literals such as /^https?:\/\// intact.
 */
export function stripJsComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    const prev = out.length === 0 ? '\n' : out[out.length - 1];
    if (c === '/' && n === '/' && /\s/.test(prev)) {
      while (i < src.length && src[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && n === '*' && /[\s(,;{}]/.test(prev)) {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i += 1; }
      out += '  ';
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Removes YAML comments (# at line start or after whitespace) while keeping line structure. */
export function stripYamlComments(src) {
  return src.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
}

const lineNo = (text, index) => text.slice(0, index).split('\n').length;

/** Text from the '(' at `open` to its matching ')' (strings skipped); '' if unbalanced. Input must be comment-stripped. */
function balancedParens(code, open) {
  if (open < 0 || code[open] !== '(') return '';
  let depth = 0;
  let quote = null;
  for (let i = open; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(') depth += 1;
    else if (c === ')') { depth -= 1; if (depth === 0) return code.slice(open, i + 1); }
  }
  return '';
}

// ---------------------------------------------------------------- FC-29
function checkConfig(root) {
  const errors = [];
  const raw = read(root, CONFIG_REL);
  if (raw === null) return [`FAIL[FC-29] ${CONFIG_REL} is missing`];
  const code = stripJsComments(raw);
  const need = (re, msg) => { if (!re.test(code)) errors.push(`FAIL[FC-29] ${CONFIG_REL}: ${msg}`); };
  const forbid = (re, msg) => { const m = code.match(re); if (m) errors.push(`FAIL[FC-29] ${CONFIG_REL}:${lineNo(code, m.index)}: ${msg}`); };

  if (!raw.toLowerCase().includes(SECONDARY_LABEL.toLowerCase())) errors.push(`FAIL[FC-29] ${CONFIG_REL}: header comment must say "${SECONDARY_LABEL}"`);
  if (!/npm run test:e2e:gate/.test(raw)) errors.push(`FAIL[FC-29] ${CONFIG_REL}: header comment must name \`npm run test:e2e:gate\` as the gate`);

  need(/\bPLAYWRIGHT_BASE_URL\b/, 'does not read PLAYWRIGHT_BASE_URL');
  need(/\bBACKEND_BASE_URL\b/, 'does not read BACKEND_BASE_URL');
  need(/throw new Error\(/, 'must throw at load when a URL is unset (no `throw new Error(` found)');
  need(/https\?:/, 'must reject a URL that is not http(s):// (no https?: test found)');
  for (const m of code.matchAll(/^.*\bprocess\.env\b.*$/gm)) {
    if (/(\?\?|\|\|)/.test(m[0])) errors.push(`FAIL[FC-29] ${CONFIG_REL}:${lineNo(code, m.index)}: an env read has a fallback (?? or ||); the URLs must have no default`);
  }
  forbid(/pages\.dev|onrender\.com|propertysignal\.in|supabase\.co/i, 'contains a deployed-host literal; the URLs must be explicit inputs');
  forbid(/\b(globalSetup|globalTeardown|webServer|storageState)\b/, 'declares a global hook / web server / saved sign-in state; the deployed config is auth-free and stateless');
  forbid(/(?:^|[\s'"`/])\.env(?:[.'"`\s]|$)|dotenv|readFileSync|readFile\b|from\s+['"](?:node:)?fs['"]/, 'reads a file / env file; the config must take only explicit environment inputs');
  need(/\bretries:\s*0\b/, 'retries must be 0');
  need(/\bworkers:\s*1\b/, 'workers must be 1');
  need(/\bforbidOnly:\s*true\b/, 'forbidOnly must be true');
  need(/\bserviceWorkers:\s*'block'/, "serviceWorkers must be 'block'");
  need(/\btestDir:\s*'\.\/e2e\/deployed'/, "testDir must be './e2e/deployed'");
  need(/\btestMatch:\s*'\*\*\/\*\.reachability\.ts'/, "testMatch must be '**/*.reachability.ts'");
  need(/\boutputDir:\s*'test-results-deployed'/, "outputDir must be 'test-results-deployed'");
  need(/outputFolder:\s*'playwright-report-deployed'/, "the html report folder must be 'playwright-report-deployed'");
  need(/\bopen:\s*'never'/, "the html report must be open: 'never'");
  return errors;
}

// ---------------------------------------------------------------- FC-30 + FC-35 (static half)
function checkSpecSource(root) {
  const errors = [];
  const raw = read(root, SPEC_REL);
  if (raw === null) return [`FAIL[FC-30] ${SPEC_REL} is missing`];
  const code = stripJsComments(raw);
  const rawLines = raw.split('\n');
  const codeLines = code.split('\n');
  const f30 = (msg, idx) => errors.push(`FAIL[FC-30] ${SPEC_REL}${idx === undefined ? '' : `:${lineNo(code, idx)}`}: ${msg}`);

  if (!raw.toLowerCase().includes(SECONDARY_LABEL.toLowerCase())) f30(`header comment must say "${SECONDARY_LABEL}"`);

  // The guard itself.
  if (!/context\.route\(\s*'\*\*\/\*'/.test(code)) f30("missing the context.route('**/*') write/auth/foreign-host guard");
  if (!/new Set\(\[\s*'GET',\s*'HEAD',\s*'OPTIONS'\s*\]\)/.test(code)) f30("the safe-method set must be exactly GET, HEAD, OPTIONS");
  if (!/'\/auth\/v1\/'/.test(code) || !/if\s*\(\s*url\.includes\(AUTH_PATH\)\s*\)\s*reasons\.push\(/.test(code)) f30('the guard must abort any URL containing /auth/v1/ regardless of method');
  if (!/const foreign\s*=\s*origin\s*!==\s*FRONTEND\s*&&\s*origin\s*!==\s*BACKEND/.test(code)) f30('the guard must classify any request outside the two configured origins as foreign');
  if (!/if\s*\(\s*foreign\s*\)\s*\{[\s\S]{0,600}?rec\.foreignReads\.push\([\s\S]{0,200}?route\.abort\(/.test(code)) f30('a read-only request to a foreign origin must be recorded and aborted, never continued');
  if (!/route\.abort\(/.test(code)) f30('the guard never aborts');
  if (!/rec\.blocked\.push\([\s\S]{0,200}?route\.abort\(/.test(code)) f30('a write or hosted-auth violation must be recorded and aborted, never continued');
  if (!/context\.routeWebSocket\(\s*\/\.\*\/[\s\S]{0,200}?rec\.blocked\.push\([\s\S]{0,120}?\.close\(/.test(code)) f30('missing the context.routeWebSocket(/.*/) guard that records and closes every WebSocket (sockets bypass context.route)');
  if (!/addInitScript/.test(code) || !/discover_telemetry_consent/.test(code)) f30('telemetry consent must be seeded via addInitScript under the exact key discover_telemetry_consent');
  // The afterEach BODY (balanced parentheses) must itself assert the guard record is empty; a later `.blocked` elsewhere
  // in the file must not satisfy this check.
  const aeAt = code.search(/\btest\.afterEach\(/);
  const aeBody = aeAt < 0 ? '' : balancedParens(code, code.indexOf('(', aeAt));
  if (!/expect\(\s*rec\.blocked\s*,[^;]*\)\s*\.toEqual\(\[\]\)/.test(aeBody)) f30('missing the afterEach assertion that the guard record is empty');

  // Redirect hops: context.route sees only the first URL of a chain, so a hop to a foreign origin must be recorded.
  if (!/context\.on\('request',\s*\(r\)\s*=>\s*\{\s*const hop\s*=\s*r\.redirectedFrom\(\)\s*!==\s*null\s*&&\s*!\[FRONTEND,\s*BACKEND\]\.includes\(originOf\(r\.url\(\)\)\);\s*if\s*\(hop\)\s*rec\.blocked\.push\(/.test(code)) {
    f30('missing the redirect-hop check: context.on(\'request\') must record (rec.blocked) any redirectedFrom() request whose origin is neither FRONTEND nor BACKEND');
  }

  // No way to write, mock or interact.
  const forbids = [
    [/\b(?:page|context)\.request\b|\.request\s*\.\s*(?:post|put|patch|delete|fetch|get|head)\b/, 'uses the page/context APIRequestContext (it bypasses the context.route guard)'],
    [/[{,]\s*browser\s*[,}]|\bbrowser\s*\.|\bnewContext\s*\(|\blaunch(?:Persistent)?\w*\s*\(/, 'creates an unguarded browser/context'],
    [/\brequest\.(?:post|put|patch|delete|fetch|get|head)\s*\(/, 'uses the request fixture'],
    [/\bplaywright\.request\b|\bAPIRequest/, 'uses an APIRequest context'],
    [/\.fulfill\s*\(|\brouteFromHAR\b|\bpage\.route\s*\(|\.unroute\s*\(/, 'mocks or re-routes traffic (route.fulfill / routeFromHAR / page.route)'],
    [/\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\bEventSource\b/, 'opens a non-fetch network channel'],
    [/\.(?:click|dblclick|tap|fill|press|check|uncheck|selectOption|setInputFiles|dispatchEvent|dragTo)\s*\(/, 'interacts with the page (this check only navigates and reads)'],
  ];
  for (const [re, msg] of forbids) {
    const m = code.match(re);
    if (m) f30(msg, m.index);
  }

  // Write-method literals: only the single GUARD_PROBE line may hold them.
  const probeLines = [];
  const allowMethodLines = [];
  const getOnly = [];
  const probeFetch = [];
  codeLines.forEach((cl, i) => {
    const rl = rawLines[i] ?? '';
    if (/(['"`])(?:POST|PUT|PATCH|DELETE|TRACE|CONNECT)\1/i.test(cl)) {
      if (/\bGUARD_PROBE\b/.test(rl)) probeLines.push(i + 1);
      else if (/\bALLOWLIST_METHOD\b/.test(rl)) allowMethodLines.push(i + 1); // FC-37 pins this line's exact text
      else errors.push(`FAIL[FC-30] ${SPEC_REL}:${i + 1}: a write-method literal appears outside the single GUARD_PROBE line`);
    } else if (/\bGUARD_PROBE\b/.test(rl)) {
      errors.push(`FAIL[FC-30] ${SPEC_REL}:${i + 1}: GUARD_PROBE marks a line with no write-method literal`);
    }
    const mm = cl.match(/\bmethod\s*:\s*(?:'([^']*)'|"([^"]*)")/);
    if (mm && !['GET', 'HEAD'].includes(mm[1] ?? mm[2]) && !/\bGUARD_PROBE\b/.test(rl)) {
      errors.push(`FAIL[FC-30] ${SPEC_REL}:${i + 1}: method "${mm[1] ?? mm[2]}" is not GET/HEAD`);
    }
    if (/\bfetch\s*\(/.test(cl)) {
      if (/\bGET_ONLY\b/.test(rl)) {
        getOnly.push(i + 1);
        if (!/\bmethod:\s*'GET'/.test(cl)) errors.push(`FAIL[FC-30] ${SPEC_REL}:${i + 1}: the GET_ONLY fetch must pass method: 'GET'`);
      } else if (/\bPROBE_FETCH\b/.test(rl)) probeFetch.push(i + 1);
      else errors.push(`FAIL[FC-30] ${SPEC_REL}:${i + 1}: fetch( outside the GET_ONLY helper and the single PROBE_FETCH line`);
    }
  });
  if (probeLines.length !== 1) errors.push(`FAIL[FC-30] ${SPEC_REL}: expected exactly 1 GUARD_PROBE line holding the write-method literals, found ${probeLines.length}`);
  if (allowMethodLines.length !== 1) errors.push(`FAIL[FC-30] ${SPEC_REL}: expected exactly 1 ALLOWLIST_METHOD line holding the allowlisted method literal, found ${allowMethodLines.length}`);
  if (getOnly.length !== 1) errors.push(`FAIL[FC-30] ${SPEC_REL}: expected exactly 1 GET_ONLY fetch, found ${getOnly.length}`);
  if (probeFetch.length !== 1) errors.push(`FAIL[FC-30] ${SPEC_REL}: expected exactly 1 PROBE_FETCH line, found ${probeFetch.length}`);

  // FC-35 static half: G0 exists and pins the record count to the probe count.
  if (!/\bG0\b/.test(code)) errors.push(`FAIL[FC-35] ${SPEC_REL}: the G0 guard self-test is missing`);
  if (!/const FOREIGN_PROBE\s*=\s*'https:\/\//.test(code)) errors.push(`FAIL[FC-35] ${SPEC_REL}: FOREIGN_PROBE must be an https:// URL (an http:// fetch is blocked as mixed content on an https origin before the route guard sees it)`);
  if (!/const ownBlocked\s*=\s*rec\.blocked\.filter\(\s*isOwn\s*\)/.test(code) || !/const ownForeign\s*=\s*rec\.foreignReads\.filter\(\s*isOwn\s*\)/.test(code)) errors.push(`FAIL[FC-35] ${SPEC_REL}: G0 must count only its own probes (filter rec.blocked / rec.foreignReads through isOwn)`);
  if (!/const aborted\s*=\s*ownBlocked\.length\s*\+\s*ownForeign\.length/.test(code) || !/expect\(\s*aborted\s*,[^;]*\)\s*\.toBe\(\s*probes\.length\s*\)/.test(code)) errors.push(`FAIL[FC-35] ${SPEC_REL}: G0 must assert the guard record count equals the probe count`);
  if (!/not blocked in the browser/.test(code)) errors.push(`FAIL[FC-35] ${SPEC_REL}: G0 must assert every probe request was blocked in the browser`);
  return errors;
}

// ---------------------------------------------------------------- FC-37 the single allowlisted abort
export const CHALLENGE_PREFIX_LITERAL = '/cdn-cgi/challenge-platform/';
/** The allowlist decision, whitespace-collapsed. Any change (second entry, wider prefix, other method, weaker origin compare) is red. */
export const ALLOWLIST_FN_CANON = 'function isAllowlistedChallengeAbort(method: string, url: string, frontend: string): boolean { if (method !== ALLOWLISTED_METHOD) return false; try { const u = new URL(url); return u.origin === frontend && u.pathname.startsWith(CHALLENGE_PREFIX); } catch { return false; } }';

/** Text from the '{' at/after `from` to its matching '}' (comment-stripped input; the pinned function has no braces in strings). */
function balancedBraces(code, from) {
  const open = code.indexOf('{', from);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') { depth -= 1; if (depth === 0) return code.slice(from, i + 1); }
  }
  return '';
}

function checkAllowlist(root) {
  const errors = [];
  const raw = read(root, SPEC_REL);
  if (raw === null) return [`FAIL[FC-37] ${SPEC_REL} is missing`];
  const code = stripJsComments(raw);
  const f37 = (msg) => errors.push(`FAIL[FC-37] ${SPEC_REL}: ${msg}`);
  const count = (re) => (code.match(re) ?? []).length;

  // Exactly ONE allowlist entry: one prefix constant, with the exact literal, and no other cdn-cgi path anywhere in code.
  if (count(/\bconst CHALLENGE_PREFIX\s*=\s*'\/cdn-cgi\/challenge-platform\/';/g) !== 1) f37(`expected exactly one \`const CHALLENGE_PREFIX = '${CHALLENGE_PREFIX_LITERAL}';\` (the single allowlist entry, exact literal)`);
  if (count(/cdn-cgi/gi) !== 1) f37(`the allowlist must name exactly one cdn-cgi path (the one CHALLENGE_PREFIX literal); found ${count(/cdn-cgi/gi)} mention(s)`);
  if (count(/\bconst ALLOWLISTED_METHOD\s*=\s*'POST';/g) !== 1) f37("expected exactly one `const ALLOWLISTED_METHOD = 'POST';` (the allowlist is POST-only)");

  // The decision function: pinned verbatim (POST-only, parsed-origin equality against the frontend, parsed-pathname startsWith).
  const at = code.search(/\bfunction isAllowlistedChallengeAbort\(/);
  const fn = at < 0 ? '' : balancedBraces(code, at).replace(/\s+/g, ' ');
  if (fn !== ALLOWLIST_FN_CANON) f37('isAllowlistedChallengeAbort must be exactly the pinned POST-only, parsed-origin-equality (u.origin === frontend), pathname.startsWith(CHALLENGE_PREFIX) decision; no wildcard host, substring or endsWith compare, or extra entry');

  // The call site: allowlisted => record into allowlistedAborts and route.abort() unconditionally; never continue/fulfill/blocked.
  if (count(/\bisAllowlistedChallengeAbort\(/g) !== 2) f37('isAllowlistedChallengeAbort must be defined once and called exactly once (in the context.route guard)');
  if (!/\n\s*if \(!url\.includes\(AUTH_PATH\) && isAllowlistedChallengeAbort\(method, url, FRONTEND\)\) \{\s*rec\.allowlistedAborts\.push\(`\$\{method\} \$\{url\}`\);\s*await route\.abort\('blockedbyclient'\);\s*return;\s*\}/.test(code)) {
    f37('the allowlist branch must be exactly: if (!url.includes(AUTH_PATH) && isAllowlistedChallengeAbort(method, url, FRONTEND)) { rec.allowlistedAborts.push(...); await route.abort(\'blockedbyclient\'); return; } (unconditional abort, never continue/fulfill, hosted-auth still excluded)');
  }
  if (count(/\ballowlistedAborts\.push\(/g) !== 1) f37('rec.allowlistedAborts must be pushed to exactly once (the allowlist branch)');

  // The allowlisted record is informational: it is annotated and never asserted empty or merged into a failing list.
  const aeAt = code.search(/\btest\.afterEach\(/);
  const aeBody = aeAt < 0 ? '' : balancedParens(code, code.indexOf('(', aeAt));
  if (!/type:\s*'aborted-allowlisted'/.test(aeBody)) f37("the afterEach must surface the allowlisted record as an annotation of type 'aborted-allowlisted'");
  if (/expect\(\s*rec\.allowlistedAborts\b/.test(code)) f37('rec.allowlistedAborts must never be asserted on: the allowlisted abort is a non-failing record');
  // Exactly 5 mentions: interface field, initialiser, the one push, and `.length` + `.map(` in the afterEach annotation. A sixth
  // (spread into / pushed onto a failing list, an extra assertion) or a changed use in afterEach is a routing change.
  if (count(/\ballowlistedAborts\b/g) !== 5 || /\ballowlistedAborts\b/.test(aeBody.replace(/rec\.allowlistedAborts\.length/, '').replace(/rec\.allowlistedAborts\.map\(/, ''))) {
    f37('rec.allowlistedAborts must appear exactly 5 times (field, initialiser, one push, and .length/.map in the afterEach annotation); it must not be merged into or asserted as a failing list');
  }
  return errors;
}

// ---------------------------------------------------------------- FC-31
const CREDENTIAL_PATTERNS = [
  [/\b\w*_PASSWORD\b/, '_PASSWORD'],
  [/\b\w*_EMAIL\b/, '_EMAIL'],
  [/\bstorageState\b/, 'storageState'],
  [/SUPABASE/, 'SUPABASE'],
  [/supabase\.(?:co|in)\b/i, 'a supabase host'],
  [/\bSERVICE_ROLE\b|\w*_SERVICE_ROLE\w*/, 'SERVICE_ROLE'],
  [/\bANON_KEY\b|\w*_ANON_KEY\b/, 'ANON_KEY'],
  [/\bPUBLISHABLE_KEY\b|\w*_PUBLISHABLE_KEY\b/, 'PUBLISHABLE_KEY'],
  [/\bAuthorization\b/, 'Authorization'],
  [/\bsecrets\./, 'secrets.'],
  [/\bhasRealCredentials\b/, 'hasRealCredentials'],
];

function listDir(root, rel) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return null;
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p); else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

function checkCredentialFree(root) {
  const errors = [];
  const files = [CONFIG_REL, WORKFLOW_REL];
  for (const f of listDir(root, DEPLOYED_DIR_REL) ?? []) files.push(`${DEPLOYED_DIR_REL}/${f}`);
  for (const rel of files) {
    const raw = read(root, rel);
    if (raw === null) continue; // a missing required file is reported by its own check
    const code = rel.endsWith('.yml') ? stripYamlComments(raw) : stripJsComments(raw);
    for (const [re, label] of CREDENTIAL_PATTERNS) {
      const m = code.match(re);
      if (m) errors.push(`FAIL[FC-31] ${rel}:${lineNo(code, m.index)}: credential-bearing token ${label} ("${m[0]}"); the reachability check is credential-free`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------- FC-32
function checkDirectory(root) {
  const errors = [];
  const files = listDir(root, DEPLOYED_DIR_REL);
  if (files === null) return [`FAIL[FC-32] ${DEPLOYED_DIR_REL}/ is missing`];
  if (files.join('\n') !== SPEC_NAME) {
    errors.push(`FAIL[FC-32] ${DEPLOYED_DIR_REL}/ must contain exactly ${SPEC_NAME}; found [${files.join(', ')}]`);
  }
  for (const f of files.filter((x) => /\.(ts|js|mjs|cjs|tsx|jsx)$/.test(x))) {
    const code = stripJsComments(read(root, `${DEPLOYED_DIR_REL}/${f}`));
    const specs = [
      ...[...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ];
    for (const s of specs) {
      const ok = s === '@playwright/test' || (s.startsWith('node:') && NODE_BUILTINS.has(s.slice(5))) || NODE_BUILTINS.has(s);
      if (!ok) errors.push(`FAIL[FC-32] ${DEPLOYED_DIR_REL}/${f}: import "${s}" is not allowed; only @playwright/test and node builtins (no ../helpers, global-setup or canonical code)`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------- FC-33
/** { top: top-level text, jobs: [{ id, text, name, steps: [{ name, run, text }] }] } from the indentation shape. */
export function parseWorkflow(text) {
  const lines = text.split('\n');
  const jobs = [];
  let inJobs = false;
  let job = null;
  let step = null;
  let top = '';
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (!inJobs) { top += `${line}\n`; continue; }
    const jm = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jm) { job = { id: jm[1], text: '', steps: [] }; jobs.push(job); step = null; continue; }
    if (!job) continue;
    job.text += `${line}\n`;
    const sm = line.match(/^ {6}- (.*)$/);
    if (sm) { step = { head: sm[1], text: '' }; job.steps.push(step); }
    if (step) step.text += `${line}\n`;
  }
  for (const j of jobs) {
    j.name = (j.text.match(/^ {4}name:\s*(.+)$/m) ?? [])[1]?.trim() ?? '';
    for (const s of j.steps) {
      s.name = (s.text.match(/^\s*- name:\s*(.+)$/m) ?? [])[1]?.trim() ?? s.head;
      const idx = s.text.search(/^ {8}run:/m);
      s.run = idx >= 0 ? s.text.slice(idx).replace(/^ {8}run:\s*\|?\s*\n?/, '') : '';
    }
  }
  return { top, jobs };
}

function checkWorkflow(root) {
  const errors = [];
  const raw = read(root, WORKFLOW_REL);
  if (raw === null) return [`FAIL[FC-33] ${WORKFLOW_REL} is missing`];
  const text = stripYamlComments(raw);
  const f33 = (msg) => errors.push(`FAIL[FC-33] ${WORKFLOW_REL}: ${msg}`);

  for (const [re, label] of [
    [/\bsecrets\./, '`secrets.`'],
    [/continue-on-error/, 'continue-on-error'],
    [/\|\|\s*true\b/, '`|| true`'],
    [/--project\b/, '`--project`'],
    [/test:e2e:full/, 'test:e2e:full'],
    [/--pass-with-no-tests/, '--pass-with-no-tests'],
    [/pull_request_target/, 'pull_request_target'],
    [/proceeding anyway/i, 'the fail-open "proceeding anyway"'],
    [/pages\.dev/i, 'a pages.dev host (it must not appear anywhere in the workflow)'],
  ]) {
    if (re.test(text)) f33(`must not contain ${label}`);
  }

  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(text)) f33('top-level `permissions:` must be exactly `contents: read`');
  if (/^\s*[a-z-]+:\s*write\s*$/m.test(text)) f33('a write permission is declared');

  const wf = parseWorkflow(text);
  const wfName = (wf.top.match(/^name:\s*(.+)$/m) ?? [])[1] ?? '';
  if (!wfName.includes(SECONDARY_LABEL)) f33(`workflow name must carry "${SECONDARY_LABEL}"`);
  if (wf.jobs.length !== 1) f33(`expected exactly 1 job, found ${wf.jobs.length}`);
  const job = wf.jobs[0];
  if (!job) return errors;
  if (!job.name.includes(SECONDARY_LABEL)) f33(`job name must carry "${SECONDARY_LABEL}"`);

  const testSteps = job.steps.filter((s) => /\bplaywright\s+test\b/.test(s.run));
  if (testSteps.length !== 1) f33(`expected exactly 1 step running playwright test, found ${testSteps.length}`);
  else {
    const s = testSteps[0];
    if (s.run.trim() !== TEST_COMMAND) f33(`the test step must run exactly \`${TEST_COMMAND}\`; found \`${s.run.trim()}\``);
    if (!s.name.includes(SECONDARY_LABEL)) f33(`the test step name must carry "${SECONDARY_LABEL}"`);
  }

  // The ONLY place a default URL lives is this workflow: `${{ vars.NAME || '<https literal>' }}` (a repo VARIABLE, never a
  // secret). The Playwright config keeps no default (FC-29).
  const HTTPS_LITERAL = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/?$/;
  for (const [key, pinned] of [['PLAYWRIGHT_BASE_URL', FRONTEND_DEFAULT], ['BACKEND_BASE_URL', null]]) {
    // Exactly one definition in the WHOLE workflow: a step-level `env:` override or a duplicate would silently win.
    const defs = [...text.matchAll(new RegExp(`^\\s*${key}:\\s*(\\S.*)$`, 'gm'))];
    if (defs.length !== 1) { f33(`${key} must be defined exactly once in the workflow; found ${defs.length}`); continue; }
    const value = defs[0][1].trim();
    const expr = value.match(/^\$\{\{\s*vars\.[A-Za-z_][A-Za-z0-9_]*\s*\|\|\s*'([^']*)'\s*\}\}$/);
    if (!expr) {
      if (/\bvars\./.test(value)) f33(`${key} uses vars. without a quoted https:// literal fallback (found "${value}"); the form is \${{ vars.NAME || 'https://...' }}`);
      else f33(`${key} must be \${{ vars.NAME || 'https://...' }} (a repo variable with an https literal fallback); found "${value}"`);
      continue;
    }
    const fallback = expr[1];
    if (!HTTPS_LITERAL.test(fallback)) f33(`${key} fallback must be an https:// literal (found "${fallback}")`);
    else if (pinned !== null && fallback.replace(/\/$/, '') !== pinned) {
      f33(`${key} fallback must be ${pinned}${/pages\.dev/i.test(fallback) ? ' (pages.dev must not be the frontend default)' : ''} (found "${fallback}")`);
    }
  }

  // The checkout token must not persist into the job's git config.
  for (const s of job.steps.filter((x) => /\bactions\/checkout\b/.test(x.head))) {
    if (!/^\s+persist-credentials:\s*false\s*$/m.test(s.text)) f33('actions/checkout must set `persist-credentials: false`');
  }
  // No expression interpolation inside a run: block (script injection); reference values through the shell environment.
  for (const s of job.steps) {
    if (/\$\{\{/.test(s.run)) f33(`step "${s.name}" interpolates \${{ }} inside run:; pass it through env and read it as a shell variable`);
  }

  for (const s of job.steps) {
    if (!/\b(for|while|until)\b[^\n]*;\s*do\b|^\s*(for|while|until)\b/m.test(s.run)) continue;
    const lastDone = s.run.lastIndexOf('done');
    const exits = [...s.run.matchAll(/\bexit 1\b/g)].map((m) => m.index);
    if (lastDone < 0 || !exits.some((i) => i > lastDone)) f33(`step "${s.name}" has a wait loop that does not end in \`exit 1\` after the loop`);
  }
  return errors;
}

// ---------------------------------------------------------------- FC-34 legacy smoke gone
export const SMOKE_PROJECT_NAMES = ['smoke', 'udupi-canonical-smoke'];
/** Specs deleted by PR-2 (disk-absence enforced). */
export const PR2_DELETED_SPECS = [
  'admin-smoke.spec.ts', 'broker-smoke.spec.ts', 'discover-real-data-smoke.spec.ts',
  'discover-schools-canonical-2124.spec.ts', 'discover-udupi-canonical-smoke.spec.ts', 'quick-smoke.spec.ts',
];
/** SCHEDULED(PR-2) specs held back pending the D3 coverage ruling: still barred from every config, not yet barred from disk. */
export const PR2_HELD_SPECS = ['broker-dashboard-v2.spec.ts', 'broker-listing-quality.spec.ts'];
/** Non-spec files deleted by PR-2 (D4/D6). */
export const PR2_DELETED_SUPPORT_FILES = [
  'e2e/helpers/discover-map-drive.ts',
  'scripts/db/fixtures/udupi-canonical-smoke-fixture-seed.sql',
  'scripts/test/run-real-data-smoke.sh',
];
export const PW_CONFIG_REL = 'playwright.config.ts';
export const CI_REL = '.github/workflows/ci.yml';
export const PACKAGE_REL = 'package.json';
export const CLASSIFY_REL = 'scripts/dev/lib/pre-push-classify.sh';
export const RUN_LOCAL_REL = 'scripts/run-e2e-local.sh';
export const RESTORE_REL = 'scripts/db/restore-test-fixture.sh';

/** Removes whole-line # comments from shell text while keeping line structure. */
export function stripShellComments(src) {
  return src.split('\n').map((l) => (/^\s*#/.test(l) ? '' : l)).join('\n');
}

function checkLegacySmokeGone(root) {
  const errors = [];
  const f34 = (msg) => errors.push(`FAIL[FC-34] ${msg}`);
  const configs = {};

  // playwright.config.ts: no smoke project (the file itself stays until PR-7, so a missing file is fine).
  const pw = read(root, PW_CONFIG_REL);
  if (pw !== null) {
    configs[PW_CONFIG_REL] = stripJsComments(pw);
    for (const m of configs[PW_CONFIG_REL].matchAll(/\bname:\s*(['"`])([^'"`]+)\1/g)) {
      if (SMOKE_PROJECT_NAMES.includes(m[2])) f34(`${PW_CONFIG_REL}:${lineNo(configs[PW_CONFIG_REL], m.index)}: declares the retired Playwright project "${m[2]}"`);
    }
  }

  // ci.yml: no playwright-pr job, no smoke project run.
  const ci = read(root, CI_REL);
  if (ci === null) f34(`${CI_REL} is missing`);
  else {
    configs[CI_REL] = stripYamlComments(ci);
    if (/^\s*playwright-pr\s*:/m.test(configs[CI_REL])) f34(`${CI_REL}: the retired playwright-pr job is back`);
    if (/--project[= ]smoke\b/.test(configs[CI_REL])) f34(`${CI_REL}: runs the retired --project=smoke`);
  }

  // package.json: no test:e2e:smoke script.
  const pkg = read(root, PACKAGE_REL);
  if (pkg === null) f34(`${PACKAGE_REL} is missing`);
  else {
    configs[PACKAGE_REL] = pkg;
    if (/"test:e2e:smoke"\s*:/.test(pkg)) f34(`${PACKAGE_REL}: the retired test:e2e:smoke script is back`);
    if (/--project[= ]smoke\b/.test(pkg)) f34(`${PACKAGE_REL}: a script runs the retired --project=smoke`);
  }

  // pre-push-classify.sh: no smoke allowlist mirror or classifier.
  const cls = read(root, CLASSIFY_REL);
  if (cls === null) f34(`${CLASSIFY_REL} is missing`);
  else {
    configs[CLASSIFY_REL] = stripShellComments(cls);
    if (/\bSMOKE_SPEC_BASENAMES\b/.test(configs[CLASSIFY_REL])) f34(`${CLASSIFY_REL}: SMOKE_SPEC_BASENAMES is back`);
    if (/\b(?:classify_e2e_coverage|_is_smoke_spec_basename)\b/.test(configs[CLASSIFY_REL])) f34(`${CLASSIFY_REL}: the smoke coverage classifier is back`);
  }

  // run-e2e-local.sh: no silent default to the smoke project.
  const rl = read(root, RUN_LOCAL_REL);
  if (rl === null) f34(`${RUN_LOCAL_REL} is missing`);
  else {
    configs[RUN_LOCAL_REL] = stripShellComments(rl);
    if (/--project[= ]smoke\b/.test(configs[RUN_LOCAL_REL])) f34(`${RUN_LOCAL_REL}: defaults to / names the retired --project=smoke`);
    if (!/exit 2\b/.test(configs[RUN_LOCAL_REL])) f34(`${RUN_LOCAL_REL}: must refuse (exit 2) when no --project is given`);
  }

  // None of the 8 PR-2 specs may be named by any of those files.
  for (const [rel, code] of Object.entries(configs)) {
    for (const base of [...PR2_DELETED_SPECS, ...PR2_HELD_SPECS]) {
      if (code.includes(base)) f34(`${rel}: still references the PR-2 spec ${base}`);
    }
  }

  // The deleted files are gone from disk.
  for (const base of PR2_DELETED_SPECS) {
    if (fs.existsSync(path.join(root, 'e2e', base))) f34(`e2e/${base} exists; it was deleted by PR-2`);
  }
  for (const rel of PR2_DELETED_SUPPORT_FILES) {
    if (fs.existsSync(path.join(root, rel))) f34(`${rel} exists; it was deleted by PR-2`);
  }
  return errors;
}

// ---------------------------------------------------------------- FC-36 fixture profile retired
function checkFixtureProfileRetired(root) {
  const errors = [];
  const f36 = (msg) => errors.push(`FAIL[FC-36] ${RESTORE_REL}: ${msg}`);
  const raw = read(root, RESTORE_REL);
  if (raw === null) return [`FAIL[FC-36] ${RESTORE_REL} is missing`];
  const code = stripShellComments(raw);

  if (/udupi-canonical|UDUPI_CANONICAL/i.test(code)) f36('the retired udupi-canonical profile / seed variable is back');
  if (!/\bNAV_2581_UDUPI_SEED_FILE=/.test(code)) f36('NAV_2581_UDUPI_SEED_FILE (a default seed, not a profile) must be kept');

  const caseAt = code.search(/\bcase\s+"\$\{E2E_FIXTURE_PROFILE\}"\s+in\b/);
  if (caseAt < 0) { f36('no `case "${E2E_FIXTURE_PROFILE}" in` check; a non-empty profile would be accepted'); return errors; }
  const block = (code.slice(caseAt).match(/^case[\s\S]*?\besac\b/) ?? [''])[0];
  const arms = [...block.matchAll(/^\s*("[^"]*"|\*|[A-Za-z0-9_|"-]+)\)/gm)].map((m) => m[1]);
  if (arms.join(' ') !== '"" *') f36(`the profile check must have exactly the arms "" and * ; found [${arms.join(' ')}]`);
  const starArm = (block.match(/^\s*\*\)([\s\S]*?);;/m) ?? [])[1] ?? '';
  if (!/\bexit 1\b/.test(starArm)) f36('a non-empty profile must exit 1');

  // Fail closed BEFORE any docker / psql / flyway call.
  const first = code.search(/\b(?:docker|psql|flyway)\b/);
  if (first >= 0 && first < caseAt) f36(`a docker/psql/flyway reference (line ${lineNo(code, first)}) precedes the profile check (line ${lineNo(code, caseAt)}); the rejection must come first`);
  return errors;
}

export const CHECKS = [checkConfig, checkSpecSource, checkAllowlist, checkCredentialFree, checkDirectory, checkWorkflow, checkLegacySmokeGone, checkFixtureProfileRetired];

export function checkDeployed({ root = DEFAULT_ROOT } = {}) {
  return CHECKS.flatMap((check) => check(root));
}

export function main(argv = process.argv.slice(2)) {
  let root = DEFAULT_ROOT;
  for (let i = 0; i < argv.length; i += 1) {
    const m = argv[i].match(/^--root(?:=(.*))?$/);
    if (!m) { process.stderr.write('usage: check-deployed-reachability.mjs [--root dir]\n'); return 2; }
    root = path.resolve(m[1] ?? argv[++i]);
  }
  const errors = checkDeployed({ root });
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`${e}\n`);
    process.stderr.write(`DEPLOYED REACHABILITY GUARD: FAIL (${errors.length} problem${errors.length === 1 ? '' : 's'})\n`);
    return 1;
  }
  process.stdout.write('DEPLOYED REACHABILITY GUARD: PASS\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
