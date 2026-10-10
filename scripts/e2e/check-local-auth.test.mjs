// scripts/e2e/check-local-auth.test.mjs - unit tests for FC-25 / FC-26 / FC-28 (issue #2750, local canonical auth stack).
// Run: node --test scripts/e2e/check-local-auth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkEnv, checkConfig, checkBundle, isLoopbackUrl, stripE2eCanonicalJob, ISSUER_TEMPLATE } from './check-local-auth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'check-local-auth.mjs');
const names = (v) => v.map((x) => x.name);

test('FC-25a: VITE_SUPABASE_URL must be loopback when set', () => {
  assert.deepEqual(checkEnv({}), []);
  assert.deepEqual(checkEnv({ VITE_SUPABASE_URL: 'http://localhost:9375' }), []);
  assert.deepEqual(checkEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:9375' }), []);
  assert.deepEqual(checkEnv({ VITE_SUPABASE_URL: 'http://[::1]:9375' }), []);
  for (const bad of ['https://abcdefghij.supabase.co', 'http://0.0.0.0:9375', 'http://localhost.evil.com', 'http://localhost@evil.com', 'not a url', 'http://127.0.0.1.evil.com']) {
    assert.deepEqual(names(checkEnv({ VITE_SUPABASE_URL: bad })), ['VITE_SUPABASE_URL'], bad);
  }
});

test('FC-25b: a non-loopback issuer is refused (env override and resolved --issuer)', () => {
  assert.deepEqual(names(checkEnv({ E2E_AUTH_ISSUER_URI: 'https://x.supabase.co/auth/v1' })), ['E2E_AUTH_ISSUER_URI']);
  assert.deepEqual(names(checkEnv({}, { issuer: 'https://x.supabase.co/auth/v1' })), ['--issuer']);
  assert.deepEqual(checkEnv({}, { issuer: 'http://localhost:9375/auth/v1' }), []);
});

test('FC-25c: any inherited SPRING_SECURITY_OAUTH2_* is refused, by name, regardless of value', () => {
  const v = checkEnv({ SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI: 'http://localhost:1/auth/v1', SPRING_SECURITY_OAUTH2_CLIENT_X: 'y', PATH: '/bin' });
  assert.deepEqual(names(v), ['SPRING_SECURITY_OAUTH2_CLIENT_X', 'SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI']);
});

test('refusal output carries NAMES only, never the value', () => {
  const secret = 'https://leaky-secret-ref.supabase.co';
  const r = spawnSync(process.execPath, [CLI, '--phase=env'], { env: { PATH: process.env.PATH, VITE_SUPABASE_URL: secret }, encoding: 'utf8' });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /NOT A GATE RUN: FC-25a VITE_SUPABASE_URL/);
  assert.ok(!r.stderr.includes('leaky-secret-ref') && !r.stdout.includes('leaky-secret-ref'));
});

test('isLoopbackUrl agrees with playwright.canonical.config.ts on the shared table', () => {
  const cfg = readFileSync(join(HERE, '../../playwright.canonical.config.ts'), 'utf8');
  assert.match(cfg, /assertLocalOnlyUrl\('VITE_SUPABASE_URL', VITE_SUPABASE_URL\)/, 'FC-25b: config asserts VITE_SUPABASE_URL');
  for (const [u, want] of [['http://localhost:5251', true], ['http://127.9.9.9', true], ['http://[::1]:1', true], ['http://0.0.0.0:1', false], ['https://a.pages.dev', false]]) {
    assert.equal(isLoopbackUrl(u), want, u);
  }
});

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'fc26-'));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }
  return root;
}
const YML = `spring:\n  security:\n    oauth2:\n      resourceserver:\n        jwt:\n          ${ISSUER_TEMPLATE}\n`;

test('FC-26: clean tree passes; issuer drift, localhost issuer file and workflow leak fail; e2e-canonical job is exempt', () => {
  const ok = tree({ 'apps/api/src/main/resources/application.yml': YML });
  assert.deepEqual(checkConfig(ok), []);
  const drift = tree({ 'apps/api/src/main/resources/application.yml': YML.replace('${SUPABASE_PROJECT_REF}', 'abc') });
  assert.equal(checkConfig(drift).length >= 1, true);
  const leakFile = tree({ 'apps/api/src/main/resources/application.yml': YML, 'apps/api/src/main/resources/application-x.yml': 'a: http://localhost:9375/auth/v1\n' });
  assert.equal(checkConfig(leakFile).some((b) => b.file.endsWith('application-x.yml')), true);
  const wf = (job) => `jobs:\n  ${job}:\n    env:\n      SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI: http://localhost:9375/auth/v1\n`;
  const leakWf = tree({ 'apps/api/src/main/resources/application.yml': YML, '.github/workflows/w.yml': wf('other') });
  assert.equal(checkConfig(leakWf).some((b) => b.file === '.github/workflows/w.yml'), true);
  const okWf = tree({ 'apps/api/src/main/resources/application.yml': YML, '.github/workflows/w.yml': wf('e2e-canonical') });
  assert.deepEqual(checkConfig(okWf), []);
  const vacuous = tree({ 'apps/api/src/main/resources/application.yml': 'a: b\n' });
  assert.equal(checkConfig(vacuous).some((b) => /vacuous/.test(b.reason)), true);
  for (const r of [ok, drift, leakFile, leakWf, okWf, vacuous]) rmSync(r, { recursive: true, force: true });
});

test('stripE2eCanonicalJob removes only that job', () => {
  const t = 'jobs:\n  a:\n    x: 1\n  e2e-canonical:\n    y: 2\n  b:\n    z: 3\nother: 4\n';
  const s = stripE2eCanonicalJob(t);
  assert.ok(s.includes('x: 1') && s.includes('z: 3') && s.includes('other: 4') && !s.includes('y: 2'));
});

test('FC-28: gateway present + only the supabase-js wildcard tokens passes; project URL / bare literal / missing gateway fail', () => {
  const GW = 'http://localhost:9375';
  const mk = (js) => tree({ 'dist/assets/a.js': js, 'dist/index.html': '<html></html>' });
  const good = mk(`fetch("${GW}");e.push("*.supabase.co","*.supabase.in")`);
  assert.deepEqual(checkBundle(join(good, 'dist'), GW), []);
  assert.equal(checkBundle(join(mk(`fetch("${GW}");"https://abcdefghij.supabase.co"`), 'dist'), GW).length, 1);
  assert.equal(checkBundle(join(mk(`fetch("${GW}");"supabase.co"`), 'dist'), GW).length, 1);
  assert.equal(checkBundle(join(mk('fetch("https://abcdefghij.supabase.co")'), 'dist'), GW).length, 2);
  assert.equal(checkBundle(join(mk('no gateway here'), 'dist'), GW).length, 1);
  assert.equal(checkBundle(join(tree({ 'dist/x.png': 'x' }), 'dist'), GW).some((b) => /vacuous/.test(b.reason)), true);
});
