// node --test scripts/e2e/check-e2e-estate.test.mjs  (issue #2750; FC-17..FC-19, FC-24, K4)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_ID_SHAPE,
  checkEstate,
  DEFAULT_ROOT,
  EXPECTED_CONFIGS,
  HEADER,
  ISSUE_2751_FILES,
  ISSUE_2751_TOTAL,
  MANIFEST_REL,
  parseCsv,
} from './check-e2e-estate.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-e2e-estate.mjs');
const has = (res, code, needle = '') => res.errors.some((e) => e.includes(`FAIL[${code}]`) && e.includes(needle));

/** A tiny consistent estate: 2 legacy specs (one will be retired later), configs, canonical dir. */
function world(mut = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-estate-'));
  const put = (rel, txt = '') => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt);
  };
  const files = {
    'e2e/a.spec.ts': "test('a', () => {});",
    'e2e/b.spec.ts': "test('b', () => {});",
    'e2e/canonical/x.canonical.ts': "test('T1 - x', () => {});",
    'e2e/canonical/support/helper.ts': 'export const h = 1;',
    ...Object.fromEntries(EXPECTED_CONFIGS.map((c) => [c, 'export default {};'])),
    ...(mut.files ?? {}),
  };
  for (const [k, v] of Object.entries(files)) if (v !== null) put(k, v);
  const rows = mut.rows ?? [
    ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'covered by T1', 'PR-3', String(ISSUE_2751_TOTAL), 'SCHEDULED(PR-3)'],
    ['e2e/b.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/b.test.ts', 'component rule', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ];
  const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  put(MANIFEST_REL, [HEADER, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n');
  return root;
}
const clean = (root) => fs.rmSync(root, { recursive: true, force: true });
// The synthetic world only has two rows, so give every #2751 file a row too by reusing the real rule:
// FC-24 is exercised separately; for the other arms we disable it by using trackedFiles and ignoring FC-24 noise.
const nonFc24 = (res) => ({ ...res, errors: res.errors.filter((e) => !e.includes('FAIL[FC-24]')) });

test('parseCsv handles quotes, escaped quotes and embedded commas', () => {
  const rows = parseCsv('a,"b,c","d ""q"""\n1,2,3\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
});

test('real repo: the committed manifest and tree are consistent (FC-17/18/19/24, K4)', () => {
  const res = checkEstate({ root: DEFAULT_ROOT });
  assert.deepEqual(res.errors, []);
  assert.match(res.info.join('\n'), /issue_2751_titles=66/);
});

test('real repo: manifest has no PENDING/NEEDS_REVIEW and every #2751 file has titles', () => {
  const txt = fs.readFileSync(path.join(DEFAULT_ROOT, MANIFEST_REL), 'utf8');
  assert.doesNotMatch(txt, /\b(PENDING|NEEDS_REVIEW)\b/);
  const rows = parseCsv(txt).slice(1).filter((r) => r.length > 1);
  for (const f of ISSUE_2751_FILES) {
    const row = rows.find((r) => r[0] === f);
    assert.ok(row && Number(row[6]) >= 1, f);
  }
  assert.equal(rows.length, 217);
});

test('consistent synthetic estate passes (aside from FC-24 which needs the real file list)', () => {
  const root = world();
  try {
    const res = nonFc24(checkEstate({ root, trackedFiles: [] }));
    assert.deepEqual(res.errors, []);
  } finally { clean(root); }
});

test('FC-17: a new unlisted spec fails and the message cites the #2750 rule', () => {
  const root = world({ files: { 'e2e/zz-new.spec.ts': "test('new', () => {});" } });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-17', 'e2e/zz-new.spec.ts'));
    assert.ok(res.errors.some((e) => e.includes('new permanent Playwright coverage must extend the canonical suite')));
  } finally { clean(root); }
});

test('FC-17: every matchable extension is covered (.test.ts, .spec.mjs, .spec.tsx) and e2e-parity/ too', () => {
  const root = world({ files: { 'e2e/c.test.ts': '', 'e2e/d.spec.mjs': '', 'e2e/e.spec.tsx': '', 'e2e-parity/f.spec.ts': '' } });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    for (const f of ['e2e/c.test.ts', 'e2e/d.spec.mjs', 'e2e/e.spec.tsx', 'e2e-parity/f.spec.ts']) assert.ok(has(res, 'FC-17', f), f);
  } finally { clean(root); }
});

test('FC-17: a duplicate manifest row fails', () => {
  const r = ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'covered by T1', 'PR-3', '0', 'SCHEDULED(PR-3)'];
  const root = world({ rows: [r, r, ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)']] });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-17', 'more than one row')); } finally { clean(root); }
});

test('FC-18: a RETIRED row whose file still exists fails; a SCHEDULED row whose file is gone fails', () => {
  let root = world({ rows: [
    ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-1', '0', 'RETIRED'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-18', 'still exists')); } finally { clean(root); }
  root = world({ files: { 'e2e/b.spec.ts': null } });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-18', 'does not exist')); } finally { clean(root); }
});

test('FC-18: a RETIRED row with the file really absent passes', () => {
  const root = world({
    files: { 'e2e/a.spec.ts': null },
    rows: [
      ['e2e/a.spec.ts', 'top-level', 'DELETE_OBSOLETE', 'none', 'evidence', 'PR-1', '0', 'RETIRED'],
      ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
    ],
  });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-19: undecided markers, bad decisions and DELETE_DUP without a canonical id fail', () => {
  const root = world({ rows: [
    ['e2e/a.spec.ts', 'top-level', 'PENDING', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', '', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'not one of'));
    assert.ok(has(res, 'FC-19', 'undecided marker'));
    assert.ok(has(res, 'FC-19', 'must name the canonical id'));
  } finally { clean(root); }
});

test('FC-19: MOVE_DOWN needs a destination, and a RETIRED MOVE_DOWN row needs the destination to exist', () => {
  let root = world({ files: { 'e2e/a.spec.ts': null }, rows: [
    ['e2e/a.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/missing.test.ts', 'x', 'PR-3', '0', 'RETIRED'],
    ['e2e/b.spec.ts', 'top-level', 'MOVE_DOWN', '', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'destination apps/web/src/missing.test.ts does not exist'));
    assert.ok(has(res, 'FC-19', 'must name a destination'));
  } finally { clean(root); }
  root = world({ files: { 'e2e/a.spec.ts': null, 'apps/web/src/dest.test.ts': 'x' }, rows: [
    ['e2e/a.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/dest.test.ts', 'x', 'PR-3', '0', 'RETIRED'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-19: RETAIN_SPECIALIST needs a written reason and the RETAIN_SPECIALIST status', () => {
  const root = world({ rows: [
    ['e2e/a.spec.ts', 'parity', 'RETAIN_SPECIALIST', 'x', 'short', 'PR-7', '0', 'SCHEDULED(PR-7)'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'needs a written reason'));
    assert.ok(has(res, 'FC-19', 'must carry status RETAIN_SPECIALIST'));
  } finally { clean(root); }
});

test('FC-19: *.canonical.ts outside e2e/canonical fails', () => {
  const root = world({ files: { 'e2e/rogue.canonical.ts': 'x', 'apps/web/src/other.canonical.ts': 'x' } });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'e2e/rogue.canonical.ts'));
    assert.ok(has(res, 'FC-19', 'apps/web/src/other.canonical.ts'));
  } finally { clean(root); }
});

test('FC-19/FC-04: literal test.skip / test.fixme / test.only / describe.skip in e2e/canonical/** fails; comments do not', () => {
  for (const body of ["test.skip(true, 'x');", "test.fixme('t', () => {});", "test.only('t', () => {});", "test.describe.skip('d', () => {});"]) {
    const root = world({ files: { 'e2e/canonical/x.canonical.ts': body } });
    try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-04', 'e2e/canonical/x.canonical.ts'), body); } finally { clean(root); }
  }
  const root = world({ files: { 'e2e/canonical/x.canonical.ts': "// never test.skip here\n/* test.fixme(...) */\ntest('T1 - ok', () => {});" } });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-19: an unexpected or a missing playwright*.config.ts fails', () => {
  let root = world({ files: { 'playwright.extra.config.ts': 'x' } });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-19', 'playwright.extra.config.ts')); } finally { clean(root); }
  root = world({ files: { 'playwright.parity.config.ts': null } });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-19', 'missing [playwright.parity.config.ts]')); } finally { clean(root); }
});

test('K4: tracked storageState files and tracked reports fail; untracked ones pass', () => {
  const root = world();
  try {
    const bad = checkEstate({ root, trackedFiles: ['e2e/canonical/.auth/user.json', 'playwright-report/canonical/index.html', 'src/x.ts'] });
    assert.equal(bad.errors.filter((e) => e.includes('FAIL[K4]')).length, 2);
    assert.equal(nonFc24(checkEstate({ root, trackedFiles: ['src/x.ts'] })).errors.length, 0);
  } finally { clean(root); }
});

test('FC-24: a wrong #2751 sum and a missing #2751 file row both fail', () => {
  const root = world({ rows: [
    ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '10', 'SCHEDULED(PR-3)'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-24', `sum of issue_2751_titles is 10, expected ${ISSUE_2751_TOTAL}`));
    assert.ok(has(res, 'FC-24', `#2751 file ${ISSUE_2751_FILES[0]} has no manifest row`));
  } finally { clean(root); }
});

test('FC-24: a #2751 file whose row carries 0 titles fails', () => {
  const real = fs.readFileSync(path.join(DEFAULT_ROOT, MANIFEST_REL), 'utf8').split('\n');
  const target = ISSUE_2751_FILES[3];
  const mutated = real.map((l) => (l.startsWith(`${target},`) ? l.replace(/,(\d+),(SCHEDULED|RETIRED)/, ',0,$2') : l)).join('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-estate-m-'));
  try {
    const mp = path.join(tmp, 'm.csv');
    fs.writeFileSync(mp, mutated);
    const res = checkEstate({ root: DEFAULT_ROOT, manifestPath: mp, trackedFiles: [] });
    assert.ok(has(res, 'FC-24', target));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('manifest header and missing manifest fail closed', () => {
  const root = world();
  try {
    fs.writeFileSync(path.join(root, MANIFEST_REL), 'file,decision\n');
    assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-17', 'header'));
    fs.rmSync(path.join(root, MANIFEST_REL));
    assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-17', 'manifest not found'));
  } finally { clean(root); }
});

// ---- review cycle 1: canonical id validation, test.fail ban, K4 fail-closed ----------------------------
const dupRows = (cell, status = 'SCHEDULED(PR-3)', decision = 'DELETE_DUP') => [
  ['e2e/a.spec.ts', 'top-level', decision, cell, 'x', 'PR-3', '0', status],
  ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
];

test('FC-19: DELETE_DUP / CANONICAL_GAP_CLOSED must name ids that exist (matrix or collected title)', () => {
  for (const decision of ['DELETE_DUP', 'CANONICAL_GAP_CLOSED']) {
    const root = world({ rows: dupRows('T1 + T99', 'SCHEDULED(PR-3)', decision) });
    try {
      const res = checkEstate({ root, trackedFiles: [] });
      assert.ok(has(res, 'FC-19', 'canonical id "T99"'), decision);
      assert.ok(!has(res, 'FC-19', 'canonical id "T1"'), decision);
    } finally { clean(root); }
  }
});

test('FC-19: an id embedded in prose, or T1_x standing in for T1, is rejected', () => {
  const root = world({ rows: dupRows('T1_x') });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-19', 'canonical id "T1_x"')); } finally { clean(root); }
});

test('FC-19: a role tag in the cell is stripped ("T1 [role:admin] + T1")', () => {
  const root = world({ rows: dupRows('T1 [role:admin] + T1') });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-19: a planned C2 id is allowed only while the row is SCHEDULED; a RETIRED row\'s ids must exist', () => {
  let root = world({ rows: dupRows('T15b + RQ1') });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
  root = world({ files: { 'e2e/a.spec.ts': null }, rows: dupRows('T15b', 'RETIRED') });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'canonical id "T15b"'));
    assert.ok(has(res, 'FC-19', 'only while the row is SCHEDULED'));
  } finally { clean(root); }
  root = world({ files: { 'e2e/canonical/x.canonical.ts': "test('T1 - x', () => {});\ntest('T15b - y', () => {});" }, rows: dupRows('T15b') });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-04: literal test.fail in e2e/canonical/** is banned', () => {
  for (const body of ["test.fail(true, 'x');", "test.describe.fail('d', () => {});"]) {
    const root = world({ files: { 'e2e/canonical/x.canonical.ts': body } });
    try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-04', 'test.fail'), body); } finally { clean(root); }
  }
});

test('K4: fails CLOSED when git ls-files fails in a checkout that has .git', () => {
  const root = world();
  try {
    fs.mkdirSync(path.join(root, '.git')); // a .git entry that is not a repository: ls-files exits non-zero
    const res = checkEstate({ root });
    assert.ok(has(res, 'K4', 'fails closed'));
  } finally { clean(root); }
  const noGit = world();
  try {
    const res = checkEstate({ root: noGit });
    assert.ok(res.info.some((l) => l.includes('tracked-artefact check (K4) skipped')));
    assert.ok(!has(res, 'K4'));
  } finally { clean(noGit); }
});

test('CLI: exits 0 on the real repo and 1 with FAIL lines on a broken root', () => {
  const ok = spawnSync('node', [SCRIPT, '--root', DEFAULT_ROOT], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /E2E ESTATE GUARD: PASS/);
  const root = world({ files: { 'e2e/zz-new.spec.ts': '' } });
  try {
    const bad = spawnSync('node', [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /FAIL\[FC-17\].*zz-new/);
    assert.equal(spawnSync('node', [SCRIPT, '--bogus'], { encoding: 'utf8' }).status, 2);
  } finally { clean(root); }
});

// ---- #2750 S0: specialist suite rules SP1-SP9 + CFG (tag FAIL[FC-19/SPn]) ---------------------------------------
const SPEC = 'e2e/specialist/x.specialist.ts';
const GOOD_SPEC = [
  "import { test, expect } from './support/specialist-test';",
  "import { type Page } from '@playwright/test';",
  "test('x', async ({ page }) => { await page.goto('/'); await expect(page).toHaveURL(/./); });",
].join('\n');
const BASE_ROWS = [
  ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'covered by T1', 'PR-3', String(ISSUE_2751_TOTAL), 'SCHEDULED(PR-3)'],
  ['e2e/b.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/b.test.ts', 'component rule', 'PR-3', '0', 'SCHEDULED(PR-3)'],
];
const specRow = (file = SPEC, rationale = '[HIT_TEST] Decline is the topmost element at its centre at five viewport widths') =>
  [file, 'specialist', 'RETAIN_SPECIALIST', 'e2e/specialist/ (outside the gate)', rationale, 'S0', '0', 'RETAIN_SPECIALIST'];
/** A consistent estate with one admitted specialist spec. */
function sworld({ spec = GOOD_SPEC, files = {}, rows = [specRow()] } = {}) {
  return world({ files: { [SPEC]: spec, ...files }, rows: [...BASE_ROWS, ...rows] });
}
const sp = (n) => `FAIL[FC-19/SP${n}]`;
const hasSp = (res, n, needle = '') => res.errors.some((e) => e.includes(sp(n)) && e.includes(needle));
/** Run the guard on a world and return the result; the world is removed. */
function inWorld(w, fn) {
  const root = w;
  try { return fn(checkEstate({ root, trackedFiles: [] }), root); } finally { clean(root); }
}

test('SP baseline: a consistent estate with one admitted specialist spec raises no SP error', () => {
  inWorld(sworld(), (res) => assert.deepEqual(nonFc24(res).errors, []));
});

test('CFG: playwright.specialist.config.ts is an expected config; removing it, or adding another, fails', () => {
  assert.ok(EXPECTED_CONFIGS.includes('playwright.specialist.config.ts'));
  inWorld(world({ files: { 'playwright.specialist.config.ts': null } }), (res) => assert.ok(has(res, 'FC-19', 'missing [playwright.specialist.config.ts]')));
  inWorld(world({ files: { 'playwright.specialist2.config.ts': 'x' } }), (res) => assert.ok(has(res, 'FC-19', 'playwright.specialist2.config.ts')));
});

test('SP1: a *.spec.ts under e2e/specialist, a *.specialist.ts elsewhere, and a stray file type all fail', () => {
  inWorld(sworld({ files: { 'e2e/specialist/zz.spec.ts': '' } }), (res) => assert.ok(hasSp(res, 1, 'e2e/specialist/zz.spec.ts')));
  inWorld(sworld({ files: { 'e2e/specialist/support/h.test.ts': '' } }), (res) => assert.ok(hasSp(res, 1, 'h.test.ts')));
  inWorld(sworld({ files: { 'e2e/stray.specialist.ts': GOOD_SPEC } }), (res) => assert.ok(hasSp(res, 1, 'e2e/stray.specialist.ts')));
  inWorld(sworld({ files: { 'apps/web/src/o.specialist.ts': GOOD_SPEC } }), (res) => assert.ok(hasSp(res, 1, 'apps/web/src/o.specialist.ts')));
  inWorld(sworld({ files: { 'e2e/specialist/data.json': '{}' } }), (res) => assert.ok(hasSp(res, 1, 'data.json')));
  // control: README.md and support/*.ts are allowed
  inWorld(sworld({ files: { 'e2e/specialist/README.md': '# x', 'e2e/specialist/support/specialist-test.ts': 'export const t = 1;' } }), (res) => assert.deepEqual(nonFc24(res).errors, []));
});

test('SP2: a specialist spec needs exactly one RETAIN_SPECIALIST row; a RETAIN_SPECIALIST row must name a specialist or e2e-parity file', () => {
  inWorld(sworld({ rows: [] }), (res) => assert.ok(hasSp(res, 2, 'has no RETAIN_SPECIALIST row')));
  inWorld(sworld({ rows: [['e2e/specialist/x.specialist.ts', 'specialist', 'DELETE_DUP', 'T1', 'x', 'S0', '0', 'SCHEDULED(PR-3)']] }), (res) => assert.ok(hasSp(res, 2, 'decision AND status')));
  inWorld(sworld({ rows: [specRow(), specRow('e2e/a.spec.ts')] }), (res) => assert.ok(hasSp(res, 2, 'e2e/a.spec.ts')));
  // control: an e2e-parity RETAIN_SPECIALIST row is grandfathered
  const parity = ['e2e-parity/p.spec.ts', 'parity', 'RETAIN_SPECIALIST', 'x', 'parity harness kept as a specialist suite', 'PR-7', '0', 'RETAIN_SPECIALIST'];
  inWorld(sworld({ files: { 'e2e-parity/p.spec.ts': '' }, rows: [specRow(), parity] }), (res) => assert.ok(!hasSp(res, 2), res.errors.join('\n')));
});

test('SP3: the rationale needs a known [CODE] and a specific row after it', () => {
  inWorld(sworld({ rows: [specRow(SPEC, 'Decline is the topmost element at its centre at five viewport widths')] }), (res) => assert.ok(hasSp(res, 3, 'must start with a [CODE]')));
  inWorld(sworld({ rows: [specRow(SPEC, '[HARD_TO_REPLACE] Decline is the topmost element at its centre at five widths')] }), (res) => assert.ok(hasSp(res, 3, 'unknown reason code [HARD_TO_REPLACE]')));
  inWorld(sworld({ rows: [specRow(SPEC, '[HIT_TEST] too short')] }), (res) => assert.ok(hasSp(res, 3, '>= 20 characters')));
  // control: two known codes
  inWorld(sworld({ rows: [specRow(SPEC, '[LEAFLET_REAL][POINTER_REAL] real markercluster spiderfy and touch tap at 390x844')] }), (res) => assert.ok(!hasSp(res, 3)));
});

test('SP4: each deny-listed host and any non-loopback literal fails; loopback, OSM tiles and reserved TLDs pass; comments are NOT exempt', () => {
  const bad = [
    "const a = 'https://app.propertysignal.in/x';",
    "const a = 'https://udupi-x.pages.dev';",
    "const a = 'https://udupi-x.onrender.com/api';",
    "const a = 'https://abcd.supabase.co/rest/v1';",
    "const a = 'https://example.com/x';",
    "const a = 'http://localhost@evil.com/';",
    "const a = 'http://localhost.evil.com:5380';",
    "// see https://example.com/docs\nconst a = 1;",
    "const a = 'wss://not-loopback.dev'; const b = 'https://evil.dev';",
  ];
  for (const body of bad) {
    inWorld(sworld({ spec: `${GOOD_SPEC}\n${body}` }), (res) => assert.ok(hasSp(res, 4, SPEC), body));
  }
  const good = [
    "const a = 'http://localhost:5380/x'; const b = 'http://127.0.0.1:8380'; const c = 'http://[::1]:5380';",
    "const a = 'https://a.tile.openstreetmap.org/1/2/3.png';",
    "const a = 'https://mock.test/api'; const b = 'https://x.invalid/'; const c = 'https://y.example/';",
    'const a = `http://localhost:${port}/x`; const b = `https://${host}/y`;',
  ];
  for (const body of good) {
    inWorld(sworld({ spec: `${GOOD_SPEC}\n${body}` }), (res) => assert.ok(!hasSp(res, 4), `${body}\n${res.errors.join('\n')}`));
  }
  // README.md is excepted; a support file is not
  inWorld(sworld({ files: { 'e2e/specialist/README.md': 'never run against https://example.com or foo.pages.dev' } }), (res) => assert.ok(!hasSp(res, 4)));
  inWorld(sworld({ files: { 'e2e/specialist/support/s.ts': "export const u = 'https://example.com';" } }), (res) => assert.ok(hasSp(res, 4, 'support/s.ts')));
});

test('SP5: skip/fixme/only/fail (and describe.*) fail in e2e/specialist/**; a commented skip passes', () => {
  for (const body of ["test.skip(true, 'x');", "test.describe.fixme('d', () => {});", "test.only('t', () => {});", "test.fail(true);", "describe.skip('d', () => {});", "it.skip('t', () => {});"]) {
    inWorld(sworld({ spec: `${GOOD_SPEC}\n${body}` }), (res) => assert.ok(hasSp(res, 5, SPEC), body));
  }
  inWorld(sworld({ files: { 'e2e/specialist/support/s.ts': 'test.skip(true);' } }), (res) => assert.ok(hasSp(res, 5, 'support/s.ts')));
  inWorld(sworld({ spec: `${GOOD_SPEC}\n// never test.skip here\n/* test.fixme(...) */` }), (res) => assert.ok(!hasSp(res, 5)));
});

test('SP5/SP8/SP9: banned constructs placed BETWEEN route globs are still found (the "**/api/**" glob must not swallow code)', () => {
  const between = (banned) => `${GOOD_SPEC}\nawait page.route('**/api/**', (r) => r.fulfill({ status: 200 }));\n${banned}\nawait page.route('**/x', (r) => r.fulfill({ status: 200 }));`;
  inWorld(sworld({ spec: between("test.skip(true, 'x');") }), (res) => assert.ok(hasSp(res, 5, SPEC)));
  inWorld(sworld({ spec: between("await page.route('**/*', (route) => route.continue());") }), (res) => assert.ok(hasSp(res, 8, SPEC)));
  inWorld(sworld({ spec: between("await page.request.get('/x');") }), (res) => assert.ok(hasSp(res, 9, SPEC)));
});

test('SP6: a legacy hosted-auth state path fails; storageState: undefined passes', () => {
  inWorld(sworld({ spec: `${GOOD_SPEC}\ntest.use({ storageState: 'e2e/fixtures/user-auth.json' });` }), (res) => assert.ok(hasSp(res, 6, SPEC)));
  inWorld(sworld({ spec: `${GOOD_SPEC}\ntest.use({ storageState: undefined });` }), (res) => assert.ok(!hasSp(res, 6)));
});

test('SP7: `test` must come from ./support/specialist-test; a multi-specifier @playwright/test import WITHOUT test passes', () => {
  const noGuard = "import { test, expect } from '@playwright/test';\ntest('x', async () => {});";
  inWorld(sworld({ spec: noGuard }), (res) => { assert.ok(hasSp(res, 7, "imports `test` from '@playwright/test'")); assert.ok(hasSp(res, 7, 'must import `test`')); });
  inWorld(sworld({ spec: "import { test as t, expect } from '@playwright/test';\nimport { test } from './support/specialist-test';" }), (res) => assert.ok(hasSp(res, 7, "imports `test` from '@playwright/test'")));
  inWorld(sworld({ spec: "import * as pw from '@playwright/test';\nimport { test } from './support/specialist-test';" }), (res) => assert.ok(hasSp(res, 7, 'namespace/default import')));
  inWorld(sworld({ spec: "import { expect } from './support/specialist-test';\ntest('x', () => {});" }), (res) => assert.ok(hasSp(res, 7, 'must import `test`')));
  // controls
  const multi = "import { expect, type Page, type Locator } from '@playwright/test';\nimport { test } from './support/specialist-test';\ntest('x', async () => {});";
  inWorld(sworld({ spec: multi }), (res) => assert.ok(!hasSp(res, 7), res.errors.join('\n')));
  const multiline = "import {\n  expect,\n  type Page,\n} from '@playwright/test';\nimport { test, backendGet } from './support/specialist-test';";
  inWorld(sworld({ spec: multiline }), (res) => assert.ok(!hasSp(res, 7), res.errors.join('\n')));
});

test('SP8: a route continue call fails; fallback()/fulfill() pass; a commented continue passes', () => {
  for (const body of ["await page.route('**/api/**', (route) => route.continue());", "await page.route('**/*', (r) => { r.continue(); });"]) {
    inWorld(sworld({ spec: `${GOOD_SPEC}\n${body}` }), (res) => assert.ok(hasSp(res, 8, SPEC), body));
  }
  inWorld(sworld({ spec: `${GOOD_SPEC}\nawait page.route('**/*', (route) => route.fallback());\nawait page.route('**/a', (route) => route.fulfill({ status: 200 }));\n// route.continue() is banned\nfor (const i of [1]) { if (i) continue; }` }), (res) => assert.ok(!hasSp(res, 8), res.errors.join('\n')));
});

test('SP9: direct APIRequestContext / fetch fails; backendGet() passes', () => {
  for (const body of [
    "await page.request.get('/x');",
    "await context.request.get('/x');",
    "const c = await request.newContext();",
    "const r = await fetch('/x');",
    "test('t', async ({ page, request }) => {});",
    "test('t', async ({ request: api }) => {});",
    "await page.route('**/*', async (route) => { await route.fetch(); });",
  ]) {
    inWorld(sworld({ spec: `${GOOD_SPEC}\n${body}` }), (res) => assert.ok(hasSp(res, 9, SPEC), body));
  }
  inWorld(sworld({ spec: `${GOOD_SPEC}\nconst r = await backendGet(page, '/api/x');\nconst p = prefetch('a');\nconst d = refetch(1);\n// await fetch('/x')\ntest('t2', async ({ page, browserName }) => {});` }), (res) => assert.ok(!hasSp(res, 9), res.errors.join('\n')));
});

test('SP9 (CX6): property-qualified and bracket fetch forms fail; prefetch / fetchData / commented fetch pass', () => {
  for (const body of [
    "const r = await globalThis.fetch('/x');",
    "const r = await window.fetch('/x');",
    "const r = await self.fetch('/x');",
    "const r = await globalThis . fetch ('/x');",
    "const r = await globalThis?.fetch('/x');",
    "const r = await window.fetch?.('/x');",
    "const r = await fetch?.('/x');",
    "const r = await globalThis['fetch']('/x');",
    'const r = await window["fetch"]("/x");',
    "const r = await self [ 'fetch' ] ('/x');",
    "const r = await globalThis?.['fetch']('/x');",
    "await page.evaluate(() => window.fetch('/x'));",
  ]) {
    inWorld(sworld({ spec: `${GOOD_SPEC}\n${body}` }), (res) => assert.ok(hasSp(res, 9, SPEC), body));
  }
  for (const body of [
    'const a = obj.prefetch("x");',
    'const b = foo.fetchData(1);',
    'const c = window.prefetch(1);',
    "const d = globalThis['fetcher']('x');",
    '// await globalThis.fetch("/x")',
    '/* window["fetch"]("/x") */',
  ]) {
    inWorld(sworld({ spec: `${GOOD_SPEC}\n${body}` }), (res) => assert.ok(!hasSp(res, 9), `${body}: ${res.errors.join('\n')}`));
  }
});

test('SP9 (browser): a `browser` fixture parameter and newContext/launch/launchPersistentContext/connectOverCDP fail; page/context fixtures pass', () => {
  for (const body of [
    "test('t', async ({ browser }) => {});",
    "test('t', async ({ page, browser: b }) => {});",
    "const c = await browser.newContext();",
    "const b = await chromium.launch();",
    "const c = await chromium.launchPersistentContext('/tmp/x');",
    "const b = await chromium.connectOverCDP('http://localhost:9222');",
  ]) {
    inWorld(sworld({ spec: `${GOOD_SPEC}\n${body}` }), (res) => assert.ok(hasSp(res, 9, SPEC), body));
  }
  // control: page/context fixtures, browserName and a commented launch are fine
  inWorld(sworld({ spec: `${GOOD_SPEC}\n// await chromium.launch()\ntest('t2', async ({ page, context, browserName }) => { await context.addCookies([]); });` }), (res) => assert.ok(!hasSp(res, 9), res.errors.join('\n')));
});

test('SP7 (launchers): named chromium/firefox/webkit/request/devices/_electron/_android imports fail; type-only and expect/Page pass', () => {
  const sp = "import { test } from './support/specialist-test';";
  for (const [name, src] of [['chromium', '@playwright/test'], ['firefox', '@playwright/test'], ['webkit', 'playwright'], ['request', '@playwright/test'], ['devices', 'playwright-core'], ['_electron', 'playwright'], ['_android', 'playwright-core']]) {
    inWorld(sworld({ spec: `import { expect, ${name} } from '${src}';\n${sp}` }), (res) => assert.ok(hasSp(res, 7, name), `${name} from ${src}`));
  }
  inWorld(sworld({ spec: `import { expect, chromium as c } from '@playwright/test';\n${sp}` }), (res) => assert.ok(hasSp(res, 7, 'chromium'), 'aliased import'));
  // control: type-only launcher names and ordinary names pass
  inWorld(sworld({ spec: `import { expect, type Page, type Browser } from '@playwright/test';\nimport type { devices } from '@playwright/test';\n${sp}` }), (res) => assert.ok(!hasSp(res, 7), res.errors.join('\n')));
});

test('CLI: an SP violation exits 1 with the FAIL[FC-19/SPn] tag', () => {
  const root = sworld({ files: { 'e2e/specialist/zz.spec.ts': '' } });
  try {
    const bad = spawnSync('node', [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /FAIL\[FC-19\/SP1\].*zz\.spec\.ts/);
  } finally { clean(root); }
});

// #2850 amendment 2 (reviewed edit of ONE existing case): the home rule is keyed on STATUS (terminal RETAIN_SPECIALIST), and a
// companion rule covers the newly-legal tracked state: decision RETAIN_SPECIALIST outside the homes must be SCHEDULED(#NNNN) with slice == that #NNNN.
test('real repo: every status-RETAIN_SPECIALIST row (>= 2 grandfathered e2e-parity) sits under e2e-parity/ or e2e/specialist/; every other decision-RETAIN_SPECIALIST row is SCHEDULED(#NNNN) with a matching slice', () => {
  const rows = parseCsv(fs.readFileSync(path.join(DEFAULT_ROOT, MANIFEST_REL), 'utf8')).slice(1).filter((r) => r.length > 1);
  const inHome = (r) => r[0].startsWith('e2e-parity/') || r[0].startsWith('e2e/specialist/');
  const terminal = rows.filter((r) => r[7] === 'RETAIN_SPECIALIST');
  assert.ok(terminal.filter((r) => r[0].startsWith('e2e-parity/')).length >= 2);
  for (const r of terminal) assert.ok(inHome(r), `status RETAIN_SPECIALIST outside the homes: ${r[0]}`);
  for (const r of rows.filter((x) => x[2] === 'RETAIN_SPECIALIST' && !inHome(x))) {
    const m = r[7].match(/^SCHEDULED\((#[1-9][0-9]{2,4})\)$/);
    assert.ok(m, `companion: decision RETAIN_SPECIALIST outside the homes needs status SCHEDULED(#NNNN), found ${r[7]}: ${r[0]}`);
    assert.equal(r[5], m[1], `companion: slice must equal ${m[1]} for ${r[0]}`);
  }
  assert.equal(rows.length, 217);
});

test('cycle 2 LOW: knownCanonicalIds accepts only id-shaped title tokens (a prose title is not a canonical id)', () => {
  const rows = (id) => [
    ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', id, 'covered', 'PR-3', String(ISSUE_2751_TOTAL), 'RETIRED'],
    ['e2e/b.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/b.test.ts', 'component rule', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ];
  const canon = { 'e2e/canonical/x.canonical.ts': "test('T1 - x', () => {});\ntest('Smoke renders the page', () => {});\ntest('T15b - gated', () => {});" };
  // control: an id-shaped collected title is accepted
  let root = world({ rows: rows('T15b'), files: { ...canon, 'e2e/a.spec.ts': null } });
  try { assert.ok(!has(nonFc24(checkEstate({ root, trackedFiles: [] })), 'FC-19', 'canonical id'), 'id-shaped title T15b is known'); } finally { clean(root); }
  // mutation: a prose leading token ("Smoke") must NOT count as a canonical id
  root = world({ rows: rows('Smoke'), files: { ...canon, 'e2e/a.spec.ts': null } });
  try { assert.ok(has(nonFc24(checkEstate({ root, trackedFiles: [] })), 'FC-19', 'canonical id "Smoke"')); } finally { clean(root); }
  assert.match('T15b', CANONICAL_ID_SHAPE);
  assert.match('AG1', CANONICAL_ID_SHAPE);
  assert.doesNotMatch('Smoke', CANONICAL_ID_SHAPE);
  assert.doesNotMatch('T1_x', CANONICAL_ID_SHAPE);
  assert.doesNotMatch('harness', CANONICAL_ID_SHAPE);
});

// ---- #2850 PR-7: status SCHEDULED(#NNNN) grammar + decision RETAIN_SPECIALIST pairing (fail-closed) -------------------------
const PR7_B = ['e2e/b.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/b.test.ts', 'component rule', 'PR-3', '0', 'SCHEDULED(PR-3)'];
const PR7_REASON = '[HIT_TEST] elementFromPoint at the control centre at 390x844'; // > 20 chars
const pr7A = (decision, status, slice, { dest = '#2851: lower-level destination', rationale = PR7_REASON } = {}) =>
  ['e2e/a.spec.ts', 'top-level', decision, dest, rationale, slice, String(ISSUE_2751_TOTAL), status];
const pr7Errors = (row, files = {}) => inWorld(world({ rows: [row, PR7_B], files }), (res) => nonFc24(res).errors);
const pr7Has = (errs, needle) => errs.some((e) => e.includes(needle));

test('PR-7 grammar REJECT: SCHEDULED(#) / (#12) / (#0123) / (#123456) / (#abc) / (2851) / ( #2851) / (PR-10)', () => {
  for (const status of ['SCHEDULED(#)', 'SCHEDULED(#12)', 'SCHEDULED(#0123)', 'SCHEDULED(#123456)', 'SCHEDULED(#abc)', 'SCHEDULED(2851)', 'SCHEDULED( #2851)', 'SCHEDULED(PR-10)']) {
    const errs = pr7Errors(pr7A('MOVE_DOWN', status, '#2851'));
    assert.ok(pr7Has(errs, `status "${status}" must be SCHEDULED(PR-n)`), `${status}: ${errs.join(' | ')}`);
  }
});

test('PR-7 grammar REJECT: SCHEDULED(#2851) with slice #2852, PR-7 or empty', () => {
  for (const slice of ['#2852', 'PR-7', '']) {
    const errs = pr7Errors(pr7A('MOVE_DOWN', 'SCHEDULED(#2851)', slice));
    assert.ok(pr7Has(errs, 'disagrees with status SCHEDULED(#2851)'), `slice "${slice}": ${errs.join(' | ')}`);
  }
});

test('PR-7 grammar ACCEPT: MOVE_DOWN + SCHEDULED(#2851) + slice #2851 (3-, 4- and 5-digit issue numbers)', () => {
  assert.deepEqual(pr7Errors(pr7A('MOVE_DOWN', 'SCHEDULED(#2851)', '#2851')), []);
  assert.deepEqual(pr7Errors(pr7A('MOVE_DOWN', 'SCHEDULED(#123)', '#123')), []);
  assert.deepEqual(pr7Errors(pr7A('MOVE_DOWN', 'SCHEDULED(#12345)', '#12345')), []);
});

test('PR-7 pairing REJECT: decision RETAIN_SPECIALIST + SCHEDULED(PR-1..PR-9) stays rejected', () => {
  for (let n = 1; n <= 9; n += 1) {
    const errs = pr7Errors(pr7A('RETAIN_SPECIALIST', `SCHEDULED(PR-${n})`, `PR-${n}`));
    assert.ok(pr7Has(errs, 'must carry status RETAIN_SPECIALIST'), `PR-${n}: ${errs.join(' | ')}`);
  }
});

test('PR-7 pairing REJECT: decision RETAIN_SPECIALIST + SCHEDULED(#2851) with a missing, empty or 19-char reason', () => {
  for (const rationale of [undefined, '', 'x'.repeat(19)]) {
    const row = pr7A('RETAIN_SPECIALIST', 'SCHEDULED(#2851)', '#2851', rationale === undefined ? {} : { rationale });
    if (rationale === undefined) row[4] = ''; // "missing" = the cell is absent/blank
    const errs = pr7Errors(row);
    assert.ok(pr7Has(errs, 'needs a written reason'), `${JSON.stringify(rationale)}: ${errs.join(' | ')}`);
  }
});

test('PR-7 pairing REJECT: decision RETAIN_SPECIALIST + SCHEDULED(#2851) for a file that does not exist; + RETIRED', () => {
  const gone = pr7Errors(pr7A('RETAIN_SPECIALIST', 'SCHEDULED(#2851)', '#2851'), { 'e2e/a.spec.ts': null });
  assert.ok(pr7Has(gone, 'does not exist'), gone.join(' | '));
  assert.ok(pr7Has(gone, 'existing legacy file only'), gone.join(' | '));
  const retired = pr7Errors(pr7A('RETAIN_SPECIALIST', 'RETIRED', 'PR-7'), { 'e2e/a.spec.ts': null });
  assert.ok(pr7Has(retired, 'must carry status RETAIN_SPECIALIST'), retired.join(' | '));
});

test('PR-7 pairing REJECT: decision RETAIN_SPECIALIST + SCHEDULED(#2851) under e2e/specialist/ (admitted rows carry status RETAIN_SPECIALIST)', () => {
  const row = [SPEC, 'specialist', 'RETAIN_SPECIALIST', 'e2e/specialist/ (outside the gate)', PR7_REASON, '#2851', '0', 'SCHEDULED(#2851)'];
  inWorld(sworld({ rows: [row] }), (res) => {
    assert.ok(has(res, 'FC-19', 'existing legacy file only'), res.errors.join(' | '));
    assert.ok(hasSp(res, 2, 'decision AND status'), res.errors.join(' | '));
  });
});

test('PR-7 SP2 stays status-bound: status RETAIN_SPECIALIST for a legacy file still fails; e2e/specialist and e2e-parity rows still pass', () => {
  inWorld(sworld({ rows: [specRow(), specRow('e2e/a.spec.ts')] }), (res) => assert.ok(hasSp(res, 2, 'e2e/a.spec.ts')));
  const parity = ['e2e-parity/p.spec.ts', 'parity', 'RETAIN_SPECIALIST', 'x', 'parity harness kept as a specialist suite', 'PR-7', '0', 'RETAIN_SPECIALIST'];
  inWorld(sworld({ files: { 'e2e-parity/p.spec.ts': '' }, rows: [specRow(), parity] }), (res) => assert.deepEqual(nonFc24(res).errors, []));
});

test('PR-7 pairing ACCEPT: decision RETAIN_SPECIALIST + SCHEDULED(#2851) + slice #2851 + exactly-20-char reason + existing legacy file', () => {
  assert.deepEqual(pr7Errors(pr7A('RETAIN_SPECIALIST', 'SCHEDULED(#2851)', '#2851', { rationale: 'y'.repeat(20) })), []);
  assert.deepEqual(pr7Errors(pr7A('RETAIN_SPECIALIST', 'SCHEDULED(#2851)', '#2851')), []);
});

// ---- #2850 PR-7 Codex r1 F4: a tracked RETAIN_SPECIALIST row must name a REAL legacy Playwright spec file (NEW cases only) --------
const F4_MSG = 'must name a regular legacy Playwright spec file under e2e/';
const f4Row = (file) => { const r = pr7A('RETAIN_SPECIALIST', 'SCHEDULED(#2851)', '#2851'); r[0] = file; return r; };

test('Codex r1 F4 REJECT: decision RETAIN_SPECIALIST + SCHEDULED(#2851) naming package.json (exists, is not a spec)', () => {
  const errs = pr7Errors(f4Row('package.json'), { 'package.json': '{}' });
  assert.ok(pr7Has(errs, F4_MSG), errs.join(' | '));
  assert.ok(!pr7Has(errs, 'does not exist'), 'the file does exist, so only the new shape check can catch it: ' + errs.join(' | '));
});

test('Codex r1 F4 REJECT: decision RETAIN_SPECIALIST + SCHEDULED(#2851) naming a docs .md file', () => {
  const errs = pr7Errors(f4Row('docs/testing/e2e-retirement-map-pr7.md'), { 'docs/testing/e2e-retirement-map-pr7.md': '# map' });
  assert.ok(pr7Has(errs, F4_MSG), errs.join(' | '));
});

test('Codex r1 F4 REJECT: decision RETAIN_SPECIALIST + SCHEDULED(#2851) naming a DIRECTORY (even one named *.spec.ts)', () => {
  const dirSpec = pr7Errors(f4Row('e2e/dir.spec.ts'), { 'e2e/dir.spec.ts/inner.txt': 'x' });
  assert.ok(pr7Has(dirSpec, F4_MSG), dirSpec.join(' | '));
  const plainDir = pr7Errors(f4Row('docs'), { 'docs/readme.txt': 'x' });
  assert.ok(pr7Has(plainDir, F4_MSG), plainDir.join(' | '));
});

test('Codex r1 F4 REJECT: a non-spec file under e2e/ (helpers.ts) and a spec outside e2e/ (e2e-parity/) are not legacy spec files', () => {
  const helper = pr7Errors(f4Row('e2e/helpers.ts'), { 'e2e/helpers.ts': 'export const h = 1;' });
  assert.ok(pr7Has(helper, F4_MSG), helper.join(' | '));
  const parity = pr7Errors(f4Row('e2e-parity/p.spec.ts'), { 'e2e-parity/p.spec.ts': '' });
  assert.ok(pr7Has(parity, F4_MSG), parity.join(' | '));
});

test('Codex r1 F4 ACCEPT: a real legacy spec (e2e/a.spec.ts, discovered on disk) still passes the pairing with no F4 error', () => {
  const errs = pr7Errors(pr7A('RETAIN_SPECIALIST', 'SCHEDULED(#2851)', '#2851'));
  assert.deepEqual(errs, []);
  assert.ok(!pr7Has(errs, F4_MSG));
});
