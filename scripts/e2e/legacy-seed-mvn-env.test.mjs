// scripts/e2e/legacy-seed-mvn-env.test.mjs - issue #2864
//
// Network-free, process-free proofs for scripts/e2e/legacy-seed-mvn-env.mjs. `exec` is always a recording stub; every input
// env is a literal object (never process.env), and the last test asserts process.env was not touched.
// Collected by `npm run test:e2e:guard:unit` (node --test scripts/e2e/*.test.mjs).
//
// Rule-id assertion policy (approved plan [test_design] RULE-ID SETS): an arm whose DB-field value contains a char outside
// printable ASCII (space, \t, \n, \r) accepts {R0, <field rule>} (HOST {R0,R1}, PORT {R0,R2}, NAME/USER {R0,R3}); every
// other DB-field arm asserts exactly its field rule; R4 arms assert exactly R4; R6 arms (incl. whitespace URL arms) exactly R6.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import util from 'node:util';
import { fileURLToPath } from 'node:url';
import { SEED_MVN_ARGS, buildLegacySeedMvnEnv, runLegacySeedMvn } from './legacy-seed-mvn-env.mjs';

const PROCESS_ENV_BEFORE = { ...process.env };

/** Distinctive test-only password literal: must never appear in any error. */
const PW = 'Pw2864-test-only-not-a-secret-QZ7';
const UNSET = Symbol('unset');
const CWD = '/repo/root/for-stub';

/** Valid loopback env whose keys are exactly the forwarded set, so "result deepEquals EXPECTED_BASE" proves any extra key was dropped. */
const BASE = Object.freeze({
  PATH: '/usr/bin:/bin',
  HOME: '/home/qa',
  JAVA_HOME: '/opt/jdk-21',
  SUPABASE_DB_HOST: '127.0.0.1',
  SUPABASE_DB_PORT: '54329',
  SUPABASE_DB_NAME: 'postgres',
  SUPABASE_DB_USER: 'postgres',
  SUPABASE_DB_PASSWORD: PW,
});

const EXPECTED_BASE = {
  PATH: '/usr/bin:/bin',
  HOME: '/home/qa',
  JAVA_HOME: '/opt/jdk-21',
  SUPABASE_DB_HOST: '127.0.0.1',
  SUPABASE_DB_PORT: '54329',
  SUPABASE_DB_NAME: 'postgres',
  SUPABASE_DB_USER: 'postgres',
  SUPABASE_DB_PASSWORD: PW,
  MAVEN_SKIP_RC: '1',
};

function withEnv(overrides) {
  const env = { ...BASE };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === UNSET) delete env[k];
    else env[k] = v;
  }
  return env;
}

function stubExec() {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    return 'stub-exec-result';
  };
  fn.calls = calls;
  return fn;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasNonPrintable = (v) => typeof v === 'string' && /[^\x21-\x7e]/.test(v);

function captureThrow(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail('expected a fail-closed refusal, but the env was accepted');
}

function assertRefusalError(err, variable, rules) {
  assert.ok(err instanceof Error, 'refusal must be an Error');
  const re = new RegExp(`^legacy-seed-mvn-env: refused ${escapeRe(variable)} \\[(${rules.join('|')})\\]: [^\\n]+$`);
  assert.match(err.message, re);
  assert.ok(!err.message.includes(PW), 'message must not contain the password');
  assert.ok(!util.inspect(err).includes(PW), 'inspected error must not contain the password');
  assert.equal(err.cause, undefined, 'error must carry no cause');
  assert.deepStrictEqual(Object.keys(err), [], 'error must carry no extra enumerable properties');
}

/** Refused by buildLegacySeedMvnEnv AND by runLegacySeedMvn with exec never called; input not mutated. */
function assertRefused(input, variable, rules) {
  const snapshot = structuredClone(input);
  assertRefusalError(captureThrow(() => buildLegacySeedMvnEnv(input)), variable, rules);
  const exec = stubExec();
  assertRefusalError(captureThrow(() => runLegacySeedMvn({ parentEnv: input, exec, cwd: CWD })), variable, rules);
  assert.equal(exec.calls.length, 0, 'exec must not be called when the env is refused');
  assert.deepStrictEqual(input, snapshot, 'input env must not be mutated');
}

function assertAccepted(input, expected) {
  const snapshot = structuredClone(input);
  const out = buildLegacySeedMvnEnv(input);
  assert.deepStrictEqual(out, expected);
  assert.ok(Object.isFrozen(out), 'returned env must be frozen');
  assert.deepStrictEqual(input, snapshot, 'input env must not be mutated');
  return out;
}

/** Field rule set per RULE-ID SETS policy. */
function dbRules(fieldRule, value) {
  return hasNonPrintable(value) ? ['R0', fieldRule] : [fieldRule];
}

// ---------------------------------------------------------------------------------------------
// Positive arms
// ---------------------------------------------------------------------------------------------

test('P1 loopback fixture env yields the exact minimal env', () => {
  const input = {
    SKIP_BACKEND_ENV_LOAD: 'true',
    SUPABASE_DB_HOST: 'localhost',
    SUPABASE_DB_PORT: '54329',
    SUPABASE_DB_NAME: 'postgres',
    SUPABASE_DB_USER: 'postgres',
    SUPABASE_DB_PASSWORD: PW,
    SPRING_FLYWAY_ENABLED: 'false',
    SPRING_TASK_SCHEDULING_ENABLED: 'false',
    SPRING_PROFILES_ACTIVE: 'e2e',
    LOGGING_LEVEL_ROOT: 'INFO',
    SUPABASE_PROJECT_REF: 'local-project-ref',
    LOCAL_DEV_STORAGE_ENABLED: 'true',
    AI_API_KEY: 'ai-key-test-2864',
    MAVEN_OPTS: '-Xmx1g',
    JAVA_TOOL_OPTIONS: '-Dspring.datasource.hikari.jdbc-url=jdbc:postgresql://db.x.supabase.co:6543/postgres',
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    PATH: '/usr/bin:/bin',
    HOME: '/home/qa',
    JAVA_HOME: '/opt/jdk-21',
    FOO: 'bar',
  };
  const out = assertAccepted(input, {
    PATH: '/usr/bin:/bin',
    HOME: '/home/qa',
    JAVA_HOME: '/opt/jdk-21',
    SUPABASE_DB_HOST: 'localhost',
    SUPABASE_DB_PORT: '54329',
    SUPABASE_DB_NAME: 'postgres',
    SUPABASE_DB_USER: 'postgres',
    SUPABASE_DB_PASSWORD: PW,
    MAVEN_SKIP_RC: '1',
  });
  for (const dropped of [
    'SKIP_BACKEND_ENV_LOAD',
    'SPRING_FLYWAY_ENABLED',
    'SPRING_TASK_SCHEDULING_ENABLED',
    'SPRING_PROFILES_ACTIVE',
    'LOGGING_LEVEL_ROOT',
    'SUPABASE_PROJECT_REF',
    'LOCAL_DEV_STORAGE_ENABLED',
    'AI_API_KEY',
    'MAVEN_OPTS',
    'JAVA_TOOL_OPTIONS',
    'VITE_SUPABASE_URL',
    'FOO',
  ]) {
    assert.equal(Object.hasOwn(out, dropped), false, `${dropped} must be dropped`);
  }
});

test('P1b every toolchain var is forwarded when non-empty, dropped when empty', () => {
  const input = {
    ...BASE,
    TMPDIR: '/tmp/qa/',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    USER: 'qa',
    LOGNAME: '',
  };
  assertAccepted(input, { ...EXPECTED_BASE, TMPDIR: '/tmp/qa/', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', USER: 'qa' });
});

for (const host of ['127.0.0.1', '127.1.2.3', '[::1]', 'localhost']) {
  test(`P2 loopback host ${JSON.stringify(host)} is accepted`, () => {
    assertAccepted(withEnv({ SUPABASE_DB_HOST: host }), { ...EXPECTED_BASE, SUPABASE_DB_HOST: host });
  });
}

test('P3 NAME/USER/PASSWORD unset are accepted and not forwarded', () => {
  const expected = { ...EXPECTED_BASE };
  delete expected.SUPABASE_DB_NAME;
  delete expected.SUPABASE_DB_USER;
  delete expected.SUPABASE_DB_PASSWORD;
  assertAccepted(withEnv({ SUPABASE_DB_NAME: UNSET, SUPABASE_DB_USER: UNSET, SUPABASE_DB_PASSWORD: UNSET }), expected);
});

test('P3b NAME/USER/PASSWORD empty strings are accepted and not forwarded', () => {
  const expected = { ...EXPECTED_BASE };
  delete expected.SUPABASE_DB_NAME;
  delete expected.SUPABASE_DB_USER;
  delete expected.SUPABASE_DB_PASSWORD;
  assertAccepted(withEnv({ SUPABASE_DB_NAME: '', SUPABASE_DB_USER: '', SUPABASE_DB_PASSWORD: '' }), expected);
});

test('P4 runLegacySeedMvn calls exec once with the exact args and complete options', () => {
  const exec = stubExec();
  const input = { ...BASE, MAVEN_OPTS: '-Xmx1g' };
  const result = runLegacySeedMvn({ parentEnv: input, exec, cwd: CWD });
  assert.equal(result, 'stub-exec-result');
  assert.equal(exec.calls.length, 1);
  const [file, args, options, ...rest] = exec.calls[0];
  assert.deepStrictEqual(rest, []);
  assert.equal(file, 'mvn');
  assert.deepStrictEqual(args, ['-f', 'apps/api/pom.xml', 'test', '-Dtest=AreaIntelligenceSnapshotRollupJobE2ESeedIT']);
  assert.deepStrictEqual(options, { cwd: CWD, env: EXPECTED_BASE, stdio: 'inherit', timeout: 180000 });
  assert.deepStrictEqual([...SEED_MVN_ARGS], ['-f', 'apps/api/pom.xml', 'test', '-Dtest=AreaIntelligenceSnapshotRollupJobE2ESeedIT']);
});

test('P5 runLegacySeedMvn has no default exec and requires cwd', () => {
  assert.throws(() => runLegacySeedMvn({ parentEnv: { ...BASE }, cwd: CWD }), /^TypeError: legacy-seed-mvn-env: exec must be a function/);
  const exec = stubExec();
  assert.throws(() => runLegacySeedMvn({ parentEnv: { ...BASE }, exec }), /^TypeError: legacy-seed-mvn-env: cwd must be a non-empty string/);
  assert.equal(exec.calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// N-HOST / N-PORT / N-NAME / N-USER
// ---------------------------------------------------------------------------------------------

for (const host of [
  'db.x.supabase.co',
  '10.0.0.5',
  '0.0.0.0',
  'localhost.evil.com',
  '127.0.0.1.evil.com',
  '127.0.0.1,evil.host',
  '127.256.0.1',
  '[::1]:5432',
  '::1',
  ' 127.0.0.1',
  '127.0.0.1\n',
  '',
  UNSET,
]) {
  const label = host === UNSET ? 'unset' : JSON.stringify(host);
  test(`N-HOST ${label} is refused`, () => {
    assertRefused(withEnv({ SUPABASE_DB_HOST: host }), 'SUPABASE_DB_HOST', dbRules('R1', host));
  });
}

test('PORT overlength numeric 0005432 is refused by R2 regex', () => {
  assertRefused(withEnv({ SUPABASE_DB_PORT: '0005432' }), 'SUPABASE_DB_PORT', ['R2']);
});

for (const port of ['5432,db.x.supabase.co:6543', '5432/x', '5432?x', ' 5432', '5432\n', '5432\r\n', '5432\t', '0', '65536', '-1', '', UNSET]) {
  const label = port === UNSET ? 'unset' : JSON.stringify(port);
  test(`N-PORT ${label} is refused`, () => {
    assertRefused(withEnv({ SUPABASE_DB_PORT: port }), 'SUPABASE_DB_PORT', dbRules('R2', port));
  });
}

for (const name of ['postgres?socketFactory=x', 'p/x', 'p;x', 'p&x', 'p#', 'p%3F', 'p,q', 'postgres\n', 'postgres\r\n']) {
  test(`N-NAME ${JSON.stringify(name)} is refused`, () => {
    assertRefused(withEnv({ SUPABASE_DB_NAME: name }), 'SUPABASE_DB_NAME', dbRules('R3', name));
  });
}

for (const user of ['post gres', 'u@h', 'u/x', 'postgres\n', 'postgres\r\n']) {
  test(`N-USER ${JSON.stringify(user)} is refused`, () => {
    assertRefused(withEnv({ SUPABASE_DB_USER: user }), 'SUPABASE_DB_USER', dbRules('R3', user));
  });
}

// N-NEWLINE (dedicated): the ONLY defect in each env is a trailing newline on one DB field.
test('N-NEWLINE HOST trailing newline is refused', () => {
  assertRefused(withEnv({ SUPABASE_DB_HOST: '127.0.0.1\n' }), 'SUPABASE_DB_HOST', ['R0', 'R1']);
});
test('N-NEWLINE PORT trailing newline is refused', () => {
  assertRefused(withEnv({ SUPABASE_DB_PORT: '5432\n' }), 'SUPABASE_DB_PORT', ['R0', 'R2']);
});
test('N-NEWLINE NAME trailing newline is refused', () => {
  assertRefused(withEnv({ SUPABASE_DB_NAME: 'postgres\n' }), 'SUPABASE_DB_NAME', ['R0', 'R3']);
});
test('N-NEWLINE USER trailing newline is refused', () => {
  assertRefused(withEnv({ SUPABASE_DB_USER: 'postgres\n' }), 'SUPABASE_DB_USER', ['R0', 'R3']);
});

// ---------------------------------------------------------------------------------------------
// N-AMBIENT (R4) — one arm per class, upper and lower case, otherwise-valid env
// ---------------------------------------------------------------------------------------------

const AMBIENT = [
  ['SPRING_DATASOURCE_URL', 'jdbc:postgresql://db.x.supabase.co:5432/postgres'], // (i)
  ['SPRING_DATASOURCE_HIKARI_JDBC_URL', 'jdbc:postgresql://db.x.supabase.co:6543/postgres'], // (i)
  ['SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL', 'false'], // (i)
  ['SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE', 'disable'], // (i)
  ['SPRING_DATASOURCE_USERNAME', 'postgres'], // (i)
  ['SPRING_FLYWAY_URL', 'jdbc:postgresql://db.x.supabase.co:5432/postgres'], // (ii)
  ['SPRING_LIQUIBASE_URL', 'jdbc:postgresql://db.x.supabase.co:5432/postgres'], // (ii)
  ['SPRING_R2DBC_URL', 'r2dbc:postgresql://db.x.supabase.co:5432/postgres'], // (ii)
  ['SPRING_APPLICATION_JSON', '{"spring.datasource.hikari.jdbc-url":"jdbc:postgresql://db.x.supabase.co/postgres"}'], // (iii)
  ['SPRING_CONFIG_ADDITIONAL_LOCATION', 'file:/tmp/evil.yml'], // (iii)
  ['SPRING_CONFIG_IMPORT', 'file:/tmp/evil.yml'], // (iii)
  ['SPRING_CONFIG_LOCATION', 'file:/tmp/evil.yml'], // (iii)
  ['DATABASE_URL', 'postgres://db.x.supabase.co:5432/postgres'], // (iv)
  ['JDBC_DATABASE_URL', 'jdbc:postgresql://db.x.supabase.co:5432/postgres'], // (iv)
  ['PGHOST', 'db.x.supabase.co'], // (v)
  ['PGHOSTADDR', '10.0.0.5'], // (v)
  ['PGPORT', '6543'], // (v)
  ['PGSERVICE', 'prod'], // (v)
  ['PGSERVICEFILE', '/tmp/pg_service.conf'], // (v)
  ['SUPABASE_DB_URL', 'postgresql://db.x.supabase.co:5432/postgres'], // (vi), also matches R6's name regex: R4 must win
  ['SUPABASE_DB_HOSTS', '127.0.0.1,db.x.supabase.co'], // (vi)
];

for (const [name, value] of AMBIENT) {
  test(`N-AMBIENT ${name} (upper) is refused by R4`, () => {
    assertRefused(withEnv({ [name]: value }), name, ['R4']);
  });
  test(`N-AMBIENT ${name.toLowerCase()} (lower) is refused by R4`, () => {
    assertRefused(withEnv({ [name.toLowerCase()]: value }), name.toLowerCase(), ['R4']);
  });
}

test("N-AMBIENT SPRING_DATASOURCE_URL='' (empty still present) is refused by R4", () => {
  assertRefused(withEnv({ SPRING_DATASOURCE_URL: '' }), 'SPRING_DATASOURCE_URL', ['R4']);
});
test("N-AMBIENT spring_datasource_url='' (lower, empty still present) is refused by R4", () => {
  assertRefused(withEnv({ spring_datasource_url: '' }), 'spring_datasource_url', ['R4']);
});
test('N-AMBIENT Spring_Datasource_Url (mixed case) is refused by R4', () => {
  assertRefused(withEnv({ Spring_Datasource_Url: 'jdbc:postgresql://db.x.supabase.co/postgres' }), 'Spring_Datasource_Url', ['R4']);
});
test('N-AMBIENT lower-case supabase_db_host is refused by R4(vi), not silently ignored', () => {
  assertRefused(withEnv({ supabase_db_host: 'db.x.supabase.co' }), 'supabase_db_host', ['R4']);
});
test("N-AMBIENT empty non-DATASOURCE class vars (DATABASE_URL='', PGHOST='') are dropped, not refused", () => {
  assertAccepted(withEnv({ DATABASE_URL: '', PGHOST: '', SPRING_APPLICATION_JSON: '' }), EXPECTED_BASE);
});

test('N-WRAPPER full run-e2e-local.sh export set is refused under R4(i)', () => {
  // scripts/run-e2e-local.sh:284 and :289-309, in export order (values are test literals).
  const input = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/qa',
    VITE_API_BASE_URL: 'http://127.0.0.1:8374',
    SKIP_BACKEND_ENV_LOAD: 'true',
    SUPABASE_DB_HOST: 'localhost',
    SUPABASE_DB_PORT: '54329',
    SUPABASE_DB_NAME: 'postgres',
    SUPABASE_DB_USER: 'postgres',
    SUPABASE_DB_PASSWORD: PW,
    SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL: 'false',
    SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE: 'disable',
    SPRING_FLYWAY_ENABLED: 'false',
    SPRING_TASK_SCHEDULING_ENABLED: 'false',
    SUPABASE_PROJECT_REF: 'local-project-ref',
    LOCAL_DEV_STORAGE_ENABLED: 'true',
    AI_API_KEY: 'ai-key-test-2864',
  };
  assertRefused(input, 'SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL', ['R4']);
});

// ---------------------------------------------------------------------------------------------
// N-SUPABASE-URL (R6)
// ---------------------------------------------------------------------------------------------

const HOSTED_URLS = [
  'https://abcd.supabase.co',
  'http://10.0.0.5:54321',
  'http://localhost.evil.com',
  'http://user:pw@127.0.0.1:54321',
  'ftp://127.0.0.1',
  'not a url',
  'http://127.0.0.1:54321\n',
];

for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
  for (const value of HOSTED_URLS) {
    test(`N-SUPABASE-URL ${name} ${JSON.stringify(value)} is refused by R6`, () => {
      assertRefused(withEnv({ [name]: value }), name, ['R6']);
    });
  }
  for (const value of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321', '']) {
    test(`N-SUPABASE-URL companion ${name} ${JSON.stringify(value)} is accepted and dropped`, () => {
      const out = assertAccepted(withEnv({ [name]: value }), EXPECTED_BASE);
      assert.equal(Object.hasOwn(out, name), false);
    });
  }
}

test('N-SUPABASE-URL SUPABASE_AUTH_URL hosted is refused by R6', () => {
  assertRefused(withEnv({ SUPABASE_AUTH_URL: 'https://abcd.supabase.co/auth/v1' }), 'SUPABASE_AUTH_URL', ['R6']);
});
test('N-SUPABASE-URL supabase_url (lower) hosted is refused by R6', () => {
  assertRefused(withEnv({ supabase_url: 'https://abcd.supabase.co' }), 'supabase_url', ['R6']);
});

// N-SUPABASE-URL-WS (R6a, dedicated): loopback host, so ONLY R6a can refuse these (new URL() strips the whitespace).
for (const value of ['http://127.0.0.1:54321\n', 'http://127.0.0.1:54321\r\n', 'http://127.0.\t0.1:54321', ' http://127.0.0.1:54321']) {
  test(`N-SUPABASE-URL-WS SUPABASE_URL ${JSON.stringify(value)} is refused by R6a`, () => {
    assertRefused(withEnv({ SUPABASE_URL: value }), 'SUPABASE_URL', ['R6']);
  });
}

// ---------------------------------------------------------------------------------------------
// B-DROP: benign / option vars are dropped (accepted, absent), never refused, never forwarded
// ---------------------------------------------------------------------------------------------

for (const [name, value] of [
  ['SPRING_FLYWAY_ENABLED', 'false'],
  ['SPRING_TASK_SCHEDULING_ENABLED', 'false'],
  ['SPRING_PROFILES_ACTIVE', 'e2e'],
  ['MAVEN_OPTS', '-Dspring.datasource.hikari.jdbc-url=jdbc:postgresql://db.x.supabase.co/postgres'],
  ['JAVA_TOOL_OPTIONS', '-javaagent:/tmp/evil.jar'],
  ['JDK_JAVA_OPTIONS', '-Dspring.datasource.hikari.jdbc-url=jdbc:postgresql://db.x.supabase.co/postgres'],
  ['_JAVA_OPTIONS', '-Dx=y'],
  ['MAVEN_ARGS', '-Dspring.datasource.url=x'],
  ['M2_HOME', '/opt/maven'],
  ['MAVEN_HOME', '/opt/maven'],
  ['LOGGING_LEVEL_ROOT', 'DEBUG'],
  ['SPRING_LOGGING_LEVEL_ROOT', 'DEBUG'],
  ['SUPABASE_PROJECT_REF', 'local-project-ref'],
  ['AI_API_KEY', 'ai-key-test-2864'],
  ['path', '/tmp/evil-bin'],
  ['Path', '/tmp/evil-bin'],
]) {
  test(`B-DROP ${name} is dropped, not refused`, () => {
    const out = assertAccepted(withEnv({ [name]: value }), EXPECTED_BASE);
    assert.equal(Object.hasOwn(out, name), false);
  });
}

// ---------------------------------------------------------------------------------------------
// W1 wiring: the spec actually routes through the guard (a guard nobody calls is vacuous)
// ---------------------------------------------------------------------------------------------

const SPEC_PATH = fileURLToPath(new URL('../../e2e/journey/area-trends-2581.spec.ts', import.meta.url));

/** Strip // and block comments without touching string/template literal contents (so 'http://x' survives). */
export function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      out += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      out += c;
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (c !== '`' && src[i] === '\n') break;
        out += src[i];
        i++;
      }
      if (i < n) {
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const count = (text, re) => [...text.matchAll(re)].length;

test('W0 stripComments removes comments but keeps string contents', () => {
  const src = "const u = 'http://x/*y*/'; // execFileSync('mvn'\n/* env: process.env */ const t = `a//b`; const q = \"c//d\";";
  const s = stripComments(src);
  assert.ok(s.includes("'http://x/*y*/'"));
  assert.ok(s.includes('`a//b`'));
  assert.ok(s.includes('"c//d"'));
  assert.ok(!s.includes('execFileSync'));
  assert.ok(!s.includes('process.env'));
});

test('W1 spec routes both seed launches through runLegacySeedMvn', () => {
  const s = stripComments(fs.readFileSync(SPEC_PATH, 'utf8'));
  // Non-vacuity: the stripped text is still the spec.
  assert.ok(s.includes('const hasLocalFixtureDb'), 'stripped spec lost its code');
  assert.equal(count(s, /\btest\(/g), 9, 'no test() may be added or removed');
  assert.equal(count(s, /\btest\.skip\(/g), 3, 'no test.skip may be added or removed');

  assert.equal(count(s, /\brunLegacySeedMvn\(/g), 2, 'exactly two runLegacySeedMvn( call sites');
  assert.equal(
    count(s, /\brunLegacySeedMvn\(\s*\{\s*parentEnv:\s*process\.env,\s*exec:\s*execFileSync,\s*cwd:\s*REPO_ROOT,?\s*\}\s*\)/g),
    2,
    'both call sites pass { parentEnv: process.env, exec: execFileSync, cwd: REPO_ROOT }',
  );
  assert.match(s, /import\s*\{\s*runLegacySeedMvn\s*\}\s*from\s*'\.\.\/\.\.\/scripts\/e2e\/legacy-seed-mvn-env\.mjs';/);

  assert.equal(count(s, /(?<![.\w$])(execFileSync|execFile|execSync|exec|spawnSync|spawn|fork)\s*\(/g), 0, 'no direct spawn call');
  assert.equal(count(s, /['"`]mvn['"`]/g), 0, "no 'mvn' / \"mvn\" / `mvn` literal");
  assert.equal(count(s, /\benv\s*:\s*process\.env\b/g), 0, 'no env: process.env');
  assert.equal(count(s, /child_process/g), 1, 'one child_process import only');
  assert.match(s, /import\s*\{\s*execFileSync\s*\}\s*from\s*'child_process';/, 'child_process import is exactly { execFileSync }, no alias');
  assert.equal(count(s, /\brequire\s*\(/g), 0, 'no require()');
});

// ---------------------------------------------------------------------------------------------

test('process.env is never read-modified by this file', () => {
  assert.deepStrictEqual({ ...process.env }, PROCESS_ENV_BEFORE);
});
