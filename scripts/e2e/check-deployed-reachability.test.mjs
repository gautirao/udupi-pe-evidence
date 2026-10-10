// node --test scripts/e2e/check-deployed-reachability.test.mjs  (issue #2750 PR-2, FC-29..FC-36)
//
// The guard reads the deployed-reachability files as TEXT. Each test copies those files into a temp root, applies ONE
// mutation (with an anchor-present assertion, so a refactor cannot turn a mutation test into a vacuous pass), and
// expects the matching FC id to go red. A clean-tree section asserts the real files contain none of the forbidden
// tokens, using patterns independent of the guard's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  checkDeployed, stripJsComments, stripYamlComments, stripShellComments, parseWorkflow,
  FRONTEND_DEFAULT, CONFIG_REL, SPEC_REL, WORKFLOW_REL, DEPLOYED_DIR_REL, SECONDARY_LABEL, TEST_COMMAND,
  PW_CONFIG_REL, CI_REL, PACKAGE_REL, CLASSIFY_REL, RUN_LOCAL_REL, RESTORE_REL,
  PR2_DELETED_SPECS, PR2_HELD_SPECS, PR2_DELETED_SUPPORT_FILES,
} from './check-deployed-reachability.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUARD = path.join(ROOT, 'scripts', 'e2e', 'check-deployed-reachability.mjs');
const REAL = Object.fromEntries(
  [CONFIG_REL, SPEC_REL, WORKFLOW_REL, PW_CONFIG_REL, CI_REL, PACKAGE_REL, CLASSIFY_REL, RUN_LOCAL_REL, RESTORE_REL]
    .map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')]),
);

/** world({ [rel]: (text) => text | null (delete) }, { extraRel: content }) -> temp root. */
function world(edits = {}, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployed-guard-'));
  for (const [rel, text] of Object.entries(REAL)) {
    const edit = edits[rel];
    if (edit === null) continue;
    const out = edit ? edit(text) : text;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), out);
  }
  for (const [rel, text] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const clean = (root) => fs.rmSync(root, { recursive: true, force: true });

/** Replace `from` with `to` in one file; the anchor must exist (no vacuous mutation). */
const sub = (from, to) => (text) => {
  assert.ok(text.includes(from), `mutation anchor not found: ${from}`);
  return text.replace(from, to);
};

function errorsFor(edits, extra) {
  const root = world(edits, extra);
  try { return checkDeployed({ root }); } finally { clean(root); }
}
const hits = (errors, fc, needle = '') => errors.filter((e) => e.startsWith(`FAIL[${fc}]`) && e.includes(needle));
function assertRed(edits, fc, needle, extra) {
  const errs = errorsFor(edits, extra);
  assert.ok(hits(errs, fc, needle).length > 0, `expected FAIL[${fc}] containing "${needle}" but got:\n${errs.join('\n') || '(no errors)'}`);
}

// ---------------------------------------------------------------- real repo + helpers
test('the real repo passes the deployed-reachability guard', () => {
  assert.deepEqual(checkDeployed({ root: ROOT }), []);
});

test('stripJsComments removes comments but keeps strings, regex literals and line numbers', () => {
  const src = "// head\nconst a = '**/*'; // tail\n/* b\n c */ const r = /^https?:\\/\\//.test(x); const u = 'http://x';\n";
  const out = stripJsComments(src);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.ok(out.includes("'**/*'"));
  assert.ok(out.includes('/^https?:\\/\\//.test(x)'));
  assert.ok(out.includes("'http://x'"));
  assert.ok(!out.includes('head') && !out.includes('tail') && !out.includes(' b'));
});

test('stripYamlComments keeps line structure and drops # comments only', () => {
  const out = stripYamlComments('a: 1 # note\n# whole\nb: "x#y"\n');
  assert.equal(out.split('\n').length, 4);
  assert.ok(!out.includes('note') && !out.includes('whole'));
  assert.ok(out.includes('"x#y"'));
});

test('parseWorkflow sees the single job, its name and the test step', () => {
  const wf = parseWorkflow(stripYamlComments(REAL[WORKFLOW_REL]));
  assert.equal(wf.jobs.length, 1);
  assert.ok(wf.jobs[0].name.includes(SECONDARY_LABEL));
  const run = wf.jobs[0].steps.filter((s) => s.run.trim() === TEST_COMMAND);
  assert.equal(run.length, 1);
});

// ---------------------------------------------------------------- FC-29 config shape
test('FC-29 mutation: the config file missing is detected', () => {
  assertRed({ [CONFIG_REL]: null }, 'FC-29', 'missing');
});

test('FC-29 mutation: a URL fallback, a hosted-host literal, a dropped throw or a dropped http(s) test are detected', () => {
  assertRed({ [CONFIG_REL]: sub('const value = process.env[name];', "const value = process.env[name] ?? 'https://x.example';") }, 'FC-29', 'fallback');
  assertRed({ [CONFIG_REL]: sub('const value = process.env[name];', "const value = process.env[name] || 'x';") }, 'FC-29', 'fallback');
  assertRed({ [CONFIG_REL]: sub("const baseURL = requireHttpUrl('PLAYWRIGHT_BASE_URL');", "const baseURL = 'https://udupi-property-explorer.pages.dev';") }, 'FC-29', 'deployed-host literal');
  assertRed({ [CONFIG_REL]: sub('throw new Error(', 'console.warn(') }, 'FC-29', 'must throw');
  assertRed({ [CONFIG_REL]: sub('/^https?:\\/\\//', '/./') }, 'FC-29', 'http(s)');
});

test('FC-29 mutation: global hooks, web server, saved sign-in state or an env-file read are detected', () => {
  for (const [needle, line] of [
    ['global hook', "  globalSetup: './e2e/global-setup.ts',\n"],
    ['global hook', "  globalTeardown: './e2e/global-teardown.ts',\n"],
    ['global hook', "  webServer: { command: 'npm run dev' },\n"],
    ['global hook', "  use: { storageState: 'x.json' },\n"],
  ]) assertRed({ [CONFIG_REL]: sub("  testDir: './e2e/deployed',\n", `  testDir: './e2e/deployed',\n${line}`) }, 'FC-29', needle);
  assertRed({ [CONFIG_REL]: sub("import { defineConfig } from '@playwright/test';", "import { defineConfig } from '@playwright/test';\nimport * as fs from 'fs';") }, 'FC-29', 'reads a file');
  assertRed({ [CONFIG_REL]: sub("import { defineConfig } from '@playwright/test';", "import { defineConfig } from '@playwright/test';\nconst envFile = path.resolve('.env.e2e');") }, 'FC-29', 'reads a file');
});

test('FC-29 mutation: retries, workers, forbidOnly, serviceWorkers, testMatch, outputDir and report settings are pinned', () => {
  assertRed({ [CONFIG_REL]: sub('retries: 0', 'retries: 2') }, 'FC-29', 'retries must be 0');
  assertRed({ [CONFIG_REL]: sub('workers: 1', 'workers: 2') }, 'FC-29', 'workers must be 1');
  assertRed({ [CONFIG_REL]: sub('forbidOnly: true', 'forbidOnly: false') }, 'FC-29', 'forbidOnly');
  assertRed({ [CONFIG_REL]: sub("serviceWorkers: 'block'", "serviceWorkers: 'allow'") }, 'FC-29', 'serviceWorkers');
  assertRed({ [CONFIG_REL]: sub("testMatch: '**/*.reachability.ts'", "testMatch: '**/*.spec.ts'") }, 'FC-29', 'testMatch');
  assertRed({ [CONFIG_REL]: sub("outputDir: 'test-results-deployed'", "outputDir: 'test-results'") }, 'FC-29', 'outputDir');
  assertRed({ [CONFIG_REL]: sub("outputFolder: 'playwright-report-deployed'", "outputFolder: 'playwright-report'") }, 'FC-29', 'playwright-report-deployed');
  assertRed({ [CONFIG_REL]: sub("open: 'never'", "open: 'on-failure'") }, 'FC-29', "open: 'never'");
});

test('FC-29 mutation: the secondary label or the gate pointer dropped from the header is detected', () => {
  assertRed({ [CONFIG_REL]: sub('secondary — not the E2E gate', 'a post-deploy check') }, 'FC-29', 'header comment must say');
  assertRed({ [CONFIG_REL]: sub('the gate is npm run test:e2e:gate', 'the gate is elsewhere') }, 'FC-29', 'test:e2e:gate');
});

// ---------------------------------------------------------------- FC-30 write-free source
test('FC-30 mutation: the spec missing, or its context.route guard / afterEach record check removed, is detected', () => {
  assertRed({ [SPEC_REL]: null }, 'FC-30', 'missing');
  assertRed({ [SPEC_REL]: sub("await context.route('**/*', async (route) => {", "await context.route('**/api/*', async (route) => {") }, 'FC-30', "context.route('**/*')");
  assertRed({ [SPEC_REL]: sub("expect(rec.blocked, 'the write/auth guard recorded a blocked request').toEqual([]);", '// removed') }, 'FC-30', 'afterEach');
  assertRed({ [SPEC_REL]: sub('test.afterEach(', 'test.beforeEach(') }, 'FC-30', 'afterEach');
});

test('FC-30 mutation: a guard that lets writes through is detected (safe set, hosted-auth path, origin allowlist, abort)', () => {
  assertRed({ [SPEC_REL]: sub("new Set(['GET', 'HEAD', 'OPTIONS'])", "new Set(['GET', 'HEAD', 'OPTIONS', 'POST'])") }, 'FC-30', 'write-method literal');
  assertRed({ [SPEC_REL]: sub("new Set(['GET', 'HEAD', 'OPTIONS'])", "new Set(['GET'])") }, 'FC-30', 'safe-method set');
  assertRed({ [SPEC_REL]: sub('if (url.includes(AUTH_PATH))', 'if (false)') }, 'FC-30', '/auth/v1/');
  assertRed({ [SPEC_REL]: sub('const foreign = origin !== FRONTEND && origin !== BACKEND;', 'const foreign = false;') }, 'FC-30', 'configured origins');
  // the violation branch (the FIRST abort): continuing instead of aborting lets a write out
  assertRed({ [SPEC_REL]: sub("rec.blocked.push(`${method} ${url} [${reasons.join(', ')}]`);\n          await route.abort('blockedbyclient');", "rec.blocked.push(`${method} ${url} [${reasons.join(', ')}]`);\n          await route.continue();") }, 'FC-30', 'violation must be recorded and aborted');
  assertRed({ [SPEC_REL]: (t) => { assert.ok(t.includes('route.abort(')); return t.replaceAll("await route.abort('blockedbyclient');", 'await route.continue();'); } }, 'FC-30', 'never aborts');
  // the foreign-read branch: continuing instead of aborting would contact a third party
  assertRed({ [SPEC_REL]: sub("          rec.foreignReads.push(`${method} ${url}`);\n          await route.abort('blockedbyclient');", "          rec.foreignReads.push(`${method} ${url}`);\n          await route.continue();") }, 'FC-30', 'foreign origin must be recorded and aborted');
});

test('FC-30 mutation: write methods, APIRequest, mocking, interaction and extra channels are detected', () => {
  const add = (snippet) => sub("const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';", `const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';\n${snippet}\n`);
  assertRed({ [SPEC_REL]: add("const bad = { method: 'POST' };") }, 'FC-30', 'write-method literal');
  assertRed({ [SPEC_REL]: add("const bad = ['PATCH'];") }, 'FC-30', 'write-method literal');
  assertRed({ [SPEC_REL]: add("const bad = { method: 'PUT' };") }, 'FC-30', 'write-method literal');
  assertRed({ [SPEC_REL]: add("const bad = 'delete';") }, 'FC-30', 'write-method literal');
  assertRed({ [SPEC_REL]: add("const bad = { method: 'TRACE' };") }, 'FC-30', 'write-method literal');
  assertRed({ [SPEC_REL]: add("const bad = { method: 'FETCHX' };") }, 'FC-30', 'method "FETCHX" is not GET/HEAD');
  assertRed({ [SPEC_REL]: add('void page.request.post(BACKEND);') }, 'FC-30', 'APIRequestContext');
  assertRed({ [SPEC_REL]: add('void context.request.get(BACKEND);') }, 'FC-30', 'APIRequestContext');
  assertRed({ [SPEC_REL]: add('void request.fetch(BACKEND);') }, 'FC-30', 'request fixture');
  assertRed({ [SPEC_REL]: add("await page.route('**/api/**', (r) => r.fulfill({ status: 200 }));") }, 'FC-30', 'mocks');
  assertRed({ [SPEC_REL]: add("await page.routeFromHAR('x.har');") }, 'FC-30', 'mocks');
  assertRed({ [SPEC_REL]: add("await page.getByRole('button').click();") }, 'FC-30', 'interacts');
  assertRed({ [SPEC_REL]: add("await page.locator('input').fill('x');") }, 'FC-30', 'interacts');
  assertRed({ [SPEC_REL]: add("navigator.sendBeacon('/x');") }, 'FC-30', 'non-fetch');
  assertRed({ [SPEC_REL]: add('new XMLHttpRequest();') }, 'FC-30', 'non-fetch');
});

test('FC-30 mutation: an unguarded browser/context and a chained .request.<verb> are detected; a comment mentioning them is not', () => {
  const add = (snippet) => sub("const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';", `const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';\n${snippet}\n`);
  assertRed({ [SPEC_REL]: add('const c = await browser.newContext();') }, 'FC-30', 'unguarded browser/context');
  assertRed({ [SPEC_REL]: add('const c = await chromium.launch();') }, 'FC-30', 'unguarded browser/context');
  assertRed({ [SPEC_REL]: add('const c = await chromium.launchPersistentContext(dir);') }, 'FC-30', 'unguarded browser/context');
  assertRed({ [SPEC_REL]: sub('async ({ page, rec }) => {\n    await page.goto(\'/\');\n    await page.waitForFunction', 'async ({ page, rec, browser }) => {\n    await page.goto(\'/\');\n    await page.waitForFunction') }, 'FC-30', 'unguarded browser/context');
  assertRed({ [SPEC_REL]: add('void page.context().request.post(BACKEND);') }, 'FC-30', 'APIRequestContext');
  assertRed({ [SPEC_REL]: add('void (await page.context()).request.get(BACKEND);') }, 'FC-30', 'APIRequestContext');
  const errs = errorsFor({ [SPEC_REL]: add('// a fresh browser.newContext() or chromium.launch() would bypass the guard\nconst benign = 1;') });
  assert.deepEqual(errs, []);
});

test('FC-30 mutation: removing the context.routeWebSocket guard is detected', () => {
  assertRed({ [SPEC_REL]: sub('await context.routeWebSocket(/.*/, (ws) => {', 'await context.addInitScript((ws) => {') }, 'FC-30', 'routeWebSocket');
  assertRed({ [SPEC_REL]: sub('void ws.close();', 'void 0;') }, 'FC-30', 'routeWebSocket');
});

test('FC-30 mutation: removing or weakening the redirect-hop check is detected', () => {
  const hopLine = "const hop = r.redirectedFrom() !== null && ![FRONTEND, BACKEND].includes(originOf(r.url()));";
  assertRed({ [SPEC_REL]: sub(hopLine, 'const hop = false;') }, 'FC-30', 'redirect-hop check');
  assertRed({ [SPEC_REL]: sub(hopLine, 'const hop = r.redirectedFrom() !== null && ![FRONTEND].includes(originOf(r.url()));') }, 'FC-30', 'redirect-hop check');
  assertRed({ [SPEC_REL]: sub('if (hop) rec.blocked.push(', 'if (hop) rec.foreignReads.push(') }, 'FC-30', 'redirect-hop check');
  assertRed({ [SPEC_REL]: (t) => { assert.ok(/ {8}if \(hop\) rec\.blocked\.push\([^\n]*\n/.test(t)); return t.replace(/ {8}if \(hop\) rec\.blocked\.push\([^\n]*\n/, ''); } }, 'FC-30', 'redirect-hop check');
});

test('FC-30 mutation: fetch outside the two marked lines, a non-GET GET_ONLY fetch and a changed marker count are detected', () => {
  const add = (snippet) => sub("const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';", `const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';\n${snippet}\n`);
  assertRed({ [SPEC_REL]: add('const f = () => fetch(BACKEND);') }, 'FC-30', 'fetch(');
  assertRed({ [SPEC_REL]: sub("{ method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' } }); // GET_ONLY", "{ method: 'HEAD2', credentials: 'omit' }); // GET_ONLY") }, 'FC-30', "must pass method: 'GET'");
  assertRed({ [SPEC_REL]: sub("const PROBE_METHODS = ['POST', 'PUT', 'DELETE']; // GUARD_PROBE", "const PROBE_METHODS = ['POST', 'PUT', 'DELETE'];") }, 'FC-30', 'outside the single GUARD_PROBE line');
  assertRed({ [SPEC_REL]: add("const second = ['POST']; // GUARD_PROBE") }, 'FC-30', 'exactly 1 GUARD_PROBE');
  assertRed({ [SPEC_REL]: add('const f = () => fetch(BACKEND, {}); // PROBE_FETCH') }, 'FC-30', 'exactly 1 PROBE_FETCH');
  assertRed({ [SPEC_REL]: add("const g = () => fetch(BACKEND, { method: 'GET' }); // GET_ONLY") }, 'FC-30', 'exactly 1 GET_ONLY');
});

test('FC-30 control: write words in COMMENTS and the lowercase word in prose do not trip the guard', () => {
  const errs = errorsFor({ [SPEC_REL]: sub("const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';", "const ERROR_BOUNDARY_TEXT = 'Something went wrong. Please refresh the page.';\n// a POST, PUT or DELETE here would be a write; page.request.post is banned; fetch( too\nconst outputPostfix = 'postfix';") });
  assert.deepEqual(errs, []);
});

// ---------------------------------------------------------------- FC-35 static half
test('FC-35 mutation: G0 missing or its record-count / blocked-in-browser assertions removed is detected', () => {
  assertRed({ [SPEC_REL]: sub("test('G0 the write/auth/foreign-host guard intercepts at runtime'", "test('guard self-test'") }, 'FC-35', 'G0 guard self-test is missing');
  assertRed({ [SPEC_REL]: sub("expect(aborted, 'guard record count must equal the probe count').toBe(probes.length);", '') }, 'FC-35', 'record count equals the probe count');
  assertRed({ [SPEC_REL]: sub("'a probe request was not blocked in the browser'", "'probe outcome'") }, 'FC-35', 'blocked in the browser');
  // G0 must use an https foreign probe (http is mixed content on the https origin) and count only its own probes.
  assertRed({ [SPEC_REL]: sub("const FOREIGN_PROBE = 'https://guard-probe.invalid/x';", "const FOREIGN_PROBE = 'http://guard-probe.invalid/x';") }, 'FC-35', 'https://');
  assertRed({ [SPEC_REL]: sub('const aborted = ownBlocked.length + ownForeign.length;', 'const aborted = rec.blocked.length + rec.foreignReads.length;') }, 'FC-35', 'record count equals the probe count');
  assertRed({ [SPEC_REL]: sub('const ownBlocked = rec.blocked.filter(isOwn);', 'const ownBlocked = rec.blocked;') }, 'FC-35', 'only its own probes');
});

// ---------------------------------------------------------------- FC-31 credential-free
test('FC-31 mutation: every credential-bearing token is detected in the spec, the config and the workflow', () => {
  for (const [token, label] of [
    ['ADMIN_PASSWORD', '_PASSWORD'], ['SMOKE_USER_EMAIL', '_EMAIL'], ['storageState', 'storageState'], ['VITE_SUPABASE_URL', 'SUPABASE'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE'], ['ROLE_SERVICE_ROLE', 'SERVICE_ROLE'], ['VITE_ANON_KEY', 'ANON_KEY'],
    ['VITE_PUBLISHABLE_KEY', 'PUBLISHABLE_KEY'], ['Authorization', 'Authorization'], ['hasRealCredentials', 'hasRealCredentials'],
  ]) {
    assertRed({ [SPEC_REL]: sub('const CITY = ', `const tokenUnderTest = '${token}';\nconst CITY = `) }, 'FC-31', label);
  }
  assertRed({ [SPEC_REL]: sub('const CITY = ', "const u = 'https://abcd.supabase.co';\nconst CITY = ") }, 'FC-31', 'supabase host');
  assertRed({ [CONFIG_REL]: sub("export default defineConfig({", "const k = 'ADMIN_PASSWORD';\nexport default defineConfig({") }, 'FC-31', '_PASSWORD');
  assertRed({ [WORKFLOW_REL]: sub('    env:\n      PLAYWRIGHT_BASE_URL', '    env:\n      ADMIN_EMAIL: x\n      PLAYWRIGHT_BASE_URL') }, 'FC-31', '_EMAIL');
  assertRed({ [WORKFLOW_REL]: sub('    env:\n      PLAYWRIGHT_BASE_URL', '    env:\n      VITE_SUPABASE_URL: x\n      PLAYWRIGHT_BASE_URL') }, 'FC-31', 'SUPABASE');
  assertRed({ [WORKFLOW_REL]: sub('    env:\n      PLAYWRIGHT_BASE_URL', '    env:\n      TOKEN: ${{ secrets.TOKEN }}\n      PLAYWRIGHT_BASE_URL') }, 'FC-31', 'secrets.');
  assertRed({ [WORKFLOW_REL]: sub('run: npm ci', 'run: curl -H "Authorization: x" https://example.com') }, 'FC-31', 'Authorization');
});

test('FC-31 control: word-boundary safe - benign identifiers and comments are not flagged', () => {
  const benign = "const PASSWORDLESS_OK = 1;\nconst EMAILED = 2;\nconst storageStateless = 3;\n// ADMIN_PASSWORD, secrets.X and Authorization in a comment are documentation, not use\n";
  assert.deepEqual(errorsFor({ [SPEC_REL]: sub('const CITY = ', `${benign}const CITY = `) }), []);
  assert.deepEqual(errorsFor({ [WORKFLOW_REL]: sub('jobs:\n', '# secrets.NOT_USED and ADMIN_PASSWORD are mentioned only in this comment\njobs:\n') }), []);
});

test('FC-31 clean-tree negatives: the real files carry none of the forbidden tokens (patterns independent of the guard)', () => {
  const stripped = {
    [CONFIG_REL]: stripJsComments(REAL[CONFIG_REL]),
    [SPEC_REL]: stripJsComments(REAL[SPEC_REL]),
    [WORKFLOW_REL]: stripYamlComments(REAL[WORKFLOW_REL]),
  };
  const banned = [/_PASSWORD\b/, /_EMAIL\b/, /\bstorageState\b/, /SUPABASE/, /\bSERVICE_ROLE\b/, /\bANON_KEY\b/, /\bPUBLISHABLE_KEY\b/, /\bAuthorization\b/, /\bsecrets\./, /\bhasRealCredentials\b/, /\bcontinue-on-error\b/, /pull_request_target/, /\|\|\s*true/];
  for (const [rel, text] of Object.entries(stripped)) {
    for (const re of banned) assert.ok(!re.test(text), `${rel} matches ${re}`);
  }
  assert.ok(!/\bproceeding anyway\b/i.test(REAL[WORKFLOW_REL]));
});

// ---------------------------------------------------------------- FC-32 directory allowlist
test('FC-32 mutation: an extra file in e2e/deployed/ is detected, whatever its name', () => {
  for (const name of ['zz-extra.spec.ts', 'helpers.ts', 'notes.md', 'sub/other.reachability.ts']) {
    assertRed({}, 'FC-32', 'exactly', { [`${DEPLOYED_DIR_REL}/${name}`]: 'export {};\n' });
  }
});

test('FC-32 mutation: the spec missing, or imports beyond @playwright/test and builtins, are detected', () => {
  assertRed({ [SPEC_REL]: null }, 'FC-32', 'missing');
  for (const spec of ['../helpers', '../global-setup', '../canonical/helpers', '../../scripts/x', './local', 'axios']) {
    assertRed({ [SPEC_REL]: sub("import { test as base,", `import '${spec}';\nimport { test as base,`) }, 'FC-32', `import "${spec}"`);
  }
  assertRed({ [SPEC_REL]: sub("import { test as base,", "import { x } from '../global-setup';\nimport { test as base,") }, 'FC-32', '../global-setup');
  assertRed({ [SPEC_REL]: sub("function requireOrigin", "const lazy = () => import('../helpers');\nfunction requireOrigin") }, 'FC-32', '../helpers');
  // control: a node builtin import is allowed
  assert.deepEqual(hits(errorsFor({ [SPEC_REL]: sub('import { test as base,', "import path from 'node:path';\nimport { test as base,") }), 'FC-32'), []);
});

// ---------------------------------------------------------------- FC-33 workflow shape
test('FC-33 mutation: the workflow missing is detected', () => {
  assertRed({ [WORKFLOW_REL]: null }, 'FC-33', 'missing');
});

test('FC-33 mutation: each forbidden construct in the workflow is detected', () => {
  for (const [from, to, needle] of [
    ['run: npm ci', 'run: npm ci\n        env:\n          X: ${{ secrets.X }}', '`secrets.`'],
    ['run: npm ci', 'run: npm ci\n        continue-on-error: true', 'continue-on-error'],
    ['run: npm ci', 'run: npm ci || true', '`|| true`'],
    ['run: npm ci', 'run: npx playwright test --project=full', '`--project`'],
    ['run: npm ci', 'run: npm run test:e2e:full', 'test:e2e:full'],
    ['run: npm ci', 'run: npm test -- --pass-with-no-tests', '--pass-with-no-tests'],
    ['on:\n  push:', 'on:\n  pull_request_target:\n  push:', 'pull_request_target'],
    ['echo "Backend did not answer after 10 attempts."', 'echo "Backend not ready - proceeding anyway."', 'proceeding anyway'],
  ]) assertRed({ [WORKFLOW_REL]: sub(from, to) }, 'FC-33', needle);
});

test('FC-33 mutation: permissions must stay exactly contents: read', () => {
  assertRed({ [WORKFLOW_REL]: sub('permissions:\n  contents: read\n', 'permissions:\n  contents: write\n') }, 'FC-33', 'permissions');
  assertRed({ [WORKFLOW_REL]: sub('permissions:\n  contents: read\n', '') }, 'FC-33', 'permissions');
  assertRed({ [WORKFLOW_REL]: sub('permissions:\n  contents: read\n', 'permissions:\n  contents: read\n  pull-requests: write\n') }, 'FC-33', 'write permission');
});

test('FC-33 mutation: the test step must run exactly the deployed config', () => {
  assertRed({ [WORKFLOW_REL]: sub(`run: ${TEST_COMMAND}`, 'run: npx playwright test') }, 'FC-33', 'must run exactly');
  assertRed({ [WORKFLOW_REL]: sub(`run: ${TEST_COMMAND}`, `run: ${TEST_COMMAND} --grep R1`) }, 'FC-33', 'must run exactly');
  assertRed({ [WORKFLOW_REL]: sub(`run: ${TEST_COMMAND}`, 'run: npm run test:e2e:gate') }, 'FC-33', 'expected exactly 1 step running playwright test');
  assertRed({ [WORKFLOW_REL]: sub(`run: ${TEST_COMMAND}`, `run: ${TEST_COMMAND}\n\n      - name: Second run\n        run: npx playwright test --config=playwright.config.ts`) }, 'FC-33', 'expected exactly 1 step running playwright test');
});

test('FC-33 mutation: the secondary label must be on the workflow, job and test step names', () => {
  assertRed({ [WORKFLOW_REL]: sub('name: Post-Deploy Reachability (secondary — not the E2E gate)', 'name: Post-Deploy Reachability') }, 'FC-33', 'workflow name');
  assertRed({ [WORKFLOW_REL]: sub('name: Deployed-site reachability (secondary — not the E2E gate)', 'name: Deployed-site reachability') }, 'FC-33', 'job name');
  assertRed({ [WORKFLOW_REL]: sub('name: Run reachability check (secondary — not the E2E gate)', 'name: Run reachability check') }, 'FC-33', 'test step name');
});

const FE_LINE = "PLAYWRIGHT_BASE_URL: ${{ vars.DEPLOYED_BASE_URL || 'https://propertysignal.in' }}";
const BE_LINE = "BACKEND_BASE_URL: ${{ vars.DEPLOYED_BACKEND_URL || 'https://udupi-property-explorer.onrender.com' }}";

test('FC-33 mutation: both URLs must be a vars. expression with an https literal fallback (frontend default pinned)', () => {
  // frontend: the pinned default literal
  assertRed({ [WORKFLOW_REL]: sub(FE_LINE, "PLAYWRIGHT_BASE_URL: ${{ vars.DEPLOYED_BASE_URL || 'https://udupi-property-explorer.pages.dev' }}") }, 'FC-33', 'pages.dev must not be the frontend default');
  assertRed({ [WORKFLOW_REL]: sub(FE_LINE, "PLAYWRIGHT_BASE_URL: ${{ vars.DEPLOYED_BASE_URL || 'https://example.org' }}") }, 'FC-33', `fallback must be ${FRONTEND_DEFAULT}`);
  // a bare literal (no vars. override) is no longer the form
  assertRed({ [WORKFLOW_REL]: sub(FE_LINE, 'PLAYWRIGHT_BASE_URL: https://propertysignal.in') }, 'FC-33', 'PLAYWRIGHT_BASE_URL must be ${{ vars.NAME');
  assertRed({ [WORKFLOW_REL]: sub(BE_LINE, 'BACKEND_BASE_URL: https://udupi-property-explorer.onrender.com') }, 'FC-33', 'BACKEND_BASE_URL must be ${{ vars.NAME');
  // vars. without a fallback / with a non-https fallback
  assertRed({ [WORKFLOW_REL]: sub(FE_LINE, 'PLAYWRIGHT_BASE_URL: ${{ vars.DEPLOYED_BASE_URL }}') }, 'FC-33', 'without a quoted https:// literal fallback');
  assertRed({ [WORKFLOW_REL]: sub(BE_LINE, 'BACKEND_BASE_URL: ${{ vars.DEPLOYED_BACKEND_URL }}') }, 'FC-33', 'without a quoted https:// literal fallback');
  assertRed({ [WORKFLOW_REL]: sub(BE_LINE, "BACKEND_BASE_URL: ${{ vars.DEPLOYED_BACKEND_URL || 'http://udupi-property-explorer.onrender.com' }}") }, 'FC-33', 'BACKEND_BASE_URL fallback must be an https:// literal');
  assertRed({ [WORKFLOW_REL]: sub(FE_LINE, "PLAYWRIGHT_BASE_URL: ${{ vars.DEPLOYED_BASE_URL || 'propertysignal.in' }}") }, 'FC-33', 'fallback must be an https:// literal');
  assertRed({ [WORKFLOW_REL]: sub(BE_LINE, 'BACKEND_BASE_URL: ${{ vars.DEPLOYED_BACKEND_URL || vars.OTHER }}') }, 'FC-33', 'without a quoted https:// literal fallback');
  // secrets. instead of vars.
  assertRed({ [WORKFLOW_REL]: sub(FE_LINE, "PLAYWRIGHT_BASE_URL: ${{ secrets.DEPLOYED_BASE_URL || 'https://propertysignal.in' }}") }, 'FC-33', '`secrets.`');
  assertRed({ [WORKFLOW_REL]: sub(BE_LINE, "BACKEND_BASE_URL: ${{ secrets.DEPLOYED_BACKEND_URL || 'https://udupi-property-explorer.onrender.com' }}") }, 'FC-33', '`secrets.`');
  // missing
  assertRed({ [WORKFLOW_REL]: sub(`      ${BE_LINE}\n`, '') }, 'FC-33', 'BACKEND_BASE_URL must be defined exactly once in the workflow; found 0');
  assertRed({ [WORKFLOW_REL]: sub(`      ${FE_LINE}\n`, '') }, 'FC-33', 'PLAYWRIGHT_BASE_URL must be defined exactly once in the workflow; found 0');
  // Actions expressions use single-quoted literals only: a double-quoted fallback is not the form
  assertRed({ [WORKFLOW_REL]: sub(BE_LINE, 'BACKEND_BASE_URL: ${{ vars.DEPLOYED_BACKEND_URL || "https://udupi-property-explorer.onrender.com" }}') }, 'FC-33', 'without a quoted https:// literal fallback');
  // control: a different variable NAME and a trailing-slash fallback are fine
  assert.deepEqual(hits(errorsFor({ [WORKFLOW_REL]: sub(FE_LINE, "PLAYWRIGHT_BASE_URL: ${{ vars.SITE_URL || 'https://propertysignal.in/' }}") }), 'FC-33'), []);
});

test('FC-33 mutation: a step-level env override or a duplicate URL definition is detected; pages.dev in a COMMENT is not', () => {
  // step-level env on the test step overriding the frontend URL (the job-level definition alone would still look fine)
  assertRed({ [WORKFLOW_REL]: sub(`run: ${TEST_COMMAND}`, `env:\n          PLAYWRIGHT_BASE_URL: https://udupi-property-explorer.pages.dev\n        run: ${TEST_COMMAND}`) }, 'FC-33', 'PLAYWRIGHT_BASE_URL must be defined exactly once in the workflow; found 2');
  assertRed({ [WORKFLOW_REL]: sub(`run: ${TEST_COMMAND}`, `env:\n          PLAYWRIGHT_BASE_URL: https://udupi-property-explorer.pages.dev\n        run: ${TEST_COMMAND}`) }, 'FC-33', 'pages.dev host');
  // a duplicate backend definition
  assertRed({ [WORKFLOW_REL]: sub(BE_LINE, `${BE_LINE}\n      BACKEND_BASE_URL: \${{ vars.OTHER_URL || 'https://example.org' }}`) }, 'FC-33', 'BACKEND_BASE_URL must be defined exactly once in the workflow; found 2');
  // control: a pages.dev mention in a YAML comment stays green
  assert.deepEqual(hits(errorsFor({ [WORKFLOW_REL]: sub('jobs:\n', '# the old default was udupi-property-explorer.pages.dev\njobs:\n') }), 'FC-33'), []);
});

test('FC-33 mutation: actions/checkout must keep persist-credentials: false', () => {
  assertRed({ [WORKFLOW_REL]: sub('        with:\n          persist-credentials: false\n', '') }, 'FC-33', 'persist-credentials: false');
  assertRed({ [WORKFLOW_REL]: sub('persist-credentials: false', 'persist-credentials: true') }, 'FC-33', 'persist-credentials: false');
});

test('FC-33 mutation: ${{ }} inside a run: block is detected (and a ${{ }} outside run: is allowed)', () => {
  assertRed({ [WORKFLOW_REL]: sub('run: npm ci', 'run: echo ${{ vars.DEPLOYED_BASE_URL }}') }, 'FC-33', 'interpolates ${{ }} inside run:');
  assertRed({ [WORKFLOW_REL]: sub('curl -sf "$PLAYWRIGHT_BASE_URL/"', 'curl -sf "${{ env.PLAYWRIGHT_BASE_URL }}/"') }, 'FC-33', 'interpolates ${{ }} inside run:');
  assert.deepEqual(hits(errorsFor({}), 'FC-33'), []);
});

test('FC-33 clean-tree negatives: the real workflow has the vars form, persist-credentials: false, no secrets., no pages.dev, no ${{ in run:', () => {
  const text = stripYamlComments(REAL[WORKFLOW_REL]);
  assert.ok(text.includes(FE_LINE) && text.includes(BE_LINE));
  assert.ok(!/secrets\./.test(text) && !/pages\.dev/.test(text));
  assert.ok(/persist-credentials:\s*false/.test(text));
  for (const s of parseWorkflow(text).jobs[0].steps) assert.ok(!s.run.includes('${{'), s.name);
});

test('FC-29 mutation: the production frontend host as a literal in the config is detected (the default lives in the workflow only)', () => {
  assertRed({ [CONFIG_REL]: sub("const baseURL = requireHttpUrl('PLAYWRIGHT_BASE_URL');", "const baseURL = 'https://propertysignal.in';") }, 'FC-29', 'deployed-host literal');
  assertRed({ [CONFIG_REL]: sub("const baseURL = requireHttpUrl('PLAYWRIGHT_BASE_URL');", "const baseURL = 'https://udupi-property-explorer.onrender.com';") }, 'FC-29', 'deployed-host literal');
  assert.ok(!/propertysignal\.in|pages\.dev|onrender\.com/.test(stripJsComments(REAL[CONFIG_REL])));
});

test('FC-33 mutation: a wait loop that no longer ends in exit 1 is detected (fail-open polls)', () => {
  assertRed({ [WORKFLOW_REL]: sub('          echo "Backend did not answer after 10 attempts."\n          exit 1\n', '          echo "Backend did not answer after 10 attempts."\n') }, 'FC-33', 'does not end in `exit 1`');
  assertRed({ [WORKFLOW_REL]: sub('          echo "Frontend did not answer after 10 attempts."\n          exit 1\n', '          echo "Frontend did not answer after 10 attempts."\n          exit 0\n') }, 'FC-33', 'does not end in `exit 1`');
});

// ---------------------------------------------------------------- FC-34 legacy smoke gone
test('FC-34 mutation: a smoke or udupi-canonical-smoke project in playwright.config.ts is detected', () => {
  for (const name of ['smoke', 'udupi-canonical-smoke']) {
    assertRed({ [PW_CONFIG_REL]: sub('projects: [\n', `projects: [\n    { name: '${name}', use: { browserName: 'chromium' }, testMatch: ['**/x.spec.ts'] },\n`) }, 'FC-34', `retired Playwright project "${name}"`);
  }
  // control: a retired name in a COMMENT or a different project name is fine
  assert.deepEqual(hits(errorsFor({ [PW_CONFIG_REL]: sub('projects: [\n', "projects: [\n    // name: 'smoke' was retired\n") }), 'FC-34'), []);
});

test('FC-34 mutation: the playwright-pr job or a --project=smoke run in ci.yml is detected', () => {
  assertRed({ [CI_REL]: sub('jobs:\n', 'jobs:\n  playwright-pr:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo x\n') }, 'FC-34', 'playwright-pr job is back');
  assertRed({ [CI_REL]: sub('jobs:\n', 'jobs:\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx playwright test --project=smoke\n') }, 'FC-34', '--project=smoke');
  // control: the words in a comment do not trip it
  assert.deepEqual(hits(errorsFor({ [CI_REL]: sub('jobs:\n', '# playwright-pr: and --project=smoke were removed\njobs:\n') }), 'FC-34'), []);
});

test('FC-34 mutation: the test:e2e:smoke script or a --project=smoke script in package.json is detected', () => {
  assertRed({ [PACKAGE_REL]: sub('"test:e2e:journey"', '"test:e2e:smoke": "playwright test --project=smoke",\n    "test:e2e:journey"') }, 'FC-34', 'test:e2e:smoke script is back');
  assertRed({ [PACKAGE_REL]: sub('"test:e2e:journey"', '"x": "playwright test --project=smoke",\n    "test:e2e:journey"') }, 'FC-34', '--project=smoke');
});

test('FC-34 mutation: SMOKE_SPEC_BASENAMES or the smoke coverage classifier in pre-push-classify.sh is detected', () => {
  assertRed({ [CLASSIFY_REL]: sub('PRE_PUSH_DOC_PATTERN=', 'SMOKE_SPEC_BASENAMES=(\n  "x.spec.ts"\n)\nPRE_PUSH_DOC_PATTERN=') }, 'FC-34', 'SMOKE_SPEC_BASENAMES is back');
  assertRed({ [CLASSIFY_REL]: (t) => `${t}\nclassify_e2e_coverage() { :; }\n` }, 'FC-34', 'smoke coverage classifier is back');
  assertRed({ [CLASSIFY_REL]: (t) => `${t}\n_is_smoke_spec_basename() { :; }\n` }, 'FC-34', 'smoke coverage classifier is back');
});

test('FC-34 mutation: run-e2e-local.sh defaulting to smoke, or no longer refusing without --project, is detected', () => {
  assertRed({ [RUN_LOCAL_REL]: (t) => `${t}\nnpx playwright test "$@" --project=smoke\n` }, 'FC-34', 'retired --project=smoke');
  assertRed({ [RUN_LOCAL_REL]: sub('  exit 2\n', '  :\n') }, 'FC-34', 'must refuse (exit 2)');
});

test('FC-34 mutation: any of the 8 PR-2 specs named by a config is detected', () => {
  for (const base of [...PR2_DELETED_SPECS, ...PR2_HELD_SPECS]) {
    assertRed({ [PW_CONFIG_REL]: sub('projects: [\n', `projects: [\n    { name: 'journey2', testMatch: ['**/${base}'] },\n`) }, 'FC-34', `references the PR-2 spec ${base}`);
  }
  assertRed({ [CI_REL]: sub('jobs:\n', 'jobs:\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx playwright test e2e/quick-smoke.spec.ts\n') }, 'FC-34', 'quick-smoke.spec.ts');
});

test('FC-34 mutation: re-adding any deleted spec or support file to disk is detected; the two D3-held specs are still allowed', () => {
  for (const base of PR2_DELETED_SPECS) assertRed({}, 'FC-34', `e2e/${base} exists`, { [`e2e/${base}`]: 'export {};\n' });
  for (const rel of PR2_DELETED_SUPPORT_FILES) assertRed({}, 'FC-34', `${rel} exists`, { [rel]: 'x\n' });
  for (const base of PR2_HELD_SPECS) assert.deepEqual(hits(errorsFor({}, { [`e2e/${base}`]: 'export {};\n' }), 'FC-34'), []);
});

test('FC-34 clean-tree negatives: the real tree has none of the retired smoke surface (patterns independent of the guard)', () => {
  const pw = stripJsComments(REAL[PW_CONFIG_REL]);
  assert.ok(!/name:\s*['"](?:udupi-canonical-)?smoke['"]/.test(pw));
  assert.ok(!/playwright-pr/.test(stripYamlComments(REAL[CI_REL])));
  assert.ok(!/project[= ]smoke/.test(REAL[CI_REL] + REAL[PACKAGE_REL] + stripShellComments(REAL[RUN_LOCAL_REL])));
  assert.ok(!/test:e2e:smoke/.test(REAL[PACKAGE_REL]));
  assert.ok(!/SMOKE_SPEC_BASENAMES|classify_e2e_coverage/.test(stripShellComments(REAL[CLASSIFY_REL])));
  for (const base of PR2_DELETED_SPECS) assert.ok(!fs.existsSync(path.join(ROOT, 'e2e', base)), base);
  for (const rel of PR2_DELETED_SUPPORT_FILES) assert.ok(!fs.existsSync(path.join(ROOT, rel)), rel);
  // the live package.json parses and still exposes the other legacy scripts
  const scripts = JSON.parse(REAL[PACKAGE_REL]).scripts;
  assert.ok(!('test:e2e:smoke' in scripts) && 'test:e2e:gate' in scripts);
});

test('FC-34 live: run-e2e-local.sh with no --project refuses with exit 2 before starting anything', () => {
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-shim-'));
  const calls = path.join(shim, 'calls');
  fs.writeFileSync(path.join(shim, 'docker'), `#!/usr/bin/env bash\necho "$*" >> "${calls}"\nexit 0\n`, { mode: 0o755 });
  try {
    for (const args of [[], ['e2e/some.spec.ts']]) {
      const r = spawnSync('bash', [path.join(ROOT, RUN_LOCAL_REL), ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${shim}:${process.env.PATH}` } });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /smoke project was retired \(#2750 PR-2\)/);
      assert.match(r.stderr, /--project=full\|journey\|integration-ui/);
      assert.match(r.stderr, /npm run test:e2e:gate/);
      assert.ok(!fs.existsSync(calls), 'docker must not be called');
    }
  } finally { clean(shim); }
});

// ---------------------------------------------------------------- FC-36 fixture profile retired
test('FC-36 mutation: the restore script missing, or its profile check removed, is detected', () => {
  assertRed({ [RESTORE_REL]: null }, 'FC-36', 'missing');
  assertRed({ [RESTORE_REL]: sub('case "${E2E_FIXTURE_PROFILE}" in', 'case "${OTHER_VAR}" in') }, 'FC-36', 'no `case');
});

test('FC-36 mutation: accepting the udupi-canonical profile (or any named profile) is detected', () => {
  assertRed({ [RESTORE_REL]: sub('  "") ;;', '  ""|udupi-canonical) ;;') }, 'FC-36', 'udupi-canonical');
  assertRed({ [RESTORE_REL]: sub('  "") ;;', '  ""|other-profile) ;;') }, 'FC-36', 'exactly the arms');
});

test('FC-36 mutation: a non-empty profile that no longer exits 1 is detected', () => {
  assertRed({ [RESTORE_REL]: sub('Unset it." >&2\n    exit 1', 'Unset it." >&2\n    :') }, 'FC-36', 'must exit 1');
});

test('FC-36 mutation: a docker / psql call before the profile check is detected (fail closed BEFORE any container work)', () => {
  assertRed({ [RESTORE_REL]: sub('E2E_FIXTURE_PROFILE="${E2E_FIXTURE_PROFILE:-}"\n', 'docker info >/dev/null\nE2E_FIXTURE_PROFILE="${E2E_FIXTURE_PROFILE:-}"\n') }, 'FC-36', 'precedes the profile check');
  assertRed({ [RESTORE_REL]: sub('E2E_FIXTURE_PROFILE="${E2E_FIXTURE_PROFILE:-}"\n', 'psql -c x\nE2E_FIXTURE_PROFILE="${E2E_FIXTURE_PROFILE:-}"\n') }, 'FC-36', 'precedes the profile check');
  // control: docker mentioned only in a comment before the check is fine
  assert.deepEqual(hits(errorsFor({ [RESTORE_REL]: sub('E2E_FIXTURE_PROFILE="${E2E_FIXTURE_PROFILE:-}"\n', '# docker and psql run later\nE2E_FIXTURE_PROFILE="${E2E_FIXTURE_PROFILE:-}"\n') }), 'FC-36'), []);
});

test('FC-36 mutation: the retired seed variable coming back, or the default Udupi seed being over-deleted, is detected', () => {
  assertRed({ [RESTORE_REL]: (t) => `${t}\nUDUPI_CANONICAL_SEED_FILE=x\n` }, 'FC-36', 'udupi-canonical');
  assertRed({ [RESTORE_REL]: sub('NAV_2581_UDUPI_SEED_FILE=', 'NAV_RENAMED_SEED_FILE=') }, 'FC-36', 'must be kept');
});

test('FC-36 clean-tree negatives: the real script has no udupi-canonical surface and keeps the default seed', () => {
  const code = stripShellComments(REAL[RESTORE_REL]);
  assert.ok(!/udupi-canonical|UDUPI_CANONICAL/i.test(code));
  assert.ok(/NAV_2581_UDUPI_SEED_FILE=/.test(code));
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts/db/fixtures/udupi-canonical-smoke-fixture-seed.sql')));
});

test('FC-36 live: a non-empty E2E_FIXTURE_PROFILE exits 1 with the retirement message and never reaches docker', () => {
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-shim-'));
  const calls = path.join(shim, 'calls');
  fs.writeFileSync(path.join(shim, 'docker'), `#!/usr/bin/env bash\necho "$*" >> "${calls}"\nexit 0\n`, { mode: 0o755 });
  try {
    for (const profile of ['udupi-canonical', 'bogus', ' ']) {
      const r = spawnSync('bash', [path.join(ROOT, RESTORE_REL)], { encoding: 'utf8', env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, E2E_FIXTURE_PROFILE: profile } });
      assert.equal(r.status, 1, `profile "${profile}": ${r.stderr}`);
      assert.match(r.stderr, /fixture profiles were retired \(#2750 PR-2\)/);
      assert.ok(!fs.existsSync(calls), `docker must not be called for profile "${profile}"`);
    }
  } finally { clean(shim); }
});

// ---------------------------------------------------------------- FC-37 the single allowlisted abort
const CALL_SITE = "if (!url.includes(AUTH_PATH) && isAllowlistedChallengeAbort(method, url, FRONTEND)) {\n          rec.allowlistedAborts.push(`${method} ${url}`);\n          await route.abort('blockedbyclient');\n          return;\n        }";
const PREFIX_LINE = "const CHALLENGE_PREFIX = '/cdn-cgi/challenge-platform/';";
const METHOD_LINE = "const ALLOWLISTED_METHOD = 'POST'; // ALLOWLIST_METHOD";
const FN_COND = "return u.origin === frontend && u.pathname.startsWith(CHALLENGE_PREFIX);";

test('FC-37 control: the real spec passes with exactly one allowlist entry, POST-only, parsed-origin equality and an unconditional abort', () => {
  assert.deepEqual(hits(errorsFor({}), 'FC-37'), []);
  const code = stripJsComments(REAL[SPEC_REL]);
  assert.equal((code.match(/cdn-cgi/g) ?? []).length, 1);
  assert.ok(code.includes(CALL_SITE) && code.includes(PREFIX_LINE) && REAL[SPEC_REL].includes(METHOD_LINE) && code.includes(FN_COND));
});

test('FC-37 mutation: a second allowlist entry or a broader prefix is detected', () => {
  assertRed({ [SPEC_REL]: sub(PREFIX_LINE, `${PREFIX_LINE}\nconst SECOND_PREFIX = '/cdn-cgi/rum/';`) }, 'FC-37', 'cdn-cgi path');
  assertRed({ [SPEC_REL]: sub(FN_COND, "return u.origin === frontend && (u.pathname.startsWith(CHALLENGE_PREFIX) || u.pathname.startsWith('/other/'));") }, 'FC-37', 'pinned POST-only');
  assertRed({ [SPEC_REL]: sub("'/cdn-cgi/challenge-platform/'", "'/cdn-cgi/'") }, 'FC-37', 'exactly one `const CHALLENGE_PREFIX');
  assertRed({ [SPEC_REL]: sub("'/cdn-cgi/challenge-platform/'", "'/cdn-cgi/challenge-platform'") }, 'FC-37', 'exactly one `const CHALLENGE_PREFIX');
  assertRed({ [SPEC_REL]: sub("'/cdn-cgi/challenge-platform/'", "'/'") }, 'FC-37', 'exactly one `const CHALLENGE_PREFIX');
  assertRed({ [SPEC_REL]: sub(PREFIX_LINE, "const CHALLENGE_PREFIX = '/cdn-cgi/challenge-platform/';\nconst CHALLENGE_PREFIX_2 = '/cdn-cgi/challenge-platform/';") }, 'FC-37', 'cdn-cgi path');
});

test('FC-37 mutation: a wildcard host, a removed origin check or a substring/endsWith/includes origin compare is detected', () => {
  for (const cond of [
    'return u.pathname.startsWith(CHALLENGE_PREFIX);',
    'return true && u.pathname.startsWith(CHALLENGE_PREFIX);',
    'return u.host.endsWith(frontend) && u.pathname.startsWith(CHALLENGE_PREFIX);',
    'return url.includes(frontend) && u.pathname.startsWith(CHALLENGE_PREFIX);',
    'return url.startsWith(frontend) && u.pathname.startsWith(CHALLENGE_PREFIX);',
    'return u.origin.endsWith(frontend) && u.pathname.startsWith(CHALLENGE_PREFIX);',
    'return u.hostname.endsWith(".propertysignal.in") && u.pathname.startsWith(CHALLENGE_PREFIX);',
    'return u.origin === frontend && url.includes(CHALLENGE_PREFIX);',
    'return u.origin === frontend && u.pathname.includes(CHALLENGE_PREFIX);',
    'return u.origin === frontend && u.search.startsWith(CHALLENGE_PREFIX);',
    'return u.origin === frontend;',
  ]) assertRed({ [SPEC_REL]: sub(FN_COND, cond) }, 'FC-37', 'pinned POST-only');
});

test('FC-37 mutation: dropping or widening the POST condition is detected', () => {
  assertRed({ [SPEC_REL]: sub('  if (method !== ALLOWLISTED_METHOD) return false;\n', '') }, 'FC-37', 'pinned POST-only');
  assertRed({ [SPEC_REL]: sub('if (method !== ALLOWLISTED_METHOD) return false;', "if (method === 'GET') return false;") }, 'FC-37', 'pinned POST-only');
  assertRed({ [SPEC_REL]: sub(METHOD_LINE, "const ALLOWLISTED_METHOD = 'PUT'; // ALLOWLIST_METHOD") }, 'FC-37', "POST-only");
  assertRed({ [SPEC_REL]: sub(METHOD_LINE, "const ALLOWLISTED_METHOD = 'DELETE'; // ALLOWLIST_METHOD") }, 'FC-37', "POST-only");
  assertRed({ [SPEC_REL]: sub('if (method !== ALLOWLISTED_METHOD) return false;', 'if (!SAFE_METHODS.has(method) && false) return false;') }, 'FC-37', 'pinned POST-only');
  // the marker is not a licence for a second write-method literal
  assertRed({ [SPEC_REL]: sub(METHOD_LINE, `${METHOD_LINE}\nconst EXTRA_METHOD = 'PUT'; // ALLOWLIST_METHOD`) }, 'FC-30', 'exactly 1 ALLOWLIST_METHOD');
  assertRed({ [SPEC_REL]: sub(METHOD_LINE, "const ALLOWLISTED_METHOD = 'POST';") }, 'FC-30', 'outside the single GUARD_PROBE line');
});

test('FC-37 mutation: the allowlist branch continuing, fulfilling, becoming conditional or dropping the abort is detected', () => {
  assertRed({ [SPEC_REL]: sub(CALL_SITE, CALL_SITE.replace("await route.abort('blockedbyclient');", 'await route.continue();')) }, 'FC-37', 'unconditional abort');
  assertRed({ [SPEC_REL]: sub(CALL_SITE, CALL_SITE.replace("await route.abort('blockedbyclient');", "await route.fulfill({ status: 204 });")) }, 'FC-37', 'unconditional abort');
  assertRed({ [SPEC_REL]: sub(CALL_SITE, CALL_SITE.replace("await route.abort('blockedbyclient');", "if (process.env.X) await route.abort('blockedbyclient');")) }, 'FC-37', 'unconditional abort');
  assertRed({ [SPEC_REL]: sub(CALL_SITE, CALL_SITE.replace("await route.abort('blockedbyclient');\n          return;", "await route.abort('blockedbyclient');")) }, 'FC-37', 'unconditional abort');
  assertRed({ [SPEC_REL]: sub(CALL_SITE, CALL_SITE.replace("          await route.abort('blockedbyclient');\n", '')) }, 'FC-37', 'unconditional abort');
  assertRed({ [SPEC_REL]: sub(CALL_SITE, CALL_SITE.replace('!url.includes(AUTH_PATH) && ', '')) }, 'FC-37', 'hosted-auth still excluded');
  assertRed({ [SPEC_REL]: sub(CALL_SITE, CALL_SITE.replace('isAllowlistedChallengeAbort(method, url, FRONTEND)', 'isAllowlistedChallengeAbort(method, url, BACKEND)')) }, 'FC-37', 'unconditional abort');
  assertRed({ [SPEC_REL]: sub(CALL_SITE, `if (Math.random() > 2) ${CALL_SITE}`) }, 'FC-37', 'unconditional abort');
  // a second call site (a second way to reach the allowlist)
  assertRed({ [SPEC_REL]: sub('const reasons: string[] = [];', 'const again = isAllowlistedChallengeAbort(method, url, BACKEND);\n        const reasons: string[] = [];') }, 'FC-37', 'called exactly once');
});

test('FC-37 mutation: routing the allowlisted record into a failing list, asserting on it, or dropping the annotation is detected', () => {
  assertRed({ [SPEC_REL]: sub('rec.allowlistedAborts.push(`${method} ${url}`);', 'rec.blocked.push(`${method} ${url}`);') }, 'FC-37', 'unconditional abort');
  assertRed({ [SPEC_REL]: sub(CALL_SITE, CALL_SITE.replace('rec.allowlistedAborts.push(`${method} ${url}`);', 'rec.allowlistedAborts.push(`${method} ${url}`);\n          rec.blocked.push(`${method} ${url}`);')) }, 'FC-37', 'unconditional abort');
  assertRed({ [SPEC_REL]: sub("  expect(rec.backend5xx,", "  expect(rec.allowlistedAborts, 'x').toEqual([]);\n  expect(rec.backend5xx,") }, 'FC-37', 'never be asserted');
  assertRed({ [SPEC_REL]: sub("  expect(rec.backend5xx,", "  rec.blocked.push(...rec.allowlistedAborts);\n  expect(rec.backend5xx,") }, 'FC-37', 'exactly 5 times');
  assertRed({ [SPEC_REL]: sub("type: 'aborted-allowlisted'", "type: 'something-else'") }, 'FC-37', "'aborted-allowlisted'");
});

// The decision function is pure: pull its source out of the spec text, transpile the type annotations away with the repo's
// TypeScript, and run it under node --test. The spec itself is never imported (it throws at load without the env URLs).
const require_ = createRequire(path.join(ROOT, 'package.json'));
function loadDecision(specText) {
  const code = stripJsComments(specText);
  const prefix = code.match(/const CHALLENGE_PREFIX = [^\n]+/)[0];
  const method = code.match(/const ALLOWLISTED_METHOD = [^\n]+/)[0];
  const at = code.search(/function isAllowlistedChallengeAbort\(/);
  const fn = code.slice(at, code.indexOf('\n}\n', at) + 3);
  const ts = require_('typescript');
  const js = ts.transpileModule(`${prefix}\n${method}\n${fn}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(`${js}\nreturn isAllowlistedChallengeAbort;`)();
}
const decide = loadDecision(REAL[SPEC_REL]);
const FE = 'https://propertysignal.in';
const CF = '/cdn-cgi/challenge-platform/h/g/jsd/oneshot/abc123';

test('FC-37 decision: the observed production request (POST, same origin, challenge-platform path) is allowlisted, with a query or a hash', () => {
  assert.equal(decide('POST', `${FE}${CF}`, FE), true);
  assert.equal(decide('POST', `${FE}${CF}?x=1`, FE), true);
  assert.equal(decide('POST', `${FE}${CF}#frag`, FE), true);
  assert.equal(decide('POST', `${FE}/cdn-cgi/challenge-platform/`, FE), true);
  // an explicit default port parses to the same origin (this IS the same origin, not a look-alike)
  assert.equal(decide('POST', `https://propertysignal.in:443${CF}`, FE), true);
  assert.equal(decide('POST', 'http://127.0.0.1:5376/cdn-cgi/challenge-platform/h/g/jsd/oneshot/test', 'http://127.0.0.1:5376'), true);
});

test('FC-37 decision: path look-alikes on the same origin are NOT allowlisted (they stay failures)', () => {
  for (const p of [
    '/cdn-cgi/challenge-platform-x/', '/cdn-cgi/challenge-platform-x/h/g', '/x/cdn-cgi/challenge-platform/', '/cdn-cgi/challenge-platformX',
    '/cdn-cgi/challenge-platform', '/cdn-cgi/', '/cdn-cgi/rum', '/', '/api/x',
    '/CDN-CGI/challenge-platform/', '/cdn-cgi/CHALLENGE-PLATFORM/', // pathname is case-sensitive; the parser does not lower-case it
    '/cdn-cgi/%63hallenge-platform/x', // percent-encoded letter is not decoded in pathname
    '/cdn-cgi/challenge-platform/../x', '/cdn-cgi/challenge-platform/%2e%2e/x', // dot segments normalise to /cdn-cgi/x
    '//cdn-cgi/challenge-platform/x',
  ]) assert.equal(decide('POST', `${FE}${p}`, FE), false, p);
  // the path only inside the query string or the hash
  assert.equal(decide('POST', `${FE}/?p=/cdn-cgi/challenge-platform/`, FE), false);
  assert.equal(decide('POST', `${FE}/api/x?next=/cdn-cgi/challenge-platform/y`, FE), false);
  assert.equal(decide('POST', `${FE}/#/cdn-cgi/challenge-platform/`, FE), false);
});

test('FC-37 decision: origin look-alikes (subdomain, scheme, port, suffix host, userinfo, foreign) are NOT allowlisted', () => {
  for (const u of [
    `https://sub.propertysignal.in${CF}`, `https://www.propertysignal.in${CF}`, `http://propertysignal.in${CF}`,
    `https://propertysignal.in:8443${CF}`, `https://propertysignal.in.evil.example${CF}`, `https://evilpropertysignal.in${CF}`,
    `https://propertysignal.in@evil.example${CF}`, `https://evil.example${CF}`, `https://evil.example/@propertysignal.in${CF}`,
    `https://evil.example/?u=${FE}${CF}`, `https://guard-probe.invalid${CF}`,
  ]) assert.equal(decide('POST', u, FE), false, u);
  // loopback shape used by the dry run
  assert.equal(decide('POST', `http://127.0.0.2:5376${CF}`, 'http://127.0.0.1:5376'), false);
  assert.equal(decide('POST', `http://127.0.0.1:5377${CF}`, 'http://127.0.0.1:5376'), false);
  assert.equal(decide('POST', `https://127.0.0.1:5376${CF}`, 'http://127.0.0.1:5376'), false);
});

test('FC-37 decision: POST-only. PUT, DELETE, PATCH to the allowlisted path stay failures; a GET is not an allowlisted abort (it is an ordinary same-origin read)', () => {
  for (const m of ['PUT', 'DELETE', 'PATCH', 'GET', 'HEAD', 'OPTIONS', 'post', 'Post', 'TRACE', '']) assert.equal(decide(m, `${FE}${CF}`, FE), false, m);
});

test('FC-37 decision: an unparsable URL is not allowlisted (fails closed), and the origin must be passed in', () => {
  for (const u of ['not a url', '', '/cdn-cgi/challenge-platform/x', 'javascript:alert(1)']) assert.equal(decide('POST', u, FE), false, u);
  assert.equal(decide('POST', `${FE}${CF}`, ''), false);
});

// ---------------------------------------------------------------- CLI
test('CLI: exits 0 on the real tree and 1 with a FAIL line on a mutated copy; 2 on bad usage', () => {
  const ok = spawnSync(process.execPath, [GUARD, '--root', ROOT], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /DEPLOYED REACHABILITY GUARD: PASS/);
  const root = world({ [CONFIG_REL]: sub('retries: 0', 'retries: 3') });
  try {
    const bad = spawnSync(process.execPath, [GUARD, '--root', root], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /FAIL\[FC-29\].*retries must be 0/);
  } finally { clean(root); }
  assert.equal(spawnSync(process.execPath, [GUARD, '--nope'], { encoding: 'utf8' }).status, 2);
});

test('the guard never imports or executes the Playwright config (N-F): it only reads text', () => {
  const src = fs.readFileSync(GUARD, 'utf8');
  const code = stripJsComments(src);
  assert.ok(!/\bimport\s*\(/.test(code) && !/\brequire\s*\(/.test(code));
  assert.ok(!/from\s+['"][^'"]*playwright[^'"]*['"]/.test(code));
});
