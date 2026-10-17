// node --test scripts/e2e/specialist-suite.test.mjs  (issue #2750 S0: specialist suite mechanism)
//
// Covers scripts/e2e/specialist-suite.mjs: the loopback/target check, the request classifier and host tables, the
// --phase=list / --phase=results / --phase=isolation checks. The isolation test runs the REAL playwright --list against
// the legacy and canonical configs: ci.yml's "E2E guard unit tests" step runs after `npm ci`
// (.github/workflows/ci.yml, job `frontend`: Install dependencies -> ... -> `node --test scripts/e2e/*.test.mjs`), so
// node_modules/@playwright/test is present there and no conditional skip is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_EXTERNAL,
  assertSpecialistTarget,
  checkIsolation,
  checkListPhase,
  checkResultsDoc,
  classifyRequestUrl,
  collectedFilesFromList,
  DEFAULT_ROOT,
  DENY,
  findForbiddenHostLiterals,
  isLoopbackHostname,
  legacyConfigIgnoresSpecialist,
  MANIFEST_REL,
  RESERVED_TEST_TLDS,
  retainSpecialistFiles,
  specialistPathsInListJson,
  stripCommentsStrict,
} from './specialist-suite.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'specialist-suite.mjs');
const OK_ENV = { PLAYWRIGHT_BASE_URL: 'http://localhost:5380', BACKEND_BASE_URL: 'http://127.0.0.1:8380' };
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'specialist-suite-'));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });

// ---- target check ----------------------------------------------------------------------------------------------
test('target: both URLs are REQUIRED with no default; the error names the variable', () => {
  assert.throws(() => assertSpecialistTarget({ BACKEND_BASE_URL: OK_ENV.BACKEND_BASE_URL }), /PLAYWRIGHT_BASE_URL is not set/);
  assert.throws(() => assertSpecialistTarget({ PLAYWRIGHT_BASE_URL: OK_ENV.PLAYWRIGHT_BASE_URL }), /BACKEND_BASE_URL is not set/);
  assert.throws(() => assertSpecialistTarget({}), /PLAYWRIGHT_BASE_URL is not set/);
  assert.throws(() => assertSpecialistTarget({ ...OK_ENV, PLAYWRIGHT_BASE_URL: '' }), /PLAYWRIGHT_BASE_URL is not set/);
});

test('target: production / shared / hosted hosts are refused by variable AND host, with the deny label', () => {
  for (const bad of ['https://udupi-property-explorer.pages.dev', 'https://udupi-api.onrender.com', 'https://abcd.supabase.co', 'https://www.propertysignal.in', 'https://propertysignal.in/x']) {
    for (const name of ['PLAYWRIGHT_BASE_URL', 'BACKEND_BASE_URL']) {
      const host = new URL(bad).hostname;
      assert.throws(
        () => assertSpecialistTarget({ ...OK_ENV, [name]: bad }),
        (e) => e.message.includes(name) && e.message.includes(host) && /production\/shared\/hosted target/.test(e.message),
        `${name}=${bad}`,
      );
    }
  }
});

test('target: any non-loopback host, 0.0.0.0, suffix and userinfo tricks are refused', () => {
  for (const bad of ['https://example.com', 'http://0.0.0.0:5380', 'http://localhost.evil.com:5380', 'http://127.0.0.1.evil.com', 'http://localhost@evil.com/',
    'http://127.0.0.256:5380', 'http://10.0.0.1:5380', 'http://192.168.1.5', 'http://[::2]:5380', 'http://evil.com/#localhost']) {
    assert.throws(() => assertSpecialistTarget({ ...OK_ENV, PLAYWRIGHT_BASE_URL: bad }), /PLAYWRIGHT_BASE_URL/, bad);
    assert.throws(() => assertSpecialistTarget({ ...OK_ENV, BACKEND_BASE_URL: bad }), /BACKEND_BASE_URL/, bad);
  }
  assert.throws(() => assertSpecialistTarget({ ...OK_ENV, PLAYWRIGHT_BASE_URL: 'not a url' }), /not a parseable URL/);
  assert.throws(() => assertSpecialistTarget({ ...OK_ENV, PLAYWRIGHT_BASE_URL: 'ftp://localhost:21' }), /http\(s\)/);
});

test('target: VITE_SUPABASE_URL must be loopback WHEN SET; unset or empty is fine', () => {
  assert.throws(() => assertSpecialistTarget({ ...OK_ENV, VITE_SUPABASE_URL: 'https://abcd.supabase.co' }), (e) => /VITE_SUPABASE_URL/.test(e.message) && /abcd\.supabase\.co/.test(e.message));
  assert.throws(() => assertSpecialistTarget({ ...OK_ENV, VITE_SUPABASE_URL: 'https://example.org' }), /VITE_SUPABASE_URL/);
  assert.doesNotThrow(() => assertSpecialistTarget({ ...OK_ENV, VITE_SUPABASE_URL: 'http://localhost:9380' }));
  assert.doesNotThrow(() => assertSpecialistTarget({ ...OK_ENV }));
  assert.doesNotThrow(() => assertSpecialistTarget({ ...OK_ENV, VITE_SUPABASE_URL: '' }));
});

test('target: localhost, 127.0.0.1 and [::1] are accepted and the validated origins/port come back', () => {
  for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '[::1]']) {
    const r = assertSpecialistTarget({ PLAYWRIGHT_BASE_URL: `http://${host}:5380`, BACKEND_BASE_URL: `http://${host}:8380/ignored/path` });
    assert.equal(r.previewPort, '5380');
    assert.equal(r.backendUrl, `http://${host === '127.1.2.3' ? '127.1.2.3' : host}:8380`);
  }
});

test('isLoopbackHostname is an EXACT match (no suffix or substring)', () => {
  for (const ok of ['localhost', 'LOCALHOST', '127.0.0.1', '127.255.255.255', '[::1]', '::1']) assert.equal(isLoopbackHostname(ok), true, ok);
  for (const bad of ['0.0.0.0', 'localhost.', 'xlocalhost', 'localhost.evil.com', '127.0.0.1.evil.com', '127.0.0.256', '128.0.0.1', '', 'evil.com']) assert.equal(isLoopbackHostname(bad), false, bad);
});

// ---- host tables + classifier ---------------------------------------------------------------------------------------
test('host tables: every allowed external host cites a file:line source; DENY wins and is never allow-listed; reserved TLDs are the three RFC ones', () => {
  assert.ok(ALLOWED_EXTERNAL.length >= 3);
  for (const a of ALLOWED_EXTERNAL) {
    assert.match(a.source, /^apps\/web\/.+:\d+(-\d+)?$/, a.host);
    assert.ok(fs.existsSync(path.join(DEFAULT_ROOT, a.source.replace(/:\d+(-\d+)?$/, ''))), `${a.source} exists`);
    for (const d of DENY) assert.ok(!(a.host === d.suffix || a.host.endsWith(`.${d.suffix}`)), `${a.host} must not be deny-listed`);
  }
  assert.deepEqual(ALLOWED_EXTERNAL.map((a) => a.host).sort(), ['fonts.googleapis.com', 'fonts.gstatic.com', 'tile.openstreetmap.org']);
  assert.deepEqual([...RESERVED_TEST_TLDS].sort(), ['example', 'invalid', 'test']);
  assert.deepEqual(DENY.map((d) => d.label).sort(), ['*.onrender.com', '*.pages.dev', '*.supabase.co', 'propertysignal.in']);
});

test('classifier: loopback, OSM tiles and Google Fonts are allowed', () => {
  for (const u of ['http://localhost:5380/a', 'http://127.0.0.1:8380/api/x?y=1', 'http://[::1]:5380/', 'ws://localhost:5380/ws',
    'https://a.tile.openstreetmap.org/12/3/4.png', 'https://c.tile.openstreetmap.org/1/1/1.png', 'https://fonts.googleapis.com/css2?family=Fraunces', 'https://fonts.gstatic.com/s/x.woff2']) {
    assert.equal(classifyRequestUrl(u).action, 'allow', u);
  }
});

test('classifier: production/shared hosts are blocked WITH a deny label, and deny wins', () => {
  for (const [u, label] of [['https://udupi-property-explorer.pages.dev/', '*.pages.dev'], ['https://api.onrender.com/x', '*.onrender.com'], ['https://abcd.supabase.co/rest/v1/', '*.supabase.co'],
    ['https://propertysignal.in/', 'propertysignal.in'], ['https://app.propertysignal.in/x', 'propertysignal.in'], ['https://a.tile.openstreetmap.org.pages.dev/', '*.pages.dev']]) {
    const c = classifyRequestUrl(u);
    assert.equal(c.action, 'block', u);
    assert.ok(c.label.includes(label), `${u}: ${c.label}`);
  }
});

test('classifier: other external hosts, suffix/userinfo tricks, odd schemes and garbage are blocked', () => {
  for (const u of ['https://example.com/', 'https://www.google-analytics.com/collect', 'https://tile.openstreetmap.org.evil.com/1.png', 'https://eviltile.openstreetmap.org/1.png',
    'https://tile.openstreetmap.org/1.png', 'https://fonts.googleapis.com.evil.com/css', 'http://fonts.googleapis.com@evil.com/', 'https://evil.com/fonts.gstatic.com',
    'http://localhost.evil.com/', 'http://0.0.0.0:5380/', 'file:///etc/passwd', 'chrome-extension://abc/x.js', 'not a url', '']) {
    assert.equal(classifyRequestUrl(u).action, 'block', u);
  }
});

test('classifier: data:, blob: and about: are ignored (never flagged)', () => {
  for (const u of ['data:image/png;base64,AAAA', 'blob:http://localhost:5380/uuid', 'about:blank']) {
    assert.equal(classifyRequestUrl(u).action, 'ignore', u);
  }
});

test('classifier (CX5): reserved test TLDs are classified "reserved" (not ignore, not allow, not block) with the not-fulfilled label', () => {
  for (const u of ['https://mock.test/api', 'https://x.invalid/', 'https://y.example/', 'https://x.supabase.co.test/', 'wss://sock.example/', 'https://zz-probe' + '.example/']) {
    const c = classifyRequestUrl(u);
    assert.equal(c.action, 'reserved', u);
    assert.equal(c.label, 'reserved-test-TLD (not fulfilled by a mock)', u);
  }
  // A reserved TLD never masks a deny or lookalike host.
  assert.equal(classifyRequestUrl('https://abcd.supabase.co/').action, 'block');
  assert.equal(classifyRequestUrl('https://example.com/').action, 'block');
});

test('findForbiddenHostLiterals: deny + non-loopback literals are found; loopback/OSM/reserved/template hosts are not', () => {
  const lits = (t) => findForbiddenHostLiterals(t).map((h) => h.literal);
  assert.ok(lits("'https://app.propertysignal.in/x'").length > 0);
  assert.ok(lits('a foo.pages.dev b').length > 0);
  assert.ok(lits("'https://example.com'").some((l) => l.startsWith('https://example.com')));
  assert.ok(lits("'http://localhost@evil.com/'").some((l) => l.includes('evil.com')));
  assert.deepEqual(lits("'http://localhost:5380' 'http://[::1]:5380' 'https://a.tile.openstreetmap.org/x' 'https://m.test/' `http://localhost:${p}` `https://${h}/x`"), []);
});

test('stripCommentsStrict: comments go, strings (even ones containing "/*" or "//") stay, code between globs is NOT swallowed', () => {
  const src = "page.route('**/api/**', h);\ntest.skip(true);\npage.route('**/x', h);\nconst u = 'http://a.test/x'; // trailing\n/* block\n test.fixme */ const k = `t//m`;";
  const out = stripCommentsStrict(src);
  assert.match(out, /test\.skip\(true\)/);
  assert.match(out, /'http:\/\/a\.test\/x'/);
  assert.match(out, /`t\/\/m`/);
  assert.doesNotMatch(out, /trailing|fixme/);
  assert.equal(stripCommentsStrict('// only a comment\nconst a = "q\\"uote // not a comment";'), '\nconst a = "q\\"uote // not a comment";');
  // control for the older naive stripper's flaw: it would have dropped the test.skip line between the two globs
  const naive = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(naive, /test\.skip/);
});

// ---- --phase=list ---------------------------------------------------------------------------------------------
const MANIFEST_HEAD = 'file,bucket,decision,canonical_equivalent_or_destination,rationale,slice,issue_2751_titles,status\n';
const mrow = (f, decision = 'RETAIN_SPECIALIST', status = 'RETAIN_SPECIALIST') => `${f},specialist,${decision},dest,"[HIT_TEST] x, with a comma",S0,0,${status}\n`;
const MANIFEST = MANIFEST_HEAD + mrow('e2e/specialist/a.specialist.ts') + mrow('e2e/specialist/b.specialist.ts') + mrow('e2e-parity/p.spec.ts') + mrow('e2e/specialist/c.specialist.ts', 'DELETE_DUP', 'SCHEDULED(PR-3)');
const textList = (...files) => `Listing tests:\n${files.map((f) => `  ${f}:12:5 › title ${f}`).join('\n')}\nTotal: ${files.length} tests in ${files.length} files\n`;
const jsonList = (...files) => JSON.stringify({ suites: files.map((f) => ({ title: f, file: f, specs: [{ title: 't', file: f, line: 1, tests: [] }], suites: [] })) });

test('list: the manifest set is only decision AND status RETAIN_SPECIALIST rows under e2e/specialist/', () => {
  assert.deepEqual([...retainSpecialistFiles(MANIFEST)].sort(), ['e2e/specialist/a.specialist.ts', 'e2e/specialist/b.specialist.ts']);
});

test('list: collected == manifest PASSES for the text and the JSON form; testDir-relative paths are normalised', () => {
  assert.deepEqual(checkListPhase({ listContent: textList('a.specialist.ts', 'b.specialist.ts'), manifestText: MANIFEST }), []);
  assert.deepEqual(checkListPhase({ listContent: textList('e2e/specialist/a.specialist.ts', 'e2e/specialist/b.specialist.ts'), manifestText: MANIFEST }), []);
  assert.deepEqual(checkListPhase({ listContent: jsonList('a.specialist.ts', 'b.specialist.ts'), manifestText: MANIFEST }), []);
  assert.deepEqual(checkListPhase({ listContent: '  [chromium] › a.specialist.ts:3:1 › t\n  [chromium] › b.specialist.ts:3:1 › t\n', manifestText: MANIFEST }), []);
});

test('list: a missing file, an extra file, an unparsable list and an EMPTY list all FAIL', () => {
  const missing = checkListPhase({ listContent: textList('a.specialist.ts'), manifestText: MANIFEST });
  assert.ok(missing.some((e) => e.includes('b.specialist.ts') && e.includes('was not collected')), missing.join('\n'));
  const extra = checkListPhase({ listContent: textList('a.specialist.ts', 'b.specialist.ts', 'z.specialist.ts'), manifestText: MANIFEST });
  assert.ok(extra.some((e) => e.includes('z.specialist.ts') && e.includes('no RETAIN_SPECIALIST row')), extra.join('\n'));
  const notManifest = checkListPhase({ listContent: textList('a.specialist.ts', 'b.specialist.ts', 'c.specialist.ts'), manifestText: MANIFEST });
  assert.ok(notManifest.some((e) => e.includes('c.specialist.ts')), 'a file whose row is not RETAIN_SPECIALIST is not admitted');
  assert.ok(checkListPhase({ listContent: '{"suites": [', manifestText: MANIFEST }).some((e) => e.includes('could not be parsed')));
  assert.ok(checkListPhase({ listContent: 'Total: 0 tests in 0 files\n', manifestText: MANIFEST_HEAD }).some((e) => e.includes('collected 0 specialist files')));
  assert.ok(checkListPhase({ listContent: `${textList('a.specialist.ts', 'b.specialist.ts')}Total: 9 tests in 5 files\n`, manifestText: MANIFEST }).some((e) => e.includes('reports 5 files')));
  assert.equal(collectedFilesFromList('').size, 0);
});

// ---- --phase=results ------------------------------------------------------------------------------------------
const NOW = Math.floor(Date.now() / 1000);
const mkTest = (status, resultStatus = 'passed') => ({ status, results: [{ status: resultStatus }] });
const mkDoc = (perFile, extra = {}) => ({
  stats: { startTime: new Date((NOW + 5) * 1000).toISOString() },
  suites: Object.entries(perFile).map(([file, tests]) => ({ title: file, file, specs: tests.map((t, i) => ({ title: `t${i}`, file, tests: [t] })), suites: [] })),
  errors: [],
  ...extra,
});
const MANIFEST_FILES = new Set(['e2e/specialist/a.specialist.ts', 'e2e/specialist/b.specialist.ts']);
const GOOD = () => mkDoc({ 'a.specialist.ts': [mkTest('expected')], 'b.specialist.ts': [mkTest('expected'), mkTest('expected')] });
const evalDoc = (doc, mtimeMs = (NOW + 5) * 1000) => checkResultsDoc({ doc, manifestFiles: MANIFEST_FILES, sinceEpochSeconds: NOW, mtimeMs });

test('results: a fresh all-passed run covering every manifest file PASSES with exact counts', () => {
  const r = evalDoc(GOOD());
  assert.deepEqual(r.errors, []);
  assert.equal(r.counts.passed, 3);
});

test('results: skipped, flaky, unexpected and interrupted each FAIL (control above passes)', () => {
  for (const [bad, needle] of [
    [mkTest('skipped', 'skipped'), 'skipped'],
    [mkTest('flaky', 'passed'), 'flaky'],
    [mkTest('unexpected', 'failed'), 'unexpected'],
    [mkTest('expected', 'interrupted'), 'interrupted'],
    [mkTest('mystery'), 'unexpected'],
  ]) {
    const r = evalDoc(mkDoc({ 'a.specialist.ts': [mkTest('expected'), bad], 'b.specialist.ts': [mkTest('expected')] }));
    assert.ok(r.errors.some((e) => e.includes(`1 ${needle} test(s)`)), `${needle}: ${r.errors.join('|')}`);
  }
});

test('results: an expected FAILURE (status expected + expectedStatus failed) or a fail/fixme/skip annotation FAILS; plain expectedStatus passed is the control', () => {
  const withTest = (t, specExtra = {}) => ({
    ...GOOD(),
    suites: [{ title: 'a', file: 'a.specialist.ts', specs: [{ title: 'x', file: 'a.specialist.ts', tests: [t], ...specExtra }], suites: [] },
      { title: 'b', file: 'b.specialist.ts', specs: [{ title: 'y', file: 'b.specialist.ts', tests: [mkTest('expected')] }], suites: [] }],
  });
  // control: expectedStatus passed, no annotations
  assert.deepEqual(evalDoc(withTest({ ...mkTest('expected'), expectedStatus: 'passed', annotations: [] })).errors, []);
  // seeded: test.fail() reports status expected + expectedStatus failed
  let r = evalDoc(withTest({ ...mkTest('expected', 'failed'), expectedStatus: 'failed' }));
  assert.ok(r.errors.some((e) => e.includes('expectedStatus other than passed')), r.errors.join('|'));
  for (const type of ['fail', 'fixme', 'skip']) {
    r = evalDoc(withTest({ ...mkTest('expected'), expectedStatus: 'passed', annotations: [{ type }] }));
    assert.ok(r.errors.some((e) => e.includes('annotated fail/fixme/skip')), `test annotation ${type}: ${r.errors.join('|')}`);
    r = evalDoc(withTest({ ...mkTest('expected'), expectedStatus: 'passed' }, { annotations: [{ type }] }));
    assert.ok(r.errors.some((e) => e.includes('annotated fail/fixme/skip')), `spec annotation ${type}`);
  }
  // control: an unrelated annotation type is fine
  assert.deepEqual(evalDoc(withTest({ ...mkTest('expected'), expectedStatus: 'passed', annotations: [{ type: 'issue' }] })).errors, []);
});

test('results: a manifest file with 0 passed, a file outside the manifest, global errors and an empty run FAIL', () => {
  let r = evalDoc(mkDoc({ 'a.specialist.ts': [mkTest('expected')] }));
  assert.ok(r.errors.some((e) => e.includes('b.specialist.ts') && e.includes('0 passed')), r.errors.join('|'));
  r = evalDoc(mkDoc({ 'a.specialist.ts': [mkTest('expected')], 'b.specialist.ts': [mkTest('unexpected', 'failed')] }));
  assert.ok(r.errors.some((e) => e.includes('b.specialist.ts') && e.includes('0 passed')));
  r = evalDoc(mkDoc({ 'a.specialist.ts': [mkTest('expected')], 'b.specialist.ts': [mkTest('expected')], 'z.specialist.ts': [mkTest('expected')] }));
  assert.ok(r.errors.some((e) => e.includes('z.specialist.ts') && e.includes('no RETAIN_SPECIALIST row')));
  r = evalDoc(GOOD() && { ...GOOD(), errors: [{ message: 'globalSetup failed' }] });
  assert.ok(r.errors.some((e) => e.includes('global error')));
  r = evalDoc({ suites: [], stats: {} });
  assert.ok(r.errors.some((e) => e.includes('0 passed tests')));
});

test('results: a stale file (mtime or stats.startTime before the run) FAILS', () => {
  assert.ok(evalDoc(GOOD(), (NOW - 600) * 1000).errors.some((e) => e.includes('stale')));
  const old = GOOD();
  old.stats.startTime = new Date((NOW - 600) * 1000).toISOString();
  assert.ok(evalDoc(old).errors.some((e) => e.includes('precedes this run')));
});

test('results CLI: missing, unparsable and stale files FAIL with exit 1; a fresh good file passes; usage errors exit 2', () => {
  const d = tmpdir();
  try {
    const manifest = path.join(d, 'm.csv');
    fs.writeFileSync(manifest, MANIFEST);
    const run = (...a) => spawnSync('node', [SCRIPT, '--phase=results', '--manifest', manifest, ...a], { encoding: 'utf8' });
    const file = path.join(d, 'results.json');
    let r = run('--results', file, '--since', String(NOW));
    assert.equal(r.status, 1); assert.match(r.stderr, /results file missing/);
    fs.writeFileSync(file, '{not json');
    r = run('--results', file, '--since', String(NOW));
    assert.equal(r.status, 1); assert.match(r.stderr, /unparsable/);
    fs.writeFileSync(file, JSON.stringify(GOOD()));
    fs.utimesSync(file, NOW - 3600, NOW - 3600);
    r = run('--results', file, '--since', String(NOW));
    assert.equal(r.status, 1); assert.match(r.stderr, /stale/);
    fs.utimesSync(file, NOW + 5, NOW + 5);
    r = run('--results', file, '--since', String(NOW));
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /SPECIALIST results: PASS \(passed=3 skipped=0 flaky=0 unexpected=0 interrupted=0\)/);
    assert.equal(run('--results', file).status, 2);
    assert.equal(spawnSync('node', [SCRIPT, '--phase=bogus'], { encoding: 'utf8' }).status, 2);
    assert.equal(spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status, 2);
  } finally { rm(d); }
});

test('list CLI: PASS on a matching list, FAIL (exit 1) on a missing file and on a mismatch', () => {
  const d = tmpdir();
  try {
    const manifest = path.join(d, 'm.csv');
    fs.writeFileSync(manifest, MANIFEST);
    const list = path.join(d, 'list.txt');
    const run = () => spawnSync('node', [SCRIPT, '--phase=list', '--manifest', manifest, '--list', list], { encoding: 'utf8' });
    assert.equal(run().status, 1);
    fs.writeFileSync(list, textList('a.specialist.ts', 'b.specialist.ts'));
    assert.equal(run().status, 0);
    fs.writeFileSync(list, textList('a.specialist.ts'));
    const bad = run();
    assert.equal(bad.status, 1); assert.match(bad.stderr, /b\.specialist\.ts.*not collected/);
  } finally { rm(d); }
});

// ---- IR2: the results path is a literal --------------------------------------------------------------------------
test('IR2: the specialist config pins outputDir and a LITERAL json outputFile and never reads PLAYWRIGHT_JSON_OUTPUT_NAME', () => {
  const src = fs.readFileSync(path.join(DEFAULT_ROOT, 'playwright.specialist.config.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.match(code, /outputDir:\s*'test-results\/specialist'/);
  assert.match(code, /\['json',\s*\{\s*outputFile:\s*'test-results\/specialist\/results\.json'\s*\}\]/);
  assert.doesNotMatch(code, /PLAYWRIGHT_JSON_OUTPUT_NAME/);
  assert.match(code, /workers:\s*1/); assert.match(code, /retries:\s*0/); assert.match(code, /timeout:\s*30_000/);
  assert.match(code, /testDir:\s*'\.\/e2e\/specialist'/); assert.match(code, /testMatch:\s*'\*\*\/\*\.specialist\.ts'/);
  assert.match(code, /locale:\s*'en-IN'/); assert.match(code, /timezoneId:\s*'Asia\/Kolkata'/);
  assert.match(code, /reuseExistingServer:\s*false/);
  assert.doesNotMatch(code, /dotenv|readFileSync|\.env\.e2e/, 'no env loader');
  assert.match(code, /assertSpecialistTarget\(process\.env\)/);
});

// ---- isolation (IR1) ------------------------------------------------------------------------------------------
test('isolation (static): playwright.config.ts must carry testIgnore with the specialist glob; comments do not count', () => {
  assert.equal(legacyConfigIgnoresSpecialist(fs.readFileSync(path.join(DEFAULT_ROOT, 'playwright.config.ts'), 'utf8')), true);
  assert.equal(legacyConfigIgnoresSpecialist("export default { testIgnore: ['**/specialist/**'], x: 1 };"), true);
  assert.equal(legacyConfigIgnoresSpecialist("export default { testIgnore: ['**/other/**', \"**/specialist/**\"] };"), true);
  assert.equal(legacyConfigIgnoresSpecialist('export default { testDir: "./e2e" };'), false);
  assert.equal(legacyConfigIgnoresSpecialist("// testIgnore: ['**/specialist/**']\nexport default {};"), false);
  assert.equal(legacyConfigIgnoresSpecialist("export default { testIgnore: ['**/other/**'] };"), false);
});

test('isolation (list parsing): specialist paths in a --list JSON are found in file and spec entries', () => {
  assert.deepEqual(specialistPathsInListJson(JSON.stringify({ suites: [{ file: 'a.spec.ts', specs: [], suites: [] }] })), []);
  assert.deepEqual(specialistPathsInListJson(JSON.stringify({ suites: [{ file: 'specialist/zz.spec.ts', specs: [{ file: 'specialist/zz.spec.ts' }], suites: [] }] })), ['specialist/zz.spec.ts']);
  assert.deepEqual(specialistPathsInListJson(JSON.stringify({ suites: [{ file: 'x.specialist.ts', suites: [] }] })), ['x.specialist.ts']);
  assert.deepEqual(specialistPathsInListJson(JSON.stringify({ suites: [{ file: 'a.spec.ts', suites: [{ file: 'e2e/specialist/n.spec.ts', specs: [] }] }] })), ['e2e/specialist/n.spec.ts']);
});

test('isolation (seeded): a config that lists a specialist path, or whose --list fails, FAILS; the control passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-root-'));
  try {
    fs.writeFileSync(path.join(root, 'playwright.config.ts'), "export default { testIgnore: ['**/specialist/**'] };");
    const clean = JSON.stringify({ suites: [{ file: 'a.spec.ts', specs: [{ file: 'a.spec.ts' }], suites: [] }] });
    const dirty = JSON.stringify({ suites: [{ file: 'specialist/zz.spec.ts', specs: [{ file: 'specialist/zz.spec.ts' }], suites: [] }] });
    const calls = [];
    const mk = (legacy, canonical) => (r, config, args, env) => { calls.push({ config, args, env }); return config === 'playwright.config.ts' ? legacy : canonical; };
    const ok = { status: 0, stdout: clean, stderr: '' };
    assert.deepEqual(checkIsolation({ root, runList: mk(ok, ok) }), []);
    // the legacy arm runs project full; the canonical arm gets dummy LOOPBACK env only
    assert.deepEqual(calls[0].args, ['--project=full']);
    for (const v of ['PLAYWRIGHT_BASE_URL', 'BACKEND_BASE_URL', 'VITE_SUPABASE_URL']) assert.equal(isLoopbackHostname(new URL(calls[1].env[v]).hostname), true, v);
    assert.ok(checkIsolation({ root, runList: mk({ status: 0, stdout: dirty, stderr: '' }, ok) }).some((e) => e.includes('legacy') && e.includes('specialist/zz.spec.ts')));
    assert.ok(checkIsolation({ root, runList: mk(ok, { status: 0, stdout: dirty, stderr: '' }) }).some((e) => e.includes('canonical') && e.includes('specialist/zz.spec.ts')));
    assert.ok(checkIsolation({ root, runList: mk({ status: 1, stdout: '', stderr: 'boom' }, ok) }).some((e) => e.includes('exited 1')));
    assert.ok(checkIsolation({ root, runList: mk({ status: 0, stdout: 'not json', stderr: '' }, ok) }).some((e) => e.includes('not JSON')));
    // static arm: no testIgnore -> FAIL even when both listings are clean (IR1a)
    fs.writeFileSync(path.join(root, 'playwright.config.ts'), 'export default {};');
    assert.ok(checkIsolation({ root, runList: mk(ok, ok) }).some((e) => e.includes('no testIgnore')));
  } finally { rm(root); }
});

test('isolation (CX1): an ABSENT legacy config skips the legacy arm with a note (canonical still mandatory); a PRESENT config whose --list fails still FAILS', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-root-'));
  const clean = JSON.stringify({ suites: [{ file: 'a.spec.ts', specs: [{ file: 'a.spec.ts' }], suites: [] }] });
  const dirty = JSON.stringify({ suites: [{ file: 'specialist/zz.spec.ts', specs: [{ file: 'specialist/zz.spec.ts' }], suites: [] }] });
  const ok = { status: 0, stdout: clean, stderr: '' };
  const calls = [];
  const mk = (legacy, canonical) => (r, config) => { calls.push(config); return config === 'playwright.config.ts' ? legacy : canonical; };
  const captureStdout = (fn) => {
    const orig = process.stdout.write.bind(process.stdout);
    let out = '';
    process.stdout.write = (s) => { out += String(s); return true; };
    try { return { result: fn(), out }; } finally { process.stdout.write = orig; }
  };
  try {
    // absent: legacy arm skipped (runList never called for it), note printed, overall clean
    const absent = captureStdout(() => checkIsolation({ root, runList: mk({ status: 1, stdout: '', stderr: 'must not be called' }, ok) }));
    assert.deepEqual(absent.result, []);
    assert.match(absent.out, /NOTE\[SP-ISO\] playwright\.config\.ts is absent/);
    assert.deepEqual(calls, ['playwright.canonical.config.ts']);
    // absent legacy config does NOT excuse a dirty or failing canonical arm
    assert.ok(checkIsolation({ root, runList: mk(ok, { status: 0, stdout: dirty, stderr: '' }) }).some((e) => e.includes('canonical') && e.includes('specialist/zz.spec.ts')));
    assert.ok(checkIsolation({ root, runList: mk(ok, { status: 1, stdout: '', stderr: 'boom' }) }).some((e) => e.includes('canonical') && e.includes('exited 1')));
    // present + testIgnore but its --list fails -> FAIL (fail closed)
    fs.writeFileSync(path.join(root, 'playwright.config.ts'), "export default { testIgnore: ['**/specialist/**'] };");
    calls.length = 0;
    const present = checkIsolation({ root, runList: mk({ status: 1, stdout: '', stderr: 'SyntaxError: broken config' }, ok) });
    assert.ok(present.some((e) => e.includes('legacy') && e.includes('exited 1')), present.join('\n'));
    assert.deepEqual(calls, ['playwright.config.ts', 'playwright.canonical.config.ts']);
  } finally { rm(root); }
});

test('isolation (real repo, real playwright --list): the legacy (--project=full) and canonical configs collect 0 e2e/specialist paths', () => {
  const errors = checkIsolation({ root: DEFAULT_ROOT });
  assert.deepEqual(errors, []);
});

test('manifest path constant matches the checked-in manifest', () => {
  assert.ok(fs.existsSync(path.join(DEFAULT_ROOT, MANIFEST_REL)));
});
