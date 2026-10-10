// node --test scripts/e2e/run-e2e-gate.preflight.test.mjs  (issue #2750: FC-25, K7, local-auth credential isolation)
//
// Drives the REAL scripts/run-e2e-gate.sh up to its preflight exit (E2E_GATE_PREFLIGHT_ONLY=1: nothing is started, exit 3).
// Every refusal arm has a control arm that passes, so a refusal cannot be a blanket one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(ROOT, 'scripts', 'run-e2e-gate.sh');
const PLANTED = 'PLANTED-envfile-value-9f3a';

// A clean env: only what bash/node/git need, so no SPRING_ or JAVA_ variable leaks in from the runner.
function run(extra = {}, { gate = GATE } = {}) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME ?? os.homedir(), E2E_GATE_PREFLIGHT_ONLY: '1', ...extra };
  const r = spawnSync('bash', [gate], { encoding: 'utf8', env });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function envFile(lines) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-pre-'));
  const p = path.join(d, 'env');
  fs.writeFileSync(p, lines.map((l) => `${l}\n`).join(''));
  return { dir: d, file: p };
}
const ALL = (v) => [
  `ADMIN_EMAIL=admin-${v}@x.test`, `ADMIN_PASSWORD=${v}-a`, `BROKER_EMAIL=broker-${v}@x.test`, `BROKER_PASSWORD=${v}-b`,
  `SMOKE_USER_EMAIL=user-${v}@x.test`, `SMOKE_USER_PASSWORD=${v}-u`,
  `VITE_SUPABASE_URL=https://${v}.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=${v}-key`, `SUPABASE_PROJECT_REF=${v}`,
];

test('local mode (the default) reads NOTHING from any env file, even when one is supplied and fully populated', () => {
  const f = envFile(ALL(PLANTED));
  try {
    const r = run({ E2E_ENV_FILE: f.file });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /preflight: auth_mode=local env_file_reads=0/);
    assert.doesNotMatch(r.out, new RegExp(PLANTED));
    assert.doesNotMatch(r.out, /ENVIRONMENT_GATED/);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('control: hosted mode DOES read the env file, and says it is ENVIRONMENT_GATED (so the 0 above is not a blind probe)', () => {
  const f = envFile(ALL(PLANTED));
  try {
    const r = run({ E2E_ENV_FILE: f.file, E2E_AUTH_MODE: 'hosted' });
    assert.equal(r.status, 3, r.out);
    const m = r.out.match(/preflight: auth_mode=hosted env_file_reads=(\d+)/);
    assert.ok(m && Number(m[1]) > 0, r.out);
    assert.match(r.out, /ENVIRONMENT_GATED/);
    assert.doesNotMatch(r.out, new RegExp(PLANTED));
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('hosted mode is never the default and an unknown mode is refused', () => {
  const r = run({ E2E_AUTH_MODE: 'prod' });
  assert.equal(r.status, 3);
  assert.match(r.out, /E2E_AUTH_MODE must be 'local' \(default\) or 'hosted'/);
  assert.doesNotMatch(run().out, /ENVIRONMENT_GATED/);
});

test('FC-25: a hosted VITE_SUPABASE_URL in the caller environment is refused in local mode, by name, never by value', () => {
  const r = run({ VITE_SUPABASE_URL: 'https://leaky-ref.supabase.co' });
  assert.equal(r.status, 3);
  assert.match(r.out, /NOT A GATE RUN: FC-25a VITE_SUPABASE_URL/);
  assert.doesNotMatch(r.out, /leaky-ref/);
  assert.equal(run({ VITE_SUPABASE_URL: 'http://localhost:9375' }).out.includes('preflight: auth_mode=local'), true, 'control: loopback is accepted');
});

test('K7: every inherited SPRING_* variable is refused by name, including the ones that can swap the whole config', () => {
  for (const name of ['SPRING_APPLICATION_JSON', 'SPRING_CONFIG_LOCATION', 'SPRING_CONFIG_ADDITIONAL_LOCATION', 'SPRING_CONFIG_IMPORT',
    'SPRING_PROFILES_ACTIVE', 'SPRING_PROFILES_INCLUDE', 'SPRING_DATASOURCE_URL', 'SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI']) {
    const r = run({ [name]: 'x' });
    assert.equal(r.status, 3, name);
    assert.match(r.out, new RegExp(`K7: the caller environment sets.*${name}`), name);
  }
});

test('K7: JAVA_TOOL_OPTIONS / JDK_JAVA_OPTIONS / MAVEN_OPTS / MAVEN_ARGS carrying spring. or datasource are refused; benign values pass', () => {
  for (const name of ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'MAVEN_OPTS', 'MAVEN_ARGS']) {
    for (const bad of ['-Dspring.datasource.url=jdbc:postgresql://evil/x', '-DSPRING.profiles.active=prod', '-Dapp.datasource=1']) {
      const r = run({ [name]: bad });
      assert.equal(r.status, 3, `${name}=${bad}`);
      assert.match(r.out, new RegExp(`K7: ${name} carries a spring\\./datasource setting`));
    }
    const ok = run({ [name]: '-Xmx512m' });
    assert.match(ok.out, /preflight: auth_mode=local/, `${name}: a benign value must not be refused`);
  }
});

test('K7: an apps/api/config directory or an application*.yml/.properties beside the backend is refused (temp copy of the gate)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-k7-'));
  try {
    fs.cpSync(path.join(ROOT, 'scripts'), path.join(tmp, 'scripts'), { recursive: true });
    const gate = path.join(tmp, 'scripts', 'run-e2e-gate.sh');
    fs.mkdirSync(path.join(tmp, 'apps', 'api'), { recursive: true });
    assert.match(run({}, { gate }).out, /preflight: auth_mode=local/, 'control: a bare apps/api passes');
    fs.mkdirSync(path.join(tmp, 'apps', 'api', 'config'));
    let r = run({}, { gate });
    assert.equal(r.status, 3);
    assert.match(r.out, /K7: apps\/api\/config exists/);
    fs.rmdirSync(path.join(tmp, 'apps', 'api', 'config'));
    for (const f of ['application.yml', 'application-local.yaml', 'application.properties']) {
      fs.writeFileSync(path.join(tmp, 'apps', 'api', f), 'x: 1\n');
      r = run({}, { gate });
      assert.equal(r.status, 3, f);
      assert.match(r.out, /K7: apps\/api holds an application/, f);
      fs.rmSync(path.join(tmp, 'apps', 'api', f));
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('FC-GAP override: refused in CI, accepted locally', () => {
  for (const ci of [{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }]) {
    const r = run({ E2E_GATE_ALLOW_OPEN_GAPS: '1', ...ci });
    assert.equal(r.status, 3);
    assert.match(r.out, /E2E_GATE_ALLOW_OPEN_GAPS=1 is refused in CI/);
  }
  assert.match(run({ E2E_GATE_ALLOW_OPEN_GAPS: '1' }).out, /preflight: auth_mode=local/);
});

test('E2E_GATE_EVIDENCE_DIR (a local evidence aid) is refused in CI, accepted locally', () => {
  const r = run({ E2E_GATE_EVIDENCE_DIR: '/tmp/x', CI: 'true' });
  assert.equal(r.status, 3);
  assert.match(r.out, /E2E_GATE_EVIDENCE_DIR is a local-evidence aid and is refused in CI/);
  assert.match(run({ E2E_GATE_EVIDENCE_DIR: '/tmp/x' }).out, /preflight: auth_mode=local/);
});

test('SR LOW-4: E2E_GATE_DB_CONTAINER must match ^pg-gate- (the cleanup trap force-removes it); the shared fixture and other names are refused', () => {
  for (const bad of ['pg-test-fixture', 'some-other-container', 'e2e-2750-pg', 'xpg-gate-1', '']) {
    if (bad === '') continue; // an empty override falls back to the computed pg-gate-* default (control below)
    const r = run({ E2E_GATE_DB_CONTAINER: bad });
    assert.equal(r.status, 3, bad);
    assert.match(r.out, /NOT A GATE RUN: .*(shared fixture container|must match \^pg-gate-)/, bad);
    assert.doesNotMatch(r.out, /preflight: auth_mode/, `${bad}: must be refused before the preflight`);
  }
  assert.match(run({ E2E_GATE_DB_CONTAINER: 'pg-gate-2750-9375' }).out, /preflight: auth_mode=local/, 'control: a pg-gate-* name is accepted');
  assert.match(run().out, /preflight: auth_mode=local/, 'control: the computed default is accepted');
});

test('LOW-E: an inherited PRIVACY_SNAPSHOT_SQL is refused by name (never by value), even when empty; control: unset passes', () => {
  for (const v of ['/tmp/fake-snapshot-VALUE-7c1.sql', '']) {
    const r = run({ PRIVACY_SNAPSHOT_SQL: v });
    assert.notEqual(r.status, 0, `value=${JSON.stringify(v)}`);
    assert.equal(r.status, 3);
    assert.match(r.out, /NOT A GATE RUN: FC-27c: the caller environment sets PRIVACY_SNAPSHOT_SQL/);
    assert.doesNotMatch(r.out, /VALUE-7c1/);
    assert.doesNotMatch(r.out, /preflight: auth_mode/, 'refused before the preflight');
  }
  assert.match(run().out, /preflight: auth_mode=local/, 'control: without it the preflight is reached');
});

test('the provenance opt-out is still refused', () => {
  const r = run({ CANONICAL_SKIP_SHA_PROVENANCE: '1' });
  assert.equal(r.status, 3);
  assert.match(r.out, /CANONICAL_SKIP_SHA_PROVENANCE is set/);
});
