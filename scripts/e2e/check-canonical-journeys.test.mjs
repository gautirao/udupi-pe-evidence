// node --test scripts/e2e/check-canonical-journeys.test.mjs  (issue #2750; one arm per fail-closed condition)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  chainMatches,
  listPhase,
  loadMatrix,
  main,
  resultsPhase,
  scanForCredentialValues,
  scanPhase,
  segmentMatches,
  staticPhase,
  DEFAULT_ROOT,
  CREDENTIAL_ENV_NAMES,
  DESCOPABLE_IDS,
} from './check-canonical-journeys.mjs';
import { cleanup, makeMatrix, makeRoot, passingStats, pwJson, tmpDir, writeJson } from './__fixtures__/pw-json.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-canonical-journeys.mjs');
const hasFail = (res, code) => res.errors.some((e) => e.includes(`FAIL[${code}]`));

// A tiny but complete passing world: J01 names T4 (user) and T10 (anon); harness smoke in anon.
const MATRIX = makeMatrix({
  j01Ids: [{ id: 'T4', project: 'canonical-user' }, { id: 'T10', project: 'canonical-anon' }],
  harness: [{ id: 'harness-smoke', match: 'canonical harness smoke', project: 'canonical-anon' }],
});
const baseTests = () => [
  { project: 'canonical-anon', title: 'T10 - anon teaser' },
  { project: 'canonical-anon', describe: 'canonical harness smoke', title: 'renders real fixture listing content' },
  { project: 'canonical-user', title: '[role:user] T4 - bare city URL settles' },
  { project: 'canonical-broker', title: '[role:broker] CC1 - broker creates' },
  { project: 'canonical-admin', title: '[role:admin] T1 - admin signs in' },
  { project: 'canonical-setup-user', title: '[role:user] mint storageState' },
  { project: 'canonical-setup-broker', title: '[role:broker] mint storageState' },
  { project: 'canonical-setup-admin', title: '[role:admin] mint storageState' },
];
const listJson = (tests = baseTests()) => pwJson({ tests });
const runJson = (tests = baseTests(), stats) => pwJson({ tests, stats: stats ?? passingStats(tests.length) });

function io(files) {
  const dir = tmpDir();
  const out = {};
  for (const [k, v] of Object.entries(files)) out[k] = writeJson(dir, `${k}.json`, v);
  out.dir = dir;
  return out;
}

// --------------------------------------------------------------------------------------------
test('FC-12: id matching is word-boundary + leading-token (CC1 != CC1b, T1 != T10, mention != id)', () => {
  assert.equal(segmentMatches('CC1 - broker creates', 'CC1'), true);
  assert.equal(segmentMatches('CC1b - second listing', 'CC1'), false);
  assert.equal(segmentMatches('CC1c - third', 'CC1'), false);
  assert.equal(segmentMatches('T10 - anon teaser', 'T1'), false);
  assert.equal(segmentMatches('[role:user] T1 - sign-in', 'T1'), true);
  assert.equal(segmentMatches('T14 - admin approve (depends on T13 listingId)', 'T13'), false);
  assert.equal(segmentMatches('T2b - gated return-to', 'T2'), false);
  assert.equal(chainMatches(['T12 - authed detail', '[role:user] authed user'], 'T12'), true);
});

test('real repo: static phase passes against the committed matrix and canonical sources', () => {
  const res = staticPhase({ root: DEFAULT_ROOT });
  assert.deepEqual(res.errors, []);
  assert.equal(res.ok, true);
});

test('matrix shape: all 16 rows required; absence is not a descope', () => {
  const m = makeMatrix();
  m.rows = m.rows.filter((r) => r.id !== 'J12');
  const root = makeRoot({ matrix: m });
  try {
    const { errors } = loadMatrix(path.join(root, 'e2e/canonical/journey-matrix.json'));
    assert.ok(errors.some((e) => e.includes('J12 is missing')));
  } finally { cleanup(root); }
});

test('matrix shape: COVERED row without ids and DESCOPED_DARK without a reason are rejected', () => {
  const m = makeMatrix({ extraRows: { J02: { status: 'COVERED', canonical_ids: [] }, J13: { status: 'DESCOPED_DARK', notes: 'short' } } });
  const root = makeRoot({ matrix: m });
  try {
    const { errors } = loadMatrix(path.join(root, 'e2e/canonical/journey-matrix.json'));
    assert.ok(errors.some((e) => e.includes('J02 is COVERED but names no canonical id')));
    assert.ok(errors.some((e) => e.includes('J13 is DESCOPED_DARK without a written reason')));
  } finally { cleanup(root); }
});

// ---- static phase on synthetic roots --------------------------------------------------------
const SRC = "test('[role:user] T4 - bare city', async () => {});\ntest('T10 - anon teaser', async () => {});\ntest.describe('canonical harness smoke', () => { test('x', async () => {}); });\n";

test('static: passes on a consistent synthetic root', () => {
  const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC } });
  try { assert.deepEqual(staticPhase({ root }).errors, []); } finally { cleanup(root); }
});

test('FC-08 static: a matrix id with no title fails', () => {
  const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC.replace('T10', 'T99') } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-08')); } finally { cleanup(root); }
});

test('FC-09 static: unknown role tag fails', () => {
  const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC + "test('[role:owner] T4 - x', async () => {});\n" } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-09')); } finally { cleanup(root); }
});

test('static: a title that only appears inside a comment does not satisfy an id', () => {
  const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC.replace("test('T10 - anon teaser', async () => {});", "// test('T10 - anon teaser', async () => {});") } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-08')); } finally { cleanup(root); }
});

test('FC-13: T15_ENABLED=false while the matrix lists T15 fails; true passes; removing the entry passes', () => {
  const m = makeMatrix({ j01Ids: [{ id: 'T4', project: 'canonical-user' }, { id: 'T15', project: 'canonical-broker' }] });
  const t15 = "test('[role:user] T4 - x', async () => {});\nif (T15_ENABLED) { test('[role:broker] T15 - anon sees LIVE', async () => {}); }\n";
  let root = makeRoot({ matrix: m, sources: { 'listing-lifecycle.canonical.ts': `const T15_ENABLED = false;\n${t15}` } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-13')); } finally { cleanup(root); }
  root = makeRoot({ matrix: m, sources: { 'listing-lifecycle.canonical.ts': `const T15_ENABLED = true;\n${t15}` } });
  try { assert.deepEqual(staticPhase({ root }).errors, []); } finally { cleanup(root); }
  const noT15 = makeMatrix({ j01Ids: [{ id: 'T4', project: 'canonical-user' }] });
  root = makeRoot({ matrix: noT15, sources: { 'listing-lifecycle.canonical.ts': `const T15_ENABLED = false;\n${t15}` } });
  try { assert.deepEqual(staticPhase({ root }).errors, []); } finally { cleanup(root); }
});

test('FC-13: the real matrix lists T15 under J06 and the real source still declares T15_ENABLED', () => {
  const matrix = JSON.parse(fs.readFileSync(path.join(DEFAULT_ROOT, 'e2e/canonical/journey-matrix.json'), 'utf8'));
  const j06 = matrix.rows.find((r) => r.id === 'J06');
  assert.ok(j06.canonical_ids.some((c) => c.id === 'T15' && c.project === 'canonical-broker'));
  assert.match(fs.readFileSync(path.join(DEFAULT_ROOT, 'e2e/canonical/listing-lifecycle.canonical.ts'), 'utf8'), /const T15_ENABLED = true;/);
});

// ---- FC-14 ----------------------------------------------------------------------------------
test('FC-14: production default PROPERTY_REQUESTS_ENABLED:true fails (mutation), :false passes', () => {
  let root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, applicationYml: 'app:\n  property-requests:\n    enabled: ${PROPERTY_REQUESTS_ENABLED:true}\n' });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14')); } finally { cleanup(root); }
  root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC } });
  try { assert.deepEqual(staticPhase({ root }).errors, []); } finally { cleanup(root); }
});

test('FC-14: a missing/renamed property-requests key fails closed (default unprovable)', () => {
  const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, applicationYml: 'app:\n  other: 1\n' });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14')); } finally { cleanup(root); }
});

test('FC-14: a committed non-test config enabling the frontend flag fails', () => {
  const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { 'render.yaml': 'envVars:\n  - key: x\nVITE_PROPERTY_REQUESTS_ENABLED=true\n' } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14')); } finally { cleanup(root); }
});

test('FC-14: workflows may enable it only inside ci.yml e2e-canonical', () => {
  const wf = (job) => `jobs:\n  ${job}:\n    steps:\n      - run: x\n        env:\n          VITE_PROPERTY_REQUESTS_ENABLED: 'true'\n`;
  let root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { '.github/workflows/ci.yml': wf('frontend') } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14')); } finally { cleanup(root); }
  root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { '.github/workflows/ci.yml': wf('e2e-canonical') } });
  try { assert.deepEqual(staticPhase({ root }).errors, []); } finally { cleanup(root); }
  root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { '.github/workflows/e2e-post-deploy.yml': wf('e2e-canonical') } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14')); } finally { cleanup(root); }
});

test('FC-14: RQ ids in the matrix require BOTH flags in the gate script, and ci.yml e2e-canonical must run that script', () => {
  const m = makeMatrix({ j01Ids: [{ id: 'T4', project: 'canonical-user' }, { id: 'RQ1', project: 'canonical-user' }] });
  const src = SRC + "test('[role:user] RQ1 - request', async () => {});\n";
  // The actual wiring: ci.yml delegates to the shared gate script (it sets no flag itself).
  const ciRunsGate = "jobs:\n  e2e-canonical:\n    steps:\n      - name: gate\n        run: bash scripts/run-e2e-gate.sh\n";
  const ciOtherJob = "jobs:\n  frontend:\n    steps:\n      - name: gate\n        run: bash scripts/run-e2e-gate.sh\n";
  const ciNoGate = "jobs:\n  e2e-canonical:\n    steps:\n      - run: npx playwright test\n";
  const ciFlagsOnly = "jobs:\n  e2e-canonical:\n    steps:\n      - run: x\n        env:\n          VITE_PROPERTY_REQUESTS_ENABLED: 'true'\n          PROPERTY_REQUESTS_ENABLED: 'true'\n";
  const gateOn = 'export VITE_PROPERTY_REQUESTS_ENABLED=true\nexport PROPERTY_REQUESTS_ENABLED=true PHONE_ENCRYPTION_KEY="$K"\n';
  const run = (files) => makeRoot({ matrix: m, sources: { 'a.canonical.ts': src }, files });
  let root = makeRoot({ matrix: m, sources: { 'a.canonical.ts': src } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14')); } finally { cleanup(root); }
  root = run({ 'scripts/run-e2e-gate.sh': 'export VITE_PROPERTY_REQUESTS_ENABLED=true\n', '.github/workflows/ci.yml': ciRunsGate });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14'), 'only the VITE flag in the gate is not enough'); } finally { cleanup(root); }
  root = run({ 'scripts/run-e2e-gate.sh': 'export PROPERTY_REQUESTS_ENABLED=true\n', '.github/workflows/ci.yml': ciRunsGate });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14'), 'only the backend flag in the gate is not enough'); } finally { cleanup(root); }
  root = run({ 'scripts/run-e2e-gate.sh': gateOn, '.github/workflows/ci.yml': ciNoGate });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14'), 'ci.yml must run the shared gate script'); } finally { cleanup(root); }
  root = run({ 'scripts/run-e2e-gate.sh': gateOn, '.github/workflows/ci.yml': ciOtherJob });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14'), 'the gate script must be run by the e2e-canonical job, not another job'); } finally { cleanup(root); }
  root = run({ 'scripts/run-e2e-gate.sh': '# nothing here\n', '.github/workflows/ci.yml': ciFlagsOnly });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14'), 'flags set only in ci.yml (the old wiring) are no longer accepted'); } finally { cleanup(root); }
  root = run({ 'scripts/run-e2e-gate.sh': gateOn, '.github/workflows/ci.yml': ciRunsGate });
  try { assert.deepEqual(staticPhase({ root }).errors, []); } finally { cleanup(root); }
});

// ---- FC-14 review r2 (CR LOW-5, SR LOW-2) -----------------------------------------------------
const RQ_M = makeMatrix({ j01Ids: [{ id: 'T4', project: 'canonical-user' }, { id: 'RQ1', project: 'canonical-user' }] });
const RQ_SRC = SRC + "test('[role:user] RQ1 - request', async () => {});\n";
const GATE_ON = 'export VITE_PROPERTY_REQUESTS_ENABLED=true\nexport PROPERTY_REQUESTS_ENABLED=true PHONE_ENCRYPTION_KEY="$K"\n';
const CI_OK = 'jobs:\n  e2e-canonical:\n    steps:\n      - name: gate\n        run: bash scripts/run-e2e-gate.sh\n';
const rqRoot = (files) => makeRoot({ matrix: RQ_M, sources: { 'a.canonical.ts': RQ_SRC }, files });

test('FC-14 r2: control - a real export of both flags + an unconditional ci step passes', () => {
  const root = rqRoot({ 'scripts/run-e2e-gate.sh': GATE_ON, '.github/workflows/ci.yml': CI_OK });
  try { assert.deepEqual(staticPhase({ root }).errors, []); } finally { cleanup(root); }
});

test('FC-14 r2: a flag that appears only in a COMMENT line (or an echo) is not "on" (mutation 17)', () => {
  const variants = {
    'comment replaces the export': 'export VITE_PROPERTY_REQUESTS_ENABLED=true\n# export PROPERTY_REQUESTS_ENABLED=true PHONE_ENCRYPTION_KEY="$K"\n',
    'indented comment': 'export VITE_PROPERTY_REQUESTS_ENABLED=true\n    # PROPERTY_REQUESTS_ENABLED=true\n',
    'echo only': 'export VITE_PROPERTY_REQUESTS_ENABLED=true\necho "PROPERTY_REQUESTS_ENABLED=true"\n',
    'frontend flag only in a comment': '# export VITE_PROPERTY_REQUESTS_ENABLED=true\nexport PROPERTY_REQUESTS_ENABLED=true\n',
  };
  for (const [name, gate] of Object.entries(variants)) {
    const root = rqRoot({ 'scripts/run-e2e-gate.sh': gate, '.github/workflows/ci.yml': CI_OK });
    try { assert.ok(hasFail(staticPhase({ root }), 'FC-14'), name); } finally { cleanup(root); }
  }
});

test('FC-14 r2: ci.yml - `run: echo bash scripts/run-e2e-gate.sh` and a `# run:` comment do not count as running the gate (mutation 16)', () => {
  const ci = (body) => `jobs:\n  e2e-canonical:\n    steps:\n      - name: gate\n${body}`;
  for (const body of ['        run: echo bash scripts/run-e2e-gate.sh\n', '        # run: bash scripts/run-e2e-gate.sh\n        run: echo skipped\n']) {
    const root = rqRoot({ 'scripts/run-e2e-gate.sh': GATE_ON, '.github/workflows/ci.yml': ci(body) });
    try { assert.ok(hasFail(staticPhase({ root }), 'FC-14'), body); } finally { cleanup(root); }
  }
});

test('FC-14 r2: the gate step must be unconditional - `if: false` / `continue-on-error: true` (step or job level) are red; other steps may have them', () => {
  const stepCi = (extra) => `jobs:\n  e2e-canonical:\n    steps:\n      - name: gate\n${extra}        run: bash scripts/run-e2e-gate.sh\n`;
  for (const extra of ['        if: false\n', "        if: ${{ false }}\n", '        continue-on-error: true\n']) {
    const root = rqRoot({ 'scripts/run-e2e-gate.sh': GATE_ON, '.github/workflows/ci.yml': stepCi(extra) });
    try {
      const res = staticPhase({ root });
      assert.ok(hasFail(res, 'FC-14'), extra);
      assert.ok(res.errors.some((e) => /unconditional/.test(e)), extra);
    } finally { cleanup(root); }
  }
  for (const jobKey of ['    if: false\n', '    continue-on-error: true\n']) {
    const ci = `jobs:\n  e2e-canonical:\n${jobKey}    steps:\n      - name: gate\n        run: bash scripts/run-e2e-gate.sh\n`;
    const root = rqRoot({ 'scripts/run-e2e-gate.sh': GATE_ON, '.github/workflows/ci.yml': ci });
    try { assert.ok(hasFail(staticPhase({ root }), 'FC-14'), jobKey); } finally { cleanup(root); }
  }
  const other = "jobs:\n  e2e-canonical:\n    steps:\n      - name: gate\n        run: bash scripts/run-e2e-gate.sh\n      - name: upload\n        if: always()\n        continue-on-error: true\n        run: echo upload\n";
  const root = rqRoot({ 'scripts/run-e2e-gate.sh': GATE_ON, '.github/workflows/ci.yml': other });
  try { assert.deepEqual(staticPhase({ root }).errors, [], 'control: if/continue-on-error on ANOTHER step is fine'); } finally { cleanup(root); }
});

test('FC-14 r2: the backend flag set to true in a deploy config (render.yaml, both forms) / workflow / package script is red; the VITE flag does not trip the backend rule', () => {
  const cases = {
    'render.yaml': ['envVars:\n  - key: PROPERTY_REQUESTS_ENABLED\n    value: "true"\n', 'envVars:\n  - key: x\nPROPERTY_REQUESTS_ENABLED=true\n'],
    'apps/api/render.yaml': ['envVars:\n  - key: PROPERTY_REQUESTS_ENABLED\n    value: true\n'],
    '.env.production': ['PROPERTY_REQUESTS_ENABLED=true\n'],
  };
  for (const [file, bodies] of Object.entries(cases)) {
    for (const body of bodies) {
      const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { [file]: body } });
      try {
        const res = staticPhase({ root });
        assert.ok(res.errors.some((e) => e.includes('FAIL[FC-14]') && e.includes('PROPERTY_REQUESTS_ENABLED') && !e.includes('VITE_PROPERTY')), `${file}: ${body}`);
      } finally { cleanup(root); }
    }
  }
  const wf = (job) => `jobs:\n  ${job}:\n    steps:\n      - run: x\n        env:\n          PROPERTY_REQUESTS_ENABLED: 'true'\n`;
  let root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { '.github/workflows/ci.yml': wf('backend') } });
  try { assert.ok(hasFail(staticPhase({ root }), 'FC-14')); } finally { cleanup(root); }
  root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { '.github/workflows/ci.yml': wf('e2e-canonical') } });
  try { assert.deepEqual(staticPhase({ root }).errors, [], 'control: ci.yml e2e-canonical may'); } finally { cleanup(root); }
  root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { 'render.yaml': 'envVars:\n  - key: VITE_PROPERTY_REQUESTS_ENABLED\n    value: "false"\n  - key: PROPERTY_REQUESTS_ENABLED\n    value: "false"\n' } });
  try { assert.deepEqual(staticPhase({ root }).errors, [], 'control: false values pass'); } finally { cleanup(root); }
});

// CR r2 cycle2 LOW-D: the other spellings of the backend flag (apps/api application.yml: app.property-requests.enabled).
test('FC-14 r2 LOW-D: Dockerfile space form, Spring relaxed-binding names, the dotted property and the nested yaml form are each red; false/commented/VITE controls are green', () => {
  const red = {
    'apps/api/Dockerfile': ['FROM x\nENV PROPERTY_REQUESTS_ENABLED true\n', 'ENV PROPERTY_REQUESTS_ENABLED "true"\n'],
    'docker-compose.yml': ['environment:\n  - APP_PROPERTYREQUESTS_ENABLED=true\n', 'environment:\n  APP_PROPERTY_REQUESTS_ENABLED: "true"\n'],
    'apps/api/.env.production': ['APP_PROPERTYREQUESTS_ENABLED=true\n', 'JAVA_OPTS=-Dapp.property-requests.enabled=true\n'],
    'render.yaml': ['startCommand: java -Dapp.property-requests.enabled=true -jar x.jar\n', 'app.property-requests.enabled: true\n'],
    'apps/api/fly.toml': ['app:\n  property-requests:\n    enabled: true\n'],
  };
  for (const [file, bodies] of Object.entries(red)) {
    for (const body of bodies) {
      const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { [file]: body } });
      try {
        const res = staticPhase({ root });
        assert.ok(res.errors.some((e) => e.includes('FAIL[FC-14]') && e.includes(file)), `${file}: ${JSON.stringify(body)} must be red; got ${JSON.stringify(res.errors)}`);
      } finally { cleanup(root); }
    }
  }
  const green = {
    'apps/api/Dockerfile': ['FROM x\nENV PROPERTY_REQUESTS_ENABLED false\nENV VITE_PROPERTY_REQUESTS_ENABLED false\n'],
    'docker-compose.yml': ['environment:\n  - APP_PROPERTYREQUESTS_ENABLED=false\n  APP_PROPERTY_REQUESTS_ENABLED: "false"\n'],
    'render.yaml': ['startCommand: java -Dapp.property-requests.enabled=false -jar x.jar\napp:\n  property-requests:\n    enabled: false\n'],
  };
  for (const [file, bodies] of Object.entries(green)) {
    for (const body of bodies) {
      const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC }, files: { [file]: body } });
      try { assert.deepEqual(staticPhase({ root }).errors, [], `control ${file}: ${JSON.stringify(body)}`); } finally { cleanup(root); }
    }
  }
});

// ---- list phase -----------------------------------------------------------------------------
test('list: passes on a complete synthetic roster', () => {
  const f = io({ list: listJson() });
  try { assert.deepEqual(listPhase({ matrix: MATRIX, listPath: f.list, env: {} }).errors, []); } finally { cleanup(f.dir); }
});

test('FC-01 list: missing file fails', () => {
  const res = listPhase({ matrix: MATRIX, listPath: '/nonexistent/list.json', env: {} });
  assert.ok(hasFail(res, 'FC-01'));
});

test('FC-02 list: unparseable JSON fails', () => {
  const f = io({ list: '{"suites": [' });
  try { assert.ok(hasFail(listPhase({ matrix: MATRIX, listPath: f.list, env: {} }), 'FC-02')); } finally { cleanup(f.dir); }
});

test('FC-08 list: a matrix id that collected zero tests fails (rename mutation)', () => {
  const tests = baseTests().map((t) => (t.title.startsWith('T10') ? { ...t, title: 'T10x - renamed' } : t));
  const f = io({ list: listJson(tests) });
  try { assert.ok(hasFail(listPhase({ matrix: MATRIX, listPath: f.list, env: {} }), 'FC-08')); } finally { cleanup(f.dir); }
});

test('FC-09 list: id collected in the wrong project (lost [role:x] tag) fails', () => {
  const tests = baseTests().map((t) => (t.title.includes('T4') ? { ...t, project: 'canonical-anon' } : t));
  const f = io({ list: listJson(tests) });
  try { assert.ok(hasFail(listPhase({ matrix: MATRIX, listPath: f.list, env: {} }), 'FC-09')); } finally { cleanup(f.dir); }
});

test('list: a project with zero tests fails the roster', () => {
  const tests = baseTests().filter((t) => t.project !== 'canonical-admin');
  const f = io({ list: listJson(tests) });
  try { assert.ok(hasFail(listPhase({ matrix: MATRIX, listPath: f.list, env: {} }), 'FC-roster')); } finally { cleanup(f.dir); }
});

test('FC-12 list: deleting CC1 is not hidden by CC1b surviving', () => {
  const m = makeMatrix({ j01Ids: [{ id: 'CC1', project: 'canonical-broker' }] });
  const tests = baseTests().filter((t) => !t.title.includes('CC1')).concat([{ project: 'canonical-broker', title: '[role:broker] CC1b - second' }]);
  const f = io({ list: listJson(tests) });
  try { assert.ok(hasFail(listPhase({ matrix: m, listPath: f.list, env: {} }), 'FC-08')); } finally { cleanup(f.dir); }
});

test('FC-15 list: CANONICAL_SKIP_SHA_PROVENANCE set is refused', () => {
  const f = io({ list: listJson() });
  try { assert.ok(hasFail(listPhase({ matrix: MATRIX, listPath: f.list, env: { CANONICAL_SKIP_SHA_PROVENANCE: '1' } }), 'FC-15')); } finally { cleanup(f.dir); }
});

// ---- results phase --------------------------------------------------------------------------
const results = (over = {}, list = listJson()) => {
  const f = io({ list, res: over.res ?? runJson() });
  return { f, run: (env = {}, extra = {}) => resultsPhase({ matrix: MATRIX, resultsPath: f.res, listPath: f.list, env, ...extra }) };
};

test('results: a fully green run passes and reports listed/executed counts', () => {
  const { f, run } = results();
  try {
    const res = run();
    assert.deepEqual(res.errors, []);
    assert.ok(res.info.some((l) => /listed=8 executed=8/.test(l)));
  } finally { cleanup(f.dir); }
});

test('FC-01 results: missing results.json fails', () => {
  const f = io({ list: listJson() });
  try {
    const res = resultsPhase({ matrix: MATRIX, resultsPath: path.join(f.dir, 'nope.json'), listPath: f.list, env: {} });
    assert.ok(hasFail(res, 'FC-01'));
  } finally { cleanup(f.dir); }
});

test('FC-02 results: truncated results.json fails', () => {
  const f = io({ list: listJson(), res: '{"stats": {"expected": 5' });
  try { assert.ok(hasFail(resultsPhase({ matrix: MATRIX, resultsPath: f.res, listPath: f.list, env: {} }), 'FC-02')); } finally { cleanup(f.dir); }
});

test('FC-03 results: stats.unexpected>0 fails', () => {
  const tests = baseTests().map((t, i) => (i === 0 ? { ...t, status: 'unexpected', results: ['failed'] } : t));
  const { f, run } = results({ res: runJson(tests, { expected: 4, unexpected: 1, flaky: 0, skipped: 0 }) });
  try { assert.ok(hasFail(run(), 'FC-03')); } finally { cleanup(f.dir); }
});

test('FC-04 results: stats.skipped>0 fails', () => {
  const tests = baseTests().map((t, i) => (i === 2 ? { ...t, status: 'skipped', results: ['skipped'] } : t));
  const { f, run } = results({ res: runJson(tests, { expected: 4, unexpected: 0, flaky: 0, skipped: 1 }) });
  try { assert.ok(hasFail(run(), 'FC-04')); } finally { cleanup(f.dir); }
});

test('FC-05 results: stats.flaky>0 fails', () => {
  const tests = baseTests().map((t, i) => (i === 0 ? { ...t, status: 'flaky', results: ['failed', 'passed'] } : t));
  const { f, run } = results({ res: runJson(tests, { expected: 4, unexpected: 0, flaky: 1, skipped: 0 }) });
  try { assert.ok(hasFail(run(), 'FC-05')); } finally { cleanup(f.dir); }
});

test('FC-06 results: an interrupted result fails', () => {
  const tests = baseTests().map((t, i) => (i === 1 ? { ...t, status: 'unexpected', results: ['interrupted'] } : t));
  const { f, run } = results({ res: runJson(tests, { expected: 4, unexpected: 1, flaky: 0, skipped: 0 }) });
  try { assert.ok(hasFail(run(), 'FC-06')); } finally { cleanup(f.dir); }
});

test('FC-07 results: a setup-project failure cascading to skipped dependents fails (and so does a top-level error)', () => {
  const tests = [
    { project: 'canonical-setup-user', title: '[role:user] mint storageState', status: 'unexpected', results: ['failed'] },
    { project: 'canonical-user', title: '[role:user] T4 - x', status: 'skipped', results: [] },
    { project: 'canonical-anon', title: 'T10 - anon', status: 'expected', results: ['passed'] },
    { project: 'canonical-anon', describe: 'canonical harness smoke', title: 'x', status: 'expected', results: ['passed'] },
  ];
  let { f, run } = results({ res: runJson(tests, { expected: 2, unexpected: 1, flaky: 0, skipped: 1 }) });
  try {
    const res = run();
    assert.ok(hasFail(res, 'FC-03') && hasFail(res, 'FC-04'));
    assert.ok(hasFail(res, 'FC-10'), 'T4 has no executed pass');
  } finally { cleanup(f.dir); }
  ({ f, run } = results({ res: pwJson({ tests: baseTests(), stats: passingStats(5), errors: [{ message: 'globalSetup failed: backend unreachable' }] }) }));
  try { assert.ok(hasFail(run(), 'FC-07')); } finally { cleanup(f.dir); }
});

test('FC-10 results: a matrix id that was collected but did not pass fails; one never executed fails', () => {
  const tests = baseTests().filter((t) => !t.title.includes('T4'));
  const { f, run } = results({ res: runJson(tests) });
  try { assert.ok(hasFail(run(), 'FC-10')); } finally { cleanup(f.dir); }
});

test('FC-11 results: executed count != listed count fails (silent drop)', () => {
  const { f, run } = results({ res: runJson(baseTests().slice(0, 4)) });
  try { assert.ok(hasFail(run(), 'FC-11')); } finally { cleanup(f.dir); }
});

test('FC-11 results: --list is mandatory', () => {
  const f = io({ res: runJson() });
  try { assert.ok(hasFail(resultsPhase({ matrix: MATRIX, resultsPath: f.res, env: {} }), 'FC-11')); } finally { cleanup(f.dir); }
});

test('FC-15 results: provenance opt-out invalidates the results', () => {
  const { f, run } = results();
  try { assert.ok(hasFail(run({ CANONICAL_SKIP_SHA_PROVENANCE: 'true' }), 'FC-15')); } finally { cleanup(f.dir); }
});

// ---- K3 credential scan ---------------------------------------------------------------------
test('K3: a planted credential literal in results.json is caught and never echoed', () => {
  const planted = 'Zq9-planted-secret-value';
  const tests = baseTests();
  const res = runJson(tests);
  res.suites[0].specs = res.suites[0].specs ?? [];
  res.errors = [];
  res.config = { note: `typed ${planted} into the form` };
  const { f, run } = results({ res });
  try {
    const out = run({ ADMIN_PASSWORD: planted });
    assert.ok(hasFail(out, 'FC-K3'));
    assert.ok(out.errors.every((e) => !e.includes(planted)), 'the value must never appear in the failure text');
    assert.ok(out.errors.some((e) => e.includes('ADMIN_PASSWORD')), 'the NAME is reported');
  } finally { cleanup(f.dir); }
});

test('K3: a planted literal in a report dir / traces dir is caught; clean dirs and short values pass', () => {
  const d = tmpDir();
  try {
    const report = path.join(d, 'report');
    const traces = path.join(d, 'traces');
    fs.mkdirSync(path.join(report, 'data'), { recursive: true });
    fs.mkdirSync(traces, { recursive: true });
    fs.writeFileSync(path.join(report, 'data', 'a.txt'), 'nothing here');
    fs.writeFileSync(path.join(traces, 'b.txt'), 'typed SMOKE-pass-123456 here');
    const env = { SMOKE_USER_PASSWORD: 'SMOKE-pass-123456', ADMIN_PASSWORD: 'abc' };
    const errs = scanForCredentialValues({ paths: [report, traces], env });
    assert.equal(errs.length, 1);
    assert.match(errs[0], /SMOKE_USER_PASSWORD/);
    assert.deepEqual(scanForCredentialValues({ paths: [report], env }), []);
  } finally { cleanup(d); }
});

test('K3 CLI: a leaked credential literal exits 4 (CI purges the artefacts), a plain failure exits 1', () => {
  const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC } });
  const res = runJson();
  res.config = { note: 'typed Leak-value-9876 here' };
  const f = io({ list: listJson(), res });
  try {
    const args = [SCRIPT, '--phase=results', '--root', root, '--list', f.list, '--results', f.res];
    const leak = spawnSync('node', args, { encoding: 'utf8', env: { ...process.env, ADMIN_PASSWORD: 'Leak-value-9876' } });
    assert.equal(leak.status, 4);
    assert.doesNotMatch(leak.stderr + leak.stdout, /Leak-value-9876/);
    const plain = spawnSync('node', [SCRIPT, '--phase=results', '--root', root, '--list', f.list, '--results', path.join(f.dir, 'missing.json')], { encoding: 'utf8', env: { ...process.env, ADMIN_PASSWORD: '' } });
    assert.equal(plain.status, 1);
  } finally { cleanup(root); cleanup(f.dir); }
});

// ---- review cycle 1 --------------------------------------------------------------------------
function zipLocal(name, data, { method = 8 } = {}) {
  const raw = Buffer.from(data);
  const body = method === 8 ? zlib.deflateRawSync(raw) : raw;
  const nm = Buffer.from(name);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(method, 8);
  h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
  return { bytes: Buffer.concat([h, nm, body]), name: nm, method, csize: body.length, usize: raw.length };
}
/** A real zip (local headers + central directory + EOCD); central=false leaves only local headers. */
function makeZip(entries, { central = true } = {}) {
  const locals = entries.map(([n, d, o]) => zipLocal(n, d, o));
  const parts = [];
  const offsets = [];
  let off = 0;
  for (const l of locals) { offsets.push(off); parts.push(l.bytes); off += l.bytes.length; }
  if (!central) return Buffer.concat(parts);
  const cdStart = off;
  const cds = locals.map((l, i) => {
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(l.method, 10);
    c.writeUInt32LE(l.csize, 20); c.writeUInt32LE(l.usize, 24); c.writeUInt16LE(l.name.length, 28); c.writeUInt32LE(offsets[i], 42);
    return Buffer.concat([c, l.name]);
  });
  const cd = Buffer.concat(cds);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...parts, cd, e]);
}
const writeBin = (dir, rel, buf) => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  return p;
};
const SECRET = 'Zipped-Secret-Value-77';
const SENV = { BROKER_PASSWORD: SECRET };

test('BLOCKING: an invalid matrix makes the LIST and RESULTS phases exit 1 (shape errors were dropped)', () => {
  const bad = makeMatrix({ j01Ids: [{ id: 'T4', project: 'canonical-user' }, { id: 'T10', project: 'canonical-anon' }], harness: MATRIX.harness });
  bad.rows = bad.rows.filter((r) => r.id !== 'J12');
  const dir = tmpDir();
  const f = io({ list: listJson(), res: runJson() });
  const mBad = writeJson(dir, 'bad.json', bad);
  const mGood = writeJson(dir, 'good.json', MATRIX);
  const quiet = (argv) => { const w = process.stderr.write; process.stderr.write = () => true; try { return main(argv, {}); } finally { process.stderr.write = w; } };
  try {
    for (const phase of ['list', 'results']) {
      const base = [`--phase=${phase}`, '--list', f.list, ...(phase === 'results' ? ['--results', f.res] : [])];
      assert.equal(quiet([...base, '--matrix', mGood]), 0, `${phase}: control with a valid matrix passes`);
      assert.equal(quiet([...base, '--matrix', mBad]), 1, `${phase}: an invalid matrix must fail`);
    }
  } finally { cleanup(dir); cleanup(f.dir); }
});

test('the matrix cannot certify itself: statuses, required_projects and required_setup_projects are pinned in the checker', () => {
  const load = (mut) => {
    const m = makeMatrix({ j01Ids: [{ id: 'T4', project: 'canonical-user' }] });
    mut(m);
    const d = tmpDir();
    try { return loadMatrix(writeJson(d, 'm.json', m)).errors; } finally { cleanup(d); }
  };
  assert.ok(load((m) => { m.statuses.push('WAIVED'); }).some((e) => e.includes('"statuses" must be exactly')));
  assert.ok(load((m) => { m.statuses = m.statuses.filter((s) => s !== 'GAP_CLOSING_IN_C2'); }).some((e) => e.includes('"statuses" must be exactly')));
  assert.ok(load((m) => { m.required_projects = ['canonical-anon']; }).some((e) => e.includes('"required_projects" must be exactly')));
  assert.ok(load((m) => { m.required_setup_projects = []; }).some((e) => e.includes('"required_setup_projects" must be exactly')));
  assert.ok(load((m) => { m.rows[1].status = 'WAIVED'; }).some((e) => e.includes('unknown status "WAIVED"')));
  assert.deepEqual(load(() => {}), []);
});

test('GAP_CLOSING_IN_C2: static WARNs (exit 0); list and results FAIL with "PR-1 incomplete", even with no ids', () => {
  const gap = makeMatrix({ j01Ids: [{ id: 'T4', project: 'canonical-user' }, { id: 'T10', project: 'canonical-anon' }], harness: MATRIX.harness, extraRows: { J12: { status: 'GAP_CLOSING_IN_C2' } } });
  const root = makeRoot({ matrix: gap, sources: { 'a.canonical.ts': SRC } });
  const f = io({ list: listJson(), res: runJson() });
  try {
    const st = staticPhase({ root });
    assert.deepEqual(st.errors, []);
    assert.ok(st.info.some((l) => l.startsWith('WARN: journey J12')));
    const li = listPhase({ matrix: gap, listPath: f.list, env: {} });
    assert.ok(li.errors.includes('FAIL[FC-GAP] PR-1 incomplete: journey J12 gap not closed (C2)'));
    assert.equal(li.ok, false);
    const re = resultsPhase({ matrix: gap, resultsPath: f.res, listPath: f.list, env: {} });
    assert.ok(re.errors.includes('FAIL[FC-GAP] PR-1 incomplete: journey J12 gap not closed (C2)'));
    assert.equal(re.ok, false);
    const w = process.stderr.write;
    process.stderr.write = () => true;
    try { assert.equal(main(['--phase=static', '--root', root], {}), 0); } finally { process.stderr.write = w; }
  } finally { cleanup(root); cleanup(f.dir); }
});

test('FC-12: T1_x does not satisfy T1 (underscore is part of the id token)', () => {
  assert.equal(segmentMatches('T1_x - something', 'T1'), false);
  assert.equal(segmentMatches('T1 - something', 'T1'), true);
  assert.equal(segmentMatches('T1', 'T1'), true);
});

test('K3: a credential inside a deflated zip entry (trace.zip) is detected; the name is reported, never the value', () => {
  const d = tmpDir();
  try {
    writeBin(d, 'traces/t/trace.zip', makeZip([['0-trace.trace', `{"type":"input","value":"${SECRET}"}`], ['x.txt', 'clean']]));
    writeBin(d, 'clean/clean.zip', makeZip([['0-trace.trace', 'nothing to see']]));
    const errs = scanForCredentialValues({ paths: [path.join(d, 'traces')], env: SENV });
    assert.equal(errs.length, 1);
    assert.match(errs[0], /BROKER_PASSWORD/);
    assert.ok(!errs[0].includes(SECRET));
    assert.deepEqual(scanForCredentialValues({ paths: [path.join(d, 'clean')], env: SENV }), []);
    // sanity: the literal really is NOT visible to a raw byte scan of the container (deflated)
    assert.equal(fs.readFileSync(path.join(d, 'traces/t/trace.zip')).includes(Buffer.from(SECRET)), false);
  } finally { cleanup(d); }
});

test('K3: a zip with local headers only (no central directory) and a STORED entry are scanned too', () => {
  const d = tmpDir();
  try {
    writeBin(d, 'a.zip', makeZip([['a.txt', `x ${SECRET} y`]], { central: false }));
    writeBin(d, 'b.zip', makeZip([['b.txt', `x ${SECRET} y`, { method: 0 }]]));
    assert.equal(scanForCredentialValues({ paths: [path.join(d, 'a.zip')], env: SENV }).length, 1);
    assert.equal(scanForCredentialValues({ paths: [path.join(d, 'b.zip')], env: SENV }).length, 1);
  } finally { cleanup(d); }
});

test('K3: the HTML report base64 zip is inflated; a nested zip inside it is too', () => {
  const d = tmpDir();
  try {
    const inner = makeZip([['report.json', `{"steps":["fill ${SECRET}"]}`]]);
    const outer = makeZip([['nested.zip', inner]]);
    const html = `<html><script>window.playwrightReportBase64 = "data:application/zip;base64,${outer.toString('base64')}";</script></html>`;
    writeBin(d, 'report/index.html', Buffer.from(html));
    writeBin(d, 'ok/index.html', Buffer.from(`<html><script>x = "data:application/zip;base64,${makeZip([['r.json', '{}']]).toString('base64')}";</script></html>`));
    const errs = scanForCredentialValues({ paths: [path.join(d, 'report')], env: SENV });
    assert.equal(errs.length, 1);
    assert.match(errs[0], /index\.html/);
    assert.deepEqual(scanForCredentialValues({ paths: [path.join(d, 'ok')], env: SENV }), []);
  } finally { cleanup(d); }
});

test('K3 scan phase: scope == purge set (a hit purges EVERY scan path incl. the backend log); a clean scan purges nothing', () => {
  const d = tmpDir();
  try {
    const report = path.join(d, 'playwright-report');
    const results = path.join(d, 'test-results');
    const backendLog = path.join(d, 'backend.log');
    writeBin(d, 'playwright-report/index.html', Buffer.from('<html></html>'));
    writeBin(d, 'test-results/canonical/results.json', Buffer.from('{}'));
    writeBin(d, 'test-results/gate/run.log', Buffer.from('ok'));
    fs.writeFileSync(backendLog, `login as ${SECRET} failed`);
    const clean = scanPhase({ scanPaths: [report, results], purge: true, env: SENV });
    assert.equal(clean.ok, true);
    assert.ok(fs.existsSync(report) && fs.existsSync(results));
    const hit = scanPhase({ scanPaths: [report, results, backendLog], purge: true, env: SENV });
    assert.equal(hit.ok, false);
    assert.ok(hit.errors.some((e) => e.includes('BROKER_PASSWORD') && e.includes('backend.log')));
    assert.ok(![report, results, backendLog].some((p) => fs.existsSync(p)), 'all scan paths purged');
    assert.equal(scanPhase({ scanPaths: [], env: SENV }).ok, false, 'no scan path is a failure, not a pass');
  } finally { cleanup(d); }
});

test('K3 CLI: --phase=scan exits 4 on a hit (and purges with --purge), 0 when clean, and never echoes the value', () => {
  const d = tmpDir();
  try {
    const log = path.join(d, 'run.log');
    fs.writeFileSync(log, `echo ${SECRET}`);
    const env = { ...process.env, BROKER_PASSWORD: SECRET };
    const noPurge = spawnSync('node', [SCRIPT, '--phase=scan', '--scan-path', log], { encoding: 'utf8', env });
    assert.equal(noPurge.status, 4);
    assert.ok(fs.existsSync(log));
    assert.doesNotMatch(noPurge.stderr + noPurge.stdout, new RegExp(SECRET));
    const purged = spawnSync('node', [SCRIPT, '--phase=scan', '--purge', '--scan-path', log, '--scan-path', path.join(d, 'absent')], { encoding: 'utf8', env });
    assert.equal(purged.status, 4);
    assert.equal(fs.existsSync(log), false);
    fs.writeFileSync(log, 'clean');
    assert.equal(spawnSync('node', [SCRIPT, '--phase=scan', '--purge', '--scan-path', log], { encoding: 'utf8', env }).status, 0);
    assert.ok(fs.existsSync(log));
  } finally { cleanup(d); }
});

// ---- review cycle 2: K3 fails closed on anything it cannot scan ---------------------------------
/** Rewrites the method field of every header in a makeZip() buffer (local + central) to an unsupported value. */
function withMethod(zip, method) {
  const b = Buffer.from(zip);
  for (let i = 0; i + 4 <= b.length; i += 1) {
    const sig = b.readUInt32LE(i);
    if (sig === 0x04034b50) b.writeUInt16LE(method, i + 8);
    if (sig === 0x02014b50) b.writeUInt16LE(method, i + 10);
  }
  return b;
}
const k3Unscannable = (errs) => errs.filter((e) => e.startsWith('FAIL[FC-K3] unscannable'));

test('K3 cycle 2: a zip entry using an unsupported method (12) is FAIL[FC-K3] unscannable, not clean', () => {
  const d = tmpDir();
  try {
    writeBin(d, 'x/trace.zip', withMethod(makeZip([['0-trace.trace', `{"v":"${SECRET}"}`]]), 12));
    const errs = scanForCredentialValues({ paths: [path.join(d, 'x')], env: SENV });
    assert.equal(k3Unscannable(errs).length, 1, errs.join('\n'));
    assert.match(errs[0], /compression method 12/);
    assert.ok(!errs.join('\n').includes(SECRET));
    // control: the same archive with a supported method is clean
    writeBin(d, 'ok/trace.zip', makeZip([['0-trace.trace', '{"v":"nothing"}']]));
    assert.deepEqual(scanForCredentialValues({ paths: [path.join(d, 'ok')], env: SENV }), []);
  } finally { cleanup(d); }
});

test('K3 cycle 2: a deflated entry that cannot be inflated (corrupt) is unscannable', () => {
  const d = tmpDir();
  try {
    const z = makeZip([['0-trace.trace', 'x'.repeat(200)]]);
    // overwrite the deflate body (after the 30-byte header + 12-byte name) with garbage that is not a valid stream
    for (let i = 30 + '0-trace.trace'.length; i < 30 + '0-trace.trace'.length + 6; i += 1) z[i] = 0xff;
    writeBin(d, 'x/bad.zip', z);
    assert.equal(k3Unscannable(scanForCredentialValues({ paths: [path.join(d, 'x')], env: SENV })).length, 1);
  } finally { cleanup(d); }
});

test('K3 cycle 2: a zip nested deeper than the depth cap is unscannable; one at the cap boundary is not', () => {
  const d = tmpDir();
  try {
    const nest = (levels) => {
      let z = makeZip([['leaf.txt', 'clean']]);
      for (let i = 0; i < levels; i += 1) z = makeZip([['n.zip', z]]);
      return z;
    };
    writeBin(d, 'deep/deep.zip', nest(4));
    writeBin(d, 'shallow/shallow.zip', nest(1));
    assert.equal(k3Unscannable(scanForCredentialValues({ paths: [path.join(d, 'deep')], env: SENV })).length, 1);
    assert.deepEqual(scanForCredentialValues({ paths: [path.join(d, 'shallow')], env: SENV }), []);
  } finally { cleanup(d); }
});

test('K3 cycle 2: an unreadable file is unscannable (fail closed), the name is reported', { skip: process.getuid?.() === 0 ? 'root can read mode-000 files' : false }, () => {
  const d = tmpDir();
  try {
    const p = writeBin(d, 'x/locked.log', Buffer.from('anything'));
    fs.chmodSync(p, 0o000);
    const errs = scanForCredentialValues({ paths: [path.join(d, 'x')], env: SENV });
    fs.chmodSync(p, 0o600);
    assert.equal(k3Unscannable(errs).length, 1);
    assert.match(errs[0], /locked\.log/);
  } finally { cleanup(d); }
});

test('K3 cycle 2 CLI: unscannable exits 4 and purges; a usage error is FC-USAGE with exit 2 and does not purge', () => {
  const d = tmpDir();
  try {
    const dir = path.join(d, 'artefacts');
    writeBin(d, 'artefacts/t.zip', withMethod(makeZip([['a', 'b']]), 12));
    const env = { ...process.env, BROKER_PASSWORD: SECRET };
    const r = spawnSync('node', [SCRIPT, '--phase=scan', '--purge', '--scan-path', dir], { encoding: 'utf8', env });
    assert.equal(r.status, 4);
    assert.match(r.stderr, /FAIL\[FC-K3\] unscannable/);
    assert.equal(fs.existsSync(dir), false, 'the unscannable artefact directory is purged');
    const usage = spawnSync('node', [SCRIPT, '--phase=scan'], { encoding: 'utf8', env });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /FAIL\[FC-USAGE\]/);
    assert.doesNotMatch(usage.stderr, /FC-K3/);
    assert.equal(scanPhase({ scanPaths: [] }).errors[0].startsWith('FAIL[FC-USAGE]'), true);
  } finally { cleanup(d); }
});

test('K3 cycle 2: the generated role passwords and the per-run stack secrets are on the scan list (by name)', () => {
  for (const n of ['ADMIN_PASSWORD', 'BROKER_PASSWORD', 'SMOKE_USER_PASSWORD', 'E2E_AUTH_AUTHENTICATOR_PASSWORD', 'E2E_AUTH_GOTRUE_JWT_SECRET', 'E2E_AUTH_SERVICE_ROLE_KEY']) {
    assert.ok(CREDENTIAL_ENV_NAMES.includes(n), n);
  }
  const d = tmpDir();
  try {
    const p = writeBin(d, 'x/backend.log', Buffer.from('leaked 0123456789abcdef0123 in log'));
    const errs = scanForCredentialValues({ paths: [path.join(d, 'x')], env: { E2E_AUTH_AUTHENTICATOR_PASSWORD: '0123456789abcdef0123' } });
    assert.equal(errs.length, 1);
    assert.match(errs[0], /E2E_AUTH_AUTHENTICATOR_PASSWORD/);
    assert.ok(fs.existsSync(p));
  } finally { cleanup(d); }
});

test('cycle 2: only J12/J13/J15 may be DESCOPED_DARK; any other row flipped to it is a matrix error', () => {
  const load = (mut) => {
    const m = makeMatrix({ j01Ids: [{ id: 'T4', project: 'canonical-user' }] });
    mut(m);
    const d = tmpDir();
    try { return loadMatrix(writeJson(d, 'm.json', m)).errors; } finally { cleanup(d); }
  };
  const reason = 'dark in production behind a flag, documented';
  assert.deepEqual(DESCOPABLE_IDS, ['J12', 'J13', 'J15']);
  for (const id of DESCOPABLE_IDS) {
    assert.deepEqual(load((m) => { const r = m.rows.find((x) => x.id === id); r.status = 'DESCOPED_DARK'; r.notes = reason; }), [], `${id} may be descoped`);
  }
  for (const id of ['J06', 'J08', 'J10', 'J14', 'J16', 'J01']) {
    const errs = load((m) => { const r = m.rows.find((x) => x.id === id); r.status = 'DESCOPED_DARK'; r.notes = reason; });
    assert.ok(errs.some((e) => e.includes(`${id} is DESCOPED_DARK but only J12, J13, J15 may be descoped`)), id);
  }
});

// ---- CLI ------------------------------------------------------------------------------------
test('CLI: exit codes 0 / 1 / 2 and one FAIL line per problem on stderr', () => {
  const root = makeRoot({ matrix: MATRIX, sources: { 'a.canonical.ts': SRC } });
  const f = io({ list: listJson() });
  try {
    const ok = spawnSync('node', [SCRIPT, '--phase=static', '--root', root], { encoding: 'utf8', env: { ...process.env } });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /CANONICAL JOURNEYS STATIC: PASS/);
    const bad = spawnSync('node', [SCRIPT, '--phase=list', '--root', root, '--list', f.list], { encoding: 'utf8', env: { ...process.env, CANONICAL_SKIP_SHA_PROVENANCE: '1' } });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /FAIL\[FC-15\]/);
    const usage = spawnSync('node', [SCRIPT, '--phase=bogus'], { encoding: 'utf8' });
    assert.equal(usage.status, 2);
    assert.equal(main(['--phase=nope']), 2);
  } finally { cleanup(root); cleanup(f.dir); }
});
